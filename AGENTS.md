# tracking

A Bun CLI and OpenTUI interface for a `TRACKING.yaml` file of GitHub pull requests.

- `tracking [file]` in a terminal opens the interactive view. It renders from the file
  immediately, then fetches live state from GitHub and marks drift.
- `tracking [file]` with stdout not a TTY prints the merged file and live state as JSON.
- `tracking sync [--dry-run] [file]` writes live `status`, `title` and `description` back
  into the file.

Without `file`, the nearest `TRACKING.yaml` at or above the working directory is used.
GitHub is reached through `gh api graphql`, so `gh` must be authenticated.

## Commands

- `bun install`
- `bun test`
- `bun run typecheck`
- `bun link` installs `tracking` on PATH

## TRACKING.yaml schema

Top-level sections (`pull_requests`, `related`, `foundation`) map a repository
(`owner/name`) to a list of pull requests. Each pull request has `number`, `owner`,
`title`, `status`, `head`, and optionally `base`, `notes`, `depends_on`, `linear`,
`description` and `stacked`. A pull request under `stacked` targets its parent's head
branch. The URL is never stored; it is `https://github.com/<repo>/pull/<number>`.

`sync` edits the file through the `yaml` Document API so comments, ordering and nesting
survive. Keep that property when changing the write path.

## Layout

- `src/cli.ts`: argument parsing and dispatch
- `src/tracking.ts`: locating, loading and modelling the file
- `src/github.ts`: batched GraphQL fetch of live pull request state
- `src/sync.ts`: write-back of live fields
- `src/json.ts`: non-TTY JSON output
- `src/tui/`: the `@opentui/react` interface

## Dependency References

| Dependency    | Version | Path                          |
| ------------- | ------- | ----------------------------- |
| @opentui/core | 0.5.14  | `.claude/references/opentui/` |
