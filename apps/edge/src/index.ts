import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { HttpError } from "./lib/util";
import { admin } from "./routes/admin";
import { auth } from "./routes/auth";
import { artworks, exhibitions, series } from "./routes/content";
import { inquiries } from "./routes/inquiries";
import { media } from "./routes/media";
import { health, manifest, profile } from "./routes/public";
import { publicMedia } from "./routes/publicMedia";
import { cleanup } from "./cleanup";

// 이 Worker는 /api/*, /media/* 요청만 받는다. 나머지 경로는 Static Assets(웹 화면)가 바로 응답한다 (wrangler.jsonc의 run_worker_first).
const app = new Hono<AppEnv>();

const api = new Hono<AppEnv>();
api.route("/health", health);
api.route("/auth", auth);
api.route("/profile", profile);
api.get("/manifest.webmanifest", manifest);
api.route("/artworks", artworks);
api.route("/series", series);
api.route("/exhibitions", exhibitions);
api.route("/inquiries", inquiries);
api.route("/media", media);
api.route("/admin", admin);
api.notFound(c => c.json({ detail: "Not Found" }, 404));

app.route("/api/v1", api);
app.on(["GET", "HEAD"], "/media/*", publicMedia);
app.notFound(c => (c.req.path.startsWith("/api/") ? c.json({ detail: "Not Found" }, 404) : c.env.ASSETS.fetch(c.req.raw)));

app.onError((error, c) => {
  if (error instanceof HttpError) return c.json({ detail: error.detail }, error.status as 400, error.headers);
  console.error(error);
  return c.json({ detail: "서버 오류가 발생했습니다" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanup(env));
  },
} satisfies ExportedHandler<Env>;
