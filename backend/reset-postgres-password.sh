#!/bin/bash

# Script to reset PostgreSQL postgres user password
# This will temporarily enable trust authentication, set a password, then restore security

set -e

PG_DATA="/opt/homebrew/var/postgresql@16"
PG_HBA="$PG_DATA/pg_hba.conf"
PG_HBA_BACKUP="$PG_DATA/pg_hba.conf.backup.$(date +%s)"

echo "🔐 PostgreSQL Password Reset Script"
echo "===================================="
echo ""
echo "This script will:"
echo "1. Backup your current pg_hba.conf"
echo "2. Temporarily enable trust authentication"
echo "3. Set a password for the 'postgres' user"
echo "4. Restore the original authentication settings"
echo ""

# Backup current config
if [ -f "$PG_HBA" ]; then
    cp "$PG_HBA" "$PG_HBA_BACKUP"
    echo "✅ Backed up pg_hba.conf to $PG_HBA_BACKUP"
else
    echo "❌ Could not find pg_hba.conf at $PG_HBA"
    exit 1
fi

# Read password
read -sp "Enter new password for 'postgres' user: " NEW_PASSWORD
echo ""
read -sp "Confirm password: " CONFIRM_PASSWORD
echo ""

if [ "$NEW_PASSWORD" != "$CONFIRM_PASSWORD" ]; then
    echo "❌ Passwords don't match!"
    exit 1
fi

echo ""
echo "🔄 Temporarily enabling trust authentication..."

# Create temporary pg_hba.conf with trust for local connections
cat > "$PG_HBA" <<EOF
# Temporary trust configuration for password reset
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
EOF

# Reload PostgreSQL
echo "🔄 Reloading PostgreSQL configuration..."
brew services restart postgresql@16
sleep 3

# Set the password
echo "🔑 Setting password for 'postgres' user..."
/opt/homebrew/opt/postgresql@16/bin/psql -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD '$NEW_PASSWORD';" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Password set successfully!"
else
    echo "❌ Failed to set password. Restoring backup..."
    cp "$PG_HBA_BACKUP" "$PG_HBA"
    brew services restart postgresql@16
    exit 1
fi

# Restore original config
echo "🔄 Restoring original authentication settings..."
cp "$PG_HBA_BACKUP" "$PG_HBA"
brew services restart postgresql@16
sleep 2

echo ""
echo "✅ Done! You can now connect with:"
echo "   psql -U postgres -d postgres"
echo "   (use password: $NEW_PASSWORD)"
echo ""

