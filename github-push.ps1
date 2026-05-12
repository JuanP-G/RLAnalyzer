$ErrorActionPreference = "Stop"
$token    = "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"
$username = "JuanP-G"
$repoName = "RLAnalyzer"
$repoDesc = "Rocket League match analytics"
$private  = $true

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "=== RLAnalyzer - Subiendo a GitHub ==="

$headers = @{
    Authorization = "token $token"
    Accept = "application/vnd.github+json"
}
$body = @{
    name = $repoName
    description = $repoDesc
    private = $private
    auto_init = $false
} | ConvertTo-Json

Write-Host "[1/4] Creando repositorio en GitHub..."
try {
    $r = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "OK: $($r.html_url)"
} catch {
    Write-Host "Ya existe o error, continuando..."
}

Write-Host "[2/4] Inicializando git local..."
if (-not (Test-Path ".git")) {
    git init
    git branch -M main
}

Write-Host "[3/4] Commit inicial..."
git config user.email "jupast01@ucm.es"
git config user.name "JuanP-G"
git add .
git commit -m "feat: initial commit - RLAnalyzer v0.1"

Write-Host "[4/4] Push a GitHub..."
$remote = "https://${username}:${token}@github.com/${username}/${repoName}.git"
git remote remove origin 2>$null
git remote add origin $remote
git push -u origin main

Write-Host "Subido: https://github.com/$username/$repoName"
Remove-Item $MyInvocation.MyCommand.Path -Force
Write-Host "Script borrado."
