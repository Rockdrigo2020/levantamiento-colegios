#!/bin/bash
# Instala la CLI de graphify (paquete PyPI "graphifyy") en sesiones remotas de
# Claude Code on the web, para que los hooks PreToolUse "graphify hook-guard"
# de .claude/settings.json encuentren el comando en contenedores nuevos.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! command -v graphify >/dev/null 2>&1; then
  pip install -q graphifyy
fi
