import { execFileSync } from 'node:child_process';
import { createRequire, Module } from 'node:module';
import { join } from 'node:path';
import { beforeAll, expect, it } from 'vitest';

/** Just enough of the VS Code API for the extension, recording what it registers. */
function fakeVscode() {
  const registered: { formatter?: { provideDocumentFormattingEdits(doc: unknown): Array<{ newText: string }> } } = {};
  const published = new Map<string, Array<{ message: string; severity: number; code?: string }>>();
  class Range {
    constructor(...args: unknown[]) {
      Object.assign(this, { args });
    }
  }
  class Diagnostic {
    code?: string;
    source?: string;
    constructor(
      readonly range: Range,
      readonly message: string,
      readonly severity: number,
    ) {}
  }
  const api = {
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
    Range,
    Diagnostic,
    TextEdit: { replace: (range: Range, newText: string) => ({ range, newText }) },
    languages: {
      createDiagnosticCollection: () => ({
        set: (uri: { toString(): string }, list: Diagnostic[]) => published.set(uri.toString(), list),
        delete: () => {},
        dispose: () => {},
      }),
      registerDocumentFormattingEditProvider: (_lang: string, provider: typeof registered.formatter) => {
        registered.formatter = provider;
        return { dispose: () => {} };
      },
    },
    workspace: {
      textDocuments: [] as unknown[],
      onDidOpenTextDocument: () => ({ dispose: () => {} }),
      onDidChangeTextDocument: () => ({ dispose: () => {} }),
      onDidCloseTextDocument: () => ({ dispose: () => {} }),
    },
  };
  return { api, registered, published };
}

const doc = (text: string) => ({
  languageId: 'diagram',
  uri: { toString: () => 'file:///a.diagram' },
  getText: () => text,
  positionAt: (offset: number) => ({ offset }),
});

let fake: ReturnType<typeof fakeVscode>;

beforeAll(() => {
  const dir = join(__dirname, '..');
  execFileSync('node', ['build.mjs'], { cwd: dir });
  fake = fakeVscode();
  fake.api.workspace.textDocuments = [doc('type: architecture\napi [icon: no-such-icon]')];
  // Serve the fake for `require('vscode')`, the way the editor does.
  const original = Reflect.get(Module, '_load');
  Reflect.set(Module, '_load', function (this: unknown, request: string, ...rest: unknown[]) {
    return request === 'vscode' ? fake.api : Reflect.apply(original, this, [request, ...rest]);
  });
  const extension = createRequire(import.meta.url)(join(dir, 'dist', 'extension.cjs'));
  extension.activate({ subscriptions: [] });
});

it('activates from the bundle and publishes diagnostics for open documents', () => {
  const list = fake.published.get('file:///a.diagram') ?? [];
  expect(list.map((d) => [d.severity, d.code])).toEqual([[1, 'W_UNKNOWN_ICON']]);
});

it('formats a document as one whole-document edit, and does nothing when already formatted', () => {
  const edits = fake.registered.formatter!.provideDocumentFormattingEdits(doc('type:architecture\napi->db'));
  expect(edits.map((e) => e.newText)).toEqual(['type: architecture\napi -> db\n']);
  expect(fake.registered.formatter!.provideDocumentFormattingEdits(doc('type: architecture\napi -> db\n'))).toEqual([]);
});
