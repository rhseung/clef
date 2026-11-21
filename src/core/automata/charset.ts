import { filter, groupBy, map, pipe, sortBy, uniq, zip } from 'es-toolkit/fp';

export type Interval = readonly [lo: number, hi: number];

const MAX = 0x10ffff;

const codePoint = (ch: string): number => {
  const cp = ch.codePointAt(0);
  if (cp === undefined || String.fromCodePoint(cp) !== ch) {
    throw new RangeError(`not a single character: '${ch}'`);
  }
  return cp;
};

// ex. [d-f], [a-c], [b-e], [x] -> [a-f], [x]
function normalize(intervals: readonly Interval[]): Interval[] {
  const merged: [number, number][] = [];

  for (const [lo, hi] of intervals.toSorted(([a], [b]) => a - b)) {
    const last = merged.at(-1);
    // +1은 [a-c], [d-f]처럼 맞닿은 것도 합치기
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi); // 참조라 merged[-1]을 변경시킴
    else merged.push([lo, hi]);
  }

  return merged;
}

export class CharSet {
  static readonly EMPTY = new CharSet([]);

  private constructor(readonly intervals: readonly Interval[]) {}

  static from(intervals: readonly Interval[]): CharSet {
    return new CharSet(normalize(intervals));
  }

  static of(...chars: string[]): CharSet {
    return CharSet.from(chars.map(codePoint).map((cp) => [cp, cp]));
  }

  static range(lo: string, hi: string): CharSet {
    const [l, h] = [codePoint(lo), codePoint(hi)];
    if (l > h) throw new RangeError(`empty range '${lo}'-'${hi}'`);
    return new CharSet([[l, h]]);
  }

  static any(): CharSet {
    return new CharSet([[0, MAX]]);
  }

  union(o: CharSet): CharSet {
    return CharSet.from([...this.intervals, ...o.intervals]);
  }

  // 여집합, 포함되지 않는 문자들만 모은 CharSet
  complement(): CharSet {
    const his = [-1, ...this.intervals.map(([, hi]) => hi)];
    const los = [...this.intervals.map(([lo]) => lo), MAX + 1];

    return new CharSet(
      pipe(
        his,
        zip(los),
        map(([prevHi, nextLo]): Interval => [prevHi + 1, nextLo - 1]),
        filter(([lo, hi]) => lo <= hi), // 사이 빈틈이 존재하는 여부를 따지는 filter
      ),
    );
  }

  has(cp: number): boolean {
    return this.intervals.some(([lo, hi]) => lo <= cp && cp <= hi);
  }

  isEmpty(): boolean {
    return this.intervals.length === 0;
  }

  // ex. [a-mz]. 정규식 클래스로 그대로 쓸 수 있게 클래스 안의 특수 문자는 \로 막음
  toString(): string {
    const ch = (cp: number) => String.fromCodePoint(cp).replace(/[\\\]^-]/u, '\\$&');
    const body = this.intervals.map(([lo, hi]) => (lo === hi ? ch(lo) : `${ch(lo)}-${ch(hi)}`));
    return `[${body.join('')}]`;
  }
}

// 들어 있는 집합이 똑같은 문자끼리 한 종류로 묶음. 부분집합 구성이 문자 대신 종류마다 전이를 계산하려고
// ex. [a-z], [a-m] -> [a-m], [n-z], 나머지
export function partition(sets: readonly CharSet[]): CharSet[] {
  const points = pipe(
    [0, MAX + 1, ...sets.flatMap((s) => s.intervals.flatMap(([lo, hi]) => [lo, hi + 1]))],
    uniq(),
    (xs) => xs.toSorted((a, b) => a - b),
  );

  const signature = ([lo]: Interval) => sets.flatMap((s, k) => (s.has(lo) ? [k] : [])).join(',');

  return pipe(
    points.slice(0, -1),
    zip(points.slice(1)),
    map(([lo, next]): Interval => [lo, next - 1]),
    groupBy(signature),
    (groups) => Object.values(groups),
    map((g) => CharSet.from(g)),
    sortBy([(c) => c.intervals[0]?.[0]]),
  );
}
