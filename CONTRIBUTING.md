# Contributing

Thanks for helping. A few things to know first:

- **This repository is a mirror.** The extension is developed inside the EasyDiagram monorepo and copied here
  automatically. Open issues and pull requests here as usual; a maintainer applies accepted changes upstream, and they
  come back here with the next sync (your pull request is then closed with a link to the change).
- **The language rules are shared** with the EasyDiagram server and agents. Changes to `packages/dsl` that alter what is
  valid need a matching change on the server, so open an issue to discuss them before writing code.

## Setup

Node 22 and pnpm 10:

```bash
pnpm install
pnpm test
```

Press **F5** in VS Code to try your change in an Extension Development Host.

## Pull requests

- Keep them small and focused, with a test that fails without the change.
- `pnpm typecheck` and `pnpm test` must pass.
- No new runtime dependencies without discussion: everything is bundled into the extension.
