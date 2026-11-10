import { cleanParagraphs } from './paragraphs';
import { cleanTitleText, formatTitle, normalizeFullWidthDigits, parseHeading } from './titles';
import type { Chapter, ChapterOverride, Options } from './types';

/**
 * Paragraph edits change the paragraph count, so an illustration anchored at
 * paragraph N no longer means the same place. Scale the anchor proportionally
 * instead of dropping the picture, and clamp it into range.
 */
function remapAnchor(anchor: number, previousCount: number, nextCount: number): number {
  if (anchor < 0) return -1;
  if (nextCount === 0) return -1;
  if (previousCount <= 0) return nextCount - 1;
  const scaled = Math.round((anchor / previousCount) * nextCount);
  return Math.min(nextCount - 1, Math.max(0, scaled));
}

/**
 * Apply manual chapter edits on top of the generated book. Title edits are
 * re-formatted with the current title options, so changing the title preset or
 * numbering style still updates manually edited titles.
 */
export function applyChapterOverrides(
  chapters: Chapter[],
  overrides: Record<number, ChapterOverride>,
  options: Options,
): Chapter[] {
  return chapters.map((chapter, position) => {
    const override = overrides[chapter.id];
    if (!override) return chapter;

    let next = chapter;
    if (override.title && override.title.trim()) {
      const rawTitle = cleanTitleText(override.title, options.title.cleanNoise) || override.title.trim();
      const parts = parseHeading(normalizeFullWidthDigits(rawTitle));
      const needsNumber =
        options.title.autofillNumber &&
        (!parts ||
          (parts.numberValue === null && !parts.special && parts.kind !== 'english'));
      const title = formatTitle(rawTitle, parts, options.title, needsNumber ? position + 1 : undefined);
      const kind =
        parts?.kind === 'volume' ? 'volume' : parts?.special ? 'special' : 'chapter';
      next = { ...next, rawTitle, title, kind };
    }

    if (override.illustrations !== undefined) {
      // 编辑器给出了最终插图列表（含上传的新图、删除与重排后的锚点），直接采用。
      next = { ...next, illustrations: override.illustrations };
    } else if (override.paragraphs !== undefined) {
      // 只改了正文、没动插图：按比例重映射锚点，避免插图丢失。
      const previousCount = next.paragraphs.length;
      const paragraphs = cleanParagraphs(override.paragraphs, {
        dropHiddenBlankLines: options.filterBlankLines,
      });
      const nextCount = paragraphs.length;
      const illustrations = (next.illustrations ?? []).map((item) => ({
        ...item,
        afterParagraph: item.header
          ? item.afterParagraph
          : remapAnchor(item.afterParagraph, previousCount, nextCount),
      }));
      next = { ...next, paragraphs, illustrations };
    }

    return next;
  });
}
