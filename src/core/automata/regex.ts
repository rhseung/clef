import { match } from 'ts-pattern';
import { CharSet } from './charset';

export type Regex =
  | { kind: 'empty' }
  | { kind: 'epsilon' }
  | { kind: 'charset'; set: CharSet }
  | { kind: 'concat'; left: Regex; right: Regex }
  | { kind: 'alt'; left: Regex; right: Regex }
  | { kind: 'star'; expr: Regex };

// 0개면 항등원, concat은 epsilon, alt는 emptyset
const fold =
  (kind: 'concat' | 'alt', identity: Regex) =>
  (...r: Regex[]): Regex =>
    r.length === 0 ? identity : r.reduceRight((right, left) => ({ kind, left, right }));

// LR
export const concat = fold('concat', { kind: 'epsilon' });

// L|R
export const alt = fold('alt', { kind: 'empty' });

// R*
export const star = (expr: Regex): Regex => ({ kind: 'star', expr });

// R+ = RR*
export const plus = (r: Regex): Regex => concat(r, star(r));

// R?
export const optional = (r: Regex): Regex => alt(r, { kind: 'epsilon' });

export const charset = (set: CharSet): Regex => ({ kind: 'charset', set });

// 'def' -> concat(d, e, f)
export const literal = (s: string): Regex =>
  concat(...Array.from(s, (ch) => charset(CharSet.of(ch))));

export const toJsRegex = (r: Regex): RegExp => {
  const source = (r: Regex): string =>
    match(r)
      .with({ kind: 'empty' }, () => '[]')
      .with({ kind: 'epsilon' }, () => '(?:)')
      .with({ kind: 'charset' }, ({ set }) => String(set))
      .with({ kind: 'concat' }, ({ left, right }) => source(left) + source(right))
      .with({ kind: 'alt' }, ({ left, right }) => `(?:${source(left)}|${source(right)})`)
      .with({ kind: 'star' }, ({ expr }) => `(?:${source(expr)})*`)
      .exhaustive();

  return new RegExp(`^(?:${source(r)})$`, 'u');
};
