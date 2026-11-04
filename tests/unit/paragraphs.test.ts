import { describe, expect, it } from 'vitest';
import { buildParagraphs, cleanParagraphs, isBlankMarkupLine } from '../../src/core/paragraphs';

/** 只含不可见内容、肉眼看起来是空行的样本。 */
const BLANK_CASES: Array<[string, string]> = [
  ['盲文空白 U+2800', '\u2800'],
  ['Hangul Filler U+3164', '\u3164\u3164'],
  ['半角 Hangul Filler U+FFA0', '\uFFA0'],
  ['软连字符 U+00AD', '\u00AD'],
  ['零宽空格 U+200B', '\u200B'],
  ['双向控制符 U+200E/U+200F', '\u200E\u200F'],
  ['词连接符 U+2060', '\u2060'],
  ['组合用字符 U+034F', '\u034F'],
  ['变体选择符 U+FE0F', '\uFE0F'],
  ['空行包裹空白 U+0020 + U+2800', '  \u2800  '],
  ['<br>', '<br>'],
  ['<br/>', '<br/>'],
  ['带属性的 <br>', '<br class="x" />'],
  ['&nbsp;', '&nbsp;'],
  ['&emsp;', '&emsp;'],
  ['&#160;', '&#160;'],
  ['&#x00A0;', '&#x00A0;'],
  ['&#8194;', '&#8194;'],
  ['&#x200B;', '&#x200B;'],
  ['&nbsp;<br /> 组合', '&nbsp;<br />'],
];

describe('isBlankMarkupLine', () => {
  for (const [label, line] of BLANK_CASES) {
    it(`把「${label}」判定为视觉空白行`, () => {
      expect(isBlankMarkupLine(line)).toBe(true);
    });
  }

  it('行内混有正文时不算空白行', () => {
    expect(isBlankMarkupLine('正文。')).toBe(false);
    expect(isBlankMarkupLine('正文&nbsp;')).toBe(false);
    expect(isBlankMarkupLine('前面\u200B后面')).toBe(false);
    expect(isBlankMarkupLine('正文<br>后续')).toBe(false);
  });
});

describe('cleanParagraphs', () => {
  it('默认丢弃普通空行与全角空格行', () => {
    expect(cleanParagraphs(['正文。', '', '　　', '   ', '下一段。'])).toEqual(['正文。', '下一段。']);
  });

  it('默认保留假空白行，行为与改动前一致', () => {
    const input = ['正文。', '\u2800', '&nbsp;', '下一段。'];
    expect(cleanParagraphs(input)).toEqual(['正文。', '\u2800', '&nbsp;', '下一段。']);
  });

  it('开启后丢弃假空白行', () => {
    const input = ['正文。', '\u2800', '&nbsp;', '<br>', '下一段。'];
    expect(cleanParagraphs(input, { dropHiddenBlankLines: true })).toEqual(['正文。', '下一段。']);
  });

  it('只裁剪首尾空白，不删除正文内部的不可见字符', () => {
    const inner = '前面\u200B后面';
    expect(cleanParagraphs([`　${inner}　`], { dropHiddenBlankLines: true })).toEqual([inner]);
  });

  it('不修改传入的数组', () => {
    const input = ['正文。', '\u2800'];
    const snapshot = [...input];
    cleanParagraphs(input, { dropHiddenBlankLines: true });
    expect(input).toEqual(snapshot);
  });

  it('整章只有假空白时返回空数组', () => {
    expect(cleanParagraphs(['\u2800', '&nbsp;'], { dropHiddenBlankLines: true })).toEqual([]);
  });

  it('U+FEFF 在两种模式下都会被丢弃', () => {
    // U+FEFF 属于 JS 的 \s，首尾裁剪时已移除，不依赖新选项。
    expect(cleanParagraphs(['\uFEFF'])).toEqual([]);
    expect(cleanParagraphs(['\uFEFF'], { dropHiddenBlankLines: true })).toEqual([]);
  });
});

describe('buildParagraphs', () => {
  it('未传选项时保持旧行为', () => {
    expect(buildParagraphs('正文一。\n\u2800\n\n正文二。')).toEqual(['正文一。', '\u2800', '正文二。']);
  });

  it('开启过滤后丢弃假空白行', () => {
    expect(
      buildParagraphs('正文一。\n\u2800\n&nbsp;\n正文二。', { dropHiddenBlankLines: true }),
    ).toEqual(['正文一。', '正文二。']);
  });
});
