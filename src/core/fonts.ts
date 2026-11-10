import { toBase64 } from './illustrations';
import type { EpubFont, FontMimeType } from './types';

export const FONT_EXTENSIONS: Record<FontMimeType, string> = {
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
};

const FONT_FORMAT: Record<FontMimeType, string> = {
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'truetype',
  'font/otf': 'opentype',
};

/** 常见的字体 media-type 别名 → 归一化到 EPUB 3 核心字体类型。 */
const FONT_MEDIA_TYPES: Record<string, FontMimeType> = {
  'font/woff2': 'font/woff2',
  'font/woff': 'font/woff',
  'font/ttf': 'font/ttf',
  'font/otf': 'font/otf',
  'application/font-woff2': 'font/woff2',
  'application/font-woff': 'font/woff',
  'application/font-ttf': 'font/ttf',
  'application/font-otf': 'font/otf',
  'application/x-font-woff': 'font/woff',
  'application/x-font-ttf': 'font/ttf',
  'application/x-font-otf': 'font/otf',
  'application/x-font-truetype': 'font/ttf',
  'application/x-font-opentype': 'font/otf',
  'application/vnd.ms-opentype': 'font/otf',
  'application/x-truetype-font': 'font/ttf',
};

/** 把 manifest 里出现的任意字体 media-type 归一化；不是字体返回 null。 */
export function normalizeFontMediaType(mediaType: string | undefined): FontMimeType | null {
  if (!mediaType) return null;
  const lower = mediaType.trim().toLowerCase();
  return FONT_MEDIA_TYPES[lower] ?? null;
}

export function fontExtension(mimeType: FontMimeType): string {
  return FONT_EXTENSIONS[mimeType];
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

/** 用魔数二次校验（WOFF 头部 `wOFF` / `wOF2`，TrueType/OpenType 的 `0x00010000` 或 `OTTO`）。 */
export function sniffFontMime(bytes: Uint8Array, fallback: FontMimeType): FontMimeType | null {
  if (startsWith(bytes, [0x77, 0x4f, 0x46, 0x32])) return 'font/woff2';
  if (startsWith(bytes, [0x77, 0x4f, 0x46, 0x46])) return 'font/woff';
  if (startsWith(bytes, [0x00, 0x01, 0x00, 0x00])) return 'font/ttf';
  if (startsWith(bytes, [0x4f, 0x54, 0x54, 0x4f])) return 'font/otf';
  // 魔数不匹配时回退到 manifest 声明，但仅限已知字体类型。
  return normalizeFontMediaType(fallback);
}

/** 生成 CSS 安全的 family 名（嵌入字体可能没有可靠名称）。 */
export function fontFamily(font: EpubFont, index: number): string {
  const base = (font.fileName.replace(/\.[^.]+$/, '') || 'Embedded').trim();
  const safe = base.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'Embedded';
  return `Embedded-${index + 1}-${safe}`;
}

/** 嵌入字体 family 列表，前插到正文与标题的 font-family 栈最前。 */
export function fontFamilyStack(fonts: EpubFont[]): string[] {
  return fonts.map((font, index) => `"${fontFamily(font, index)}"`);
}

export type FontResolver = (font: EpubFont, index: number) => string;

/** 输出 `@font-face` 声明；`srcFor` 决定每个字体的 URL（导出=文件路径，预览=data URI）。 */
export function renderFontFaces(fonts: EpubFont[], srcFor: FontResolver): string {
  const faces: string[] = [];
  fonts.forEach((font, index) => {
    const src = srcFor(font, index);
    const format = FONT_FORMAT[font.mimeType];
    faces.push(
      `@font-face { font-family: "${fontFamily(font, index)}"; src: url("${src}") format("${format}"); }`,
    );
  });
  return faces.join('\n');
}

/** 预览用：把字体字节内联为 data URI。 */
export function fontDataUri(font: EpubFont): string {
  return `data:${font.mimeType};base64,${toBase64(font.bytes)}`;
}
