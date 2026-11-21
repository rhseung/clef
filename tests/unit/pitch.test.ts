import { describe, expect, it } from 'vite-plus/test';
import { Key, Pitch } from '../../src/core/music/pitch.ts';

describe('Pitch', () => {
  it('classOf는 0~11로 돌려 둔다', () => {
    expect(Pitch.classOf('C', '')).toBe(0);
    expect(Pitch.classOf('F', '#')).toBe(6);
    expect(Pitch.classOf('C', 'b')).toBe(11);
    expect(Pitch.classOf('B', '#')).toBe(0);
  });

  it('midi', () => {
    expect(Pitch.midi('C', '', 4)).toBe(60);
    expect(Pitch.midi('C', '#', 4)).toBe(61);
    expect(Pitch.midi('A', '', 0)).toBe(21);
    expect(Pitch.midi('C', 'b', 4)).toBe(59);
  });

  it('name은 #으로 쓴다', () => {
    expect(Pitch.name(60)).toBe('C4');
    expect(Pitch.name(61)).toBe('C#4');
    expect(Pitch.name(21)).toBe('A0');
    expect(Pitch.name(108)).toBe('C8');
  });
});

// PLAN "음악 도메인"의 검증 표
describe('Key.shift', () => {
  const C = new Key('C', '', 'major');
  const G = new Key('G', '', 'major');
  const Am = new Key('A', '', 'minor');

  it.each([
    ['C장조 C4 +2d', C, 60, 2, 64],
    ['C장조 D4 +2d', C, 62, 2, 65],
    ['A단조 A4 +2d', Am, 69, 2, 72],
    ['G장조 B4 +2d', G, 71, 2, 74],
    ['C장조 C4 -1d', C, 60, -1, 59],
    ['C장조 C4 +7d', C, 60, 7, 72],
    ['C장조 C4 -7d', C, 60, -7, 48],
    ['C장조 C#4 +2d', C, 61, 2, null],
  ] as const)('%s', (_, key, pitch, steps, expected) => {
    expect(key.shift(pitch, steps)).toBe(expected);
  });

  it('toString', () => {
    expect(String(C)).toBe('C major');
    expect(String(new Key('F', '#', 'minor'))).toBe('F# minor');
  });
});
