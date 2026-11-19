# Sourced (hidden) by demo/tracking-tui.tape before recording.
# Copies the demo projects into a throwaway config directory, so the
# recording's live sync never rewrites the committed seeds, and starts in an
# empty directory so no TRACKING.yaml is found and the project picker opens.

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export GH_CONFIG_DIR="${GH_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/gh}"
export XDG_CONFIG_HOME=/tmp/tracking-demo
rm -rf "$XDG_CONFIG_HOME/tracking"
mkdir -p "$XDG_CONFIG_HOME/tracking"
cp "$DEMO_DIR"/projects/*.yaml "$XDG_CONFIG_HOME/tracking/"
cd "$(mktemp -d)" || return
tracking() { bun "$DEMO_DIR/../src/cli.ts" "$@"; }
PS1='\[\e[38;2;88;166;255m\]❯\[\e[0m\] '
clear
