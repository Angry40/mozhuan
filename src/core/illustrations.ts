import type { Illustration, IllustrationMimeType } from './types';

/** A single picture above this size is skipped to keep the tab responsive. */
export const MAX_ILLUSTRATION_BYTES = 8 * 1024 * 1024;
/** Total budget for all kept illustrations of one book. */
export const MAX_ILLUSTRATION_TOTAL_BYTES = 40 * 1024 * 1024;export const ILLUSTRATION_EXTENSIONS: Record<IllustrationMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export function illustrationExtension(mimeType: IllustrationMimeType): string {
  return ILLUSTRATION_EXTENSIONS[mimeType];
}

/**
 * Two FNV-1a passes in a single loop, plus the byte length. Duplicate pictures
 * are common in EPUBs (one image reused across chapters), and this is enough to
 * tell them apart without paying for a cryptographic digest.
 */
export function hashBytes(bytes: Uint8Array): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index];
    first = Math.imul(first ^ value, 0x01000193) >>> 0;
    second = Math.imul(second ^ value, 0x85ebca6b) >>> 0;
  }
  const left = first.toString(16).padStart(8, '0');
  const right = second.toString(16).padStart(8, '0');
  return `${left}${right}${bytes.length.toString(16)}`;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 512))
    .trim()
    .toLowerCase();
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

/**
 * Identify the picture format from its magic bytes first and the file
 * extension second. WebP and anything unrecognised returns null: EPUB 3 core
 * media types do not include WebP, so keeping it would break strict readers.
 */
export function sniffIllustrationMime(
  bytes: Uint8Array,
  path = '',
): IllustrationMimeType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (isWebp(bytes)) return null;
  if (looksLikeSvg(bytes)) return 'image/svg+xml';

  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'svg') return 'image/svg+xml';
  return null;
}

const BASE64_CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK) {
    const slice = bytes.subarray(index, Math.min(index + BASE64_CHUNK, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/** Inline data URI, used by the live preview iframe which has no file system. */
export function illustrationDataUri(illustration: Illustration): string {
  return `data:${illustration.mimeType};base64,${toBase64(illustration.bytes)}`;
}

/** 章节编辑器上传本地插图：校验格式与体积，生成可复用的 Illustration。 */
export async function readIllustrationFile(file: File): Promise<Illustration> {
  if (file.size > MAX_ILLUSTRATION_BYTES) {
    throw new Error('插图不能超过 8MB，请压缩后再上传。');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('插图文件是空的。');
  }
  const mimeType = sniffIllustrationMime(bytes, file.name);
  if (!mimeType || mimeType === 'image/svg+xml') {
    throw new Error('插图仅支持 JPG / PNG / GIF 图片。');
  }
  return {
    key: hashBytes(bytes),
    mimeType,
    bytes,
    alt: file.name.replace(/\.[^.]+$/, ''),
  };
}
