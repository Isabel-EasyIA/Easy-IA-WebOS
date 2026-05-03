@echo off
title Easy IA WebOS - Server Console
color 0E
echo ==========================================
echo       INICIANDO EASY IA WEBOS
echo ==========================================
echo.
echo [1/2] Abriendo navegador en http://localhost:8000...
start http://localhost:8000
echo.
echo [2/2] Iniciando servidor de archivos reales...
echo.
echo Presiona Ctrl+C para detener el servidor.
echo ------------------------------------------
python server.py
pause
