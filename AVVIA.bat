@echo off
chcp 65001 >nul
title NaBoat - Avvio portale
cd /d "%~dp0"

echo ============================================
echo   NaBoat - avvio del portale locale
echo ============================================
echo.

docker info >nul 2>&1
if not errorlevel 1 goto docker_ok

echo Docker non risulta attivo: provo ad avviare Docker Desktop...
set "DD="
if exist "C:\Users\Giuseppe\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe" set "DD=C:\Users\Giuseppe\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"
if not defined DD if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" set "DD=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if not defined DD if exist "%LOCALAPPDATA%\Docker\Docker Desktop.exe" set "DD=%LOCALAPPDATA%\Docker\Docker Desktop.exe"
if not defined DD (
  echo Non ho trovato Docker Desktop: aprilo a mano e rilancia questo file.
  pause
  exit /b 1
)
start "" "%DD%"

:wait_docker
timeout /t 3 >nul
docker info >nul 2>&1
if errorlevel 1 goto wait_docker

:docker_ok
echo Docker attivo.
echo.

echo Avvio database e cache...
docker compose up -d db redis

echo Attendo che il database sia pronto...
:wait_db
docker compose exec -T db pg_isready -U naboat >nul 2>&1
if errorlevel 1 (
  timeout /t 2 >nul
  goto wait_db
)
echo Database pronto.
echo.

echo Apro il browser su http://localhost:3000 ...
timeout /t 2 >nul
start "" http://localhost:3000

echo Avvio del portale. Lascia questa finestra APERTA mentre lavori.
echo Per fermare il portale: premi CTRL+C qui dentro.
echo.
npm run dev

echo.
echo Il portale si e' fermato.
pause
