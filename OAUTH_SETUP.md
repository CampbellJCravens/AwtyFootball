# Google OAuth Setup Guide

This guide will help you set up Google OAuth authentication for the Awty Football app.

## Prerequisites

1. A Google account
2. Access to Google Cloud Console

## Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google+ API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - If prompted, configure the OAuth consent screen:
     - Choose "External" (unless you have a Google Workspace)
     - Fill in the required fields (App name, User support email, Developer contact)
     - Add scopes: `email` and `profile`
     - Add test users (your email and any other emails you want to allow)
   - Application type: "Web application"
   - Name: "Awty Football"
   - Authorized JavaScript origins:
     - `http://localhost:4000` (for development)
     - Your production URL (e.g., `https://yourdomain.com`)
   - Authorized redirect URIs:
     - `http://localhost:4000/api/auth/google/callback` (for development)
     - `https://yourdomain.com/api/auth/google/callback` (for production)
   - Click "Create"
5. Copy the **Client ID** and **Client Secret**

## Step 2: Configure Backend Environment Variables

Add the following to your `backend/.env` file:

```env
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
SESSION_SECRET=generate-a-random-secret-key-here
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:4000
```

**Important:**
- Replace `your-client-id-here` with your actual Google Client ID
- Replace `your-client-secret-here` with your actual Google Client Secret
- Generate a strong random string for `SESSION_SECRET` (you can use `openssl rand -base64 32` or an online generator)
- Update `FRONTEND_URL` and `BACKEND_URL` for production

## Step 3: Add First Admin User to Allowlist

After setting up OAuth, you need to add at least one email to the allowlist. You can do this in two ways:

### Option A: Using Prisma Studio (Recommended for first admin)

1. Run `npm run prisma:studio` in the `backend` directory
2. Navigate to the `AllowedEmail` model
3. Click "Add record"
4. Add your email address
5. Set `role` to `"admin"`
6. Save

### Option B: Using SQL directly

```sql
INSERT INTO AllowedEmail (id, email, role, createdAt) 
VALUES ('admin-1', 'your-email@example.com', 'admin', datetime('now'));
```

## Step 4: Test the Setup

1. Start the backend server:
   ```bash
   cd backend
   npm run dev
   ```

2. Start the frontend server:
   ```bash
   cd frontend
   npm run dev
   ```

3. Navigate to `http://localhost:5173`
4. You should see a login page with "Sign in with Google" button
5. Click the button and sign in with an email that's in the allowlist
6. You should be redirected back to the app and logged in

## Step 5: Managing Users (Admin Only)

Once logged in as an admin, you can manage the allowlist through the API:

### Add a new user to allowlist:
```bash
POST /api/auth/allowed-emails
Content-Type: application/json

{
  "email": "user@example.com",
  "role": "regular"  // or "admin"
}
```

### Get all allowed emails:
```bash
GET /api/auth/allowed-emails
```

### Remove a user from allowlist:
```bash
DELETE /api/auth/allowed-emails/:id
```

## Role-Based Access Control

### Admin Users
- Can create, edit, and delete players
- Can create, edit, and delete games
- Can modify team assignments
- Can add guest players
- Can edit and delete goals
- Can manage the allowlist

### Regular Users
- Can view all players and games
- Can create new players
- Can edit player images
- Can record goals (but not edit/delete them)
- Cannot modify games or team assignments
- Cannot delete players or games

## Troubleshooting

### "Email not in allowlist" error
- Make sure the email is added to the `AllowedEmail` table in the database
- Check that the email matches exactly (case-insensitive)

### "Authentication required" errors
- Make sure cookies are enabled in your browser
- Check that `credentials: 'include'` is set in API calls
- Verify CORS settings allow credentials

### Redirect URI mismatch
- Make sure the redirect URI in Google Cloud Console matches exactly: `http://localhost:4000/api/auth/google/callback`
- For production, update both the Google Console and your `.env` file

### Session not persisting
- Check that `SESSION_SECRET` is set and is a strong random string
- Verify cookies are being set in your browser's developer tools
- Make sure `httpOnly` and `sameSite` cookie settings are appropriate for your environment

## Production Deployment

When deploying to production:

1. Update Google Cloud Console with production URLs
2. Set environment variables on your hosting platform
3. Use HTTPS (required for secure cookies)
4. Set `NODE_ENV=production` in your backend `.env`
5. Update `FRONTEND_URL` and `BACKEND_URL` to your production domains
6. Ensure `SESSION_SECRET` is a strong, randomly generated value

