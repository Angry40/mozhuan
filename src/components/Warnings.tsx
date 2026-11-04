import type { ParseWarning } from '../core/types';

export function Warnings({ warnings }: { warnings: ParseWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="warnings" data-testid="warnings">
      {warnings.map((warning, index) => (
        <div className="warning" key={`${warning.code}-${index}`}>
          <span className="warning-mark" aria-hidden="true">
            !
          </span>
          <p>{warning.message}</p>
        </div>
      ))}
    </div>
  );
}
