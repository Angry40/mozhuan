import { formatCharacterCount } from '../core/download';
import type { EpubSource } from '../core/types';

const NAV_LABELS: Record<EpubSource['navigationSource'], string> = {
  nav: 'nav.xhtml',
  ncx: 'toc.ncx',
  spine: 'spine 顺序',
};

export function EpubInfoPanel({ source }: { source: EpubSource }) {
  const images = source.chapters.reduce((sum, chapter) => sum + chapter.imageCount, 0);

  return (
    <section className="panel epub-info-panel" data-testid="epub-info">
      <div className="panel-heading">
        <span className="step">EPUB</span>
        <h2>EPUB 结构</h2>
        <span className="panel-hint">已解析</span>
      </div>

      <div className="epub-info-grid">
        <div>
          <strong>{source.totalChapters}</strong>
          <span>章</span>
        </div>
        <div>
          <strong>{formatCharacterCount(source.totalCharacters)}</strong>
        </div>
        <div>
          <strong>{images}</strong>
          <span>内联图</span>
        </div>
        <div>
          <strong>{source.cover ? '已提取' : '无'}</strong>
          <span>封面</span>
        </div>
      </div>

      <p className="epub-info-note">
        目录来源：{NAV_LABELS[source.navigationSource]}。原 EPUB 的 CSS 与排版不会保留，将按下方选项全量重建。
      </p>
    </section>
  );
}
