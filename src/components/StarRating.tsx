import { useState } from 'react';
import { Star } from 'lucide-react';

type Size = 'sm' | 'md' | 'lg';

interface StarRatingProps {
  value: number;
  count?: number;
  userRating?: number | null;
  onRate?: (rating: number) => void;
  readOnly?: boolean;
  size?: Size;
  showCount?: boolean;
}

const SIZE_MAP: Record<Size, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export function StarRating({
  value,
  count = 0,
  userRating = null,
  onRate,
  readOnly = false,
  size = 'md',
  showCount = true,
}: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const interactive = !readOnly && !!onRate;
  const displayValue = interactive && hovered !== null ? hovered : userRating ?? Math.round(value);

  const starClass = SIZE_MAP[size];
  const textClass = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm';

  return (
    <div className="inline-flex items-center gap-1.5">
      <div
        className="inline-flex items-center"
        onMouseLeave={() => setHovered(null)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= displayValue;
          return (
            <button
              key={n}
              type="button"
              disabled={!interactive}
              onMouseEnter={() => interactive && setHovered(n)}
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
              <Star
                className={`${starClass} transition-colors ${
                  filled
                    ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]'
                    : 'fill-none text-gray-300'
                }`}
              />
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
