@echo off
chcp 65001 >nul
title NaBoat - Salvataggio su GitHub
cd /d "%~dp0"

echo ============================================
echo   NaBoat - salvataggio su GitHub
echo ============================================
echo.

git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo Nessuna modifica da salvare: e' tutto gia' aggiornato.
  goto fine
)

echo Salvo le modifiche...
git commit -m "Salvataggio %date%"
echo.
echo Carico su GitHub...
git push
if errorlevel 1 (
  echo.
  echo ERRORE nel caricamento: controlla i messaggi qui sopra.
  echo Se e' la prima volta, potrebbe servire accedere a GitHub: riprova.
) else (
  echo.
  echo Fatto: le modifiche sono online su GitHub.
)

:fine
echo.
pause
