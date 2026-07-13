#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPOS_DIR="$ROOT_DIR/repos"
DEPTH_ARGS=(--depth 1)

if [[ "${FULL_CLONE:-0}" == "1" ]]; then
  DEPTH_ARGS=()
fi

mkdir -p "$REPOS_DIR"

clone_or_update() {
  local name="$1"
  local url="$2"
  local target="$REPOS_DIR/$name"

  if [[ -d "$target/.git" ]]; then
    echo "Updating $name"
    git -C "$target" fetch --all --prune
    git -C "$target" pull --ff-only
    return
  fi

  echo "Cloning $name"
  git clone "${DEPTH_ARGS[@]}" "$url" "$target"
}

clone_or_update "effect-smol" "https://github.com/effect-TS/effect-smol.git"
clone_or_update "effect-ai-chat-example" "https://github.com/lucas-barake/effect-ai-chat-example.git"

echo "Effect v4 references are ready in $REPOS_DIR"
