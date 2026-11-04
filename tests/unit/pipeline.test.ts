import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBook } from '../../src/core/pipeline';
import { DEFAULT_OPTIONS, type Options } from '../../src/core/types';

function cloneOptions(overrides: Partial<Options> = {}): Options {
  return {
    ...DEFAULT_OPTIONS,
    indent: { ...DEFAULT_OPTIONS.indent },
    paragraphGap: { ...DEFAULT_OPTIONS.paragraphGap },
    title: { ...DEFAULT_OPTIONS.title },
    ...overrides,
  };
}

const sampleText = readFileSync(new URL('../fixtures/sample.txt', import.meta.url), 'utf8');

describe('buildBook', () => {
  it('parses the sample novel', () => {
    const book = buildBook(sampleText, cloneOptions());
    expect(book.chapters).toHaveLength(7);
    expect(book.chapters[0].title.toc).toBe('第一章 初入江湖');
    expect(book.chapters[3].title.toc).toBe('第四章 灯下故人');
    expect(book.chapters[5].title.toc).toBe('番外 小传');
    expect(book.chapters[6].title.toc).toBe('后记');
    expect(book.stats.chapters).toBe(7);
    expect(book.stats.characters).toBeGreaterThan(100);
    expect(book.stats.imagesRemoved).toBeGreaterThanOrEqual(4);
    expect(book.stats.paragraphs).toBeGreaterThan(20);
    expect(book.warnings.some((warning) => warning.code === 'no-headings')).toBe(false);
  });

  it('keeps image markers when image removal is disabled', () => {
    const book = buildBook(sampleText, cloneOptions({ removeImages: false }));
    expect(book.stats.imagesRemoved).toBe(0);
    const secondChapter = book.chapters[1].paragraphs.join('\n');
    expect(secondChapter).toContain('[插图]');
    expect(secondChapter).toContain('<img');
  });

  it('trims paragraph indentation and drops blank paragraphs', () => {
    const book = buildBook(sampleText, cloneOptions());
    expect(book.chapters[0].paragraphs[0]).toBe('雨下了整夜，青石巷里浮着一层薄雾。');
    expect(book.chapters[0].paragraphs.every((paragraph) => paragraph.trim() === paragraph)).toBe(true);
  });

  it('converts chapter numbers when requested', () => {
    const book = buildBook(sampleText, cloneOptions({ title: { ...DEFAULT_OPTIONS.title, numbering: 'arabic' } }));
    expect(book.chapters[0].title.marker).toBe('第1章');
    expect(book.chapters[4].title.marker).toBe('第5章');
  });

  it('detects bare titles, numbers them, and warns', () => {
    const text = `初入江湖

他出了门。

风起

风更大了。

夜雨

雨落下来。`;
    const book = buildBook(text, cloneOptions());
    expect(book.chapters).toHaveLength(3);
    expect(book.chapters.map((chapter) => chapter.title.toc)).toEqual([
      '第一章 初入江湖',
      '第二章 风起',
      '第三章 夜雨',
    ]);
    expect(book.warnings.some((warning) => warning.code === 'bare-headings')).toBe(true);
  });

  it('does not detect bare titles when auto-numbering is off', () => {
    const text = `初入江湖

他出了门。

风起

风更大了。

夜雨

雨落下来。`;
    const book = buildBook(
      text,
      cloneOptions({ title: { ...DEFAULT_OPTIONS.title, autofillNumber: false } }),
    );
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0].rawTitle).toBe('全文');
    expect(book.warnings.some((warning) => warning.code === 'no-headings')).toBe(true);
  });

  it('warns and splits by length when requested for a heading-less book', () => {
    const paragraph = `${'雨'.repeat(80)}。`;
    const text = Array.from({ length: 50 }, () => paragraph).join('\n\n');
    const book = buildBook(text, cloneOptions({ fallbackSplit: 'chunk' }));
    expect(book.chapters.length).toBeGreaterThan(1);
    expect(book.warnings.some((warning) => warning.code === 'no-headings')).toBe(true);
    expect(book.chapters[0].rawTitle).toBe('第1节');
  });

  it('handles empty input without throwing', () => {
    const book = buildBook('   \n\n ', cloneOptions());
    expect(book.chapters).toHaveLength(0);
    expect(book.stats.characters).toBe(0);
    expect(book.warnings.some((warning) => warning.code === 'empty-book')).toBe(true);
  });

  it('records image snippets with chapter labels', () => {
    const book = buildBook(sampleText, cloneOptions());
    expect(book.imageRemovals.length).toBeGreaterThan(0);
    expect(book.imageRemovals[0].chapterTitle.length).toBeGreaterThan(0);
    expect(book.imageRemovals.every((removal) => removal.snippet.length <= 80)).toBe(true);
  });
});
