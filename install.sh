#!/bin/sh
# mcpod installer
#
#   curl -fsSL https://mcpod.dev/install.sh | sh
#
# Clones the mcpod repository, installs its dependencies, and links the `mcpod`
# CLI onto your PATH. Re-running it updates an existing checkout in place.

set -eu

REPO_URL="${MCPOD_REPO_URL:-https://github.com/skyclo/mcpod.git}"
INSTALL_DIR="${MCPOD_HOME:-$HOME/.mcpod/src}"

info()  { printf '  %s\n' "$1"; }
ok()    { printf '\033[32m✓\033[0m %s\n' "$1"; }
die()   { printf '\033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

printf '\n  \033[1mmcpod\033[0m · installer\n\n'

# --- prerequisites -----------------------------------------------------------
command -v git >/dev/null 2>&1 || die "git is required but not installed."
command -v node >/dev/null 2>&1 || die "Node.js is required but not installed."
command -v npm >/dev/null 2>&1 || die "npm is required but not installed."

if command -v docker >/dev/null 2>&1; then
  ok "Docker found ($(docker --version 2>/dev/null | head -n1))"
else
  info "Docker was not found. Install it before running servers: https://docs.docker.com/get-docker/"
fi

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$node_major" -ge 20 ] || die "Node.js 20+ is required (found $(node -v))."
ok "Node.js $(node -v)"

# --- fetch -------------------------------------------------------------------
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing checkout in $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only >/dev/null 2>&1 || die "could not update $INSTALL_DIR"
else
  info "Cloning $REPO_URL"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" >/dev/null 2>&1 || die "clone failed"
fi
ok "Source ready at $INSTALL_DIR"

# --- install + link ----------------------------------------------------------
info "Installing dependencies"
( cd "$INSTALL_DIR" && npm install --omit=dev >/dev/null 2>&1 ) || die "npm install failed"

info "Linking the mcpod CLI"
( cd "$INSTALL_DIR/cli" && npm link >/dev/null 2>&1 ) || die "npm link failed (try re-running with sudo)"

ok "mcpod installed"
printf '\n  Get started:\n    mcpod marketplace list\n    mcpod install context7\n\n'
