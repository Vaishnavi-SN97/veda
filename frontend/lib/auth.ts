// NextAuth (v4) with Google. Server-only: imported by the auth route and the backend proxy.
// The Google access/refresh tokens live in the encrypted JWT cookie and are never sent to browser JS;
// the session only exposes the user's name/email and an error flag.

import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";

export const CLASSROOM_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/classroom.courses", // list + create the Grade 3/4/5 courses
  "https://www.googleapis.com/auth/classroom.rosters.readonly", // import students
  "https://www.googleapis.com/auth/classroom.profile.emails", // students' emails
  "https://www.googleapis.com/auth/classroom.coursework.students", // post quizzes, read + write grades
  "https://www.googleapis.com/auth/classroom.courseworkmaterials", // post card decks
  "https://www.googleapis.com/auth/classroom.topics", // the chapter topic
];

interface VedaToken extends JWT {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // seconds since epoch
  error?: "RefreshAccessTokenError";
}

async function refreshAccessToken(token: VedaToken): Promise<VedaToken> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken ?? "",
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "refresh failed");
    return {
      ...token,
      accessToken: j.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600),
      refreshToken: j.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: { scope: CLASSROOM_SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      const t = token as VedaToken;
      if (account) {
        // first sign-in: keep Google's tokens server-side in the encrypted cookie
        return { ...t, accessToken: account.access_token, refreshToken: account.refresh_token, expiresAt: account.expires_at, error: undefined };
      }
      if (t.expiresAt && Date.now() / 1000 < t.expiresAt - 60) return t;
      if (!t.refreshToken) return { ...t, error: "RefreshAccessTokenError" };
      return refreshAccessToken(t);
    },
    async session({ session, token }) {
      // never put tokens in the session object (it is readable from the browser)
      return { ...session, error: (token as VedaToken).error } as typeof session & { error?: string };
    },
  },
  pages: { signIn: "/teacher" },
};

export type { VedaToken };
