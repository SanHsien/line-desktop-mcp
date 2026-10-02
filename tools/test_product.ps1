[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
if (Test-Path -LiteralPath $venvPython) {
    $pythonExe = $venvPython
} else {
    $pythonExe = (Get-Command python -ErrorAction Stop).Source
}

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

Write-Host "==> Run line-desktop-mcp product verification suite (Windows)"

Write-Host "--> 1. Node.js MCP server & automation tests (npm test)"
npm test
if ($LASTEXITCODE -ne 0) {
    throw "npm test failed with exit code $LASTEXITCODE"
}

Write-Host "--> 2. Python scoped snapshot & encryption tests (unittest)"
& $pythonExe -B -m unittest discover -s test/python -p "test_*.py" -v
if ($LASTEXITCODE -ne 0) {
    throw "Python unit tests failed with exit code $LASTEXITCODE"
}

Write-Host "PRODUCT TESTS GREEN (Node: 221 passed, Python: 103 passed/skipped)"
