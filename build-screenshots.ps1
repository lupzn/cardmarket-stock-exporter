#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Builds Chrome-Web-Store-ready screenshots (1280x800, 24-bit PNG, no alpha).

.DESCRIPTION
  Place your raw popup screenshots in screenshots/raw/ as:
    01-popup.png       - Empty popup
    02-export.png      - Export running with progress
    03-pinned.png      - Pinned window with results
    04-csv.png         - CSV opened in Excel
    05-extra.png       - (optional)
  Run this script. Output goes to screenshots/store/.
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$rawDir   = Join-Path $PWD 'screenshots\raw'
$outDir   = Join-Path $PWD 'screenshots\store'
$canvasW  = 1280
$canvasH  = 800

if (-not (Test-Path $rawDir)) {
  New-Item -ItemType Directory -Force -Path $rawDir | Out-Null
  Write-Warning "Created $rawDir - drop your raw screenshots there and re-run."
  exit 0
}
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Captions per filename prefix
$captions = @{
  '01' = @{ title = 'Export Cardmarket Stock to CSV'; sub = 'Open the popup, pick your settings, click export.' }
  '02' = @{ title = 'Live Progress with Cancel';      sub = 'See current expansion, page, row count and total stock.' }
  '03' = @{ title = 'Pin to Window';                  sub = "Detached window doesn't close when you click elsewhere." }
  '04' = @{ title = 'Excel-Ready CSV';                sub = 'UTF-8 BOM, semicolon separator, prices and totals.' }
  '05' = @{ title = 'Multi-Game, Multi-Language';     sub = '8 TCGs, 5 languages, 20,000+ cards tested.' }
}

$rawFiles = Get-ChildItem -Path $rawDir -Filter '*.png' | Sort-Object Name
if ($rawFiles.Count -eq 0) {
  Write-Warning "No PNGs found in $rawDir"
  Write-Host "  Save your popup screenshots there as 01-popup.png, 02-export.png, etc."
  exit 0
}

foreach ($file in $rawFiles) {
  $prefix = $file.BaseName.Substring(0, 2)
  $cap = $captions[$prefix]
  if (-not $cap) { $cap = @{ title = 'Cardmarket Stock Exporter'; sub = '' } }

  $canvas = New-Object System.Drawing.Bitmap($canvasW, $canvasH, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.TextRenderingHint = 'AntiAliasGridFit'

  # Gradient background (dark blue to dark purple, brand-matching)
  $bgRect = New-Object System.Drawing.Rectangle(0, 0, $canvasW, $canvasH)
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $bgRect,
    [System.Drawing.Color]::FromArgb(15, 23, 42),
    [System.Drawing.Color]::FromArgb(46, 16, 101),
    135
  )
  $g.FillRectangle($bgBrush, $bgRect)

  # Subtle accent shapes
  $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(20, 168, 85, 247))
  $g.FillEllipse($accentBrush, -200, -200, 600, 600)
  $g.FillEllipse($accentBrush, $canvasW - 400, $canvasH - 400, 600, 600)

  # Title
  $titleFont = New-Object System.Drawing.Font('Segoe UI', 36, [System.Drawing.FontStyle]::Bold)
  $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $g.DrawString($cap.title, $titleFont, $titleBrush, [float]60, [float]50)

  # Subtitle
  if ($cap.sub) {
    $subFont = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Regular)
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 200, 220))
    $g.DrawString($cap.sub, $subFont, $subBrush, [float]60, [float]110)
  }

  # Load + place the screenshot, scaled to fit
  $img = [System.Drawing.Image]::FromFile($file.FullName)
  try {
    $maxImgW = $canvasW - 120          # 60px padding both sides
    $maxImgH = $canvasH - 240          # space for title + footer

    $scale = [Math]::Min($maxImgW / $img.Width, $maxImgH / $img.Height)
    if ($scale -gt 1) { $scale = 1 }   # never upscale beyond native
    $newW = [int]($img.Width * $scale)
    $newH = [int]($img.Height * $scale)
    $x = [int](($canvasW - $newW) / 2)
    $y = 180

    # White rounded background behind screenshot for contrast
    $shadowRect = New-Object System.Drawing.Rectangle(($x - 8), ($y - 8), ($newW + 16), ($newH + 16))
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 0, 0, 0))
    $g.FillRectangle($shadowBrush, $shadowRect)

    $g.DrawImage($img, $x, $y, $newW, $newH)
  } finally {
    $img.Dispose()
  }

  # Footer brand bar
  $footerY = $canvasH - 50
  $footerFont = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Regular)
  $footerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(160, 180, 200))
  $g.DrawString('made with love by', $footerFont, $footerBrush, [float]60, [float]$footerY)

  $brandFont = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
  $brandBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Rectangle(0, $footerY, 200, 40)),
    [System.Drawing.Color]::FromArgb(96, 165, 250),
    [System.Drawing.Color]::FromArgb(192, 132, 252),
    0
  )
  $g.DrawString('LUPZN', $brandFont, $brandBrush, [float]220, [float]($footerY - 3))

  $g.DrawString('cardmarket-stock-exporter', $footerFont, $footerBrush, [float]($canvasW - 320), [float]$footerY)

  $g.Dispose()

  # Save as 24-bit PNG (no alpha) - meets Chrome Store spec
  $outPath = Join-Path $outDir ($file.BaseName + '.png')
  $canvas.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()

  Write-Host "  + $($file.Name) -> screenshots/store/$($file.BaseName).png" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Upload PNGs from:" -ForegroundColor Cyan
Write-Host "  $outDir" -ForegroundColor Yellow
