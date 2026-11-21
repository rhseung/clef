export class Instrument {
  static readonly ALL: readonly Instrument[] = [
    new Instrument('piano', 0, 21, 108),
    new Instrument('guitar', 24, 40, 88),
    new Instrument('bass', 32, 28, 67),
    new Instrument('cello', 42, 36, 84),
    new Instrument('violin', 40, 55, 100),
    new Instrument('flute', 73, 60, 96),
  ];

  private static readonly BY_NAME = new Map(Instrument.ALL.map((i) => [i.name, i]));

  constructor(
    readonly name: string,
    // general midi 프로그램 번호
    readonly program: number,
    // 연주 가능한 midi 음 범위, 닫힌 구간
    readonly low: number,
    readonly high: number,
  ) {}

  static find(name: string): Instrument | undefined {
    return Instrument.BY_NAME.get(name);
  }

  // 채널 9는 타악기라 건너뜀, 15개를 넘으면 undefined.
  static channelFor(trackIndex: number): number | undefined {
    const channel = trackIndex < 9 ? trackIndex : trackIndex + 1;
    return channel <= 15 ? channel : undefined;
  }

  inRange(midi: number): boolean {
    return this.low <= midi && midi <= this.high;
  }
}
