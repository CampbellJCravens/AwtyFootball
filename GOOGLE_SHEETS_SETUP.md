# Google Sheets Setup Guide

This guide will walk you through setting up Google Sheets integration for exporting and importing game data.

**Note**: This setup uses your existing "Awty Football" Google Cloud project (the same one used for OAuth authentication).

## Prerequisites

- Access to your existing "Awty Football" Google Cloud project
- A Google Sheets spreadsheet where you want to export data

## Step 1: Enable Google Sheets API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Make sure you have your "Awty Football" project selected (the same one you use for OAuth)
3. Navigate to "APIs & Services" > "Library"
4. Search for "Google Sheets API"
5. Click on "Google Sheets API"
6. Click "Enable"

## Step 2: Create a Service Account

**Important**: This is different from your OAuth credentials. Your OAuth Client ID/Secret is for user authentication, while this Service Account is for programmatic access to Google Sheets.

1. In Google Cloud Console (still in your "Awty Football" project), go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Enter a service account name (e.g., "awty-football-sheets")
4. Click "Create and Continue"
5. For "Grant this service account access to project", select "Editor" role (or create a custom role with Sheets API access)
6. Click "Continue" and then "Done"

## Step 3: Create and Download Service Account Key

1. In the "Credentials" page, find your newly created service account
2. Click on the service account email
3. Go to the "Keys" tab
4. Click "Add Key" > "Create new key"
5. Select "JSON" format
6. Click "Create" - this will download a JSON file

**IMPORTANT**: Keep this JSON file secure and never commit it to version control!

## Step 4: Extract Credentials from JSON

Open the downloaded JSON file. You'll need the following values:

- `client_email`: This is your service account email
- `private_key`: This is the private key (keep it secure)

Example structure:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "your-service-account@your-project.iam.gserviceaccount.com",
  ...
}
```

## Step 5: Create Google Sheets Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name it something like "Awty Football Game Stats"
4. Create two tabs:
   - Rename "Sheet1" to "Players"
   - Create a new sheet and name it "GameSummary"
5. Copy the Spreadsheet ID from the URL

The URL will look like:
```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
```

Copy the `SPREADSHEET_ID_HERE` part.

## Step 6: Share Spreadsheet with Service Account

1. Open your Google Sheets spreadsheet
2. Click the "Share" button (top right)
3. In the "Add people and groups" field, paste the service account email (from Step 5)
4. Make sure the permission is set to "Editor"
5. Uncheck "Notify people" (service accounts don't have email)
6. Click "Share"

## Step 7: Configure Backend Environment Variables

**Note**: These are separate from your OAuth credentials (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`). Both sets of credentials will be in your `.env` file.

Add the following environment variables to your backend `.env` file (alongside your existing OAuth credentials):

```env
# Existing OAuth credentials (already configured)
GOOGLE_CLIENT_ID=your-oauth-client-id
GOOGLE_CLIENT_SECRET=your-oauth-client-secret

# New Google Sheets credentials
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id-here
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**Important Notes:**
- The `GOOGLE_PRIVATE_KEY` must be in quotes and keep the `\n` characters (don't replace them with actual newlines)
- The private key should be on a single line with `\n` for newlines
- Make sure there are no extra spaces or quotes inside the private key

Example:
```env
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

## Step 8: Install Dependencies

Make sure you have installed the required npm packages:

```bash
cd backend
npm install googleapis papaparse @types/papaparse
```

```bash
cd frontend
npm install papaparse
```

## Step 9: Test the Integration

1. Start your backend server
2. Open your frontend application
3. Navigate to a game
4. Click "Report Stats" - this should export data to your Google Sheets
5. Check your Google Sheets to verify the data was exported correctly

## Troubleshooting

### Error: "Google Sheets credentials not configured"
- Make sure all three environment variables are set in your `.env` file
- Restart your backend server after adding environment variables

### Error: "The caller does not have permission"
- Make sure you shared the spreadsheet with the service account email (Step 7)
- Make sure the service account has "Editor" access

### Error: "Requested entity was not found"
- Check that the `GOOGLE_SHEETS_SPREADSHEET_ID` is correct
- Make sure the spreadsheet exists and is accessible

### Private Key Format Issues
- The private key must include the `\n` characters (don't replace with actual newlines)
- Make sure the private key is wrapped in quotes in your `.env` file
- The private key should start with `-----BEGIN PRIVATE KEY-----` and end with `-----END PRIVATE KEY-----`

### Data Not Appearing in Sheets
- Check that the "Players" and "GameSummary" tabs exist in your spreadsheet
- Verify the service account has Editor access
- Check backend logs for any error messages

## CSV Import Format

When importing CSV files, make sure they follow these formats:

### Players CSV Format:
```csv
Player,Game,Team,Goals,Assists
John Doe,Game - January 15, 2024,Color,2,1
Jane Smith,Game - January 15, 2024,White,1,0
```

### GameSummary CSV Format:
```csv
EntryType,Game,PlayerName,Assister,Team,Timestamp
goal,Game - January 15, 2024,John Doe,Jane Smith,Color,2024-01-15T10:30:00.000Z
team swap,Game - January 15, 2024,John Doe,,White,2024-01-15T11:00:00.000Z
```

## Security Best Practices

1. **Never commit the service account JSON file or private key to version control**
2. Use environment variables for all sensitive credentials
3. Regularly rotate service account keys
4. Use the principle of least privilege - only grant the minimum necessary permissions
5. Monitor API usage in Google Cloud Console

## Production Setup

For production deployment (Railway, Render, etc.):

1. Add the environment variables in your hosting platform's environment variable settings
2. Make sure the private key is properly escaped (the `\n` characters should be preserved)
3. Test the export functionality after deployment

