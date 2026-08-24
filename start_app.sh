#!/bin/bash
set -e

echo "========================================================"
echo "  AI-POWERED JOURNALING PLATFORM - SAAS CLIENT RELEASE"
echo "========================================================"
echo ""

if [ ! -f .env ]; then
    echo "No .env file found - copying .env.example to .env."
    echo "Fill in the required secrets in .env before continuing if this is the first run."
    cp .env.example .env
    echo ""
fi

echo "Building Java service jars with Maven (this can take a few minutes on a clean checkout)..."
mvn clean package -DskipTests

echo ""
echo "Starting application containers via Docker Compose..."
echo ""

docker-compose up --build -d

echo ""
echo "========================================================"
echo "Application is running!"
echo "Access the SaaS App in your browser: http://localhost:3000"
echo "========================================================"
echo ""
