export type Severity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'E_SYNTAX'
  | 'E_MISSING_TYPE'
  | 'E_UNKNOWN_TYPE'
  | 'E_UNSUPPORTED_TYPE'
  | 'E_TYPE_MISMATCH'
  | 'E_DUPLICATE_ID'
  | 'E_UNCLOSED_GROUP'
  | 'E_TOO_LARGE'
  | 'E_INVALID_CHARACTER'
  | 'I_TRUNCATED'
  | 'W_UNKNOWN_ATTR'
  | 'W_UNKNOWN_ICON'
  | 'W_INVALID_ATTR_VALUE'
  | 'I_AUTO_NODE';

/** 1-based, end-exclusive column. */
export interface Span {
  line: number;
  col: number;
  endLine: number;
  endCol: number;
}

export interface Diagnostic extends Span {
  severity: Severity;
  code: DiagnosticCode;
  message: string;
  hint?: string;
}

export function diag(severity: Severity, code: DiagnosticCode, span: Span, message: string, hint?: string): Diagnostic {
  const base = { severity, code, line: span.line, col: span.col, endLine: span.endLine, endCol: span.endCol, message };
  return hint === undefined ? base : { ...base, hint };
}

export const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((d) => d.severity === 'error');

export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (a, b) => a.line - b.line || a.col - b.col || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );
}
