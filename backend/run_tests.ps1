# Ejecuta la batería de tests del backend (Windows / PowerShell).
# Uso:  .\run_tests.ps1
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
$py = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "py" }   # sin venv: python global
& $py -m pip install -q -r requirements-dev.txt
& $py -m pytest tests -v
exit $LASTEXITCODE
