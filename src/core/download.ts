export function sanitizeFilename(input: string, fallback = 'book'): string {
  const cleaned = input
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
    .slice(0, 80)
    .trim();
  return cleaned || fallback;
}

/** 导出结果卡片和实际下载共用同一个文件名，避免展示名与保存名不一致。 */
export function epubFileName(input: string, fallback = 'book'): string {
  const base = sanitizeFilename(input.replace(/\.epub$/i, ''), fallback);
  return `${base}.epub`;
}

export function downloadEpub(bytes: Uint8Array, fileName: string): void {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/epub+zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = epubFileName(fileName);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatCharacterCount(count: number): string {
  if (count < 10000) return `${count.toLocaleString('zh-CN')} 字`;
  return `${(count / 10000).toFixed(1)} 万字`;
}

export function defaultTitleFromFileName(name: string): string {
  const withoutPath = name.split(/[/\\]/).pop() ?? name;
  return withoutPath.replace(/\.txt$/i, '').trim() || '未命名书籍';
}
