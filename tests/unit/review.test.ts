import { describe, expect, it } from 'vitest';
import { buildBook } from '../../src/core/pipeline';
import { applyChapterOverrides } from '../../src/core/review';
import {
  DEFAULT_OPTIONS,
  type ChapterIllustration,
  type ChapterOverride,
  type Options,
} from '../../src/core/types';

function options(overrides: Partial<Options> = {}): Options {
  return {
    ...DEFAULT_OPTIONS,
    indent: { ...DEFAULT_OPTIONS.indent },
    paragraphGap: { ...DEFAULT_OPTIONS.paragraphGap },
    title: { ...DEFAULT_OPTIONS.title, ...(overrides.title ?? {}) },
    ...overrides,
  };
}

const text = `第一章 初入江湖

正文一。

第二章 风起

正文二。`;

describe('applyChapterOverrides', () => {
  it('re-formats an edited chapter title with the current title options', () => {
    const book = buildBook(text, options());
    const overrides: Record<number, ChapterOverride> = {
      0: { title: '第十章 改名' },
    };
    const chapters = applyChapterOverrides(book.chapters, overrides, options());
    expect(chapters[0].title.full).toBe('第十章 改名');
    expect(chapters[0].title.marker).toBe('第十章');
    expect(chapters[0].title.subtitle).toBe('改名');
    expect(chapters[0].rawTitle).toBe('第十章 改名');
    expect(chapters[1].title.full).toBe('第二章 风起');
  });

  it('applies the current numbering style to an edited title', () => {
    const book = buildBook(text, options());
    const chapters = applyChapterOverrides(
      book.chapters,
      { 0: { title: '第十章 改名' } },
      options({ title: { ...DEFAULT_OPTIONS.title, numbering: 'arabic' } }),
    );
    expect(chapters[0].title.marker).toBe('第10章');
    expect(chapters[0].title.toc).toBe('第10章 改名');
  });

  it('autofills a missing number for an edited bare title', () => {
    const book = buildBook(text, options());
    const chapters = applyChapterOverrides(
      book.chapters,
      { 1: { title: '风再起' } },
      options(),
    );
    expect(chapters[1].title.marker).toBe('第二章');
    expect(chapters[1].title.toc).toBe('第二章 风再起');
  });

  it('replaces chapter paragraphs and can combine with a title edit', () => {
    const book = buildBook(text, options());
    const chapters = applyChapterOverrides(
      book.chapters,
      { 1: { title: '第二章 新标题', paragraphs: ['新的正文。', '第二段。'] } },
      options(),
    );
    expect(chapters[1].title.full).toBe('第二章 新标题');
    expect(chapters[1].paragraphs).toEqual(['新的正文。', '第二段。']);
  });

  it('leaves untouched chapters unchanged', () => {
    const book = buildBook(text, options());
    const chapters = applyChapterOverrides(book.chapters, {}, options());
    expect(chapters).toEqual(book.chapters);
  });

  it('filters hidden blank lines in edited paragraphs when enabled', () => {
    const book = buildBook(text, options());
    const chapters = applyChapterOverrides(
      book.chapters,
      { 0: { paragraphs: ['新的正文。', '\u2800', '&nbsp;', '<br>'] } },
      options(),
    );
    expect(chapters[0].paragraphs).toEqual(['新的正文。']);
  });

  it('keeps hidden blank lines in edited paragraphs when disabled', () => {
    const book = buildBook(text, options());
    const chapters = applyChapterOverrides(
      book.chapters,
      { 0: { paragraphs: ['新的正文。', '\u2800', '&nbsp;'] } },
      options({ filterBlankLines: false }),
    );
    expect(chapters[0].paragraphs).toEqual(['新的正文。', '\u2800', '&nbsp;']);
  });

  it('applies an explicit illustration override, including an empty list for removal', () => {
    const book = buildBook(text, options());
    const added: ChapterIllustration[] = [
      {
        illustration: { key: 'k1', mimeType: 'image/png', bytes: new Uint8Array([1]), alt: '新图' },
        afterParagraph: 0,
      },
    ];
    const chapters = applyChapterOverrides(
      book.chapters,
      { 0: { illustrations: added } },
      options(),
    );
    expect(chapters[0].illustrations).toHaveLength(1);
    expect(chapters[0].illustrations[0].afterParagraph).toBe(0);

    const removed = applyChapterOverrides(
      book.chapters,
      { 0: { illustrations: [] } },
      options(),
    );
    expect(removed[0].illustrations).toEqual([]);
  });

  it('keeps a header image anchored when paragraphs are edited without an illustration override', () => {
    const book = buildBook(text, options());
    const withHeader: ChapterIllustration[] = [
      {
        illustration: { key: 'h', mimeType: 'image/png', bytes: new Uint8Array([1]), alt: 'logo' },
        afterParagraph: -1,
        header: true,
      },
    ];
    const sourceChapters = book.chapters.map((chapter, index) =>
      index === 0 ? { ...chapter, illustrations: withHeader } : chapter,
    );
    const chapters = applyChapterOverrides(
      sourceChapters,
      { 0: { paragraphs: ['新的一段。'] } },
      options(),
    );
    expect(chapters[0].illustrations[0].header).toBe(true);
    expect(chapters[0].illustrations[0].afterParagraph).toBe(-1);
  });
});
