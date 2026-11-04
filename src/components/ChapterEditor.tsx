import { useEffect, useRef, useState } from 'react';
import { buildParagraphs } from '../core/paragraphs';
import type { Chapter } from '../core/types';

function textStats(
  text: string,
  dropHiddenBlankLines: boolean,
): { paragraphs: number; characters: number } {
  const paragraphs = buildParagraphs(text, { dropHiddenBlankLines });
  return {
    paragraphs: paragraphs.length,
    characters: paragraphs.join('').replace(/\s/g, '').length,
  };
}

export function ChapterEditor({
  chapter,
  originalParagraphs,
  hasOverride,
  dropHiddenBlankLines,
  onSave,
  onReset,
  onClose,
}: {
  chapter: Chapter;
  originalParagraphs: string[];
  hasOverride: boolean;
  dropHiddenBlankLines: boolean;
  onSave: (payload: { title: string; paragraphs: string[] }) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(chapter.title.full);
  const [text, setText] = useState(() => chapter.paragraphs.join('\n\n'));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitle(chapter.title.full);
    setText(chapter.paragraphs.join('\n\n'));
  }, [chapter.id, chapter.paragraphs, chapter.title.full]);

  useEffect(() => {
    textareaRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  const stats = textStats(text, dropHiddenBlankLines);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="chapter-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chapter-editor-heading"
        data-testid="chapter-editor"
      >
        <div className="chapter-editor-head">
          <div>
            <span className="eyebrow">编辑章节</span>
            <h3 id="chapter-editor-heading">{chapter.title.toc || chapter.rawTitle}</h3>
          </div>
          <button
            type="button"
            className="editor-close"
            onClick={onClose}
            aria-label="关闭编辑器"
            data-testid="chapter-editor-close"
          >
            ×
          </button>
        </div>

        <div className="chapter-editor-title-field">
          <label htmlFor="chapter-editor-title">章节标题</label>
          <input
            id="chapter-editor-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="输入章节编号和标题"
            maxLength={120}
            data-testid="chapter-editor-title"
          />
        </div>

        <p className="chapter-editor-hint">
          标题会套用当前标题版式；正文一行一段，空行和仅含不可见字符的空白行会按当前“过滤空行和空白行”选项处理。保存后只影响当前预览和导出，不会修改源文件。
        </p>

        <textarea
          ref={textareaRef}
          className="chapter-editor-textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={15}
          spellCheck={false}
          placeholder="在这里补充或修改本章正文……"
          data-testid="chapter-editor-textarea"
        />

        <div className="chapter-editor-meta">
          <span>
            {stats.paragraphs} 段 · {stats.characters} 字
          </span>
          <span>原文 {originalParagraphs.length} 段</span>
        </div>

        <div className="chapter-editor-actions">
          <div>
            {hasOverride ? (
              <button
                type="button"
                className="editor-reset"
                onClick={onReset}
                data-testid="chapter-editor-reset"
              >
                恢复原文
              </button>
            ) : null}
          </div>
          <div className="chapter-editor-action-group">
            <button type="button" className="editor-cancel" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="editor-save"
              onClick={() =>
                onSave({
                  title,
                  paragraphs: buildParagraphs(text, { dropHiddenBlankLines }),
                })
              }
              disabled={!title.trim()}
              data-testid="chapter-editor-save"
            >
              保存修改
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
