import { describe, expect, it } from 'vitest';
import { epubFileName, formatFileSize, sanitizeFilename } from '../../src/core/download';

describe('epubFileName', () => {
  it('keeps normal Chinese titles and appends the extension once', () => {
    expect(epubFileName('临川夜雨')).toBe('临川夜雨.epub');
    expect(epubFileName('临川夜雨.epub')).toBe('临川夜雨.epub');
  });

  it('removes characters that are invalid in file names', () => {
    expect(epubFileName('a/b:c*?"<>|')).toBe('abc.epub');
    expect(epubFileName('  《书名》  ')).toBe('《书名》.epub');
  });

  it('falls back when the title sanitizes to nothing', () => {
    expect(epubFileName('')).toBe('book.epub');
    expect(epubFileName(' . . ')).toBe('book.epub');
    expect(epubFileName('///')).toBe('book.epub');
  });

  it('caps very long titles at the same limit as sanitizeFilename', () => {
    const name = epubFileName('字'.repeat(200));
    expect(name).toBe(`${'字'.repeat(80)}.epub`);
    expect(sanitizeFilename('字'.repeat(200))).toHaveLength(80);
  });

  it('formats file sizes consistently for the export card', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
