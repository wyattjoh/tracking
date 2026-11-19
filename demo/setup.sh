# Sourced (hidden) by demo/tracking-tui.tape before recording.
# Points HOME at /tmp/tracking-demo with a copy of the demo projects in
# ~/.config/tracking, so the recording's live sync never rewrites the committed
# seeds, the TUI shows ~/.config/tracking/<project>.yaml, and no TRACKING.yaml
# is found, so the project picker opens. gh keeps using your real config, and
# its token is read up front because the keychain lookup fails under this HOME.

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export GH_CONFIG_DIR="${GH_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/gh}"
export GH_TOKEN="${GH_TOKEN:-$(gh auth token)}"
rm -rf /tmp/tracking-demo
mkdir -p /tmp/tracking-demo/.config/tracking
cp "$DEMO_DIR"/projects/*.yaml /tmp/tracking-demo/.config/tracking/
# pwd -P: macOS /tmp is a symlink, and the TUI resolves paths through it.
export HOME="$(cd /tmp/tracking-demo && pwd -P)"
unset XDG_CONFIG_HOME
cd "$HOME" || return
tracking() { bun "$DEMO_DIR/../src/cli.ts" "$@"; }
PS1='\[\e[38;2;88;166;255m\]❯\[\e[0m\] '
clear
