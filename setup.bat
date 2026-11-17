@echo off
title RLAnalyzer - Setup
echo.
echo  ================================================
echo   RLAnalyzer - Instalacion inicial
echo  ================================================
echo.

cd /d "%~dp0"

:: ── 1. Python ────────────────────────────────────────────────────────────────
echo [1/6] Comprobando Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Python no encontrado.
    echo  Descargalo en https://python.org  ^(marca "Add to PATH" al instalar^)
    pause & exit /b 1
)
python --version

:: ── 2. Node.js ───────────────────────────────────────────────────────────────
echo.
echo [2/6] Comprobando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js no encontrado.
    echo  Descargalo en https://nodejs.org
    pause & exit /b 1
)
node --version

:: ── 3. Dependencias Python (entorno virtual propio en .venv) ─────────────────
echo.
echo [3/6] Creando entorno virtual e instalando dependencias Python...

cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo  ERROR: No se pudo crear el entorno virtual .venv.
        pause & exit /b 1
    )
)
set "VENV_PY=%~dp0.venv\Scripts\python.exe"

"%VENV_PY%" -m pip install --upgrade pip >nul 2>&1
"%VENV_PY%" -m pip install -r backend
equirements.txt
if %errorlevel% neq 0 (
    echo  ERROR: Fallo instalando dependencias Python.
    pause & exit /b 1
)

:: ── 4. Playwright (navegador headless para perfil tracker.gg) ────────────────
echo.
echo [4/6] Instalando Chromium para Playwright ^(perfil tracker.gg^)...
echo  ^(puede tardar 1-2 minutos la primera vez — descarga ~130MB^)
"%VENV_PY%" -m playwright install chromium
if %errorlevel% neq 0 (
    echo  AVISO: No se pudo instalar Chromium para Playwright.
    echo  El perfil tracker.gg no estara disponible hasta instalar manualmente:
    echo    .venv\Scripts\python -m playwright install chromium
    echo  El resto de la app funciona con normalidad.
)

:: ── 5. Dependencias frontend + Electron ──────────────────────────────────────
echo.
echo [5/6] Instalando dependencias frontend y Electron...

cd /d "%~dp0frontend"
call npm ci --no-audit --no-fund
if %errorlevel% neq 0 ( echo  ERROR en npm ci frontend. & pause & exit /b 1 )

cd /d "%~dp0electron"
call npm ci --no-audit --no-fund
if %errorlevel% neq 0 ( echo  ERROR en npm ci electron. & pause & exit /b 1 )

:: ── 6. Acceso directo en escritorio ──────────────────────────────────────────
echo.
echo [6/6] Creando acceso directo en el escritorio...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s  = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\RLAnalyzer.lnk'); " ^
  "$s.TargetPath       = '%~dp0launch.vbs'; " ^
  "$s.IconLocation     = '%~dp0electron\icon.ico'; " ^
  "$s.WorkingDirectory = '%~dp0'; " ^
  "$s.Description      = 'RLAnalyzer - Rocket League Match Analytics'; " ^
  "$s.Save()"

:: ── Fin ──────────────────────────────────────────────────────────────────────
echo.
echo  ================================================
echo   Instalacion completada correctamente!
echo.
echo   Configura tu jugador y la carpeta de replays desde
echo   el boton de Ajustes dentro de la app.
echo.
echo   Abre la app con el icono del escritorio
echo   o ejecutando start-app.bat
echo  ================================================
echo.
pause
