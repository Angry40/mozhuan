import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildEpubBytes } from '../../src/core/epub/build';
import { buildBookFromEpub } from '../../src/core/epub/import';
import { parseEpub } from '../../src/core/epub/parsers';
import {
  hashBytes,
  illustrationExtension,
  sniffIllustrationMime,
  toBase64,
} from '../../src/core/illustrations';
import { renderChapterContent } from '../../src/core/rendering';
import { applyChapterOverrides } from '../../src/core/review';
import { DEFAULT_OPTIONS, type Chapter, type EpubMeta, type Options } from '../../src/core/types';

const TINY_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR42mNcYq/DwMDAxMDAgKAAFOkBFcv34tUAAAAASUVORK5CYII=',
    'base64',
  ),
);

const TINY_GIF = Uint8Array.from(
  Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
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

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:11111111-1111-4111-8111-111111111111</dc:identifier>
    <dc:title>插图样本</dc:title>
    <dc:creator>测试</dc:creator>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    <item id="c1" href="text/chapter-1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/chapter-2.xhtml" media-type="application/xhtml+xml"/>
    <item id="p1" href="images/pic-a.png" media-type="image/png"/>
    <item id="p2" href="images/pic-b.gif" media-type="image/gif"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`;

function chapterXhtml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${title}</title></head>
<body>
<h1>${title}</h1>
${body}
</body>
</html>`;
}

const CHAPTER_ONE = chapterXhtml(
  '第一章 起',
  `<p>第一段文字。</p>
<figure><img src="../images/pic-a.png" alt="断桥"/><figcaption>图一</figcaption></figure>
<p>第二段文字。</p>`,
);

// The second chapter reuses pic-a.png and adds a GIF, to check de-duplication
// and per-format extension handling at the same time.
const CHAPTER_TWO = chapterXhtml(
  '第二章 承',
  `<p>第三章开头。</p>
<p><img src="../images/pic-a.png"/></p>
<p><img src="../images/pic-b.gif" alt="小图"/></p>`,
);

async function makeEpub(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', CONTAINER_XML);
  zip.file('OEBPS/content.opf', OPF);
  zip.file('OEBPS/text/chapter-1.xhtml', CHAPTER_ONE);
  zip.file('OEBPS/text/chapter-2.xhtml', CHAPTER_TWO);
  zip.file('OEBPS/images/pic-a.png', TINY_PNG);
  zip.file('OEBPS/images/pic-b.gif', TINY_GIF);
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('illustration helpers', () => {
  it('identifies formats from magic bytes and extensions', () => {
    expect(sniffIllustrationMime(TINY_PNG, 'x.png')).toBe('image/png');
    expect(sniffIllustrationMime(TINY_GIF, 'x.gif')).toBe('image/gif');
    expect(sniffIllustrationMime(Uint8Array.from([0x00, 0x01, 0x02]), 'x.jpg')).toBe('image/jpeg');
    expect(sniffIllustrationMime(Uint8Array.from([0x00, 0x01, 0x02]), 'x.bin')).toBeNull();
  });

  it('hashes identical bytes to the same key', () => {
    expect(hashBytes(TINY_PNG)).toBe(hashBytes(Uint8Array.from(TINY_PNG)));
    expect(hashBytes(TINY_PNG)).not.toBe(hashBytes(TINY_GIF));
  });

  it('maps mime types to file extensions', () => {
    expect(illustrationExtension('image/jpeg')).toBe('jpg');
    expect(illustrationExtension('image/svg+xml')).toBe('svg');
  });

  it('encodes bytes as base64', () => {
    expect(toBase64(Uint8Array.from([104, 105]))).toBe('aGk=');
  });
});

describe('EPUB illustration parsing', () => {
  it('keeps picture positions while parsing', async () => {
    const source = await parseEpub(await makeEpub(), '插图样本.epub');

    expect(source.chapters).toHaveLength(2);
    const first = source.chapters[0];
    expect(first.imageCount).toBe(1);
    expect(first.illustrations).toHaveLength(1);
    expect(first.illustrations[0].illustration.mimeType).toBe('image/png');
    expect(first.illustrations[0].illustration.alt).toBe('断桥');
    expect(first.illustrations[0].afterParagraph).toBe(0);
    // The caption is preserved as a paragraph so nothing readable is lost.
    expect(first.paragraphs).toContain('图一');

    const second = source.chapters[1];
    expect(second.illustrations).toHaveLength(2);
    expect(second.illustrations.map((item) => item.illustration.mimeType)).toEqual([
      'image/png',
      'image/gif',
    ]);
  });

  it('de-duplicates a picture reused across chapters', async () => {
    const source = await parseEpub(await makeEpub(), '插图样本.epub');
    const firstKey = source.chapters[0].illustrations[0].illustration.key;
    const reused = source.chapters[1].illustrations[0].illustration;
    expect(reused.key).toBe(firstKey);
    // Same key means the bytes are stored once, not copied per chapter.
    expect(reused).toBe(source.chapters[0].illustrations[0].illustration);
  });

  it('warns that illustrations can be kept', async () => {
    const source = await parseEpub(await makeEpub(), '插图样本.epub');
    expect(
      source.warnings.some((warning) => warning.message.includes('关闭「清除插图」可随书保留')),
    ).toBe(true);
  });
});

describe('image switch', () => {
  it('drops illustrations when the switch is on', async () => {
    const source = await parseEpub(await makeEpub(), '插图样本.epub');
    const book = buildBookFromEpub(source, cloneOptions({ removeImages: true }));

    expect(book.chapters[0].illustrations).toEqual([]);
    expect(book.chapters[0].imagesRemoved).toBe(1);
    expect(book.stats.imagesRemoved).toBe(3);
    expect(book.imageRemovals.length).toBe(2);
    expect(book.imageRemovals[0].snippet).toContain('已连同图片文件清除');
  });

  it('keeps illustrations when the switch is off', async () => {
    const source = await parseEpub(await makeEpub(), '插图样本.epub');
    const book = buildBookFromEpub(source, cloneOptions({ removeImages: false }));

    expect(book.chapters[0].illustrations).toHaveLength(1);
    expect(book.chapters[1].illustrations).toHaveLength(2);
    expect(book.stats.imagesRemoved).toBe(0);
    expect(book.imageRemovals).toEqual([]);
  });
});

describe('illustration rendering', () => {
  const meta: EpubMeta = { title: '插图样本', author: '', language: 'zh-CN' };

  it('renders a figure at its anchor position', async () => {
    const source = await parseEpub(await makeEpub(), '插图样本.epub');
    const book = buildBookFromEpub(source, cloneOptions({ removeImages: false }));
    const html = renderChapterContent(book.chapters[0], cloneOptions({ removeImages: false }));

    expect(html).toContain('<figure class="illustration"><img src="data:image/png;base64,');
    expect(html).toContain('alt="断桥"');
    // The picture must sit after paragraph 0, not at the end of the chapter.
    const bodyOrder = [...html.matchAll(/<p class="body">([\s\S]*?)<\/p>|<figure/g)];
    expect(bodyOrder).toHaveLength(4);
    expect(bodyOrder[1][0]).toContain('<figure');
  });

  it('uses a custom resolver for exported files', async () => {
    const source = await parseEpub(await makeEpub(), '插图样本.epub');
    const book = buildBookFromEpub(source, cloneOptions({ removeImages: false }));
    const html = renderChapterContent(book.chapters[0], cloneOptions({ removeImages: false }), () => '../images/fig-001.png');
    expect(html).toContain('src="../images/fig-001.png"');
    expect(meta.title).toBe('插图样本');
  });

  it('renders nothing extra when the switch removed the pictures', async () => {
    const source = await parseEpub(await makeEpub(), '插图样本.epub');
    const book = buildBookFromEpub(source, cloneOptions({ removeImages: true }));
    const html = renderChapterContent(book.chapters[0], cloneOptions({ removeImages: true }));
    expect(html).not.toContain('<figure');
    expect(html).not.toContain('data:image');
  });
});

describe('illustration packaging', () => {
  it('writes pictures into OEBPS/images and declares them in the OPF', async () => {
    const source = await parseEpub(await makeEpub(), '插图样本.epub');
    const book = buildBookFromEpub(source, cloneOptions({ removeImages: false }));
    const meta: EpubMeta = { title: '插图样本', author: '', language: 'zh-CN' };

    const bytes = await buildEpubBytes(book.chapters, meta, cloneOptions({ removeImages: false }));
    const zip = await JSZip.loadAsync(bytes);

    const imageNames = Object.keys(zip.files).filter(
      (name) => name.startsWith('OEBPS/images/') && !name.endsWith('/'),
    );
    expect(imageNames.sort()).toEqual(['OEBPS/images/fig-001.png', 'OEBPS/images/fig-002.gif']);

    const opf = await zip.file('OEBPS/content.opf')?.async('string');
    expect(opf).toContain('href="images/fig-001.png" media-type="image/png"');
    expect(opf).toContain('href="images/fig-002.gif" media-type="image/gif"');

    const chapter = await zip.file('OEBPS/text/chapter-0001.xhtml')?.async('string');
    expect(chapter).toContain('src="../images/fig-001.png"');
  });

  it('produces no image entries when the switch is on', async () => {
    const source = await parseEpub(await makeEpub(), '插图样本.epub');
    const book = buildBookFromEpub(source, cloneOptions({ removeImages: true }));
    const meta: EpubMeta = { title: '插图样本', author: '', language: 'zh-CN' };

    const bytes = await buildEpubBytes(book.chapters, meta, cloneOptions({ removeImages: true }));
    const zip = await JSZip.loadAsync(bytes);

    expect(
      Object.keys(zip.files).filter(
        (name) => name.startsWith('OEBPS/images/') && !name.endsWith('/'),
      ),
    ).toEqual([]);
    const opf = await zip.file('OEBPS/content.opf')?.async('string');
    expect(opf).not.toContain('img-001');
  });
});

describe('anchor remapping after a manual edit', () => {
  function chapterWithIllustration(): Chapter {
    return {
      id: 0,
      index: 0,
      rawTitle: '第一章',
      kind: 'chapter',
      title: { marker: '第一章', subtitle: '', full: '第一章', toc: '第一章' },
      paragraphs: ['一', '二', '三', '四'],
      imagesRemoved: 0,
      illustrations: [
        {
          illustration: { key: 'k1', mimeType: 'image/png', bytes: TINY_PNG, alt: '' },
          afterParagraph: 3,
        },
      ],
    };
  }

  it('keeps the anchor inside the new paragraph range', () => {
    const options = cloneOptions();
    const chapters = applyChapterOverrides(
      [chapterWithIllustration()],
      { 0: { paragraphs: ['只有一段'] } },
      options,
    );
    expect(chapters[0].paragraphs).toHaveLength(1);
    expect(chapters[0].illustrations).toHaveLength(1);
    expect(chapters[0].illustrations[0].afterParagraph).toBe(0);
  });

  it('scales the anchor when paragraph count doubles', () => {
    const options = cloneOptions();
    const chapters = applyChapterOverrides(
      [chapterWithIllustration()],
      { 0: { paragraphs: ['一', '二', '三', '四', '五', '六', '七', '八'] } },
      options,
    );
    const anchor = chapters[0].illustrations[0].afterParagraph;
    expect(anchor).toBeGreaterThanOrEqual(0);
    expect(anchor).toBeLessThan(8);
    // The picture sat at the end before, so it should stay near the end.
    expect(anchor).toBeGreaterThanOrEqual(6);
  });

  it('drops to the heading position when the chapter becomes empty', () => {
    const options = cloneOptions();
    const chapters = applyChapterOverrides(
      [chapterWithIllustration()],
      { 0: { paragraphs: [] } },
      options,
    );
    expect(chapters[0].illustrations[0].afterParagraph).toBe(-1);
  });
});
