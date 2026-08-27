import { NextResponse } from "next/server";
import { AuthRequiredError } from "@/lib/auth";

export function jsonError(error: unknown, fallback = "Something went wrong") {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }

  const message = error instanceof Error ? error.message : fallback;
  const status = statusForMessage(message);
  return NextResponse.json({ error: message }, { status });
}

function statusForMessage(message: string) {
  if (/not configured|missing|required|invalid|尚未|缺少/i.test(message)) return 400;
  if (/not found|找不到/i.test(message)) return 404;
  return 500;
}
