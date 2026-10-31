export const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";
export const MEDIA_BASE = import.meta.env.VITE_MEDIA_BASE_URL || "/media";

export type Media = { id: string; public_key: string | null; poster_key: string | null; media_type: string; content_type: string; width: number | null; height: number | null; source_is_hdr: boolean; hdr_to_sdr: boolean; status: string; is_primary: boolean };
export type Artwork = { id: string; series_id: string | null; slug: string; title: string; year: number | null; medium: string; dimensions: string; description: string; price_text: string | null; title_en: string; medium_en: string; description_en: string; price_text_en: string | null; show_price: boolean; sale_status: "available" | "sold" | "unavailable"; is_published: boolean; featured: boolean; created_at: string; updated_at: string; media: Media[] };
export type Series = { id:string; name:string; description:string; name_en:string; description_en:string; sort_order:number };
export type Exhibition = { id:string; slug:string; title:string; venue:string; location:string; start_date:string|null; end_date:string|null; description:string; title_en:string; venue_en:string; location_en:string; description_en:string; is_published:boolean; sort_order:number };

export type Profile = { name:string; headline:string; intro:string; bio:string; cv:string; location:string; name_en:string; headline_en:string; intro_en:string; bio_en:string; cv_en:string; location_en:string };
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

export const caption = (work: Artwork, medium = work.medium) => [work.year, medium, work.dimensions].filter(Boolean).join(", ");

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** 로그인 세션이 끊겼을 때(401) 알리는 이벤트. 관리자 화면이 듣고 로그인 화면으로 돌아간다. */
export const AUTH_EXPIRED_EVENT = "auth:expired";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    // /auth/* 자체의 401(로그인 전 상태 확인, 비밀번호 틀림)은 세션 만료가 아니다
    if (response.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    throw new ApiError(body.detail || "요청을 처리하지 못했습니다.", response.status);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

