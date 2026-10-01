# tracking

A Bun CLI and OpenTUI interface for a `TRACKING.yaml` file of GitHub pull requests.

- `tracking [file]` in a terminal opens the interactive view. It renders from the file
  immediately, then fetches live state from GitHub and marks drift. `v` opens the view
  modal, which sets the grouping (repo, author, status or review, plus an optional
  sub-group; `repo › author` by default) and per-dimension filters (open and draft
  only by default).
- `tracking [file]` with stdout not a TTY prints the merged file and live state as JSON.
- `tracking sync [--dry-run] [file]` writes live `status`, `review`, `head`, `base`,
  `title` and `description` back into the file.

Without `file`, the nearest `TRACKING.yaml` at or above the working directory is used.
GitHub is reached through `gh api graphql`, so `gh` must be authenticated.

## Commands

- `bun install`
- `bun test`
- `bun run typecheck`
- `bun link` installs `tracking` on PATH

## TRACKING.yaml schema

The root maps a repository (`owner/name`) to a flat list of pull requests. Each pull
request has `number`, `owner`, `title`, `status`, `head`, `base`, and optionally
`review`, `notes`, `depends_on`, `linear` and `description`. `review` is GitHub's
review decision (`approved`, `changes_requested` or `review_required`) and is only kept
on open, non-draft pull requests. The URL is never stored; it is
`https://github.com/<repo>/pull/<number>`.

Stacks are not stored. A pull request is stacked on the first pull request in the same
repository whose `head` is its `base` (`stackParents` in `src/tracking.ts`), using live
branches when they have been fetched. `sync` keeps `head` and `base` current so restacks
reach the file.

`sync` edits the file through the `yaml` Document API so comments and ordering
survive. Keep that property when changing the write path.

## Layout

- `src/cli.ts`: argument parsing and dispatch
- `src/tracking.ts`: locating, loading and modelling the file, and stack inference
- `src/github.ts`: batched GraphQL fetch of live pull request state
- `src/sync.ts`: write-back of live fields
- `src/json.ts`: non-TTY JSON output
- `src/tui/`: the `@opentui/react` interface; `rows.ts` filters and groups pull
  requests into the tree for the current view, and `ViewModal.tsx` draws the view modal

## Dependency References

| Dependency    | Version | Path                          |
| ------------- | ------- | ----------------------------- |
| @opentui/core | 0.5.14  | `.claude/references/opentui/` |
