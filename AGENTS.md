# tracking

A Bun CLI and OpenTUI interface for a `TRACKING.yaml` file of GitHub pull requests.

- `tracking [file]` in a terminal opens the interactive view. It renders from the file
  immediately, then fetches live state from GitHub and syncs it into the YAML file.
  Every `r` refresh also syncs; failed fetches leave the file untouched. `v` (or clicking the
  view in the header) opens the view modal, which sets the grouping (repo, author,
  status or review, plus an optional sub-group) and per-dimension filters. Labels
  filter but do not group; each cycles between wanted (`[+]`), unwanted (`[-]`) and
  unset. Closing the
  modal saves any change to the file's `view` key.
- `tracking [file]` with stdout not a TTY syncs live state into the YAML file, then
  prints the merged file and live state as JSON.
- `tracking sync [--dry-run] [file]` writes live `status`, `review`, `head`, `base`,
  `title`, `labels` and `description` back into the file.
- `tracking init [file]` creates a `TRACKING.yaml` (in the working directory by
  default) whose only content is a commented-out example, so it loads with no pull
  requests. It refuses to overwrite an existing file.

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
`review`, `labels`, `notes`, `depends_on`, `linear` and `description`. `review` is GitHub's
review decision (`approved`, `changes_requested` or `review_required`) and is only kept
on open, non-draft pull requests. `labels` is a flow list of GitHub label names, sorted
by name; the TUI draws them in the detail pane in GitHub's colours once live state
arrives. The URL is never stored; it is
`https://github.com/<repo>/pull/<number>`.

The optional top-level `view` key holds the TUI's grouping and filters
(`group`, `sub`, and `filters` mapping a dimension to the values to show). The
`label` filter lists wanted label names and unwanted ones prefixed with `!`; a pull
request must carry any wanted label and no unwanted one. Without it
the view is `repo › author` showing open and draft pull requests. Repository keys always
contain a `/`, so `view` cannot collide with one.

Stacks are not stored. A pull request is stacked on the first pull request in the same
repository whose `head` is its `base` (`stackParents` in `src/tracking.ts`), using live
branches when they have been fetched. `sync` keeps `head` and `base` current so restacks
reach the file.

`sync` edits the file through the `yaml` Document API so comments and ordering
survive. Automatic sync re-reads the file before writing to preserve local edits,
then reloads the saved state. Unchanged files are not rewritten; `sync --dry-run`
never writes. Keep those properties when changing the write path.

## Layout

- `src/cli.ts`: argument parsing and dispatch
- `src/tracking.ts`: locating, loading and modelling the file, and stack inference
- `src/github.ts`: batched GraphQL fetch of live pull request state
- `src/sync.ts`: write-back of live fields
- `src/init.ts`: the starter file template written by `init`
- `src/json.ts`: non-TTY JSON output
- `src/view.ts`: view settings types and the `view` key's read and write
- `src/tui/`: the `@opentui/react` interface; `rows.ts` filters and groups pull
  requests into the tree for the current view, and `ViewModal.tsx` draws the view modal

## Dependency References

| Dependency    | Version | Path                          |
| ------------- | ------- | ----------------------------- |
| @opentui/core | 0.5.14  | `.claude/references/opentui/` |
