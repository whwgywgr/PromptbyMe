@echo off
rem PromptbyMe - starts a tiny local server and opens the app
cd /d "%~dp0"
echo Starting PromptbyMe at http://localhost:8931 ...
start "" "http://localhost:8931"
py -m http.server 8931 2>nul || python -m http.server 8931
