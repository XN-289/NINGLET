@echo off
chcp 65001 >nul 2>&1
echo.
echo ========================================
echo   Creating desktop shortcut (短篇分支)...
echo ========================================
echo.

set "desktop=%USERPROFILE%\Desktop"
set "current_dir=%~dp0"

:: Create VBS script
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%temp%\shortcut.vbs"
echo sLinkFile = "%desktop%\NINGLET 短篇.lnk" >> "%temp%\shortcut.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%temp%\shortcut.vbs"
echo oLink.TargetPath = "%current_dir%start-short.bat" >> "%temp%\shortcut.vbs"
echo oLink.WorkingDirectory = "%current_dir%" >> "%temp%\shortcut.vbs"
echo oLink.Description = "NINGLET 短篇分支 (port 20010)" >> "%temp%\shortcut.vbs"
echo oLink.IconLocation = "shell32.dll,13" >> "%temp%\shortcut.vbs"
echo oLink.Save >> "%temp%\shortcut.vbs"

:: Run VBS
cscript //nologo "%temp%\shortcut.vbs"
del "%temp%\shortcut.vbs"

echo.
echo [OK] Shortcut created on Desktop!
echo.
echo File: NINGLET 短篇.lnk
echo Double-click to start (auto-opens http://localhost:20010)
echo.
pause
