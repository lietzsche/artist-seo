import type { Env } from "../env";

export const IMAGE_WIDTHS = [800, 1600, 2400];
const OUTPUTS = [
  { ext: "jpg", format: "image/jpeg", quality: 88 },
  { ext: "webp", format: "image/webp", quality: 85 },
] as const;

/**
 * 원본 이미지에서 공개용 파생본(폭 800/1600/2400의 JPEG, WebP)을 만들어 공개 버킷에 저장한다.
 * 업스케일은 하지 않고, 폭이 원본과 같아지면 멈춘다(기존 Pillow 처리와 같은 키 규칙).
 * 화면에 쓸 대표 키는 1600 이하 WebP 가운데 가장 큰 것이다.
 */
export async function deriveImage(env: Env, media: { id: string; original_key: string }) {
  const original = async () => {
    const object = await env.MEDIA_ORIGINALS.get(media.original_key);
    if (!object) throw new Error("원본 파일이 없습니다");
    return object.body;
  };
  const info = await env.IMAGES.info(await original());
  if (!("width" in info) || !info.width) throw new Error("이미지 크기를 읽지 못했습니다");
  let primaryKey = "";
  for (const requested of IMAGE_WIDTHS) {
    const width = Math.min(requested, info.width);
    for (const output of OUTPUTS) {
      const key = `${media.id}/${width}.${output.ext}`;
      if (!(await env.MEDIA_PUBLIC.head(key))) {
        // JPEG는 투명 영역을 흰색으로 채운다. 위치(GPS) 같은 메타데이터는 공개 파일에 남기지 않는다
        const background = output.ext === "jpg" ? { background: "#ffffff" } : {};
        const result = await env.IMAGES.input(await original())
          .transform({ width, fit: "scale-down", ...background })
          .output({ format: output.format, quality: output.quality, ...background });
        const bytes = await new Response(result.image()).arrayBuffer();
        await env.MEDIA_PUBLIC.put(key, bytes, { httpMetadata: { contentType: output.format } });
      }
      if (output.ext === "webp" && (!primaryKey || width <= 1600)) primaryKey = key;
    }
    if (width === info.width) break;
  }
  if (!primaryKey) throw new Error("공개 이미지 파생본을 만들지 못했습니다");
  return { publicKey: primaryKey, width: info.width, height: info.height };
}
