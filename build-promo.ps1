#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Generates Chrome Web Store promotional tiles.

.DESCRIPTION
  Creates:
    screenshots/store/promo-small.png    (440x280 - Kleine Werbekachel)
    screenshots/store/promo-marquee.png  (1400x560 - Marquee, optional)

  Full generated - no input files needed. 24-bit PNG, no alpha.
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PWD 'screenshots\store'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-PromoTile {
  param(
    [int]$Width,
    [int]$Height,
    [string]$OutputPath,
    [int]$LogoSize,
    [int]$TitleSize,
    [int]$SubSize,
    [int]$TagSize,
    [bool]$Marquee = $false
  )

  $canvas = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.TextRenderingHint = 'AntiAliasGridFit'

  # Gradient background (dark blue to dark purple)
  $bgRect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $bgRect,
    [System.Drawing.Color]::FromArgb(15, 23, 42),
    [System.Drawing.Color]::FromArgb(46, 16, 101),
    135
  )
  $g.FillRectangle($bgBrush, $bgRect)

  # Decorative accent circles
  $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(25, 168, 85, 247))
  $r1 = [int]($Width * 0.5)
  $g.FillEllipse($accentBrush, -[int]($r1 * 0.4), -[int]($r1 * 0.4), $r1, $r1)
  $g.FillEllipse($accentBrush, $Width - [int]($r1 * 0.6), $Height - [int]($r1 * 0.6), $r1, $r1)

  # LZ logo on left - rounded rect with gradient
  $logoMargin = [int]($Height * 0.15)
  $logoX = [int]($Width * 0.05)
  $logoY = [int](($Height - $LogoSize) / 2)
  $logoRect = New-Object System.Drawing.Rectangle($logoX, $logoY, $LogoSize, $LogoSize)
  $logoBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $logoRect,
    [System.Drawing.Color]::FromArgb(37, 99, 235),
    [System.Drawing.Color]::FromArgb(168, 85, 247),
    135
  )
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $radius = [int]($LogoSize * 0.18)
  $d = $radius * 2
  $path.AddArc($logoX, $logoY, $d, $d, 180, 90)
  $path.AddArc($logoX + $LogoSize - $d, $logoY, $d, $d, 270, 90)
  $path.AddArc($logoX + $LogoSize - $d, $logoY + $LogoSize - $d, $d, $d, 0, 90)
  $path.AddArc($logoX, $logoY + $LogoSize - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath($logoBrush, $path)

  # "LZ" text on logo
  $lzFont = New-Object System.Drawing.Font('Segoe UI', [float]($LogoSize * 0.5), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $lzBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'
  $fmt.LineAlignment = 'Center'
  $g.DrawString('LZ', $lzFont, $lzBrush, [float]($logoX + $LogoSize / 2), [float]($logoY + $LogoSize / 2 - $LogoSize * 0.03), $fmt)

  # Text block right of logo
  $textX = $logoX + $LogoSize + [int]($Width * 0.04)
  $textMaxW = $Width - $textX - [int]($Width * 0.04)

  # Title
  $titleFont = New-Object System.Drawing.Font('Segoe UI', [float]$TitleSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $titleText = 'Cardmarket Stock'
  $titleText2 = 'Exporter'
  $titleY = [int]($Height * 0.18)
  $g.DrawString($titleText, $titleFont, $titleBrush, [float]$textX, [float]$titleY)
  $g.DrawString($titleText2, $titleFont, $titleBrush, [float]$textX, [float]($titleY + $TitleSize * 1.05))

  # Subtitle / tagline
  $subFont = New-Object System.Drawing.Font('Segoe UI', [float]$SubSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $subRectH = [int]($SubSize * 2)
  $subRect = New-Object System.Drawing.Rectangle($textX, 0, $textMaxW, $subRectH)
  $subBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $subRect,
    [System.Drawing.Color]::FromArgb(96, 165, 250),
    [System.Drawing.Color]::FromArgb(192, 132, 252),
    0
  )
  $subY = [int]($titleY + $TitleSize * 2.3)
  $g.DrawString('Export your full stock to CSV', $subFont, $subBrush, [float]$textX, [float]$subY)

  # Tag line at bottom
  $tagFont = New-Object System.Drawing.Font('Segoe UI', [float]$TagSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $tagBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(160, 180, 200))
  if ($Marquee) {
    $g.DrawString('8 TCGs  -  5 Languages  -  19,000+ cards tested  -  No tracking', $tagFont, $tagBrush, [float]$textX, [float]($subY + $SubSize * 1.8))
  } else {
    $g.DrawString('8 TCGs - 5 Langs - No tracking', $tagFont, $tagBrush, [float]$textX, [float]($subY + $SubSize * 1.8))
  }

  # LUPZN brand bottom-right
  $brandFont = New-Object System.Drawing.Font('Segoe UI', [float]($TagSize * 0.95), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $brandBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Rectangle(($Width - 120), ($Height - 30), 100, 20)),
    [System.Drawing.Color]::FromArgb(96, 165, 250),
    [System.Drawing.Color]::FromArgb(192, 132, 252),
    0
  )
  $sz = $g.MeasureString('LUPZN', $brandFont)
  $g.DrawString('LUPZN', $brandFont, $brandBrush, [float]($Width - $sz.Width - 16), [float]($Height - $sz.Height - 10))

  $g.Dispose()
  $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
  Write-Host "  + $OutputPath" -ForegroundColor Green
}

# Small tile: 440x280
New-PromoTile -Width 440 -Height 280 -OutputPath (Join-Path $outDir 'promo-small.png') `
  -LogoSize 140 -TitleSize 28 -SubSize 15 -TagSize 12 -Marquee $false

# Marquee tile: 1400x560
New-PromoTile -Width 1400 -Height 560 -OutputPath (Join-Path $outDir 'promo-marquee.png') `
  -LogoSize 340 -TitleSize 72 -SubSize 34 -TagSize 22 -Marquee $true

Write-Host ""
Write-Host "Done. Upload from:" -ForegroundColor Cyan
Write-Host "  $outDir" -ForegroundColor Yellow
Write-Host "  - promo-small.png    -> Kleine Werbekachel (440x280)" -ForegroundColor Gray
Write-Host "  - promo-marquee.png  -> Marquee-Kachel (1400x560, optional)" -ForegroundColor Gray
