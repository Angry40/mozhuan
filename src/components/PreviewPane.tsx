import type { Chapter } from '../core/types';

export function PreviewPane({
  chapter,
  chapters,
  activeIndex,
  previewHtml,
  onSelectChapter,
  onEditChapter,
  onDeleteChapter,
}: {
  chapter: Chapter | null;
  chapters: Chapter[];
  activeIndex: number;
  previewHtml: string;
  onSelectChapter: (index: number) => void;
  onEditChapter: (chapterId: number) => void;
  onDeleteChapter: (chapterId: number) => void;
}) {
  return (
    <section className="preview-card" id="preview-card" aria-label="章节预览">
      <div className="preview-toolbar">
        <div className="preview-title">
          <span className="eyebrow">预览</span>
          <span className="preview-counter">
            {chapters.length > 0 ? `第 ${activeIndex + 1} / ${chapters.length} 章` : '等待载入'}
          </span>
        </div>
        <div className="preview-tools">
          <div className="preview-actions">
            <button
              type="button"
              className="preview-action"
              onClick={() => chapter && onEditChapter(chapter.id)}
              disabled={!chapter}
              title="编辑本章正文，源 TXT 不会被修改"
              data-testid="edit-chapter"
            >
              编辑正文
            </button>
            <button
              type="button"
              className="preview-action danger"
              onClick={() => chapter && onDeleteChapter(chapter.id)}
              disabled={!chapter}
              title="从导出中删除本章，源 TXT 不会被修改"
              data-testid="delete-chapter"
            >
              删除本章
            </button>
          </div>
          <label className="preview-select">
            <span className="sr-only">选择预览章节</span>
            <select
              value={chapters.length > 0 ? String(activeIndex) : ''}
              onChange={(event) => onSelectChapter(Number(event.target.value))}
              disabled={chapters.length === 0}
              data-testid="chapter-select"
            >
              {chapters.length === 0 ? <option value="">尚无章节</option> : null}
              {chapters.map((item, index) => (
                <option key={item.id} value={index}>
                  {item.title.toc}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {chapter ? (
        <iframe
          key={chapter.id}
          id="preview-frame"
          className="preview-frame"
          title={`章节预览：${chapter.title.toc}`}
          sandbox=""
          srcDoc={previewHtml}
          data-testid="preview-frame"
        />
      ) : (
        <div className="preview-empty">
          <div className="empty-glyph">文</div>
          <h3>把一本 TXT 放进来</h3>
          <p>自动识别章节，清理插图标记，套用排版，然后生成 EPUB。</p>
          <ul>
            <li>章节标题会自动提取，找不到时也能整本导出</li>
            <li>首行缩进、段间距、标题样式都能实时预览</li>
            <li>文件不离开浏览器</li>
          </ul>
        </div>
      )}
    </section>
  );
}
