import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { PROFILE_FIELDS, profileOut } from "../lib/rows";
import { requireCsrf } from "../lib/session";
import { HttpError, nowIso, parseJson } from "../lib/util";

export const health = new Hono<AppEnv>();

health.get("/live", c => c.json({ status: "ok" }));

health.get("/ready", async c => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
  } catch {
    throw new HttpError(503, "database unavailable");
  }
  return c.json({ status: "ready" });
});

export const profile = new Hono<AppEnv>();

const LIMITS: Record<(typeof PROFILE_FIELDS)[number], number> = {
  name: 120, headline: 300, intro: 2000, bio: 10000, cv: 10000, location: 120,
  name_en: 120, headline_en: 300, intro_en: 2000, bio_en: 10000, cv_en: 10000, location_en: 120,
  bank_name: 100, bank_account: 100, bank_holder: 100, payment_note: 2000, payment_note_en: 2000,
};
const ProfileIn = z.object(Object.fromEntries(PROFILE_FIELDS.map(key => [key, z.string().max(LIMITS[key]).default("")])) as Record<(typeof PROFILE_FIELDS)[number], z.ZodDefault<z.ZodString>>);

profile.get("/", async c => c.json(profileOut(await c.env.DB.prepare("SELECT * FROM artist_profile WHERE id = 1").first())));

profile.put("/admin", requireCsrf, async c => {
  const input = await parseJson(c, ProfileIn);
  const values = PROFILE_FIELDS.map(key => input[key].trim());
  await c.env.DB.prepare(
    `INSERT INTO artist_profile (id, ${PROFILE_FIELDS.join(", ")}, updated_at) VALUES (1, ${PROFILE_FIELDS.map(() => "?").join(", ")}, ?)
     ON CONFLICT (id) DO UPDATE SET ${PROFILE_FIELDS.map(key => `${key} = excluded.${key}`).join(", ")}, updated_at = excluded.updated_at`,
  ).bind(...values, nowIso()).run();
  return c.json(Object.fromEntries(PROFILE_FIELDS.map((key, i) => [key, values[i]])));
});

const THEME_COLOR = "#0b0a08";

/** 앱 설치(홈 화면에 추가)용 매니페스트. 작가 이름은 관리 화면에서 바뀌므로 프로필에서 읽어 만든다. */
export async function manifest(c: import("hono").Context<AppEnv>) {
  const row = await c.env.DB.prepare("SELECT name, name_en FROM artist_profile WHERE id = 1").first<{ name: string; name_en: string }>();
  const name = ((row ? row.name_en || row.name : "") || "").trim() || "Artist Portfolio";
  const icons = [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
  // 설치한 앱은 휴대폰 언어로 연다: 한국어 기기면 /ko, 아니면 영어(/)
  const korean = (c.req.header("Accept-Language") || "").trim().toLowerCase().startsWith("ko");
  const body = {
    id: "/", name: `${name} — Works`, short_name: name.slice(0, 12), description: `Works and exhibitions by ${name}.`,
    start_url: korean ? "/ko" : "/", scope: "/", display: "standalone", lang: korean ? "ko" : "en",
    background_color: THEME_COLOR, theme_color: THEME_COLOR, icons,
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache", Vary: "Accept-Language" } });
}
