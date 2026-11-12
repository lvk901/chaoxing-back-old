@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [x] 没找到 python，请先安装 Python 3 并加入 PATH
  echo     或手动把 chaoxing-back-old.user.js 拖进浏览器窗口安装
  pause
  exit /b 1
)

python install.py %*
echo.
pause
