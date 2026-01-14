#!/bin/bash
# Migration Script: Render PostgreSQL → Neon PostgreSQL
# macOS/Linux version
#
# USAGE:
# 1. Make executable: chmod +x migrate-to-neon.sh
# 2. Edit the connection strings below
# 3. Run: ./migrate-to-neon.sh
#
# ⚠️ DO NOT COMMIT THIS FILE WITH REAL CREDENTIALS

set -e  # Exit on error

# ============================================
# STEP 1: SET YOUR CONNECTION STRINGS
# ============================================
# Replace these with your actual connection strings

RENDER_DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"
NEON_DATABASE_URL="postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require"

# ============================================
# STEP 2: EXPORT FROM RENDER
# ============================================

echo "📤 Exporting database from Render..."

DUMP_FILE="render.dump"

# Export database
pg_dump "$RENDER_DATABASE_URL" \
    --format=custom \
    --no-owner \
    --no-acl \
    --file "$DUMP_FILE"

if [ $? -ne 0 ]; then
    echo "❌ Export failed! Check your RENDER_DATABASE_URL and PostgreSQL client installation."
    exit 1
fi

echo "✅ Export completed: $DUMP_FILE"
echo "   File size: $(du -h "$DUMP_FILE" | cut -f1)"

# ============================================
# STEP 3: IMPORT TO NEON
# ============================================

echo ""
echo "📥 Importing database to Neon..."

# Import database
pg_restore \
    --no-owner \
    --no-acl \
    --dbname "$NEON_DATABASE_URL" \
    "$DUMP_FILE"

if [ $? -ne 0 ]; then
    echo "❌ Import failed! Check your NEON_DATABASE_URL."
    exit 1
fi

echo "✅ Import completed successfully!"

# ============================================
# STEP 4: VERIFY
# ============================================

echo ""
echo "🔍 Verifying data import..."

# Test connection and count records
VERIFY_QUERY='
SELECT 
    (SELECT COUNT(*) FROM "Player") as players,
    (SELECT COUNT(*) FROM "Game") as games,
    (SELECT COUNT(*) FROM "User") as users,
    (SELECT COUNT(*) FROM "AllowedEmail") as allowed_emails,
    (SELECT COUNT(*) FROM "AppSettings") as settings;
'

psql "$NEON_DATABASE_URL" -c "$VERIFY_QUERY" -t

if [ $? -eq 0 ]; then
    echo "✅ Verification successful!"
else
    echo "⚠️  Verification query failed, but import may still be successful."
fi

# ============================================
# NEXT STEPS
# ============================================

echo ""
echo "📋 Next Steps:"
echo "1. Update backend/.env with NEON_DATABASE_URL"
echo "2. Test locally: cd backend && npm run dev"
echo "3. Update Render environment variable DATABASE_URL"
echo "4. Verify production deployment"
echo ""
echo "⚠️  Remember to delete render.dump after migration is complete!"
