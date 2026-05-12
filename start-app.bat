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
    call npm install
    echo.
)

echo Lanzando RLAnalyzer...
npx electron .
