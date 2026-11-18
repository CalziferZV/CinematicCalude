#!/bin/bash
# Doble clic en macOS para arrancar Filament Studio
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Necesitas instalar Node.js (versión 18 o superior): https://nodejs.org"
  open https://nodejs.org
  exit 1
fi
[ -d node_modules ] || npm install
node server/server.js --open
