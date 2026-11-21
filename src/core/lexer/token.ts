import type { Span } from '../common/span';
import type { Accidental, Letter } from '../music/pitch';

export type KeywordKind =
  // `time 3/4` 박자표 헤더. 기본값 4/4
  | 'KW_TIME'

  // `key A minor` 조성 헤더. 온음계 이조(+2d)의 기준. 기본값 C major
  | 'KW_KEY'

  // `tempo 90` 분당 4분음표 수. 기본값 120
  | 'KW_TEMPO'

  // `unit 1/8` 길이를 안 쓴 음의 길이이자 :n의 기준. 기본값 1/4
  | 'KW_UNIT'

  // `track piano = m1` 트랙 문장. 바로 뒤의 IDENT는 악기 이름
  | 'KW_TRACK'

  // `def up(p: Phrase): Phrase = p + 2d` 함수 정의
  | 'KW_DEF'

  // `key G major`
  | 'KW_MAJOR'

  // `key A minor` 자연 단음계
  | 'KW_MINOR'

  // `n: Note` ex. `C4`, `E4:2`
  | 'KW_NOTE'

  // `i: Interval` ex. `2d`, `3st`
  | 'KW_INTERVAL'

  // `p: Phrase` ex. `C4 E4 G4`, `m1`
  | 'KW_PHRASE'

  // `k: Int` ex. `p*k`, `2`
  | 'KW_INT';

export type PunctKind =
  // `m1 = C4` 정의와 트랙의 =
  | 'EQ'

  // `m1 + 2d` 위로 이조
  | 'PLUS'

  // `m1 - 3st` 아래로 이조. 음수 리터럴은 없다
  | 'MINUS'

  // `(C4 E4)*2` 반복
  | 'STAR'

  // `m1 & m2` 병렬. 우선순위가 가장 낮다
  | 'AMP'

  // `C4:2` 길이 접미사, `p: Phrase` 타입 표기
  | 'COLON'

  // `time 3/4`, `C4:/2`, `C4:3/2` 분수. 어느 쪽인지는 파서가 정한다
  | 'SLASH'

  // `f(m1)` 앞에 공백이 없으면 호출, `m1 (m1+2d)`처럼 있으면 괄호
  | 'LPAREN'
  | 'RPAREN'

  // `[A4 B4 C5]:2` 묶음. 뒤에 길이가 반드시 붙는다
  | 'LBRACKET'
  | 'RBRACKET'

  // `up(m1, 2d)` 인자와 매개변수 구분
  | 'COMMA'

  // `_`, `_:2` 쉼표. 뒤에 식별자 문자가 붙으면 REST가 아니다
  | 'REST'

  // `C4 D4 E4 F4 |` 마디선. 앞 마디의 길이를 검사한다
  | 'BAR'

  // `E4~ E4` 붙임줄. 다음 같은 높이의 음과 잇는다
  | 'TIE'

  // 문장의 끝. `(`, `[` 안에서는 만들지 않고 연속된 줄바꿈은 하나로 합친다
  | 'NEWLINE'
  | 'EOF';

// 일반 객체 리터럴은 Object.prototype을 물려받아 KEYWORDS['constructor']가 함수를 돌려준다.
// 그러면 소문자 단어 constructor, toString이 키워드로 잘못 판정되므로 Map을 쓴다.
export const KEYWORDS: ReadonlyMap<string, KeywordKind> = new Map([
  ['time', 'KW_TIME'],
  ['key', 'KW_KEY'],
  ['tempo', 'KW_TEMPO'],
  ['unit', 'KW_UNIT'],
  ['track', 'KW_TRACK'],
  ['def', 'KW_DEF'],
  ['major', 'KW_MAJOR'],
  ['minor', 'KW_MINOR'],
  ['Note', 'KW_NOTE'],
  ['Interval', 'KW_INTERVAL'],
  ['Phrase', 'KW_PHRASE'],
  ['Int', 'KW_INT'],
]);

export interface TokenFields {
  readonly lexeme: string;
  readonly span: Span;
  readonly spaceBefore: boolean;
}

abstract class TokenBase implements TokenFields {
  readonly lexeme: string;
  readonly span: Span;
  readonly spaceBefore: boolean;

  constructor(fields: TokenFields) {
    this.lexeme = fields.lexeme;
    this.span = fields.span;
    this.spaceBefore = fields.spaceBefore;
  }

  abstract format(): string;
}

// C#4, Bb3
export class NoteToken extends TokenBase {
  readonly kind = 'NOTE';

  constructor(
    fields: TokenFields,
    readonly letter: Letter,
    readonly acc: Accidental,
    readonly octave: number,
  ) {
    super(fields);
  }

  override format(): string {
    return `NOTE(${this.letter},${this.acc},${this.octave})`;
  }
}

// C, F#, Bb
export class PitchClassToken extends TokenBase {
  readonly kind = 'PITCHCLASS';

  constructor(
    fields: TokenFields,
    readonly letter: Letter,
    readonly acc: Accidental,
  ) {
    super(fields);
  }

  override format(): string {
    return `PITCHCLASS(${this.letter}${this.acc})`;
  }
}

// m1, c4, bass_line
export class IdentToken extends TokenBase {
  readonly kind = 'IDENT';

  constructor(
    fields: TokenFields,
    readonly name: string,
  ) {
    super(fields);
  }

  override format(): string {
    return `IDENT(${this.name})`;
  }
}

// 4, 480
export class IntToken extends TokenBase {
  readonly kind = 'INT';

  constructor(
    fields: TokenFields,
    readonly value: number,
  ) {
    super(fields);
  }

  override format(): string {
    return `INT(${this.value})`;
  }
}

// 2d, 3st
export class IntervalToken extends TokenBase {
  readonly kind = 'INTERVAL';

  constructor(
    fields: TokenFields,
    readonly size: number,
    readonly unit: 'd' | 'st',
  ) {
    super(fields);
  }

  override format(): string {
    return `INTERVAL(${this.size},${this.unit})`;
  }
}

// 값이 없는 키워드와 구두점
export class SimpleToken extends TokenBase {
  constructor(
    fields: TokenFields,
    readonly kind: KeywordKind | PunctKind,
  ) {
    super(fields);
  }

  override format(): string {
    return this.kind;
  }
}

export type Token =
  | NoteToken
  | PitchClassToken
  | IdentToken
  | IntToken
  | IntervalToken
  | SimpleToken;

export type TokenKind = Token['kind'];
