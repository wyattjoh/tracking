# tracking: interactive view demo.
#
# Render from the repository root:  vhs demo/tracking-tui.tape
#
# Opens the project picker, chooses the "open-source" project (open pull
# requests on public wyattjoh repositories: Dependabot and Renovate updates,
# community contributions and a stack of drafts), walks the tree, then groups
# by author and filters to the "dependencies" label in the view modal.
# Live state comes from GitHub through your authenticated `gh`, so the
# render needs network access and pull requests may close over time.
# demo/setup.sh points HOME at /tmp/tracking-demo and syncs into a copy of
# demo/projects/ there, never the seeds. The label step counts filter rows (Down 22 lands on
# "dependencies"), so re-check it if the projects gain authors, repos or labels.

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
Wait+Screen /open-source/
Sleep 1.5s
Down
Sleep 1s
Enter

# Tree with live state: walk into the stack of drafts and on to contributions
Wait+Screen /live \d/
Sleep 2s
Down@700ms 6
Sleep 1.5s
Down@600ms 4
Sleep 2s
Down@600ms 6
Sleep 2s

# View modal: group by author, then show only the "dependencies" label
Type "v"
Sleep 1.5s
Right
Sleep 1.2s
Down@100ms 22
Sleep 800ms
Space
Sleep 1.2s
Escape
Sleep 2s
Down@700ms 3
Sleep 2s
Type "q"
Sleep 1s
