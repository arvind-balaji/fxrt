# FXRT

An execution engine for composable operations. See [docs/design.md](docs/design.md).

## Development

**Common commands.** Requires Bun 1.4.4.

```sh
# Install
bun install

# Run
bun run server             # fxrtd
bun run cli                # fxrt
bun run cli -- --headless  # no `ask`

# Check
bun run check              # typecheck + lint + tests
bun run format             # apply formatting and safe lint fixes
```

**Package Overview.**

| Package | Binary | Purpose |
|---|---|---|
| `packages/protocol` | | The contract shared by the server and the CLI |
| `packages/server` | `fxrtd` | The server that routes and records every call |
| `packages/cli` | `fxrt` | The terminal client, and the executor for local files and shell |

**Conventions.** CI checks these on every PR.

- Branches: `<type>/<kebab-desc>`, e.g. `feat/journal-replay`. `docs/*` targets `main`; everything else targets `develop`.
- PR titles: `<type>(<scope>): <summary>`, e.g. `fix(protocol): reject empty op names`. The squash commit uses the title.
  - Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `ci`, `build`. Add `!` for a breaking change.
  - Scopes: `protocol`, `server`, `cli`. Omit the scope for changes across packages or the repo.
  - Summary: imperative, lowercase, no trailing period.
- Releases: `release: vX.Y.Z` (develop → main). Back-merges: `chore: merge main into develop`.
