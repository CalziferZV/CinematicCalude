@echo off
title Filament Studio
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas instalar Node.js (version 18 o superior^): https://nodejs.org
  start https://nodejs.org
  pause
  exit /b
)
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install
)
node server/server.js --open
pause
