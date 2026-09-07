@echo off
setlocal
title Plate Studio - KiotViet daily sync
node "%~dp0kiotviet-sync-server.cjs"
pause
