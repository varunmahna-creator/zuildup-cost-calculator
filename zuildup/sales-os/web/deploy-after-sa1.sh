#!/bin/bash
set -e

echo "🚀 SA-3 Deployment Script"
echo "=========================="

# 1. Check if SA1 is done
if [ ! -f "../SA1_DONE.md" ]; then
  echo "❌ SA1_DONE.md not found. Run this after SA-1 completes."
  exit 1
fi

# 2. Read credentials from parent .env
echo "📖 Reading Supabase credentials from ../.env"
source ../.env

if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
  echo "❌ Missing Supabase credentials in ../.env"
  exit 1
fi

# 3. Update .env.local
echo "✏️  Updating .env.local with real credentials"
cat > .env.local << ENVEOF
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENVEOF

# 4. Rebuild with real credentials
echo "🔨 Rebuilding with real credentials..."
npm run build

# 5. Install Netlify CLI if needed
if ! command -v netlify &> /dev/null; then
  echo "📦 Installing Netlify CLI..."
  npm install -g netlify-cli
fi

# 6. Deploy to Netlify
echo "🌐 Deploying to Netlify..."
export NETLIFY_AUTH_TOKEN="nfp_99gYYzQJbe2HDXPpJ8ztjFqmBQGqTMqX027d"

# Create site if doesn't exist, otherwise deploy to existing
netlify deploy --prod --dir=.next --site=zuildup-sales || \
  netlify deploy --prod --dir=.next --site=zuildup-sales --create-site --name=zuildup-sales

echo "✅ Deployment complete!"
echo "🔗 Live URL: https://zuildup-sales.netlify.app"
