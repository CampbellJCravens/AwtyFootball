#!/bin/bash

# PostgreSQL Setup Script for Awty Football
# This script helps you create a database and user for the application

set -e

PSQL="/opt/homebrew/opt/postgresql@16/bin/psql"
PG_CTL="/opt/homebrew/opt/postgresql@16/bin/pg_ctl"

echo "🔧 Awty Football PostgreSQL Setup"
echo "=================================="
echo ""

# Check if PostgreSQL is accessible
if ! command -v $PSQL &> /dev/null; then
    echo "❌ PostgreSQL not found. Please install PostgreSQL first."
    exit 1
fi

echo "📋 We'll create:"
echo "   - Database: awty_football"
echo "   - User: awty_user"
echo "   - Password: (you'll be prompted)"
echo ""

# Try to connect as current user first
echo "Attempting to connect to PostgreSQL..."
echo "If prompted for a password, you may need to:"
echo "  1. Use your macOS user password, OR"
echo "  2. Press Enter if no password is set, OR"
echo "  3. Connect as 'postgres' user: psql -U postgres"
echo ""

read -p "Enter PostgreSQL username to connect with (default: $(whoami)): " PG_USER
PG_USER=${PG_USER:-$(whoami)}

read -p "Enter PostgreSQL password (press Enter if none): " -s PG_PASSWORD
echo ""

# Try to connect and create database/user
$PSQL -U "$PG_USER" -d postgres <<EOF 2>&1 || {
    echo ""
    echo "❌ Could not connect to PostgreSQL."
    echo ""
    echo "💡 Alternative options:"
    echo "   1. Try connecting as 'postgres' user:"
    echo "      $PSQL -U postgres -d postgres"
    echo ""
    echo "   2. Or create the database manually:"
    echo "      $PSQL -U postgres -d postgres"
    echo "      Then run:"
    echo "        CREATE DATABASE awty_football;"
    echo "        CREATE USER awty_user WITH PASSWORD 'your_password';"
    echo "        GRANT ALL PRIVILEGES ON DATABASE awty_football TO awty_user;"
    echo ""
    exit 1
}

-- Create database (ignore error if it exists)
SELECT 'Creating database...' AS status;
CREATE DATABASE awty_football;

-- Connect to the new database
\c awty_football

-- Create user (ignore error if it exists)
SELECT 'Creating user...' AS status;
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'awty_user') THEN
        CREATE USER awty_user WITH PASSWORD 'awty_password_123';
    END IF;
END
\$\$;

-- Grant privileges
SELECT 'Granting privileges...' AS status;
GRANT ALL PRIVILEGES ON DATABASE awty_football TO awty_user;
GRANT ALL ON SCHEMA public TO awty_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO awty_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO awty_user;

SELECT '✅ Database and user created successfully!' AS status;
SELECT 'Database: awty_football' AS info;
SELECT 'User: awty_user' AS info;
SELECT 'Password: awty_password_123' AS info;

EOF

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Update your backend/.env file with:"
echo "   DATABASE_URL=\"postgresql://awty_user:awty_password_123@localhost:5432/awty_football?schema=public\""
echo ""

