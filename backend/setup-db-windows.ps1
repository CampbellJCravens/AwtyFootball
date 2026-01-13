# Windows PowerShell script to create the database
# Run this after PostgreSQL is installed and running

# You'll be prompted for the postgres user password
$env:PGPASSWORD = Read-Host "Enter PostgreSQL postgres user password"

# Create database (this will prompt if password is wrong)
& "C:\Program Files\PostgreSQL\*\bin\psql.exe" -U postgres -c "CREATE DATABASE awty_football;" 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Database 'awty_football' created successfully!" -ForegroundColor Green
} else {
    # Try to find psql in common locations
    $psqlPaths = @(
        "C:\Program Files\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files\PostgreSQL\15\bin\psql.exe",
        "C:\Program Files\PostgreSQL\14\bin\psql.exe",
        "C:\Program Files\PostgreSQL\13\bin\psql.exe"
    )
    
    $found = $false
    foreach ($path in $psqlPaths) {
        if (Test-Path $path) {
            Write-Host "Found PostgreSQL at: $path" -ForegroundColor Yellow
            $found = $true
            & $path -U postgres -c "CREATE DATABASE awty_football;"
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Database 'awty_football' created successfully!" -ForegroundColor Green
                break
            }
        }
    }
    
    if (-not $found) {
        Write-Host "Could not find PostgreSQL. Please run this manually:" -ForegroundColor Red
        Write-Host "psql -U postgres -c 'CREATE DATABASE awty_football;'" -ForegroundColor Yellow
    }
}

$env:PGPASSWORD = ""

