#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Builds a Chrome-Web-Store-compatible ZIP of the extension.

.DESCRIPTION
  Packages the extension into cardmarket-stock-exporter-v<VERSION>.zip
  with proper forward-slash paths (Chrome Store requirement).

  Run from the extension folder:
    .\build.ps1
#>

$ErrorActionPreference = 'Stop'

# Auto-detect version from manifest.json
$manifest = Get-Content -Raw 'manifest.json' | ConvertFrom-Json
$version = $manifest.version
$zipName = "cardmarket-stock-exporter-v$version.zip"
$zipPath = Join-Path $PWD $zipName

# Files to include in the package
$includeFiles = @(
  'manifest.json',
  'popup.html',
  'popup.js',
  'README.md',
  'LICENSE',
  'PRIVACY.md'
)
$includeFolders = @('icons')

# Verify all exist
$missing = @()
foreach ($f in ($includeFiles + $includeFolders)) {
  if (-not (Test-Path $f)) { $missing += $f }
}
if ($missing.Count -gt 0) {
  Write-Error "Missing files: $($missing -join ', ')"
  exit 1
}

Remove-Item -Force $zipPath -ErrorAction SilentlyContinue

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$fs = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::Create)
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)

function Add-FileToZip {
  param($Archive, $FilePath, $EntryName)
  $entry = $Archive.CreateEntry($EntryName, [System.IO.Compression.CompressionLevel]::Optimal)
  $stream = $entry.Open()
  $bytes = [System.IO.File]::ReadAllBytes($FilePath)
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Close()
}

try {
  foreach ($f in $includeFiles) {
    Add-FileToZip $archive (Resolve-Path $f).Path $f
    Write-Host "  + $f" -ForegroundColor Green
  }
  foreach ($folder in $includeFolders) {
    Get-ChildItem $folder -File -Recurse | ForEach-Object {
      $relPath = $_.FullName.Substring((Resolve-Path '.').Path.Length + 1) -replace '\\', '/'
      Add-FileToZip $archive $_.FullName $relPath
      Write-Host "  + $relPath" -ForegroundColor Green
    }
  }
}
finally {
  $archive.Dispose()
  $fs.Close()
}

$size = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Host ""
Write-Host "Built: $zipName ($size KB)" -ForegroundColor Cyan
Write-Host "Location: $zipPath" -ForegroundColor Gray
Write-Host ""
Write-Host "Upload this ZIP to:" -ForegroundColor Yellow
Write-Host "  Chrome Web Store: https://chrome.google.com/webstore/devconsole" -ForegroundColor Yellow
Write-Host "  GitHub Release:   attach to your release page" -ForegroundColor Yellow
