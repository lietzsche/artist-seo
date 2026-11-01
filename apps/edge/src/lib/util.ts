import type { Context } from "hono";
import type { z } from "zod";

/** API 오류. 응답은 항상 { detail: "메시지" } 한 가지 형식이다. */
export class HttpError extends Error {
  constructor(readonly status: number, readonly detail: string, readonly headers: Record<string, string> = {}) {
    super(detail);
  }
}

export const nowIso = () => new Date().toISOString();
export const addMs = (ms: number) => new Date(Date.now() + ms).toISOString();
export const newId = () => crypto.randomUUID();

export function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 방문자 IP. Cloudflare가 붙여 주는 헤더라 위조할 수 없다. */
export const clientIp = (c: Context) => c.req.header("CF-Connecting-IP") || "unknown";

const FIELD_NAMES: Record<string, string> = {
  email: "이메일", password: "비밀번호", slug: "주소(slug)", title: "제목", name: "이름", message: "내용", year: "연도",
  website: "website", status: "상태", sort_order: "정렬 순서", filename: "파일 이름", total_bytes: "파일 크기",
};

/** JSON 본문을 읽고 검증한다. 실패하면 422와 한국어 메시지 한 줄. */
export async function parseJson<T extends z.ZodType>(c: Context, schema: T, { optional = false } = {}): Promise<z.infer<T>> {
  let body: unknown = {};
  const text = await c.req.text();
  if (text.trim()) {
    try { body = JSON.parse(text); } catch { throw new HttpError(422, "요청 본문이 올바른 JSON이 아닙니다"); }
  } else if (!optional) {
    throw new HttpError(422, "요청 본문이 비어 있습니다");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.map(String).join(".") || "";
    const label = FIELD_NAMES[field] || field;
    throw new HttpError(422, issue?.message?.startsWith("@") ? issue.message.slice(1) : `${label ? `${label}: ` : ""}입력값이 올바르지 않습니다`);
  }
  return result.data;
}

export const bool = (value: unknown) => value === 1 || value === true;
export const flag = (value: boolean | undefined) => (value ? 1 : 0);

export function isUniqueError(error: unknown) {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}
