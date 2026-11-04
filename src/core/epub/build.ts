import JSZip from 'jszip';
import { coverExtension } from '../cover';
import { renderChapterDocument, renderCss } from '../rendering';
import type { Chapter, EpubMeta, Options } from '../types';
import {
  buildContainerXml,
  buildCoverXhtml,
  buildNavXhtml,
  buildNcx,
  buildOpf,
  type EpubChapterRef,
  type EpubCoverRef,
} from './templates';

export interface EpubBuildSettings {
  identifier?: string;
  modified?: string;
  onProgress?: (percent: number) => void;
}

interface ChapterFileRef extends EpubChapterRef {
  fileName: string;
}

export function createIdentifier(): string {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return `urn:uuid:${uuid}`;
}

export function createModifiedTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function chapterFileRefs(chapters: Chapter[]): ChapterFileRef[] {
  return chapters.map((chapter, index) => {
    const fileName = `chapter-${String(index + 1).padStart(4, '0')}.xhtml`;
    return {
      id: `chap-${index + 1}`,
      href: `text/${fileName}`,
      fileName,
      title: chapter.title.toc || `第${index + 1}章`,
    };
  });
}

/**
 * Build an EPUB 3 archive with an NCX fallback. The `mimetype` entry is added
 * first and stored without compression, as required by the OCF spec.
 */
export async function buildEpubBytes(
  chapters: Chapter[],
  meta: EpubMeta,
  options: Options,
  settings: EpubBuildSettings = {},
): Promise<Uint8Array> {
  if (chapters.length === 0) {
    throw new Error('没有可导出的章节。');
  }

  const identifier = settings.identifier ?? createIdentifier();
  const modified = settings.modified ?? createModifiedTimestamp();
  const safeMeta: EpubMeta = {
    ...meta,
    title: meta.title.trim() || '未命名书籍',
    author: meta.author.trim(),
    language: meta.language,
  };
  const refs = chapterFileRefs(chapters);
  const cover: EpubCoverRef | undefined = safeMeta.cover
    ? {
        pageHref: 'text/cover.xhtml',
        imageHref: `images/cover.${coverExtension(safeMeta.cover.mimeType)}`,
        mediaType: safeMeta.cover.mimeType,
      }
    : undefined;

  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', buildContainerXml());
  zip.file('OEBPS/content.opf', buildOpf(safeMeta, identifier, modified, refs, cover));
  zip.file('OEBPS/nav.xhtml', buildNavXhtml(safeMeta, refs));
  zip.file('OEBPS/toc.ncx', buildNcx(safeMeta, identifier, refs));
  zip.file('OEBPS/css/style.css', renderCss(options));

  if (cover && safeMeta.cover) {
    zip.file(`OEBPS/${cover.imageHref}`, safeMeta.cover.bytes);
    zip.file(
      `OEBPS/${cover.pageHref}`,
      buildCoverXhtml(safeMeta, `../${cover.imageHref}`, '../css/style.css'),
    );
  }

  chapters.forEach((chapter, index) => {
    const ref = refs[index];
    zip.file(
      `OEBPS/${ref.href}`,
      renderChapterDocument(chapter, options, safeMeta, '../css/style.css'),
    );
  });

  return zip.generateAsync(
    {
      type: 'uint8array',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      streamFiles: false,
    },
    (metadata) => settings.onProgress?.(metadata.percent),
  );
}
