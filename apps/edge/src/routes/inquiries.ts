import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requireAdmin, requireCsrf } from "../lib/session";
import { HttpError, clientIp, flag, newId, nowIso, parseJson, sha256Hex } from "../lib/util";

export const inquiries = new Hono<AppEnv>();

// 문의 수는 제한하지 않는다. 한 곳에서 몰리는 요청은 Cloudflare WAF 속도 제한이 앞단에서 막고,
// 자동 입력 봇은 숨겨진 website 칸(허니팟)으로 거른다.
const InquiryIn = z.object({
  artwork_id: z.string().nullable().default(null),
  name: z.string().min(1).max(120),
  email: z.email(),
  message: z.string().min(10).max(5000),
  consent: z.boolean(),
  website: z.string().max(0).default(""),
});

inquiries.post("/", async c => {
  const input = await parseJson(c, InquiryIn);
  if (!input.consent) throw new HttpError(422, "개인정보 수집 동의가 필요합니다");
  const db = c.env.DB;
  if (input.artwork_id) {
    const artwork = await db.prepare("SELECT 1 FROM artworks WHERE id = ? AND is_published = 1 AND deleted_at IS NULL").bind(input.artwork_id).first();
    if (!artwork) throw new HttpError(404, "문의할 작품을 찾을 수 없습니다");
  }
  const now = nowIso();
  const bucket = now.slice(0, 13).replace(/[-T]/g, "");
  const fingerprint = await sha256Hex(`${c.env.APP_SECRET_KEY}:${clientIp(c)}:${input.email.toLowerCase()}`);
  const id = newId();
  await db.prepare(
    `INSERT INTO inquiries (id, artwork_id, name, email, message, consent, status, fingerprint, created_bucket, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`,
  ).bind(id, input.artwork_id, input.name, input.email, input.message, flag(input.consent), fingerprint, bucket, now).run();
  return c.json({ id, message: "문의가 접수되었습니다" }, 201);
});

const SELECT = `SELECT i.id, i.artwork_id, i.name, i.email, i.message, i.status, i.created_at, a.title AS artwork_title, a.slug AS artwork_slug
  FROM inquiries i LEFT JOIN artworks a ON a.id = i.artwork_id`;

inquiries.get("/admin", requireAdmin, async c => {
  const { results } = await c.env.DB.prepare(`${SELECT} WHERE i.deleted_at IS NULL ORDER BY i.created_at DESC`).all();
  return c.json(results);
});

/** 관리 화면에서 '처리 완료' / '새 문의'로 표시한다. 서버 현황의 새 문의 수는 new만 센다. */
inquiries.patch("/admin/:id", requireCsrf, async c => {
  const input = await parseJson(c, z.object({ status: z.enum(["new", "done"]) }));
  const id = c.req.param("id");
  const result = await c.env.DB.prepare("UPDATE inquiries SET status = ? WHERE id = ? AND deleted_at IS NULL").bind(input.status, id).run();
  if (!result.meta.changes) throw new HttpError(404, "문의를 찾을 수 없습니다");
  return c.json(await c.env.DB.prepare(`${SELECT} WHERE i.id = ?`).bind(id).first());
});

/** 삭제 요청: 개인정보를 지우고 기록만 남긴다 */
inquiries.delete("/admin/:id", requireCsrf, async c => {
  const result = await c.env.DB.prepare(
    "UPDATE inquiries SET deleted_at = ?, name = '삭제됨', email = 'deleted@invalid.local', message = '삭제 요청으로 개인정보가 제거되었습니다.' WHERE id = ?",
  ).bind(nowIso(), c.req.param("id")).run();
  if (!result.meta.changes) throw new HttpError(404, "문의를 찾을 수 없습니다");
  return c.body(null, 204);
});
