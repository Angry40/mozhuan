import { cleanParagraphs } from './paragraphs';
import { cleanTitleText, formatTitle, normalizeFullWidthDigits, parseHeading } from './titles';
import type { Chapter, ChapterOverride, Options } from './types';

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

    if (override.paragraphs !== undefined) {
      next = {
        ...next,
        paragraphs: cleanParagraphs(override.paragraphs, {
          dropHiddenBlankLines: options.filterBlankLines,
        }),
      };
    }

    return next;
  });
}
