# Effect v4 Template Notes

Useful parts copied into this project:

- pnpm workspace.
- package boundaries inspired by `domain`, `database`, `server`, and `client`.
- `scripts/setup-worktree.sh` for local Effect v4 references.
- root TypeScript, lint, format, env, and Postgres config.
- provider-agnostic payment boundary.
- config split between public app config and provider secrets.

Deferred until `./repos` is populated:

- concrete Effect v4 layer implementation.
- Effect SQL model/migrator implementation.
- RPC server/client implementation.
- Effect Atom frontend runtime patterns.

Reason: Effect v4 is pre-release, and the plan explicitly says not to guess its APIs.
