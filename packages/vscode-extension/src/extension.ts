import * as vscode from 'vscode';
import { diagnosticsFor, formatted, type EditorDiagnostic } from './core';

const LANGUAGE = 'diagram';
const DEBOUNCE_MS = 250;

const SEVERITY: Record<EditorDiagnostic['severity'], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};

function toVscode(d: EditorDiagnostic): vscode.Diagnostic {
  const r = d.range;
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(r.startLine, r.startCol, r.endLine, r.endCol),
    d.message,
    SEVERITY[d.severity],
  );
  diagnostic.code = d.code;
  diagnostic.source = 'diagram';
  return diagnostic;
}

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(LANGUAGE);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const lint = (doc: vscode.TextDocument) => {
    if (doc.languageId !== LANGUAGE) return;
    collection.set(doc.uri, diagnosticsFor(doc.getText()).map(toVscode));
  };
  const lintSoon = (doc: vscode.TextDocument) => {
    const key = doc.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        lint(doc);
      }, DEBOUNCE_MS),
    );
  };

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(lint),
    vscode.workspace.onDidChangeTextDocument((e) => lintSoon(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
    vscode.languages.registerDocumentFormattingEditProvider(LANGUAGE, {
      provideDocumentFormattingEdits(doc) {
        const text = formatted(doc.getText());
        if (text === null) return [];
        const whole = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        return [vscode.TextEdit.replace(whole, text)];
      },
    }),
    { dispose: () => timers.forEach(clearTimeout) },
  );
  vscode.workspace.textDocuments.forEach(lint);
}

export function deactivate(): void {}
