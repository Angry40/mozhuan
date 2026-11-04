import JSZip, { type JSZipObject } from 'jszip';
import {
  DOMParser,
  type Document as XmlDocument,
  type Element as XmlElement,
  type Node as XmlNode,
} from '@xmldom/xmldom';
import { sniffCoverMime } from '../cover';
import { parseHeading } from '../titles';
import type {
  BookLanguage,
  CoverImage,
  EpubChapter,
  EpubChapterKind,
  EpubManifestItem,
  EpubMetadata,
  EpubNavigation,
  EpubSource,
  ParseWarning,
} from '../types';

export class EpubImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EpubImportError';
  }
}

type NavigationSource = EpubSource['navigationSource'];

const HTML_ENTITIES: Record<string, string> = {
  nbsp: '160',
  mdash: '8212',
  ndash: '8211',
  hellip: '8230',
  ldquo: '8220',
  rdquo: '8221',
  lsquo: '8216',
  rsquo: '8217',
  middot: '183',
  copy: '169',
  reg: '174',
  trade: '8482',
};

const SKIP_TAGS = new Set(['script', 'style', 'nav', 'svg', 'math', 'template', 'head']);
const BLOCK_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'pre',
  'dd',
  'dt',
  'figcaption',
  'td',
  'th',
]);
const IMAGE_GROUP_CLASS = /(?:chapter[-_]?head|cover|illustration|figure|caption|image)/i;
const CONTAINER_TAGS = new Set([
  'body',
  'div',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'aside',
  'figure',
  'ul',
  'ol',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'dl',
]);

function localName(element: XmlElement): string {
  return (element.localName || element.nodeName.split(':').pop() || '').toLowerCase();
}

function getAttribute(element: XmlElement | null, name: string): string {
  return element?.getAttribute(name)?.trim() ?? '';
}

function getEpubType(element: XmlElement): string {
  return (
    element.getAttribute('epub:type') ||
    element.getAttributeNS?.('http://www.idpf.org/2007/ops', 'type') ||
    ''
  ).toLowerCase();
}

function allElements(root: XmlDocument | XmlElement): XmlElement[] {
  const elements: XmlElement[] = [];
  const list = root.getElementsByTagName('*');
  for (let index = 0; index < list.length; index += 1) {
    elements.push(list[index] as XmlElement);
  }
  return elements;
}

function byLocalName(root: XmlDocument | XmlElement, name: string): XmlElement[] {
  const lower = name.toLowerCase();
  return allElements(root).filter((element) => localName(element) === lower);
}

function firstByLocalName(root: XmlDocument | XmlElement, name: string): XmlElement | null {
  return byLocalName(root, name)[0] ?? null;
}

function textOf(element: XmlElement | null): string {
  return normalizeText(element?.textContent ?? '');
}

function readableText(node: XmlNode | null): string {
  if (!node) return '';
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (node.nodeType !== 1 && node.nodeType !== 9) return '';
  const element = node as XmlElement;
  if (localName(element) === 'br') return ' ';
  let text = '';
  for (let index = 0; index < element.childNodes.length; index += 1) {
    text += readableText(element.childNodes[index]);
  }
  return text;
}

function normalizeText(value: string): string {
  return value.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeEntities(xml: string): string {
  return xml.replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (match, name: string) => {
    const code = HTML_ENTITIES[name.toLowerCase()];
    return code ? `&#${code};` : match;
  });
}

function parseXml(xml: string): XmlDocument {
  try {
    const document = new DOMParser({
      onError: () => {
        // XHTML from the wild occasionally contains non-fatal entity/lint
        // errors. We keep parsing and fail only if there is no document.
      },
    }).parseFromString(sanitizeEntities(xml), 'application/xml');
    if (!document?.documentElement) {
      throw new Error('文档没有根节点');
    }
    return document;
  } catch (error) {
    throw new EpubImportError(
      `EPUB 内的 XHTML 无法解析：${error instanceof Error ? error.message : '未知错误'}`,
    );
  }
}

function decodeXml(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function normalizeZipPath(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep the original path when it contains a stray percent sign.
  }
  const withoutFragment = decoded.split('#')[0].split('?')[0].replace(/\\/g, '/');
  const parts: string[] = [];
  for (const part of withoutFragment.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function dirName(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function resolveHref(baseFile: string, href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) return null;
  if (trimmed.startsWith('#')) return normalizeZipPath(baseFile);
  return normalizeZipPath(`${dirName(baseFile)}/${trimmed}`);
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

function normalizeLanguage(value: string): BookLanguage {
  const language = value.trim().toLowerCase();
  if (language.startsWith('zh')) {
    if (language.includes('tw') || language.includes('hk') || language.includes('mo') || language.includes('hant')) {
      return 'zh-TW';
    }
    return 'zh-CN';
  }
  if (language.startsWith('en')) return 'en';
  return 'zh-CN';
}

function splitProperties(value: string | undefined): string[] {
  return (value ?? '').split(/\s+/).filter(Boolean);
}

function findEntry(zip: JSZip, path: string): JSZipObject | null {
  const normalized = normalizeZipPath(path);
  const direct = zip.files[normalized];
  if (direct) return direct;
  const lower = normalized.toLowerCase();
  for (const [name, entry] of Object.entries(zip.files)) {
    if (name.toLowerCase() === lower) return entry;
  }
  return null;
}

async function readEntryBytes(zip: JSZip, path: string): Promise<Uint8Array | null> {
  const entry = findEntry(zip, path);
  if (!entry || entry.dir) return null;
  return entry.async('uint8array');
}

async function readEntryText(zip: JSZip, path: string): Promise<string | null> {
  const bytes = await readEntryBytes(zip, path);
  return bytes ? decodeXml(bytes) : null;
}

interface OpfData {
  path: string;
  document: XmlDocument;
  metadata: EpubMetadata;
  manifest: EpubManifestItem[];
  spine: EpubManifestItem[];
  spineTocId: string;
}

function parseMetadata(document: XmlDocument): EpubMetadata {
  const metadataRoot = firstByLocalName(document, 'metadata') ?? document.documentElement!;
  const title = textOf(firstByLocalName(metadataRoot, 'title'));
  const author = textOf(firstByLocalName(metadataRoot, 'creator'));
  const language = normalizeLanguage(textOf(firstByLocalName(metadataRoot, 'language')));
  const identifier = textOf(firstByLocalName(metadataRoot, 'identifier'));
  const modifiedElement = byLocalName(metadataRoot, 'meta').find(
    (element) => getAttribute(element, 'property') === 'dcterms:modified',
  );
  const modified = textOf(modifiedElement ?? null);

  return { title, author, language, identifier, modified };
}

async function readOpf(zip: JSZip, warnings: ParseWarning[]): Promise<OpfData> {
  let opfPath = '';
  const containerText = await readEntryText(zip, 'META-INF/container.xml');
  if (containerText) {
    try {
      const container = parseXml(containerText);
      const rootFile = firstByLocalName(container, 'rootfile');
      opfPath = getAttribute(rootFile ?? null, 'full-path');
    } catch {
      warnings.push({
        code: 'epub-import',
        message: 'container.xml 解析失败，正在尝试自动查找 content.opf。',
      });
    }
  } else {
    warnings.push({
      code: 'epub-import',
      message: 'EPUB 缺少 META-INF/container.xml，正在尝试自动查找 content.opf。',
    });
  }

  if (!opfPath) {
    const opfEntry = Object.keys(zip.files).find((name) => /\.opf$/i.test(name));
    opfPath = opfEntry ?? '';
  }
  if (!opfPath) {
    throw new EpubImportError('这不是一个有效的 EPUB：找不到 content.opf。');
  }

  const normalizedPath = normalizeZipPath(opfPath);
  const opfText = await readEntryText(zip, normalizedPath);
  if (!opfText) {
    throw new EpubImportError('EPUB 的 content.opf 无法读取。');
  }

  const document = parseXml(opfText);
  const metadata = parseMetadata(document);
  const manifestRoot = firstByLocalName(document, 'manifest');
  const manifest = byLocalName(manifestRoot ?? document, 'item')
    .map((element, index): EpubManifestItem | null => {
      const href = getAttribute(element, 'href');
      if (!href) return null;
      const resolved = resolveHref(normalizedPath, href);
      if (!resolved) return null;
      return {
        id: getAttribute(element, 'id') || `item-${index + 1}`,
        href: resolved,
        mediaType: getAttribute(element, 'media-type') || undefined,
        properties: getAttribute(element, 'properties') || undefined,
      };
    })
    .filter((item): item is EpubManifestItem => item !== null);

  const manifestById = new Map(manifest.map((item) => [item.id, item]));
  const spineRoot = firstByLocalName(document, 'spine');
  const spineTocId = getAttribute(spineRoot ?? null, 'toc');
  const spine = byLocalName(spineRoot ?? document, 'itemref')
    .map((element) => manifestById.get(getAttribute(element, 'idref')))
    .filter((item): item is EpubManifestItem => item !== undefined);

  return { path: normalizedPath, document, metadata, manifest, spine, spineTocId };
}

function parseNav(zip: JSZip, navItem: EpubManifestItem): Promise<EpubNavigation[]> {
  return (async () => {
    const text = await readEntryText(zip, navItem.href);
    if (!text) return [];
    const document = parseXml(text);
    const navElements = byLocalName(document, 'nav');
    const toc =
      navElements.find((element) => getEpubType(element).includes('toc')) ?? navElements[0] ?? null;
    if (!toc) return [];

    const items: EpubNavigation[] = [];
    for (const anchor of byLocalName(toc, 'a')) {
      const href = getAttribute(anchor, 'href');
      const title = normalizeText(readableText(anchor));
      const resolved = resolveHref(navItem.href, href);
      if (!resolved || !title) continue;
      items.push({
        id: `nav-${items.length + 1}`,
        title,
        href: resolved,
      });
    }
    return items;
  })();
}

function parseNcx(zip: JSZip, ncxItem: EpubManifestItem | undefined): Promise<EpubNavigation[]> {
  if (!ncxItem) return Promise.resolve([]);
  return (async () => {
    const text = await readEntryText(zip, ncxItem.href);
    if (!text) return [];
    const document = parseXml(text);
    const items: EpubNavigation[] = [];
    for (const point of byLocalName(document, 'navPoint')) {
      const labelElement = firstByLocalName(point, 'text');
      const contentElement = firstByLocalName(point, 'content');
      const title = normalizeText(readableText(labelElement));
      const src = getAttribute(contentElement ?? null, 'src');
      const resolved = resolveHref(ncxItem.href, src);
      if (!resolved || !title) continue;
      items.push({ id: `ncx-${items.length + 1}`, title, href: resolved });
    }
    return items;
  })();
}

function parseNavigation(
  zip: JSZip,
  opf: OpfData,
): Promise<{ items: EpubNavigation[]; source: NavigationSource }> {
  const navItem = opf.manifest.find((item) =>
    splitProperties(item.properties).includes('nav'),
  );
  if (navItem) {
    return parseNav(zip, navItem).then(async (items) => {
      if (items.length > 0) return { items, source: 'nav' as const };
      const ncxItem = opf.manifest.find(
        (item) => item.mediaType === 'application/x-dtbncx+xml' || item.id === opf.spineTocId,
      );
      const ncx = await parseNcx(zip, ncxItem);
      return { items: ncx, source: ncx.length > 0 ? ('ncx' as const) : ('spine' as const) };
    });
  }

  const ncxItem = opf.manifest.find(
    (item) => item.mediaType === 'application/x-dtbncx+xml' || item.id === opf.spineTocId,
  );
  return parseNcx(zip, ncxItem).then((items) => ({
    items,
    source: items.length > 0 ? ('ncx' as const) : ('spine' as const),
  }));
}

function findTitleElement(
  body: XmlElement,
): { heading: XmlElement | null; header: XmlElement | null; title: string } {
  const header = firstByLocalName(body, 'header');
  const headings = allElements(body).filter((element) =>
    /^h[1-3]$/.test(localName(element)),
  );
  const heading = headings[0] ?? null;
  const title = heading ? normalizeText(readableText(heading)) : '';
  return { heading, header, title };
}

function countImages(element: XmlElement): number {
  return byLocalName(element, 'img').length + byLocalName(element, 'image').length;
}

function isImageGroup(element: XmlElement): boolean {
  if (countImages(element) === 0) return false;
  const name = localName(element);
  if (name === 'figure') return true;
  const className = getAttribute(element, 'class');
  return Boolean(className) && IMAGE_GROUP_CLASS.test(className);
}

function extractParagraphs(
  node: XmlNode,
  paragraphs: string[],
  skipElements: Set<XmlElement>,
  state: { images: number; buffer: string },
): void {
  if (node.nodeType === 3) {
    state.buffer += node.nodeValue ?? '';
    return;
  }
  if (node.nodeType !== 1) return;

  const element = node as XmlElement;
  if (skipElements.has(element)) return;

  const name = localName(element);
  if (SKIP_TAGS.has(name)) return;

  const flush = () => {
    const text = normalizeText(state.buffer);
    if (text) paragraphs.push(text);
    state.buffer = '';
  };

  // Text living in the same container as an illustration is usually a caption
  // or an OCR fallback for the image. Drop it together with the image.
  if (isImageGroup(element)) {
    flush();
    state.images += countImages(element);
    return;
  }

  if (name === 'img' || name === 'image') {
    state.images += 1;
    return;
  }
  if (name === 'br') {
    state.buffer += '\n';
    return;
  }

  if (BLOCK_TAGS.has(name)) {
    flush();
    const text = normalizeText(readableText(element));
    if (text) paragraphs.push(text);
    state.images += countImages(element);
    return;
  }

  for (let index = 0; index < element.childNodes.length; index += 1) {
    extractParagraphs(element.childNodes[index], paragraphs, skipElements, state);
  }
  if (CONTAINER_TAGS.has(name)) flush();
}

function extractChapter(
  document: XmlDocument,
  navTitle: string,
  fallbackTitle: string,
): { title: string; paragraphs: string[]; images: number } {
  const body = firstByLocalName(document, 'body') ?? document.documentElement!;
  const { header, heading } = findTitleElement(body);
  const skipElements = new Set<XmlElement>();
  if (header) {
    skipElements.add(header);
  } else if (heading) {
    skipElements.add(heading);
  }

  const paragraphs: string[] = [];
  const state = { images: 0, buffer: '' };
  extractParagraphs(body, paragraphs, skipElements, state);
  if (state.buffer.trim()) {
    const text = normalizeText(state.buffer);
    if (text) paragraphs.push(text);
  }

  const headingTitle = heading ? normalizeText(readableText(heading)) : '';
  const documentTitle = textOf(firstByLocalName(document, 'title'));
  const title = navTitle || headingTitle || documentTitle || fallbackTitle;
  return { title, paragraphs, images: state.images };
}

async function extractCover(
  zip: JSZip,
  opf: OpfData,
  warnings: ParseWarning[],
): Promise<CoverImage | null> {
  let imagePath = '';
  const coverItem = opf.manifest.find((item) =>
    splitProperties(item.properties).includes('cover-image'),
  );
  if (coverItem) imagePath = coverItem.href;

  if (!imagePath) {
    const metaCover = byLocalName(opf.document, 'meta').find(
      (element) => getAttribute(element, 'name') === 'cover',
    );
    const coverId = getAttribute(metaCover ?? null, 'content');
    const item = opf.manifest.find((candidate) => candidate.id === coverId);
    if (item) imagePath = item.href;
  }

  if (!imagePath) {
    const guideRef = byLocalName(opf.document, 'reference').find(
      (element) => getAttribute(element, 'type') === 'cover',
    );
    if (guideRef) {
      const resolved = resolveHref(opf.path, getAttribute(guideRef, 'href'));
      const guideItem = opf.manifest.find((item) => item.href === resolved);
      if (guideItem?.mediaType?.startsWith('image/')) {
        imagePath = guideItem.href;
      } else if (resolved) {
        const pageText = await readEntryText(zip, resolved);
        if (pageText) {
          try {
            const page = parseXml(pageText);
            const image = firstByLocalName(page, 'img');
            const src = getAttribute(image ?? null, 'src');
            const pageImage = resolveHref(resolved, src);
            if (pageImage) imagePath = pageImage;
          } catch {
            // Ignore malformed cover pages and try the filename heuristic.
          }
        }
      }
    }
  }

  if (!imagePath) {
    const candidate = opf.manifest.find(
      (item) =>
        item.mediaType?.startsWith('image/') &&
        /^cover\.(?:jpe?g|png|gif)$/i.test(baseName(item.href)),
    );
    if (candidate) imagePath = candidate.href;
  }

  if (!imagePath) return null;

  const bytes = await readEntryBytes(zip, imagePath);
  if (!bytes) {
    warnings.push({ code: 'epub-import', message: `封面文件无法读取：${baseName(imagePath)}` });
    return null;
  }
  const mimeType = sniffCoverMime(bytes);
  if (!mimeType) {
    warnings.push({
      code: 'epub-import',
      message: `封面 ${baseName(imagePath)} 不是 JPG / PNG / GIF，已跳过。`,
    });
    return null;
  }

  return { bytes, mimeType, fileName: baseName(imagePath) };
}

function chapterKind(title: string, fallback: EpubChapterKind): EpubChapterKind {
  const parts = parseHeading(title);
  if (!parts) return fallback;
  if (parts.kind === 'volume') return 'volume';
  if (parts.special) return 'special';
  return 'chapter';
}

/**
 * Parse an EPUB into raw chapters. The output is independent of the user's
 * formatting options; callers apply title/image/paragraph options later.
 */
export async function parseEpub(buffer: ArrayBuffer, fileName: string): Promise<EpubSource> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new EpubImportError('无法读取 EPUB 文件，文件可能已损坏或不是有效的 EPUB。');
  }

  const warnings: ParseWarning[] = [];
  const mimetype = await readEntryText(zip, 'mimetype');
  if (!mimetype) {
    warnings.push({ code: 'epub-import', message: 'EPUB 缺少 mimetype 文件。' });
  } else if (mimetype.trim() !== 'application/epub+zip') {
    warnings.push({ code: 'epub-import', message: 'EPUB 的 mimetype 不是 application/epub+zip。' });
  }

  const opf = await readOpf(zip, warnings);
  let navigation: { items: EpubNavigation[]; source: NavigationSource };
  try {
    navigation = await parseNavigation(zip, opf);
  } catch (error) {
    warnings.push({
      code: 'epub-import',
      message: `EPUB 目录解析失败，已按 spine 顺序读取：${
        error instanceof Error ? error.message : '未知错误'
      }`,
    });
    navigation = { items: [], source: 'spine' };
  }
  const cover = await extractCover(zip, opf, warnings);
  const navItemPaths = new Set(
    opf.manifest
      .filter((item) => splitProperties(item.properties).includes('nav'))
      .map((item) => item.href),
  );

  const navTitleMap = new Map<string, string>();
  for (const item of navigation.items) {
    if (!navTitleMap.has(item.href)) navTitleMap.set(item.href, item.title);
  }

  let documents = opf.spine.filter(
    (item) =>
      (item.mediaType === 'application/xhtml+xml' || /\.x?html?$/i.test(item.href)) &&
      !navItemPaths.has(item.href),
  );
  let usedFallback = false;

  if (documents.length === 0) {
    const navPaths = Array.from(new Set(navigation.items.map((item) => item.href)));
    documents = navPaths
      .map((href) => opf.manifest.find((item) => item.href === href))
      .filter(
        (item): item is EpubManifestItem =>
          item !== undefined &&
          (item.mediaType === 'application/xhtml+xml' || /\.x?html?$/i.test(item.href)),
      );
    usedFallback = true;
  }
  if (documents.length === 0) {
    documents = opf.manifest.filter(
      (item) =>
        (item.mediaType === 'application/xhtml+xml' || /\.x?html?$/i.test(item.href)) &&
        !navItemPaths.has(item.href),
    );
    usedFallback = true;
  }

  const seen = new Set<string>();
  const chapters: EpubChapter[] = [];
  for (const documentItem of documents) {
    if (seen.has(documentItem.href)) continue;
    seen.add(documentItem.href);

    const content = await readEntryText(zip, documentItem.href);
    if (!content) {
      warnings.push({
        code: 'epub-import',
        message: `章节文件无法读取，已跳过：${baseName(documentItem.href)}`,
      });
      continue;
    }

    let document: XmlDocument;
    let extracted: { title: string; paragraphs: string[]; images: number };
    try {
      document = parseXml(content);
      const navTitle = navTitleMap.get(documentItem.href) ?? '';
      extracted = extractChapter(document, navTitle, baseName(documentItem.href));
    } catch (error) {
      warnings.push({
        code: 'epub-import',
        message: `${baseName(documentItem.href)} 解析失败，已跳过：${
          error instanceof Error ? error.message : '未知错误'
        }`,
      });
      continue;
    }

    const normalizedTitle = extracted.title.trim();
    if (
      extracted.paragraphs.length === 0 &&
      /^(cover|封面|titlepage|title page|书名页)$/i.test(normalizedTitle)
    ) {
      continue;
    }
    if (!normalizedTitle) continue;

    chapters.push({
      id: chapters.length,
      href: documentItem.href,
      title: normalizedTitle,
      paragraphs: extracted.paragraphs,
      kind: chapterKind(normalizedTitle, 'chapter'),
      imageCount: extracted.images,
    });
  }

  if (chapters.length === 0) {
    throw new EpubImportError('EPUB 中没有找到可读取的章节内容。');
  }

  if (navigation.source !== 'nav') {
    warnings.push({
      code: 'epub-import',
      message:
        navigation.source === 'ncx'
          ? '未找到 nav.xhtml，已使用 toc.ncx 目录信息。'
          : usedFallback
            ? '未找到可用的目录，已按 spine / manifest 顺序读取章节。'
            : '未找到可用的导航目录，章节标题将使用正文标题。',
    });
  }

  const totalImages = chapters.reduce((sum, chapter) => sum + chapter.imageCount, 0);
  if (totalImages > 0) {
    warnings.push({
      code: 'epub-import',
      message: `检测到 ${totalImages} 张内联插图，当前版本会统一清理；封面会单独保留。`,
    });
  }

  const totalCharacters = chapters.reduce(
    (sum, chapter) => sum + chapter.paragraphs.join('').replace(/\s/g, '').length,
    0,
  );
  const totalParagraphs = chapters.reduce((sum, chapter) => sum + chapter.paragraphs.length, 0);

  return {
    mode: 'epub',
    fileName,
    buffer,
    metadata: {
      ...opf.metadata,
      title: opf.metadata.title || fileName.replace(/\.epub$/i, '') || '未命名书籍',
    },
    chapters,
    manifest: opf.manifest,
    navigation: navigation.items,
    navigationSource: navigation.source,
    cover,
    warnings,
    totalChapters: chapters.length,
    totalCharacters,
    totalParagraphs,
  };
}
