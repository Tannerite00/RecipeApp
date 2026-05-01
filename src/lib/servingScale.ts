const UNICODE_FRACTIONS: Record<string, number> = {
  '\u00BC': 1/4, '\u00BD': 1/2, '\u00BE': 3/4,
  '\u2150': 1/7, '\u2151': 1/9, '\u2152': 1/10,
  '\u2153': 1/3, '\u2154': 2/3, '\u2155': 1/5,
  '\u2156': 2/5, '\u2157': 3/5, '\u2158': 4/5,
  '\u2159': 1/6, '\u215A': 5/6, '\u215B': 1/8,
  '\u215C': 3/8, '\u215D': 5/8, '\u215E': 7/8,
};

const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');
const LEADING_QTY_RE = new RegExp(
  `^\\s*(\\d+\\s*[${FRACTION_CHARS}]|\\d+\\/\\d+|\\d+\\.\\d+|\\d+|[${FRACTION_CHARS}])(.*)$`
);

function parseFraction(s: string): number {
  s = s.trim();
  for (const [ch, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (s.includes(ch)) {
      const before = s.replace(ch, '').trim();
      return (before ? parseFloat(before) : 0) + val;
    }
  }
  if (s.includes('/')) {
    const [n, d] = s.split('/');
    return parseFloat(n) / parseFloat(d);
  }
  return parseFloat(s);
}

function toFriendlyFraction(n: number): string {
  if (n === 0) return '0';

  const whole = Math.floor(n);
  const frac = n - whole;

  if (Math.abs(frac) < 0.01) return String(whole);

  const fractions: [number, string][] = [
    [1/8, '\u215B'], [1/4, '\u00BC'], [1/3, '\u2153'],
    [3/8, '\u215C'], [1/2, '\u00BD'], [5/8, '\u215D'],
    [2/3, '\u2154'], [3/4, '\u00BE'], [7/8, '\u215E'],
  ];

  let best = '';
  let bestDiff = Infinity;
  for (const [val, ch] of fractions) {
    const diff = Math.abs(frac - val);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = ch;
    }
  }

  if (bestDiff < 0.04) {
    return whole > 0 ? `${whole}${best}` : best;
  }

  const rounded = Math.round(n * 100) / 100;
  if (rounded === Math.round(rounded)) return String(Math.round(rounded));
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function scaleIngredient(ingredient: string, multiplier: number): string {
  const cleaned = ingredient.trim().replace(/<[^>]*>/g, '');
  if (multiplier === 1) return cleaned;

  const match = cleaned.match(LEADING_QTY_RE);
  if (!match) return cleaned;

  const rawQty = match[1].trim();
  const rest = match[2];

  const originalQty = parseFraction(rawQty);
  if (isNaN(originalQty) || originalQty === 0) return cleaned;

  const scaled = originalQty * multiplier;
  return `${toFriendlyFraction(scaled)}${rest}`;
}

export function parseServingCount(servings: string): number | null {
  if (!servings) return null;
  const s = servings.trim();

  const simple = s.match(/^(\d+)$/);
  if (simple) return parseInt(simple[1]);

  const patterns = [
    /serves\s+(\d+)/i,
    /(\d+)\s+servings?/i,
    /makes\s+(\d+)/i,
    /(\d+)\s+cups?/i,
    /(\d+)\s+bowls?/i,
    /(\d+)\s+salads?/i,
    /yields?\s+(\d+)/i,
    /make\s+(\d+)/i,
    /(\d+)\s+burgers?/i,
    /(\d+)\s+tacos?/i,
    /(\d+)\s+skewers?/i,
    /(\d+)\s+poppers?/i,
    /(\d+)\s+fritters?/i,
    /(\d+)\s+biscuits?/i,
    /(\d+)\s+waffles?/i,
    /about\s+(\d+)/i,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m) return parseInt(m[1]);
  }

  const rangeMatch = s.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) return parseInt(rangeMatch[1]);

  const anyNum = s.match(/(\d+)/);
  if (anyNum) return parseInt(anyNum[1]);

  return null;
}

