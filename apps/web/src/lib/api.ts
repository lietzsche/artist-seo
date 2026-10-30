export const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";
export const MEDIA_BASE = import.meta.env.VITE_MEDIA_BASE_URL || "/media";

export type Media = { id: string; public_key: string | null; poster_key: string | null; media_type: string; content_type: string; width: number | null; height: number | null; source_is_hdr: boolean; hdr_to_sdr: boolean; status: string; is_primary: boolean };
export type Artwork = { id: string; series_id: string | null; slug: string; title: string; year: number | null; medium: string; dimensions: string; description: string; price_text: string | null; show_price: boolean; sale_status: "available" | "sold" | "unavailable"; is_published: boolean; featured: boolean; created_at: string; updated_at: string; media: Media[] };
export type Series = { id:string; name:string; description:string; sort_order:number };
export type Exhibition = { id:string; slug:string; title:string; venue:string; location:string; start_date:string|null; end_date:string|null; description:string; is_published:boolean; sort_order:number };

export type Profile = { name:string; headline:string; intro:string; bio:string; cv:string; location:string };
export const FALLBACK_NAME = "작가 포트폴리오";

export const SALE_LABEL: Record<Artwork["sale_status"], string> = { available: "판매 가능", sold: "판매 완료", unavailable: "비매품" };
export const mediaUrl = (key: string | null) => (key ? `${MEDIA_BASE}/${key}` : undefined);

/** 목록·썸네일에 쓸 대표 이미지: 대표 지정 → 변환 끝난 첫 미디어 순. 영상이면 포스터를 쓴다. */
export function coverOf(work: Artwork) {
  const ready = work.media.filter(m => m.public_key);
  const media = ready.find(m => m.is_primary) ?? ready[0];
  if (!media) return null;
  const src = media.media_type === "video" ? mediaUrl(media.poster_key) : mediaUrl(media.public_key);
  return src ? { src, width: media.width || 1200, height: media.height || 1500, isVideo: media.media_type === "video" } : null;
}

export const caption = (work: Artwork) => [work.year, work.medium, work.dimensions].filter(Boolean).join(", ");

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "요청을 처리하지 못했습니다.");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

