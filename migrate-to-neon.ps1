# Migration Script: Render PostgreSQL → Neon PostgreSQL
# Windows PowerShell version
#
# USAGE:
# 1. Set the environment variables below with your actual connection strings
# 2. Run: .\migrate-to-neon.ps1
#
# ⚠️ DO NOT COMMIT THIS FILE WITH REAL CREDENTIALS

# ============================================
# STEP 1: SET YOUR CONNECTION STRINGS
# ============================================
# Replace these with your actual connection strings

$RENDER_DATABASE_URL = "postgresql://user:password@host:port/dbname?sslmode=require"
$NEON_DATABASE_URL = "postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require"

# ============================================
# STEP 2: EXPORT FROM RENDER
# ============================================

Write-Host "📤 Exporting database from Render..." -ForegroundColor Cyan

$dumpFile = "render.dump"

# Export database
pg_dump $RENDER_DATABASE_URL --format=custom --no-owner --no-acl --file $dumpFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Export failed! Check your RENDER_DATABASE_URL and PostgreSQL client installation." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Export completed: $dumpFile" -ForegroundColor Green
Write-Host "   File size: $((Get-Item $dumpFile).Length / 1MB) MB" -ForegroundColor Gray

# ============================================
# STEP 3: IMPORT TO NEON
# ============================================

Write-Host "`n📥 Importing database to Neon..." -ForegroundColor Cyan

# Import database
pg_restore --no-owner --no-acl --dbname $NEON_DATABASE_URL $dumpFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Import failed! Check your NEON_DATABASE_URL." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Import completed successfully!" -ForegroundColor Green

# ============================================
# STEP 4: VERIFY
# ============================================

Write-Host "`n🔍 Verifying data import..." -ForegroundColor Cyan

# Test connection and count records
$verifyQuery = @"
SELECT 
    (SELECT COUNT(*) FROM "Player") as players,
    (SELECT COUNT(*) FROM "Game") as games,
    (SELECT COUNT(*) FROM "User") as users,
    (SELECT COUNT(*) FROM "AllowedEmail") as allowed_emails,
    (SELECT COUNT(*) FROM "AppSettings") as settings;
"@

$verifyResult = psql $NEON_DATABASE_URL -c $verifyQuery -t

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Verification successful!" -ForegroundColor Green
    Write-Host $verifyResult -ForegroundColor Gray
} else {
    Write-Host "⚠️  Verification query failed, but import may still be successful." -ForegroundColor Yellow
}

# ============================================
# NEXT STEPS
# ============================================

Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Update backend/.env with NEON_DATABASE_URL" -ForegroundColor White
Write-Host "2. Test locally: cd backend && npm run dev" -ForegroundColor White
Write-Host "3. Update Render environment variable DATABASE_URL" -ForegroundColor White
Write-Host "4. Verify production deployment" -ForegroundColor White
Write-Host "`n⚠️  Remember to delete render.dump after migration is complete!" -ForegroundColor Yellow
