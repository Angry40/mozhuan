export type SupportedEncoding = 'utf-8' | 'gb18030' | 'big5' | 'utf-16le' | 'utf-16be';

export interface DecodeResult {
  text: string;
  encoding: SupportedEncoding;
  hadBom: boolean;
  replacementCount: number;
}

export type HeadingKind = 'chapter' | 'volume' | 'special' | 'english';

export interface HeadingParts {
  raw: string;
  kind: HeadingKind;
  marker: string;
  unit: string;
  numberText: string;
  numberValue: number | null;
  subtitle: string;
  special: boolean;
}

export type RawChapterKind = 'chapter' | 'volume' | 'special' | 'preamble' | 'fallback';

export interface RawChapter {
  id: number;
  rawTitle: string;
  lines: string[];
  kind: RawChapterKind;
}

export type TitlePreset = 'plain' | 'classic' | 'elegant' | 'modern' | 'inline';
export type NumberFormat = 'keep' | 'arabic' | 'chinese';
export type DividerStyle = 'none' | 'line' | 'ornament';

export interface TitleOptions {
  enabled: boolean;
  preset: TitlePreset;
  numbering: NumberFormat;
  divider: DividerStyle;
  cleanNoise: boolean;
  autofillNumber: boolean;
}

export interface IndentOptions {
  enabled: boolean;
  em: number;
}

export interface ParagraphGapOptions {
  enabled: boolean;
  em: number;
}

export interface Options {
  removeImages: boolean;
  /**
   * 开启时额外清理只含零宽字符、盲文空白、`&nbsp;`、`<br>` 等不可见内容的
   * “假空行”；关闭后仍会丢弃普通空行，只是不再清理隐藏字符行。
   */
  filterBlankLines: boolean;
  /**
   * 字体精简：开启（默认）时不为导出结果嵌入字体，EPUB 源里的嵌入字体在
   * 重建时被移除；关闭时保留 EPUB 原字体整文件随书打包。TXT 无字体，仅影响 EPUB。
   */
  removeFonts: boolean;
  indent: IndentOptions;
  paragraphGap: ParagraphGapOptions;
  title: TitleOptions;
  fallbackSplit: 'single' | 'chunk';
}

export interface FormattedTitle {
  marker: string;
  subtitle: string;
  full: string;
  toc: string;
}

export type IllustrationMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/svg+xml';

/**
 * A single inline illustration kept from an imported EPUB. `key` is a content
 * hash so the same picture referenced by several chapters is stored once.
 */
export interface Illustration {
  key: string;
  mimeType: IllustrationMimeType;
  bytes: Uint8Array;
  alt: string;
}

export interface ChapterIllustration {
  illustration: Illustration;
  /**
   * Where the picture sits in the chapter body: `-1` means after the heading
   * and before the first paragraph, `N` means after the Nth paragraph.
   */
  afterParagraph: number;
  /**
   * 章节头图：正文之前第一张带 logo 属性的图片，关闭「清除插图」时渲染在
   * 章节标题之前，而不是按锚点放在正文里。
   */
  header?: boolean;
}

export interface Chapter {
  id: number;
  index: number;
  rawTitle: string;
  kind: RawChapterKind;
  title: FormattedTitle;
  paragraphs: string[];
  imagesRemoved: number;
  /** Empty when the image switch removed them or the source had no pictures. */
  illustrations: ChapterIllustration[];
}

export interface ChapterOverride {
  title?: string;
  paragraphs?: string[];
  /** 编辑器给出的最终有序插图列表（锚点已按保存时段落数 clamp）。 */
  illustrations?: ChapterIllustration[];
}

export interface ImageRemoval {
  chapterId: number;
  chapterTitle: string;
  kind: string;
  snippet: string;
}

export interface BookStats {
  chapters: number;
  characters: number;
  paragraphs: number;
  imagesRemoved: number;
  readingMinutes: number;
}

/** EPUB 可嵌入的字体格式（EPUB 3 核心媒体类型 + 常用回退格式）。 */
export type FontMimeType = 'font/woff2' | 'font/woff' | 'font/ttf' | 'font/otf';

export interface EpubFont {
  /** 内容哈希，同一字体被多章节引用时只存一份。 */
  key: string;
  fileName: string;
  mimeType: FontMimeType;
  bytes: Uint8Array;
}

export interface ParseWarning {
  code:
    | 'no-headings'
    | 'bare-headings'
    | 'empty-book'
    | 'empty-chapter'
    | 'encoding-fallback'
    | 'large-file'
    | 'epub-import';
  message: string;
}

export interface ParsedBook {
  chapters: Chapter[];
  stats: BookStats;
  warnings: ParseWarning[];
  imageRemovals: ImageRemoval[];
  /** EPUB 源里提取的嵌入字体；TXT 恒为空数组。按「字体精简」开关取舍。 */
  fonts: EpubFont[];
}

export type BookLanguage = 'zh-CN' | 'zh-TW' | 'en';

export type CoverMimeType = 'image/jpeg' | 'image/png' | 'image/gif';

export interface CoverImage {
  bytes: Uint8Array;
  mimeType: CoverMimeType;
  fileName: string;
}

export interface EpubMeta {
  title: string;
  author: string;
  language: BookLanguage;
  cover?: CoverImage;
  identifier?: string;
  modified?: string;
}

export type EpubSourceMode = 'txt' | 'epub';

export interface EpubManifestItem {
  id: string;
  href: string;
  mediaType?: string;
  properties?: string;
}

export interface EpubMetadata {
  title: string;
  author: string;
  language: BookLanguage;
  identifier: string;
  modified: string;
}

export interface EpubNavigation {
  id: string;
  title: string;
  href: string;
}

export type EpubChapterKind = 'chapter' | 'volume' | 'special';

export interface EpubChapter {
  id: number;
  href: string;
  title: string;
  paragraphs: string[];
  kind: EpubChapterKind;
  imageCount: number;
  /** Pictures already decoded from the archive, in reading order. */
  illustrations: ChapterIllustration[];
}

export interface EpubSource {
  mode: 'epub';
  fileName: string;
  buffer: ArrayBuffer;
  metadata: EpubMetadata;
  chapters: EpubChapter[];
  manifest: EpubManifestItem[];
  navigation: EpubNavigation[];
  navigationSource: 'nav' | 'ncx' | 'spine';
  cover: CoverImage | null;
  warnings: ParseWarning[];
  totalChapters: number;
  totalCharacters: number;
  totalParagraphs: number;
  /** 嵌入字体（按内容哈希去重），供「字体精简」开关取舍。 */
  fonts: EpubFont[];
}

export const DEFAULT_OPTIONS: Options = {
  removeImages: true,
  filterBlankLines: true,
  removeFonts: true,
  indent: { enabled: true, em: 2 },
  paragraphGap: { enabled: false, em: 0.6 },
  title: {
    enabled: true,
    preset: 'elegant',
    numbering: 'keep',
    divider: 'line',
    cleanNoise: true,
    autofillNumber: true,
  },
  fallbackSplit: 'single',
};

export const TITLE_PRESETS: { id: TitlePreset; name: string; hint: string }[] = [
  { id: 'plain', name: '纯净', hint: '单行居中，无装饰' },
  { id: 'classic', name: '经典', hint: '章号在上，细线收尾' },
  { id: 'elegant', name: '雅致', hint: '衬线大字，花饰留白' },
  { id: 'modern', name: '现代', hint: '左对齐，朱砂竖条' },
  { id: 'inline', name: '题签', hint: '章号与标题同一行' },
];
