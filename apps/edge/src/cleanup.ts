import type { Env } from "./env";
import { bucketOf } from "./routes/media";
import { nowIso } from "./lib/util";

/** 매일 한 번(Cron): 만료된 업로드를 취소하고 끝난 세션과 오래된 로그인 기록을 지운다. */
export async function cleanup(env: Env) {
  const db = env.DB;
  const now = nowIso();
  const { results: expired } = await db.prepare("SELECT id, r2_bucket, r2_key, r2_upload_id FROM upload_sessions WHERE status = 'active' AND expires_at <= ? LIMIT 200")
    .bind(now).all<{ id: string; r2_bucket: string; r2_key: string; r2_upload_id: string }>();
  for (const upload of expired) {
    await bucketOf(env, upload.r2_bucket).resumeMultipartUpload(upload.r2_key, upload.r2_upload_id).abort().catch(() => undefined);
    await db.prepare("UPDATE upload_sessions SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(now, upload.id).run();
  }
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM upload_parts WHERE upload_id IN (SELECT id FROM upload_sessions WHERE status != 'active')"),
    db.prepare("DELETE FROM admin_sessions WHERE expires_at < ? OR revoked_at < ?").bind(dayAgo, dayAgo),
    db.prepare("DELETE FROM login_attempts WHERE updated_at < ? AND (locked_until IS NULL OR locked_until < ?)").bind(dayAgo, now),
  ]);
  return { cancelled_uploads: expired.length };
}
