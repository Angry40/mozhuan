import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChapterEditor } from './components/ChapterEditor';
import { ChapterList } from './components/ChapterList';
import { EmptyChapterNotice } from './components/EmptyChapterNotice';
import { EpubInfoPanel } from './components/EpubInfoPanel';
import { MetadataPanel } from './components/MetadataPanel';
import { OptionsPanel } from './components/OptionsPanel';
import { PreviewPane } from './components/PreviewPane';
import { StatsBar } from './components/StatsBar';
import { UploadPanel, type SourceSummary } from './components/UploadPanel';
import { Warnings } from './components/Warnings';
import { downloadEpub, epubFileName, defaultTitleFromFileName, formatFileSize } from './core/download';
import { detectAndDecode, decodeWith, normalizeText, TextDecodeError } from './core/encoding';
import { buildEpubBytes } from './core/epub/build';
import { buildBookFromEpub } from './core/epub/import';
import { parseEpub } from './core/epub/parsers';
import { buildBook, computeBookStats } from './core/pipeline';
import { renderPreviewDocument } from './core/rendering';
import { applyChapterOverrides } from './core/review';
import {
  DEFAULT_OPTIONS,
  type Chapter,
  type ChapterOverride,
  type EpubMeta,
  type EpubSource,
  type Options,
  type ParseWarning,
  type ParsedBook,
  type SupportedEncoding,
} from './core/types';

interface TxtSourceState extends SourceSummary {
  format: 'txt';
  buffer: ArrayBuffer;
  text: string;
  encoding: SupportedEncoding;
  replacementCount: number;
}

interface EpubSourceState extends SourceSummary {
  format: 'epub';
  buffer: ArrayBuffer;
  epub: EpubSource;
}

type SourceState = TxtSourceState | EpubSourceState;

/** 生成完成后先展示、再由用户点击下载的导出结果。 */
interface ExportResult {
  bytes: Uint8Array;
  fileName: string;
  /** 交给 downloadEpub 的书名，保证与卡片上的文件名一致。 */
  title: string;
  chapterCount: number;
  excludedCount: number;
}

const EMPTY_CHAPTERS: Chapter[] = [];

function describeError(error: unknown): string {
  if (error instanceof TextDecodeError) return error.message;
  if (error instanceof Error) return error.message;
  return '发生了未知错误，请重试。';
}

function sameParagraphs(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((paragraph, index) => paragraph === right[index]);
}

export default function App() {
  const [source, setSource] = useState<SourceState | null>(null);
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [meta, setMeta] = useState<EpubMeta>({
    title: '',
    author: '',
    language: 'zh-CN',
  });
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
  const [excludedChapterIds, setExcludedChapterIds] = useState<number[]>([]);
  const [chapterOverrides, setChapterOverrides] = useState<Record<number, ChapterOverride>>({});
  const [editingChapterId, setEditingChapterId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  // 每次导出输入变化时自增；生成期间若用户改了选项，结果会被丢弃而不是变成过期文件。
  const inputEpochRef = useRef(0);

  const resetReview = useCallback(() => {
    setActiveChapterId(null);
    setExcludedChapterIds([]);
    setChapterOverrides({});
    setEditingChapterId(null);
  }, []);

  const loadTxtBuffer = useCallback(
    async (buffer: ArrayBuffer, fileName: string, fileSize: number) => {
      const decoded = detectAndDecode(buffer);
      const text = normalizeText(decoded.text);
      if (!text) throw new Error('文件里没有可读取的正文内容。');

      setSource({
        format: 'txt',
        buffer,
        fileName,
        fileSize,
        text,
        encoding: decoded.encoding,
        replacementCount: decoded.replacementCount,
      });
      setMeta((previous) => ({
        title: defaultTitleFromFileName(fileName),
        author: '',
        language: previous.language,
      }));
      resetReview();
      setProgress(0);
      setError(null);
    },
    [resetReview],
  );

  const loadEpubBuffer = useCallback(
    async (buffer: ArrayBuffer, fileName: string, fileSize: number) => {
      const epub = await parseEpub(buffer, fileName);
      setSource({ format: 'epub', buffer, fileName, fileSize, epub });
      setMeta({
        title: epub.metadata.title || defaultTitleFromFileName(fileName),
        author: epub.metadata.author,
        language: epub.metadata.language,
        cover: epub.cover ?? undefined,
        identifier: epub.metadata.identifier || undefined,
        modified: epub.metadata.modified || undefined,
      });
      // Inline EPUB images are cleaned in this version. Keep the visual option
      // consistent with what the converter actually does.
      setOptions((previous) =>
        previous.removeImages ? previous : { ...previous, removeImages: true },
      );
      resetReview();
      setProgress(0);
      setError(null);
    },
    [resetReview],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      const isEpub = /\.epub$/i.test(file.name) || file.type === 'application/epub+zip';
      const isTxt = /\.txt$/i.test(file.name) || file.type.startsWith('text/');
      if (!isEpub && !isTxt) {
        setError('请选择 .txt 或 .epub 文件。');
        return;
      }

      setLoading(true);
      try {
        const buffer = await file.arrayBuffer();
        if (isEpub) {
          await loadEpubBuffer(buffer, file.name, file.size);
        } else {
          await loadTxtBuffer(buffer, file.name, file.size);
        }
      } catch (readError) {
        setError(describeError(readError));
      } finally {
        setLoading(false);
      }
    },
    [loadEpubBuffer, loadTxtBuffer],
  );

  const handleEncodingChange = useCallback(
    (encoding: SupportedEncoding) => {
      if (!source || source.format !== 'txt') return;
      try {
        const decoded = decodeWith(source.buffer, encoding);
        const text = normalizeText(decoded.text);
        if (!text) throw new Error('按这个编码没有读到正文，请换一种编码。');
        setSource({
          ...source,
          text,
          encoding,
          replacementCount: decoded.replacementCount,
        });
        resetReview();
        setError(null);
      } catch (decodeError) {
        setError(describeError(decodeError));
      }
    },
    [resetReview, source],
  );

  const handleLoadSample = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample/示例小说.txt`);
      if (!response.ok) throw new Error(`示例小说加载失败（HTTP ${response.status}）。`);
      const buffer = await response.arrayBuffer();
      await loadTxtBuffer(buffer, '示例小说.txt', buffer.byteLength);
    } catch (sampleError) {
      setError(describeError(sampleError));
    } finally {
      setLoading(false);
    }
  }, [loadTxtBuffer]);

  // buildBook only reads these option fields; indent/gap/preset/divider are
  // applied during rendering, so dragging those sliders does not re-parse the
  // entire novel.
  const parsed: ParsedBook | null = useMemo(() => {
    if (!source) return null;
    return source.format === 'txt'
      ? buildBook(source.text, options)
      : buildBookFromEpub(source.epub, options);
  }, [
    source,
    options.removeImages,
    options.fallbackSplit,
    options.title.enabled,
    options.title.numbering,
    options.title.cleanNoise,
    options.title.autofillNumber,
  ]);

  const sourceChapters = parsed?.chapters ?? EMPTY_CHAPTERS;
  const excludedSet = useMemo(() => new Set(excludedChapterIds), [excludedChapterIds]);

  const chapters = useMemo<Chapter[]>(
    () =>
      applyChapterOverrides(
        sourceChapters.filter((chapter) => !excludedSet.has(chapter.id)),
        chapterOverrides,
        options,
      ),
    [
      chapterOverrides,
      excludedSet,
      options.title.cleanNoise,
      options.title.enabled,
      options.title.numbering,
      options.title.autofillNumber,
      sourceChapters,
    ],
  );

  const stats = useMemo(() => computeBookStats(chapters), [chapters]);
  const emptyChapters = useMemo(
    () => chapters.filter((chapter) => chapter.paragraphs.length === 0 && chapter.kind !== 'volume'),
    [chapters],
  );

  const activeIndexFound = chapters.findIndex((chapter) => chapter.id === activeChapterId);
  const safeIndex = activeIndexFound >= 0 ? activeIndexFound : 0;
  const selectedChapter = chapters[safeIndex] ?? null;

  useEffect(() => {
    if (chapters.length === 0) {
      if (activeChapterId !== null) setActiveChapterId(null);
      return;
    }
    if (activeChapterId === null || !chapters.some((chapter) => chapter.id === activeChapterId)) {
      setActiveChapterId(chapters[0].id);
    }
  }, [activeChapterId, chapters]);

  useEffect(() => {
    if (
      editingChapterId !== null &&
      !chapters.some((chapter) => chapter.id === editingChapterId)
    ) {
      setEditingChapterId(null);
    }
  }, [chapters, editingChapterId]);

  const previewHtml = useMemo(
    () => (selectedChapter ? renderPreviewDocument(selectedChapter, options, meta) : ''),
    [selectedChapter, options, meta],
  );

  const warnings = useMemo<ParseWarning[]>(() => {
    const list = parsed ? [...parsed.warnings] : [];
    if (source?.format === 'txt' && source.replacementCount > 0) {
      list.unshift({
        code: 'encoding-fallback',
        message: `当前编码下有 ${source.replacementCount} 个字符无法正确解码，如正文有乱码请在“源文件”处切换编码。`,
      });
    }
    if (source && source.fileSize > 20 * 1024 * 1024) {
      list.unshift({
        code: 'large-file',
        message: `文件较大（${formatFileSize(source.fileSize)}），解析与生成可能需要更久，请耐心等待。`,
      });
    }
    return list;
  }, [parsed, source]);

  const visibleWarnings = useMemo<ParseWarning[]>(() => {
    const list = warnings.filter(
      (warning) => warning.code !== 'empty-book' || stats.characters === 0,
    );
    if (source && chapters.length === 0) {
      list.unshift({
        code: 'empty-book',
        message: '所有章节都已从导出中排除，请恢复章节或重新导入源文件。',
      });
    }
    return list;
  }, [chapters.length, source, stats.characters, warnings]);

  const showFallback = Boolean(parsed?.warnings.some((warning) => warning.code === 'no-headings'));
  const canExport = Boolean(source && chapters.length > 0 && stats.characters > 0 && !exporting);

  const editingChapter =
    editingChapterId === null
      ? null
      : chapters.find((chapter) => chapter.id === editingChapterId) ?? null;
  const editingOriginal =
    editingChapterId === null
      ? null
      : sourceChapters.find((chapter) => chapter.id === editingChapterId) ?? null;
  const editingHasOverride =
    editingChapterId !== null && chapterOverrides[editingChapterId] !== undefined;

  const handleSelectChapter = useCallback(
    (index: number) => {
      const target = chapters[index];
      if (target) setActiveChapterId(target.id);
    },
    [chapters],
  );

  const handleLocateChapter = useCallback((chapterId: number) => {
    setActiveChapterId(chapterId);
    window.requestAnimationFrame(() => {
      document.getElementById('preview-card')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, []);

  const handleOpenEditor = useCallback((chapterId: number) => {
    setActiveChapterId(chapterId);
    setEditingChapterId(chapterId);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditingChapterId(null);
  }, []);

  const handleDeleteChapter = useCallback(
    (chapterId: number) => {
      setExcludedChapterIds((previous) =>
        previous.includes(chapterId) ? previous : [...previous, chapterId],
      );
      setEditingChapterId((previous) => (previous === chapterId ? null : previous));
      if (activeChapterId === chapterId) setActiveChapterId(null);
    },
    [activeChapterId],
  );

  const handleDeleteAllEmpty = useCallback(() => {
    const ids = emptyChapters.map((chapter) => chapter.id);
    if (ids.length === 0) return;
    setExcludedChapterIds((previous) => Array.from(new Set([...previous, ...ids])));
    setEditingChapterId((previous) =>
      previous !== null && ids.includes(previous) ? null : previous,
    );
    if (activeChapterId !== null && ids.includes(activeChapterId)) {
      setActiveChapterId(null);
    }
  }, [activeChapterId, emptyChapters]);

  const handleRestoreAll = useCallback(() => {
    setExcludedChapterIds([]);
  }, []);

  const handleSaveChapterEdit = useCallback(
    (payload: { title: string; paragraphs: string[] }) => {
      if (editingChapterId === null) return;
      const original = sourceChapters.find((chapter) => chapter.id === editingChapterId);
      const next: ChapterOverride = { ...(chapterOverrides[editingChapterId] ?? {}) };
      const nextTitle = payload.title.trim();

      if (original && nextTitle === original.title.full) {
        delete next.title;
      } else if (nextTitle) {
        next.title = nextTitle;
      }

      if (original && sameParagraphs(original.paragraphs, payload.paragraphs)) {
        delete next.paragraphs;
      } else {
        next.paragraphs = payload.paragraphs;
      }

      setChapterOverrides((previous) => {
        const updated = { ...previous };
        if (next.title === undefined && next.paragraphs === undefined) {
          delete updated[editingChapterId];
        } else {
          updated[editingChapterId] = next;
        }
        return updated;
      });
      setEditingChapterId(null);
    },
    [chapterOverrides, editingChapterId, sourceChapters],
  );

  const handleResetChapterEdit = useCallback(() => {
    if (editingChapterId === null) return;
    setChapterOverrides((previous) => {
      const next = { ...previous };
      delete next[editingChapterId];
      return next;
    });
    setEditingChapterId(null);
  }, [editingChapterId]);

  // 导出输入（源文件、选项、元数据、章节）一旦变化，之前生成的文件卡片就失效。
  useEffect(() => {
    inputEpochRef.current += 1;
    setExportResult(null);
  }, [source, options, meta, chapters, excludedChapterIds]);

  const handleExport = useCallback(async () => {
    if (!source || chapters.length === 0 || stats.characters === 0) {
      return;
    }
    const epoch = inputEpochRef.current;
    setExporting(true);
    setProgress(0);
    setError(null);
    setExportResult(null);
    try {
      const effectiveMeta: EpubMeta = {
        ...meta,
        title: meta.title.trim() || defaultTitleFromFileName(source.fileName),
      };
      const bytes = await buildEpubBytes(chapters, effectiveMeta, options, {
        onProgress: (value) => setProgress(value),
      });
      setProgress(100);
      if (epoch !== inputEpochRef.current) {
        // 生成期间用户改了选项或章节：丢弃这次结果，避免展示过期文件。
        setProgress(0);
        return;
      }
      setExportResult({
        bytes,
        fileName: epubFileName(effectiveMeta.title),
        title: effectiveMeta.title,
        chapterCount: chapters.length,
        excludedCount: excludedChapterIds.length,
      });
    } catch (exportError) {
      setProgress(0);
      setError(describeError(exportError));
    } finally {
      setExporting(false);
    }
  }, [chapters, excludedChapterIds.length, meta, options, source, stats.characters]);

  const handleDownload = useCallback(() => {
    if (!exportResult) return;
    downloadEpub(exportResult.bytes, exportResult.title);
  }, [exportResult]);

  const handleDiscardExport = useCallback(() => {
    setExportResult(null);
  }, []);

  const handleReset = useCallback(() => {
    if (exporting) return;
    setSource(null);
    setOptions(DEFAULT_OPTIONS);
    setMeta({ title: '', author: '', language: 'zh-CN' });
    resetReview();
    setProgress(0);
    setError(null);
  }, [exporting, resetReview]);

  const handleOptionsChange = useCallback(
    (next: Options) => {
      const reviewMayChange =
        next.fallbackSplit !== options.fallbackSplit ||
        next.title.autofillNumber !== options.title.autofillNumber;
      setOptions(next);
      if (reviewMayChange) {
        resetReview();
      }
    },
    [options.fallbackSplit, options.title.autofillNumber, resetReview],
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            墨
          </div>
          <div>
            <h1>墨转</h1>
            <p>TXT / EPUB 小说 · 本地排版工具</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="privacy-pill">
            <span className="privacy-dot" aria-hidden="true" />
            仅在本机处理
          </span>
          {source ? (
            <button type="button" className="ghost-button" onClick={handleReset} disabled={exporting}>
              重置
            </button>
          ) : null}
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar" aria-label="设置">
          <UploadPanel
            source={source}
            loading={loading}
            onFile={handleFile}
            onEncodingChange={handleEncodingChange}
            onLoadSample={handleLoadSample}
          />
          {source?.format === 'epub' ? <EpubInfoPanel source={source.epub} /> : null}
          <MetadataPanel meta={meta} onChange={setMeta} disabled={!source} />
          <OptionsPanel
            options={options}
            onChange={handleOptionsChange}
            removedCount={stats.imagesRemoved}
            imageRemovals={
              parsed?.imageRemovals.filter((removal) => !excludedSet.has(removal.chapterId)) ?? []
            }
            imageCleanupLocked={source?.format === 'epub'}
            showFallback={showFallback}
          />

          <section className="panel export-panel">
            <div className="panel-heading">
              <span className="step">04</span>
              <h2>导出</h2>
              <span className="panel-hint">EPUB 3</span>
            </div>
            <p className="export-hint">
              生成带目录的 EPUB 3 文件，兼容 Apple Books、Calibre 与 Kindle 转换工具。
            </p>
            <button
              type="button"
              className={exportResult ? 'secondary-button' : 'primary-button'}
              onClick={handleExport}
              disabled={!canExport}
              data-testid="export-button"
            >
              {exporting
                ? `正在生成 ${Math.round(progress)}%`
                : exportResult
                  ? '重新生成 EPUB'
                  : '生成 EPUB'}
            </button>
            {exporting ? (
              <div
                className="progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              >
                <span style={{ width: `${progress}%` }} />
              </div>
            ) : null}
            {exportResult && !exporting ? (
              <div
                className="export-result"
                role="status"
                aria-live="polite"
                data-testid="export-result"
              >
                <div className="export-file">
                  <span className="export-file-badge" aria-hidden="true">
                    EPUB
                  </span>
                  <div className="export-file-copy">
                    <strong data-testid="export-file-name">{exportResult.fileName}</strong>
                    <span data-testid="export-file-meta">
                      {formatFileSize(exportResult.bytes.byteLength)} ·{' '}
                      {exportResult.chapterCount} 章
                      {exportResult.excludedCount > 0
                        ? ` · 已排除 ${exportResult.excludedCount} 章`
                        : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="export-file-dismiss"
                    onClick={handleDiscardExport}
                    aria-label="收起转换结果"
                    title="收起转换结果"
                    data-testid="export-dismiss"
                  >
                    ×
                  </button>
                </div>
                <p className="export-file-hint">文件已在本机生成，确认无误后再保存。</p>
                <button
                  type="button"
                  className="primary-button download-button"
                  onClick={handleDownload}
                  data-testid="download-button"
                >
                  下载 EPUB
                </button>
              </div>
            ) : null}
            {!canExport && !exporting ? (
              <p className="export-hint muted">
                {source
                  ? '没有可导出的正文，请恢复章节或补充内容。'
                  : '先载入一份含正文的 TXT 或 EPUB，才能生成 EPUB。'}
              </p>
            ) : null}
          </section>
        </aside>

        <section className="reader" aria-label="预览与目录">
          {error ? (
            <div className="error-banner" role="alert" data-testid="error-banner">
              <div>
                <strong>出错了</strong>
                <span>{error}</span>
              </div>
              <button type="button" className="banner-close" onClick={() => setError(null)}>
                关闭
              </button>
            </div>
          ) : null}

          <StatsBar stats={parsed ? stats : null} />
          <Warnings warnings={visibleWarnings} />
          <EmptyChapterNotice
            chapters={emptyChapters}
            onLocate={handleLocateChapter}
            onEdit={handleOpenEditor}
            onDelete={handleDeleteChapter}
            onDeleteAll={handleDeleteAllEmpty}
          />
          {excludedChapterIds.length > 0 ? (
            <div className="review-bar" role="status" data-testid="excluded-bar">
              <span>已从导出中排除 {excludedChapterIds.length} 章 · 源 TXT 未修改</span>
              <button type="button" onClick={handleRestoreAll} data-testid="restore-excluded">
                恢复全部
              </button>
            </div>
          ) : null}
          <PreviewPane
            chapter={selectedChapter}
            chapters={chapters}
            activeIndex={safeIndex}
            previewHtml={previewHtml}
            onSelectChapter={handleSelectChapter}
            onEditChapter={handleOpenEditor}
            onDeleteChapter={handleDeleteChapter}
          />
          <ChapterList chapters={chapters} activeIndex={safeIndex} onSelect={handleSelectChapter} />
        </section>
      </main>

      <footer className="app-footer">
        <span>所有转换都在浏览器内完成，文件不会上传。</span>
        <span>纯前端 · EPUB 3 + NCX 兼容目录</span>
      </footer>

      {editingChapter && editingOriginal ? (
        <ChapterEditor
          chapter={editingChapter}
          originalParagraphs={editingOriginal.paragraphs}
          hasOverride={editingHasOverride}
          onSave={handleSaveChapterEdit}
          onReset={handleResetChapterEdit}
          onClose={handleCloseEditor}
        />
      ) : null}
    </div>
  );
}
