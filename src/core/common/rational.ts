const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;

  while (y !== 0n) {
    [x, y] = [y, x % y];
  }

  return x;
};

export class Rational {
  static readonly ZERO = new Rational(0n, 1n);
  static readonly ONE = new Rational(1n, 1n);

  private constructor(
    readonly num: bigint,
    readonly den: bigint,
  ) {}

  static of(num: bigint | number, den: bigint | number = 1n): Rational {
    let n = BigInt(num);
    let d = BigInt(den);

    if (d === 0n) throw new RangeError('zero denominator');
    if (d < 0n) {
      n = -n;
      d = -d;
    }

    const g = gcd(n, d);
    return new Rational(n / g, d / g);
  }

  add(o: Rational): Rational {
    return Rational.of(this.num * o.den + o.num * this.den, this.den * o.den);
  }

  sub(o: Rational): Rational {
    return Rational.of(this.num * o.den - o.num * this.den, this.den * o.den);
  }

  mul(o: Rational): Rational {
    return Rational.of(this.num * o.num, this.den * o.den);
  }

  div(o: Rational): Rational {
    return Rational.of(this.num * o.den, this.den * o.num);
  }

  // 분모가 항상 양수라 분자 부호만 고려
  sign(): -1 | 0 | 1 {
    return this.num > 0n ? 1 : this.num < 0n ? -1 : 0;
  }

  cmp(o: Rational): -1 | 0 | 1 {
    return this.sub(o).sign();
  }

  // 항상 기약 분수라서 이렇게 해도 됨
  equals(o: Rational): boolean {
    return this.num === o.num && this.den === o.den;
  }

  isZero(): boolean {
    return this.num === 0n;
  }

  isInteger(): boolean {
    return this.den === 1n;
  }

  // 정수 틱이 안 되면 null -> E302(표현할 수 없는 길이)
  toTicks(ticksPerWhole: bigint): bigint | null {
    const scaled = this.num * ticksPerWhole;
    return scaled % this.den === 0n ? scaled / this.den : null;
  }

  toString(): string {
    return this.den === 1n ? this.num.toString() : `${this.num}/${this.den}`;
  }
}

export function maxRational(a: Rational, b: Rational): Rational {
  return a.cmp(b) >= 0 ? a : b;
}
