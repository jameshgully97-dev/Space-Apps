@echo off
rem Conflict Globe - double-click to launch on Windows.
rem Starts the local server (with live-feed proxy) and opens the app window in Microsoft Edge.
title Conflict Globe server
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8787 -Open
if errorlevel 1 pause
