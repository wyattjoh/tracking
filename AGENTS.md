# tracking

A Bun CLI and OpenTUI interface for tracking files (`TRACKING.yaml` or a named
project) of GitHub pull requests.

- `tracking [project|file]` in a terminal opens the interactive view. It renders from the file
  immediately, then fetches live state from GitHub and syncs it into the YAML file.
  Every `r` refresh also syncs; failed fetches leave the file untouched. `v` (or clicking the
  view in the header) opens the view modal, which sets the grouping (repo, author,
  status or review, plus an optional sub-group) and per-dimension filters. Labels
  filter but do not group; each cycles between wanted (`[+]`), unwanted (`[-]`) and
  unset. Closing the
  modal saves any change to the file's `view` key.
- `tracking [project|file]` with stdout not a TTY syncs live state into the YAML file, then
  prints the merged file and live state as JSON.
- `tracking sync [--dry-run] [project|file]` writes live `status`, `review`, `head`, `base`,
  `title`, `labels` and `description` back into the file.
- `tracking init [project|file]` creates a tracking file (`TRACKING.yaml` in the
  working directory by default, or the project's file, creating the config directory)
  whose only content is a commented-out example, so it loads with no pull requests.
  It refuses to overwrite an existing file.
- `tracking projects` lists each project's slug and file.

A project is a slug naming `$XDG_CONFIG_HOME/tracking/<slug>.yaml` (`~/.config/tracking`
when unset), so several can be tracked at once. An argument is a file instead when it
contains `/`, starts with `.` or `~`, or ends in `.yaml`/`.yml`; the check is syntactic
(`isPathArg` in `src/projects.ts`). Slugs `sync`, `init` and `projects` are reserved.
Without an argument, the nearest `TRACKING.yaml` at or above the working directory is
used; when there is none, the interactive view shows a project picker, and every other
command fails listing the projects.
GitHub is reached through `gh api graphql`, so `gh` must be authenticated.

## Commands

- `bun install`
- `bun test`
- `bun run typecheck`
- `bun link` installs `tracking` on PATH

## TRACKING.yaml schema

The root maps a repository (`owner/name`) to a flat list of pull requests. Each pull
request has `number`, `owner`, `title`, `status`, `head`, `base`, and optionally
`review`, `labels`, `notes`, `depends_on`, `linear`, `path` and `description`.
`path` is the local checkout or worktree holding the pull request's code; `~` is the
home directory and relative paths resolve against the file's directory (the config
directory for a project, so projects should use `~` paths). It is shown
in the detail pane and JSON output, and `sync` never touches it. `review` is GitHub's
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
- `src/projects.ts`: the config directory, project slugs and resolving the file a
  command works on
- `src/tracking.ts`: locating, loading and modelling the file, and stack inference
- `src/github.ts`: batched GraphQL fetch of live pull request state
- `src/sync.ts`: write-back of live fields
- `src/init.ts`: the starter file template written by `init`
- `src/json.ts`: non-TTY JSON output
- `src/view.ts`: view settings types and the `view` key's read and write
- `src/tui/`: the `@opentui/react` interface; `rows.ts` filters and groups pull
  requests into the tree for the current view, `ViewModal.tsx` draws the view modal, and `ProjectPicker.tsx` (run by `pickProject` in
  `run.tsx`) chooses a project before the view starts
- `skills/tracking/`: agent skill that loads a `TRACKING.yaml` as working context;
  update it when CLI commands, JSON output or the schema change

## Dependency References

| Dependency    | Version | Path                          |
| ------------- | ------- | ----------------------------- |
| @opentui/core | 0.5.14  | `.claude/references/opentui/` |
