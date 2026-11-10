import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import heicConvert from "heic-convert";
import { requireCurrentUser } from "@/lib/auth";
import { createUpload, dataDir, getStoredUser } from "@/lib/db";
import { extensionForFile } from "@/lib/filename-template";
import { runDriveOcr } from "@/lib/google";
import { jsonError } from "@/lib/http";
import { parseReceiptText } from "@/lib/receipt-parse";

export const runtime = "nodejs";

async function prepareForDriveOcr(
  buffer: Buffer,
  mimeType: string,
  filename: string,
) {
  if (!isHeifImage(filename, mimeType)) {
    return { buffer, mimeType };
  }

  const jpeg = await heicConvert({
    buffer,
    format: "JPEG",
    quality: 0.88,
  });

  return {
    buffer: Buffer.from(jpeg),
    mimeType: "image/jpeg",
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const settings = getStoredUser(user.userId);
    if (!settings.accessToken && !settings.refreshToken) throw new Error("Google account is not connected");

    const form = await request.formData();
    const file = form.get("receipt");
    if (!(file instanceof File)) throw new Error("Receipt image is required");
    const heifImage = isHeifImage(file.name, file.type);
    if (!file.type.startsWith("image/") && file.type !== "application/pdf" && !heifImage) {
      throw new Error("Upload an image or PDF receipt");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > 12 * 1024 * 1024) throw new Error("Receipt file must be under 12 MB");

    const uploadId = randomUUID();
    const extension = extensionForFile(file.name, file.type);
    const originalMimeType = file.type || (heifImage ? "image/heif" : "image/jpeg");
    const filePath = path.join(dataDir(), `${uploadId}${extension}`);
    fs.writeFileSync(filePath, buffer);

    const ocrInput = await prepareForDriveOcr(
      buffer,
      originalMimeType,
      file.name,
    );

    const ocrText = await runDriveOcr(
      user.userId,
      ocrInput.buffer,
      ocrInput.mimeType,
    );
    const draft = parseReceiptText(ocrText);

    createUpload({
      id: uploadId,
      userId: user.userId,
      originalName: file.name || `receipt${extension}`,
      mimeType: originalMimeType,
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

function isHeifImage(filename: string, mimeType: string) {
  return /^image\/hei[cf](?:-sequence)?$/i.test(mimeType) || /\.(?:heic|heif)$/i.test(filename);
}
