import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { buildEpubBytes } from '../../src/core/epub/build';
import { buildBook } from '../../src/core/pipeline';
import { DEFAULT_OPTIONS, type EpubMeta, type Options } from '../../src/core/types';

const sampleText = readFileSync(new URL('../fixtures/sample.txt', import.meta.url), 'utf8');
const COVER_PNG = Uint8Array.from(
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

function parseXml(xml: string, label: string) {
  const errors: string[] = [];
  const parser = new DOMParser({
    onError: (level, message) => {
      if (level === 'error' || level === 'fatalError') {
        errors.push(`${label}: ${message}`);
      }
    },
  });
  const document = parser.parseFromString(xml, 'application/xml');
  expect(errors, errors.join('\n')).toEqual([]);
  return document;
}

async function makeEpub(
  options = cloneOptions(),
  chaptersText = sampleText,
  metaOverrides: Partial<EpubMeta> = {},
) {
  const book = buildBook(chaptersText, options);
  const meta: EpubMeta = {
    title: '临川',
    author: '某',
    language: 'zh-CN',
    ...metaOverrides,
  };
  const bytes = await buildEpubBytes(book.chapters, meta, options, {
    identifier: 'urn:uuid:11111111-1111-4111-8111-111111111111',
    modified: '2026-11-03T12:00:00Z',
  });
  const zip = await JSZip.loadAsync(bytes);
  return { book, bytes, zip };
}

describe('buildEpubBytes', () => {
  it('creates the expected EPUB entries', async () => {
    const { bytes, zip } = await makeEpub();
    expect(Object.keys(zip.files)[0]).toBe('mimetype');
    expect(zip.file('mimetype')).toBeTruthy();
    expect(zip.file('META-INF/container.xml')).toBeTruthy();
    expect(zip.file('OEBPS/content.opf')).toBeTruthy();
    expect(zip.file('OEBPS/nav.xhtml')).toBeTruthy();
    expect(zip.file('OEBPS/toc.ncx')).toBeTruthy();
    expect(zip.file('OEBPS/css/style.css')).toBeTruthy();
    expect(zip.file('OEBPS/text/chapter-0001.xhtml')).toBeTruthy();
    expect(zip.file('OEBPS/text/cover.xhtml')).toBeNull();

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    expect(extraLength).toBe(0);
    expect(new TextDecoder().decode(bytes.slice(30, 30 + nameLength))).toBe('mimetype');
    expect(await zip.file('mimetype')?.async('string')).toBe('application/epub+zip');
  });

  it('adds an optional cover image and cover page', async () => {
    const { book, zip } = await makeEpub(cloneOptions(), sampleText, {
      cover: { bytes: COVER_PNG, mimeType: 'image/png', fileName: '封面.png' },
    });

    const image = await zip.file('OEBPS/images/cover.png')?.async('uint8array');
    expect(image).toBeTruthy();
    expect(Array.from(image!)).toEqual(Array.from(COVER_PNG));

    const coverPage = (await zip.file('OEBPS/text/cover.xhtml')?.async('string')) ?? '';
    expect(coverPage).toContain('class="cover-body"');
    expect(coverPage).toContain('src="../images/cover.png"');
    expect(coverPage).toContain('<title>封面</title>');

    const opfText = (await zip.file('OEBPS/content.opf')!.async('string')) ?? '';
    expect(opfText).toContain('<meta name="cover" content="cover-image"/>');
    expect(opfText).toContain('properties="cover-image"');
    expect(opfText).toContain('media-type="image/png"');

    const opf = parseXml(opfText, 'opf');
    const spine = Array.from(opf.getElementsByTagName('itemref'));
    expect(spine).toHaveLength(book.chapters.length + 1);
    expect(spine[0].getAttribute('idref')).toBe('cover-page');

    const manifest = Array.from(opf.getElementsByTagName('item'));
    const coverItem = manifest.find((item) => item.getAttribute('id') === 'cover-image');
    expect(coverItem?.getAttribute('href')).toBe('images/cover.png');
    expect(coverItem?.getAttribute('properties')).toBe('cover-image');
  });

  it('writes a valid container, OPF, nav and NCX', async () => {
    const { book, zip } = await makeEpub();
    const container = parseXml(
      (await zip.file('META-INF/container.xml')!.async('string')) ?? '',
      'container',
    );
    expect(container.documentElement!.tagName).toBe('container');
    expect(container.getElementsByTagName('rootfile')[0].getAttribute('full-path')).toBe(
      'OEBPS/content.opf',
    );

    const opf = parseXml((await zip.file('OEBPS/content.opf')!.async('string')) ?? '', 'opf');
    expect(opf.documentElement!.getAttribute('version')).toBe('3.0');
    expect(opf.getElementsByTagName('dc:title')[0].textContent).toBe('临川');
    expect(opf.getElementsByTagName('dc:creator')[0].textContent).toBe('某');
    expect(opf.getElementsByTagName('dc:identifier')[0].textContent).toBe(
      'urn:uuid:11111111-1111-4111-8111-111111111111',
    );
    expect(opf.getElementsByTagName('meta')[0].textContent).toBe('2026-11-03T12:00:00Z');
    expect(opf.getElementsByTagName('itemref')).toHaveLength(book.chapters.length);

    const manifest = Array.from(opf.getElementsByTagName('item'));
    for (const item of manifest) {
      const href = item.getAttribute('href');
      expect(href).toBeTruthy();
      expect(zip.file(`OEBPS/${href}`), `missing manifest file ${href}`).toBeTruthy();
    }

    const nav = parseXml((await zip.file('OEBPS/nav.xhtml')!.async('string')) ?? '', 'nav');
    const links = Array.from(nav.getElementsByTagName('a'));
    expect(links).toHaveLength(book.chapters.length);
    for (const link of links) {
      const href = link.getAttribute('href');
      expect(href).toBeTruthy();
      expect(zip.file(`OEBPS/${href}`)).toBeTruthy();
    }

    const ncx = parseXml((await zip.file('OEBPS/toc.ncx')!.async('string')) ?? '', 'ncx');
    expect(ncx.getElementsByTagName('navPoint')).toHaveLength(book.chapters.length);
    expect(ncx.getElementsByTagName('meta')[0].getAttribute('content')).toBe(
      'urn:uuid:11111111-1111-4111-8111-111111111111',
    );
  });

  it('applies indent and spacing options to the shared stylesheet', async () => {
    const on = await makeEpub(
      cloneOptions({
        indent: { enabled: true, em: 2 },
        paragraphGap: { enabled: true, em: 0.6 },
      }),
    );
    const onCss = (await on.zip.file('OEBPS/css/style.css')!.async('string')) ?? '';
    expect(onCss).toContain('text-indent: 2em');
    expect(onCss).toContain('margin-top: 0.6em');

    const off = await makeEpub(
      cloneOptions({
        indent: { enabled: false, em: 2 },
        paragraphGap: { enabled: false, em: 0.6 },
      }),
    );
    const offCss = (await off.zip.file('OEBPS/css/style.css')!.async('string')) ?? '';
    expect(offCss).toContain('text-indent: 0em');
    expect(offCss).toContain('margin-top: 0em');
  });

  it('escapes unsafe text inside chapter documents', async () => {
    const text = `第一章 测试\n\nA & B < C > D "E" 'F' <script>alert(1)</script>`;
    const { zip } = await makeEpub(cloneOptions(), text);
    const chapter = (await zip.file('OEBPS/text/chapter-0001.xhtml')!.async('string')) ?? '';
    expect(chapter).toContain('A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos;');
    expect(chapter).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(chapter).not.toContain('<script>alert(1)</script>');
  });

  it('uses the selected title preset and numbering', async () => {
    const { zip } = await makeEpub(
      cloneOptions({ title: { ...DEFAULT_OPTIONS.title, numbering: 'arabic', divider: 'ornament' } }),
    );
    const first = (await zip.file('OEBPS/text/chapter-0001.xhtml')!.async('string')) ?? '';
    expect(first).toContain('chapter-number');
    expect(first).toContain('第1章');
    expect(first).toContain('❖');
    const ncx = (await zip.file('OEBPS/toc.ncx')!.async('string')) ?? '';
    expect(ncx).toContain('第1章 初入江湖');
  });

  it('rejects an empty chapter list', async () => {
    await expect(
      buildEpubBytes([], { title: '空', author: '', language: 'zh-CN' }, cloneOptions(), {
        identifier: 'urn:uuid:test',
        modified: '2026-11-03T12:00:00Z',
      }),
    ).rejects.toThrow();
  });
});
