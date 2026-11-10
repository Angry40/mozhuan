import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildBookFromEpub } from '../../src/core/epub/import';
import { EpubImportError, parseEpub } from '../../src/core/epub/parsers';
import { DEFAULT_OPTIONS, type EpubSource, type Options } from '../../src/core/types';

const sampleBytes = readFileSync(new URL('../../samples/示例小说.epub', import.meta.url));
const TINY_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR42mNcYq/DwMDAxMDAgKAAFOkBFcv34tUAAAAASUVORK5CYII=',
    'base64',
  ),
);

function cloneOptions(overrides: Partial<Options> = {}): Options {
  return {
    ...DEFAULT_OPTIONS,
    indent: { ...DEFAULT_OPTIONS.indent },
    paragraphGap: { ...DEFAULT_OPTIONS.paragraphGap },
    title: { ...DEFAULT_OPTIONS.title },
    ...overrides,
  };
}

describe('parseEpub', () => {
  it('parses the generated sample EPUB', async () => {
    const source = await parseEpub(Uint8Array.from(sampleBytes).buffer, '示例小说.epub');

    expect(source.mode).toBe('epub');
    expect(source.metadata.title).toBe('临川夜雨');
    expect(source.metadata.language).toBe('zh-CN');
    expect(source.metadata.identifier).toMatch(/^urn:uuid:/);
    expect(source.chapters).toHaveLength(7);
    expect(source.navigationSource).toBe('nav');
    expect(source.navigation.length).toBe(7);
    expect(source.cover).not.toBeNull();
    expect(source.cover?.mimeType).toBe('image/png');
    expect(source.chapters[0].title).toBe('第一章 初入江湖');
    expect(source.chapters[0].paragraphs[0]).toContain('雨下了整夜');
    expect(source.chapters[0].paragraphs).not.toContain('第一章');
    expect(source.chapters[5].title).toBe('番外 小传');
  });

  it('converts parsed chapters through the shared book model', async () => {
    const source = await parseEpub(Uint8Array.from(sampleBytes).buffer, '示例小说.epub');
    const book = buildBookFromEpub(source, cloneOptions());
    expect(book.chapters).toHaveLength(7);
    expect(book.chapters[0].title.toc).toBe('第一章 初入江湖');
    expect(book.chapters[0].paragraphs[0]).toContain('雨下了整夜');
    expect(book.stats.characters).toBeGreaterThan(100);
    expect(book.warnings.some((warning) => warning.code === 'no-headings')).toBe(false);
  });

  it('rejects a damaged EPUB', async () => {
    await expect(parseEpub(new ArrayBuffer(64), 'broken.epub')).rejects.toThrow(EpubImportError);
  });
});

describe('buildBookFromEpub blank line filtering', () => {
  /**
   * 解析层已经清理了块文本，这里直接构造 EpubSource，锁定“过滤空行和空白行”
   * 开关能透传到 EPUB 导入路径。
   */
  function makeSource(paragraphs: string[]): EpubSource {
    return {
      mode: 'epub',
      fileName: 'minimal.epub',
      buffer: new ArrayBuffer(0),
      metadata: {
        title: '最小样本',
        author: '',
        language: 'zh-CN',
        identifier: 'urn:uuid:00000000-0000-4000-8000-000000000000',
        modified: '2024-01-01T00:00:00Z',
      },
      chapters: [
        {
          id: 0,
          href: 'text/chapter-0001.xhtml',
          title: '第一章 测试',
          paragraphs,
          kind: 'chapter',
          imageCount: 0,
          illustrations: [],
        },
      ],
      manifest: [],
      navigation: [],
      navigationSource: 'spine',
      cover: null,
      warnings: [],
      totalChapters: 1,
      totalCharacters: 0,
      totalParagraphs: 0,
      fonts: [],
    };
  }

  it('drops hidden blank lines when the filter is on', () => {
    const book = buildBookFromEpub(
      makeSource(['正文一。', '\u2800', '&nbsp;', '正文二。']),
      cloneOptions(),
    );
    expect(book.chapters[0].paragraphs).toEqual(['正文一。', '正文二。']);
  });

  it('keeps hidden blank lines when the filter is off', () => {
    const book = buildBookFromEpub(
      makeSource(['正文一。', '\u2800', '&nbsp;', '正文二。']),
      cloneOptions({ filterBlankLines: false }),
    );
    expect(book.chapters[0].paragraphs).toEqual(['正文一。', '\u2800', '&nbsp;', '正文二。']);
  });
});


async function makeMinimalEpub(options: {
  nav: boolean;
  ncx: boolean;
  chapterTitle: string;
  withImage?: boolean;
  bodyHtml?: string;
}): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );
  const navItem = options.nav
    ? '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
    : '';
  const ncxItem = options.ncx
    ? '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
    : '';
  const imageItem = options.withImage
    ? '    <item id="img1" href="images/illustration.png" media-type="image/png"/>'
    : '';
  const spineToc = options.ncx ? ' toc="ncx"' : '';
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:test</dc:identifier>
    <dc:title>测试书</dc:title>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="chap1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
${navItem}
${ncxItem}
${imageItem}
  </manifest>
  <spine${spineToc}><itemref idref="chap1"/></spine>
</package>`,
  );
  zip.file(
    'OEBPS/text/ch1.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${options.chapterTitle}</title></head>
<body>${
      options.bodyHtml ??
      `<h1>${options.chapterTitle}</h1>${
        options.withImage
          ? '<p>前一页。</p><img src="../images/illustration.png" alt="插图"/><p>后一页。</p>'
          : '<p>这里是正文。</p>'
      }`
    }</body></html>`,
  );
  if (options.nav) {
    zip.file(
      'OEBPS/nav.xhtml',
      `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
<nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">${options.chapterTitle}</a></li></ol></nav>
</body></html>`,
    );
  }
  if (options.ncx) {
    zip.file(
      'OEBPS/toc.ncx',
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap><navPoint id="n1"><navLabel><text>${options.chapterTitle}</text></navLabel><content src="text/ch1.xhtml"/></navPoint></navMap>
</ncx>`,
    );
  }
  if (options.withImage) {
    zip.file('OEBPS/images/illustration.png', TINY_PNG);
  }
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new Uint8Array(bytes).buffer;
}

describe('EPUB navigation fallbacks', () => {
  it('reads chapter order and labels from NCX when nav.xhtml is absent', async () => {
    const source = await parseEpub(
      await makeMinimalEpub({ nav: false, ncx: true, chapterTitle: '第一章 初入江湖' }),
      'ncx.epub',
    );
    expect(source.navigationSource).toBe('ncx');
    expect(source.chapters).toHaveLength(1);
    expect(source.chapters[0].title).toBe('第一章 初入江湖');
    expect(source.chapters[0].paragraphs).toEqual(['这里是正文。']);
  });

  it('counts inline images and warns that they are cleaned', async () => {
    const source = await parseEpub(
      await makeMinimalEpub({
        nav: false,
        ncx: false,
        chapterTitle: '第一章 初入江湖',
        withImage: true,
      }),
      'image.epub',
    );
    expect(source.chapters[0].imageCount).toBe(1);
    expect(source.chapters[0].paragraphs).toEqual(['前一页。', '后一页。']);
    expect(source.warnings.some((warning) => warning.message.includes('内联插图'))).toBe(true);

    const book = buildBookFromEpub(source, cloneOptions());
    expect(book.stats.imagesRemoved).toBe(1);
    expect(book.imageRemovals).toHaveLength(1);
  });

  it('filters caption text that shares an image-head container with an img', async () => {
    const source = await parseEpub(
      await makeMinimalEpub({
        nav: false,
        ncx: false,
        chapterTitle: '第五章 仪式',
        withImage: true,
        bodyHtml: `
<div class="chapter-head">
  <p class="chapter-head">小<br/>丑</p>
  <img class="chapter-head" src="../images/illustration.png"/>
</div>
<h2 class="chapter-title"><span>第五章</span><br/><span>仪 式</span></h2>
<p>正文第一段。</p>`,
      }),
      'image-head.epub',
    );

    expect(source.chapters[0].title).toBe('第五章 仪 式');
    expect(source.chapters[0].paragraphs).toEqual(['正文第一段。']);
    expect(source.chapters[0].paragraphs.join('')).not.toContain('小丑');
    expect(source.chapters[0].imageCount).toBe(1);
  });

  it('falls back to the spine and h1 title when there is no navigation', async () => {
    const source = await parseEpub(
      await makeMinimalEpub({ nav: false, ncx: false, chapterTitle: '第一章 初入江湖' }),
      'spine.epub',
    );
    expect(source.navigationSource).toBe('spine');
    expect(source.chapters).toHaveLength(1);
    expect(source.chapters[0].title).toBe('第一章 初入江湖');
    expect(source.chapters[0].paragraphs).toEqual(['这里是正文。']);
    expect(source.warnings.some((warning) => warning.code === 'epub-import')).toBe(true);
  });
});
