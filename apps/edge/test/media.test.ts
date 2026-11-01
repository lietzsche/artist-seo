import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup } from "../src/cleanup";
import { sniff } from "../src/media/detect";
import { CHUNK, Client, createArtwork, fakeJpeg, fakeMp4, images, json, resetAll, uploadFile } from "./helpers";

beforeEach(resetAll);

async function sha256(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
}

async function admin() {
  const client = new Client();
  await client.setup();
  const work = await createArtwork(client, { slug: "upload-work", is_published: true });
  return { client, work };
}

describe("업로드", () => {
  it("청크 이어받기, 완료, 이미지 파생본, 원본 Range 다운로드", async () => {
    const { client, work } = await admin();
    const content = fakeJpeg(CHUNK + 1000);
    const started = await client.send("POST", "/api/v1/media/uploads", { artwork_id: work.id, filename: "원본 사진.jpg", content_type: "image/jpeg", total_bytes: content.byteLength });
    expect(started.status).toBe(201);
    const { id } = await json(started);
    const patch = (offset: number, body: Uint8Array) =>
      client.fetch(`/api/v1/media/uploads/${id}`, { method: "PATCH", body, headers: { "X-CSRF-Token": client.csrf, "Upload-Offset": String(offset) } });

    expect((await patch(0, content.slice(0, 1000))).status).toBe(422); // 마지막이 아닌 청크는 정확히 5MiB
    const first = await patch(0, content.slice(0, CHUNK));
    expect(first.status).toBe(204);
    expect(first.headers.get("Upload-Offset")).toBe(String(CHUNK));
    const head = await client.fetch(`/api/v1/media/uploads/${id}`, { method: "HEAD" });
    expect(head.headers.get("Upload-Offset")).toBe(String(CHUNK));
    const wrong = await patch(0, content.slice(CHUNK));
    expect(wrong.status).toBe(409);
    expect(wrong.headers.get("Upload-Offset")).toBe(String(CHUNK));
    expect((await client.send("POST", `/api/v1/media/uploads/${id}/complete`)).status).toBe(409); // 아직 덜 받음
    expect((await patch(CHUNK, content.slice(CHUNK))).status).toBe(204);

    const completed = await client.send("POST", `/api/v1/media/uploads/${id}/complete`);
    expect(completed.status).toBe(200);
    const result = await json(completed);
    expect(result.sha256).toBe(await sha256(content));
    expect(result.job_status).toBe("completed");
    expect(result.byte_size).toBe(content.byteLength);

    // 원본 3000px → 800, 1600, 2400 × (jpg, webp)
    const keys = (await env.MEDIA_PUBLIC.list()).objects.map(o => o.key).sort();
    expect(keys).toEqual([800, 1600, 2400].flatMap(w => [`${result.media_id}/${w}.jpg`, `${result.media_id}/${w}.webp`]).sort());
    const detail = await json(await client.get("/api/v1/artworks/upload-work"));
    expect(detail.media[0]).toMatchObject({ id: result.media_id, public_key: `${result.media_id}/1600.webp`, status: "ready", width: 3000, height: 2000, is_primary: false });

    // 공개 파일
    const served = await client.get(`/media/${result.media_id}/1600.webp`);
    expect(served.status).toBe(200);
    expect(served.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(served.headers.get("Content-Type")).toBe("image/webp");
    expect(await served.text()).toBe("derived-1600-image/webp");
    const etag = served.headers.get("ETag")!;
    expect((await client.get(`/media/${result.media_id}/1600.webp`, { "If-None-Match": etag })).status).toBe(304);
    expect((await client.get("/media/x%2F..%2F..%2Fsecret")).status).toBe(404); // 인코딩된 경로 조작
    expect((await client.get("/media/nothing/here.webp")).status).toBe(404);

    // 원본은 관리자만, Range 지원
    expect((await new Client().get(`/api/v1/media/${result.media_id}/original`)).status).toBe(401);
    const ranged = await client.get(`/api/v1/media/${result.media_id}/original`, { Range: "bytes=2-11" });
    expect(ranged.status).toBe(206);
    expect(new Uint8Array(await ranged.arrayBuffer())).toEqual(content.slice(2, 12));
    expect(ranged.headers.get("Cache-Control")).toBe("private, no-store");
    expect(ranged.headers.get("Content-Range")).toBe(`bytes 2-11/${content.byteLength}`);
    expect(ranged.headers.get("Content-Disposition")).toContain(encodeURIComponent("원본 사진.jpg"));
    expect((await client.get(`/api/v1/media/${result.media_id}/original`, { Range: `bytes=${content.byteLength}-` })).status).toBe(416);
    expect((await client.get(`/api/v1/media/${result.media_id}/original`)).status).toBe(200);
  });

  it("작은 이미지는 원본 폭에서 멈춘다", async () => {
    const { client, work } = await admin();
    images.width = 1200;
    const { id } = await uploadFile(client, work.id, fakeJpeg(2000), "small.jpg", "image/jpeg");
    const result = await json(await client.send("POST", `/api/v1/media/uploads/${id}/complete`));
    const keys = (await env.MEDIA_PUBLIC.list()).objects.map(o => o.key).sort();
    expect(keys).toEqual([`${result.media_id}/1200.jpg`, `${result.media_id}/1200.webp`, `${result.media_id}/800.jpg`, `${result.media_id}/800.webp`]);
    expect((await json(await client.get("/api/v1/artworks/upload-work"))).media[0].public_key).toBe(`${result.media_id}/1200.webp`);
  });

  it("형식 제한: 허용 형식, 20MB 이미지 한도, 내용 불일치", async () => {
    const { client, work } = await admin();
    const start = (content_type: string, total_bytes: number, filename = "a.bin") =>
      client.send("POST", "/api/v1/media/uploads", { artwork_id: work.id, filename, content_type, total_bytes });
    expect((await start("video/quicktime", 100, "a.mov")).status).toBe(415);
    expect((await start("image/heic", 100, "a.heic")).status).toBe(415);
    expect((await start("image/jpeg", 20 * 1024 * 1024 + 1)).status).toBe(413);
    expect((await start("application/octet-stream", 100, "photo.JPG")).status).toBe(201); // 형식이 비면 파일 이름으로 판단

    const { id } = await uploadFile(client, work.id, fakeMp4(3000), "fake.jpg", "image/jpeg");
    const mismatch = await client.send("POST", `/api/v1/media/uploads/${id}/complete`);
    expect(mismatch.status).toBe(415);
    expect((await env.MEDIA_ORIGINALS.list()).objects).toEqual([]);
  });

  it("전체 용량을 넘으면 507", async () => {
    const { client, work } = await admin();
    const response = await client.send("POST", "/api/v1/media/uploads", { artwork_id: work.id, filename: "v.mp4", content_type: "video/mp4", total_bytes: 200 * 1024 * 1024 });
    expect(response.status).toBe(507);
  });

  it("영상은 변환 없이 공개 버킷에 저장하고 포스터를 따로 받는다", async () => {
    const { client, work } = await admin();
    const content = fakeMp4(CHUNK * 2 + 10);
    const { id } = await uploadFile(client, work.id, content, "clip.mp4", "video/mp4");
    const completed = await client.send("POST", `/api/v1/media/uploads/${id}/complete`, { width: 1920, height: 1080, duration_ms: 12000 });
    expect(completed.status).toBe(200);
    const result = await json(completed);
    expect(result.job_id).toBeNull();
    let media = (await json(await client.get("/api/v1/artworks/upload-work"))).media[0];
    expect(media).toMatchObject({ public_key: `${result.media_id}/playback.mp4`, poster_key: null, status: "ready", width: 1920, height: 1080, media_type: "video" });

    // 재생: Range로 탐색
    const part = await client.get(`/media/${result.media_id}/playback.mp4`, { Range: "bytes=4-11" });
    expect(part.status).toBe(206);
    expect(part.headers.get("Content-Range")).toBe(`bytes 4-11/${content.byteLength}`);
    expect(await part.text()).toBe("ftypisom");
    const suffix = await client.get(`/media/${result.media_id}/playback.mp4`, { Range: "bytes=-10" });
    expect(suffix.headers.get("Content-Range")).toBe(`bytes ${content.byteLength - 10}-${content.byteLength - 1}/${content.byteLength}`);
    const headOnly = await client.fetch(`/media/${result.media_id}/playback.mp4`, { method: "HEAD" });
    expect(headOnly.headers.get("Content-Length")).toBe(String(content.byteLength));

    const poster = (body: Uint8Array) => client.fetch(`/api/v1/media/${result.media_id}/admin/poster`, { method: "PUT", body, headers: { "X-CSRF-Token": client.csrf, "Content-Type": "image/jpeg" } });
    expect((await poster(fakeMp4(100))).status).toBe(415);
    expect((await poster(fakeJpeg(3 * 1024 * 1024))).status).toBe(413);
    const saved = await poster(fakeJpeg(5000));
    expect(saved.status).toBe(200);
    media = (await json(await client.get("/api/v1/artworks/upload-work"))).media[0];
    expect(media.poster_key).toBe((await json(saved)).poster_key);
    expect((await client.get(`/media/${media.poster_key}`)).status).toBe(200);
  });

  it("업로드 취소, 다른 관리자 세션의 업로드는 보이지 않음", async () => {
    const { client, work } = await admin();
    const started = await json(await client.send("POST", "/api/v1/media/uploads", { artwork_id: work.id, filename: "a.jpg", content_type: "image/jpeg", total_bytes: 100 }));
    expect((await client.send("DELETE", `/api/v1/media/uploads/${started.id}`)).status).toBe(204);
    const head = await client.fetch(`/api/v1/media/uploads/${started.id}`, { method: "HEAD" });
    expect(head.headers.get("Upload-Status")).toBe("cancelled");
    const patch = await client.fetch(`/api/v1/media/uploads/${started.id}`, { method: "PATCH", body: fakeJpeg(100), headers: { "X-CSRF-Token": client.csrf, "Upload-Offset": "0" } });
    expect(patch.status).toBe(409);
  });

  it("같은 위치의 청크가 동시에 오면 하나만 처리한다", async () => {
    const { client, work } = await admin();
    const content = fakeJpeg(CHUNK + 10);
    const { id } = await json(await client.send("POST", "/api/v1/media/uploads", { artwork_id: work.id, filename: "a.jpg", content_type: "image/jpeg", total_bytes: content.byteLength }));
    await env.DB.prepare("UPDATE upload_sessions SET chunk_lock_until = ? WHERE id = ?").bind(new Date(Date.now() + 30_000).toISOString(), id).run();
    const busy = await client.fetch(`/api/v1/media/uploads/${id}`, { method: "PATCH", body: content.slice(0, CHUNK), headers: { "X-CSRF-Token": client.csrf, "Upload-Offset": "0" } });
    expect(busy.status).toBe(409);
    expect(busy.headers.get("Upload-Offset")).toBe("0");
    await env.DB.prepare("UPDATE upload_sessions SET chunk_lock_until = ? WHERE id = ?").bind(new Date(Date.now() - 1000).toISOString(), id).run();
    const ok = await client.fetch(`/api/v1/media/uploads/${id}`, { method: "PATCH", body: content.slice(0, CHUNK), headers: { "X-CSRF-Token": client.csrf, "Upload-Offset": "0" } });
    expect(ok.status).toBe(204);
  });

  it("미디어 삭제는 공개 화면에서 뺀다", async () => {
    const { client, work } = await admin();
    const { id } = await uploadFile(client, work.id, fakeJpeg(500), "a.jpg", "image/jpeg");
    const { media_id } = await json(await client.send("POST", `/api/v1/media/uploads/${id}/complete`));
    expect((await client.send("DELETE", `/api/v1/media/${media_id}/admin`, undefined, false)).status).toBe(403);
    expect((await client.send("DELETE", `/api/v1/media/${media_id}/admin`)).status).toBe(204);
    expect((await json(await client.get("/api/v1/artworks/upload-work"))).media).toEqual([]);
  });
});

describe("서버 현황", () => {
  it("저장 용량, 실패 작업과 재시도", async () => {
    const { client, work } = await admin();
    images.fail = true;
    const content = fakeJpeg(1234);
    const { id } = await uploadFile(client, work.id, content, "a.jpg", "image/jpeg");
    const result = await json(await client.send("POST", `/api/v1/media/uploads/${id}/complete`));
    expect(result.job_status).toBe("failed");
    expect((await new Client().get("/api/v1/admin/overview")).status).toBe(401);
    const overview = await json(await client.get("/api/v1/admin/overview"));
    expect(overview.storage.stored_bytes).toBe(1234);
    expect(overview.storage).not.toHaveProperty("disk_free_bytes");
    expect(overview.failed_jobs[0].id).toBe(result.job_id);
    expect(overview.failed_jobs[0].error).toContain("테스트");

    expect((await client.send("POST", `/api/v1/admin/jobs/${result.job_id}/retry`, undefined, false)).status).toBe(403);
    images.fail = false;
    expect(await json(await client.send("POST", `/api/v1/admin/jobs/${result.job_id}/retry`))).toEqual({ status: "completed", error: null });
    expect((await json(await client.get("/api/v1/admin/overview"))).failed_jobs).toEqual([]);
    expect((await json(await client.get("/api/v1/artworks/upload-work"))).media[0].status).toBe("ready");
    expect((await client.send("POST", `/api/v1/admin/jobs/${result.job_id}/retry`)).status).toBe(409);
  });

  it("정리 작업: 만료된 업로드 취소, 지난 세션 삭제", async () => {
    const { client, work } = await admin();
    const started = await json(await client.send("POST", "/api/v1/media/uploads", { artwork_id: work.id, filename: "a.jpg", content_type: "image/jpeg", total_bytes: 100 }));
    await env.DB.prepare("UPDATE upload_sessions SET expires_at = ?").bind(new Date(Date.now() - 1000).toISOString()).run();
    await env.DB.prepare("UPDATE admin_sessions SET expires_at = ?").bind(new Date(Date.now() - 2 * 86400_000).toISOString()).run();
    expect(await cleanup(env)).toEqual({ cancelled_uploads: 1 });
    expect((await env.DB.prepare("SELECT status FROM upload_sessions WHERE id = ?").bind(started.id).first())?.status).toBe("cancelled");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_sessions").first())?.n).toBe(0);
  });
});

describe("형식 판별", () => {
  it("파일 앞부분 바이트", () => {
    const bytes = (...values: (number | string)[]) => new Uint8Array(values.flatMap(v => (typeof v === "string" ? Array.from(v, ch => ch.charCodeAt(0)) : [v])));
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xdb))).toBe("image/jpeg");
    expect(sniff(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniff(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
    expect(sniff(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("video/webm");
    expect(sniff(bytes(0, 0, 0, 0x18, "ftypmp42"))).toBe("video/mp4");
    expect(sniff(bytes(0, 0, 0, 0x14, "ftypqt  "))).toBeNull();
    expect(sniff(bytes("GIF89a"))).toBeNull();
  });
});
