import { NextRequest } from "next/server";
import { APP_BASE_PATH } from "@/lib/constants";
import { upsertLineUser } from "@/lib/db";

export type LuruUser = {
  userId: string;
  lineUserId: string | null;
  name: string | null;
  image: string | null;
};

type AuthSessionResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      userId: string;
      lineUserId?: string | null;
      name?: string | null;
      image?: string | null;
    };

export async function getCurrentUser(request: NextRequest): Promise<LuruUser | null> {
  if (process.env.ALLOW_DEV_AUTH === "1" && process.env.NODE_ENV !== "production") {
    const user = {
      userId: "dev-line-user",
      lineUserId: "dev-line-user",
      name: "Local user",
      image: null,
    };
    upsertLineUser({ userId: user.userId, lineUserId: user.lineUserId, displayName: user.name });
    return user;
  }

  const cookie = request.headers.get("cookie") || "";
  const sessionUrl = authSessionUrl(request);
  const response = await fetch(sessionUrl, {
    headers: { cookie },
    cache: "no-store",
  }).catch(() => null);

  if (!response || !response.ok) return null;

  const data = (await response.json().catch(() => null)) as AuthSessionResponse | null;
  if (!data?.authenticated || !data.userId) return null;

  const user = {
    userId: data.userId,
    lineUserId: data.lineUserId || null,
    name: data.name || null,
    image: data.image || null,
  };
  upsertLineUser({ userId: user.userId, lineUserId: user.lineUserId, displayName: user.name });
  return user;
}

export async function requireCurrentUser(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) throw new AuthRequiredError();
  return user;
}

export function loginUrl(next = APP_BASE_PATH) {
  return `/auth/login?next=${encodeURIComponent(next)}`;
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Login required");
    this.name = "AuthRequiredError";
  }
}

function authSessionUrl(request: NextRequest) {
  if (process.env.AUTH_SERVICE_INTERNAL_URL) return process.env.AUTH_SERVICE_INTERNAL_URL;

  const proto = request.headers.get("x-forwarded-proto") || (request.nextUrl.protocol.replace(":", "") || "https");
  const host = request.headers.get("host") || request.nextUrl.host;
  return `${proto}://${host}/auth/api/session`;
}
