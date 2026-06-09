@echo off
REM Cookie Keeper host launcher (Windows). install.ps1 rewrites the
REM NODE_BIN line below to an absolute path captured at install time.
REM Fallback is plain `node` for the case where this file is run from
REM the bare checkout (e.g. by a probe script).
set "NODE_BIN=node"  REM COOKIE_KEEPER_NODE_BIN_ANCHOR
if not exist "%USERPROFILE%\.agents\cookie-keeper" mkdir "%USERPROFILE%\.agents\cookie-keeper" 2>nul
"%NODE_BIN%" "%~dp0host.js" %* 2>>"%USERPROFILE%\.agents\cookie-keeper\host.log"
exit /b %ERRORLEVEL%
