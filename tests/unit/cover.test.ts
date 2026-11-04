import { describe, expect, it } from 'vitest';
import {
  coverExtension,
  CoverError,
  readCoverFile,
  sniffCoverMime,
} from '../../src/core/cover';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR42mNcYq/DwMDAxMDAgKAAFOkBFcv34tUAAAAASUVORK5CYII=';

function pngBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(PNG_BASE64, 'base64'));
}

function makeFile(bytes: Uint8Array, name: string, type = 'image/png'): File {
  return new File([new Uint8Array(bytes).buffer], name, { type });
}

describe('cover helpers', () => {
  it('maps cover MIME types to extensions', () => {
    expect(coverExtension('image/jpeg')).toBe('jpg');
    expect(coverExtension('image/png')).toBe('png');
    expect(coverExtension('image/gif')).toBe('gif');
  });

  it('sniffs PNG, JPEG and GIF signatures', () => {
    expect(sniffCoverMime(pngBytes())).toBe('image/png');
    expect(sniffCoverMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffCoverMime(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe(
      'image/gif',
    );
    expect(sniffCoverMime(Uint8Array.from([1, 2, 3, 4]))).toBeNull();
  });

  it('reads a supported image file', async () => {
    const cover = await readCoverFile(makeFile(pngBytes(), '封面.png'));
    expect(cover.mimeType).toBe('image/png');
    expect(cover.fileName).toBe('封面.png');
    expect(Array.from(cover.bytes)).toEqual(Array.from(pngBytes()));
  });

  it('rejects WebP and SVG with friendly errors', async () => {
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46]);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    await expect(readCoverFile(makeFile(webp, 'cover.webp', 'image/webp'))).rejects.toThrow(
      CoverError,
    );
    await expect(readCoverFile(makeFile(webp, 'cover.webp', 'image/webp'))).rejects.toThrow(
      /WebP/,
    );

    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await expect(readCoverFile(makeFile(svg, 'cover.svg', 'image/svg+xml'))).rejects.toThrow(
      /SVG/,
    );
  });

  it('rejects unsupported or empty files', async () => {
    await expect(
      readCoverFile(makeFile(Uint8Array.from([1, 2, 3]), 'cover.bin', 'application/octet-stream')),
    ).rejects.toThrow(/JPG/);
    await expect(readCoverFile(makeFile(new Uint8Array(0), 'empty.png'))).rejects.toThrow(
      /空/,
    );
  });
});
