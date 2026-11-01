import type { Context } from "hono";
import type { AppEnv } from "../env";

const NOT_FOUND = () => new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/**
 * GET|HEAD /media/{key}: 공개 버킷의 파일을 그대로 내보낸다 (이미지 파생본, 영상 재생 파일, 포스터).
 * 영상 탐색(Range)과 조건부 요청(If-None-Match)을 처리한다. 파일 이름이 내용마다 달라 1년 캐시한다.
 */
export async function publicMedia(c: Context<AppEnv>) {
  const key = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\/media\//, ""));
  if (!key || key.startsWith("/") || key.split("/").some(part => part === ".." || part === ".")) return NOT_FOUND();
  const bucket = c.env.MEDIA_PUBLIC;
  const headers = new Headers({ "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=31536000, immutable" });

  if (c.req.method === "HEAD") {
    const object = await bucket.head(key);
    if (!object) return NOT_FOUND();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("Content-Length", String(object.size));
    return new Response(null, { headers });
  }

  const object = await bucket.get(key, { range: c.req.raw.headers, onlyIf: c.req.raw.headers });
  if (!object) return NOT_FOUND();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  if (!("body" in object)) return new Response(null, { status: 304, headers }); // 조건이 맞아 본문이 필요 없음

  const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (range && c.req.header("Range")) {
    const start = range.suffix !== undefined ? object.size - range.suffix : (range.offset ?? 0);
    const length = range.suffix !== undefined ? range.suffix : (range.length ?? object.size - start);
    headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}
