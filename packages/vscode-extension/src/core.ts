import { format, validate, type Diagnostic } from '@app/dsl/language';

export interface EditorDiagnostic {
  severity: Diagnostic['severity'];
  code: string;
  message: string;
  /** 0-based, end exclusive, as the editor counts. */
  range: { startLine: number; startCol: number; endLine: number; endCol: number };
}

/** The same validation agents get from the server, shaped for the editor. */
export function diagnosticsFor(source: string): EditorDiagnostic[] {
  return validate(source).map((d) => ({
    severity: d.severity,
    code: d.code,
    message: d.hint ? `${d.message}\n${d.hint}` : d.message,
    range: {
      startLine: d.line - 1,
      startCol: d.col - 1,
      endLine: d.endLine - 1,
      endCol: Math.max(d.endCol - 1, d.endLine === d.line ? d.col : 0),
    },
  }));
}

/** The formatted document, or null when it is already formatted or cannot be formatted (syntax errors). */
export function formatted(source: string): string | null {
  const out = format(source);
  return out === source ? null : out;
}
