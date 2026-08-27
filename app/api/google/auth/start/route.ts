import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createGoogleAuthUrl } from "@/lib/google";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    return NextResponse.redirect(createGoogleAuthUrl(user.userId));
  } catch (error) {
    return jsonError(error);
  }
}
