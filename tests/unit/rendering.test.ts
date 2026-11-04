import { describe, expect, it } from 'vitest';
import {
  renderChapterContent,
  renderChapterDocument,
  renderCss,
  renderPreviewDocument,
} from '../../src/core/rendering';
import { DEFAULT_OPTIONS, type Chapter, type EpubMeta, type Options } from '../../src/core/types';

const meta: EpubMeta = { title: '临川', author: '某', language: 'zh-CN' };

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 0,
    index: 0,
    rawTitle: '第一章 初入江湖',
    kind: 'chapter',
    title: {
      marker: '第一章',
      subtitle: '初入江湖',
      full: '第一章 初入江湖',
      toc: '第一章 初入江湖',
    },
    paragraphs: ['雨下了整夜。', '他笑了。'],
    imagesRemoved: 0,
    illustrations: [],
    ...overrides,
  };
}

function makeOptions(overrides: Partial<Options> = {}): Options {
  return {
    ...DEFAULT_OPTIONS,
    indent: { ...DEFAULT_OPTIONS.indent },
    paragraphGap: { ...DEFAULT_OPTIONS.paragraphGap },
    title: { ...DEFAULT_OPTIONS.title },
    ...overrides,
  };
}

describe('renderCss', () => {
  it('applies the requested indent and paragraph gap', () => {
    const css = renderCss(
      makeOptions({
        indent: { enabled: true, em: 2 },
        paragraphGap: { enabled: true, em: 0.6 },
      }),
    );
    expect(css).toContain('text-indent: 2em');
    expect(css).toContain('margin-top: 0.6em');
  });

  it('turns both off to zero', () => {
    const css = renderCss(
      makeOptions({
        indent: { enabled: false, em: 2 },
        paragraphGap: { enabled: false, em: 0.6 },
      }),
    );
    expect(css).toContain('text-indent: 0em');
    expect(css).toContain('margin-top: 0em');
  });

  it('clamps extreme values', () => {
    const css = renderCss(
      makeOptions({
        indent: { enabled: true, em: 99 },
        paragraphGap: { enabled: true, em: 99 },
      }),
    );
    expect(css).toContain('text-indent: 4em');
    expect(css).toContain('margin-top: 2em');
  });
});

describe('renderChapterContent', () => {
  it('renders an elegant split title', () => {
    const html = renderChapterContent(makeChapter(), makeOptions());
    expect(html).toContain('class="chapter-number"');
    expect(html).toContain('<h1 class="chapter-title">初入江湖</h1>');
    expect(html).toContain('chapter-rule');
  });

  it('renders a plain single-line title without a kicker', () => {
    const html = renderChapterContent(
      makeChapter(),
      makeOptions({ title: { ...DEFAULT_OPTIONS.title, preset: 'plain' } }),
    );
    expect(html).not.toContain('chapter-number');
    expect(html).toContain('<h1 class="chapter-title">第一章 初入江湖</h1>');
  });

  it('renders the inline preset with number and title in one heading', () => {
    const html = renderChapterContent(
      makeChapter(),
      makeOptions({ title: { ...DEFAULT_OPTIONS.title, preset: 'inline' } }),
    );
    expect(html).toContain('preset-inline');
    expect(html).toContain(
      '<h1 class="chapter-title"><span class="inline-marker">第一章</span> <span class="inline-title">初入江湖</span></h1>',
    );
    expect(html).not.toContain('chapter-number');
  });

  it('falls back to a single-line title for an inline chapter without a subtitle', () => {
    const chapter = makeChapter({
      title: { marker: '第一章', subtitle: '', full: '第一章', toc: '第一章' },
    });
    const html = renderChapterContent(
      chapter,
      makeOptions({ title: { ...DEFAULT_OPTIONS.title, preset: 'inline' } }),
    );
    expect(html).toContain('<h1 class="chapter-title">第一章</h1>');
    expect(html).not.toContain('inline-marker');
  });

  it('renders the ornament divider', () => {
    const html = renderChapterContent(
      makeChapter(),
      makeOptions({ title: { ...DEFAULT_OPTIONS.title, divider: 'ornament' } }),
    );
    expect(html).toContain('chapter-rule ornament');
    expect(html).toContain('❖');
  });

  it('escapes text from the TXT and drops invalid control characters', () => {
    const chapter = makeChapter({
      paragraphs: ['<script>alert("x") & 1</script>', 'A\u0001B'],
    });
    const html = renderChapterContent(chapter, makeOptions());
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;) &amp; 1&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('AB');
  });

  it('marks volume chapters', () => {
    const chapter = makeChapter({ kind: 'volume', title: { marker: '第一卷', subtitle: '山雨', full: '第一卷 山雨', toc: '第一卷 山雨' } });
    const html = renderChapterContent(chapter, makeOptions());
    expect(html).toContain('class="chapter is-volume"');
  });

  it('omits title decoration when beautification is disabled', () => {
    const html = renderChapterContent(
      makeChapter(),
      makeOptions({ title: { ...DEFAULT_OPTIONS.title, enabled: false } }),
    );
    expect(html).not.toContain('chapter-number');
    expect(html).not.toContain('chapter-rule');
  });
});

describe('documents', () => {
  it('links the shared CSS in an EPUB chapter', () => {
    const xml = renderChapterDocument(makeChapter(), makeOptions(), meta, '../css/style.css');
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain('xmlns="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain('href="../css/style.css"');
    expect(xml).toContain('<title>第一章 初入江湖</title>');
  });

  it('inlines CSS in the preview document', () => {
    const html = renderPreviewDocument(makeChapter(), makeOptions(), meta);
    expect(html).toContain('<style>');
    expect(html).toContain('max-width: 720px');
    expect(html).toContain('chapter-title');
  });

  it('escapes the metadata title inside head/title', () => {
    const xml = renderChapterDocument(
      makeChapter(),
      makeOptions(),
      { ...meta, title: 'A & B' },
      null,
    );
    expect(xml).toContain('<title>第一章 初入江湖</title>');
    expect(xml).not.toContain('<link');
  });
});
