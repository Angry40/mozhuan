import { escapeXml } from './epub/escape';
import { fontDataUri, fontFamilyStack, renderFontFaces, type FontResolver } from './fonts';
import { illustrationDataUri } from './illustrations';
import type { Chapter, ChapterIllustration, EpubFont, EpubMeta, Illustration, Options } from './types';

export type ImageResolver = (illustration: Illustration) => string;

function cssNumber(value: number, min: number, max: number): string {
  const clamped = Math.min(max, Math.max(min, value));
  return String(Number(clamped.toFixed(2)));
}

export function renderCss(options: Options, fontFaces?: string, familyStack?: string[]): string {
  const indent = options.indent.enabled ? cssNumber(options.indent.em, 0, 4) : '0';
  const gap = options.paragraphGap.enabled ? cssNumber(options.paragraphGap.em, 0, 2) : '0';

  const embedStack = familyStack?.length ? familyStack : [];
  // 正文：Noto Serif 优先；标题：宋体（Songti SC）优先，与旧版保持一致，
  // 否则标题美化会因字体与正文同化而看起来“失效”。
  const bodySerifStack = [...embedStack, '"Noto Serif CJK SC"', '"Source Han Serif SC"', '"Songti SC"', 'SimSun', 'serif'];
  const titleSerifStack = [...embedStack, '"Songti SC"', '"Noto Serif CJK SC"', '"Source Han Serif SC"', 'SimSun', 'serif'];
  const sansStack = [...embedStack, '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif'];

  const faces = fontFaces ? `\n${fontFaces}\n` : '';

  return `${faces}html {
  -webkit-text-size-adjust: 100%;
}
body {
  margin: 0;
  padding: 0;
  color: #221b16;
  font-family: ${bodySerifStack.join(', ')};
  font-size: 1em;
  line-height: 1.75;
  text-align: justify;
  overflow-wrap: break-word;
}
.chapter {
  padding: 0;
}
body.cover-body {
  margin: 0;
  padding: 0;
  text-align: center;
}
.cover-page {
  margin: 0;
  padding: 0;
}
.cover-page img {
  max-width: 100%;
  height: auto;
}
p.body {
  margin: 0;
  text-indent: ${indent}em;
}
p.body + p.body {
  margin-top: ${gap}em;
}
figure.illustration {
  margin: 1.4em 0;
  text-align: center;
  text-indent: 0;
}
figure.illustration img {
  max-width: 100%;
  height: auto;
}
figure.illustration-header {
  margin: 0 0 1.6em;
  text-align: center;
  text-indent: 0;
}
figure.illustration-header img {
  max-width: 100%;
  height: auto;
}
.chapter-head {
  margin: 0 0 1.7em;
  text-align: center;
}
.chapter-number {
  margin: 0 0 .65em;
  color: #9a715b;
  font-family: ${sansStack.join(', ')};
  font-size: .82em;
  font-weight: 500;
  letter-spacing: .28em;
  text-indent: 0;
}
.chapter-title {
  margin: 0;
  font-family: ${titleSerifStack.join(', ')};
  font-size: 1.68em;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: .02em;
  text-indent: 0;
}
.chapter-rule {
  width: 3em;
  height: 0;
  margin: 1.1em auto 0;
  border-top: 1px solid #d8c8b8;
}
.chapter-rule.ornament {
  width: auto;
  height: auto;
  border: 0;
  color: #b0553f;
  font-size: .85em;
  line-height: 1;
  letter-spacing: .4em;
}
.chapter-head.preset-plain {
  text-align: center;
}
.chapter-head.preset-classic .chapter-title {
  font-size: 1.5em;
}
.chapter-head.preset-elegant .chapter-title {
  font-size: 1.8em;
}
.chapter-head.preset-elegant .chapter-number {
  letter-spacing: .34em;
}
.chapter-head.preset-modern {
  border-left: 3px solid #a43f2c;
  padding-left: .9em;
  text-align: left;
}
.chapter-head.preset-modern .chapter-number {
  letter-spacing: .2em;
}
.chapter-head.preset-modern .chapter-rule {
  margin-left: 0;
}
.chapter-head.preset-inline .chapter-title {
  font-size: 1.55em;
  line-height: 1.6;
  letter-spacing: .03em;
}
.chapter-head.preset-inline .inline-marker {
  display: inline-block;
  margin-right: .3em;
  padding: .12em .4em;
  border: 1px solid rgba(164, 63, 44, .55);
  border-radius: 2px;
  color: #a43f2c;
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: .5em;
  font-weight: 600;
  letter-spacing: .12em;
  line-height: 1.35;
  vertical-align: .18em;
}
.chapter-head.preset-inline .inline-title {
  letter-spacing: .04em;
}
.chapter-head.preset-inline .chapter-rule {
  width: 2.4em;
  margin-top: 1em;
}
.chapter.is-volume .chapter-head {
  margin-top: .5em;
}
.chapter.is-volume .chapter-title {
  font-size: 1.3em;
  letter-spacing: .12em;
}
`.trim();
}

function renderDivider(options: Options): string {
  if (!options.title.enabled || options.title.divider === 'none') return '';
  if (options.title.divider === 'ornament') {
    return '\n    <div class="chapter-rule ornament" aria-hidden="true">❖</div>';
  }
  return '\n    <div class="chapter-rule" aria-hidden="true"></div>';
}

export function renderChapterContent(
  chapter: Chapter,
  options: Options,
  resolveImage?: ImageResolver,
): string {
  const enabled = options.title.enabled;
  const preset = enabled ? options.title.preset : 'plain';
  const { title } = chapter;
  const isInline =
    enabled && preset === 'inline' && Boolean(title.marker) && Boolean(title.subtitle);
  const canSplit =
    enabled &&
    preset !== 'plain' &&
    preset !== 'inline' &&
    Boolean(title.marker) &&
    Boolean(title.subtitle);
  const kicker = canSplit ? title.marker : '';
  const heading = canSplit ? title.subtitle : title.full;
  const volumeClass = chapter.kind === 'volume' ? ' is-volume' : '';

  const parts: string[] = [`<section class="chapter${volumeClass}">`];

  const headerImages: ChapterIllustration[] = [];
  const bodyImages: ChapterIllustration[] = [];
  for (const item of chapter.illustrations ?? []) {
    if (item.header) headerImages.push(item);
    else bodyImages.push(item);
  }

  // 章节头图（带 logo 属性、位于正文之前）渲染在章节标题之前。
  for (const item of headerImages) {
    const src = resolveImage
      ? resolveImage(item.illustration)
      : illustrationDataUri(item.illustration);
    const alt = item.illustration.alt ?? '';
    parts.push(
      `  <figure class="illustration illustration-header"><img src="${escapeXml(src)}" alt="${escapeXml(alt)}"/></figure>`,
    );
  }

  parts.push(`  <header class="chapter-head preset-${preset}">`);
  if (isInline) {
    parts.push(
      `    <h1 class="chapter-title"><span class="inline-marker">${escapeXml(
        title.marker,
      )}</span> <span class="inline-title">${escapeXml(title.subtitle)}</span></h1>`,
    );
  } else {
    if (kicker) {
      parts.push(`    <p class="chapter-number">${escapeXml(kicker)}</p>`);
    }
    parts.push(`    <h1 class="chapter-title">${escapeXml(heading || '未命名章节')}</h1>`);
  }
  const divider = renderDivider(options);
  if (divider) parts.push(divider.trimStart());
  parts.push('  </header>');

  const imagesByAnchor = new Map<number, ChapterIllustration[]>();
  for (const item of bodyImages) {
    const list = imagesByAnchor.get(item.afterParagraph);
    if (list) list.push(item);
    else imagesByAnchor.set(item.afterParagraph, [item]);
  }

  const renderImagesAt = (anchor: number) => {
    const list = imagesByAnchor.get(anchor);
    if (!list) return;
    for (const item of list) {
      const src = resolveImage
        ? resolveImage(item.illustration)
        : illustrationDataUri(item.illustration);
      const alt = item.illustration.alt ?? '';
      parts.push(
        `  <figure class="illustration"><img src="${escapeXml(src)}" alt="${escapeXml(alt)}"/></figure>`,
      );
    }
  };

  // Anchor -1 means the picture sits right after the heading.
  renderImagesAt(-1);
  chapter.paragraphs.forEach((paragraph, index) => {
    const html = escapeXml(paragraph).replace(/\n/g, '<br/>');
    parts.push(`  <p class="body">${html}</p>`);
    renderImagesAt(index);
  });

  // Guard against anchors left dangling by a manual paragraph edit: never drop
  // a picture just because its position no longer exists.
  for (const anchor of imagesByAnchor.keys()) {
    if (anchor >= chapter.paragraphs.length) renderImagesAt(anchor);
  }

  parts.push('</section>');
  return parts.join('\n');
}

function langAttributes(meta: EpubMeta): string {
  return `xml:lang="${meta.language}" lang="${meta.language}"`;
}

function cssForFonts(
  fonts: EpubFont[] | undefined,
  srcFor: FontResolver,
): { fontFaces: string; familyStack: string[] } {
  if (!fonts || fonts.length === 0) return { fontFaces: '', familyStack: [] };
  const fontFaces = renderFontFaces(fonts, srcFor);
  return { fontFaces, familyStack: fontFamilyStack(fonts) };
}

export function renderChapterDocument(
  chapter: Chapter,
  options: Options,
  meta: EpubMeta,
  cssHref: string | null,
  resolveImage?: ImageResolver,
  fonts?: EpubFont[],
  fontSrcFor?: FontResolver,
): string {
  const { fontFaces, familyStack } = cssForFonts(fonts, fontSrcFor ?? (() => ''));
  const css = cssHref
    ? `<link rel="stylesheet" type="text/css" href="${escapeXml(cssHref)}"/>`
    : `<style>\n${renderCss(options, fontFaces, familyStack)}\n</style>`;
  const docTitle = escapeXml(chapter.title.toc || meta.title);

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" ${langAttributes(meta)}>
<head>
  <meta charset="utf-8"/>
  <title>${docTitle}</title>
  ${css}
</head>
<body>
${renderChapterContent(chapter, options, resolveImage)}
</body>
</html>
`;
}

export function renderPreviewDocument(
  chapter: Chapter,
  options: Options,
  meta: EpubMeta,
  fonts?: EpubFont[],
): string {
  const { fontFaces, familyStack } = cssForFonts(fonts, (font) => fontDataUri(font));
  const previewCss = `${renderCss(options, fontFaces, familyStack)}
html { background: #fffdf8; }
body {
  max-width: 720px;
  margin: 0 auto;
  padding: 30px 34px;
  box-sizing: border-box;
}
@media (max-width: 600px) {
  body { padding: 22px 20px; }
}
`;
  const docTitle = escapeXml(chapter.title.toc || meta.title);

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" ${langAttributes(meta)}>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${docTitle}</title>
  <style>
${previewCss}
  </style>
</head>
<body>
${renderChapterContent(chapter, options)}
</body>
</html>`;
}
