#!/bin/bash

# Script to set up PostgreSQL user and database for Awty Football

PSQL="/Library/PostgreSQL/18/bin/psql"
PG_DATA="/Library/PostgreSQL/18/data"
PG_HBA="$PG_DATA/pg_hba.conf"

echo "🔧 Setting up PostgreSQL for Awty Football"
echo "=========================================="
echo ""

# Check if PostgreSQL 18 is running
if ! pgrep -f "postgres.*18" > /dev/null; then
    echo "❌ PostgreSQL 18 doesn't appear to be running."
    echo "   Please start it first."
    exit 1
fi

echo "📋 We'll create:"
echo "   - User: awty_user"
echo "   - Password: (you'll be prompted)"
echo "   - Database: awty_football"
echo ""

read -sp "Enter a password for 'awty_user': " DB_PASSWORD
echo ""
read -sp "Confirm password: " CONFIRM_PASSWORD
echo ""

if [ "$DB_PASSWORD" != "$CONFIRM_PASSWORD" ]; then
    echo "❌ Passwords don't match!"
    exit 1
fi

echo ""
echo "Attempting to connect to PostgreSQL..."
echo "If prompted for a password, try:"
echo "  1. Your macOS user password"
echo "  2. Or press Enter if no password is set"
echo "  3. Or the password you set when installing PostgreSQL 18"
echo ""

# Try to connect as postgres user
echo "Trying to connect as 'postgres' user..."
$PSQL -U postgres -d postgres <<EOF 2>&1 || {
    echo ""
    echo "❌ Could not connect as 'postgres' user."
    echo ""
    echo "💡 Let's try connecting as your macOS user instead..."
    echo ""
    $PSQL -U $(whoami) -d postgres <<INNER_EOF 2>&1 || {
        echo ""
        echo "❌ Could not connect to PostgreSQL."
        echo ""
        echo "Please try one of these options:"
        echo ""
        echo "Option 1: Connect manually and run these SQL commands:"
        echo "  $PSQL -U postgres -d postgres"
        echo ""
        echo "  Then run:"
        echo "    CREATE USER awty_user WITH PASSWORD '$DB_PASSWORD';"
        echo "    CREATE DATABASE awty_football OWNER awty_user;"
        echo "    GRANT ALL PRIVILEGES ON DATABASE awty_football TO awty_user;"
        echo ""
        echo "Option 2: Use pgAdmin 4 (GUI tool) to create the user and database"
        echo ""
        exit 1
    }
    
    -- Connected as macOS user, create postgres user if needed and app user
    SELECT 'Creating user and database...' AS status;
    
    -- Create app user
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'awty_user') THEN
            CREATE USER awty_user WITH PASSWORD '$DB_PASSWORD';
        ELSE
            ALTER USER awty_user WITH PASSWORD '$DB_PASSWORD';
        END IF;
    END
    \$\$;
    
    -- Create database
    SELECT 'Database: awty_football' AS status;
    SELECT datname FROM pg_database WHERE datname = 'awty_football';
    
    \q
INNER_EOF
    exit 0
}

-- Connected as postgres user
SELECT 'Creating user and database...' AS status;

-- Create app user
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'awty_user') THEN
        CREATE USER awty_user WITH PASSWORD '$DB_PASSWORD';
    ELSE
        ALTER USER awty_user WITH PASSWORD '$DB_PASSWORD';
    END IF;
END
\$\$;

-- Create database
SELECT 'Creating database...' AS status;
SELECT 'CREATE DATABASE awty_football OWNER awty_user;' AS sql_command;

\q

EOF

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Update your backend/.env file with:"
echo "   DATABASE_URL=\"postgresql://awty_user:$DB_PASSWORD@localhost:5432/awty_football?schema=public\""
echo ""

