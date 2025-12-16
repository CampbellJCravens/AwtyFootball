# PostgreSQL Database Setup Guide

## Quick Setup

### Step 1: Connect to PostgreSQL

Try one of these methods to connect:

**Option A: Connect as your macOS user (may not require password)**
```bash
/opt/homebrew/opt/postgresql@16/bin/psql -d postgres
```

**Option B: Connect as postgres superuser**
```bash
/opt/homebrew/opt/postgresql@16/bin/psql -U postgres -d postgres
```

**Option C: If you get a password prompt and don't know the password:**
- Try your macOS user password
- Or press Enter if no password is set
- Or reset the postgres user password (see troubleshooting below)

### Step 2: Create Database and User

Once connected to PostgreSQL, run these SQL commands:

```sql
-- Create the database
CREATE DATABASE awty_football;

-- Create a user for the application
CREATE USER awty_user WITH PASSWORD 'awty_password_123';

-- Grant all privileges on the database
GRANT ALL PRIVILEGES ON DATABASE awty_football TO awty_user;

-- Connect to the new database
\c awty_football

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO awty_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO awty_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO awty_user;

-- Exit psql
\q
```

### Step 3: Update .env File

Update `backend/.env` with:

```env
DATABASE_URL="postgresql://awty_user:awty_password_123@localhost:5432/awty_football?schema=public"
PORT=4000
```

**⚠️ Security Note:** Change `awty_password_123` to a strong password in production!

### Step 4: Run Migrations

```bash
cd backend
npm run prisma:migrate
```

## Troubleshooting

### "Password authentication failed"

If you can't connect, try resetting the postgres user password:

1. Stop PostgreSQL:
   ```bash
   brew services stop postgresql@16
   ```

2. Start PostgreSQL in single-user mode:
   ```bash
   /opt/homebrew/opt/postgresql@16/bin/postgres --single -D /opt/homebrew/var/postgresql@16 postgres
   ```

3. In the PostgreSQL prompt, run:
   ```sql
   ALTER USER postgres WITH PASSWORD 'newpassword';
   ```

4. Press Ctrl+D to exit, then restart PostgreSQL:
   ```bash
   brew services start postgresql@16
   ```

### "Database already exists"

If the database already exists, you can either:
- Use the existing database (skip CREATE DATABASE)
- Drop and recreate: `DROP DATABASE awty_football;` (⚠️ deletes all data)

### "User already exists"

If the user already exists, you can:
- Use the existing user
- Or change the password: `ALTER USER awty_user WITH PASSWORD 'newpassword';`

## Alternative: Use Your macOS User

If you prefer to use your macOS user account (no separate database user):

1. Connect: `/opt/homebrew/opt/postgresql@16/bin/psql -d postgres`
2. Create database: `CREATE DATABASE awty_football;`
3. Update `.env`:
   ```env
   DATABASE_URL="postgresql://campbellcravens@localhost:5432/awty_football?schema=public"
   ```

