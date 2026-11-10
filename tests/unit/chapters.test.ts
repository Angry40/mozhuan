import { describe, expect, it } from 'vitest';
import { splitRawChapters } from '../../src/core/chapters';

describe('splitRawChapters', () => {
  it('splits standard Chinese chapter headings', () => {
    const text = `第一章 初入江湖

　　雨下了整夜。
　　他翻到第一章，又合上了书。

第二章 风起

　　临川城起风了。`;

    const result = splitRawChapters(text);
    expect(result.hasHeadings).toBe(true);
    expect(result.bareHeadings).toBe(false);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].rawTitle).toBe('第一章 初入江湖');
    expect(result.chapters[0].lines.join('\n')).toContain('雨下了整夜');
    expect(result.chapters[0].lines.join('\n')).not.toContain('第一章 初入江湖');
    expect(result.chapters[1].rawTitle).toBe('第二章 风起');
  });

  it('keeps a preamble as its own 开篇 chapter', () => {
    const text = `书名：临川
作者：某

第一章 初入江湖

　　雨下了整夜。`;

    const result = splitRawChapters(text);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]).toMatchObject({ rawTitle: '开篇', kind: 'preamble' });
    expect(result.chapters[0].lines.join('\n')).toContain('书名：临川');
  });

  it('marks volume and special headings', () => {
    const text = `第一卷 山雨

　　卷首语。

第一章 初入江湖

　　正文。

番外 小传

　　许多年后。`;

    const result = splitRawChapters(text);
    expect(result.chapters.map((chapter) => chapter.kind)).toEqual([
      'volume',
      'chapter',
      'special',
    ]);
  });

  it('marks 册 and 部 headings as volumes', () => {
    const text = `第一册 上篇

　　卷首语。

第二部 风起

　　正文。

第一章 初入江湖

　　正文。`;

    const result = splitRawChapters(text);
    expect(result.chapters.map((chapter) => chapter.kind)).toEqual([
      'volume',
      'volume',
      'chapter',
    ]);
  });

  it('does not detect sentence-like lines as headings', () => {
    const text = `第一章的内容非常精彩，他读了一夜。

第一章 ${'这是一个很长的标题'.repeat(4)}`;

    const result = splitRawChapters(text);
    expect(result.hasHeadings).toBe(false);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].rawTitle).toBe('全文');
  });

  it('detects English chapter headings', () => {
    const text = `Chapter 1: The Rain

It rained all night.

Chapter 2: The Wind

The wind rose.`;

    const result = splitRawChapters(text);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].rawTitle).toBe('Chapter 1: The Rain');
  });

  it('falls back to a single chapter when there are no headings', () => {
    const result = splitRawChapters('只是一段普通的文字。\n\n没有任何章节标题。');
    expect(result.hasHeadings).toBe(false);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].rawTitle).toBe('全文');
  });

  it('can split a heading-less book by length', () => {
    const paragraph = `${'雨'.repeat(100)}。`;
    const text = Array.from({ length: 50 }, () => paragraph).join('\n\n');
    const result = splitRawChapters(text, 'chunk');
    expect(result.hasHeadings).toBe(false);
    expect(result.chapters.length).toBeGreaterThan(1);
    expect(result.chapters[0].rawTitle).toBe('第1节');
  });

  it('detects bare titles only when enabled and at least three exist', () => {
    const text = `初入江湖

他出了门。

风起

风更大了。

夜雨

雨落下来。`;

    const disabled = splitRawChapters(text, 'single', false);
    expect(disabled.chapters).toHaveLength(1);
    expect(disabled.bareHeadings).toBe(false);

    const enabled = splitRawChapters(text, 'single', true);
    expect(enabled.bareHeadings).toBe(true);
    expect(enabled.hasHeadings).toBe(true);
    expect(enabled.chapters).toHaveLength(3);
    expect(enabled.chapters[0].rawTitle).toBe('初入江湖');
  });

  it('ignores one or two bare candidates', () => {
    const text = `初入江湖

他出了门。

风起

风更大了。`;
    const result = splitRawChapters(text, 'single', true);
    expect(result.bareHeadings).toBe(false);
    expect(result.chapters).toHaveLength(1);
  });

  it('returns no chapters for empty text', () => {
    const result = splitRawChapters('   \n\n  ');
    expect(result.chapters).toHaveLength(0);
    expect(result.hasHeadings).toBe(false);
  });
});
