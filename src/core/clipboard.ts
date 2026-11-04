export interface ClipboardImageItem {
  types: readonly string[];
  getType(type: string): Promise<Blob>;
}

export interface ClipboardReader {
  read(): Promise<ClipboardImageItem[]>;
}

export class ClipboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClipboardError';
  }
}

function extensionFor(type: string): string {
  if (type === 'image/png') return 'png';
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/gif') return 'gif';
  const subtype = type.split('/')[1];
  return subtype?.replace(/[^a-z0-9]/gi, '') || 'img';
}

/**
 * Read the first image from the system clipboard. Permission errors are passed
 * through so the UI can give a useful message and fall back to a paste event.
 */
export async function readImageFromClipboard(
  clipboard: ClipboardReader | undefined,
): Promise<File> {
  if (!clipboard?.read) {
    throw new ClipboardError('当前浏览器不支持直接读取剪贴板。');
  }

  const items = await clipboard.read();
  if (!items || items.length === 0) {
    throw new ClipboardError('剪贴板里没有图片。');
  }

  for (const item of items) {
    const type = item.types.find((candidate) => candidate.startsWith('image/'));
    if (!type) continue;

    const blob = await item.getType(type);
    if (!blob || blob.size === 0) continue;

    return new File([blob], `clipboard-cover.${extensionFor(type)}`, {
      type: blob.type || type,
    });
  }

  throw new ClipboardError('剪贴板里没有可用的图片。');
}
