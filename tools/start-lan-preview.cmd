@echo off
setlocal
cd /d "%~dp0.."
title Plate Studio - LAN Preview
node "%~dp0start-lan-preview.cjs" 8765
pause
