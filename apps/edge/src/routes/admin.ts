import { Hono } from "hono";
import { settings, type AppEnv } from "../env";
import { requireAdmin, requireCsrf } from "../lib/session";
import { HttpError, nowIso } from "../lib/util";
import { runImageJob, storageUsage } from "./media";

export const admin = new Hono<AppEnv>();

admin.get("/overview", requireAdmin, async c => {
  const cfg = settings(c.env);
  const db = c.env.DB;
  const usage = await storageUsage(db);
  const [jobs, inquiries] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT id, media_id, kind, attempts, max_attempts, error, updated_at FROM media_jobs WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 10"),
    db.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE deleted_at IS NULL AND status = 'new'"),
  ]);
  return c.json({
    storage: { stored_bytes: usage.stored, reserved_bytes: usage.reserved, max_total_bytes: cfg.maxTotalBytes, max_file_bytes: cfg.maxFileBytes, max_image_bytes: cfg.maxImageBytes },
    new_inquiries: Number(inquiries.results[0]?.n ?? 0),
    failed_jobs: jobs.results,
  });
});

/** 실패한 이미지 작업을 그 자리에서 다시 실행한다. */
admin.post("/jobs/:id/retry", requireCsrf, async c => {
  const db = c.env.DB;
  const job = await db.prepare("SELECT id, media_id, status FROM media_jobs WHERE id = ?").bind(c.req.param("id")).first<{ id: string; media_id: string; status: string }>();
  if (!job) throw new HttpError(404, "작업을 찾을 수 없습니다");
  if (job.status !== "failed" && job.status !== "queued") throw new HttpError(409, "현재 상태에서는 재시도할 수 없습니다");
  const row = await db.prepare("SELECT id, original_key FROM media_assets WHERE id = ? AND deleted_at IS NULL").bind(job.media_id).first<{ id: string; original_key: string }>();
  if (!row) throw new HttpError(409, "대상 미디어가 삭제되었거나 없습니다");
  // 동시에 두 번 눌러도 한 번만 실행되게 상태를 먼저 바꾼다
  const claim = await db.prepare("UPDATE media_jobs SET status = 'running', attempts = 1, error = NULL, progress = 0, updated_at = ? WHERE id = ? AND status IN ('failed', 'queued')")
    .bind(nowIso(), job.id).run();
  if (!claim.meta.changes) throw new HttpError(409, "현재 상태에서는 재시도할 수 없습니다");
  await db.prepare("UPDATE media_assets SET status = 'processing' WHERE id = ?").bind(row.id).run();
  const error = await runImageJob(c.env, job.id, row);
  return c.json({ status: error ? "failed" : "completed", error });
});
