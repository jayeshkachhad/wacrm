#!/usr/bin/env bash
set -e

# ==============================================================
# WACRM Production Deployment Script (VPS / PM2)
# ==============================================================

# Move to the script's directory (app root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting deployment in $SCRIPT_DIR..."

# 1. Pull latest code (if using git and not passed --no-pull)
if [ "$1" != "--no-pull" ]; then
  if [ -d ".git" ]; then
    echo "📥 Pulling latest changes from git..."
    git pull --rebase || {
      echo "⚠️ Git pull failed or had conflicts. Continuing with local build..."
    }
  fi
else
  echo "⏩ Skipping git pull (--no-pull flag active)..."
fi

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm install --prefer-offline --no-audit

# 3. Build Next.js application
echo "🏗️ Building Next.js application..."
npm run build

# 4. Prepare standalone static assets
# Next.js standalone mode requires .next/static and public in .next/standalone
echo "📂 Syncing static files into standalone directory..."
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/
if [ -d "public" ]; then
  cp -r public .next/standalone/
fi

# 5. Ensure .env.local exists for standalone server
if [ ! -f ".env.local" ] && [ -f ".env" ]; then
  echo "ℹ️ No .env.local found, copying from .env..."
  cp .env .env.local
fi

# 6. Reload or start PM2 process
echo "🔄 Reloading application with PM2..."
if command -v pm2 &> /dev/null; then
  if [ -f "ecosystem.config.cjs" ]; then
    pm2 reload ecosystem.config.cjs --update-env || pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs
  else
    pm2 reload wacrm || pm2 restart wacrm || pm2 start npm --name "wacrm" -- start -- -p 3017
  fi
  pm2 save
  echo "✅ PM2 process reloaded and saved!"
else
  echo "⚠️ PM2 not found in PATH. You can start the server manually using:"
  echo "   npm run start -- -p 3017"
fi

echo "🎉 Deployment completed successfully!"
