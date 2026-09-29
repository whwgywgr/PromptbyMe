@echo off
rem PromptbyMe - starts a tiny local server and opens the app
cd /d "%~dp0"
echo Starting PromptbyMe at http://localhost:8931 ...
start "" "http://localhost:8931"
python server.py
