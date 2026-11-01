import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import { z } from "zod";
import { settings, type AppEnv } from "../env";
import { dummyHash, hashPassword, verifyPassword } from "../lib/password";
import { SESSION_COOKIE, checkOrigin, requireAdmin, requireCsrf, startSession } from "../lib/session";
import { HttpError, clientIp, newId, nowIso, parseJson, sha256Hex } from "../lib/util";

export const auth = new Hono<AppEnv>();

const LoginIn = z.object({ email: z.email(), password: z.string().min(10).max(200) });
const SetupIn = LoginIn.extend({ artist_name: z.string().max(120).default("") });

type Attempt = { key_hash: string; attempts: number; window_started_at: string; locked_until: string | null };

auth.post("/login", async c => {
  const input = await parseJson(c, LoginIn);
  const cfg = settings(c.env);
  const db = c.env.DB;
  const now = new Date();
  const key = await sha256Hex(`${c.env.APP_SECRET_KEY}:${clientIp(c)}:${input.email.toLowerCase()}`);
  const attempt = await db.prepare("SELECT * FROM login_attempts WHERE key_hash = ?").bind(key).first<Attempt>();
  // 잠긴 키는 비밀번호 해시를 계산하지 않고 바로 거절한다 (CPU 사용을 막는다)
  if (attempt?.locked_until && attempt.locked_until > now.toISOString()) throw new HttpError(429, "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요");
  const admin = await db.prepare("SELECT id, email, password_hash, is_active FROM admins WHERE email = ?").bind(input.email.toLowerCase())
    .first<{ id: string; email: string; password_hash: string; is_active: number }>();
  const valid = verifyPassword(admin ? admin.password_hash : dummyHash(), input.password);
  if (!admin || !admin.is_active || !valid) {
    const windowMs = cfg.loginWindowMinutes * 60_000;
    const fresh = !attempt || new Date(attempt.window_started_at).getTime() + windowMs <= now.getTime();
    const count = fresh ? 1 : attempt.attempts + 1;
    const startedAt = fresh ? now.toISOString() : attempt.window_started_at;
    const lockedUntil = count >= cfg.loginMaxAttempts ? new Date(now.getTime() + windowMs).toISOString() : null;
    await db.prepare(
      `INSERT INTO login_attempts (key_hash, attempts, window_started_at, locked_until, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (key_hash) DO UPDATE SET attempts = excluded.attempts, window_started_at = excluded.window_started_at,
         locked_until = excluded.locked_until, updated_at = excluded.updated_at`,
    ).bind(key, count, startedAt, lockedUntil, now.toISOString()).run();
    throw new HttpError(401, "이메일 또는 비밀번호가 올바르지 않습니다");
  }
  const clear = attempt ? [db.prepare("DELETE FROM login_attempts WHERE key_hash = ?").bind(key)] : [];
  return c.json(await startSession(c, admin, clear));
});

auth.get("/setup", async c => {
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM admins").first<{ n: number }>();
  return c.json({ needs_setup: !row?.n });
});

/** 관리자가 하나도 없을 때만 첫 관리자 계정을 만들고 바로 로그인시킨다. */
auth.post("/setup", async c => {
  const input = await parseJson(c, SetupIn);
  checkOrigin(c);
  const db = c.env.DB;
  const exists = await db.prepare("SELECT 1 FROM admins LIMIT 1").first();
  if (exists) throw new HttpError(409, "관리자 계정이 이미 설정되어 있습니다");
  const admin = { id: newId(), email: input.email.toLowerCase() };
  // 동시에 들어온 설정 요청이 관리자를 둘 만들지 않도록 "없을 때만 넣기"를 한 문장으로 처리한다
  const inserted = await db.prepare(
    "INSERT INTO admins (id, email, password_hash, is_active, created_at) SELECT ?, ?, ?, 1, ? WHERE NOT EXISTS (SELECT 1 FROM admins)",
  ).bind(admin.id, admin.email, hashPassword(input.password), nowIso()).run();
  if (!inserted.meta.changes) throw new HttpError(409, "관리자 계정이 이미 설정되어 있습니다");
  const extra = [];
  const artistName = input.artist_name.trim();
  if (artistName) {
    extra.push(db.prepare(
      "INSERT INTO artist_profile (id, name, updated_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at",
    ).bind(artistName, nowIso()));
  }
  return c.json(await startSession(c, admin, extra), 201);
});

auth.get("/me", requireAdmin, c => {
  const session = c.get("session");
  return c.json({ email: session.email, csrf_token: session.csrf_token });
});

auth.post("/logout", requireCsrf, async c => {
  await c.env.DB.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE id = ?").bind(nowIso(), c.get("session").id).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
