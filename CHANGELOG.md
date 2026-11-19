# Changelog

## 0.1.0 (2026-11-19)


### Features

* add init command that writes a commented starter TRACKING.yaml ([1ce5bd1](https://github.com/wyattjoh/tracking/commit/1ce5bd108b3cb95cbc0dd590165a8a08511e042a))
* add the tracking CLI with an OpenTUI view, JSON output and sync ([a2609a9](https://github.com/wyattjoh/tracking/commit/a2609a933c78d04f1b654c9622d355cfc7278e83))
* add tracking skill that loads TRACKING.yaml as agent context ([efcc108](https://github.com/wyattjoh/tracking/commit/efcc1087b415df3e72f763bd43c76544e8f65d46))
* fetch, sync and show pull request labels in the TUI ([4a389c3](https://github.com/wyattjoh/tracking/commit/4a389c32c042a6eabc079b6aff6bb71bca2fd8b0))
* flatten TRACKING.yaml to repos with inferred stacks and add switchable TUI grouping ([a69e4df](https://github.com/wyattjoh/tracking/commit/a69e4dfd92746a4c709f7e1049b208bd5766b2cb))
* named projects in the config directory ([686539a](https://github.com/wyattjoh/tracking/commit/686539abe22204332a1394d915e55d793fb30336))
* **skill:** accept a project argument and confirm the project when none is named ([125cbcb](https://github.com/wyattjoh/tracking/commit/125cbcbf59ccf7a5edcd2e6d469aabb388497083))
* sync live state to YAML on every refresh ([6d34e69](https://github.com/wyattjoh/tracking/commit/6d34e6922e6be715096d82fcd23907d78ac86b05))
* track a local checkout or worktree path per pull request ([77fd0de](https://github.com/wyattjoh/tracking/commit/77fd0dedc5ef8f87f2e32b54f56d1ea1d718ba45))
* track GitHub review decision for open pull requests ([fa91dae](https://github.com/wyattjoh/tracking/commit/fa91dae1a9d00214bf56b3a764c370b039081718))
* **tui:** add filters and a view modal for grouping ([e70c4fa](https://github.com/wyattjoh/tracking/commit/e70c4fa3529fa8caf05ecd15f47deb23558fc613))
* **tui:** close the view modal by clicking esc close in its footer ([2e0adc2](https://github.com/wyattjoh/tracking/commit/2e0adc255be73c9d3bb60ff088c3021c4094abec))
* **tui:** copy mouse selections to the clipboard over OSC 52 ([38374e3](https://github.com/wyattjoh/tracking/commit/38374e3c4d4311d0422aecbd6b080634178d7398))
* **tui:** default the view to repo › author ([6accca9](https://github.com/wyattjoh/tracking/commit/6accca95111768ada37e9cca3cdb8fa69b732bcc))
* **tui:** filter by label in the view modal and show labels only in the detail pane ([d4c18a2](https://github.com/wyattjoh/tracking/commit/d4c18a2b35ca65d9de9863a2a2143d33896e4d5e))
* **tui:** persist view settings to TRACKING.yaml, pad the view modal and open it from the header ([4d65613](https://github.com/wyattjoh/tracking/commit/4d656138449c84884c691df8654d77768dbc5984))
* **tui:** prefix usernames with @ ([117a5b5](https://github.com/wyattjoh/tracking/commit/117a5b5eb07327a54a13348c0aabeb2875c87b1b))
* **tui:** show paths under the home directory as ~ ([a36b91b](https://github.com/wyattjoh/tracking/commit/a36b91b0f4e8257079eac4f61aa9f18fd883d2be))
* **tui:** space out sections, resize panes by dragging the border, rename pull_requests to my_work ([b1d9769](https://github.com/wyattjoh/tracking/commit/b1d97696cd0c0a680cbaed7e288c3f1cf675c52f))


### Bug Fixes

* **tui:** copy clicked URLs to the clipboard ([3bc1bf4](https://github.com/wyattjoh/tracking/commit/3bc1bf449bbdf00c9cb6c93d91aa16263eb1ab4e))
* **tui:** keep underscores in repo and author group labels ([ea55560](https://github.com/wyattjoh/tracking/commit/ea55560ff208578cd750ec0344e4cd487f466af3))
