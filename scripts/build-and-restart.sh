#!/bin/bash

# Script untuk build dan restart dengan jeda menunggu AI agent selesai
# Usage: ./scripts/build-and-restart.sh

set -e

echo "🔨 Starting build process..."
npm run build

echo ""
echo "⏳ Waiting 10 seconds for AI agent to complete..."
for i in {10..1}; do
  echo "   $i..."
  sleep 1
done

echo ""
echo "🔄 Restarting PM2 routermod..."
pm2 restart routermod

echo ""
echo "✅ Done! Server restarted successfully."
pm2 status routermod
