import type { Chapter } from '../core/types';

export function EmptyChapterNotice({
  chapters,
  onLocate,
  onEdit,
  onDelete,
  onDeleteAll,
}: {
  chapters: Chapter[];
  onLocate: (chapterId: number) => void;
  onEdit: (chapterId: number) => void;
  onDelete: (chapterId: number) => void;
  onDeleteAll: () => void;
}) {
  if (chapters.length === 0) return null;

  return (
    <section className="empty-notice" data-testid="empty-chapter-notice">
      <div className="empty-notice-head">
        <span className="empty-notice-mark" aria-hidden="true">
          !
        </span>
        <div className="empty-notice-copy">
          <strong>有 {chapters.length} 章没有正文内容</strong>
          <p>
            可能是相邻标题之间缺少文本，或标题识别有误。可以定位查看、补充正文，或从导出中删除；源 TXT
            不会被修改。
          </p>
        </div>
        <button
          type="button"
          className="empty-delete-all"
          onClick={onDeleteAll}
          data-testid="delete-all-empty"
        >
          删除全部空章节
        </button>
      </div>

      <ul className="empty-chapter-list" aria-label="没有正文内容的章节">
        {chapters.map((chapter) => (
          <li className="empty-chapter-row" key={chapter.id} data-testid={`empty-chapter-${chapter.id}`}>
            <button
              type="button"
              className="empty-chapter-title"
              onClick={() => onLocate(chapter.id)}
              title="定位到这一章"
            >
              <span className="empty-chapter-index">
                {String(chapter.index + 1).padStart(2, '0')}
              </span>
              <span className="empty-chapter-name">{chapter.title.toc || chapter.rawTitle}</span>
            </button>
            <div className="empty-chapter-actions">
              <button type="button" onClick={() => onLocate(chapter.id)}>
                定位
              </button>
              <button type="button" onClick={() => onEdit(chapter.id)} data-testid={`edit-empty-${chapter.id}`}>
                补充正文
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => onDelete(chapter.id)}
                data-testid={`delete-empty-${chapter.id}`}
              >
                从导出删除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
