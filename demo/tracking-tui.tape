# tracking: interactive view demo.
#
# Render from the repository root:  vhs demo/tracking-tui.tape
#
# Opens the project picker, chooses the "open-source" project (public pull
# requests in vercel/next.js, oven-sh/bun and anomalyco/opentui), walks the
# tree and its stacks, then regroups and filters it in the view modal.
# Live state comes from GitHub through your authenticated `gh`, so the
# render needs network access and titles or statuses may drift over time.
# demo/setup.sh syncs into a copy of demo/projects/ under /tmp/tracking-demo,
# never the seeds. The label step counts filter rows (Down 18 lands on "tests"),
# so re-check it if the projects gain authors, repositories or labels.

Output demo/tracking-tui.gif
Output demo/tracking-tui.mp4

Require bun
Require gh

Set Shell "bash"
Set FontSize 16
Set Width 1600
Set Height 900
Set Padding 16
Set Theme "GitHub Dark"
Set WindowBar Colorful
Set BorderRadius 8
Set Margin 24
Set MarginFill "#30363d"
Set TypingSpeed 80ms
Set CursorBlink false
Set WaitTimeout 30s

Hide
Type "source demo/setup.sh"
Enter
Sleep 1s
Show

Sleep 500ms
Type "tracking"
Sleep 400ms
Enter

# Project picker
Wait+Screen /turbopack/
Sleep 1.5s
Down
Sleep 700ms
Up
Sleep 700ms
Enter

# Tree with live state
Wait+Screen /live \d/
Sleep 2s
Down@700ms 5
Sleep 1.5s
Ctrl+D
Sleep 1.5s
Down@700ms 3
Sleep 1.5s

# View modal: group by status, then show only pull requests labelled "tests"
Type "v"
Sleep 1.5s
Right
Sleep 800ms
Right
Sleep 1.2s
Down@120ms 18
Sleep 800ms
Space
Sleep 1.2s
Escape
Sleep 2s
Down@700ms 3
Sleep 2s
Type "q"
Sleep 1s
