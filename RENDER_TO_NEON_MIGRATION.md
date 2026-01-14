# Migration Guide: Render PostgreSQL → Neon PostgreSQL

**Status:** Ready to execute  
**Estimated Downtime:** 5-15 minutes (maintenance window)  
**Risk Level:** Low (rollback available)

---

## 📋 Repository Discovery Summary

**Backend Stack:**
- **Runtime:** Node.js + TypeScript
- **Framework:** Express
- **ORM:** Prisma v5.7.1
- **Database:** PostgreSQL (currently Render, migrating to Neon)

**Database Configuration:**
- ✅ `schema.prisma` already uses `env("DATABASE_URL")`
- ✅ `backend/src/env.ts` reads from `process.env.DATABASE_URL`
- ✅ No code changes needed for connection string

**Migration Tool:**
- Prisma Migrate (via `npm run prisma:migrate`)

---

## 🎯 Migration Plan Overview

1. **Setup Neon Database** (5 min)
2. **Export from Render** (2-5 min)
3. **Import to Neon** (2-5 min)
4. **Update Configuration** (2 min)
5. **Verify & Test** (5-10 min)
6. **Switch Production** (1 min)
7. **Cleanup** (optional)

**Total Time:** ~20-30 minutes

---

## STEP 1: Setup Neon Database

### 1.1 Create Neon Account & Project

1. Go to [neon.tech](https://neon.tech) and sign up/login
2. Click **"Create a project"**
3. Choose:
   - **Project name:** `awty-football` (or your preference)
   - **Cloud provider:** 
     - **AWS (Recommended)** - Best default choice:
       - Render uses AWS, so better compatibility and lower latency
       - More regions available globally
       - Mature infrastructure with better performance
       - Recommended for most use cases
     - **Azure** - Choose if:
       - You have existing Azure infrastructure
       - You have specific compliance/regulatory requirements for Azure
       - Your team has Azure expertise and prefers Azure services
   - **Region:** Choose closest to your Render region (or default)
     - If using AWS: Common regions include `us-east-1`, `us-west-2`, `eu-west-1`, `ap-southeast-1`
     - If using Azure: Common regions include `East US`, `West Europe`, `Southeast Asia`
   - **PostgreSQL version:** 15 or 16 (recommended)
4. Click **"Create project"**

### 1.2 Get Connection Strings

1. In your Neon project dashboard, click the **"Connect"** button
2. In the "Connect to your database" modal, click the **"Connection String"** tab
3. You'll see connection string options:
   - **Direct connection string** (default) - For local development and direct connections
   - **Pooled connection string** - For serverless/serverless-like environments (Render, Vercel, etc.)

4. **To get the pooled connection string:**
   - Look for a **"Connection pooling"** toggle or checkbox in the Connection String tab
   - Enable the **"Connection pooling"** option
   - The connection string will update to show the pooled version
   - The pooled connection string will have `-pooler` in the hostname
   - Example format: `postgresql://user:password@ep-xxx-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require`

5. **To get the direct connection string:**
   - Keep the "Connection pooling" toggle **disabled** (or switch it off)
   - Copy the connection string shown
   - Example format: `postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require`

**For Render deployment:**
- Use the **pooled connection string** (with `-pooler` in hostname)
- This is better for serverless/serverless-like environments
- Format (AWS): `postgresql://user:password@ep-xxx-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require`
- Format (Azure): `postgresql://user:password@ep-xxx-xxx-pooler.region.azure.neon.tech/dbname?sslmode=require`

**For local development:**
- Use the **direct connection string** (without `-pooler` in hostname)
- Format (AWS): `postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require`
- Format (Azure): `postgresql://user:password@ep-xxx-xxx.region.azure.neon.tech/dbname?sslmode=require`

**Note:** If you don't see a "Connection pooling" toggle in the UI, you can manually add `-pooler` to the hostname (insert it before the region, e.g., `ep-xxx-xxx-pooler.region.aws.neon.tech`) to use connection pooling.

### 1.3 Save Connection Strings

**⚠️ DO NOT COMMIT THESE TO GIT**

Save these values securely (password manager, notes app):

```
NEON_DATABASE_URL="<paste pooled connection string from Neon>"
NEON_DIRECT_DATABASE_URL="<paste direct connection string from Neon>"
```

**Note:** Neon automatically creates a database and user. No manual setup needed.

---

## STEP 2: Export from Render PostgreSQL

### 2.1 Get Render Database Connection String

**Option A: From Render Dashboard**
1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Navigate to your PostgreSQL database service
3. Find the **"Internal Database URL"** or **"Connection String"**
4. Copy the full connection string

**Option B: From Environment Variables**
- Check your Render backend service environment variables
- Look for `DATABASE_URL` or `RENDER_DATABASE_URL`

**Save this value:**
```
RENDER_DATABASE_URL="<paste your Render PostgreSQL connection string>"
```

**Note:** Render databases typically require SSL. The connection string should include `?sslmode=require` or similar.

### 2.2 Install PostgreSQL Client (if needed)

**Windows (PowerShell):**
```powershell
# Option 1: Using Chocolatey
choco install postgresql

# Option 2: Download from postgresql.org
# Visit: https://www.postgresql.org/download/windows/
# Install PostgreSQL (includes pg_dump and pg_restore)
```

**macOS:**
```bash
# Using Homebrew
brew install postgresql@16

# Or if already installed, ensure it's in PATH
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install postgresql-client
```

**Verify installation:**
```bash
pg_dump --version
pg_restore --version
```

### 2.3 Export Database from Render

**Windows (PowerShell):**
```powershell
# Set your Render database URL (replace with actual value)
$env:RENDER_DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"

# Export database (custom format for better compatibility)
pg_dump "$env:RENDER_DATABASE_URL" --format=custom --no-owner --no-acl --file render.dump

# Verify dump was created
ls render.dump
```

**macOS/Linux:**
```bash
# Set your Render database URL (replace with actual value)
export RENDER_DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"

# Export database (custom format for better compatibility)
pg_dump "$RENDER_DATABASE_URL" --format=custom --no-owner --no-acl --file render.dump

# Verify dump was created
ls -lh render.dump
```

**Troubleshooting:**

- **"pg_dump: error: server requires SSL"**
  - Ensure connection string includes `?sslmode=require`
  - Or set: `export PGSSLMODE=require` before running pg_dump

- **"pg_dump: error: connection to server failed"**
  - Verify Render database is running
  - Check connection string is correct
  - Ensure your IP is allowed (Render databases may have IP restrictions)

- **"pg_dump: command not found"**
  - Install PostgreSQL client (see Step 2.2)
  - Ensure PostgreSQL bin directory is in PATH

**Expected Output:**
- File `render.dump` should be created (size depends on your data)
- No errors in console

---

## STEP 3: Import to Neon

### 3.1 Import Database to Neon

**Windows (PowerShell):**
```powershell
# Set your Neon database URL (use direct connection for import)
$env:NEON_DATABASE_URL="<paste direct connection string from Neon>"

# Import database
pg_restore --no-owner --no-acl --dbname "$env:NEON_DATABASE_URL" render.dump

# If you get connection errors, try with verbose output:
pg_restore --verbose --no-owner --no-acl --dbname "$env:NEON_DATABASE_URL" render.dump
```

**macOS/Linux:**
```bash
# Set your Neon database URL (use direct connection for import)
export NEON_DATABASE_URL="<paste direct connection string from Neon>"

# Import database
pg_restore --no-owner --no-acl --dbname "$NEON_DATABASE_URL" render.dump

# If you get connection errors, try with verbose output:
pg_restore --verbose --no-owner --no-acl --dbname "$NEON_DATABASE_URL" render.dump
```

**Troubleshooting:**

- **"pg_restore: error: connection to server failed"**
  - Verify Neon database is running (check Neon dashboard)
  - Ensure connection string is correct
  - Neon databases are accessible from anywhere (no IP restrictions)

- **"ERROR: extension 'xxx' does not exist"**
  - Some extensions may not be available in Neon
  - Common extensions (uuid-ossp, pgcrypto) are available
  - If you see this, note the extension name and we can handle it

- **"ERROR: must be owner of..."**
  - The `--no-owner --no-acl` flags should prevent this
  - If it persists, try: `pg_restore --no-owner --no-acl --clean --if-exists --dbname "$NEON_DATABASE_URL" render.dump`

**Expected Output:**
- Import completes without errors
- You may see warnings about extensions or ownership (these are usually safe to ignore)

### 3.2 Verify Data Import

**Option A: Using Neon Dashboard**
1. Go to Neon dashboard → Your project → **"SQL Editor"**
2. Run:
   ```sql
   SELECT COUNT(*) FROM "Player";
   SELECT COUNT(*) FROM "Game";
   SELECT COUNT(*) FROM "User";
   SELECT COUNT(*) FROM "AllowedEmail";
   SELECT COUNT(*) FROM "AppSettings";
   ```
3. Compare counts with your Render database

**Option B: Using psql**
```bash
# Connect to Neon
psql "$NEON_DATABASE_URL"

# Run queries
SELECT COUNT(*) FROM "Player";
SELECT COUNT(*) FROM "Game";
SELECT COUNT(*) FROM "User";
SELECT COUNT(*) FROM "AllowedEmail";
SELECT COUNT(*) FROM "AppSettings";

# Exit
\q
```

---

## STEP 4: Update Application Configuration

### 4.1 Update Local .env File

**Create/Update `backend/.env`:**
```env
# Neon Database (use direct connection for local dev)
DATABASE_URL="<paste Neon direct connection string>"

# Other existing vars (keep as-is)
PORT=4000
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:4000
GOOGLE_CLIENT_ID=<your-existing-value>
GOOGLE_CLIENT_SECRET=<your-existing-value>
SESSION_SECRET=<your-existing-value>
NODE_ENV=development
```

**⚠️ DO NOT COMMIT `.env` TO GIT** (it's already in `.gitignore`)

### 4.2 Create/Update .env.example

Create `backend/.env.example` (this file IS committed to git):

```env
# Database
DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"

# Server
PORT=4000
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:4000

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Session
SESSION_SECRET=change-this-to-a-strong-random-secret

# Environment
NODE_ENV=development

# Google Sheets (if used)
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
```

### 4.3 Verify Prisma Schema

**Check `backend/prisma/schema.prisma`** (should already be correct):
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // ✅ Already correct
}
```

**No changes needed** - it already uses `env("DATABASE_URL")`.

### 4.4 Test Local Connection

```bash
cd backend

# Generate Prisma client with new connection
npm run prisma:generate

# Check migration status (should show all migrations applied)
npx prisma migrate status

# Test connection
npx prisma db execute --stdin <<< "SELECT 1;"
```

**Expected Output:**
- Prisma client generates successfully
- Migration status shows all migrations applied
- Connection test succeeds

---

## STEP 5: Verify Locally

### 5.1 Start Backend Locally

```bash
cd backend
npm run dev
```

**Check for:**
- ✅ Server starts without errors
- ✅ No database connection errors
- ✅ Health endpoint works: `curl http://localhost:4000/health`

### 5.2 Test Database Operations

**Option A: Using Prisma Studio**
```bash
cd backend
npm run prisma:studio
```

- Open http://localhost:5174 (or the port shown)
- Verify you can see:
  - Players
  - Games
  - Users
  - AllowedEmails
  - AppSettings

**Option B: Using API Endpoints**
```bash
# Test health endpoint
curl http://localhost:4000/health

# Test players endpoint (if you have auth set up)
curl http://localhost:4000/api/players
```

### 5.3 Run Prisma Migrations Check

```bash
cd backend

# Check migration status
npx prisma migrate status

# Should show: "Database schema is up to date"
```

**If migrations are out of sync:**
```bash
# This should not be needed if import was successful, but if needed:
npx prisma migrate deploy
```

---

## STEP 6: Update Render Production Environment

### 6.1 Update Render Environment Variables

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Navigate to your **backend web service** (not the database)
3. Go to **"Environment"** tab
4. Find `DATABASE_URL` environment variable
5. **Update it** to your Neon pooled connection string:
   ```
   DATABASE_URL=<paste Neon pooled connection string>
   ```
6. Click **"Save Changes"**
7. Render will automatically redeploy your service

**⚠️ IMPORTANT:**
- **DO NOT** delete the old Render database yet (keep it as backup)
- **DO NOT** remove any other environment variables
- Only update `DATABASE_URL`

### 6.2 Monitor Deployment

1. Go to **"Events"** tab in Render dashboard
2. Watch for deployment to complete
3. Check for any errors in logs

**Expected:**
- Deployment succeeds
- No database connection errors in logs
- Health endpoint responds: `https://your-backend.onrender.com/health`

---

## STEP 7: Verify Production

### 7.1 Production Health Check

```bash
# Test health endpoint
curl https://your-backend.onrender.com/health

# Should return: {"status":"ok"}
```

### 7.2 Test Production API

**Test key endpoints:**
- Health: `GET /health`
- Players: `GET /api/players` (if authenticated)
- Games: `GET /api/games` (if authenticated)

**Check Render logs:**
- No database connection errors
- No Prisma errors
- Requests succeed

### 7.3 Verify Data Integrity

**Option A: Using Prisma Studio (local, pointing to Neon)**
```bash
cd backend
# Ensure .env has Neon connection string
npm run prisma:studio
```

**Option B: Using API**
- Log into your app
- Verify you can see existing players, games, etc.
- Create a test entry and verify it persists

---

## STEP 8: Rollback Plan (if needed)

**If something goes wrong:**

### 8.1 Quick Rollback

1. Go to Render dashboard → Backend service → Environment
2. Change `DATABASE_URL` back to your Render database connection string
3. Save changes (Render will redeploy)
4. Service should be back to using Render database

### 8.2 Data Recovery

- Your Render database is unchanged (we only read from it)
- All data is still in Render database
- No data loss risk

---

## STEP 9: Cleanup (Optional - After Verification)

**⚠️ Only do this after 24-48 hours of successful operation**

### 9.1 Delete Render Database (if desired)

1. Go to Render dashboard
2. Navigate to your PostgreSQL database service
3. Click **"Settings"** → **"Delete"**
4. Confirm deletion

**⚠️ WARNING:** This is permanent. Only do this after you're 100% confident Neon is working.

### 9.2 Clean Up Local Files

```bash
# Remove dump file (contains sensitive data)
rm render.dump

# Or on Windows:
del render.dump
```

---

## ✅ Final Checklist

### Pre-Migration
- [ ] Neon account created
- [ ] Neon project and database created
- [ ] Neon connection strings saved securely
- [ ] Render database connection string obtained
- [ ] PostgreSQL client installed locally

### Migration
- [ ] Database exported from Render (`render.dump` created)
- [ ] Database imported to Neon (no errors)
- [ ] Data verified in Neon (row counts match)
- [ ] Local `.env` updated with Neon connection
- [ ] Local backend tested successfully
- [ ] Prisma migrations verified

### Production Switch
- [ ] Render `DATABASE_URL` updated to Neon
- [ ] Render deployment completed successfully
- [ ] Production health check passes
- [ ] Production API endpoints tested
- [ ] Production data verified

### Post-Migration
- [ ] App running normally for 24+ hours
- [ ] No database errors in logs
- [ ] Users can access app normally
- [ ] (Optional) Render database deleted
- [ ] (Optional) Local dump file deleted

---

## 🔧 Troubleshooting

### Common Issues

**1. "Connection refused" or "Connection timeout"**
- Verify Neon database is running (check Neon dashboard)
- Check connection string is correct
- Ensure SSL mode is set (`?sslmode=require`)

**2. "Migration out of sync"**
- Run: `npx prisma migrate deploy` (in production)
- Or: `npx prisma migrate dev` (in development)

**3. "Extension not found"**
- Neon supports most common extensions
- If you need a specific extension, check Neon docs or contact support

**4. "Schema mismatch"**
- Ensure Prisma schema matches your database
- Run: `npx prisma db pull` to sync schema from database
- Then: `npx prisma generate`

**5. "Performance issues"**
- Neon uses connection pooling by default
- Use pooled connection string for production
- Monitor Neon dashboard for connection limits

---

## 📚 Additional Resources

- [Neon Documentation](https://neon.tech/docs)
- [Prisma Migration Guide](https://www.prisma.io/docs/guides/migrate)
- [PostgreSQL pg_dump Documentation](https://www.postgresql.org/docs/current/app-pgdump.html)
- [PostgreSQL pg_restore Documentation](https://www.postgresql.org/docs/current/app-pgrestore.html)

---

## 🎉 Done When

- ✅ Production app is using Neon database
- ✅ All endpoints respond correctly
- ✅ Data is accessible and correct
- ✅ No errors in production logs
- ✅ App has been stable for 24+ hours
- ✅ (Optional) Old Render database deleted

**Migration Complete!** 🚀
