import {
  TITLE_PRESETS,
  type DividerStyle,
  type ImageRemoval,
  type NumberFormat,
  type Options,
} from '../core/types';
import { Segmented, Slider, Switch } from './controls';

export function OptionsPanel({
  options,
  onChange,
  removedCount,
  imageRemovals,
  imageCleanupLocked = false,
  showFallback,
}: {
  options: Options;
  onChange: (options: Options) => void;
  removedCount: number;
  imageRemovals: ImageRemoval[];
  imageCleanupLocked?: boolean;
  showFallback: boolean;
}) {
  const patch = (changes: Partial<Options>) => onChange({ ...options, ...changes });
  const patchTitle = (changes: Partial<Options['title']>) =>
    patch({ title: { ...options.title, ...changes } });

  return (
    <section className="panel">
      <div className="panel-heading">
        <span className="step">03</span>
        <h2>排版选项</h2>
      </div>

      <div className="option-group">
        <Switch
          checked={options.removeImages}
          onChange={(removeImages) => patch({ removeImages })}
          label="清除插图"
          description={
            imageCleanupLocked
              ? 'EPUB 内联插图在当前版本会统一清理，封面会单独保留。'
              : '移除图片标签、图片链接与 [插图] 占位符；关闭只保留原文字，不联网抓图。'
          }
          disabled={imageCleanupLocked}
          testId="toggle-images"
        />
        {removedCount > 0 ? (
          <p className="option-note" data-testid="removed-count">
            已从正文中移除 {removedCount} 处图片标记
          </p>
        ) : null}
        {options.removeImages && imageRemovals.length > 0 ? (
          <details className="removal-details" data-testid="removal-details">
            <summary>查看被移除的图片标记</summary>
            <ul>
              {imageRemovals.slice(0, 50).map((removal, index) => (
                <li key={`${removal.chapterId}-${index}`}>
                  <span className="removal-chapter">{removal.chapterTitle}</span>
                  <code>{removal.snippet}</code>
                </li>
              ))}
            </ul>
            {imageRemovals.length > 50 ? <p>仅显示前 50 条。</p> : null}
          </details>
        ) : null}
      </div>

      <div className="option-group">
        <Switch
          checked={options.filterBlankLines}
          onChange={(filterBlankLines) => patch({ filterBlankLines })}
          label="过滤空行和空白行"
          description="丢弃纯空行，并清理只含零宽字符、盲文空白、&nbsp; 等不可见字符的假空行；关闭后仅忽略普通空行。"
          testId="toggle-blank-lines"
        />
      </div>

      <div className="option-group">
        <Switch
          checked={options.indent.enabled}
          onChange={(enabled) => patch({ indent: { ...options.indent, enabled } })}
          label="首行缩进"
          testId="toggle-indent"
        />
        <Slider
          id="indent-em"
          label="缩进量"
          value={options.indent.em}
          min={0}
          max={4}
          step={0.5}
          disabled={!options.indent.enabled}
          onChange={(em) => patch({ indent: { ...options.indent, em } })}
          testId="indent-range"
        />
      </div>

      <div className="option-group">
        <Switch
          checked={options.paragraphGap.enabled}
          onChange={(enabled) =>
            patch({ paragraphGap: { ...options.paragraphGap, enabled } })
          }
          label="段间距"
          testId="toggle-gap"
        />
        <Slider
          id="gap-em"
          label="段间距大小"
          value={options.paragraphGap.em}
          min={0}
          max={2}
          step={0.1}
          disabled={!options.paragraphGap.enabled}
          onChange={(em) => patch({ paragraphGap: { ...options.paragraphGap, em } })}
          testId="gap-range"
        />
      </div>

      <div className="option-group option-group-title">
        <Switch
          checked={options.title.enabled}
          onChange={(enabled) => patchTitle({ enabled })}
          label="章节标题美化"
          description="只调整标题的编号、排版与装饰，不改动正文。"
          testId="toggle-title"
        />

        <div className="preset-grid" role="radiogroup" aria-label="标题版式">
          {TITLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={options.title.preset === preset.id}
              className={`preset-card${options.title.preset === preset.id ? ' is-active' : ''}`}
              onClick={() => patchTitle({ preset: preset.id })}
              data-testid={`preset-${preset.id}`}
            >
              <span className={`preset-sample preset-sample-${preset.id}`}>
                <span className="preset-sample-line" />
                {preset.id === 'inline' ? (
                  <>
                    <span className="preset-sample-tag">第一章</span>
                    初入江湖
                  </>
                ) : (
                  '第一章'
                )}
              </span>
              <strong>{preset.name}</strong>
              <small>{preset.hint}</small>
            </button>
          ))}
        </div>

        <div className="inline-field">
          <span className="inline-label">编号</span>
          <Segmented<NumberFormat>
            label="章节编号格式"
            value={options.title.numbering}
            onChange={(numbering) => patchTitle({ numbering })}
            testIdPrefix="numbering"
            options={[
              { value: 'keep', label: '保持原文' },
              { value: 'arabic', label: '阿拉伯数字' },
              { value: 'chinese', label: '中文数字' },
            ]}
          />
        </div>

        <div className="inline-field">
          <span className="inline-label">装饰</span>
          <Segmented<DividerStyle>
            label="标题装饰"
            value={options.title.divider}
            onChange={(divider) => patchTitle({ divider })}
            testIdPrefix="divider"
            options={[
              { value: 'none', label: '无' },
              { value: 'line', label: '细线' },
              { value: 'ornament', label: '花饰' },
            ]}
          />
        </div>

        <div className="sub-switches">
          <Switch
            checked={options.title.cleanNoise}
            onChange={(cleanNoise) => patchTitle({ cleanNoise })}
            label="清洗推广语"
            description="去掉“（求月票）”“（本章完）”等标题后缀。"
            testId="toggle-clean-noise"
          />
          <Switch
            checked={options.title.autofillNumber}
            onChange={(autofillNumber) => patchTitle({ autofillNumber })}
            label="自动补全缺失章号"
            description="没有“第X章”标题时，尝试识别无编号短标题并补号。"
            testId="toggle-autofill"
          />
        </div>
      </div>

      {showFallback ? (
        <div className="option-group option-group-fallback">
          <p className="option-label">未识别到章节时</p>
          <Segmented<'single' | 'chunk'>
            label="章节兜底方式"
            value={options.fallbackSplit}
            onChange={(fallbackSplit) => patch({ fallbackSplit })}
            testIdPrefix="fallback"
            options={[
              { value: 'single', label: '整本单章' },
              { value: 'chunk', label: '按约 3000 字分节' },
            ]}
          />
        </div>
      ) : null}
    </section>
  );
}
