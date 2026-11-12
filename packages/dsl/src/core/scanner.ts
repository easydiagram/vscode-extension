import type { Span } from './diagnostics';

export interface Mark {
  pos: number;
  line: number;
  col: number;
}

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;

/** Character cursor with 1-based line/column tracking. */
export class Scanner {
  pos = 0;
  line = 1;
  col = 1;

  constructor(readonly src: string) {}

  get eof(): boolean {
    return this.pos >= this.src.length;
  }

  peek(offset = 0): string {
    return this.src[this.pos + offset] ?? '';
  }

  startsWith(text: string): boolean {
    return this.src.startsWith(text, this.pos);
  }

  advance(count = 1): void {
    for (let i = 0; i < count && !this.eof; i++) {
      if (this.src[this.pos] === '\n') {
        this.line++;
        this.col = 1;
      } else {
        this.col++;
      }
      this.pos++;
    }
  }

  mark(): Mark {
    return { pos: this.pos, line: this.line, col: this.col };
  }

  reset(mark: Mark): void {
    this.pos = mark.pos;
    this.line = mark.line;
    this.col = mark.col;
  }

  spanFrom(mark: Mark): Span {
    return { line: mark.line, col: mark.col, endLine: this.line, endCol: this.col };
  }

  here(): Span {
    return { line: this.line, col: this.col, endLine: this.line, endCol: this.col + 1 };
  }

  skipInlineSpace(): void {
    while (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\r') this.advance();
  }

  atComment(): boolean {
    return this.startsWith('//');
  }

  skipComment(): void {
    while (!this.eof && this.peek() !== '\n') this.advance();
  }

  /** Skips spaces, comments, newlines and ';' between statements. */
  skipTrivia(): void {
    for (;;) {
      this.skipInlineSpace();
      if (this.atComment()) {
        this.skipComment();
        continue;
      }
      if (this.peek() === '\n' || this.peek() === ';') {
        this.advance();
        continue;
      }
      return;
    }
  }

  /** Skips spaces, comments and newlines (inside attribute lists). */
  skipAllSpace(): void {
    for (;;) {
      this.skipInlineSpace();
      if (this.atComment()) {
        this.skipComment();
        continue;
      }
      if (this.peek() === '\n') {
        this.advance();
        continue;
      }
      return;
    }
  }

  atStatementEnd(): boolean {
    this.skipInlineSpace();
    const c = this.peek();
    return this.eof || c === '\n' || c === ';' || c === '}' || this.atComment();
  }

  /** Identifier: letter/_ then letters, digits, _ and inner '-' (never before '>' or '-'). */
  readIdent(): string | null {
    if (!IDENT_START.test(this.peek())) return null;
    const start = this.pos;
    for (;;) {
      const c = this.peek();
      if (IDENT_PART.test(c)) {
        this.advance();
        continue;
      }
      if (c === '-' && IDENT_PART.test(this.peek(1))) {
        this.advance();
        continue;
      }
      return this.src.slice(start, this.pos);
    }
  }

  /** Double-quoted string with \" and \\ escapes. Stops at end of line when unterminated. */
  readString(): { value: string; closed: boolean } | null {
    if (this.peek() !== '"') return null;
    this.advance();
    let value = '';
    while (!this.eof && this.peek() !== '"' && this.peek() !== '\n') {
      if (this.peek() === '\\' && (this.peek(1) === '"' || this.peek(1) === '\\')) {
        value += this.peek(1);
        this.advance(2);
        continue;
      }
      value += this.peek();
      this.advance();
    }
    if (this.peek() === '"') {
      this.advance();
      return { value, closed: true };
    }
    return { value, closed: false };
  }

  /** Raw text up to newline, ';', '}' or a whitespace-preceded '//'. Trimmed. */
  readRestOfStatement(): string {
    const start = this.pos;
    while (!this.eof) {
      const c = this.peek();
      if (c === '\n' || c === ';' || c === '}') break;
      if (this.atComment() && (this.pos === start || /\s/.test(this.src[this.pos - 1] ?? ''))) break;
      this.advance();
    }
    return this.src.slice(start, this.pos).trim();
  }

  /** Raw attribute value up to ',', ']', newline or a whitespace-preceded '//' (so URLs stay whole). Trimmed. */
  readAttrRaw(): string {
    const start = this.pos;
    while (!this.eof && this.peek() !== ',' && this.peek() !== ']' && this.peek() !== '\n') {
      if (this.atComment() && this.pos > start && /\s/.test(this.src[this.pos - 1] ?? '')) break;
      this.advance();
    }
    return this.src.slice(start, this.pos).trim();
  }
}
