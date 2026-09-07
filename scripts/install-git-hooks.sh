#!/usr/bin/env bash
# CISO P1 (2026-08-23 audit) — install project-scoped git hooks.
#
# One-liner: point core.hooksPath at web/.githooks so every commit runs the
# gitleaks pre-commit scan. Re-run this after a fresh clone or after
# `git config --unset core.hooksPath` (some VS Code extensions poke it).
#
# Non-destructive: git config records the value locally in .git/config;
# never touches the user's global git config.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

git config core.hooksPath web/.githooks

echo "core.hooksPath now points at web/.githooks (pre-commit scan enabled)."
echo "Verify: git config core.hooksPath"
