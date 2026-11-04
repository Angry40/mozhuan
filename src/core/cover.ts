import type { CoverImage, CoverMimeType } from './types';

export const MAX_COVER_BYTES = 10 * 1024 * 1024;
export const COVER_ACCEPT = '.jpg,.jpeg,.png,.gif,image/jpeg,image/png,image/gif';

export const COVER_MIME_EXTENSIONS: Record<CoverMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
};

export class CoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoverError';
  }
}

export function coverExtension(mimeType: CoverMimeType): string {
  return COVER_MIME_EXTENSIONS[mimeType];
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

export function sniffCoverMime(bytes: Uint8Array): CoverMimeType | null {
  if (
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return 'image/png';
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return 'image/gif';
  }
  return null;
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

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 512))
    .trim()
    .toLowerCase();
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
}

export async function readCoverFile(file: File): Promise<CoverImage> {
  if (file.size > MAX_COVER_BYTES) {
    throw new CoverError('封面图片不能超过 10MB，请压缩后再上传。');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) {
    throw new CoverError('封面文件是空的。');
  }

  if (isWebp(bytes)) {
    throw new CoverError('暂不支持 WebP 封面，请转存为 JPG 或 PNG。');
  }
  if (looksLikeSvg(bytes)) {
    throw new CoverError('暂不支持 SVG 封面，请导出为 JPG 或 PNG。');
  }

  const mimeType = sniffCoverMime(bytes);
  if (!mimeType) {
    throw new CoverError('封面仅支持 JPG / PNG / GIF 图片。');
  }

  return { bytes, mimeType, fileName: file.name };
}
