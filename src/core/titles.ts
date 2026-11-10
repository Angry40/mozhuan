import type { FormattedTitle, HeadingParts, TitleOptions } from './types';

const CN_DIGITS = '零〇一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟';

const CN_DIGIT_MAP: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  壹: 1,
  二: 2,
  两: 2,
  贰: 2,
  三: 3,
  叁: 3,
  四: 4,
  肆: 4,
  五: 5,
  伍: 5,
  六: 6,
  陆: 6,
  七: 7,
  柒: 7,
  八: 8,
  捌: 8,
  九: 9,
  玖: 9,
};

const CN_UNIT_MAP: Record<string, number> = {
  十: 10,
  拾: 10,
  百: 100,
  佰: 100,
  千: 1000,
  仟: 1000,
  万: 10000,
  亿: 100000000,
};

const SIMPLE_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/**
 * 「卷 / 册 / 部」是分卷级单元，识别为 volume（分卷目录）；「章 / 节 / 回 /
 * 集 / 篇 / 幕」是章节级单元。这样 `第一卷 / 第一册 / 第一部` 会作为分卷单独
 * 识别，而不是被当作普通章节。
 */
function isVolumeUnit(unit: string): boolean {
  return unit === '卷' || unit === '册' || unit === '部';
}

const CHAPTER_RE = new RegExp(
  `^(?:(?:正文|VIP|vip)\\s*[·:：\\-—]?\\s*)?第[\\s\\u3000]*([0-9]{1,7}|[${CN_DIGITS}]+)[\\s\\u3000]*([章节回集部篇幕卷册])(?:[\\s\\u3000]*[:：·\\-—、,，.。]?[\\s\\u3000]*)(.*)$`,
);

const SPECIAL_RE = new RegExp(
  '^(序章|序言|楔子|引子|前言|后记|尾声|终章|大结局|番外篇?|外传|完本感言|作者的话)' +
    '(?:[\\s\\u3000]*[:：·\\-—、]?[\\s\\u3000]*(.*))?$',
);

const EN_CHAPTER_RE = /^chapter\s+([0-9]+|[ivxlcdm]+)\b[\s:：.\-—]*(.*)$/i;
const EN_SPECIAL_RE = /^(prologue|epilogue)(?:[\s:：.\-—]+(.*))?$/i;

const PROMO_SUFFIX =
  /[\s\u3000]*[（(【\[]\s*(?:求|感谢|加更|月票|推荐票|收藏|订阅|打赏|本章完|全文完|未完待续)[^）)】\]]*[）)】\]]\s*$/;

export function normalizeFullWidthDigits(input: string): string {
  return input.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

export function charLength(input: string): number {
  return Array.from(input).length;
}

function cleanSubtitle(value: string | undefined): string {
  return (value ?? '')
    .replace(/^[\s\u3000:：·\-—、,，.。]+/, '')
    .replace(/[\s\u3000]+$/, '')
    .trim();
}

export function chineseToNumber(input: string): number | null {
  if (!input) return null;
  if (/^[0-9]+$/.test(input)) return Number.parseInt(input, 10);

  let total = 0;
  let section = 0;
  let number = 0;
  let sawSomething = false;

  for (const ch of input) {
    const digit = CN_DIGIT_MAP[ch];
    if (digit !== undefined) {
      number = digit;
      sawSomething = true;
      continue;
    }

    const unit = CN_UNIT_MAP[ch];
    if (unit === undefined) return null;
    sawSomething = true;

    if (unit < 10000) {
      section += (number || 1) * unit;
    } else {
      section += number;
      total += (section || 1) * unit;
      section = 0;
    }
    number = 0;
  }

  if (!sawSomething) return null;
  return total + section + number;
}

export function numberToChinese(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const n = Math.floor(value);
  if (n < 0) return String(value);
  if (n === 0) return '零';
  if (n < 10) return SIMPLE_DIGITS[n];
  if (n < 20) return `十${n % 10 ? SIMPLE_DIGITS[n % 10] : ''}`;
  if (n < 10000) return sectionToChinese(n);
  if (n < 100000000) {
    const tenThousands = Math.floor(n / 10000);
    const rest = n % 10000;
    const head = `${numberToChinese(tenThousands)}万`;
    if (rest === 0) return head;
    return rest < 1000 ? `${head}零${sectionToChinese(rest)}` : `${head}${sectionToChinese(rest)}`;
  }
  const hundredMillions = Math.floor(n / 100000000);
  const rest = n % 100000000;
  const head = `${numberToChinese(hundredMillions)}亿`;
  if (rest === 0) return head;
  if (rest < 10000000) {
    const tail = rest < 10000 ? sectionToChinese(rest) : numberToChinese(rest);
    return `${head}零${tail}`;
  }
  return `${head}${numberToChinese(rest)}`;
}

const SECTION_UNITS = ['', '十', '百', '千'];

function sectionToChinese(n: number): string {
  const digits = String(n);
  let result = '';
  let pendingZero = false;

  for (let i = 0; i < digits.length; i += 1) {
    const digit = Number(digits[i]);
    const position = digits.length - i - 1;
    if (digit === 0) {
      if (result) pendingZero = true;
      continue;
    }
    if (pendingZero) {
      result += '零';
      pendingZero = false;
    }
    result += `${SIMPLE_DIGITS[digit]}${SECTION_UNITS[position]}`;
  }

  return result;
}

function romanToNumber(input: string): number | null {
  const upper = input.toUpperCase();
  if (!/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(upper)) return null;
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let result = 0;
  for (let i = 0; i < upper.length; i += 1) {
    const current = map[upper[i]];
    const next = map[upper[i + 1]] ?? 0;
    result += current < next ? -current : current;
  }
  return result;
}

function parseNumberToken(token: string): number | null {
  if (/^[0-9]+$/.test(token)) return Number.parseInt(token, 10);
  if (/^[ivxlcdm]+$/i.test(token)) return romanToNumber(token);
  return chineseToNumber(token);
}

/**
 * Parse a single trimmed line as a chapter heading. Returns null for normal
 * prose. The caller is responsible for the length / punctuation heuristics.
 */
export function parseHeading(line: string): HeadingParts | null {
  const normalized = normalizeFullWidthDigits(line.trim());
  if (!normalized) return null;

  const chapterMatch = CHAPTER_RE.exec(normalized);
  if (chapterMatch) {
    const numberText = chapterMatch[1];
    const unit = chapterMatch[2];
    const subtitle = cleanSubtitle(chapterMatch[3]);
    const numberValue = parseNumberToken(numberText);
    return {
      raw: normalized,
      kind: isVolumeUnit(unit) ? 'volume' : 'chapter',
      marker: `第${numberText}${unit}`,
      unit,
      numberText,
      numberValue,
      subtitle,
      special: false,
    };
  }

  if (normalized === '序') {
    return {
      raw: normalized,
      kind: 'special',
      marker: '序',
      unit: '',
      numberText: '',
      numberValue: null,
      subtitle: '',
      special: true,
    };
  }

  const specialMatch = SPECIAL_RE.exec(normalized);
  if (specialMatch) {
    const label = specialMatch[1];
    return {
      raw: normalized,
      kind: 'special',
      marker: label,
      unit: '',
      numberText: '',
      numberValue: null,
      subtitle: cleanSubtitle(specialMatch[2]),
      special: true,
    };
  }

  const englishChapter = EN_CHAPTER_RE.exec(normalized);
  if (englishChapter) {
    const token = englishChapter[1];
    const numberValue = parseNumberToken(token);
    if (numberValue !== null) {
      return {
        raw: normalized,
        kind: 'english',
        marker: `Chapter ${token}`,
        unit: '',
        numberText: token,
        numberValue,
        subtitle: cleanSubtitle(englishChapter[2]),
        special: false,
      };
    }
  }

  const englishSpecial = EN_SPECIAL_RE.exec(normalized);
  if (englishSpecial) {
    const label = englishSpecial[1].toLowerCase() === 'prologue' ? 'Prologue' : 'Epilogue';
    return {
      raw: normalized,
      kind: 'special',
      marker: label,
      unit: '',
      numberText: '',
      numberValue: null,
      subtitle: cleanSubtitle(englishSpecial[2]),
      special: true,
    };
  }

  return null;
}

export function cleanTitleText(rawTitle: string, cleanNoise: boolean): string {
  let title = rawTitle.trim();
  if (!title) return '';

  if (cleanNoise) {
    title = title.replace(/^(?:正文|VIP|vip)(?:[\s\u3000]*[·:：\-—])?[\s\u3000]*/, '');
    let previous = '';
    while (previous !== title) {
      previous = title;
      title = title.replace(PROMO_SUFFIX, '').trim();
    }
    title = title
      .replace(/[\s\u3000]*(?:本章完|全文完|未完待续)[\s\u3000]*$/, '')
      .replace(/[\s\u3000]+/g, ' ');
  }

  title = title
    .replace(/^[\s\u3000:：·\-—、,，]+/, '')
    .replace(/[\s\u3000:：·\-—、,，]+$/, '');
  return title.trim();
}

/**
 * Build the title that is shown on the page and in the table of contents.
 * `assignedNumber` is used for auto-numbered headings without a number.
 */
export function formatTitle(
  rawTitle: string,
  parts: HeadingParts | null,
  options: TitleOptions,
  assignedNumber?: number,
): FormattedTitle {
  const cleaned = cleanTitleText(rawTitle, options.cleanNoise) || rawTitle.trim();

  if (!options.enabled) {
    return { marker: '', subtitle: '', full: cleaned, toc: cleaned };
  }

  if (!parts) {
    if (assignedNumber !== undefined) {
      const numberText =
        options.numbering === 'arabic'
          ? String(assignedNumber)
          : numberToChinese(assignedNumber);
      const marker = `第${numberText}章`;
      const full = [marker, cleaned].filter(Boolean).join(' ');
      return { marker, subtitle: cleaned, full, toc: full };
    }
    return { marker: '', subtitle: '', full: cleaned, toc: cleaned };
  }

  let marker = parts.marker;
  let subtitle = parts.subtitle;

  if (parts.kind === 'english') {
    marker = parts.marker;
  } else if (!parts.special && (parts.numberValue !== null || assignedNumber !== undefined)) {
    const n = parts.numberValue ?? assignedNumber;
    if (n !== undefined) {
      const unit = parts.unit || '章';
      let numberText: string;
      if (options.numbering === 'arabic') {
        numberText = String(n);
      } else if (options.numbering === 'chinese') {
        numberText = numberToChinese(n);
      } else if (parts.numberValue !== null) {
        numberText = parts.numberText;
      } else {
        numberText = numberToChinese(n);
      }
      marker = `第${numberText}${unit}`;
    }
  }

  const full = [marker, subtitle].filter(Boolean).join(' ') || cleaned;
  return { marker, subtitle, full, toc: full };
}
