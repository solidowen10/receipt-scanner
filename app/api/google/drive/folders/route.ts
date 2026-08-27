import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { listDriveFolders } from "@/lib/google";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const parentId = request.nextUrl.searchParams.get("parentId") || "root";
    const folders = await listDriveFolders(user.userId, parentId);
    return NextResponse.json({ folders });
  } catch (error) {
    return jsonError(error);
  }
}
