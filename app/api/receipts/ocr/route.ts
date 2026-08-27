import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireCurrentUser } from "@/lib/auth";
import { createUpload, dataDir, getStoredUser } from "@/lib/db";
import { extensionForFile } from "@/lib/filename-template";
import { runDriveOcr } from "@/lib/google";
import { jsonError } from "@/lib/http";
import { parseReceiptText } from "@/lib/receipt-parse";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const settings = getStoredUser(user.userId);
    if (!settings.accessToken && !settings.refreshToken) throw new Error("Google account is not connected");

    const form = await request.formData();
    const file = form.get("receipt");
    if (!(file instanceof File)) throw new Error("Receipt image is required");
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") throw new Error("Upload an image or PDF receipt");

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > 12 * 1024 * 1024) throw new Error("Receipt file must be under 12 MB");

    const uploadId = randomUUID();
    const extension = extensionForFile(file.name, file.type);
    const filePath = path.join(dataDir(), `${uploadId}${extension}`);
    fs.writeFileSync(filePath, buffer);

    const ocrText = await runDriveOcr(user.userId, buffer, file.type || "image/jpeg");
    const draft = parseReceiptText(ocrText);

    createUpload({
      id: uploadId,
      userId: user.userId,
      originalName: file.name || `receipt${extension}`,
      mimeType: file.type || "image/jpeg",
      extension,
      filePath,
      ocrText,
      draft,
    });

    return NextResponse.json({
      uploadId,
      originalName: file.name,
      draft,
      defaultPayerShortName: settings.defaultPayerShortName,
      filenameTemplate: settings.filenameTemplate,
    });
  } catch (error) {
    return jsonError(error);
  }
}
