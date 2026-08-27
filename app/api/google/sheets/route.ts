import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { listSheets } from "@/lib/google";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const sheets = await listSheets(user.userId);
    return NextResponse.json({ sheets });
  } catch (error) {
    return jsonError(error);
  }
}
