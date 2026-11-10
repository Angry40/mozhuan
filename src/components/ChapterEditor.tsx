import { useEffect, useRef, useState } from 'react';
import { illustrationDataUri, readIllustrationFile } from '../core/illustrations';
import { buildParagraphs } from '../core/paragraphs';
import type { Chapter, ChapterIllustration } from '../core/types';

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

function sameIllustrations(left: ChapterIllustration[], right: ChapterIllustration[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      item.illustration.key === other.illustration.key &&
      item.afterParagraph === other.afterParagraph &&
      Boolean(item.header) === Boolean(other.header)
    );
  });
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
  onSave: (payload: { title: string; paragraphs: string[]; illustrations: ChapterIllustration[] }) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  // 章节序号（第一章 / 第一卷 / 番外）与标题分开编辑。
  const [marker, setMarker] = useState(chapter.title.marker);
  const [subtitle, setSubtitle] = useState(chapter.title.subtitle);
  const [text, setText] = useState(() => chapter.paragraphs.join('\n\n'));
  const [illustrations, setIllustrations] = useState<ChapterIllustration[]>(() =>
    (chapter.illustrations ?? []).map((item) => ({ ...item })),
  );
  const [illustrationError, setIllustrationError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMarker(chapter.title.marker);
    setSubtitle(chapter.title.subtitle);
    setText(chapter.paragraphs.join('\n\n'));
    setIllustrations((chapter.illustrations ?? []).map((item) => ({ ...item })));
    setIllustrationError(null);
  }, [chapter.id, chapter.paragraphs, chapter.title.marker, chapter.title.subtitle, chapter.illustrations]);

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
  const paragraphCount = stats.paragraphs;

  const handleUpload = async (file: File) => {
    setIllustrationError(null);
    try {
      const illustration = await readIllustrationFile(file);
      setIllustrations((previous) => [
        ...previous,
        { illustration, afterParagraph: Math.max(-1, paragraphCount - 1) },
      ]);
    } catch (uploadError) {
      setIllustrationError(uploadError instanceof Error ? uploadError.message : '上传失败。');
    }
  };

  const handleRemoveIllustration = (index: number) => {
    setIllustrations((previous) => previous.filter((_, i) => i !== index));
  };

  const handlePositionChange = (index: number, position: number) => {
    setIllustrations((previous) =>
      previous.map((item, i) =>
        i === index
          ? {
              ...item,
              header: position === -2,
              afterParagraph: position === -2 ? -1 : position,
            }
          : item,
      ),
    );
  };

  const positionOptions = (count: number): { value: number; label: string }[] => {
    const options: { value: number; label: string }[] = [{ value: -2, label: '章节标题前（头图）' }];
    for (let i = 0; i < count; i += 1) {
      options.push({ value: i, label: `第 ${i + 1} 段之后` });
    }
    options.push({ value: count - 1 === -1 ? 0 : count, label: '正文末尾' });
    return options;
  };

  const fullTitle = [marker.trim(), subtitle.trim()].filter(Boolean).join(' ');

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
          <label htmlFor="chapter-editor-marker">章节序号</label>
          <input
            id="chapter-editor-marker"
            type="text"
            value={marker}
            onChange={(event) => setMarker(event.target.value)}
            placeholder="第一章 / 第一卷 / 番外"
            maxLength={60}
            data-testid="chapter-editor-marker"
          />
        </div>

        <div className="chapter-editor-title-field">
          <label htmlFor="chapter-editor-subtitle">章节标题</label>
          <input
            id="chapter-editor-subtitle"
            type="text"
            value={subtitle}
            onChange={(event) => setSubtitle(event.target.value)}
            placeholder="输入章节标题"
            maxLength={120}
            data-testid="chapter-editor-subtitle"
          />
        </div>

        <p className="chapter-editor-hint">
          序号与标题会套用当前标题版式（编号格式、装饰等）；正文一行一段，空行按当前“过滤空行和空白行”选项处理。保存后只影响当前预览和导出，不会修改源文件。
        </p>

        <textarea
          ref={textareaRef}
          className="chapter-editor-textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={13}
          spellCheck={false}
          placeholder="在这里补充或修改本章正文……"
          data-testid="chapter-editor-textarea"
        />

        <div className="chapter-editor-illustrations">
          <div className="chapter-editor-illustrations-head">
            <span className="eyebrow">正文插图</span>
            <button
              type="button"
              className="editor-add-image"
              onClick={() => fileInputRef.current?.click()}
              data-testid="chapter-editor-add-image"
            >
              上传图片
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.gif,image/jpeg,image/png,image/gif"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleUpload(file);
                event.target.value = '';
              }}
              data-testid="chapter-editor-image-input"
            />
          </div>
          {illustrationError ? <p className="chapter-editor-illustration-error">{illustrationError}</p> : null}
          {illustrations.length === 0 ? (
            <p className="chapter-editor-illustrations-empty">本章暂无插图，可上传本地 JPG / PNG / GIF。</p>
          ) : (
            <ul className="chapter-editor-illustration-list">
              {illustrations.map((item, index) => (
                <li key={`${item.illustration.key}-${index}`} className="chapter-editor-illustration-item">
                  <img
                    src={illustrationDataUri(item.illustration)}
                    alt={item.illustration.alt}
                    className="chapter-editor-illustration-thumb"
                  />
                  <div className="chapter-editor-illustration-info">
                    <span className="chapter-editor-illustration-alt">
                      {item.illustration.alt || `插图 ${index + 1}`}
                    </span>
                    <select
                      value={item.header ? -2 : item.afterParagraph}
                      onChange={(event) => handlePositionChange(index, Number(event.target.value))}
                      aria-label="插图位置"
                      data-testid={`chapter-editor-illustration-position-${index}`}
                    >
                      {positionOptions(paragraphCount).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="editor-remove-image"
                    onClick={() => handleRemoveIllustration(index)}
                    aria-label="删除插图"
                    data-testid={`chapter-editor-illustration-remove-${index}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="chapter-editor-meta">
          <span>
            {stats.paragraphs} 段 · {stats.characters} 字 · {illustrations.length} 图
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
                  title: fullTitle,
                  paragraphs: buildParagraphs(text, { dropHiddenBlankLines }),
                  illustrations: illustrations.map((item) => ({
                    ...item,
                    afterParagraph: item.header ? -1 : Math.min(item.afterParagraph, Math.max(0, paragraphCount - 1)),
                  })),
                })
              }
              disabled={!fullTitle.trim()}
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

export { sameIllustrations };
