# 🚀 AI-Powered Journaling Platform - Client Testing Guide

Welcome to the **AI-Powered Journaling Platform**! This modern SaaS application provides real-time sentiment analysis, AI writing assistance, and dynamic data analytics.

---

## ⚡ Quick Start (2-Step Launch)

### Option A: One-Click Launch (Recommended)
1. **Windows Users**: Double-click `start_app.bat`
2. **Mac / Linux Users**: Open Terminal and run `./start_app.sh`
3. Open your browser and navigate to: **`http://localhost:3000`**

### Option B: Manual Command Launch
```bash
docker-compose up --build -d
```
Then visit **`http://localhost:3000`**.

---

## ✨ Features to Test in Your Demonstration

### 1. ⚡ Raycast Command Palette (`Cmd+K` / `Ctrl+K`)
- Press **`Cmd+K`** (or **`Ctrl+K`** on Windows) anywhere in the application to open the quick launcher.
- Execute instant actions, search commands, or toggle themes.

### 2. ✍️ Real-Time AI Writing Assistant Suite
- Click **"Write New Journal Entry"**.
- As you type your entry, watch the **AI Mood Aura & Emoji** update instantly (`😊 HAPPY`, `🤩 EXCITED`, `😌 RELAXED`, `😰 STRESSED`, `🥺 SAD`, `🙏 GRATEFUL`, `😠 ANGRY`).
- Try the toolbar buttons:
  - **Rephrase Text**: Rewrites your entry for clarity and inspiration.
  - **Fix Grammar**: Auto-corrects spelling and grammar typos.
  - **Continue Writing**: AI generates the next reflection sentences.
  - **Auto-Tags & Summarize**: Automatically tags your entry and creates a bulleted summary.

### 3. 📊 Real-Time Analytics & Radar Balance Wheel
- Navigate to **"Mood Analytics"** in the sidebar.
- Inspect the **Emotional Balance Radar Wheel**, live positivity trend stream, and sentiment breakdown.

### 4. 🛡️ 10-Minute Session Security
- The top header displays active 10-minute session status. For security, sessions automatically require re-authentication after 10 minutes of inactivity.

---

## 🛑 How to Stop the Application
When finished testing, run:
```bash
docker-compose down
```

*Thank you for testing the AI-Powered Journaling Platform!*
