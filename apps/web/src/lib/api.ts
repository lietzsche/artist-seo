export const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";
export const MEDIA_BASE = import.meta.env.VITE_MEDIA_BASE_URL || "/media";

export type Media = { id: string; public_key: string | null; media_type: string; content_type: string; width: number | null; height: number | null; status: string; is_primary: boolean };
export type Artwork = { id: string; slug: string; title: string; year: number | null; medium: string; dimensions: string; description: string; price_text: string | null; show_price: boolean; sale_status: "available" | "sold" | "unavailable"; is_published: boolean; featured: boolean; media: Media[] };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "요청을 처리하지 못했습니다.");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

