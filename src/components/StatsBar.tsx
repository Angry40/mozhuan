import { formatCharacterCount } from '../core/download';
import type { BookStats } from '../core/types';

export function StatsBar({ stats }: { stats: BookStats | null }) {
  const items = [
    { testId: 'chapter-count', value: stats ? String(stats.chapters) : '—', unit: '章' },
    {
      testId: 'char-count',
      value: stats ? formatCharacterCount(stats.characters) : '—',
      unit: '',
    },
    { testId: 'paragraph-count', value: stats ? String(stats.paragraphs) : '—', unit: '段' },
    {
      testId: 'image-count',
      value: stats ? String(stats.imagesRemoved) : '—',
      unit: '处插图',
    },
    {
      testId: 'reading-time',
      value: stats && stats.readingMinutes > 0 ? String(stats.readingMinutes) : '—',
      unit: '分钟',
    },
  ];

  return (
    <div className="stats" data-testid="stats">
      {items.map((item) => (
        <div className="stat" key={item.testId}>
          <strong data-testid={item.testId}>{item.value}</strong>
          {item.unit ? <span>{item.unit}</span> : null}
        </div>
      ))}
    </div>
  );
}
