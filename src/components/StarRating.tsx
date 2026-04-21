import { useState } from 'react';
import { Star } from 'lucide-react';

type Size = 'sm' | 'md' | 'lg';

interface StarRatingProps {
  value: number;
  count?: number;
  onRate?: (rating: number) => void;
  readOnly?: boolean;
  size?: Size;
  showCount?: boolean;
}

const SIZE_MAP: Record<Size, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-5 h-5',
  lg: 'w-7 h-7',
};

function snapToHalf(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(5, Math.round(v * 2) / 2);
}

function fillPercent(displayValue: number, n: number): number {
  if (displayValue >= n) return 100;
  if (displayValue >= n - 0.5) return 50;
  return 0;
}

export function StarRating({
  value,
  count = 0,
  onRate,
  readOnly = false,
  size = 'md',
  showCount = true,
}: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const interactive = !readOnly && !!onRate;
  const baseValue = snapToHalf(value);
  const displayValue = interactive && hovered !== null ? hovered : baseValue;

  const starClass = SIZE_MAP[size];
  const textClass = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm';

  return (
    <div className="inline-flex items-center gap-1.5">
      <div
        className="inline-flex items-center"
        onMouseLeave={() => setHovered(null)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const pct = fillPercent(displayValue, n);
          return (
            <button
              key={n}
              type="button"
              disabled={!interactive}
              onMouseEnter={() => interactive && setHovered(n)}
              onFocus={() => interactive && setHovered(n)}
              onBlur={() => interactive && setHovered(null)}
              onClick={(e) => {
                if (!interactive) return;
                e.stopPropagation();
                e.preventDefault();
                onRate?.(n);
              }}
              className={`${interactive ? 'cursor-pointer' : 'cursor-default'} p-0.5 transition-transform ${
                interactive ? 'hover:scale-110' : ''
              }`}
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
            >
              <span className="relative inline-block leading-none">
                <Star className={`${starClass} fill-none text-gray-300`} />
                {pct > 0 && (
                  <span
                    className="absolute inset-y-0 left-0 overflow-hidden pointer-events-none"
                    style={{ width: `${pct}%` }}
                  >
                    <Star
                      className={`${starClass} fill-amber-400 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]`}
                    />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {showCount && (
        <span className={`${textClass} text-gray-500 font-medium`}>
          ({count})
        </span>
      )}
    </div>
  );
}
