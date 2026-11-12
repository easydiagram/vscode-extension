/**
 * The language core: parse, check and format a source, with no layout or rendering. Editor tooling imports this
 * entry, so it (and the public extension mirror built from it) never pulls in the renderer.
 */
export { validate } from './analyze';
export { format } from './format';
export type { Diagnostic, DiagnosticCode, Severity } from './core/diagnostics';
