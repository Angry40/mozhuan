import { buildParagraphs } from './paragraphs';
import { splitRawChapters } from './chapters';
import { stripImages } from './images';
import { cleanTitleText, formatTitle, normalizeFullWidthDigits, parseHeading } from './titles';
import type {
  BookStats,
  Chapter,
  ImageRemoval,
  Options,
  ParseWarning,
  ParsedBook,
} from './types';

export function computeBookStats(chapters: Chapter[]): BookStats {
  let characters = 0;
  let paragraphs = 0;
  let imagesRemoved = 0;
  for (const chapter of chapters) {
    paragraphs += chapter.paragraphs.length;
    imagesRemoved += chapter.imagesRemoved;
    characters += chapter.paragraphs.join('').replace(/\s/g, '').length;
  }
  return {
    chapters: chapters.length,
    characters,
    paragraphs,
    imagesRemoved,
    readingMinutes: characters > 0 ? Math.max(1, Math.ceil(characters / 400)) : 0,
  };
}

/**
 * Turn normalized source text into the renderable book model. Raw chapter data
 * is re-derived on every call, so toggling options never mutates the source.
 */
export function buildBook(text: string, options: Options): ParsedBook {
  const {
    chapters: rawChapters,
    hasHeadings,
    bareHeadings,
  } = splitRawChapters(text, options.fallbackSplit, options.title.autofillNumber);

  const chapters: Chapter[] = [];
  const imageRemovals: ImageRemoval[] = [];
  const warnings: ParseWarning[] = [];
  let autoNumber = 0;

  for (const raw of rawChapters) {
    const titleStrip = stripImages(raw.rawTitle, options.removeImages);
    let cleanRaw = cleanTitleText(titleStrip.text, options.title.cleanNoise);
    if (!cleanRaw) cleanRaw = raw.rawTitle.trim();

    const parts =
      parseHeading(normalizeFullWidthDigits(cleanRaw)) ??
      parseHeading(normalizeFullWidthDigits(raw.rawTitle));

    let assignedNumber: number | undefined;
    if (
      options.title.autofillNumber &&
      (raw.kind === 'chapter' || raw.kind === 'volume') &&
      (!parts ||
        (parts.numberValue === null && !parts.special && parts.kind !== 'english'))
    ) {
      autoNumber += 1;
      assignedNumber = autoNumber;
    }

    const title = formatTitle(cleanRaw, parts, options.title, assignedNumber);
    const bodyStrip = stripImages(raw.lines.join('\n'), options.removeImages);
    const paragraphs = buildParagraphs(bodyStrip.text, {
      dropHiddenBlankLines: options.filterBlankLines,
    });
    const imagesRemoved = titleStrip.count + bodyStrip.count;

    const chapter: Chapter = {
      id: raw.id,
      index: chapters.length,
      rawTitle: raw.rawTitle,
      kind: raw.kind,
      title,
      paragraphs,
      imagesRemoved,
      // A plain TXT carries no image payload: switching image cleanup off
      // simply keeps the original markers as text.
      illustrations: [],
    };
    chapters.push(chapter);

    const chapterLabel = title.full || cleanRaw || `第${chapters.length}章`;
    for (const snippet of [...titleStrip.snippets, ...bodyStrip.snippets]) {
      imageRemovals.push({
        chapterId: raw.id,
        chapterTitle: chapterLabel,
        kind: snippet.kind,
        snippet: snippet.snippet,
      });
    }
  }

  if (bareHeadings && chapters.length > 0) {
    const bareCount = chapters.filter((chapter) => chapter.kind === 'chapter').length;
    warnings.push({
      code: 'bare-headings',
      message: `没有找到“第X章”等标准标题，已将 ${bareCount} 个无编号短标题识别为章节并自动补号。如识别有误，可关闭“自动补全缺失章号”。`,
    });
  } else if (!hasHeadings && chapters.length > 0) {
    warnings.push({
      code: 'no-headings',
      message:
        options.fallbackSplit === 'chunk'
          ? '未识别到章节标题，已按约 3000 字在段落边界自动分节。'
          : '未识别到章节标题，已将全文作为一章。可在下方改用“按长度自动分节”。',
    });
  }

  const stats = computeBookStats(chapters);
  if (stats.characters === 0) {
    warnings.push({
      code: 'empty-book',
      message: '没有可导出的正文内容，请检查文件或用其他编码重新读取。',
    });
  }

  return {
    chapters,
    imageRemovals,
    warnings,
    stats,
    fonts: [],
  };
}
