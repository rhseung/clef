export type Letter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export type Accidental = '' | '#' | 'b';
export type Mode = 'major' | 'minor';

// JS의 %는 음수에서 음수를 돌려줘서 필요(-1 % 12 === -1)
const mod = (a: number, n: number): number => ((a % n) + n) % n;

// C에서 반음 몇 개 위인지. E-F, B-C 사이만 1
const LETTER_SEMITONE: Readonly<Record<Letter, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const ACC_SEMITONE: Readonly<Record<Accidental, number>> = {
  '': 0,
  '#': 1,
  b: -1,
};

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

// 으뜸음에서 반음 몇 개 위인지. 단조는 자연 단음계만
const SCALES: Readonly<Record<Mode, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const semitone = (letter: Letter, acc: Accidental): number =>
  LETTER_SEMITONE[letter] + ACC_SEMITONE[acc];

export const Pitch = {
  // 0~11. 옥타브 무시한 건반 위치
  classOf(letter: Letter, acc: Accidental = ''): number {
    return mod(semitone(letter, acc), 12);
  },

  // C4 = 60. Cb0, B#9는 0~127 밖이라 호출 쪽에서 검사
  midi(letter: Letter, acc: Accidental, octave: number): number {
    return 12 * (octave + 1) + semitone(letter, acc);
  },

  // 진단 메시지용이라 항상 #으로. 61 -> C#4
  name(midi: number): string {
    return `${SHARP_NAMES[mod(midi, 12)]}${Math.floor(midi / 12) - 1}`;
  },
};

export class Key {
  readonly tonic: number;
  readonly scale: readonly number[];

  constructor(
    readonly letter: Letter,
    readonly acc: Accidental,
    readonly mode: Mode,
  ) {
    this.tonic = Pitch.classOf(letter, acc);
    this.scale = SCALES[mode];
  }

  // 음계 밖의 음이면 null(E307)
  shift(pitch: number, steps: number): number | null {
    const offset = mod(pitch - this.tonic, 12);
    const degree = this.scale.indexOf(offset);
    if (degree < 0) return null;

    const target = degree + steps;
    const octaves = Math.floor(target / this.scale.length);
    return pitch - offset + 12 * octaves + (this.scale[mod(target, this.scale.length)] as number);
  }

  // E307 메시지용. C major, F# minor
  toString(): string {
    return `${this.letter}${this.acc} ${this.mode}`;
  }
}
