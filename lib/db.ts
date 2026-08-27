import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_TEMPLATE, parseTemplate, serializeTemplate, type FilenameSegment } from "@/lib/filename-template";
import type { ReceiptDraft } from "@/lib/receipt-parse";

export type StoredUser = {
  userId: string;
  lineUserId: string | null;
  displayName: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: number | null;
  googleEmail: string | null;
  driveFolderId: string | null;
  driveFolderName: string | null;
  sheetId: string | null;
  sheetName: string | null;
  filenameTemplate: FilenameSegment[];
  defaultPayerShortName: string | null;
};

export type UploadRecord = {
  id: string;
  userId: string;
  originalName: string;
  mimeType: string;
  extension: string;
  filePath: string;
  ocrText: string;
  draft: ReceiptDraft;
  createdAt: number;
};

type DbUserRow = {
  user_id: string;
  line_user_id: string | null;
  display_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: number | null;
  google_email: string | null;
  drive_folder_id: string | null;
  drive_folder_name: string | null;
  sheet_id: string | null;
  sheet_name: string | null;
  filename_template: string | null;
  default_payer_short_name: string | null;
};

type UploadRow = {
  id: string;
  user_id: string;
  original_name: string;
  mime_type: string;
  extension: string;
  file_path: string;
  ocr_text: string;
  draft_json: string;
  created_at: number;
};

const globalForDb = globalThis as typeof globalThis & { receiptScannerDb?: Database.Database };

export function getDb() {
  if (globalForDb.receiptScannerDb) return globalForDb.receiptScannerDb;

  const dbPath = process.env.RECEIPT_DB_PATH || path.join(process.cwd(), "data", "receipt-scanner.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  globalForDb.receiptScannerDb = db;
  return db;
}

export function dataDir() {
  const dbPath = process.env.RECEIPT_DB_PATH || path.join(process.cwd(), "data", "receipt-scanner.db");
  const dir = path.join(path.dirname(dbPath), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function upsertLineUser(input: { userId: string; lineUserId?: string | null; displayName?: string | null }) {
  const now = Date.now();
  getDb()
    .prepare(
      `
        INSERT INTO receipt_users (user_id, line_user_id, display_name, filename_template, created_at, updated_at)
        VALUES (@userId, @lineUserId, @displayName, @filenameTemplate, @now, @now)
        ON CONFLICT(user_id)
        DO UPDATE SET line_user_id = excluded.line_user_id,
                      display_name = excluded.display_name,
                      updated_at = excluded.updated_at
      `,
    )
    .run({
      userId: input.userId,
      lineUserId: input.lineUserId || null,
      displayName: input.displayName || null,
      filenameTemplate: serializeTemplate(DEFAULT_TEMPLATE),
      now,
    });
}

export function getStoredUser(userId: string): StoredUser {
  const row = getDb()
    .prepare("SELECT * FROM receipt_users WHERE user_id = ?")
    .get(userId) as DbUserRow | undefined;

  if (!row) {
    upsertLineUser({ userId });
    return getStoredUser(userId);
  }

  return {
    userId: row.user_id,
    lineUserId: row.line_user_id,
    displayName: row.display_name,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiry: row.token_expiry,
    googleEmail: row.google_email,
    driveFolderId: row.drive_folder_id,
    driveFolderName: row.drive_folder_name,
    sheetId: row.sheet_id,
    sheetName: row.sheet_name,
    filenameTemplate: parseTemplate(row.filename_template),
    defaultPayerShortName: row.default_payer_short_name,
  };
}

export function saveGoogleTokens(
  userId: string,
  tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null },
  googleEmail?: string | null,
) {
  const existing = getStoredUser(userId);
  getDb()
    .prepare(
      `
        UPDATE receipt_users
        SET access_token = COALESCE(@accessToken, access_token),
            refresh_token = COALESCE(@refreshToken, refresh_token),
            token_expiry = COALESCE(@tokenExpiry, token_expiry),
            google_email = COALESCE(@googleEmail, google_email),
            updated_at = @updatedAt
        WHERE user_id = @userId
      `,
    )
    .run({
      userId,
      accessToken: tokens.access_token || existing.accessToken,
      refreshToken: tokens.refresh_token || existing.refreshToken,
      tokenExpiry: tokens.expiry_date || existing.tokenExpiry,
      googleEmail: googleEmail || existing.googleEmail,
      updatedAt: Date.now(),
    });
}

export function disconnectGoogle(userId: string) {
  getDb()
    .prepare(
      `
        UPDATE receipt_users
        SET access_token = NULL,
            refresh_token = NULL,
            token_expiry = NULL,
            google_email = NULL,
            updated_at = @updatedAt
        WHERE user_id = @userId
      `,
    )
    .run({ userId, updatedAt: Date.now() });
}

export function updateSettings(
  userId: string,
  fields: Partial<{
    driveFolderId: string | null;
    driveFolderName: string | null;
    sheetId: string | null;
    sheetName: string | null;
    filenameTemplate: FilenameSegment[];
    defaultPayerShortName: string | null;
  }>,
) {
  const existing = getStoredUser(userId);
  const has = (key: keyof typeof fields) => Object.prototype.hasOwnProperty.call(fields, key);
  getDb()
    .prepare(
      `
        UPDATE receipt_users
        SET drive_folder_id = @driveFolderId,
            drive_folder_name = @driveFolderName,
            sheet_id = @sheetId,
            sheet_name = @sheetName,
            filename_template = @filenameTemplate,
            default_payer_short_name = @defaultPayerShortName,
            updated_at = @updatedAt
        WHERE user_id = @userId
      `,
    )
    .run({
      userId,
      driveFolderId: has("driveFolderId") ? fields.driveFolderId : existing.driveFolderId,
      driveFolderName: has("driveFolderName") ? fields.driveFolderName : existing.driveFolderName,
      sheetId: has("sheetId") ? fields.sheetId : existing.sheetId,
      sheetName: has("sheetName") ? fields.sheetName : existing.sheetName,
      filenameTemplate:
        has("filenameTemplate") && fields.filenameTemplate
          ? serializeTemplate(fields.filenameTemplate)
          : serializeTemplate(existing.filenameTemplate),
      defaultPayerShortName: has("defaultPayerShortName") ? fields.defaultPayerShortName : existing.defaultPayerShortName,
      updatedAt: Date.now(),
    });
}

export function createUpload(record: Omit<UploadRecord, "createdAt">) {
  getDb()
    .prepare(
      `
        INSERT INTO receipt_uploads
          (id, user_id, original_name, mime_type, extension, file_path, ocr_text, draft_json, created_at)
        VALUES
          (@id, @userId, @originalName, @mimeType, @extension, @filePath, @ocrText, @draftJson, @createdAt)
      `,
    )
    .run({
      id: record.id,
      userId: record.userId,
      originalName: record.originalName,
      mimeType: record.mimeType,
      extension: record.extension,
      filePath: record.filePath,
      ocrText: record.ocrText,
      draftJson: JSON.stringify(record.draft),
      createdAt: Date.now(),
    });
}

export function getUpload(userId: string, id: string): UploadRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM receipt_uploads WHERE id = ? AND user_id = ?")
    .get(id, userId) as UploadRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    extension: row.extension,
    filePath: row.file_path,
    ocrText: row.ocr_text,
    draft: JSON.parse(row.draft_json) as ReceiptDraft,
    createdAt: row.created_at,
  };
}

export function deleteUpload(userId: string, id: string) {
  const upload = getUpload(userId, id);
  if (upload) fs.rmSync(upload.filePath, { force: true });
  getDb().prepare("DELETE FROM receipt_uploads WHERE id = ? AND user_id = ?").run(id, userId);
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS receipt_users (
      user_id TEXT PRIMARY KEY,
      line_user_id TEXT,
      display_name TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expiry INTEGER,
      google_email TEXT,
      drive_folder_id TEXT,
      drive_folder_name TEXT,
      sheet_id TEXT,
      sheet_name TEXT,
      filename_template TEXT NOT NULL,
      default_payer_short_name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS receipt_uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      extension TEXT NOT NULL,
      file_path TEXT NOT NULL,
      ocr_text TEXT NOT NULL,
      draft_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_receipt_uploads_user
    ON receipt_uploads(user_id);
  `);
}
