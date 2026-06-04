# Ejecuta la batería de tests del backend (Windows / PowerShell).
# Uso:  .\run_tests.ps1
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
py -m pip install -q -r requirements-dev.txt
py -m pytest tests -v
exit $LASTEXITCODE
