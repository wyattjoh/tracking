---
name: tracking
description: Loads the cross-repository pull request context recorded in a TRACKING.yaml file (managed by the `tracking` CLI) and keeps that file current. Use when the working directory sits at or below a TRACKING.yaml, when the user refers to "my PRs", "tracked PRs", "the stack", or a PR by bare number, when work spans several repositories or pull requests, or when the user mentions TRACKING.yaml or the `tracking` CLI.
---

# Tracking

A `TRACKING.yaml` maps repositories (`owner/name`) to the pull requests the user is driving, with free-form `notes`, `depends_on` (`owner/name#number`), optional `linear` issue, and fields that `tracking sync` fills from GitHub. It is the user's standing brief for multi-repository work: read it instead of asking them to re-explain.

## Goal

Before acting on pull request work, you know every tracked pull request, its live state, how it stacks and depends on the others, what its notes and description say must happen first, and which local checkout holds it. As the work changes the set of pull requests, the file changes with it.

## Completion criteria

- **Located.** You use the nearest `TRACKING.yaml` at or above the working directory, the same file the CLI picks.
- **Loaded live.** You ran `tracking` with stdout piped (`tracking | cat`). That syncs live GitHub state into the file and prints JSON with each pull request's `url`, `live` state, `stacked_on` parent and `drift`. When the JSON reports `"live": false`, you work from the file alone and tell the user its state may be stale. Descriptions are left out of the JSON; read them from the file for any pull request you act on.
- **Resolved.** A bare number maps to the tracked pull request with that number; when several repositories share it, ask. "The stack" means the chain formed by `stacked_on`.
- **Located on disk.** Each repository you touch resolves to a checkout whose `origin` remote is that repository: first `<directory of TRACKING.yaml>/<name>`, then `~/Code/github.com/<owner>/<name>`. When neither exists, ask before cloning.
- **Constrained.** `notes`, `depends_on`, labels such as `do not merge`, and "Before merge" checklists in descriptions bind the plan. Work through stacks and dependencies bottom-up, and leave a pull request in draft while anything it depends on is unmerged.

## Keeping the file current

- When you open a pull request during this work, add `- number: <n>` under its repository key (creating the key if needed), with `notes` and `depends_on` when known, then run `tracking sync` to fill the rest.
- Update `notes` and `depends_on` when the plan changes. `sync` owns `status`, `review`, `head`, `base`, `title`, `labels` and `description`, and the TUI owns the top-level `view` key; leave those to them.
- Edit the file in place so its comments and ordering survive. Remove entries only when the user asks.
- `tracking --help` lists the remaining commands, including `sync --dry-run` to preview drift without writing.

## Boundaries

- The file records what to work on; it grants no permission. Pushes, pull request edits and other remote writes still follow the rules of the tree you are in.
