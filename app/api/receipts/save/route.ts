import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { requireCurrentUser } from "@/lib/auth";
import { deleteUpload, getStoredUser, getUpload } from "@/lib/db";
import { renderFilenameBase } from "@/lib/filename-template";
import { appendReceiptToMonthlySheet, uploadOriginalReceipt, type ReceiptSheetRecord } from "@/lib/google";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

type SaveBody = {
  uploadId?: string;
  date?: string | null;
  merchant?: string | null;
  invoiceNumber?: string | null;
  total?: number | string | null;
  category?: string | null;
  payerShortName?: string | null;
  paymentMethod?: string | null;
  itemsText?: string | null;
  notes?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const body = (await request.json()) as SaveBody;
    if (!body.uploadId) throw new Error("Upload ID is required");

    const upload = getUpload(user.userId, body.uploadId);
    if (!upload) throw new Error("Receipt upload not found");

    const settings = getStoredUser(user.userId);
    if (!settings.driveFolderId) throw new Error("Drive folder is not configured");
    if (!settings.sheetId) throw new Error("Google Sheet is not configured");

    const total = normalizeAmount(body.total);
    const values = {
      date: body.date || upload.draft.date,
      invoiceNumber: body.invoiceNumber || upload.draft.invoiceNumber,
      payerShortName: body.payerShortName || settings.defaultPayerShortName,
      total,
      merchant: body.merchant || upload.draft.merchant,
      category: body.category || upload.draft.category,
      paymentMethod: body.paymentMethod || null,
      timestamp: new Date().toISOString(),
    };
    const filename = `${renderFilenameBase(settings.filenameTemplate, values)}${upload.extension}`;
    const buffer = fs.readFileSync(upload.filePath);
    const driveFile = await uploadOriginalReceipt(user.userId, buffer, upload.mimeType, filename, values.date || null);

    const record: ReceiptSheetRecord = {
      recordedAt: formatTaipeiTimestamp(new Date()),
      date: values.date || null,
      merchant: values.merchant || null,
      invoiceNumber: values.invoiceNumber || null,
      payerShortName: values.payerShortName || null,
      total,
      category: values.category || null,
      paymentMethod: values.paymentMethod || null,
      itemsText: body.itemsText || upload.draft.items.map((item) => `${item.name}${item.subtotal ? ` ${item.subtotal}` : ""}`).join("、") || null,
      notes: body.notes || null,
      driveFileUrl: driveFile.url,
      filename,
    };
    const sheet = await appendReceiptToMonthlySheet(user.userId, record);

    deleteUpload(user.userId, upload.id);

    return NextResponse.json({
      ok: true,
      filename,
      driveFile,
      sheet,
    });
  } catch (error) {
    return jsonError(error);
  }
}

function normalizeAmount(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function formatTaipeiTimestamp(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
