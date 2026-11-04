import { expect, it } from 'vitest';
import { buildEpubBytes } from '../../src/core/epub/build';
import { buildBook } from '../../src/core/pipeline';
import { DEFAULT_OPTIONS } from '../../src/core/types';

it('parses and packages a large novel within the performance budget', async () => {
  const chapter = (index: number) =>
    `第${index}章 测试章节${index}\n\n` +
    Array.from(
      { length: 10 },
      () => `　　${'雨'.repeat(180)}，${'风'.repeat(80)}。`,
    ).join('\n\n') +
    '\n\n';
  const text = Array.from({ length: 1000 }, (_, index) => chapter(index + 1)).join('');

  const parseStart = performance.now();
  const book = buildBook(text, DEFAULT_OPTIONS);
  const parseMs = performance.now() - parseStart;

  const packageStart = performance.now();
  const bytes = await buildEpubBytes(
    book.chapters,
    { title: '压力测试', author: '', language: 'zh-CN' },
    DEFAULT_OPTIONS,
    {
      identifier: 'urn:uuid:00000000-0000-4000-8000-000000000000',
      modified: '2026-11-03T12:00:00Z',
    },
  );
  const packageMs = performance.now() - packageStart;

  console.log(
    `[perf] ${(text.length / 1024 / 1024).toFixed(2)} MB / ${book.chapters.length} chapters: parse ${parseMs.toFixed(
      0,
    )} ms, epub ${packageMs.toFixed(0)} ms, ${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB`,
  );

  expect(book.chapters).toHaveLength(1000);
  expect(parseMs).toBeLessThan(5000);
  expect(packageMs).toBeLessThan(15000);
  expect(bytes.byteLength).toBeGreaterThan(1000);
});
