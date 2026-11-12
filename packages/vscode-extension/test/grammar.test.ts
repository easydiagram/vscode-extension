import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, expect, it } from 'vitest';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import { INITIAL, parseRawGrammar, Registry, type IGrammar } from 'vscode-textmate';

let grammar: IGrammar;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  await loadWASM(readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer);
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns: string[]) => new OnigScanner(patterns),
      createOnigString: (s: string) => new OnigString(s),
    }),
    loadGrammar: async () => {
      const path = require.resolve('@app/dsl/grammar');
      return parseRawGrammar(readFileSync(path, 'utf8'), path);
    },
  });
  const loaded = await registry.loadGrammar('source.diagram');
  if (!loaded) throw new Error('grammar did not load');
  grammar = loaded;
});

/** [text, innermost scope] per run of same-scope tokens on each line, the way VS Code colours them. */
function scopes(source: string): Array<[string, string]> {
  let state = INITIAL;
  const out: Array<[string, string]> = [];
  for (const line of source.split('\n')) {
    const result = grammar.tokenizeLine(line, state);
    const runs: Array<[string, string]> = [];
    for (const t of result.tokens) {
      const text = line.slice(t.startIndex, t.endIndex);
      const scope = t.scopes.at(-1)!;
      const last = runs.at(-1);
      if (last && last[1] === scope) last[0] += text;
      else runs.push([text, scope]);
    }
    for (const [text, scope] of runs) if (text.trim()) out.push([text.trim(), scope]);
    state = result.ruleStack;
  }
  return out;
}

it('colours headers, groups, ids, strings, attributes, arrows, labels and comments', () => {
  const s = scopes(
    'type: architecture\ngroup "AWS" [color: orange] {\n  api "API" [icon: server] // main\n}\napi --> db : SQL',
  );
  const scopeOf = (text: string) => s.find(([t]) => t === text)?.[1];
  expect(scopeOf('type')).toBe('keyword.other.header.diagram');
  expect(scopeOf('architecture')).toBe('string.unquoted.header-value.diagram');
  expect(scopeOf('group')).toBe('keyword.control.group.diagram');
  expect(scopeOf('"AWS"')).toBe('string.quoted.double.diagram');
  expect(scopeOf('color')).toBe('variable.parameter.attribute.diagram');
  expect(scopeOf('orange')).toBe('constant.other.attribute-value.diagram');
  expect(scopeOf('api')).toBe('entity.name.tag.node.diagram');
  expect(scopeOf('-->')).toBe('keyword.operator.arrow.diagram');
  expect(scopeOf('SQL')).toBe('string.unquoted.label.diagram');
  expect(scopeOf('// main')).toBe('comment.line.double-slash.diagram');
});

it('keeps URLs inside attribute values out of comments', () => {
  const s = scopes('api [link: https://example.com/docs]');
  expect(s.some(([, scope]) => scope.startsWith('comment'))).toBe(false);
  const commented = scopes('api [icon: server // why\n]');
  expect(commented).toContainEqual(['server', 'constant.other.attribute-value.diagram']);
  expect(commented).toContainEqual(['// why', 'comment.line.double-slash.diagram']);
});
