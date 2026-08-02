@echo off
chcp 65001 >nul 2>&1
title Kealin AI Novels - Stop

echo.
echo ========================================
echo   Stopping Kealin AI Novels...
echo ========================================
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :20000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
    echo Killed process %%a
)

echo.
echo Done!
timeout /t 2 /nobreak >nul
