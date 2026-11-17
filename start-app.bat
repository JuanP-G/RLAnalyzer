@echo off
title RLAnalyzer
echo.
echo  ===============================
echo   RLAnalyzer - Iniciando app...
echo  ===============================
echo.

cd /d "%~dp0electron"

:: Instala dependencias solo si node_modules no existe
if not exist "node_modules" (
    echo Instalando Electron por primera vez ^(puede tardar 1-2 minutos^)...
    call npm ci --no-audit --no-fund
    echo.
)

:: Tras una actualizacion que cambio las dependencias de Electron (marca que deja
:: electron\updater.js). Se instala aqui porque la app ya ha salido y no bloquea archivos.
if exist ".needs-npm-install" (
    echo Actualizando Electron...
    ping -n 4 127.0.0.1 >nul
    call npm ci --no-audit --no-fund
    if not errorlevel 1 del ".needs-npm-install"
    echo.
)

echo Lanzando RLAnalyzer...
npx electron .
