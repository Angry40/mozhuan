import { escapeXml } from './escape';
import type { EpubMeta } from '../types';

export interface EpubChapterRef {
  id: string;
  href: string;
  title: string;
}

export interface EpubCoverRef {
  pageHref: string;
  imageHref: string;
  mediaType: string;
}

export interface EpubImageRef {
  id: string;
  href: string;
  mediaType: string;
}

export interface EpubFontRef {
  id: string;
  href: string;
  mediaType: string;
}

export function buildContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}

export function buildOpf(
  meta: EpubMeta,
  identifier: string,
  modified: string,
  chapters: EpubChapterRef[],
  cover?: EpubCoverRef,
  images: EpubImageRef[] = [],
  fonts: EpubFontRef[] = [],
): string {
  const chapterItems = chapters
    .map(
      (chapter) =>
        `    <item id="${chapter.id}" href="${escapeXml(chapter.href)}" media-type="application/xhtml+xml"/>`,
    )
    .join('\n');
  const spineItems = chapters
    .map((chapter) => `    <itemref idref="${chapter.id}"/>`)
    .join('\n');
  const creator = meta.author.trim()
    ? `    <dc:creator>${escapeXml(meta.author.trim())}</dc:creator>\n`
    : '';
  const coverMeta = cover ? '    <meta name="cover" content="cover-image"/>\n' : '';
  const coverItems = cover
    ? `    <item id="cover-page" href="${escapeXml(cover.pageHref)}" media-type="application/xhtml+xml"/>
    <item id="cover-image" href="${escapeXml(cover.imageHref)}" media-type="${escapeXml(cover.mediaType)}" properties="cover-image"/>`
    : '';
  const coverSpine = cover ? '    <itemref idref="cover-page"/>\n' : '';
  const imageItems = images
    .map(
      (image) =>
        `    <item id="${escapeXml(image.id)}" href="${escapeXml(image.href)}" media-type="${escapeXml(image.mediaType)}"/>`,
    )
    .join('\n');
  const fontItems = fonts
    .map(
      (font) =>
        `    <item id="${escapeXml(font.id)}" href="${escapeXml(font.href)}" media-type="${escapeXml(font.mediaType)}"/>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${meta.language}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(meta.title)}</dc:title>
    <dc:language>${meta.language}</dc:language>
${creator}${coverMeta}    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="style" href="css/style.css" media-type="text/css"/>
${coverItems ? `${coverItems}\n` : ''}${imageItems ? `${imageItems}\n` : ''}${fontItems ? `${fontItems}\n` : ''}${chapterItems}
  </manifest>
  <spine toc="ncx">
${coverSpine}${spineItems}
  </spine>
</package>
`;
}

export function buildCoverXhtml(
  meta: EpubMeta,
  imageHref: string,
  cssHref: string,
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${meta.language}" lang="${meta.language}">
<head>
  <meta charset="utf-8"/>
  <title>封面</title>
  <link rel="stylesheet" type="text/css" href="${escapeXml(cssHref)}"/>
</head>
<body class="cover-body">
  <div class="cover-page"><img src="${escapeXml(imageHref)}" alt="封面"/></div>
</body>
</html>
`;
}

export function buildNavXhtml(meta: EpubMeta, chapters: EpubChapterRef[]): string {
  const items = chapters
    .map(
      (chapter) =>
        `        <li><a href="${escapeXml(chapter.href)}">${escapeXml(chapter.title)}</a></li>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${meta.language}" lang="${meta.language}">
<head>
  <meta charset="utf-8"/>
  <title>目录</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>
`;
}

export function buildNcx(meta: EpubMeta, identifier: string, chapters: EpubChapterRef[]): string {
  const navPoints = chapters
    .map(
      (chapter, index) => `    <navPoint id="np-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(chapter.title)}</text></navLabel>
      <content src="${escapeXml(chapter.href)}"/>
    </navPoint>`,
    )
    .join('\n');
  const author = meta.author.trim()
    ? `    <docAuthor><text>${escapeXml(meta.author.trim())}</text></docAuthor>\n`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${meta.language}">
  <head>
    <meta name="dtb:uid" content="${escapeXml(identifier)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(meta.title)}</text></docTitle>
${author}  <navMap>
${navPoints}
  </navMap>
</ncx>
`;
}
