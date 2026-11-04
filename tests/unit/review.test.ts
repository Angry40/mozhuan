import { describe, expect, it } from 'vitest';
import { buildBook } from '../../src/core/pipeline';
import { applyChapterOverrides } from '../../src/core/review';
import { DEFAULT_OPTIONS, type ChapterOverride, type Options } from '../../src/core/types';

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
});
