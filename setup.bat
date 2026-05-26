@echo off
title RLAnalyzer - Setup
echo.
echo  ================================================
echo   RLAnalyzer - Instalacion inicial
echo  ================================================
echo.

cd /d "%~dp0"

:: ── 1. Python ────────────────────────────────────────────────────────────────
echo [1/5] Comprobando Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Python no encontrado.
    echo  Descargalo en https://python.org  ^(marca "Add to PATH" al instalar^)
    pause & exit /b 1
)
python --version

:: ── 2. Node.js ───────────────────────────────────────────────────────────────
echo.
echo [2/5] Comprobando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js no encontrado.
    echo  Descargalo en https://nodejs.org
    pause & exit /b 1
)
node --version

:: ── 3. Dependencias Python ───────────────────────────────────────────────────
echo.
echo [3/5] Instalando dependencias Python...

if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)

cd /d "%~dp0backend"
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo  ERROR: Fallo instalando dependencias Python.
    pause & exit /b 1
)

:: subtr-actor-py
cd /d "%~dp0"
python install_subtr_actor.py
if %errorlevel% neq 0 (
    echo  AVISO: No se pudo instalar subtr-actor-py ^(requiere Rust^).
    echo  Instala Rust con: winget install Rustlang.Rustup
    echo  Luego vuelve a ejecutar este setup.
    pause & exit /b 1
)

:: ── 4. Playwright (navegador headless para perfil tracker.gg) ────────────────
echo.
echo [4/6] Instalando Playwright y Chromium ^(perfil tracker.gg^)...
echo  ^(puede tardar 1-2 minutos la primera vez — descarga ~130MB^)
pip install playwright >nul 2>&1
python -m playwright install chromium
if %errorlevel% neq 0 (
    echo  AVISO: No se pudo instalar Chromium para Playwright.
    echo  El perfil tracker.gg no estara disponible hasta instalar manualmente:
    echo    pip install playwright
    echo    python -m playwright install chromium
    echo  El resto de la app funciona con normalidad.
)

:: ── 5. Dependencias frontend + Electron ──────────────────────────────────────
echo.
echo [5/6] Instalando dependencias frontend y Electron...

cd /d "%~dp0frontend"
call npm install
if %errorlevel% neq 0 ( echo  ERROR en npm install frontend. & pause & exit /b 1 )

cd /d "%~dp0electron"
call npm install
if %errorlevel% neq 0 ( echo  ERROR en npm install electron. & pause & exit /b 1 )

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
echo   Antes de abrir la app, edita:
echo     backend\config.py
echo       PLAYER_NAME    = tu nombre en Rocket League
echo       REPLAYS_FOLDER = ruta a tu carpeta de replays
echo.
echo   Luego abre la app con el icono del escritorio
echo   o ejecutando start-app.bat
echo  ================================================
echo.
pause
