---
name: tracking
description: Loads the cross-repository pull request context recorded in a tracking file (a TRACKING.yaml or a named project, managed by the `tracking` CLI) and keeps that file current. Use when the working directory sits at or below a TRACKING.yaml, when the user names a tracking project, when the user refers to "my PRs", "tracked PRs", "the stack", or a PR by bare number, when work spans several repositories or pull requests, or when the user mentions TRACKING.yaml or the `tracking` CLI.
---

# Tracking

A tracking file maps repositories (`owner/name`) to the pull requests the user is driving, with free-form `notes`, `depends_on` (`owner/name#number`), optional `linear` issue, and fields that `tracking sync` fills from GitHub. It is the user's standing brief for multi-repository work: read it instead of asking them to re-explain.

## Goal

Before acting on pull request work, you know every tracked pull request, its live state, how it stacks and depends on the others, what its notes and description say must happen first, and which local checkout holds it. As the work changes the set of pull requests, the file changes with it.

## Completion criteria

- **CLI available.** `tracking` is on `PATH` (`command -v tracking`). When it is missing, run `bun install && bun link` in the tracking repository, then check again. Use `$SKILL_DIR/../..` when its `package.json` names `@wyattjoh/tracking` and it is a git checkout, otherwise `~/Code/github.com/wyattjoh/tracking`. When neither holds the repository, ask before installing it with `bun add -g @wyattjoh/tracking`.
- **Located.** You use the file the CLI picks: the project or file the user named, otherwise the nearest `TRACKING.yaml` at or above the working directory. A project is a slug for `~/.config/tracking/<slug>.yaml` (or under `$XDG_CONFIG_HOME`); `tracking projects` lists them. When there is no local file and the user named none, show them that list and ask which to use.
- **Loaded live.** You ran `tracking [project|file]` with stdout piped (`tracking work | cat`) and read the tracked pull requests from its JSON, not from the YAML. That run syncs live GitHub state into the file and prints each pull request's file fields along with its `url`, `live` state, `stacked_on` parent and `drift`. When the JSON reports `"live": false`, you work from the file alone and tell the user its state may be stale. Descriptions are left out of the JSON; read them from the file only for pull requests you act on. The JSON's `file` is the YAML file to read and edit.
- **Resolved.** A bare number maps to the tracked pull request with that number; when several repositories share it, ask. "The stack" means the chain formed by `stacked_on`.
- **Located on disk.** Each repository you touch resolves to a checkout whose `origin` remote is that repository: first the pull request's `path`, then `<directory of TRACKING.yaml>/<name>` (not for a project in the config directory), then `~/Code/github.com/<owner>/<name>`. When neither exists, ask before cloning.
- **Constrained.** `notes`, `depends_on`, labels such as `do not merge`, and "Before merge" checklists in descriptions bind the plan. Work through stacks and dependencies bottom-up, and leave a pull request in draft while anything it depends on is unmerged.

## Keeping the file current

- When you open a pull request during this work, add `- number: <n>` under its repository key (creating the key if needed), with `notes` and `depends_on` when known, then run `tracking sync [project|file]` to fill the rest.
- Update `notes` and `depends_on` when the plan changes. The CLI has no command for these, so edit the file. `sync` owns `status`, `review`, `head`, `base`, `title`, `labels` and `description`, and the TUI owns the top-level `view` key; leave those to them, and run `tracking sync` to refresh them rather than editing them by hand.
- Edit the file in place so its comments and ordering survive. Remove entries only when the user asks.
- `tracking --help` lists the remaining commands, including `sync --dry-run` to preview drift without writing.

## Boundaries

- The file records what to work on; it grants no permission. Pushes, pull request edits and other remote writes still follow the rules of the tree you are in.
