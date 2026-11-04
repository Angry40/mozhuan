import { describe, expect, it } from 'vitest';
import { stripImages } from '../../src/core/images';

describe('stripImages', () => {
  const input = [
    '　　他指着墙上的插图，说：“这张画不对。”',
    '　　[插图]',
    '　　<img src="https://example.com/a.jpg" alt="图">',
    '　　![](https://example.com/b.png)',
    '　　[img]https://example.com/c.gif[/img]',
    '　　（配图：夜雨孤灯）',
    '　　图片直链：https://example.com/d.webp?x=1',
    '　　[Image]',
    '　　data:image/png;base64,iVBORw0KGgo=',
    '　　普通链接：https://example.com/story',
  ].join('\n');

  it('removes all illustration markers but keeps ordinary prose', () => {
    const result = stripImages(input, true);
    expect(result.count).toBeGreaterThanOrEqual(8);
    expect(result.text).not.toContain('<img');
    expect(result.text).not.toContain('[插图]');
    expect(result.text).not.toContain('![');
    expect(result.text).not.toContain('[img]');
    expect(result.text).not.toContain('data:image');
    expect(result.text).not.toContain('a.jpg');
    expect(result.text).not.toContain('b.png');
    expect(result.text).not.toContain('c.gif');
    expect(result.text).not.toContain('d.webp');
    expect(result.text).toContain('墙上的插图');
    expect(result.text).toContain('https://example.com/story');
    expect(result.snippets.length).toBeGreaterThan(0);
  });

  it('leaves the text untouched when disabled', () => {
    const result = stripImages(input, false);
    expect(result.text).toBe(input);
    expect(result.count).toBe(0);
    expect(result.snippets).toHaveLength(0);
  });

  it('removes figure and picture blocks', () => {
    const text = '前文\n<figure><img src="x.jpg"/><figcaption>图</figcaption></figure>\n后文';
    const result = stripImages(text, true);
    expect(result.text).not.toContain('figure');
    expect(result.text).toContain('前文');
    expect(result.text).toContain('后文');
  });

  it('cleans a line that only contained an image marker', () => {
    const result = stripImages('前文\n[插图]\n后文', true);
    expect(result.text.split('\n').filter((line) => line.trim())).toEqual(['前文', '后文']);
  });

  it('truncates snippets for display', () => {
    const result = stripImages(`[插图] ${'x'.repeat(200)} https://example.com/a.jpg`, true);
    expect(result.snippets.every((snippet) => snippet.snippet.length <= 80)).toBe(true);
  });
});
