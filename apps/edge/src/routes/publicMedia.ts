import type { Context } from "hono";
import type { AppEnv } from "../env";

const NOT_FOUND = () => new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// Cloudflare 캐시 한 항목의 최대 크기(512MB)보다 큰 파일은 캐시하지 않고 매번 R2에서 보낸다
const CACHE_MAX_BYTES = 500 * 1024 * 1024;

/**
 * GET|HEAD /media/{key}: 공개 버킷의 파일을 그대로 내보낸다 (이미지 파생본, 영상 재생 파일, 포스터).
 * 영상 탐색(Range)과 조건부 요청(If-None-Match)을 처리한다. 파일 이름이 내용마다 달라 1년 캐시한다.
 *
 * Worker 응답은 Cloudflare가 저절로 캐시하지 않으므로, 한 번 보낸 파일은 Cache API로 그 데이터센터에 저장해 둔다.
 * 다음 요청부터는 R2와 Worker 스트리밍을 거치지 않고 캐시가 바로 응답한다(Range·If-None-Match도 캐시가 처리).
 */
export async function publicMedia(c: Context<AppEnv>) {
  const url = new URL(c.req.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/media\//, ""));
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

  // 캐시 키는 주소만 쓴다 (쿼리·쿠키 등은 무시). 조회할 때만 Range와 조건부 헤더를 붙인다
  const cacheKey = `${url.origin}${url.pathname}`;
  const cache = caches.default;
  const lookup = new Headers();
  for (const name of ["Range", "If-None-Match", "If-Modified-Since"]) {
    const value = c.req.header(name);
    if (value) lookup.set(name, value);
  }
  const cached = await cache.match(new Request(cacheKey, { headers: lookup }));
  if (cached) {
    const hit = new Response(cached.body, cached);
    hit.headers.set("X-Media-Cache", "hit");
    return hit;
  }

  const object = await bucket.get(key, { range: c.req.raw.headers, onlyIf: c.req.raw.headers });
  if (!object) return NOT_FOUND();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("X-Media-Cache", "miss");
  if (!("body" in object)) return new Response(null, { status: 304, headers }); // 조건이 맞아 본문이 필요 없음

  const cacheable = object.size <= CACHE_MAX_BYTES;
  const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (range && c.req.header("Range")) {
    const start = range.suffix !== undefined ? object.size - range.suffix : (range.offset ?? 0);
    const length = range.suffix !== undefined ? range.suffix : (range.length ?? object.size - start);
    headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    // 영상은 처음부터 Range로 요청되므로, 요청한 부분을 보내는 동안 파일 전체를 따로 읽어 캐시를 채운다
    if (cacheable) c.executionCtx.waitUntil(fillCache(cache, cacheKey, bucket, key));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("Content-Length", String(object.size));
  const response = new Response(object.body, { headers });
  if (!cacheable) return response;
  c.executionCtx.waitUntil(cache.put(cacheKey, withoutMarker(response.clone())));
  return response;
}

/** 파일 전체를 R2에서 읽어 캐시에 넣는다. 실패해도 방문자 응답에는 영향이 없다 */
async function fillCache(cache: Cache, cacheKey: string, bucket: R2Bucket, key: string) {
  try {
    const full = await bucket.get(key);
    if (!full) return;
    const headers = new Headers({ "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=31536000, immutable" });
    full.writeHttpMetadata(headers);
    headers.set("ETag", full.httpEtag);
    headers.set("Content-Length", String(full.size));
    await cache.put(cacheKey, new Response(full.body, { headers }));
  } catch (error) {
    console.error("미디어 캐시 저장 실패", key, error);
  }
}

/** 캐시에는 hit/miss 표시 없이 저장한다 (꺼낼 때 hit을 붙인다) */
function withoutMarker(response: Response) {
  const copy = new Response(response.body, response);
  copy.headers.delete("X-Media-Cache");
  return copy;
}
