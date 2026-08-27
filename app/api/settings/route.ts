import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { getStoredUser, updateSettings } from "@/lib/db";
import { googleConfigStatus, resolveAndSaveFolder, resolveAndSaveSheet } from "@/lib/google";
import { jsonError } from "@/lib/http";
import { parseTemplate, type FilenameSegment } from "@/lib/filename-template";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    return NextResponse.json(settingsPayload(user.userId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const body = (await request.json()) as {
      driveFolderInput?: string;
      driveFolderId?: string;
      driveFolderName?: string;
      sheetInput?: string;
      sheetId?: string;
      sheetName?: string;
      filenameTemplate?: FilenameSegment[];
      defaultPayerShortName?: string | null;
    };

    if (body.driveFolderInput?.trim()) {
      await resolveAndSaveFolder(user.userId, body.driveFolderInput);
    } else if (body.driveFolderId) {
      updateSettings(user.userId, {
        driveFolderId: body.driveFolderId,
        driveFolderName: body.driveFolderName || body.driveFolderId,
      });
    }

    if (body.sheetInput?.trim()) {
      await resolveAndSaveSheet(user.userId, body.sheetInput);
    } else if (body.sheetId) {
      updateSettings(user.userId, {
        sheetId: body.sheetId,
        sheetName: body.sheetName || body.sheetId,
      });
    }

    if (Array.isArray(body.filenameTemplate) || "defaultPayerShortName" in body) {
      updateSettings(user.userId, {
        filenameTemplate: Array.isArray(body.filenameTemplate) ? parseTemplate(JSON.stringify(body.filenameTemplate)) : undefined,
        defaultPayerShortName: body.defaultPayerShortName?.trim() || null,
      });
    }

    return NextResponse.json(settingsPayload(user.userId));
  } catch (error) {
    return jsonError(error);
  }
}

function settingsPayload(userId: string) {
  const stored = getStoredUser(userId);
  return {
    googleConfig: googleConfigStatus(),
    connected: Boolean(stored.accessToken || stored.refreshToken),
    googleEmail: stored.googleEmail,
    ready: Boolean(stored.accessToken && stored.driveFolderId && stored.sheetId),
    driveFolderId: stored.driveFolderId,
    driveFolderName: stored.driveFolderName,
    sheetId: stored.sheetId,
    sheetName: stored.sheetName,
    filenameTemplate: stored.filenameTemplate,
    defaultPayerShortName: stored.defaultPayerShortName,
  };
}
