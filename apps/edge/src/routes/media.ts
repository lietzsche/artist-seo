import { Hono, type Context } from "hono";
import { z } from "zod";
import { settings, type AppEnv, type Env } from "../env";
import { deriveImage } from "../media/derive";
import { ALLOWED_TYPES, EXTENSION, declaredType, mediaKind, sniff } from "../media/detect";
import { requireAdmin, requireCsrf } from "../lib/session";
import { HttpError, addMs, hex, newId, nowIso, parseJson } from "../lib/util";

export const media = new Hono<AppEnv>();

/** 청크 크기. R2 멀티파트는 마지막 파트를 빼고 모든 파트가 같은 크기(최소 5MiB)여야 한다. 프론트와 같은 값이다. */
export const CHUNK_BYTES = 5 * 1024 * 1024;
const CHUNK_LOCK_MS = 60_000;
const POSTER_MAX_BYTES = 2 * 1024 * 1024;

type Upload = {
  id: string; admin_id: string; artwork_id: string; media_id: string; original_filename: string; declared_content_type: string;
  expected_bytes: number; received_bytes: number; r2_bucket: "originals" | "public"; r2_key: string; r2_upload_id: string;
  chunk_lock_until: string | null; status: string; expires_at: string;
};

export const bucketOf = (env: Env, name: string) => (name === "public" || name === "r2-public" ? env.MEDIA_PUBLIC : env.MEDIA_ORIGINALS);

async function storageUsage(db: D1Database) {
  const [stored, reserved] = await db.batch<{ n: number }>([
    db.prepare("SELECT COALESCE(SUM(byte_size), 0) AS n FROM media_assets WHERE deleted_at IS NULL"),
    db.prepare("SELECT COALESCE(SUM(expected_bytes), 0) AS n FROM upload_sessions WHERE status = 'active' AND expires_at > ?").bind(nowIso()),
  ]);
  return { stored: Number(stored.results[0]?.n ?? 0), reserved: Number(reserved.results[0]?.n ?? 0) };
}
export { storageUsage };

async function ownUpload(c: Context<AppEnv>) {
  const upload = await c.env.DB.prepare("SELECT * FROM upload_sessions WHERE id = ?").bind(c.req.param("id")).first<Upload>();
  if (!upload || upload.admin_id !== c.get("session").admin_id) throw new HttpError(404, "업로드를 찾을 수 없습니다");
  return upload;
}

const UploadInit = z.object({
  artwork_id: z.string(),
  filename: z.string().min(1).max(500),
  content_type: z.string().min(1).max(100),
  total_bytes: z.number().int().positive(),
});

media.post("/uploads", requireCsrf, async c => {
  const input = await parseJson(c, UploadInit);
  const cfg = settings(c.env);
  const db = c.env.DB;
  const artwork = await db.prepare("SELECT id FROM artworks WHERE id = ? AND deleted_at IS NULL").bind(input.artwork_id).first<{ id: string }>();
  if (!artwork) throw new HttpError(404, "작품을 찾을 수 없습니다");
  const filename = input.filename.split(/[\\/]/).pop() || "upload";
  const type = declaredType(input.content_type, filename);
  if (!ALLOWED_TYPES.includes(type)) throw new HttpError(415, "JPG·PNG·WebP 이미지, MP4·WebM 영상만 올릴 수 있습니다");
  const kind = mediaKind(type);
  if (kind === "image" && input.total_bytes > cfg.maxImageBytes) {
    throw new HttpError(413, `이미지는 ${Math.floor(cfg.maxImageBytes / 1024 / 1024)}MB까지 올릴 수 있습니다`);
  }
  if (input.total_bytes > cfg.maxFileBytes) throw new HttpError(413, `파일은 최대 ${cfg.maxFileBytes}바이트까지 업로드할 수 있습니다`);
  const usage = await storageUsage(db);
  if (usage.stored + usage.reserved + input.total_bytes > cfg.maxTotalBytes) throw new HttpError(507, "설정된 전체 저장 용량을 초과합니다");

  // 영상은 변환하지 않으므로 공개 버킷에 바로 재생 파일로 올린다. 이미지는 비공개 버킷에 원본으로 둔다
  const mediaId = newId();
  const bucket = kind === "video" ? "public" : "originals";
  const key = kind === "video" ? `${mediaId}/playback.${EXTENSION[type]}` : `${artwork.id}/${newId().replace(/-/g, "")}.${EXTENSION[type]}`;
  const multipart = await bucketOf(c.env, bucket).createMultipartUpload(key, { httpMetadata: { contentType: type } });
  const id = newId();
  const now = nowIso();
  const expiresAt = addMs(cfg.uploadExpiryHours * 3600_000);
  await db.prepare(
    `INSERT INTO upload_sessions (id, admin_id, artwork_id, media_id, original_filename, declared_content_type, expected_bytes, received_bytes,
       r2_bucket, r2_key, r2_upload_id, status, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'active', ?, ?, ?)`,
  ).bind(id, c.get("session").admin_id, artwork.id, mediaId, filename, type, input.total_bytes, bucket, key, multipart.uploadId, expiresAt, now, now).run();
  return c.json({ id, status: "active", expected_bytes: input.total_bytes, received_bytes: 0, expires_at: expiresAt }, 201);
});

// Hono는 HEAD 요청을 GET 라우트로 보낸다 (본문은 자동으로 비운다)
media.get("/uploads/:id", requireAdmin, async c => {
  const upload = await ownUpload(c);
  return c.body(null, 200, { "Upload-Offset": String(upload.received_bytes), "Upload-Length": String(upload.expected_bytes), "Upload-Status": upload.status });
});

media.patch("/uploads/:id", requireCsrf, async c => {
  const upload = await ownUpload(c);
  if (upload.status !== "active" || upload.expires_at <= nowIso()) throw new HttpError(409, "진행할 수 없는 업로드입니다");
  const offset = Number(c.req.header("Upload-Offset"));
  if (c.req.header("Upload-Offset") === undefined || !Number.isInteger(offset) || offset < 0) throw new HttpError(422, "Upload-Offset 헤더가 필요합니다");
  const current = { "Upload-Offset": String(upload.received_bytes) };
  if (offset !== upload.received_bytes) throw new HttpError(409, "청크 순서가 올바르지 않습니다", current);

  const declared = Number(c.req.header("Content-Length"));
  if (Number.isFinite(declared) && offset + declared > upload.expected_bytes) throw new HttpError(413, "선언한 파일 크기를 초과했습니다");
  const db = c.env.DB;
  const now = nowIso();
  // 같은 위치의 청크가 동시에 들어오면 하나만 처리한다 (60초 뒤 자동으로 풀린다)
  const claim = await db.prepare(
    `UPDATE upload_sessions SET chunk_lock_until = ? WHERE id = ? AND status = 'active' AND received_bytes = ?
       AND (chunk_lock_until IS NULL OR chunk_lock_until < ?)`,
  ).bind(addMs(CHUNK_LOCK_MS), upload.id, offset, now).run();
  if (!claim.meta.changes) throw new HttpError(409, "같은 청크를 이미 처리하고 있습니다", current);
  const release = () => db.prepare("UPDATE upload_sessions SET chunk_lock_until = NULL WHERE id = ?").bind(upload.id).run();
  try {
    const body = new Uint8Array(await c.req.arrayBuffer());
    if (offset + body.byteLength > upload.expected_bytes) throw new HttpError(413, "선언한 파일 크기를 초과했습니다");
    const isLast = offset + body.byteLength === upload.expected_bytes;
    if (!body.byteLength || (!isLast && body.byteLength !== CHUNK_BYTES)) {
      throw new HttpError(422, `청크는 마지막을 빼고 정확히 ${CHUNK_BYTES}바이트여야 합니다`);
    }
    const partNumber = offset / CHUNK_BYTES + 1;
    const part = await bucketOf(c.env, upload.r2_bucket).resumeMultipartUpload(upload.r2_key, upload.r2_upload_id).uploadPart(partNumber, body);
    const received = offset + body.byteLength;
    await db.batch([
      db.prepare("INSERT INTO upload_parts (upload_id, part_number, etag, size) VALUES (?, ?, ?, ?) ON CONFLICT (upload_id, part_number) DO UPDATE SET etag = excluded.etag, size = excluded.size")
        .bind(upload.id, partNumber, part.etag, body.byteLength),
      db.prepare("UPDATE upload_sessions SET received_bytes = ?, chunk_lock_until = NULL, updated_at = ? WHERE id = ?").bind(received, nowIso(), upload.id),
    ]);
    return c.body(null, 204, { "Upload-Offset": String(received) });
  } catch (error) {
    await release();
    throw error;
  }
});

const CompleteIn = z.object({
  width: z.number().int().min(1).max(20000).nullable().optional(),
  height: z.number().int().min(1).max(20000).nullable().optional(),
  duration_ms: z.number().int().min(0).max(24 * 3600_000).nullable().optional(),
});

async function sha256Of(bucket: R2Bucket, key: string) {
  const object = await bucket.get(key);
  if (!object) throw new HttpError(500, "저장된 파일을 읽지 못했습니다");
  const digest = new crypto.DigestStream("SHA-256");
  await object.body.pipeTo(digest);
  return hex(await digest.digest);
}

/** 이미지 파생본을 만든다. 실패하면 미디어와 작업을 실패로 표시하고 오류를 돌려준다. */
export async function runImageJob(env: Env, jobId: string, mediaRow: { id: string; original_key: string }) {
  const db = env.DB;
  try {
    const result = await deriveImage(env, mediaRow);
    const now = nowIso();
    await db.batch([
      db.prepare("UPDATE media_assets SET public_key = ?, width = ?, height = ?, status = 'ready' WHERE id = ?").bind(result.publicKey, result.width, result.height, mediaRow.id),
      db.prepare("UPDATE media_jobs SET status = 'completed', progress = 100, error = NULL, updated_at = ? WHERE id = ?").bind(now, jobId),
    ]);
    return null;
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    const now = nowIso();
    await db.batch([
      db.prepare("UPDATE media_assets SET status = 'failed' WHERE id = ?").bind(mediaRow.id),
      db.prepare("UPDATE media_jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(message, now, jobId),
    ]);
    return message;
  }
}

media.post("/uploads/:id/complete", requireCsrf, async c => {
  const input = await parseJson(c, CompleteIn, { optional: true });
  const upload = await ownUpload(c);
  if (upload.status !== "active") throw new HttpError(409, "이미 종료된 업로드입니다");
  if (upload.received_bytes !== upload.expected_bytes) throw new HttpError(409, "아직 모든 바이트가 업로드되지 않았습니다");
  const db = c.env.DB;
  const bucket = bucketOf(c.env, upload.r2_bucket);
  const fail = async (status: number, detail: string) => {
    await bucket.delete(upload.r2_key);
    await db.prepare("UPDATE upload_sessions SET status = 'failed', updated_at = ? WHERE id = ?").bind(nowIso(), upload.id).run();
    throw new HttpError(status, detail);
  };

  // 멀티파트를 합친다. 앞선 요청이 합치기까지 하고 끊겼다면 이미 있는 객체를 그대로 쓴다
  let size: number;
  try {
    const { results: parts } = await db.prepare("SELECT part_number, etag FROM upload_parts WHERE upload_id = ? ORDER BY part_number").bind(upload.id)
      .all<{ part_number: number; etag: string }>();
    const object = await bucket.resumeMultipartUpload(upload.r2_key, upload.r2_upload_id).complete(parts.map(p => ({ partNumber: p.part_number, etag: p.etag })));
    size = object.size;
  } catch (error) {
    const existing = await bucket.head(upload.r2_key);
    if (!existing) throw error;
    size = existing.size;
  }
  if (size !== upload.expected_bytes) return fail(500, "원본 저장 검증에 실패했습니다");

  const head = await bucket.get(upload.r2_key, { range: { offset: 0, length: 32 } });
  const actual = head ? sniff(new Uint8Array(await head.arrayBuffer())) : null;
  if (!actual) return fail(415, "지원하는 이미지 또는 영상 파일이 아닙니다");
  if (actual !== upload.declared_content_type) return fail(415, "파일 내용이 선택한 형식과 다릅니다");
  const kind = mediaKind(actual);
  const cfg = settings(c.env);
  const sha256 = size <= cfg.sha256MaxBytes ? await sha256Of(bucket, upload.r2_key) : null;
  const now = nowIso();
  const common = [upload.media_id, upload.artwork_id, upload.r2_key, upload.original_filename, kind, actual, size, sha256];

  if (kind === "video") {
    // 영상은 변환 없이 올린 파일을 그대로 재생한다. 크기와 길이는 관리자 브라우저가 측정해 보낸다
    await db.batch([
      db.prepare(
        `INSERT INTO media_assets (id, artwork_id, original_key, original_filename, media_type, content_type, byte_size, sha256,
           backend, public_key, width, height, duration_ms, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'r2-public', ?, ?, ?, ?, 'ready', ?)`,
      ).bind(...common, upload.r2_key, input.width ?? null, input.height ?? null, input.duration_ms ?? null, now),
      db.prepare("UPDATE upload_sessions SET status = 'completed', updated_at = ? WHERE id = ?").bind(now, upload.id),
    ]);
    return c.json({ media_id: upload.media_id, job_id: null, sha256, content_type: actual, byte_size: size });
  }

  const jobId = newId();
  await db.batch([
    db.prepare(
      `INSERT INTO media_assets (id, artwork_id, original_key, original_filename, media_type, content_type, byte_size, sha256, backend, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'r2', 'processing', ?)`,
    ).bind(...common, now),
    db.prepare("INSERT INTO media_jobs (id, media_id, kind, status, attempts, created_at, updated_at) VALUES (?, ?, 'process_image', 'running', 1, ?, ?)")
      .bind(jobId, upload.media_id, now, now),
    db.prepare("UPDATE upload_sessions SET status = 'completed', updated_at = ? WHERE id = ?").bind(now, upload.id),
  ]);
  // 파생본 만들기에 실패해도 원본은 저장된 상태다. 실패 작업은 서버 현황에서 다시 실행할 수 있다
  const error = await runImageJob(c.env, jobId, { id: upload.media_id, original_key: upload.r2_key });
  return c.json({ media_id: upload.media_id, job_id: jobId, sha256, content_type: actual, byte_size: size, job_status: error ? "failed" : "completed", error });
});

media.delete("/uploads/:id", requireCsrf, async c => {
  const upload = await ownUpload(c);
  if (upload.status === "active") {
    await bucketOf(c.env, upload.r2_bucket).resumeMultipartUpload(upload.r2_key, upload.r2_upload_id).abort().catch(() => undefined);
    await c.env.DB.prepare("UPDATE upload_sessions SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(nowIso(), upload.id).run();
  }
  return c.body(null, 204);
});

/** 영상 포스터(목록 카드에 보일 정지 화면). 관리자 브라우저가 영상에서 뽑은 JPEG를 올린다. */
media.put("/:mediaId/admin/poster", requireCsrf, async c => {
  const db = c.env.DB;
  const row = await db.prepare("SELECT id, media_type FROM media_assets WHERE id = ? AND deleted_at IS NULL").bind(c.req.param("mediaId")).first<{ id: string; media_type: string }>();
  if (!row) throw new HttpError(404, "미디어를 찾을 수 없습니다");
  if (row.media_type !== "video") throw new HttpError(409, "영상에만 포스터를 등록할 수 있습니다");
  const body = new Uint8Array(await c.req.arrayBuffer());
  if (body.byteLength > POSTER_MAX_BYTES) throw new HttpError(413, "포스터 이미지는 2MB까지 올릴 수 있습니다");
  if (sniff(body.subarray(0, 32)) !== "image/jpeg") throw new HttpError(415, "포스터는 JPEG 이미지여야 합니다");
  // 공개 파일은 1년 동안 캐시되므로 바꿀 때마다 새 이름으로 저장한다
  const key = `${row.id}/poster-${newId().slice(0, 8)}.jpg`;
  await c.env.MEDIA_PUBLIC.put(key, body, { httpMetadata: { contentType: "image/jpeg" } });
  await db.prepare("UPDATE media_assets SET poster_key = ? WHERE id = ?").bind(key, row.id).run();
  return c.json({ poster_key: key });
});

/** 미디어를 작품에서 뺀다. 파일은 남겨 두고(휴지통) 공개 화면에서만 사라진다. */
media.delete("/:mediaId/admin", requireCsrf, async c => {
  const result = await c.env.DB.prepare("UPDATE media_assets SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL").bind(nowIso(), c.req.param("mediaId")).run();
  if (!result.meta.changes) throw new HttpError(404, "미디어를 찾을 수 없습니다");
  return c.body(null, 204);
});

media.get("/:mediaId/original", requireAdmin, async c => {
  const row = await c.env.DB.prepare("SELECT original_key, original_filename, content_type, backend FROM media_assets WHERE id = ? AND deleted_at IS NULL")
    .bind(c.req.param("mediaId")).first<{ original_key: string; original_filename: string; content_type: string; backend: string }>();
  if (!row) throw new HttpError(404, "원본을 찾을 수 없습니다");
  const bucket = bucketOf(c.env, row.backend);
  const stat = await bucket.head(row.original_key);
  if (!stat) throw new HttpError(404, "원본 파일이 없습니다");
  const size = stat.size;
  let start = 0;
  let end = size - 1;
  const range = c.req.header("Range");
  const invalid = (detail: string) => new HttpError(416, detail, { "Content-Range": `bytes */${size}` });
  if (range) {
    if (!range.startsWith("bytes=") || range.includes(",")) throw invalid("지원하지 않는 Range입니다");
    const [first, last] = range.slice(6).split("-", 2);
    if ((first && !/^\d+$/.test(first)) || (last && !/^\d+$/.test(last)) || (!first && !last)) throw invalid("Range 형식이 올바르지 않습니다");
    start = first ? Number(first) : Math.max(0, size - Number(last));
    end = first && last ? Number(last) : size - 1;
    if (start < 0 || end < start || end >= size) throw invalid("Range가 파일 범위를 벗어났습니다");
  }
  const object = await bucket.get(row.original_key, { range: { offset: start, length: end - start + 1 } });
  if (!object) throw new HttpError(404, "원본 파일이 없습니다");
  const headers: Record<string, string> = {
    "Content-Type": row.content_type, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1),
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.original_filename)}`, "Cache-Control": "private, no-store",
  };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  return new Response(object.body, { status: range ? 206 : 200, headers });
});
