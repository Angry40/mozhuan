import { describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import {
  decodeWith,
  detectAndDecode,
  normalizeText,
  TextDecodeError,
} from '../../src/core/encoding';

function bufferFrom(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function encode(text: string, encoding: string): ArrayBuffer {
  return bufferFrom(iconv.encode(text, encoding));
}

describe('encoding detection', () => {
  const sample = '第一章 初入江湖\n\n雨下了整夜，青石巷里浮着一层薄雾。';

  it('detects plain UTF-8', () => {
    const result = detectAndDecode(bufferFrom(new TextEncoder().encode(sample)));
    expect(result.encoding).toBe('utf-8');
    expect(result.text).toBe(sample);
    expect(result.hadBom).toBe(false);
    expect(result.replacementCount).toBe(0);
  });

  it('strips a UTF-8 BOM', () => {
    const bytes = new TextEncoder().encode(`\uFEFF${sample}`);
    const result = detectAndDecode(bufferFrom(bytes));
    expect(result.encoding).toBe('utf-8');
    expect(result.hadBom).toBe(true);
    expect(result.text).toBe(sample);
  });

  it('falls back to GB18030 for GBK text', () => {
    const result = detectAndDecode(encode(sample, 'gbk'));
    expect(result.encoding).toBe('gb18030');
    expect(result.text).toBe(sample);
    expect(result.replacementCount).toBe(0);
  });

  it('handles UTF-16LE with a BOM', () => {
    const encoded = iconv.encode(sample, 'utf16-le');
    const bytes = new Uint8Array(encoded.length + 2);
    bytes.set([0xff, 0xfe]);
    bytes.set(encoded, 2);
    const result = detectAndDecode(bufferFrom(bytes));
    expect(result.encoding).toBe('utf-16le');
    expect(result.text).toBe(sample);
  });

  it('can decode Big5 manually', () => {
    const text = '繁體中文測試';
    const result = decodeWith(encode(text, 'big5'), 'big5');
    expect(result.text).toBe(text);
  });

  it('rejects an empty buffer', () => {
    expect(() => detectAndDecode(new ArrayBuffer(0))).toThrow(TextDecodeError);
  });

  it('rejects binary data', () => {
    expect(() => detectAndDecode(new ArrayBuffer(64))).toThrow(TextDecodeError);
  });
});

describe('normalizeText', () => {
  it('normalizes line endings and removes invisible characters', () => {
    const input = '第一章\r\n\r\n正文\u200B内容\r结尾';
    expect(normalizeText(input)).toBe('第一章\n\n正文内容\n结尾');
  });

  it('removes control characters and trims', () => {
    expect(normalizeText('\u0000第一段\u0001\n\n第二段  \n')).toBe('第一段\n\n第二段');
  });
});
