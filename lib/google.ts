import { google, type drive_v3, type sheets_v4 } from "googleapis";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { APP_BASE_PATH, CATEGORY_OPTIONS } from "@/lib/constants";
import { getStoredUser, saveGoogleTokens, updateSettings, type StoredUser } from "@/lib/db";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
];

const SHEET_HEADERS = [
  "記錄時間",
  "消費日期",
  "店家",
  "發票號碼",
  "支付方簡稱",
  "支付總計額",
  "類別",
  "支付方式",
  "品項",
  "備註",
  "Drive 檔案",
  "檔名",
];

export type ReceiptSheetRecord = {
  recordedAt: string;
  date: string | null;
  merchant: string | null;
  invoiceNumber: string | null;
  payerShortName: string | null;
  total: number | null;
  category: string | null;
  paymentMethod: string | null;
  itemsText: string | null;
  notes: string | null;
  driveFileUrl: string | null;
  filename: string;
};

export type DriveFolder = {
  id: string;
  name: string;
};

export type SheetFile = {
  id: string;
  name: string;
};

export function googleConfigStatus() {
  return {
    hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    redirectUri: googleRedirectUri(),
  };
}

export function createGoogleAuthUrl(userId: string) {
  const oauth = createOAuthClient();
  return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state: createOAuthState(userId),
  });
}

export async function exchangeGoogleCode(userId: string, code: string) {
  const oauth = createOAuthClient();
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oauth });
  const profile = await oauth2.userinfo.get().catch(() => null);
  saveGoogleTokens(userId, tokens, profile?.data.email || null);
}

export function consumeOAuthState(state: string | null) {
  if (!state) return null;
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;
  const expected = signState(encoded);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { userId?: string; expiresAt?: number };
    if (!payload.userId || !payload.expiresAt || payload.expiresAt < Date.now()) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

export async function listDriveFolders(userId: string, parentId = "root"): Promise<DriveFolder[]> {
  const auth = await getGoogleClientForUser(userId);
  const drive = google.drive({ version: "v3", auth });
  const response = await drive.files.list({
    q: `'${escapeDriveQuery(parentId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name)",
    orderBy: "name",
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (response.data.files || [])
    .filter((file): file is drive_v3.Schema$File & { id: string; name: string } => Boolean(file.id && file.name))
    .map((file) => ({ id: file.id, name: file.name }));
}

export async function listSheets(userId: string): Promise<SheetFile[]> {
  const auth = await getGoogleClientForUser(userId);
  const drive = google.drive({ version: "v3", auth });
  const response = await drive.files.list({
    q: "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
    fields: "files(id,name)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (response.data.files || [])
    .filter((file): file is drive_v3.Schema$File & { id: string; name: string } => Boolean(file.id && file.name))
    .map((file) => ({ id: file.id, name: file.name }));
}

export async function createSpreadsheet(userId: string, title = "lürúee receipt scanner") {
  const auth = await getGoogleClientForUser(userId);
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: currentMonthTitle() } }],
    },
  });

  const spreadsheetId = response.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("Could not create Google Sheet");

  const sheetName = response.data.properties?.title || title;
  await updateSettings(userId, { sheetId: spreadsheetId, sheetName });
  return { id: spreadsheetId, name: sheetName };
}

export async function resolveAndSaveFolder(userId: string, input: string) {
  const folderId = extractDriveFolderId(input);
  if (!folderId) throw new Error("Invalid Drive folder link or ID");

  const auth = await getGoogleClientForUser(userId);
  const drive = google.drive({ version: "v3", auth });
  const metadata = await drive.files.get({
    fileId: folderId,
    fields: "id,name,mimeType",
    supportsAllDrives: true,
  });

  if (metadata.data.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("The Drive link is not a folder");
  }

  updateSettings(userId, { driveFolderId: folderId, driveFolderName: metadata.data.name || folderId });
  return { id: folderId, name: metadata.data.name || folderId };
}

export async function resolveAndSaveSheet(userId: string, input: string) {
  const sheetId = extractSheetId(input);
  if (!sheetId) throw new Error("Invalid Google Sheet link or ID");

  const auth = await getGoogleClientForUser(userId);
  const sheets = google.sheets({ version: "v4", auth });
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: "spreadsheetId,properties.title",
  });

  updateSettings(userId, { sheetId, sheetName: metadata.data.properties?.title || sheetId });
  return { id: sheetId, name: metadata.data.properties?.title || sheetId };
}

export async function runDriveOcr(userId: string, buffer: Buffer, mimeType: string) {
  const auth = await getGoogleClientForUser(userId);
  const drive = google.drive({ version: "v3", auth });
  const user = getStoredUser(userId);

  let doc;
  try {
    doc = await drive.files.create({
      requestBody: {
        name: `luru-ocr-temp-${Date.now()}`,
        mimeType: "application/vnd.google-apps.document",
        parents: user.driveFolderId ? [user.driveFolderId] : undefined,
      },
      media: { mimeType, body: bufferToStream(buffer) },
      fields: "id",
      supportsAllDrives: true,
    } as drive_v3.Params$Resource$Files$Create);
  } catch (error: any) {
    console.error("Google Drive OCR create failed", {
      message: error?.message,
      code: error?.code,
      status: error?.response?.status,
      data: error?.response?.data,
      errors: error?.errors,
      mimeType,
      hasFolder: Boolean(user.driveFolderId),
    });
    throw error;
  }

  const docId = doc.data.id;
  if (!docId) throw new Error("Google Drive OCR did not return a document");

  try {
    const text = await drive.files
      .export({ fileId: docId, mimeType: "text/plain" }, { responseType: "text" })
      .then((response) => String(response.data || ""));
    return text;
  } finally {
    await drive.files.delete({ fileId: docId, supportsAllDrives: true }).catch(() => {});
  }
}

export async function uploadOriginalReceipt(userId: string, buffer: Buffer, mimeType: string, filename: string, purchaseDate?: string | null) {
  const user = getStoredUser(userId);
  if (!user.driveFolderId) throw new Error("Drive folder is not configured");

  const auth = await getGoogleClientForUser(userId);
  const drive = google.drive({ version: "v3", auth });
  const monthFolderId = await ensureDriveMonthFolder(drive, user.driveFolderId, monthTitleForDate(purchaseDate));
  const response = await drive.files.create({
    requestBody: {
      name: filename,
      mimeType,
      parents: [monthFolderId],
    },
    media: { mimeType, body: bufferToStream(buffer) },
    fields: "id,name,webViewLink",
    supportsAllDrives: true,
  });

  return {
    id: response.data.id || "",
    name: response.data.name || filename,
    url: response.data.webViewLink || null,
  };
}

export async function appendReceiptToMonthlySheet(userId: string, record: ReceiptSheetRecord) {
  const user = getStoredUser(userId);
  if (!user.sheetId) throw new Error("Google Sheet is not configured");

  const auth = await getGoogleClientForUser(userId);
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = user.sheetId;
  const tabName = monthTitleForRecord(record);

  await ensureMonthlySheet(sheets, spreadsheetId, tabName);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${escapeSheetName(tabName)}'!A12`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          record.recordedAt,
          record.date || "",
          record.merchant || "",
          record.invoiceNumber || "",
          record.payerShortName || "",
          record.total ?? "",
          record.category || "",
          record.paymentMethod || "",
          record.itemsText || "",
          record.notes || "",
          record.driveFileUrl || "",
          record.filename,
        ],
      ],
    },
  });

  return {
    sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    tabName,
  };
}

export function userGoogleReady(user: StoredUser) {
  return Boolean(user.accessToken && (user.refreshToken || !tokenExpired(user)) && user.driveFolderId && user.sheetId);
}

async function ensureMonthlySheet(sheets: sheets_v4.Sheets, spreadsheetId: string, tabName: string) {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  let sheetId = (metadata.data.sheets || []).find((sheet) => sheet.properties?.title === tabName)?.properties?.sheetId;

  if (sheetId == null) {
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    });
    sheetId = response.data.replies?.[0]?.addSheet?.properties?.sheetId;
  }

  if (sheetId == null) throw new Error(`Could not resolve sheet tab ${tabName}`);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${escapeSheetName(tabName)}'!A1:L11`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: monthlyTemplateRows(tabName),
    },
  });

  await applyMonthlyMoneyFormat(sheets, spreadsheetId, sheetId);
}

async function ensureDriveMonthFolder(drive: drive_v3.Drive, parentId: string, folderName: string) {
  const existing = await drive.files.list({
    q: `'${escapeDriveQuery(parentId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${escapeDriveQuery(folderName)}' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const folderId = existing.data.files?.find((file) => file.id)?.id;
  if (folderId) return folderId;

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id,name",
    supportsAllDrives: true,
  });

  if (!created.data.id) throw new Error(`Could not create Drive folder ${folderName}`);
  return created.data.id;
}

async function applyMonthlyMoneyFormat(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetId: number) {
  const moneyFormat = {
    numberFormat: {
      type: "CURRENCY",
      pattern: "$#,##0",
    },
  };

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 2 },
            cell: { userEnteredFormat: moneyFormat },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 10, startColumnIndex: 4, endColumnIndex: 5 },
            cell: { userEnteredFormat: moneyFormat },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 11, startColumnIndex: 5, endColumnIndex: 6 },
            cell: { userEnteredFormat: moneyFormat },
            fields: "userEnteredFormat.numberFormat",
          },
        },
      ],
    },
  });
}

function monthlyTemplateRows(tabName: string) {
  const rows: string[][] = [
    ["月份", tabName, "", "類別", "小計"],
    ["月總計", "=SUM(F12:F)", "", CATEGORY_OPTIONS[0], "=SUMIF(G12:G,D2,F12:F)"],
    ["收據筆數", "=COUNTA(A12:A)", "", CATEGORY_OPTIONS[1], "=SUMIF(G12:G,D3,F12:F)"],
    ["", "", "", CATEGORY_OPTIONS[2], "=SUMIF(G12:G,D4,F12:F)"],
    ["", "", "", CATEGORY_OPTIONS[3], "=SUMIF(G12:G,D5,F12:F)"],
    ["", "", "", CATEGORY_OPTIONS[4], "=SUMIF(G12:G,D6,F12:F)"],
    ["", "", "", CATEGORY_OPTIONS[5], "=SUMIF(G12:G,D7,F12:F)"],
    ["", "", "", CATEGORY_OPTIONS[6], "=SUMIF(G12:G,D8,F12:F)"],
    ["", "", "", CATEGORY_OPTIONS[7], "=SUMIF(G12:G,D9,F12:F)"],
    ["", "", "", CATEGORY_OPTIONS[8], "=SUMIF(G12:G,D10,F12:F)"],
    SHEET_HEADERS,
  ];
  return rows;
}

async function getGoogleClientForUser(userId: string) {
  const stored = getStoredUser(userId);
  if (!stored.accessToken && !stored.refreshToken) throw new Error("Google account is not connected");

  const oauth = createOAuthClient();
  oauth.setCredentials({
    access_token: stored.accessToken || undefined,
    refresh_token: stored.refreshToken || undefined,
    expiry_date: stored.tokenExpiry || undefined,
  });

  if (stored.refreshToken && tokenExpired(stored)) {
    const { credentials } = await oauth.refreshAccessToken();
    saveGoogleTokens(userId, credentials);
    oauth.setCredentials(credentials);
  }

  return oauth;
}

function createOAuthClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth is not configured");
  }

  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, googleRedirectUri());
}

function googleRedirectUri() {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const publicBase = (process.env.PUBLIC_BASE_URL || `https://tool.luruee.com${APP_BASE_PATH}`).replace(/\/+$/, "");
  return `${publicBase}/api/google/auth/callback`;
}

function createOAuthState(userId: string) {
  const encoded = Buffer.from(
    JSON.stringify({
      userId,
      expiresAt: Date.now() + 10 * 60 * 1000,
      nonce: crypto.randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  return `${encoded}.${signState(encoded)}`;
}

function signState(encoded: string) {
  return crypto.createHmac("sha256", oauthStateSecret()).update(encoded).digest("base64url");
}

function timingSafeEqual(actual: string, expected: string) {
  try {
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function oauthStateSecret() {
  return (
    process.env.GOOGLE_OAUTH_STATE_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.AUTH_STATE_SECRET ||
    "receipt-scanner-local-state"
  );
}

function tokenExpired(user: StoredUser) {
  return !user.tokenExpiry || user.tokenExpiry - Date.now() < 2 * 60 * 1000;
}

function bufferToStream(buffer: Buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

function extractDriveFolderId(value: string) {
  const trimmed = value.trim();
  const patterns = [/\/folders\/([A-Za-z0-9_-]{10,})/, /[?&]id=([A-Za-z0-9_-]{10,})/, /^([A-Za-z0-9_-]{10,})$/];
  return patterns.map((pattern) => trimmed.match(pattern)?.[1]).find(Boolean) || null;
}

function extractSheetId(value: string) {
  const trimmed = value.trim();
  const patterns = [/\/spreadsheets\/d\/([A-Za-z0-9_-]{10,})/, /[?&]id=([A-Za-z0-9_-]{10,})/, /^([A-Za-z0-9_-]{10,})$/];
  return patterns.map((pattern) => trimmed.match(pattern)?.[1]).find(Boolean) || null;
}

function currentMonthTitle() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function monthTitleForRecord(record: ReceiptSheetRecord) {
  return monthTitleForDate(record.date);
}

function monthTitleForDate(date?: string | null) {
  if (date && /^\d{4}-\d{2}/.test(date)) return date.slice(0, 7);
  return currentMonthTitle();
}

function escapeSheetName(name: string) {
  return name.replace(/'/g, "''");
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
