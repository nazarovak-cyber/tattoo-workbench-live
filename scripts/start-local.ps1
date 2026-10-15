$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$venv = Join-Path $repo '.venv'
$venvPython = Join-Path $venv 'Scripts\python.exe'
$backend = Join-Path $repo 'backend'
$frontend = Join-Path $repo 'frontend'
$logs = Join-Path $repo '.local-logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

$python = (Get-Command py.exe -ErrorAction SilentlyContinue).Source
if (-not $python) { $python = (Get-Command python.exe -ErrorAction SilentlyContinue).Source }
if (-not $python -or $python -like '*WindowsApps*') {
    $bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if (Test-Path $bundled) { $python = $bundled }
}
if (-not $python -or $python -like '*WindowsApps*') { throw 'Python 3.12+ is required.' }
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { throw 'Node.js and npm are required.' }

if (-not (Test-Path $venvPython)) { & $python -m venv $venv }
& $venvPython -c 'import fastapi, cv2, numpy, PIL, skimage, reportlab, uvicorn, multipart, pytest, httpx' 2>$null
if ($LASTEXITCODE -ne 0) {
    & $python -m pip --python $venv install -r (Join-Path $backend 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Python packages could not be installed.' }
}
if (-not (Test-Path (Join-Path $frontend 'node_modules\next'))) {
    Push-Location $frontend
    try { & $npm ci; if ($LASTEXITCODE -ne 0) { throw 'Frontend packages could not be installed.' } }
    finally { Pop-Location }
}

function Test-Url([string]$url) {
    try { $response = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing; return $response.StatusCode -eq 200 }
    catch { return $false }
}

if (-not (Test-Url 'http://127.0.0.1:8000/health')) {
    Start-Process -FilePath $venvPython -ArgumentList @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000') -WorkingDirectory $backend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'backend.out.log') -RedirectStandardError (Join-Path $logs 'backend.err.log') | Out-Null
}
if (-not (Test-Url 'http://127.0.0.1:3000/')) {
    Start-Process -FilePath $npm -ArgumentList @('run','dev') -WorkingDirectory $frontend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'frontend.out.log') -RedirectStandardError (Join-Path $logs 'frontend.err.log') | Out-Null
}
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    if ((Test-Url 'http://127.0.0.1:8000/health') -and (Test-Url 'http://127.0.0.1:3000/')) {
        Write-Host 'Tattoo Workbench is ready: http://localhost:3000/'
        Start-Process 'http://localhost:3000/' | Out-Null
        exit 0
    }
    Start-Sleep -Seconds 1
}
throw "The app did not start. Check logs in $logs"
