@echo off
setlocal

cd /d "%~dp0"

set ELECTRON_RUN_AS_NODE=

set "TABULA_RASA_USER_DATA_DIR="
set "TABULA_RASA_WRITE_TEST=%APPDATA%\TabulaRasaWriteTest.tmp"
> "%TABULA_RASA_WRITE_TEST%" echo ok 2>nul
if errorlevel 1 (
  set "TABULA_RASA_USER_DATA_DIR=%~dp0.tabula-rasa-user-data"
  echo AppData is not writable. Using "%TABULA_RASA_USER_DATA_DIR%" for local app data.
) else (
  del "%TABULA_RASA_WRITE_TEST%" >nul 2>nul
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install Node.js first.
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm not found. Trying corepack...
  corepack enable
  if errorlevel 1 (
    echo Failed to enable pnpm through corepack.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo Installing dependencies...
  pnpm install --frozen-lockfile
  if errorlevel 1 (
    echo Dependency install failed.
    pause
    exit /b 1
  )
)

echo Starting Tabula Rasa...
pnpm start

if errorlevel 1 (
  echo App exited with error.
  pause
  exit /b 1
)

endlocal
