import { describe, expect, it } from 'vitest';
import {
  chineseToNumber,
  cleanTitleText,
  formatTitle,
  numberToChinese,
  parseHeading,
} from '../../src/core/titles';
import { type TitleOptions } from '../../src/core/types';

function optionsWith(overrides: Partial<TitleOptions> = {}): TitleOptions {
  return {
    enabled: true,
    preset: 'elegant',
    numbering: 'keep',
    divider: 'line',
    cleanNoise: true,
    autofillNumber: true,
    ...overrides,
  };
}

describe('Chinese numerals', () => {
  it.each([
    ['零', 0],
    ['一', 1],
    ['十', 10],
    ['十一', 11],
    ['二十', 20],
    ['一百零一', 101],
    ['一千零一', 1001],
    ['一万零一', 10001],
    ['十万', 100000],
    ['两百', 200],
  ])('parses %s', (input, expected) => {
    expect(chineseToNumber(input)).toBe(expected);
  });

  it('rejects non-numeral text', () => {
    expect(chineseToNumber('初入江湖')).toBeNull();
  });

  it.each([
    [1, '一'],
    [10, '十'],
    [12, '十二'],
    [20, '二十'],
    [101, '一百零一'],
    [1001, '一千零一'],
    [1010, '一千零一十'],
    [10001, '一万零一'],
    [100000, '十万'],
  ])('formats %i as %s', (input, expected) => {
    expect(numberToChinese(input)).toBe(expected);
  });
});

describe('parseHeading', () => {
  it('parses a number and subtitle', () => {
    const parts = parseHeading('第一章 初入江湖');
    expect(parts).toMatchObject({
      kind: 'chapter',
      numberText: '一',
      numberValue: 1,
      unit: '章',
      subtitle: '初入江湖',
      marker: '第一章',
    });
  });

  it('normalizes full-width digits', () => {
    const parts = parseHeading('第１２章 风起');
    expect(parts?.numberText).toBe('12');
    expect(parts?.numberValue).toBe(12);
    expect(parts?.marker).toBe('第12章');
  });

  it('parses large Chinese numbers', () => {
    expect(parseHeading('第一百零一章 归途')?.numberValue).toBe(101);
  });

  it('detects volumes', () => {
    const parts = parseHeading('第一卷 山雨欲来');
    expect(parts?.kind).toBe('volume');
    expect(parts?.unit).toBe('卷');
  });

  it('detects special chapters', () => {
    const parts = parseHeading('番外 小传');
    expect(parts).toMatchObject({
      kind: 'special',
      marker: '番外',
      subtitle: '小传',
      special: true,
    });
  });

  it('detects English chapters', () => {
    const parts = parseHeading('Chapter 12: The Rain');
    expect(parts).toMatchObject({
      kind: 'english',
      numberValue: 12,
      marker: 'Chapter 12',
      subtitle: 'The Rain',
    });
  });

  it('does not treat prose as a heading', () => {
    expect(parseHeading('他翻开第一章，又合上了书。')).toBeNull();
  });
});

describe('cleanTitleText', () => {
  it('removes leading 正文 and promotional suffixes', () => {
    expect(cleanTitleText('正文 第四章 灯下故人（求月票）', true)).toBe('第四章 灯下故人');
  });

  it('keeps suffixes when cleaning is disabled', () => {
    expect(cleanTitleText('第四章 灯下故人（求月票）', false)).toBe('第四章 灯下故人（求月票）');
  });

  it('collapses whitespace and trims separators', () => {
    expect(cleanTitleText('  第一章   风起： ', true)).toBe('第一章 风起');
  });
});

describe('formatTitle', () => {
  it('keeps the original number by default', () => {
    const result = formatTitle('第一章 初入江湖', parseHeading('第一章 初入江湖'), optionsWith());
    expect(result).toEqual({
      marker: '第一章',
      subtitle: '初入江湖',
      full: '第一章 初入江湖',
      toc: '第一章 初入江湖',
    });
  });

  it('converts to Arabic numerals', () => {
    const result = formatTitle(
      '第十二章 风起',
      parseHeading('第十二章 风起'),
      optionsWith({ numbering: 'arabic' }),
    );
    expect(result.marker).toBe('第12章');
    expect(result.full).toBe('第12章 风起');
  });

  it('converts to Chinese numerals', () => {
    const result = formatTitle(
      '第12章 风起',
      parseHeading('第12章 风起'),
      optionsWith({ numbering: 'chinese' }),
    );
    expect(result.marker).toBe('第十二章');
  });

  it('autofills a number for a bare title', () => {
    const result = formatTitle('初入江湖', null, optionsWith(), 3);
    expect(result.marker).toBe('第三章');
    expect(result.full).toBe('第三章 初入江湖');
  });

  it('does not autofill a special chapter', () => {
    const result = formatTitle('番外 小传', parseHeading('番外 小传'), optionsWith(), 3);
    expect(result.marker).toBe('番外');
    expect(result.full).toBe('番外 小传');
  });

  it('returns the raw title when beautification is disabled', () => {
    const result = formatTitle('第一章 初入江湖', parseHeading('第一章 初入江湖'), optionsWith({ enabled: false }));
    expect(result.full).toBe('第一章 初入江湖');
    expect(result.marker).toBe('');
  });
});
