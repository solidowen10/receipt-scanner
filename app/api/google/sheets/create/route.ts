import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createSpreadsheet } from "@/lib/google";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const sheet = await createSpreadsheet(user.userId, body.title?.trim() || "lürúee receipt scanner");
    return NextResponse.json({ sheet });
  } catch (error) {
    return jsonError(error);
  }
}
