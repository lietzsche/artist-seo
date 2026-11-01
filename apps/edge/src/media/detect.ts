export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const ALLOWED_TYPES: readonly string[] = [...IMAGE_TYPES, ...VIDEO_TYPES];

export const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm",
};

const BY_NAME: [RegExp, string][] = [[/\.jpe?g$/i, "image/jpeg"], [/\.png$/i, "image/png"], [/\.webp$/i, "image/webp"], [/\.mp4$/i, "video/mp4"], [/\.webm$/i, "video/webm"]];

/** 브라우저가 형식을 비워 보내는 경우(일부 안드로이드)에는 파일 이름으로 정한다. */
export function declaredType(contentType: string, filename: string) {
  const type = contentType.toLowerCase().split(";")[0].trim();
  if (type === "image/jpg") return "image/jpeg";
  if (type && type !== "application/octet-stream") return type;
  return BY_NAME.find(([pattern]) => pattern.test(filename))?.[1] ?? type;
}

export const mediaKind = (type: string) => (type.startsWith("video/") ? "video" : "image");

/** 파일 앞부분 바이트로 실제 형식을 확인한다. 모르는 형식이면 null. */
export function sniff(head: Uint8Array): string | null {
  const at = (offset: number, ...bytes: number[]) => bytes.every((b, i) => head[offset + i] === b);
  const ascii = (offset: number, text: string) => at(offset, ...Array.from(text, ch => ch.charCodeAt(0)));
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "video/webm";
  // MP4: 4~7바이트가 ftyp. 애플 QuickTime(MOV, 브랜드 "qt  ")은 브라우저마다 재생이 달라 받지 않는다
  if (ascii(4, "ftyp") && !ascii(8, "qt  ")) return "video/mp4";
  return null;
}
