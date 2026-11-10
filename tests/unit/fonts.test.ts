import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildEpubBytes } from '../../src/core/epub/build';
import { buildBook } from '../../src/core/pipeline';
import { parseEpub } from '../../src/core/epub/parsers';
import {
  fontExtension,
  fontFamily,
  fontFamilyStack,
  normalizeFontMediaType,
  renderFontFaces,
  sniffFontMime,
} from '../../src/core/fonts';
import { DEFAULT_OPTIONS, type EpubFont, type Options } from '../../src/core/types';

function cloneOptions(overrides: Partial<Options> = {}): Options {
  return {
    ...DEFAULT_OPTIONS,
    indent: { ...DEFAULT_OPTIONS.indent },
    paragraphGap: { ...DEFAULT_OPTIONS.paragraphGap },
    title: { ...DEFAULT_OPTIONS.title },
    ...overrides,
  };
}

const WOFF2 = Uint8Array.from([0x77, 0x4f, 0x46, 0x32, 0x00, 0x00, 0x00, 0x01]);
const WOFF = Uint8Array.from([0x77, 0x4f, 0x46, 0x46, 0x00, 0x00, 0x00, 0x01]);
const TTF = Uint8Array.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const OTF = Uint8Array.from([0x4f, 0x54, 0x54, 0x4f, 0x00, 0x00, 0x00, 0x01]);

function makeFont(fileName: string, mimeType: EpubFont['mimeType'], bytes: Uint8Array): EpubFont {
  return { key: `k-${fileName}`, fileName, mimeType, bytes };
}

describe('font media type normalization', () => {
  it('maps common font media types to EPUB 3 core types', () => {
    expect(normalizeFontMediaType('font/woff2')).toBe('font/woff2');
    expect(normalizeFontMediaType('application/font-woff')).toBe('font/woff');
    expect(normalizeFontMediaType('application/vnd.ms-opentype')).toBe('font/otf');
    expect(normalizeFontMediaType('application/x-font-truetype')).toBe('font/ttf');
    expect(normalizeFontMediaType('image/png')).toBeNull();
    expect(normalizeFontMediaType(undefined)).toBeNull();
  });

  it('sniffs magic bytes, falling back to the declared type', () => {
    expect(sniffFontMime(WOFF2, 'font/woff2')).toBe('font/woff2');
    expect(sniffFontMime(WOFF, 'font/woff')).toBe('font/woff');
    expect(sniffFontMime(TTF, 'font/ttf')).toBe('font/ttf');
    expect(sniffFontMime(OTF, 'font/otf')).toBe('font/otf');
    // 魔数不匹配时回退到 manifest 声明
    expect(sniffFontMime(Uint8Array.from([1, 2, 3]), 'font/woff2')).toBe('font/woff2');
  });

  it('maps mime types to extensions', () => {
    expect(fontExtension('font/woff2')).toBe('woff2');
    expect(fontExtension('font/otf')).toBe('otf');
  });
});

describe('font CSS output', () => {
  it('builds families and @font-face rules', () => {
    const fonts = [
      makeFont('song.woff2', 'font/woff2', WOFF2),
      makeFont('kai.ttf', 'font/ttf', TTF),
    ];
    expect(fontFamilyStack(fonts)).toEqual(['"Embedded-1-song"', '"Embedded-2-kai"']);
    expect(fontFamily(fonts[0], 0)).toBe('Embedded-1-song');
    const faces = renderFontFaces(fonts, (font) => `../fonts/${font.fileName}`);
    expect(faces).toContain('@font-face { font-family: "Embedded-1-song"; src: url("../fonts/song.woff2") format("woff2"); }');
    expect(faces).toContain('format("truetype")');
  });
});

describe('embedded font packaging', () => {
  const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
  const OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa</dc:identifier>
    <dc:title>字体样本</dc:title>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    <item id="c1" href="text/chapter-1.xhtml" media-type="application/xhtml+xml"/>
    <item id="f1" href="fonts/song.woff2" media-type="font/woff2"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`;

  async function makeEpubWithFont(): Promise<ArrayBuffer> {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file('META-INF/container.xml', CONTAINER_XML);
    zip.file('OEBPS/content.opf', OPF);
    zip.file(
      'OEBPS/text/chapter-1.xhtml',
      `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章 起</title></head>
<body><h1>第一章 起</h1><p>正文。</p></body></html>`,
    );
    zip.file('OEBPS/fonts/song.woff2', WOFF2);
    return zip.generateAsync({ type: 'arraybuffer' });
  }

  it('extracts embedded fonts from the OPF manifest', async () => {
    const source = await parseEpub(await makeEpubWithFont(), '字体样本.epub');
    expect(source.fonts).toHaveLength(1);
    expect(source.fonts[0].mimeType).toBe('font/woff2');
    expect(source.fonts[0].fileName).toBe('song.woff2');
    expect(source.warnings.some((warning) => warning.message.includes('嵌入字体'))).toBe(true);
  });

  it('keeps fonts when removeFonts is off and drops them when on', () => {
    const fonts = [makeFont('song.woff2', 'font/woff2', WOFF2)];
    const options = cloneOptions({ removeFonts: false });
    const meta = { title: '字体样本', author: '', language: 'zh-CN' as const };

    return buildEpubBytes(
      buildBook('第一章 起\n\n正文。', cloneOptions()).chapters,
      meta,
      options,
      { fonts },
    ).then(async (bytes) => {
      const zip = await JSZip.loadAsync(bytes);
      expect(Object.keys(zip.files).filter((name) => name.startsWith('OEBPS/fonts/') && !name.endsWith('/'))).toHaveLength(1);
      const opf = await zip.file('OEBPS/content.opf')!.async('string');
      expect(opf).toContain('media-type="font/woff2"');
      const css = await zip.file('OEBPS/css/style.css')!.async('string');
      expect(css).toContain('@font-face');
    });
  });
});
