import { useCallback, useEffect, useRef, useState } from 'react';
import { readImageFromClipboard } from '../core/clipboard';
import { COVER_ACCEPT, coverExtension, readCoverFile } from '../core/cover';
import { formatFileSize } from '../core/download';
import type { BookLanguage, EpubMeta } from '../core/types';

const LANGUAGES: { value: BookLanguage; label: string }[] = [
  { value: 'zh-CN', label: '简体中文（zh-CN）' },
  { value: 'zh-TW', label: '繁體中文（zh-TW）' },
  { value: 'en', label: 'English（en）' },
];

function firstImageFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const file of Array.from(data.files ?? [])) {
    if (file.type.startsWith('image/')) return file;
  }
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}

function describeClipboardError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'NotAllowedError') return '浏览器没有允许读取剪贴板。';
    if (error.name === 'SecurityError') return '当前页面无法读取剪贴板。';
    return error.message;
  }
  return '读取剪贴板失败。';
}

export function MetadataPanel({
  meta,
  onChange,
  disabled,
}: {
  meta: EpubMeta;
  onChange: (meta: EpubMeta) => void;
  disabled: boolean;
}) {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [pasteArmed, setPasteArmed] = useState(false);

  useEffect(() => {
    if (!meta.cover) {
      setCoverUrl(null);
      return undefined;
    }
    const copy = new Uint8Array(meta.cover.bytes);
    const blob = new Blob([copy.buffer], { type: meta.cover.mimeType });
    const url = URL.createObjectURL(blob);
    setCoverUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [meta.cover]);

  useEffect(() => {
    if (disabled) setPasteArmed(false);
  }, [disabled]);

  const applyCoverFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setCoverError(null);
      setPasteArmed(false);
      setCoverLoading(true);
      try {
        const cover = await readCoverFile(file);
        onChange({ ...metaRef.current, cover });
      } catch (error) {
        setCoverError(error instanceof Error ? error.message : '封面读取失败。');
      } finally {
        setCoverLoading(false);
      }
    },
    [onChange],
  );

  useEffect(() => {
    if (!pasteArmed || disabled) return undefined;

    const handlePaste = (event: ClipboardEvent) => {
      const file = firstImageFromClipboard(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void applyCoverFile(file);
    };

    document.addEventListener('paste', handlePaste);
    const timeout = window.setTimeout(() => setPasteArmed(false), 10_000);
    return () => {
      document.removeEventListener('paste', handlePaste);
      window.clearTimeout(timeout);
    };
  }, [applyCoverFile, disabled, pasteArmed]);

  const handlePasteClick = async () => {
    if (disabled || coverLoading) return;
    setCoverError(null);
    setPasteArmed(false);

    if (!navigator.clipboard?.read) {
      setPasteArmed(true);
      setCoverError('当前浏览器不支持直接读取剪贴板。');
      return;
    }

    setCoverLoading(true);
    try {
      const file = await readImageFromClipboard(navigator.clipboard);
      await applyCoverFile(file);
    } catch (error) {
      setPasteArmed(true);
      setCoverError(describeClipboardError(error));
    } finally {
      setCoverLoading(false);
    }
  };

  const handleRemoveCover = () => {
    setCoverError(null);
    setPasteArmed(false);
    onChange({ ...metaRef.current, cover: undefined });
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <span className="step">02</span>
        <h2>书籍信息</h2>
        <span className="panel-hint">EPUB 元数据</span>
      </div>

      <div className="field">
        <label htmlFor="book-title">书名</label>
        <input
          id="book-title"
          type="text"
          value={meta.title}
          placeholder="默认使用文件名"
          maxLength={120}
          onChange={(event) => onChange({ ...meta, title: event.target.value })}
          disabled={disabled}
          data-testid="title-input"
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="book-author">作者</label>
          <input
            id="book-author"
            type="text"
            value={meta.author}
            placeholder="可留空"
            maxLength={80}
            onChange={(event) => onChange({ ...meta, author: event.target.value })}
            disabled={disabled}
            data-testid="author-input"
          />
        </div>
        <div className="field">
          <label htmlFor="book-language">语言</label>
          <select
            id="book-language"
            value={meta.language}
            onChange={(event) =>
              onChange({ ...meta, language: event.target.value as BookLanguage })
            }
            disabled={disabled}
            data-testid="language-select"
          >
            {LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="cover-field">
        <div className="cover-heading">
          <span className="cover-label">封面</span>
          <span className="cover-optional">可选</span>
        </div>

        <input
          ref={coverInputRef}
          className="sr-only"
          type="file"
          accept={COVER_ACCEPT}
          onChange={(event) => {
            void applyCoverFile(event.target.files?.[0]);
            event.target.value = '';
          }}
          disabled={disabled || coverLoading}
          data-testid="cover-input"
        />

        <div className="cover-row">
          <div
            className={`cover-preview${meta.cover ? ' has-image' : ''}`}
            data-testid="cover-preview"
          >
            {coverUrl ? (
              <img src={coverUrl} alt="封面预览" data-testid="cover-image" />
            ) : (
              <span>无封面</span>
            )}
          </div>

          <div className="cover-copy">
            {meta.cover ? (
              <>
                <strong className="cover-file-name">{meta.cover.fileName}</strong>
                <span className="cover-file-meta">
                  {formatFileSize(meta.cover.bytes.byteLength)} ·{' '}
                  {coverExtension(meta.cover.mimeType).toUpperCase()}
                </span>
              </>
            ) : (
              <span className="cover-file-meta">留空则导出无封面 EPUB。</span>
            )}

            <div className="cover-actions">
              <button
                type="button"
                className="cover-button"
                onClick={() => coverInputRef.current?.click()}
                disabled={disabled || coverLoading}
                data-testid="cover-upload"
              >
                {meta.cover ? '更换封面' : '上传封面'}
              </button>
              <button
                type="button"
                className="cover-button cover-paste-button"
                onClick={() => void handlePasteClick()}
                disabled={disabled || coverLoading}
                title="从剪贴板读取图片"
                data-testid="cover-paste"
              >
                粘贴图片
              </button>
              {meta.cover ? (
                <button
                  type="button"
                  className="cover-remove"
                  onClick={handleRemoveCover}
                  disabled={disabled || coverLoading}
                  data-testid="cover-remove"
                >
                  移除
                </button>
              ) : null}
            </div>

            <p className="cover-hint">
              JPG / PNG / GIF，建议竖版，不超过 10MB；也可复制图片后点“粘贴图片”。
            </p>
            {coverError ? (
              <p className="cover-error" role="alert" data-testid="cover-error">
                {coverError}
              </p>
            ) : null}
            {pasteArmed && !disabled ? (
              <p className="cover-paste-hint" role="status" data-testid="cover-paste-hint">
                已开启粘贴模式，请按 ⌘V / Ctrl+V 粘贴图片。
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
