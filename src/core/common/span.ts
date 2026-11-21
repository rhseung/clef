/**
 * Span은 소스 안의 한 구간을 설명하는 개체입니다.
 * row, col은 모두 1부터 세기로 하며, 한 토큰은 한 row 안에 있다고 가정합니다.
 */
export interface Span {
  readonly line: number;
  readonly col: number;
  readonly endCol: number;
}

export function span(line: number, col: number, endCol: number): Span {
  return { line, col, endCol };
}

export class SourceFile {
  private readonly lines: readonly string[];

  constructor(
    readonly name: string,
    readonly text: string,
  ) {
    this.lines = text.split('\n');
  }

  lineText(line: number): string {
    return (this.lines[line - 1] ?? '').replace(/\r$/, '');
  }

  get lineCount(): number {
    return this.lines.length;
  }
}
