# Deployment Guide for Awty Football

This guide covers deploying your app so it's accessible on mobile devices and to other users.

## Quick Answer

**You don't need a domain**, but it's recommended. You can use free hosting services that provide subdomains (e.g., `your-app.vercel.app` or `your-app.netlify.app`).

## Deployment Options

### Option 1: Vercel (Recommended - Easiest)

**Pros:**
- Free tier with generous limits
- Automatic HTTPS
- Easy deployment from GitHub
- Great for React/Vite frontends
- Can host backend as serverless functions

**Cons:**
- Backend might need adjustments for serverless

**Steps:**
1. Push your code to GitHub (if not already done)
2. Go to [vercel.com](https://vercel.com) and sign up
3. Import your GitHub repository
4. Configure:
   - **Frontend**: Set root directory to `frontend`
   - **Backend**: Deploy separately or use Vercel serverless functions
   - Add environment variables

### Option 2: Railway (Best for Full-Stack)

**Pros:**
- Free tier ($5 credit/month)
- Easy PostgreSQL database setup
- Great for Node.js backends
- Automatic HTTPS
- Simple deployment from GitHub

**Cons:**
- Free tier has limits (sleeps after inactivity)

**Steps:**
1. Go to [railway.app](https://railway.app) and sign up
2. Create a new project from GitHub
3. Add PostgreSQL database (free tier available)
4. Deploy backend and frontend as separate services
5. Configure environment variables

### Option 3: Render

**Pros:**
- Free tier available
- PostgreSQL database included
- Good for full-stack apps
- Automatic HTTPS

**Cons:**
- Free tier services sleep after inactivity (15 min wake time)

**Steps:**
1. Go to [render.com](https://render.com) and sign up
2. Create a new Web Service for backend
3. Create a new Static Site for frontend
4. Add PostgreSQL database
5. Configure environment variables

### Option 4: Fly.io

**Pros:**
- Free tier with good limits
- Global edge network
- Great for mobile access
- Supports both frontend and backend

**Cons:**
- Slightly more complex setup

## Important Considerations

### 1. Database Migration

**Current Issue:** You're using SQLite, which won't work well in production (file-based, not suitable for cloud deployments).

**Solution:** Switch to PostgreSQL (or another cloud database):

1. **If using Railway/Render:**
   - They provide PostgreSQL databases automatically
   - Update your `DATABASE_URL` to use their provided connection string

2. **If using Vercel:**
   - Use a service like [Supabase](https://supabase.com) (free tier) or [Neon](https://neon.tech) (free tier) for PostgreSQL
   - Update `DATABASE_URL` to the cloud database connection string

3. **Update Prisma Schema:**
   ```prisma
   datasource db {
     provider = "postgresql"  // Change from "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

4. **Run migrations:**
   ```bash
   npx prisma migrate deploy
   ```

### 2. Environment Variables

You'll need to set these in your hosting platform:

**Backend:**
```env
DATABASE_URL=postgresql://user:password@host:port/database
PORT=4000
FRONTEND_URL=https://your-frontend-domain.com
BACKEND_URL=https://your-backend-domain.com
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
SESSION_SECRET=your-strong-random-secret
NODE_ENV=production
```

**Frontend:**
```env
VITE_API_URL=https://your-backend-domain.com/api
```

### 3. Google OAuth Configuration

Update your Google OAuth settings:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to your OAuth 2.0 credentials
3. Update **Authorized JavaScript origins:**
   - Add: `https://your-frontend-domain.com`
   - Add: `https://your-backend-domain.com`
4. Update **Authorized redirect URIs:**
   - Add: `https://your-backend-domain.com/api/auth/google/callback`

### 4. CORS Configuration

Make sure your backend CORS allows your frontend domain:

```typescript
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
```

### 5. Session Cookie Configuration

For production, ensure secure cookies:

```typescript
cookie: {
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  httpOnly: true,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  sameSite: 'lax',
}
```

## Recommended Deployment Strategy

### For Quick Start (Free):

1. **Frontend:** Deploy to Vercel (free, easy)
2. **Backend:** Deploy to Railway (free tier, includes PostgreSQL)
3. **Database:** Use Railway's PostgreSQL (included)

### Step-by-Step: Railway Deployment

1. **Prepare your code:**
   ```bash
   # Make sure everything is committed to GitHub
   git add .
   git commit -m "Prepare for deployment"
   git push
   ```

2. **Deploy Backend:**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" > "Deploy from GitHub repo"
   - Select your repository
   - Railway will detect it's a Node.js project
   - Add a PostgreSQL database (click "New" > "Database" > "Add PostgreSQL")
   - Set environment variables:
     - `DATABASE_URL` (Railway provides this automatically)
     - `PORT` (Railway sets this automatically, but you can use `PORT` env var)
     - `FRONTEND_URL` (your frontend URL)
     - `BACKEND_URL` (Railway will provide this after deployment)
     - `GOOGLE_CLIENT_ID`
     - `GOOGLE_CLIENT_SECRET`
     - `SESSION_SECRET` (generate a strong random string)
     - `NODE_ENV=production`

3. **Update Prisma for PostgreSQL:**
   ```bash
   # In backend directory
   # Update schema.prisma to use postgresql
   # Then run:
   npx prisma migrate deploy
   ```

4. **Deploy Frontend:**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Set root directory to `frontend`
   - Add environment variable:
     - `VITE_API_URL` (your Railway backend URL + `/api`)

5. **Update Google OAuth:**
   - Add your Vercel frontend URL to authorized origins
   - Add your Railway backend URL + `/api/auth/google/callback` to redirect URIs

6. **Test:**
   - Visit your Vercel frontend URL
   - Try logging in with Google
   - Test on your phone

## Mobile Access

Once deployed, you can:
- Access the app on your phone by visiting the URL
- Add it to your home screen (mobile browsers support "Add to Home Screen")
- Share the URL with other users

## Domain (Optional but Recommended)

If you want a custom domain (e.g., `awtyfootball.com`):

1. **Purchase a domain:**
   - [Namecheap](https://www.namecheap.com) (~$10-15/year)
   - [Google Domains](https://domains.google) (~$12/year)
   - [Cloudflare](https://www.cloudflare.com/products/registrar/) (at-cost pricing)

2. **Configure DNS:**
   - Vercel: Add your domain in project settings, follow DNS instructions
   - Railway: Add custom domain in service settings

3. **Update environment variables:**
   - Update `FRONTEND_URL` and `BACKEND_URL` to use your domain
   - Update Google OAuth settings with your domain

## Security Checklist

- [ ] Use HTTPS (automatic with most hosting services)
- [ ] Set strong `SESSION_SECRET`
- [ ] Use environment variables (never commit secrets)
- [ ] Enable CORS only for your frontend domain
- [ ] Use secure cookies in production
- [ ] Keep dependencies updated
- [ ] Use a strong database password

## Troubleshooting

### "Database connection failed"
- Check `DATABASE_URL` is correct
- Ensure database is accessible from your hosting service
- Check firewall/network settings

### "OAuth redirect mismatch"
- Verify redirect URI matches exactly in Google Console
- Check `BACKEND_URL` environment variable

### "CORS errors"
- Verify `FRONTEND_URL` matches your actual frontend domain
- Check backend CORS configuration

### "Session not persisting"
- Ensure cookies are enabled
- Check `sameSite` and `secure` cookie settings
- Verify domain settings match

## Cost Estimate

**Free Tier:**
- Vercel: Free (with limits)
- Railway: $5 credit/month (usually enough for small apps)
- Domain: ~$10-15/year (optional)

**Total: $0-15/year** (depending on domain)

## Next Steps

1. Choose a hosting platform (Railway + Vercel recommended)
2. Set up PostgreSQL database
3. Deploy backend
4. Deploy frontend
5. Update Google OAuth settings
6. Test on mobile device
7. Share with users!

