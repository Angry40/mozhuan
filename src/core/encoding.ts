import type { DecodeResult, SupportedEncoding } from './types';

export const ENCODING_OPTIONS: { id: SupportedEncoding; label: string }[] = [
  { id: 'utf-8', label: 'UTF-8' },
  { id: 'gb18030', label: 'GB18030 / GBK' },
  { id: 'big5', label: 'Big5（繁体）' },
  { id: 'utf-16le', label: 'UTF-16 LE' },
  { id: 'utf-16be', label: 'UTF-16 BE' },
];

const DECODER_LABELS: Record<SupportedEncoding, string> = {
  'utf-8': 'utf-8',
  gb18030: 'gb18030',
  big5: 'big5',
  'utf-16le': 'utf-16le',
  'utf-16be': 'utf-16be',
};

export class TextDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TextDecodeError';
  }
}

function countReplacements(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (ch === '\uFFFD') count += 1;
  }
  return count;
}

function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  if (sample.length === 0) return false;
  let nulls = 0;
  for (const byte of sample) {
    if (byte === 0) nulls += 1;
  }
  return nulls / sample.length > 0.2;
}

function hasBom(bytes: Uint8Array): boolean {
  return (
    (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) ||
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff)
  );
}

export function decodeWith(buffer: ArrayBuffer, encoding: SupportedEncoding): DecodeResult {
  const bytes = new Uint8Array(buffer);
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(DECODER_LABELS[encoding]);
  } catch {
    throw new TextDecodeError('当前浏览器不支持该编码，请改选 UTF-8。');
  }

  let text: string;
  try {
    // ignoreBOM defaults to false, i.e. a leading BOM is removed automatically.
    text = decoder.decode(bytes);
  } catch {
    throw new TextDecodeError('无法按所选编码读取文件，请换一种编码再试。');
  }

  return {
    text,
    encoding,
    hadBom: hasBom(bytes),
    replacementCount: countReplacements(text),
  };
}

function tryStrictUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Detect a text encoding without external libraries:
 * 1. BOM wins.
 * 2. Strict UTF-8 is accepted only when no invalid byte sequence exists.
 * 3. GB18030 and Big5 are both decoded and the one with fewer replacement
 *    characters wins; ties prefer GB18030 (the common case for Chinese TXT).
 */
export function detectAndDecode(buffer: ArrayBuffer): DecodeResult {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    throw new TextDecodeError('文件是空的。');
  }

  const bom =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? 'utf-8'
      : bytes[0] === 0xff && bytes[1] === 0xfe
        ? 'utf-16le'
        : bytes[0] === 0xfe && bytes[1] === 0xff
          ? 'utf-16be'
          : null;
  if (bom) return decodeWith(buffer, bom);

  if (looksBinary(bytes)) {
    throw new TextDecodeError('这看起来不是文本文件，请选择一份 TXT 文件。');
  }

  const strictUtf8 = tryStrictUtf8(bytes);
  if (strictUtf8 !== null) {
    return {
      text: strictUtf8,
      encoding: 'utf-8',
      hadBom: false,
      replacementCount: 0,
    };
  }

  let best: DecodeResult | null = null;
  for (const encoding of ['gb18030', 'big5'] as const) {
    let candidate: DecodeResult;
    try {
      candidate = decodeWith(buffer, encoding);
    } catch {
      continue;
    }
    if (
      best === null ||
      candidate.replacementCount < best.replacementCount ||
      (candidate.replacementCount === best.replacementCount && encoding === 'gb18030')
    ) {
      best = candidate;
    }
  }

  if (best === null) {
    throw new TextDecodeError('无法识别文件编码，请手动选择编码（推荐先转存为 UTF-8）。');
  }
  return best;
}

export function normalizeText(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\t/g, '  ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}
