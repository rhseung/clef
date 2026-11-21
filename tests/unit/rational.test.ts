import { describe, expect, it } from 'vite-plus/test';
import { maxRational, Rational } from '../../src/core/common/rational.ts';

const r = (num: number, den?: number) => Rational.of(num, den);

describe('Rational', () => {
  it('기약 분수로 정규화하고 분모를 양수로 둔다', () => {
    expect(r(2, 4).toString()).toBe('1/2');
    expect(r(3, -6).toString()).toBe('-1/2');
    expect(r(-3, -6).toString()).toBe('1/2');
    expect(r(0, 5).toString()).toBe('0');
    expect(r(4, 2).toString()).toBe('2');
  });

  it('분모가 0이면 던진다', () => {
    expect(() => r(1, 0)).toThrow(RangeError);
    expect(() => r(1).div(Rational.ZERO)).toThrow(RangeError);
  });

  it('사칙연산', () => {
    expect(r(1, 4).add(r(1, 4)).toString()).toBe('1/2');
    expect(r(1, 3).add(r(1, 6)).toString()).toBe('1/2');
    expect(r(1, 4).sub(r(1, 2)).toString()).toBe('-1/4');
    expect(r(2, 3).mul(r(3, 4)).toString()).toBe('1/2');
    expect(r(1, 4).div(r(1, 8)).toString()).toBe('2');
  });

  it('비교', () => {
    expect(r(1, 3).cmp(r(1, 2))).toBe(-1);
    expect(r(1, 2).cmp(r(2, 4))).toBe(0);
    expect(r(-1, 2).cmp(r(-1, 3))).toBe(-1);
    expect(r(2, 4).equals(r(1, 2))).toBe(true);
    expect(maxRational(r(3, 4), r(2, 3)).toString()).toBe('3/4');
  });

  it('판정', () => {
    expect(r(3, 4).sign()).toBe(1);
    expect(r(3, -4).sign()).toBe(-1);
    expect(Rational.ZERO.sign()).toBe(0);
    expect(Rational.ZERO.isZero()).toBe(true);
    expect(r(4, 2).isInteger()).toBe(true);
    expect(r(1, 2).isInteger()).toBe(false);
  });

  it('틱 변환은 정수가 아니면 null', () => {
    const TPW = 1920n;
    expect(r(1, 4).toTicks(TPW)).toBe(480n);
    expect(r(1, 12).toTicks(TPW)).toBe(160n);
    expect(r(3, 2).toTicks(TPW)).toBe(2880n);
    expect(r(1, 28).toTicks(TPW)).toBeNull();
  });
});
