@echo off
title AI-Powered Journaling Platform - Client Launch Script
echo ========================================================
echo   AI-POWERED JOURNALING PLATFORM - SAAS CLIENT RELEASE
echo ========================================================
echo.

if not exist .env (
    echo No .env file found - copying .env.example to .env.
    echo Fill in the required secrets in .env before continuing if this is the first run.
    copy .env.example .env >nul
    echo.
)

echo Building Java service jars with Maven (this can take a few minutes on a clean checkout)...
call mvn clean package -DskipTests
if errorlevel 1 (
    echo.
    echo Maven build failed - fix the errors above before starting Docker Compose.
    pause
    exit /b 1
)

echo.
echo Starting application containers via Docker Compose...
echo.

docker-compose up --build -d

echo.
echo ========================================================
echo Application is running!
echo Access the SaaS App in your browser: http://localhost:3000
echo ========================================================
echo.
pause
