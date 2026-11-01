import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import worker from "../src/index";

export const ORIGIN = "http://localhost";
export const PASSWORD = "very-safe-password";

/** Images 바인딩 대역. 로컬에서는 실제 변환을 할 수 없어서 크기만 흉내 낸다. */
export const images = {
  width: 3000,
  height: 2000,
  fail: false,
  transforms: [] as { width?: number; format: string }[],
};

async function drain(stream: ReadableStream) {
  await new Response(stream).arrayBuffer();
}

const imagesStub = {
  async info(stream: ReadableStream) {
    await drain(stream);
    if (images.fail) throw new Error("이미지를 읽지 못했습니다 (테스트)");
    return { format: "image/jpeg", fileSize: 1, width: images.width, height: images.height };
  },
  input(stream: ReadableStream) {
    let width: number | undefined;
    const transformer = {
      transform(t: { width?: number }) { width = t.width; return transformer; },
      async output(o: { format: string }) {
        await drain(stream);
        images.transforms.push({ width, format: o.format });
        const bytes = new TextEncoder().encode(`derived-${width}-${o.format}`);
        return { image: () => new Response(bytes).body!, contentType: () => o.format, response: () => new Response(bytes) };
      },
    };
    return transformer;
  },
} as unknown as ImagesBinding;

export const testEnv = new Proxy(env, { get: (target, key) => (key === "IMAGES" ? imagesStub : Reflect.get(target, key)) });

const TABLES = ["upload_parts", "upload_sessions", "media_jobs", "media_assets", "inquiries", "artworks", "series", "exhibitions", "admin_sessions", "login_attempts", "admins", "artist_profile"];

export async function resetAll() {
  await env.DB.batch(TABLES.map(t => env.DB.prepare(`DELETE FROM ${t}`)));
  for (const bucket of [env.MEDIA_ORIGINALS, env.MEDIA_PUBLIC]) {
    const listed = await bucket.list();
    if (listed.objects.length) await bucket.delete(listed.objects.map(o => o.key));
  }
  Object.assign(images, { width: 3000, height: 2000, fail: false, transforms: [] });
}

/** 쿠키를 기억하는 간단한 클라이언트 */
export class Client {
  cookie = "";
  csrf = "";

  async fetch(path: string, init: RequestInit & { json?: unknown } = {}) {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("Cookie", this.cookie);
    let body = init.body;
    if (init.json !== undefined) { headers.set("Content-Type", "application/json"); body = JSON.stringify(init.json); }
    const ctx = createExecutionContext();
    const response = await worker.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers, body }) as Request<unknown, IncomingRequestCfProperties>, testEnv, ctx);
    await waitOnExecutionContext(ctx);
    const setCookie = response.headers.get("Set-Cookie");
    if (setCookie) {
      const [pair] = setCookie.split(";");
      this.cookie = pair.endsWith("=") ? "" : pair;
    }
    return response;
  }

  get = (path: string, headers?: HeadersInit) => this.fetch(path, { headers });
  send = (method: string, path: string, json?: unknown, csrf = true) =>
    this.fetch(path, { method, json, headers: csrf && this.csrf ? { "X-CSRF-Token": this.csrf } : {} });

  async setup(email = "owner@example.com", extra: Record<string, unknown> = {}) {
    const response = await this.send("POST", "/api/v1/auth/setup", { email, password: PASSWORD, ...extra }, false);
    this.csrf = ((await response.clone().json()) as { csrf_token: string }).csrf_token;
    return response;
  }

  async login(email = "owner@example.com", password = PASSWORD) {
    const response = await this.send("POST", "/api/v1/auth/login", { email, password }, false);
    if (response.ok) this.csrf = ((await response.clone().json()) as { csrf_token: string }).csrf_token;
    return response;
  }
}

export const json = async <T = any>(response: Response) => (await response.json()) as T;

export async function createArtwork(client: Client, extra: Record<string, unknown> = {}) {
  const response = await client.send("POST", "/api/v1/artworks/admin", { slug: `work-${crypto.randomUUID().slice(0, 8)}`, title: "작품", ...extra });
  return json<{ id: string; slug: string }>(response);
}

/** 앞부분이 JPEG 서명인 임의 바이트 */
export function fakeJpeg(size: number) {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 4096) bytes[i] = (i / 4096) % 251;
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return bytes;
}

export function fakeMp4(size: number) {
  const bytes = new Uint8Array(size);
  bytes.set([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom")], 0);
  return bytes;
}

export const CHUNK = 5 * 1024 * 1024;

/** 업로드 시작부터 청크 전송까지 */
export async function uploadFile(client: Client, artworkId: string, bytes: Uint8Array, filename: string, contentType: string) {
  const started = await client.send("POST", "/api/v1/media/uploads", { artwork_id: artworkId, filename, content_type: contentType, total_bytes: bytes.byteLength });
  if (started.status !== 201) return { started, id: "" };
  const { id } = await json<{ id: string }>(started);
  for (let offset = 0; offset < bytes.byteLength; offset += CHUNK) {
    const response = await client.fetch(`/api/v1/media/uploads/${id}`, {
      method: "PATCH", body: bytes.slice(offset, offset + CHUNK), headers: { "X-CSRF-Token": client.csrf, "Upload-Offset": String(offset) },
    });
    if (response.status !== 204) throw new Error(`chunk failed ${response.status} ${await response.text()}`);
  }
  return { started, id };
}
