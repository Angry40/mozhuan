import { describe, expect, it } from 'vitest';
import {
  ClipboardError,
  readImageFromClipboard,
  type ClipboardReader,
} from '../../src/core/clipboard';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR42mNcYq/DwMDAxMDAgKAAFOkBFcv34tUAAAAASUVORK5CYII=';

function pngBlob(): Blob {
  return new Blob([Uint8Array.from(Buffer.from(PNG_BASE64, 'base64'))], {
    type: 'image/png',
  });
}

function readerWithImage(): ClipboardReader {
  return {
    read: async () => [
      {
        types: ['text/plain', 'image/png'],
        getType: async () => pngBlob(),
      },
    ],
  };
}

describe('readImageFromClipboard', () => {
  it('returns the first image as a File', async () => {
    const file = await readImageFromClipboard(readerWithImage());
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('clipboard-cover.png');
    expect(file.size).toBeGreaterThan(0);
  });

  it('rejects when the Clipboard API is unavailable', async () => {
    await expect(readImageFromClipboard(undefined)).rejects.toThrow(ClipboardError);
    await expect(readImageFromClipboard(undefined)).rejects.toThrow(/不支持/);
  });

  it('rejects an empty clipboard', async () => {
    await expect(readImageFromClipboard({ read: async () => [] })).rejects.toThrow(/没有图片/);
  });

  it('rejects a clipboard with only text', async () => {
    await expect(
      readImageFromClipboard({
        read: async () => [{ types: ['text/plain'], getType: async () => new Blob(['x']) }],
      }),
    ).rejects.toThrow(/没有可用的图片/);
  });

  it('passes permission errors through', async () => {
    const reader: ClipboardReader = {
      read: async () => {
        const error = new Error('denied');
        error.name = 'NotAllowedError';
        throw error;
      },
    };
    await expect(readImageFromClipboard(reader)).rejects.toThrow('denied');
  });
});
