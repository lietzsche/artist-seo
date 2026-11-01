import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { settings, type AppEnv } from "../env";
import { HttpError, addMs, base64url, hex, newId, nowIso, randomBytes, sha256Hex } from "./util";

export const SESSION_COOKIE = "artist_admin_session";
const SESSION_HOURS = 24;

type SessionRow = { id: string; admin_id: string; csrf_token: string; expires_at: string; revoked_at: string | null; email: string; is_active: number };

/** 로그인 세션이 있어야 한다 (읽기 전용 관리자 API). */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) throw new HttpError(401, "로그인이 필요합니다");
  const row = await c.env.DB.prepare(
    `SELECT s.id, s.admin_id, s.csrf_token, s.expires_at, s.revoked_at, a.email, a.is_active
       FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?`,
  ).bind(await sha256Hex(token)).first<SessionRow>();
  if (!row || row.revoked_at || row.expires_at < nowIso() || !row.is_active) throw new HttpError(401, "세션이 만료되었습니다");
  c.set("session", { id: row.id, admin_id: row.admin_id, email: row.email, csrf_token: row.csrf_token });
  await next();
};

export function checkOrigin(c: Context<AppEnv>) {
  const origin = c.req.header("Origin");
  if (origin && origin.replace(/\/+$/, "") !== settings(c.env).publicOrigin) throw new HttpError(403, "허용되지 않은 Origin입니다");
}

/** 상태를 바꾸는 관리자 API: 세션 + Origin + CSRF 토큰 */
export const requireCsrf: MiddlewareHandler<AppEnv> = async (c, next) => {
  await requireAdmin(c, async () => {
    checkOrigin(c);
    const csrf = c.req.header("X-CSRF-Token");
    if (!csrf || csrf !== c.get("session").csrf_token) throw new HttpError(403, "CSRF 토큰이 올바르지 않습니다");
    await next();
  });
};

/** 세션을 만들고 쿠키를 붙인다. DB에는 토큰의 해시만 저장한다. */
export async function startSession(c: Context<AppEnv>, admin: { id: string; email: string }, extra: D1PreparedStatement[] = []) {
  const token = base64url(randomBytes(32));
  const csrf = hex(randomBytes(32));
  await c.env.DB.batch([
    ...extra,
    c.env.DB.prepare("INSERT INTO admin_sessions (id, admin_id, token_hash, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(newId(), admin.id, await sha256Hex(token), csrf, addMs(SESSION_HOURS * 3600_000), nowIso()),
  ]);
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: settings(c.env).cookieSecure, sameSite: "Lax", maxAge: SESSION_HOURS * 3600, path: "/" });
  return { csrf_token: csrf, email: admin.email };
}
