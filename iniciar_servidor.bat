@echo off
title HandStat - Servidor Local
echo ========================================================
echo        HANDSTAT - INICIANDO SERVIDOR LOCAL (4173)
echo ========================================================
echo.
cd /d "C:\Users\Fede\.gemini\antigravity\scratch\handball-analytics-app"

if not exist "dist" (
    echo [INFO] Carpeta dist no encontrada. Compilando aplicacion...
    call npm run build
)

echo [INFO] Abriendo aplicacion en el navegador...
start http://localhost:4173/

echo [INFO] Servidor activo en http://localhost:4173/ y en tu red local.
echo [INFO] Para apagar el servidor, cierra esta ventana o presiona Ctrl+C.
echo.
call npx vite preview --port 4173 --host
pause
