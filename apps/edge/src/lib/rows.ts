import { bool } from "./util";

// D1은 불리언을 0/1로 돌려준다. API 응답은 기존 FastAPI와 같은 JSON 모양으로 바꿔 내보낸다.

type Row = Record<string, unknown>;

export const MEDIA_COLUMNS = "id, artwork_id, public_key, poster_key, media_type, content_type, width, height, source_is_hdr, hdr_to_sdr, status, is_primary";

export function mediaOut(row: Row) {
  return {
    id: row.id, public_key: row.public_key ?? null, poster_key: row.poster_key ?? null, media_type: row.media_type, content_type: row.content_type,
    width: row.width ?? null, height: row.height ?? null, source_is_hdr: bool(row.source_is_hdr), hdr_to_sdr: bool(row.hdr_to_sdr),
    status: row.status, is_primary: bool(row.is_primary),
  };
}

export function artworkOut(row: Row, media: Row[] = []) {
  return {
    id: row.id, series_id: row.series_id ?? null, slug: row.slug, title: row.title, year: row.year ?? null, medium: row.medium, dimensions: row.dimensions,
    description: row.description, price_text: row.price_text ?? null, title_en: row.title_en, medium_en: row.medium_en, description_en: row.description_en,
    price_text_en: row.price_text_en ?? null, show_price: bool(row.show_price), sale_status: row.sale_status, is_published: bool(row.is_published),
    featured: bool(row.featured), created_at: row.created_at, updated_at: row.updated_at, media: media.map(mediaOut),
  };
}

/** 작품 목록에 미디어를 붙인다. 쿼리 한 번으로 가져온다(D1의 바인딩 개수 제한을 피하려고 JSON 배열로 넘긴다). */
export async function withMedia(db: D1Database, artworks: Row[]) {
  if (!artworks.length) return [];
  const { results } = await db.prepare(
    `SELECT ${MEDIA_COLUMNS} FROM media_assets
      WHERE artwork_id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL
      ORDER BY sort_order, created_at`,
  ).bind(JSON.stringify(artworks.map(a => a.id))).all<Row>();
  const byArtwork = new Map<unknown, Row[]>();
  for (const media of results) byArtwork.set(media.artwork_id, [...(byArtwork.get(media.artwork_id) ?? []), media]);
  return artworks.map(a => artworkOut(a, byArtwork.get(a.id)));
}

export function seriesOut(row: Row) {
  return { id: row.id, name: row.name, description: row.description, name_en: row.name_en, description_en: row.description_en, sort_order: row.sort_order };
}

export function exhibitionOut(row: Row) {
  return {
    id: row.id, slug: row.slug, title: row.title, venue: row.venue, location: row.location, start_date: row.start_date ?? null, end_date: row.end_date ?? null,
    description: row.description, title_en: row.title_en, venue_en: row.venue_en, location_en: row.location_en, description_en: row.description_en,
    is_published: bool(row.is_published), sort_order: row.sort_order, created_at: row.created_at, updated_at: row.updated_at,
  };
}

export const PROFILE_FIELDS = [
  "name", "headline", "intro", "bio", "cv", "location", "name_en", "headline_en", "intro_en", "bio_en", "cv_en", "location_en",
  "bank_name", "bank_account", "bank_holder", "payment_note", "payment_note_en",
] as const;

export function profileOut(row: Row | null) {
  return Object.fromEntries(PROFILE_FIELDS.map(key => [key, (row?.[key] as string) ?? ""]));
}
