import { computeBookStats } from '../pipeline';
import { cleanTitleText, formatTitle, normalizeFullWidthDigits, parseHeading } from '../titles';
import type {
  Chapter,
  EpubSource,
  ImageRemoval,
  Options,
  ParseWarning,
  ParsedBook,
} from '../types';

function trimParagraph(paragraph: string): string {
  return paragraph.replace(/^[\s\u3000]+/, '').replace(/[\s\u3000]+$/, '');
}

/**
 * Convert the raw EPUB structure into the same Chapter model used by TXT files.
 * This is where the shared title, paragraph and image-cleanup options apply.
 *
 * This version rebuilds a text-first EPUB: inline illustrations are counted and
 * cleaned, while the extracted cover is preserved separately via EpubMeta.
 */
export function buildBookFromEpub(source: EpubSource, options: Options): ParsedBook {
  const chapters: Chapter[] = [];
  const imageRemovals: ImageRemoval[] = [];
  const warnings: ParseWarning[] = [...source.warnings];
  let autoNumber = 0;

  for (const raw of source.chapters) {
    const cleanTitle = cleanTitleText(raw.title, options.title.cleanNoise) || raw.title;
    const parts = parseHeading(normalizeFullWidthDigits(cleanTitle));

    let assignedNumber: number | undefined;
    if (
      options.title.autofillNumber &&
      raw.kind !== 'special' &&
      (!parts ||
        (parts.numberValue === null && !parts.special && parts.kind !== 'english'))
    ) {
      autoNumber += 1;
      assignedNumber = autoNumber;
    }

    const title = formatTitle(cleanTitle, parts, options.title, assignedNumber);
    const paragraphs = raw.paragraphs.map(trimParagraph).filter((paragraph) => paragraph.length > 0);

    const chapter: Chapter = {
      id: raw.id,
      index: chapters.length,
      rawTitle: raw.title,
      kind: raw.kind,
      title,
      paragraphs,
      imagesRemoved: raw.imageCount,
    };
    chapters.push(chapter);

    if (raw.imageCount > 0) {
      imageRemovals.push({
        chapterId: raw.id,
        chapterTitle: title.full || raw.title,
        kind: 'epub-inline-image',
        snippet: `${raw.imageCount} 张内联插图（当前版本仅保留封面）`,
      });
    }
  }

  const stats = computeBookStats(chapters);
  if (stats.characters === 0) {
    warnings.push({
      code: 'empty-book',
      message: 'EPUB 中没有可导出的正文内容。',
    });
  }

  return { chapters, stats, warnings, imageRemovals };
}
