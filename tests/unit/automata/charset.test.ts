import { describe, expect, it } from 'vite-plus/test';
import { CharSet, partition } from '../../../src/core/automata/charset.ts';

const { of, range, any } = {
  of: (...c: string[]) => CharSet.of(...c),
  range: (lo: string, hi: string) => CharSet.range(lo, hi),
  any: () => CharSet.any(),
};

describe('CharSet', () => {
  it('정렬하고 맞닿은 구간을 합친다', () => {
    expect(String(of('c', 'a', 'b'))).toBe('[a-c]');
    expect(String(of('a', 'a'))).toBe('[a]');
    expect(String(range('a', 'c').union(range('d', 'f')))).toBe('[a-f]');
    expect(String(range('a', 'm').union(range('c', 'z')))).toBe('[a-z]');
    expect(String(of('z', 'a'))).toBe('[az]');
  });

  it('글자 하나가 아니거나 거꾸로 된 구간이면 던진다', () => {
    expect(() => of('ab')).toThrow(RangeError);
    expect(() => range('z', 'a')).toThrow(RangeError);
  });

  it('서로게이트 쌍도 글자 하나', () => {
    expect(of('😀').has(0x1f600)).toBe(true);
  });

  it('complement', () => {
    const nl = of('\n');
    expect(nl.complement().intervals).toEqual([
      [0, 9],
      [11, 0x10ffff],
    ]);
    expect(String(range('b', 'y').complement()).endsWith('z-\u{10ffff}]')).toBe(true);
    expect(nl.complement().has(0x0a)).toBe(false);
    expect(nl.complement().has('가'.codePointAt(0) as number)).toBe(true);
    expect(nl.complement().complement().intervals).toEqual(nl.intervals);
    expect(any().complement().isEmpty()).toBe(true);
    expect(CharSet.EMPTY.complement().intervals).toEqual(any().intervals);
  });
});

describe('partition', () => {
  it('PLAN 예시: [a-z], [a-m]', () => {
    const [rest, ...classes] = partition([range('a', 'z'), range('a', 'm')]);
    expect(classes.map(String)).toEqual(['[a-m]', '[n-z]']);
    expect(rest?.intervals).toEqual(range('a', 'z').complement().intervals);
  });

  it('떨어져 있어도 서명이 같으면 한 종류', () => {
    const classes = partition([range('a', 'z'), range('m', 'n')]).map(String);
    expect(classes).toContain('[a-lo-z]');
    expect(classes).toContain('[m-n]');
  });

  it('모든 문자가 정확히 한 종류에 속한다', () => {
    const classes = partition([range('a', 'z'), range('0', '9'), of('_', '\n')]);
    for (const cp of [0, 0x0a, 0x30, 0x5f, 0x61, 0x7a, 0xac00, 0x10ffff]) {
      expect(classes.filter((c) => c.has(cp))).toHaveLength(1);
    }
  });
});
