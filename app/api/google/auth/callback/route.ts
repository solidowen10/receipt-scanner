import { NextRequest, NextResponse } from "next/server";
import { APP_BASE_PATH } from "@/lib/constants";
import { consumeOAuthState, exchangeGoogleCode } from "@/lib/google";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const redirectUrl = new URL(`${APP_BASE_PATH}?tab=setup`, request.url);

  if (error) {
    redirectUrl.searchParams.set("google", "error");
    redirectUrl.searchParams.set("message", error);
    return NextResponse.redirect(redirectUrl);
  }

  const userId = consumeOAuthState(state);
  if (!code || !userId) {
    redirectUrl.searchParams.set("google", "error");
    redirectUrl.searchParams.set("message", "invalid_state");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    await exchangeGoogleCode(userId, code);
    redirectUrl.searchParams.set("google", "connected");
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    redirectUrl.searchParams.set("google", "error");
    redirectUrl.searchParams.set("message", err instanceof Error ? err.message : "oauth_failed");
    return NextResponse.redirect(redirectUrl);
  }
}
