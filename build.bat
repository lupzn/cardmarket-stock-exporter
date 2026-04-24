@echo off
REM Build ZIP release for Chrome Web Store + GitHub
REM Double-click or run: build.bat
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
pause
