import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { disconnectGoogle } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    disconnectGoogle(user.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
