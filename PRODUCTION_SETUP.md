# Production Setup Guide for awtyfootballclub.com

This guide covers setting up your app for production deployment with your custom domain.

## Prerequisites

- Custom domain: `awtyfootballclub.com`
- GitHub repository pushed and ready
- Google OAuth credentials created

## Domain Setup Options

### Option 1: Subdomain Setup (Recommended)
- Frontend: `awtyfootballclub.com` (or `www.awtyfootballclub.com`)
- Backend API: `api.awtyfootballclub.com`

### Option 2: Same Domain
- Frontend: `awtyfootballclub.com`
- Backend API: `awtyfootballclub.com/api` (using path-based routing)

## Step 1: Update Google OAuth Settings

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to your OAuth 2.0 credentials
3. Update **Authorized JavaScript origins:**
   - `https://awtyfootballclub.com`
   - `https://www.awtyfootballclub.com` (if using www)
   - `https://api.awtyfootballclub.com` (if using subdomain)
4. Update **Authorized redirect URIs:**
   - `https://api.awtyfootballclub.com/api/auth/google/callback` (if using subdomain)
   - OR `https://awtyfootballclub.com/api/auth/google/callback` (if using same domain)

## Step 2: Deploy Backend (Railway Recommended)

1. **Create Railway Account:**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `AwtyFootball` repository

3. **Add PostgreSQL Database:**
   - In your Railway project, click "New"
   - Select "Database" > "Add PostgreSQL"
   - Railway will automatically create a database and set `DATABASE_URL`

4. **Configure Backend Service:**
   - Railway should auto-detect your backend
   - If not, add a new service and point to `backend/` directory
   - Set the start command: `npm start` (or Railway will auto-detect)

5. **Set Environment Variables:**
   ```
   DATABASE_URL=<automatically set by Railway>
   PORT=4000
   FRONTEND_URL=https://awtyfootballclub.com
   BACKEND_URL=https://api.awtyfootballclub.com
   GOOGLE_CLIENT_ID=<your-google-client-id>
   GOOGLE_CLIENT_SECRET=<your-google-client-secret>
   SESSION_SECRET=<generate-strong-random-string>
   NODE_ENV=production
   ```

6. **Run Database Migrations:**
   - In Railway, open your backend service
   - Go to "Settings" > "Deploy"
   - Add a deploy command: `npx prisma migrate deploy && npm start`
   - Or run manually in Railway's shell: `npx prisma migrate deploy`

7. **Get Your Backend URL:**
   - Railway will provide a URL like `your-app.up.railway.app`
   - Note this URL for now (you'll update it with your custom domain later)

## Step 3: Deploy Frontend (Vercel Recommended)

1. **Create Vercel Account:**
   - Go to [vercel.com](https://vercel.com)
   - Sign up with GitHub

2. **Import Project:**
   - Click "Add New" > "Project"
   - Import your `AwtyFootball` repository

3. **Configure Project:**
   - **Root Directory:** Set to `frontend`
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

4. **Set Environment Variables:**
   ```
   VITE_API_URL=https://api.awtyfootballclub.com/api
   ```

5. **Deploy:**
   - Click "Deploy"
   - Vercel will build and deploy your frontend
   - You'll get a URL like `your-app.vercel.app`

## Step 4: Configure Custom Domain

### For Frontend (Vercel):

1. In Vercel project settings, go to "Domains"
2. Add your domain: `awtyfootballclub.com`
3. Add www version: `www.awtyfootballclub.com` (optional)
4. Follow Vercel's DNS instructions:
   - Add an A record pointing to Vercel's IP
   - OR add a CNAME record pointing to `cname.vercel-dns.com`
5. Vercel will automatically provision SSL certificate

### For Backend (Railway):

1. In Railway project, go to your backend service
2. Click "Settings" > "Networking"
3. Add custom domain: `api.awtyfootballclub.com`
4. Railway will provide DNS records to add:
   - Add a CNAME record: `api` → Railway's provided domain
5. Railway will automatically provision SSL certificate

### DNS Configuration Example:

If using a DNS provider (like Cloudflare, Namecheap, etc.):

```
Type    Name    Value
A       @       <Vercel IP> (for frontend)
CNAME   www     cname.vercel-dns.com (for www)
CNAME   api     <Railway CNAME> (for backend API)
```

## Step 5: Update Environment Variables After Domain Setup

### Backend (Railway):
Update `FRONTEND_URL` and `BACKEND_URL` to use your custom domain:
```
FRONTEND_URL=https://awtyfootballclub.com
BACKEND_URL=https://api.awtyfootballclub.com
```

### Frontend (Vercel):
Update `VITE_API_URL`:
```
VITE_API_URL=https://api.awtyfootballclub.com/api
```

## Step 6: Final Google OAuth Update

After domains are configured:
1. Update Google OAuth with final production URLs
2. Test the login flow

## Step 7: Add First Admin User

1. Connect to your production database (Railway provides connection details)
2. Add your email to the `AllowedEmail` table with role `admin`:
   ```sql
   INSERT INTO "AllowedEmail" (id, email, role, "createdAt")
   VALUES (gen_random_uuid(), 'your-email@example.com', 'admin', NOW());
   ```

## Testing Checklist

- [ ] Frontend loads at `https://awtyfootballclub.com`
- [ ] Backend API responds at `https://api.awtyfootballclub.com`
- [ ] Google OAuth login works
- [ ] Can access app on mobile device
- [ ] Can add players
- [ ] Can view games (regular user)
- [ ] Can record goals (admin only)
- [ ] Database persists data correctly

## Troubleshooting

### CORS Errors
- Verify `FRONTEND_URL` in backend matches your actual frontend domain
- Check that CORS is configured correctly in `backend/src/index.ts`

### OAuth Redirect Errors
- Verify redirect URI in Google Console matches exactly: `https://api.awtyfootballclub.com/api/auth/google/callback`
- Check `BACKEND_URL` environment variable

### Database Connection
- Verify `DATABASE_URL` is set correctly in Railway
- Check that migrations ran successfully
- Ensure database is accessible from Railway

### Session Not Persisting
- Verify `sameSite: 'none'` for cross-domain cookies
- Check `secure: true` for HTTPS
- Verify domain is set correctly in session config

## Security Notes

- Always use HTTPS in production
- Keep `SESSION_SECRET` strong and secret
- Never commit `.env` files
- Regularly update dependencies
- Monitor Railway/Vercel logs for errors

## Cost Estimate

- **Vercel:** Free tier (sufficient for most apps)
- **Railway:** $5 credit/month (usually enough, may need to upgrade)
- **Domain:** Already purchased
- **Total:** ~$0-20/month depending on usage

