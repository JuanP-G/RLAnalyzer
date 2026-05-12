@echo off
echo Creando acceso directo en el escritorio...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s  = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\RLAnalyzer.lnk'); " ^
  "$s.TargetPath       = '%~dp0launch.vbs'; " ^
  "$s.IconLocation     = '%~dp0electron\icon.ico'; " ^
  "$s.WorkingDirectory = '%~dp0'; " ^
  "$s.Description      = 'RLAnalyzer - Rocket League Match Analytics'; " ^
  "$s.Save()"

echo.
echo Listo! Busca "RLAnalyzer" en tu escritorio.
pause
