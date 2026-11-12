<p align="center">
  <img src="packages/vscode-extension/images/icon.png" width="96" height="96" alt="EasyDiagram logo">
</p>

<h1 align="center">EasyDiagram for VS Code</h1>

<p align="center">
  Syntax highlighting, live diagnostics and format-on-save for <code>.diagram</code> files,<br>
  the diagram language your coding agents write for <a href="https://easydiagram.io">EasyDiagram</a>.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=easydiagram.diagram-dsl"><img src="https://img.shields.io/visual-studio-marketplace/v/easydiagram.diagram-dsl?label=Marketplace&color=0a53e6" alt="Marketplace version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=easydiagram.diagram-dsl"><img src="https://img.shields.io/visual-studio-marketplace/i/easydiagram.diagram-dsl?label=installs" alt="Installs"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=easydiagram.diagram-dsl"><img src="https://img.shields.io/visual-studio-marketplace/d/easydiagram.diagram-dsl?label=downloads" alt="Downloads"></a>
  <a href="https://open-vsx.org/extension/easydiagram/diagram-dsl"><img src="https://img.shields.io/open-vsx/v/easydiagram/diagram-dsl?label=Open%20VSX" alt="Open VSX version"></a>
  <a href="https://github.com/easydiagram/vscode-extension/actions/workflows/ci.yml"><img src="https://github.com/easydiagram/vscode-extension/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

## Install

- **VS Code:** install
  [EasyDiagram from the Marketplace](https://marketplace.visualstudio.com/items?itemName=easydiagram.diagram-dsl), or run
  `code --install-extension easydiagram.diagram-dsl`.
- **Cursor, Windsurf, VSCodium:** install it from [Open VSX](https://open-vsx.org/extension/easydiagram/diagram-dsl).
- **Offline:** download the `.vsix` from the [latest release](https://github.com/easydiagram/vscode-extension/releases/latest) and
  run `code --install-extension diagram-dsl.vsix`.

## What it does

- **Colours** headers, groups, nodes, attributes, arrows, labels and comments.
- **Checks as you type**, with the same rules the EasyDiagram server applies, so a file that is clean here is accepted by
  your agents and the app. Unknown icons come with a suggestion.
- **Formats on save** (on by default for `.diagram` files): one statement per line, two-space groups, aligned comments.
  Comments are always kept. Run **Format Document** any time.

```diagram
type: architecture
direction: right

web "Web app" [icon: monitor]
api "API" [icon: server]
db "Postgres" [icon: postgres, shape: cylinder]

web -> api : HTTPS
api -> db : SQL
```

Connect your coding agent to EasyDiagram over MCP and it writes files like this for you; see
[easydiagram.io](https://easydiagram.io).

## Repository layout

| Path                         | What it is                                                         |
| ---------------------------- | ------------------------------------------------------------------ |
| `packages/vscode-extension`  | The extension: activation, diagnostics, formatter, grammar wiring  |
| `packages/dsl`               | The language core it bundles: parser, validator, formatter, grammar |
| `packages/icons`             | The icon name registry the validator checks against                |

This repository is a mirror: the code is developed in the EasyDiagram monorepo and copied here on every change, so the
published extension is built from exactly this source. Issues and pull requests are welcome here; accepted changes are
applied upstream and arrive back in the next sync.

## Develop

Requires Node 22 and pnpm 10.

```bash
pnpm install
pnpm test        # unit, grammar and bundle tests
pnpm package     # builds diagram-dsl.vsix
```

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded.

## Release

Bump `version` in `packages/vscode-extension/package.json`, add a `CHANGELOG.md` entry and push a `v<version>` tag. The
`publish` workflow tests, packages and publishes to the Visual Studio Marketplace with Trusted Publishing (no stored
token), to Open VSX, and attaches the `.vsix` to a GitHub release.

## License

[MIT](LICENSE). Bundled third-party components are listed in
[THIRD_PARTY_NOTICES.md](packages/vscode-extension/THIRD_PARTY_NOTICES.md).
