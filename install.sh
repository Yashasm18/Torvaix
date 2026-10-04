#!/bin/sh
# Torvaix installer for macOS and Linux (and Windows through WSL).
#
#   curl -fsSL https://raw.githubusercontent.com/Yashasm18/Torvaix/main/install.sh | sh
#
# It downloads Torvaix into ./Torvaix (or $TORVAIX_DIR), installs its packages and creates
# a .env file. It doesn't use sudo, install system software, or start anything.
# Running it again updates an existing copy.

set -eu

REPO="https://github.com/Yashasm18/Torvaix.git"
DIR="${TORVAIX_DIR:-$PWD/Torvaix}"
NODE_MIN=22

say() { printf '\n==> %s\n' "$1"; }
fail() { printf '\nTorvaix was not installed: %s\n' "$1" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "git is missing. Install it from https://git-scm.com/downloads and run this again."
command -v node >/dev/null 2>&1 || fail "Node.js is missing. Install version $NODE_MIN or newer from https://nodejs.org and run this again."
command -v npm >/dev/null 2>&1 || fail "npm is missing. It comes with Node.js from https://nodejs.org."

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge "$NODE_MIN" ] || fail "Node.js $NODE_MIN or newer is needed, but this is $(node -v). Update it from https://nodejs.org."

if [ -d "$DIR/.git" ]; then
  say "Updating Torvaix in $DIR"
  git -C "$DIR" pull --ff-only
elif [ -e "$DIR" ]; then
  fail "$DIR already exists and isn't a Torvaix download. Move it, or choose another folder with TORVAIX_DIR=/some/path."
else
  say "Downloading Torvaix to $DIR"
  git clone --depth 1 "$REPO" "$DIR"
fi

cd "$DIR"

say "Installing packages (this can take a few minutes)"
npm install --no-fund --no-audit

if [ ! -f .env ]; then
  cp .env.example .env
  say "Created .env with the default settings"
fi

say "Torvaix is installed."

if command -v ollama >/dev/null 2>&1; then
  if ollama list 2>/dev/null | grep -q .; then
    MODELS=$(ollama list 2>/dev/null | sed 1d | grep -vci embed || true)
    [ "${MODELS:-0}" -gt 0 ] || printf '\nNo chat model is installed in Ollama yet. Get one with:\n\n    ollama pull llama3.2\n'
  else
    printf '\nOllama is installed but not running. Start it by opening the Ollama app, or with:\n\n    ollama serve\n'
  fi
else
  printf '\nOllama is not installed. For local models, get it from https://ollama.com/download and run:\n\n    ollama pull llama3.2\n\nYou can also skip Ollama and add an API key (OpenAI, Anthropic, Google, Groq or OpenRouter)\nin Settings once Torvaix is open.\n'
fi

printf '\nStart Torvaix with:\n\n    cd "%s" && npm run dev\n\nThen open http://localhost:3000 in your browser.\n\n' "$DIR"
