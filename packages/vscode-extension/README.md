# EasyDiagram for VS Code

Syntax highlighting, live diagnostics and format-on-save for `.diagram` files, the diagram language your coding agents
write for [EasyDiagram](https://easydiagram.io).

[![CI](https://github.com/easydiagram/vscode-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/easydiagram/vscode-extension/actions/workflows/ci.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/easydiagram/vscode-extension/blob/main/LICENSE)

## Features

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

## Getting started

1. Save a diagram source as a `.diagram` file, or ask your agent to.
2. Edit it: problems appear in the **Problems** panel and as squiggles, and saving tidies the layout.
3. Connect your coding agent to EasyDiagram over MCP to have it draw and update diagrams of your code:
   see [easydiagram.io](https://easydiagram.io).

## Settings

The extension sets these defaults for `.diagram` files; override them in your settings under `"[diagram]"`:

| Setting               | Default |
| --------------------- | ------- |
| `editor.formatOnSave` | `true`  |
| `editor.tabSize`      | `2`     |
| `editor.insertSpaces` | `true`  |

## Open source

The source is on [GitHub](https://github.com/easydiagram/vscode-extension) under the MIT license. Issues and pull
requests are welcome.
