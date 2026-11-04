export interface ParagraphFilterOptions {
  /** 额外丢弃“去掉不可见字符 / 空白实体 / <br> 后为空”的假空白行。 */
  dropHiddenBlankLines?: boolean;
}

/**
 * 判定整行是否空白时会忽略的码点：零宽字符、方向控制符、盲文空白、
 * Hangul Filler、变体选择符、BOM 等。仅用于“整行是否为空”的判断，
 * 不会从可见正文中删除，因此不会破坏 emoji ZWJ 序列或 RTL 连接控制符。
 */
const INVISIBLE_CHARS =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\u2800\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g;

/**
 * 廉价预筛：不含实体符号、尖括号或上述不可见字符的行一定不是假空白行，
 * 直接跳过后续多次替换。大文件里绝大多数正文行走这条快路。
 */
const SUSPICIOUS_CHAR =
  /[&<\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\u2800\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/;

const BLANK_ENTITY = /&(?:nbsp|ensp|emsp|thinsp|zwnj|zwj|shy|NoBreak);/gi;
const NUMERIC_ENTITY = /&#(x[0-9a-f]+|\d+);/gi;
const BR_TAG = /<br\b[^>]*\/?>/gi;

function trimParagraphEdges(line: string): string {
  return line.replace(/^[\s\u3000]+/, '').replace(/[\s\u3000]+$/, '');
}

function decodeNumericEntities(line: string): string {
  return line.replace(NUMERIC_ENTITY, (match, body: string) => {
    const isHex = body[0] === 'x' || body[0] === 'X';
    const code = Number.parseInt(isHex ? body.slice(1) : body, isHex ? 16 : 10);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
    return String.fromCodePoint(code);
  });
}

/**
 * 判断一整行是否只是“视觉上的空白”：去掉数字实体、`&nbsp;` 一类命名实体、
 * `<br>` 与全部不可见字符后，不剩任何内容。
 *
 * 只要行内混有真实正文就返回 false，避免误删。适用于 TXT 里用盲文空白、
 * Hangul Filler、`&nbsp;` 或连续的 `<br>` 撑出来的假空行。
 */
export function isBlankMarkupLine(line: string): boolean {
  if (!SUSPICIOUS_CHAR.test(line)) return false;
  const reduced = decodeNumericEntities(line)
    .replace(BR_TAG, '')
    .replace(BLANK_ENTITY, '')
    .replace(INVISIBLE_CHARS, '');
  return reduced.trim() === '';
}

/**
 * 统一清洗段落数组：去掉首尾空白、丢弃普通空行，并按需丢弃假空白行。
 *
 * `dropHiddenBlankLines` 默认为 false，即保持“只丢弃普通空行”的旧行为。
 */
export function cleanParagraphs(
  paragraphs: string[],
  options: ParagraphFilterOptions = {},
): string[] {
  const dropHidden = options.dropHiddenBlankLines ?? false;
  const result: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = trimParagraphEdges(paragraph);
    if (!trimmed) continue;
    if (dropHidden && isBlankMarkupLine(trimmed)) continue;
    result.push(trimmed);
  }

  return result;
}

export function buildParagraphs(text: string, options?: ParagraphFilterOptions): string[] {
  return cleanParagraphs(text.split('\n'), options);
}
