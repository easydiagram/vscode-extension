import type { Document } from './core/ast';
import { DIAGRAM_TYPES, SUPPORTED_TYPES, type DiagramType } from './core/constants';
import { diag, sortDiagnostics, type Diagnostic } from './core/diagnostics';
import { oneOf } from './core/narrow';
import { LIMITS } from './core/limits';
import { parse } from './core/parser';
import { buildArchitectureModel, type ArchitectureModel } from './types/architecture/model';

export interface AnalyzeOptions {
  expectedType?: DiagramType;
}

export interface Analysis {
  type: DiagramType | null;
  doc: Document;
  model: ArchitectureModel | null;
  diagnostics: Diagnostic[];
}

export function analyze(source: string, options: AnalyzeOptions = {}): Analysis {
  const analysis = analyzeComplete(source, options);
  return { ...analysis, diagnostics: capDiagnostics(analysis.diagnostics) };
}

/** Internal consumers making validity decisions need every diagnostic, including errors past the display cap. */
export function analyzeComplete(source: string, options: AnalyzeOptions = {}): Analysis {
  const { doc, diagnostics } = parse(source);
  const type = readType(doc, diagnostics, options.expectedType);
  const model = type === 'architecture' ? buildArchitectureModel(doc, diagnostics) : null;
  return { type, doc, model, diagnostics: sortDiagnostics(diagnostics) };
}

export function validate(source: string, options: AnalyzeOptions = {}): Diagnostic[] {
  return analyze(source, options).diagnostics;
}

function readType(doc: Document, diagnostics: Diagnostic[], expected: DiagramType | undefined): DiagramType | null {
  const header = doc.headers.type;
  if (!header) {
    diagnostics.push(
      diag(
        'error',
        'E_MISSING_TYPE',
        { line: 1, col: 1, endLine: 1, endCol: 1 },
        'Missing "type:" header',
        `Start the source with "type: ${expected ?? 'architecture'}"`,
      ),
    );
    return null;
  }
  const type = oneOf(DIAGRAM_TYPES, header.value.trim().toLowerCase());
  if (!type) {
    diagnostics.push(
      diag(
        'error',
        'E_UNKNOWN_TYPE',
        header.valueSpan,
        `Unknown diagram type '${header.value}'`,
        `Use one of: ${DIAGRAM_TYPES.join(', ')}`,
      ),
    );
    return null;
  }
  if (expected && expected !== type) {
    diagnostics.push(
      diag(
        'error',
        'E_TYPE_MISMATCH',
        header.valueSpan,
        `Source declares 'type: ${type}' but the diagram type is '${expected}'`,
        `Change the header to "type: ${expected}"`,
      ),
    );
    return type;
  }
  if (!SUPPORTED_TYPES.includes(type)) {
    diagnostics.push(
      diag(
        'error',
        'E_UNSUPPORTED_TYPE',
        header.valueSpan,
        `'${type}' diagrams are not available yet`,
        `Supported now: ${SUPPORTED_TYPES.join(', ')}`,
      ),
    );
  }
  return type;
}

/** Keeps responses small for agents and the UI: the first N problems plus a note about the rest. */
function capDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  if (diagnostics.length <= LIMITS.maxDiagnostics) return diagnostics;
  const shown = diagnostics.slice(0, LIMITS.maxDiagnostics);
  const last = shown[shown.length - 1]!;
  const hidden = diagnostics.length - shown.length;
  return [
    ...shown,
    diag('info', 'I_TRUNCATED', last, `${hidden} more problems not shown`, 'Fix the problems above first.'),
  ];
}
