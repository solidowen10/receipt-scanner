# Deploying to tool.luruee.com/receipt-scanner

This app is ready for the same self-hosted pattern used by the existing lürú tools:

- one PM2 process per tool
- Nginx path proxy
- shared auth service mounted at `/auth`
- app mounted at `/receipt-scanner`

Do not run these steps until deployment is explicitly approved.

## 1. Environment

Create `.env` on the server:

```text
NODE_ENV=production
PORT=3004
PUBLIC_BASE_URL=https://tool.luruee.com/receipt-scanner
LURU_TOOLS_ORIGIN=https://tool.luruee.com
AUTH_SERVICE_INTERNAL_URL=http://127.0.0.1:3002/auth/api/session

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://tool.luruee.com/receipt-scanner/api/google/auth/callback
GOOGLE_OAUTH_STATE_SECRET=...

RECEIPT_DB_PATH=/opt/luru-tools/receipt-scanner/data/receipt-scanner.db
```

## 2. Google OAuth

In Google Cloud Console, add:

```text
https://tool.luruee.com/receipt-scanner/api/google/auth/callback
```

as an authorized redirect URI.

## 3. Build

```bash
npm install
npm run build
```

## 4. PM2

```bash
pm2 start ecosystem.config.js
pm2 save
```

## 5. Nginx

Add the location block from:

```text
deploy/nginx-receipt-scanner.conf
```

to the `luruee.com` server block, then test and reload Nginx.

## 6. Verify

```bash
curl http://127.0.0.1:3004/receipt-scanner
curl https://tool.luruee.com/receipt-scanner
```

Then test:

- LINE login redirects back to `/receipt-scanner`
- Google OAuth returns to `/receipt-scanner/api/google/auth/callback`
- Drive folder selection works
- Google Sheet tab `YYYY-MM` is created on first saved receipt
