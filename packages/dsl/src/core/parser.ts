import type { Attr, Document, EdgeOp, GroupStmt, HeaderKey, Ref, Statement } from './ast';
import { diag, type Diagnostic, type Span } from './diagnostics';
import { LIMITS } from './limits';
import { oneOf } from './narrow';
import { illegalCharIndexes } from './text-safety';
import { Scanner, type Mark } from './scanner';

const HEADER_KEYS: readonly HeaderKey[] = ['type', 'direction', 'style', 'title'];
const OPERATORS: readonly EdgeOp[] = ['<->', '-->', '->>', '->', '<-', '--'];
const UNTERMINATED_HINT = 'Close the string with "';

export interface ParseResult {
  doc: Document;
  diagnostics: Diagnostic[];
}

export function parse(source: string): ParseResult {
  const normalized = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const { text, diagnostics: illegal } = replaceIllegalChars(normalized);
  const parser = new Parser(new Scanner(text));
  const statements = parser.block(0);
  return { doc: { headers: parser.headers, statements }, diagnostics: [...illegal, ...parser.diagnostics] };
}

/** Reports XML-illegal characters at their position and blanks them out so parsing can continue. */
function replaceIllegalChars(text: string): { text: string; diagnostics: Diagnostic[] } {
  const indexes = illegalCharIndexes(text);
  if (indexes.length === 0) return { text, diagnostics: [] };
  const diagnostics: Diagnostic[] = [];
  const chars = text.split('');
  let line = 1;
  let lineStart = 0;
  let cursor = 0;
  for (const index of indexes) {
    for (; cursor < index; cursor++) {
      if (text[cursor] === '\n') {
        line++;
        lineStart = cursor + 1;
      }
    }
    const col = index - lineStart + 1;
    const code = text.charCodeAt(index).toString(16).toUpperCase().padStart(4, '0');
    diagnostics.push(
      diag(
        'error',
        'E_INVALID_CHARACTER',
        { line, col, endLine: line, endCol: col + 1 },
        `Invalid character U+${code}`,
        'Remove control characters from the source.',
      ),
    );
    chars[index] = ' ';
  }
  return { text: chars.join(''), diagnostics };
}

class Parser {
  readonly diagnostics: Diagnostic[] = [];
  readonly headers: Document['headers'] = {};

  constructor(private readonly s: Scanner) {}

  block(depth: number): Statement[] {
    const out: Statement[] = [];
    for (;;) {
      this.s.skipTrivia();
      if (this.s.eof) return out;
      if (this.s.peek() === '}') {
        if (depth > 0) return out;
        this.error(this.s.here(), "Unexpected '}' with no open group");
        this.s.advance();
        continue;
      }
      const before = this.s.pos;
      const stmt = this.statement(depth);
      if (stmt) out.push(stmt);
      if (!this.s.atStatementEnd()) {
        this.error(
          this.s.here(),
          `Unexpected '${this.s.peek()}'`,
          'Each statement goes on its own line. Quote labels that contain spaces: api "API server".',
        );
        this.recover();
      }
      if (this.s.pos === before) this.s.advance();
    }
  }

  private statement(depth: number): Statement | null {
    const start = this.s.mark();
    const word = this.lookahead(() => this.s.readIdent());
    if (word === 'group' && this.lookahead(() => this.isGroupKeyword())) return this.group(start, depth);
    const headerKey = word ? oneOf(HEADER_KEYS, word) : undefined;
    if (headerKey && this.lookahead(() => this.isHeader())) {
      this.header(start, headerKey, depth);
      return null;
    }
    return this.edgeOrNode(start);
  }

  private isGroupKeyword(): boolean {
    this.s.readIdent();
    const hadSpace = this.s.peek() === ' ' || this.s.peek() === '\t';
    this.s.skipInlineSpace();
    return hadSpace && (this.s.peek() === '"' || /[A-Za-z_]/.test(this.s.peek()));
  }

  private isHeader(): boolean {
    this.s.readIdent();
    this.s.skipInlineSpace();
    return this.s.peek() === ':';
  }

  private header(start: Mark, key: HeaderKey, depth: number): void {
    this.s.readIdent();
    this.s.skipInlineSpace();
    this.s.advance(); // ':'
    this.s.skipInlineSpace();
    const valueStart = this.s.mark();
    const str = this.s.readString();
    if (str && !str.closed) this.error(this.s.spanFrom(valueStart), 'Unterminated string', UNTERMINATED_HINT);
    const value = str ? str.value : this.s.readRestOfStatement();
    const valueSpan = this.s.spanFrom(valueStart);
    const span = this.s.spanFrom(start);
    if (depth > 0) {
      this.error(span, `'${key}:' must be at the top level, not inside a group`);
      return;
    }
    if (this.headers[key]) {
      this.error(span, `Duplicate '${key}:' header`);
      return;
    }
    this.headers[key] = { value, span, valueSpan };
  }

  private group(start: Mark, depth: number): GroupStmt | null {
    this.s.readIdent(); // 'group'
    this.s.skipInlineSpace();
    const name = this.name();
    if (!name) {
      this.error(this.s.here(), 'A group needs a name', 'group Backend { ... }');
      this.recover();
      return null;
    }
    this.s.skipInlineSpace();
    const attrs = this.s.peek() === '[' ? this.attrs() : [];
    this.s.skipInlineSpace();
    if (this.s.peek() !== '{') {
      this.error(this.s.here(), `Expected '{' after group ${name.name}`, 'group Name [attrs] { ... }');
      this.recover();
      return null;
    }
    if (depth + 1 > LIMITS.maxGroupDepth) {
      this.diagnostics.push(
        diag(
          'error',
          'E_TOO_LARGE',
          name.span,
          `Groups are nested more than ${LIMITS.maxGroupDepth} levels deep`,
          'Flatten the grouping or split the diagram.',
        ),
      );
      this.skipBalanced();
      return null;
    }
    this.s.advance();
    const children = this.block(depth + 1);
    if (this.s.eof) {
      this.diagnostics.push(
        diag('error', 'E_UNCLOSED_GROUP', name.span, `Group '${name.name}' is missing a closing '}'`),
      );
    } else {
      this.s.advance(); // '}'
    }
    return { kind: 'group', name: name.name, nameSpan: name.span, attrs, children, span: this.s.spanFrom(start) };
  }

  private edgeOrNode(start: Mark): Statement | null {
    const from = this.refList();
    if (!from) {
      this.error(
        this.s.here(),
        `Unexpected '${this.s.peek()}'`,
        'Statements start with an id, a quoted name, "group", or a header like "type:"',
      );
      this.recover();
      return null;
    }
    this.s.skipInlineSpace();
    const op = OPERATORS.find((candidate) => this.s.startsWith(candidate));
    if (op) {
      this.s.advance(op.length);
      this.s.skipInlineSpace();
      const to = this.refList();
      if (!to) {
        this.error(this.s.here(), `Expected a target after '${op}'`);
        this.recover();
        return null;
      }
      this.s.skipInlineSpace();
      let label: string | undefined;
      if (this.s.peek() === ':') {
        this.s.advance();
        this.s.skipInlineSpace();
        const m = this.s.mark();
        const str = this.s.readString();
        if (str && !str.closed) this.error(this.s.spanFrom(m), 'Unterminated string', UNTERMINATED_HINT);
        label = (str ? str.value : this.s.readRestOfStatement()) || undefined;
      }
      return label === undefined
        ? { kind: 'edge', from, op, to, span: this.s.spanFrom(start) }
        : { kind: 'edge', from, op, to, label, span: this.s.spanFrom(start) };
    }
    if (from.length > 1) {
      this.error(this.s.spanFrom(start), 'A list of ids needs an arrow', 'a, b -> c');
      this.recover();
      return null;
    }
    const id = from[0]!;
    let label: string | undefined;
    if (this.s.peek() === '"') {
      const m = this.s.mark();
      const str = this.s.readString()!;
      if (!str.closed) this.error(this.s.spanFrom(m), 'Unterminated string', UNTERMINATED_HINT);
      label = str.value;
      this.s.skipInlineSpace();
    }
    const attrs = this.s.peek() === '[' ? this.attrs() : [];
    const base = { kind: 'node' as const, id: id.name, idSpan: id.span, attrs, span: this.s.spanFrom(start) };
    return label === undefined ? base : { ...base, label };
  }

  private refList(): Ref[] | null {
    const first = this.name();
    if (!first) return null;
    const refs = [first];
    for (;;) {
      const m = this.s.mark();
      this.s.skipInlineSpace();
      if (this.s.peek() !== ',') {
        this.s.reset(m);
        return refs;
      }
      this.s.advance();
      this.s.skipInlineSpace();
      const next = this.name();
      if (!next) {
        this.error(this.s.here(), "Expected an id after ','");
        return refs;
      }
      refs.push(next);
    }
  }

  private name(): Ref | null {
    const m = this.s.mark();
    const str = this.s.readString();
    if (str) {
      if (!str.closed) this.error(this.s.spanFrom(m), 'Unterminated string', UNTERMINATED_HINT);
      return { name: str.value, span: this.s.spanFrom(m) };
    }
    const id = this.s.readIdent();
    return id ? { name: id, span: this.s.spanFrom(m) } : null;
  }

  private attrs(): Attr[] {
    const attrs: Attr[] = [];
    const open = this.s.mark();
    this.s.advance(); // '['
    for (;;) {
      this.s.skipAllSpace();
      if (this.s.peek() === ']') {
        this.s.advance();
        return attrs;
      }
      if (this.s.eof) {
        this.error(this.s.spanFrom(open), "Missing ']' to close the attribute list");
        return attrs;
      }
      const keyStart = this.s.mark();
      const key = this.s.readIdent();
      if (!key) {
        this.error(
          this.s.here(),
          `Expected an attribute name, found '${this.s.peek()}'`,
          '[icon: server, color: blue]',
        );
        this.skipAttrsToEnd();
        return attrs;
      }
      const keySpan = this.s.spanFrom(keyStart);
      this.s.skipInlineSpace();
      if (this.s.peek() !== ':') {
        this.error(this.s.here(), `Expected ':' after attribute '${key}'`, `${key}: value`);
        this.skipAttrsToEnd();
        return attrs;
      }
      this.s.advance();
      this.s.skipInlineSpace();
      const valueStart = this.s.mark();
      const str = this.s.readString();
      if (str && !str.closed) this.error(this.s.spanFrom(valueStart), 'Unterminated string', UNTERMINATED_HINT);
      const value = str ? str.value : this.s.readAttrRaw();
      attrs.push({ key, value, keySpan, valueSpan: this.s.spanFrom(valueStart) });
      this.s.skipAllSpace();
      if (this.s.peek() === ',') {
        this.s.advance();
        continue;
      }
      if (this.s.peek() === ']') {
        this.s.advance();
        return attrs;
      }
      this.error(this.s.here(), "Expected ',' or ']' in attribute list");
      this.skipAttrsToEnd();
      return attrs;
    }
  }

  /** Skips from '{' to its matching '}' iteratively (no recursion), honoring strings. */
  private skipBalanced(): void {
    let level = 0;
    do {
      if (this.s.peek() === '"') {
        this.s.readString();
        continue;
      }
      if (this.s.peek() === '{') level++;
      else if (this.s.peek() === '}') level--;
      this.s.advance();
    } while (!this.s.eof && level > 0);
  }

  private skipAttrsToEnd(): void {
    while (!this.s.eof && this.s.peek() !== ']' && this.s.peek() !== '\n') this.s.advance();
    if (this.s.peek() === ']') this.s.advance();
  }

  private recover(): void {
    while (!this.s.eof && this.s.peek() !== '\n' && this.s.peek() !== ';' && this.s.peek() !== '}') this.s.advance();
  }

  private lookahead<T>(fn: () => T): T {
    const m = this.s.mark();
    try {
      return fn();
    } finally {
      this.s.reset(m);
    }
  }

  private error(span: Span, message: string, hint?: string): void {
    // Bound memory for hostile input; analyze() reports how many were cut.
    if (this.diagnostics.length >= 10 * LIMITS.maxDiagnostics) return;
    this.diagnostics.push(diag('error', 'E_SYNTAX', span, message, hint));
  }
}
