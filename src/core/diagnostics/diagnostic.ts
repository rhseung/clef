import type { SourceFile, Span } from '../common/span';
import { pipe, sortBy, uniqBy } from 'es-toolkit/fp';

export type Severity = 'error' | 'warning';

export type DiagCode =
  | 'E001'
  | 'E002'
  | 'E003'
  | 'E010'
  | 'E011'
  | 'E101'
  | 'E102'
  | 'E103'
  | 'E104'
  | 'E201'
  | 'E203'
  | 'E204'
  | 'E301'
  | 'E302'
  | 'E303'
  | 'E304'
  | 'E305'
  | 'E306'
  | 'E307'
  | 'E401'
  | 'E402'
  | 'E403'
  | 'W601'
  | 'W602'
  | 'W603';

/**
 * 진단 개체
 */
export class Diagnostic {
  constructor(
    readonly severity: Severity,
    readonly code: DiagCode,
    readonly message: string,
    readonly span: Span,
    readonly help?: string,
  ) {}

  // error[E307]: message
  private get title(): string {
    return `${this.severity}[${this.code}]: ${this.message}`;
  }

  // 1:21 error[E307]: message
  format(): string {
    const head = `${this.span.line}:${this.span.col} ${this.title}`;
    return this.help ? `${head}\n\thelp: ${this.help}` : head;
  }

  /**
   * a.clef:1:21: error[E307]: pitch C#4 is not in the C major scale (use +2st instead)
   * 1 | track piano = C#4:4 + 2d
   *   |                     ^
   *  = help: ...
   */
  formatFull(file: SourceFile): string {
    const { line, col, endCol } = this.span;
    const pad = ' '.repeat(String(line).length);
    const caret = ' '.repeat(col - 1) + '^'.repeat(Math.max(1, endCol - col));

    return [
      `${file.name}:${line}:${col}: ${this.title}`,
      `${line} | ${file.lineText(line)}`,
      `${pad} | ${caret}`,
      this.help && `${pad} = help: ${this.help}`,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

export class DiagnosticBag {
  private readonly items: Diagnostic[] = [];
  static readonly MAX_DIAGNOSTIC: number = 50;

  private add(d: Diagnostic) {
    this.items.push(d);
  }

  error(code: DiagCode, span: Span, message: string, help?: string) {
    this.add(new Diagnostic('error', code, message, span, help));
  }

  warn(code: DiagCode, span: Span, message: string, help?: string) {
    this.add(new Diagnostic('warning', code, message, span, help));
  }

  hasErrors(): boolean {
    return this.items.some((d) => d.severity === 'error');
  }

  errorCount(): number {
    return this.items.filter((d) => d.severity === 'error').length;
  }

  sorted(): Diagnostic[] {
    return pipe(
      this.items,
      uniqBy((d) => [d.code, d.span.line, d.span.col, d.message].join('|')), // unique
      sortBy([(d) => d.span.line, (d) => d.span.col, 'code']), // sorted
    );
  }

  capped() {
    const all = this.sorted();
    return {
      shown: all.slice(0, DiagnosticBag.MAX_DIAGNOSTIC),
      hiddenCount: Math.max(0, all.length - DiagnosticBag.MAX_DIAGNOSTIC),
    };
  }
}
