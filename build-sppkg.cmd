@echo off
REM ============================================================
REM  Build .sppkg cho DMS Portal (production / --ship)
REM  Yeu cau: Node >= 22.14.0 < 23  (kiem tra: node -v)
REM  Ket qua: sharepoint\solution\dms-portal.sppkg
REM ============================================================
setlocal

echo [1/4] Kiem tra Node...
node -v

echo [2/4] Don build cu (gulp clean)...
call node_modules\.bin\gulp clean
if errorlevel 1 goto :err

echo [3/4] Bundle production (gulp bundle --ship)...
call node_modules\.bin\gulp bundle --ship
if errorlevel 1 goto :err

echo [4/4] Dong goi (gulp package-solution --ship)...
call node_modules\.bin\gulp package-solution --ship
if errorlevel 1 goto :err

echo.
echo ====================================================
echo  XONG. File deploy: sharepoint\solution\dms-portal.sppkg
echo ====================================================
goto :eof

:err
echo.
echo *** BUILD LOI - xem log phia tren ***
exit /b 1
