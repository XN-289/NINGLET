@echo off
echo.
echo ========================================
echo   Creating desktop shortcut...
echo ========================================
echo.

set "desktop=%USERPROFILE%\Desktop"
set "current_dir=%~dp0"

:: Create VBS script
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%temp%\shortcut.vbs"
echo sLinkFile = "%desktop%\Kealin AI Novels.lnk" >> "%temp%\shortcut.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%temp%\shortcut.vbs"
echo oLink.TargetPath = "%current_dir%start.bat" >> "%temp%\shortcut.vbs"
echo oLink.WorkingDirectory = "%current_dir%" >> "%temp%\shortcut.vbs"
echo oLink.Description = "Kealin AI Novels" >> "%temp%\shortcut.vbs"
echo oLink.IconLocation = "shell32.dll,1" >> "%temp%\shortcut.vbs"
echo oLink.Save >> "%temp%\shortcut.vbs"

:: Run VBS
cscript //nologo "%temp%\shortcut.vbs"
del "%temp%\shortcut.vbs"

echo.
echo [OK] Shortcut created on Desktop!
echo.
echo File: Kealin AI Novels.lnk
echo.
pause
