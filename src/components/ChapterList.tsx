import { useEffect, useRef } from 'react';
import type { Chapter } from '../core/types';

export function ChapterList({
  chapters,
  activeIndex,
  onSelect,
}: {
  chapters: Chapter[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    const active = container?.querySelector<HTMLElement>('[data-active="true"]');
    if (!container || !active) return;
    const containerRect = container.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.top < containerRect.top) {
      container.scrollTop -= containerRect.top - activeRect.top;
    } else if (activeRect.bottom > containerRect.bottom) {
      container.scrollTop += activeRect.bottom - containerRect.bottom;
    }
  }, [activeIndex]);

  return (
    <section className="panel chapter-panel">
      <div className="panel-heading">
        <span className="step">目录</span>
        <h2>全书章节</h2>
        <span className="panel-hint" data-testid="chapter-list-count">
          {chapters.length} 章
        </span>
      </div>

      {chapters.length === 0 ? (
        <p className="chapter-empty">载入 TXT 后，这里会列出识别到的章节。</p>
      ) : (
        <div className="chapter-scroll" ref={scrollRef}>
          {chapters.map((chapter, index) => (
            <button
              key={chapter.id}
              type="button"
              className={`chapter-item${index === activeIndex ? ' is-active' : ''}`}
              data-active={index === activeIndex ? 'true' : 'false'}
              onClick={() => onSelect(index)}
              data-testid={`chapter-item-${index}`}
            >
              <span className="chapter-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="chapter-name" title={chapter.title.toc}>
                {chapter.title.toc}
              </span>
              <span className="chapter-meta">
                {chapter.imagesRemoved > 0 ? `−${chapter.imagesRemoved} 图 · ` : ''}
                {chapter.paragraphs.length} 段
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
