import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, loginUrl } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ user: null, loginUrl: loginUrl() }, { status: 401 });
  return NextResponse.json({ user });
}
