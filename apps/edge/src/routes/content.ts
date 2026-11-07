import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { artworkOut, categoryOut, exhibitionOut, seriesOut, withMedia } from "../lib/rows";
import { requireAdmin, requireCsrf } from "../lib/session";
import { HttpError, flag, isUniqueError, newId, nowIso, parseJson } from "../lib/util";

const slug = z.string().max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const date = z.iso.date().nullable().default(null);

// ---------- 작품 ----------

export const artworks = new Hono<AppEnv>();

const ArtworkIn = z.object({
  slug,
  title: z.string().min(1).max(300),
  year: z.number().int().min(1000).max(2200).nullable().default(null),
  medium: z.string().max(300).default(""),
  dimensions: z.string().max(200).default(""),
  description: z.string().max(10000).default(""),
  price_text: z.string().max(100).nullable().default(null),
  title_en: z.string().max(300).default(""),
  medium_en: z.string().max(300).default(""),
  description_en: z.string().max(10000).default(""),
  price_text_en: z.string().max(100).nullable().default(null),
  show_price: z.boolean().default(false),
  sale_status: z.enum(["available", "sold", "unavailable"]).default("unavailable"),
  is_published: z.boolean().default(false),
  featured: z.boolean().default(false),
  series_id: z.string().nullable().default(null),
  category_id: z.string().nullable().default(null),
});
type ArtworkInput = z.infer<typeof ArtworkIn>;
const ARTWORK_FIELDS = Object.keys(ArtworkIn.shape) as (keyof ArtworkInput)[];
const artworkValues = (input: ArtworkInput) => ARTWORK_FIELDS.map(key => (typeof input[key] === "boolean" ? flag(input[key] as boolean) : input[key]));

const PUBLIC = "is_published = 1 AND deleted_at IS NULL";

artworks.get("/", async c => {
  const q = c.req.query();
  const page = Number(q.page ?? 1);
  const size = Number(q.size ?? 12);
  if (!Number.isInteger(page) || page < 1) throw new HttpError(422, "page: 입력값이 올바르지 않습니다");
  if (!Number.isInteger(size) || size < 1 || size > 50) throw new HttpError(422, "size: 입력값이 올바르지 않습니다");
  const where = [PUBLIC];
  const params: unknown[] = [];
  if (q.year && Number(q.year)) { where.push("year = ?"); params.push(Number(q.year)); }
  if (q.medium) { where.push("medium LIKE ? ESCAPE '\\'"); params.push(`%${q.medium.replace(/[\\%_]/g, ch => `\\${ch}`)}%`); }
  if (q.sale_status) { where.push("sale_status = ?"); params.push(q.sale_status); }
  if (q.series_id) { where.push("series_id = ?"); params.push(q.series_id); }
  // 최상위 카테고리를 고르면 그 아래 하위 카테고리의 작품도 함께 나온다
  if (q.category) { where.push("(category_id = ? OR category_id IN (SELECT id FROM categories WHERE parent_id = ?))"); params.push(q.category, q.category); }
  if (q.featured !== undefined && q.featured !== "") {
    const value = ["true", "1", "yes", "on"].includes(q.featured.toLowerCase()) ? 1 : ["false", "0", "no", "off"].includes(q.featured.toLowerCase()) ? 0 : null;
    if (value === null) throw new HttpError(422, "featured: 입력값이 올바르지 않습니다");
    where.push("featured = ?"); params.push(value);
  }
  const clause = where.join(" AND ");
  // sort=featured: 대표 작품 먼저, 그다음 최신순 (홈 카테고리 탭)
  const order = q.sort === "featured" ? "featured DESC, created_at DESC" : "created_at DESC";
  const db = c.env.DB;
  const [count, rows] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT COUNT(*) AS total FROM artworks WHERE ${clause}`).bind(...params),
    db.prepare(`SELECT * FROM artworks WHERE ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...params, size, (page - 1) * size),
  ]);
  return c.json({ items: await withMedia(db, rows.results), page, size, total: Number(count.results[0]?.total ?? 0) });
});

/** 공개 작품이 있는 연도 목록 (최근 연도부터) */
artworks.get("/years", async c => {
  const { results } = await c.env.DB.prepare(`SELECT DISTINCT year FROM artworks WHERE ${PUBLIC} AND year IS NOT NULL ORDER BY year DESC`).all<{ year: number }>();
  return c.json(results.map(r => r.year));
});

artworks.get("/admin/all", requireAdmin, async c => {
  const { results } = await c.env.DB.prepare("SELECT * FROM artworks WHERE deleted_at IS NULL ORDER BY created_at DESC").all();
  return c.json(await withMedia(c.env.DB, results));
});

async function loadArtwork(db: D1Database, id: string) {
  const row = await db.prepare("SELECT * FROM artworks WHERE id = ?").bind(id).first();
  return row ? (await withMedia(db, [row]))[0] : null;
}

artworks.post("/admin", requireCsrf, async c => {
  const input = await parseJson(c, ArtworkIn);
  const id = newId();
  const now = nowIso();
  try {
    await c.env.DB.prepare(
      `INSERT INTO artworks (id, ${ARTWORK_FIELDS.join(", ")}, created_at, updated_at) VALUES (?, ${ARTWORK_FIELDS.map(() => "?").join(", ")}, ?, ?)`,
    ).bind(id, ...artworkValues(input), now, now).run();
  } catch (error) {
    if (isUniqueError(error)) throw new HttpError(409, "같은 주소(slug)의 작품이 이미 있습니다");
    if (error instanceof Error && /FOREIGN KEY/i.test(error.message)) throw new HttpError(422, "시리즈나 카테고리를 찾을 수 없습니다");
    throw error;
  }
  return c.json(await loadArtwork(c.env.DB, id), 201);
});

artworks.put("/admin/:id", requireCsrf, async c => {
  const input = await parseJson(c, ArtworkIn);
  const id = c.req.param("id");
  try {
    const result = await c.env.DB.prepare(
      `UPDATE artworks SET ${ARTWORK_FIELDS.map(key => `${key} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
    ).bind(...artworkValues(input), nowIso(), id).run();
    if (!result.meta.changes) throw new HttpError(404, "작품을 찾을 수 없습니다");
  } catch (error) {
    if (isUniqueError(error)) throw new HttpError(409, "같은 주소(slug)의 작품이 이미 있습니다");
    if (error instanceof Error && /FOREIGN KEY/i.test(error.message)) throw new HttpError(422, "시리즈나 카테고리를 찾을 수 없습니다");
    throw error;
  }
  return c.json(await loadArtwork(c.env.DB, id));
});

/** 휴지통으로 옮긴다 (공개 화면에서 사라지고 데이터는 남는다) */
artworks.delete("/admin/:id", requireCsrf, async c => {
  const now = nowIso();
  const result = await c.env.DB.prepare("UPDATE artworks SET deleted_at = COALESCE(deleted_at, ?), is_published = 0, updated_at = ? WHERE id = ?")
    .bind(now, now, c.req.param("id")).run();
  if (!result.meta.changes) throw new HttpError(404, "작품을 찾을 수 없습니다");
  return c.body(null, 204);
});

// 라우트는 등록 순서대로 맞춰지므로 /years, /admin/all 다음에 둔다
artworks.get("/:slug", async c => {
  const row = await c.env.DB.prepare(`SELECT * FROM artworks WHERE slug = ? AND ${PUBLIC}`).bind(c.req.param("slug")).first();
  if (!row) throw new HttpError(404, "작품을 찾을 수 없습니다");
  return c.json((await withMedia(c.env.DB, [row]))[0] ?? artworkOut(row));
});

// ---------- 시리즈 ----------

export const series = new Hono<AppEnv>();

const SeriesIn = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).default(""),
  name_en: z.string().max(200).default(""),
  description_en: z.string().max(5000).default(""),
  sort_order: z.number().int().min(0).max(100000).default(0),
});
const SERIES_FIELDS = Object.keys(SeriesIn.shape) as (keyof z.infer<typeof SeriesIn>)[];

const listSeries = async (db: D1Database) => (await db.prepare("SELECT * FROM series ORDER BY sort_order, name").all()).results.map(seriesOut);

series.get("/", async c => c.json(await listSeries(c.env.DB)));
series.get("/admin/all", requireAdmin, async c => c.json(await listSeries(c.env.DB)));

series.post("/admin", requireCsrf, async c => {
  const input = await parseJson(c, SeriesIn);
  const id = newId();
  try {
    await c.env.DB.prepare(`INSERT INTO series (id, ${SERIES_FIELDS.join(", ")}) VALUES (?, ?, ?, ?, ?, ?)`).bind(id, ...SERIES_FIELDS.map(k => input[k])).run();
  } catch (error) {
    if (isUniqueError(error)) throw new HttpError(409, "같은 이름의 시리즈가 이미 있습니다");
    throw error;
  }
  return c.json({ id, ...input }, 201);
});

series.put("/admin/:id", requireCsrf, async c => {
  const input = await parseJson(c, SeriesIn);
  const id = c.req.param("id");
  try {
    const result = await c.env.DB.prepare(`UPDATE series SET ${SERIES_FIELDS.map(k => `${k} = ?`).join(", ")} WHERE id = ?`).bind(...SERIES_FIELDS.map(k => input[k]), id).run();
    if (!result.meta.changes) throw new HttpError(404, "시리즈를 찾을 수 없습니다");
  } catch (error) {
    if (isUniqueError(error)) throw new HttpError(409, "같은 이름의 시리즈가 이미 있습니다");
    throw error;
  }
  return c.json({ id, ...input });
});

series.delete("/admin/:id", requireCsrf, async c => {
  const id = c.req.param("id");
  const db = c.env.DB;
  if (!(await db.prepare("SELECT 1 FROM series WHERE id = ?").bind(id).first())) throw new HttpError(404, "시리즈를 찾을 수 없습니다");
  if (await db.prepare("SELECT 1 FROM artworks WHERE series_id = ? AND deleted_at IS NULL LIMIT 1").bind(id).first()) {
    throw new HttpError(409, "작품에서 사용 중인 시리즈는 삭제할 수 없습니다");
  }
  await db.prepare("DELETE FROM series WHERE id = ?").bind(id).run();
  return c.body(null, 204);
});

// ---------- 카테고리 (2단계) ----------

export const categories = new Hono<AppEnv>();

const CategoryIn = z.object({
  name: z.string().trim().min(1).max(100),
  name_en: z.string().trim().max(100).default(""),
  parent_id: z.string().nullable().default(null),
  sort_order: z.number().int().min(0).max(100000).default(0),
  is_visible: z.boolean().default(true),
});
type CategoryInput = z.infer<typeof CategoryIn>;
type CategoryRow = { id: string; parent_id: string | null; name: string; name_en: string; sort_order: number; is_visible: number };

const allCategories = async (db: D1Database) =>
  (await db.prepare("SELECT * FROM categories ORDER BY sort_order, name").all<CategoryRow>()).results;

/** 최상위 다음에 그 하위가 오도록 줄 세운다 */
function treeOrder<T extends { id: string; parent_id: string | null }>(rows: T[]) {
  const tops = rows.filter(r => !r.parent_id);
  return tops.flatMap(top => [top, ...rows.filter(r => r.parent_id === top.id)]);
}

/** 공개: 숨기지 않았고 공개 작품이 있는 카테고리만 (하위에 작품이 있으면 최상위도 나온다) */
categories.get("/", async c => {
  const db = c.env.DB;
  const rows = await allCategories(db);
  const { results: counts } = await db.prepare(
    `SELECT category_id, COUNT(*) AS n FROM artworks WHERE ${PUBLIC} AND category_id IS NOT NULL GROUP BY category_id`,
  ).all<{ category_id: string; n: number }>();
  const own = new Map(counts.map(r => [r.category_id, Number(r.n)]));
  const byId = new Map(rows.map(r => [r.id, r]));
  const visible = (r: CategoryRow) => !!r.is_visible && (!r.parent_id || !!byId.get(r.parent_id)?.is_visible);
  const total = (r: CategoryRow) => (own.get(r.id) ?? 0) + (r.parent_id ? 0 : rows.filter(x => x.parent_id === r.id && visible(x)).reduce((sum, x) => sum + (own.get(x.id) ?? 0), 0));
  return c.json(treeOrder(rows.filter(r => visible(r) && total(r) > 0)).map(r => ({ ...categoryOut(r), work_count: total(r) })));
});

/** 관리자: 전체 카테고리와 쓰고 있는 작품 수(휴지통 제외) */
categories.get("/admin/all", requireAdmin, async c => {
  const db = c.env.DB;
  const rows = await allCategories(db);
  const { results: counts } = await db.prepare(
    "SELECT category_id, COUNT(*) AS n FROM artworks WHERE deleted_at IS NULL AND category_id IS NOT NULL GROUP BY category_id",
  ).all<{ category_id: string; n: number }>();
  const own = new Map(counts.map(r => [r.category_id, Number(r.n)]));
  return c.json(treeOrder(rows).map(r => ({ ...categoryOut(r), work_count: own.get(r.id) ?? 0 })));
});

/** 2단계까지만 허용한다: 상위는 최상위여야 하고, 하위를 가진 카테고리는 다른 카테고리 아래로 갈 수 없다 */
async function checkParent(db: D1Database, input: CategoryInput, id?: string) {
  if (!input.parent_id) return;
  if (input.parent_id === id) throw new HttpError(422, "자기 자신 아래에 둘 수 없습니다");
  const parent = await db.prepare("SELECT parent_id FROM categories WHERE id = ?").bind(input.parent_id).first<{ parent_id: string | null }>();
  if (!parent) throw new HttpError(422, "상위 카테고리를 찾을 수 없습니다");
  if (parent.parent_id) throw new HttpError(422, "하위 카테고리 아래에는 둘 수 없습니다 (2단계까지)");
  if (id && (await db.prepare("SELECT 1 FROM categories WHERE parent_id = ? LIMIT 1").bind(id).first())) {
    throw new HttpError(422, "하위 카테고리가 있는 최상위는 다른 카테고리 아래로 옮길 수 없습니다");
  }
}

const categoryValues = (input: CategoryInput) => [input.name, input.name_en, input.parent_id, input.sort_order, flag(input.is_visible)];
const loadCategory = async (db: D1Database, id: string) => categoryOut((await db.prepare("SELECT * FROM categories WHERE id = ?").bind(id).first())!);

categories.post("/admin", requireCsrf, async c => {
  const input = await parseJson(c, CategoryIn);
  const db = c.env.DB;
  await checkParent(db, input);
  const id = newId();
  const now = nowIso();
  try {
    await db.prepare("INSERT INTO categories (id, name, name_en, parent_id, sort_order, is_visible, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, ...categoryValues(input), now, now).run();
  } catch (error) {
    if (isUniqueError(error)) throw new HttpError(409, "같은 위치에 같은 이름의 카테고리가 이미 있습니다");
    throw error;
  }
  return c.json(await loadCategory(db, id), 201);
});

categories.put("/admin/:id", requireCsrf, async c => {
  const input = await parseJson(c, CategoryIn);
  const id = c.req.param("id");
  const db = c.env.DB;
  if (!(await db.prepare("SELECT 1 FROM categories WHERE id = ?").bind(id).first())) throw new HttpError(404, "카테고리를 찾을 수 없습니다");
  await checkParent(db, input, id);
  try {
    await db.prepare("UPDATE categories SET name = ?, name_en = ?, parent_id = ?, sort_order = ?, is_visible = ?, updated_at = ? WHERE id = ?")
      .bind(...categoryValues(input), nowIso(), id).run();
  } catch (error) {
    if (isUniqueError(error)) throw new HttpError(409, "같은 위치에 같은 이름의 카테고리가 이미 있습니다");
    throw error;
  }
  return c.json(await loadCategory(db, id));
});

/** 지우면 그 카테고리의 작품은 '카테고리 없음'이 된다. 하위가 있는 최상위는 하위를 먼저 옮기거나 지워야 한다 */
categories.delete("/admin/:id", requireCsrf, async c => {
  const id = c.req.param("id");
  const db = c.env.DB;
  if (!(await db.prepare("SELECT 1 FROM categories WHERE id = ?").bind(id).first())) throw new HttpError(404, "카테고리를 찾을 수 없습니다");
  if (await db.prepare("SELECT 1 FROM categories WHERE parent_id = ? LIMIT 1").bind(id).first()) {
    throw new HttpError(409, "하위 카테고리가 있어 삭제할 수 없습니다. 하위를 먼저 옮기거나 삭제하세요");
  }
  await db.batch([
    db.prepare("UPDATE artworks SET category_id = NULL WHERE category_id = ?").bind(id),
    db.prepare("DELETE FROM categories WHERE id = ?").bind(id),
  ]);
  return c.body(null, 204);
});

// ---------- 전시 ----------

export const exhibitions = new Hono<AppEnv>();

const ExhibitionIn = z.object({
  slug,
  title: z.string().min(1).max(300),
  venue: z.string().max(300).default(""),
  location: z.string().max(300).default(""),
  start_date: date,
  end_date: date,
  description: z.string().max(10000).default(""),
  title_en: z.string().max(300).default(""),
  venue_en: z.string().max(300).default(""),
  location_en: z.string().max(300).default(""),
  description_en: z.string().max(10000).default(""),
  is_published: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(100000).default(0),
}).refine(v => !v.start_date || !v.end_date || v.end_date >= v.start_date, { message: "@종료일은 시작일보다 빠를 수 없습니다" });
type ExhibitionInput = z.infer<typeof ExhibitionIn>;
const EXHIBITION_FIELDS: (keyof ExhibitionInput)[] = [
  "slug", "title", "venue", "location", "start_date", "end_date", "description", "title_en", "venue_en", "location_en", "description_en", "is_published", "sort_order",
];
const exhibitionValues = (input: ExhibitionInput) => EXHIBITION_FIELDS.map(key => (typeof input[key] === "boolean" ? flag(input[key] as boolean) : input[key]));
// PostgreSQL은 DESC에서 NULL이 앞에 온다. SQLite도 같게 맞춘다
const EXHIBITION_ORDER = "ORDER BY sort_order, start_date IS NULL DESC, start_date DESC";

exhibitions.get("/", async c => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM exhibitions WHERE is_published = 1 ${EXHIBITION_ORDER}`).all();
  return c.json(results.map(exhibitionOut));
});

exhibitions.get("/admin/all", requireAdmin, async c => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM exhibitions ${EXHIBITION_ORDER}`).all();
  return c.json(results.map(exhibitionOut));
});

exhibitions.post("/admin", requireCsrf, async c => {
  const input = await parseJson(c, ExhibitionIn);
  const id = newId();
  const now = nowIso();
  try {
    await c.env.DB.prepare(
      `INSERT INTO exhibitions (id, ${EXHIBITION_FIELDS.join(", ")}, created_at, updated_at) VALUES (?, ${EXHIBITION_FIELDS.map(() => "?").join(", ")}, ?, ?)`,
    ).bind(id, ...exhibitionValues(input), now, now).run();
  } catch (error) {
    if (isUniqueError(error)) throw new HttpError(409, "같은 주소의 전시가 이미 있습니다");
    throw error;
  }
  return c.json(exhibitionOut((await c.env.DB.prepare("SELECT * FROM exhibitions WHERE id = ?").bind(id).first())!), 201);
});

exhibitions.put("/admin/:id", requireCsrf, async c => {
  const input = await parseJson(c, ExhibitionIn);
  const id = c.req.param("id");
  try {
    const result = await c.env.DB.prepare(`UPDATE exhibitions SET ${EXHIBITION_FIELDS.map(k => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
      .bind(...exhibitionValues(input), nowIso(), id).run();
    if (!result.meta.changes) throw new HttpError(404, "전시를 찾을 수 없습니다");
  } catch (error) {
    if (isUniqueError(error)) throw new HttpError(409, "같은 주소의 전시가 이미 있습니다");
    throw error;
  }
  return c.json(exhibitionOut((await c.env.DB.prepare("SELECT * FROM exhibitions WHERE id = ?").bind(id).first())!));
});

exhibitions.delete("/admin/:id", requireCsrf, async c => {
  const result = await c.env.DB.prepare("DELETE FROM exhibitions WHERE id = ?").bind(c.req.param("id")).run();
  if (!result.meta.changes) throw new HttpError(404, "전시를 찾을 수 없습니다");
  return c.body(null, 204);
});

exhibitions.get("/:slug", async c => {
  const row = await c.env.DB.prepare("SELECT * FROM exhibitions WHERE slug = ? AND is_published = 1").bind(c.req.param("slug")).first();
  if (!row) throw new HttpError(404, "전시를 찾을 수 없습니다");
  return c.json(exhibitionOut(row));
});
