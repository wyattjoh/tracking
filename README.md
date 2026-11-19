# tracking

A terminal dashboard for the GitHub pull requests you care about. You list them in a `TRACKING.yaml` file, and `tracking` shows them in an interactive view with their live status, review state, labels and stacks. It also syncs that state back into the file.

## Requirements

- [Bun](https://bun.sh)
- The [GitHub CLI](https://cli.github.com), authenticated with `gh auth login`

## Install

```sh
git clone https://github.com/wyattjoh/tracking.git
cd tracking
bun install
bun link
```

`bun link` puts `tracking` on your `PATH`.

## Usage

```sh
tracking init                 # create TRACKING.yaml in the current directory
tracking [file]               # open the interactive view
tracking sync [--dry-run] [file]
tracking --help
```

Without `file`, `tracking` uses the nearest `TRACKING.yaml` in the current directory or one above it.

- **Interactive view:** `tracking` shows the file straight away, then fetches live state from GitHub and writes it into the file. Every refresh syncs the file again. A failed fetch leaves the file untouched.
- **JSON:** when stdout is not a terminal, `tracking` syncs the file, then prints the file merged with live state as JSON. Agents and scripts can read it from there.
- **Sync:** `tracking sync` writes each pull request's live `status`, `review`, `head`, `base`, `title`, `labels` and `description` into the file. Comments and ordering survive, and the file is not rewritten when nothing changed. `--dry-run` reports changes without writing them.

### Keys

| Key                       | Action                                    |
| ------------------------- | ----------------------------------------- |
| `j` / `k`, arrows         | Move the selection                        |
| `g` / `G`                 | Jump to the first or last row             |
| `h` / `l`, `space`        | Collapse or expand a group                |
| `ctrl-d` / `ctrl-u`       | Scroll the detail pane                    |
| `r`                       | Refresh from GitHub and sync the file     |
| `s`                       | Sync the file                             |
| `v`                       | Open the view modal (grouping and filters) |
| `q`                       | Quit                                      |

Clicking a URL copies it to the clipboard, and you can resize the panes by dragging the border between them.

## TRACKING.yaml

Top-level keys are repositories (`owner/name`), each with a list of pull requests. Only `number` is required; `sync` fills in the rest.

```yaml
acme/api:
  - number: 123
    notes: Waiting on the schema review.
    path: ~/Code/acme/api # local checkout or worktree
    depends_on:
      - acme/infra#9
```

| Field         | Source | Meaning                                                                                  |
| ------------- | ------ | ---------------------------------------------------------------------------------------- |
| `number`      | you    | Pull request number                                                                      |
| `notes`       | you    | Free-form notes                                                                          |
| `depends_on`  | you    | Other pull requests this one waits on                                                    |
| `linear`      | you    | Linked Linear issue                                                                      |
| `path`        | you    | Local checkout or worktree. `~` is your home directory; relative paths resolve against the file |
| `owner`       | sync   | Author                                                                                   |
| `title`       | sync   | Title                                                                                    |
| `status`      | sync   | `open`, `draft`, `merged` or `closed`                                                    |
| `review`      | sync   | `approved`, `changes_requested` or `review_required` (open, non-draft only)              |
| `head`, `base` | sync   | Branches                                                                                 |
| `labels`      | sync   | GitHub label names                                                                       |
| `description` | sync   | Pull request body                                                                        |

Stacks are not stored. A pull request is stacked on the pull request in the same repository whose `head` is its `base`.

The optional top-level `view` key holds the interactive view's grouping and filters. The view modal writes it for you.

## Agent skill

`skills/tracking/` contains an agent skill that loads a `TRACKING.yaml` as working context through the JSON output.

## Development

```sh
bun test
bun run typecheck
```
