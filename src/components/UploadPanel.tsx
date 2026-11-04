import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ENCODING_OPTIONS } from '../core/encoding';
import { formatFileSize } from '../core/download';
import type { SupportedEncoding } from '../core/types';

export interface SourceSummary {
  fileName: string;
  fileSize: number;
  format: 'txt' | 'epub';
  encoding?: SupportedEncoding;
  replacementCount?: number;
}

export function UploadPanel({
  source,
  loading,
  onFile,
  onEncodingChange,
  onLoadSample,
}: {
  source: SourceSummary | null;
  loading: boolean;
  onFile: (file: File) => void;
  onEncodingChange: (encoding: SupportedEncoding) => void;
  onLoadSample: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const openPicker = () => {
    if (!loading) inputRef.current?.click();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (loading) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <span className="step">01</span>
        <h2>源文件</h2>
        <span className="panel-hint">TXT / EPUB</span>
      </div>

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".txt,.epub,text/plain,application/epub+zip"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
        data-testid="file-input"
      />

      <div
        className={`dropzone${dragging ? ' is-dragging' : ''}${source ? ' is-loaded' : ''}${
          loading ? ' is-busy' : ''
        }`}
        role="button"
        tabIndex={0}
        aria-label={source ? '更换 TXT 或 EPUB 文件' : '选择 TXT 或 EPUB 文件'}
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="dropzone-icon">
          {source ? (
            source.format.toUpperCase()
          ) : (
            <>
              TXT
              <br />
              EPUB
            </>
          )}
        </div>
        <div className="dropzone-copy">
          <strong>
            {loading ? '正在读取…' : source ? source.fileName : '拖入 TXT / EPUB，或点击选择'}
          </strong>
          <span>
            {source
              ? source.format === 'epub'
                ? `${formatFileSize(source.fileSize)} · EPUB 源文件 · 将按下方选项重新排版`
                : `${formatFileSize(source.fileSize)} · 当前编码 ${(source.encoding ?? 'utf-8').toUpperCase()}`
              : '支持 TXT 与 EPUB，文件只在本机读取'}
          </span>
        </div>
        <span className="dropzone-action">{source ? '换一本' : '选择文件'}</span>
      </div>

      {source?.format === 'txt' ? (
        <div className="encoding-row">
          <label htmlFor="encoding-select">编码</label>
          <select
            id="encoding-select"
            value={source.encoding ?? 'utf-8'}
            onChange={(event) => onEncodingChange(event.target.value as SupportedEncoding)}
            disabled={loading}
            data-testid="encoding-select"
          >
            {ENCODING_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {(source.replacementCount ?? 0) > 0 ? (
            <span className="inline-warning">有 {source.replacementCount} 个乱码字符</span>
          ) : null}
        </div>
      ) : null}

      <div className="sample-row">
        <button
          type="button"
          className="text-button"
          onClick={onLoadSample}
          disabled={loading}
          data-testid="load-sample"
        >
          加载示例小说
        </button>
        <span className="sample-hint">先看看效果</span>
      </div>
    </section>
  );
}
