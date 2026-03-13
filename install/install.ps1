$ErrorActionPreference = "Stop"

$Repo = if ($env:VANA_RELEASE_REPO) { $env:VANA_RELEASE_REPO } else { "vana-com/vana-connect" }
$Version = if ($env:VANA_VERSION) { $env:VANA_VERSION } else { "" }
$BinDir = if ($env:VANA_INSTALL_BIN_DIR) { $env:VANA_INSTALL_BIN_DIR } else { Join-Path $HOME "AppData\Local\Microsoft\WinGet\Links" }
$InstallRoot = if ($env:VANA_INSTALL_ROOT) { $env:VANA_INSTALL_ROOT } else { Join-Path $HOME "AppData\Local\Vana" }
$ReleaseApiUrl = if ($env:VANA_RELEASE_API_URL) { $env:VANA_RELEASE_API_URL } else { "https://api.github.com/repos/$Repo/releases/latest" }
$ReleaseBaseUrl = if ($env:VANA_RELEASE_BASE_URL) { $env:VANA_RELEASE_BASE_URL } else { "https://github.com/$Repo/releases/download" }

for ($i = 0; $i -lt $args.Length; $i++) {
  switch ($args[$i]) {
    "--version" {
      $Version = $args[$i + 1]
      $i++
    }
    "--bin-dir" {
      $BinDir = $args[$i + 1]
      $i++
    }
    "--install-root" {
      $InstallRoot = $args[$i + 1]
      $i++
    }
    "--repo" {
      $Repo = $args[$i + 1]
      $i++
    }
    default {
      throw "Unknown argument: $($args[$i])"
    }
  }
}

$TargetArch = switch ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()) {
  "Arm64" { "arm64" }
  "X64" { "x64" }
  default { throw "Unsupported architecture: $($_)" }
}

if (-not $Version) {
  $Release = Invoke-RestMethod -Uri $ReleaseApiUrl
  $Version = $Release.tag_name
}

if (-not $Version) {
  throw "Unable to resolve a release version for $Repo"
}

$AssetBase = "vana-win32-$TargetArch"
$ArchiveName = "$AssetBase.zip"
$ChecksumName = "$ArchiveName.sha256"
$UseRemoteReleaseBase = $ReleaseBaseUrl -match '^(https?|file)://'
if ($UseRemoteReleaseBase) {
  $DownloadBase = "$ReleaseBaseUrl/$Version"
  $ArchiveUrl = "$DownloadBase/$ArchiveName"
  $ChecksumUrl = "$DownloadBase/$ChecksumName"
}
else {
  $DownloadBase = Join-Path $ReleaseBaseUrl $Version
  $ArchiveUrl = Join-Path $DownloadBase $ArchiveName
  $ChecksumUrl = Join-Path $DownloadBase $ChecksumName
}

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("vana-install-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $TempDir | Out-Null

function Copy-VanaAsset {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  if ($Source -match '^(https?)://') {
    Invoke-WebRequest -Uri $Source -OutFile $Destination
    return
  }

  $ResolvedPath = $Source
  if ($Source.StartsWith('file://')) {
    $ResolvedPath = ([System.Uri]$Source).LocalPath
  }

  Copy-Item -Path $ResolvedPath -Destination $Destination -Force
}

try {
  Write-Host "Installing $AssetBase from $Version"
  $ArchivePath = Join-Path $TempDir $ArchiveName
  $ChecksumPath = Join-Path $TempDir $ChecksumName

  Copy-VanaAsset -Source $ArchiveUrl -Destination $ArchivePath
  Copy-VanaAsset -Source $ChecksumUrl -Destination $ChecksumPath

  $Expected = (Get-Content $ChecksumPath).Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)[0].Trim()
  $Actual = (Get-FileHash -Path $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Expected.ToLowerInvariant() -ne $Actual) {
    throw "Checksum verification failed"
  }

  $ReleaseDir = Join-Path $InstallRoot "releases\$Version"
  Expand-Archive -Path $ArchivePath -DestinationPath $TempDir -Force
  $ExtractedDir = Join-Path $TempDir $AssetBase
  if (-not (Test-Path $ExtractedDir)) {
    throw "Unexpected archive layout: missing $ExtractedDir"
  }

  if (Test-Path $ReleaseDir) {
    Remove-Item $ReleaseDir -Recurse -Force
  }
  Copy-Item -Path $ExtractedDir -Destination $ReleaseDir -Recurse

  $CurrentDir = Join-Path $InstallRoot "current"
  if (Test-Path $CurrentDir) {
    Remove-Item $CurrentDir -Recurse -Force
  }
  Copy-Item -Path $ReleaseDir -Destination $CurrentDir -Recurse

  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $WrapperPath = Join-Path $BinDir "vana.cmd"
  @(
    "@echo off"
    "`"$CurrentDir\vana.exe`" %*"
  ) | Set-Content -Path $WrapperPath -Encoding ASCII

  $ExePath = Join-Path $BinDir "vana.exe"
  if (Test-Path $ExePath) {
    Remove-Item $ExePath -Force
  }

  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $PathEntries = @()
  if ($UserPath) {
    $PathEntries = $UserPath.Split(";")
  }
  if ($PathEntries -notcontains $BinDir) {
    $NewPath = if ($UserPath) { "$BinDir;$UserPath" } else { $BinDir }
    [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    Write-Host ""
    Write-Host "Added $BinDir to your user PATH. Open a new terminal if `vana` is not available yet."
  }

  Write-Host ""
  Write-Host "Installed vana to $WrapperPath"
  Write-Host "Next step:"
  Write-Host "  vana status"
}
finally {
  if (Test-Path $TempDir) {
    Remove-Item $TempDir -Recurse -Force
  }
}
