$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$ArtifactDir = Join-Path $RootDir "artifacts\sea"
$WorkDir = Join-Path $RootDir ".sea-work\test-install-windows"
$ReleaseDir = Join-Path $WorkDir "local-release\test-release"
$HomeDir = Join-Path $WorkDir "home"

New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
New-Item -ItemType Directory -Force -Path $HomeDir | Out-Null

Copy-Item -Path (Join-Path $ArtifactDir "vana-win32-x64.zip") -Destination (Join-Path $ReleaseDir "vana-win32-x64.zip") -Force
Copy-Item -Path (Join-Path $ArtifactDir "vana-win32-x64.zip.sha256") -Destination (Join-Path $ReleaseDir "vana-win32-x64.zip.sha256") -Force

$BinDir = Join-Path $HomeDir "bin"
$InstallRoot = Join-Path $HomeDir "root"

$env:VANA_VERSION = "test-release"
$env:VANA_RELEASE_BASE_URL = $WorkDir + "\local-release"
$env:VANA_INSTALL_ROOT = $InstallRoot
$env:VANA_INSTALL_BIN_DIR = $BinDir
$env:HOME = $HomeDir

try {
  & (Join-Path $RootDir "install\install.ps1")
  $env:PATH = "$BinDir;$env:PATH"
  & (Join-Path $BinDir "vana.cmd") status --json | Out-Null
  Write-Host "Windows installer smoke test passed"
}
finally {
  Remove-Item Env:VANA_VERSION -ErrorAction SilentlyContinue
  Remove-Item Env:VANA_RELEASE_BASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:VANA_INSTALL_ROOT -ErrorAction SilentlyContinue
  Remove-Item Env:VANA_INSTALL_BIN_DIR -ErrorAction SilentlyContinue
}
