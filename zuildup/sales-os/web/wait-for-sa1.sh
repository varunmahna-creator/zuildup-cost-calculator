#!/bin/bash
echo "⏳ Waiting for SA-1 to complete Supabase setup..."
echo "Checking for SA1_DONE.md every 60 seconds..."

while true; do
  if [ -f "../SA1_DONE.md" ]; then
    echo "✅ SA1_DONE.md found!"
    exit 0
  fi
  echo "⏰ $(date '+%H:%M:%S') - Still waiting..."
  sleep 60
done
