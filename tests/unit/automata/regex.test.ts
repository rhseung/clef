import { describe, expect, it } from 'vite-plus/test';
import { CharSet } from '../../../src/core/automata/charset.ts';
import {
  alt,
  charset,
  concat,
  literal,
  optional,
  plus,
  star,
  toJsRegex,
} from '../../../src/core/automata/regex.ts';

const accepts = (r: Parameters<typeof toJsRegex>[0], ...inputs: string[]) =>
  inputs.map((s) => toJsRegex(r).test(s));

describe('toJsRegex', () => {
  it('literal은 그 문자열 하나만', () => {
    expect(accepts(literal('def'), 'def', 'de', 'deff', '')).toEqual([true, false, false, false]);
    expect(accepts(literal(''), '', 'a')).toEqual([true, false]);
  });

  it('항등원', () => {
    expect(accepts(concat(), '', 'a')).toEqual([true, false]);
    expect(accepts(alt(), '', 'a')).toEqual([false, false]);
  });

  it('star, plus, optional', () => {
    const a = literal('a');
    expect(accepts(star(a), '', 'a', 'aaa', 'b')).toEqual([true, true, true, false]);
    expect(accepts(plus(a), '', 'a', 'aaa')).toEqual([false, true, true]);
    expect(accepts(optional(a), '', 'a', 'aa')).toEqual([true, true, false]);
  });

  it('NOTE: C4, C#4, Bb3', () => {
    const note = concat(
      charset(CharSet.range('A', 'G')),
      optional(charset(CharSet.of('#', 'b'))),
      charset(CharSet.range('0', '9')),
    );
    expect(accepts(note, 'C4', 'C#4', 'Bb3', 'H4', 'C##4')).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('클래스 안의 특수 문자와 여집합', () => {
    expect(accepts(charset(CharSet.of(']', '\\', '^', '-')), ']', '\\', '^', '-', 'a')).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    const comment = concat(literal('//'), star(charset(CharSet.of('\n').complement())));
    expect(accepts(comment, '// hi 😀', '//', '// a\nb')).toEqual([true, true, false]);
  });
});
