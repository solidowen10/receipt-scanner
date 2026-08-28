# luruee · Receipt Scanner

Receipt photo capture for the lürúee tools suite.

**Stack:** Next.js 16 App Router · TypeScript · SQLite · Google OAuth · Drive API · Sheets API

## What it does

- Uses the shared lürúee tools LINE login session from `/auth/api/session`
- Connects each user's Google account from inside the app
- Accepts Drive folder and Sheet configuration by pasted link or in-app selection
- Captures/uploads a receipt photo from mobile camera or file picker
- Uses Google Drive document conversion as the OCR-first path
- Lets the user review and correct extracted fields before saving
- Builds filenames from ordered tokens and fixed text, such as:

```text
日期_發票號碼_支付方簡稱_支付總計額
```

- Saves the original receipt file to the user's selected Drive folder
- Creates or reuses one Google Sheet tab per month, such as `2026-08`
- Maintains monthly total, receipt count, and category totals at the top of each month tab

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev -- -p 3006
```

Open:

```text
http://localhost:3006/receipt-scanner
```

For local UI checks without the shared auth service, keep this in `.env`:

```text
ALLOW_DEV_AUTH=1
```

Do not enable that value in production.

## Google OAuth

Enable these APIs in Google Cloud:

- Google Drive API
- Google Sheets API

Create an OAuth client and add this local callback:

```text
http://localhost:3006/receipt-scanner/api/google/auth/callback
```

Production callback for the updated tools host:

```text
https://tool.luruee.com/receipt-scanner/api/google/auth/callback
```

Scopes used:

```text
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/userinfo.email
```

The app uses full Drive scope so a user can paste or browse to an existing Drive folder and let the app write receipt files there.

## Data

The app stores Google refresh tokens and user settings in SQLite.

Default local path:

```text
./data/receipt-scanner.db
```

Set `RECEIPT_DB_PATH` in production if the database should live elsewhere.

## App Location

This app is intentionally a sibling app under:

```text
/Users/owenree/Documents/lürú tools/github-src/receipt-scanner
```

The existing deployment pattern is a path-based self-hosted deployment behind Nginx. This app is configured for the future tools-host path:

```text
https://tool.luruee.com/receipt-scanner
```
