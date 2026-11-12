import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
mkdirSync('syntaxes', { recursive: true });
copyFileSync(require.resolve('@app/dsl/grammar'), 'syntaxes/diagram.tmLanguage.json');

// One CommonJS file for VS Code; the DSL (and its icon registry) is bundled in, `vscode` is provided at runtime.
await build({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  minify: true,
  sourcemap: false,
  legalComments: 'external',
  logLevel: 'warning',
});
