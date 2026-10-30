// Same-origin proxy to the FastAPI backend. Runs on the Next.js server, so it can:
//  - attach the teacher's Google access token from the encrypted NextAuth cookie (never exposed to JS),
//  - prove to the backend that the call came through the app (X-Veda-Proxy, derived from NEXTAUTH_SECRET),
//  - turn "backend unreachable" into a kind offline message.
// Browser code calls /api/backend/api/... instead of http://localhost:8000/api/...

import { createHash } from "node:crypto";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import type { VedaToken } from "@/lib/auth";

const BACKEND = process.env.VEDA_BACKEND_URL ?? "http://127.0.0.1:8000";

function proxyKey() {
  // computed per request so it always sees NEXTAUTH_SECRET from the root .env
  return createHash("sha256").update(`veda-proxy:${process.env.NEXTAUTH_SECRET ?? ""}`).digest("hex");
}

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = `${BACKEND}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of ["content-type", "accept"]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("x-veda-proxy", proxyKey());

  const token = process.env.NEXTAUTH_SECRET ? ((await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as VedaToken | null) : null;
  if (token?.error === "RefreshAccessTokenError") {
    return Response.json({ detail: "Your Google sign-in has expired. Please sign in again.", code: "google_expired" }, { status: 401 });
  }
  if (token?.accessToken) {
    headers.set("authorization", `Bearer ${token.accessToken}`);
    if (token.name) headers.set("x-veda-user-name", encodeURIComponent(token.name).slice(0, 200));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
      cache: "no-store",
    });
  } catch {
    return Response.json({ detail: "Can't reach the Veda server. Showing saved data if there is any.", code: "offline" }, { status: 503 });
  }
  const out = new Headers();
  for (const h of ["content-type", "content-disposition"]) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("cache-control", "no-store");
  return new Response(res.body, { status: res.status, headers: out });
}

export { forward as GET, forward as POST, forward as PUT, forward as DELETE };
