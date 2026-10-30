import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Artwork, coverOf, mediaUrl, Media, SALE_LABEL, Series } from "../lib/api";
import { MediaUpload } from "./MediaUpload";

type Props = { csrf: string };

const json = (csrf: string) => ({ "Content-Type": "application/json", "X-CSRF-Token": csrf });
// 한글 제목은 주소로 쓰기 어려워서, 슬러그를 비워 두면 영문·숫자 주소를 자동으로 만든다
const autoSlug = (title: string) => {
  const latin = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return latin.length >= 3 ? latin.slice(0, 60) : `work-${Date.now().toString(36)}`;
};

export function ArtworkManager({ csrf }: Props) {
  const client = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const works = useQuery({
    queryKey: ["admin-works"],
    queryFn: () => api<Artwork[]>("/artworks/admin/all"),
    // 변환 중인 미디어가 있으면 3초마다 다시 불러와 상태를 갱신한다
    refetchInterval: query => (query.state.data?.some(w => w.media.some(m => m.status === "pending" || m.status === "processing")) ? 3000 : false),
  });
  const series = useQuery({ queryKey: ["admin-series"], queryFn: () => api<Series[]>("/series/admin/all") });

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["admin-works"] });
    await client.invalidateQueries({ queryKey: ["admin-overview"] });
    for (const key of ["works", "featured", "latest", "work"]) await client.invalidateQueries({ queryKey: [key] });
  };

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const title = String(form.get("title") || "").trim();
    const slug = String(form.get("slug") || "").trim() || autoSlug(title);
    try {
      const work = await api<Artwork>("/artworks/admin", { method: "POST", headers: json(csrf), body: JSON.stringify({ slug, title, year: Number(form.get("year")) || null, medium: form.get("medium") || "", dimensions: "", description: "", price_text: null, show_price: false, sale_status: "unavailable", is_published: false, featured: false, series_id: null }) });
      formEl.reset();
      await refresh();
      setOpenId(work.id); // 만든 작품의 편집기를 바로 연다
    } catch (e) { setError(e instanceof Error ? e.message : "작품을 만들지 못했습니다."); }
  }

  return <>
    <section className="panel">
      <h2>새 작품</h2>
      <p className="hint">① 제목만 넣고 만들면 비공개로 생성됩니다 → ② 아래 목록에서 사진·영상을 올리고 정보를 채운 뒤 → ③ <b>공개</b>를 켜고 저장하면 사이트에 나타납니다.</p>
      <form className="admin-form" onSubmit={create}>
        <label className="c4">제목<input name="title" required maxLength={300} placeholder="예: 아침의 빛" /></label>
        <label className="c3">주소(영문 슬러그, 선택)<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="비우면 자동 생성" /></label>
        <label className="c2">연도<input name="year" type="number" min="1000" max="2200" /></label>
        <label className="c3">재료<input name="medium" maxLength={300} placeholder="예: 캔버스에 유채" /></label>
        <div className="actions"><button className="btn">작품 만들기</button>{error && <span className="badge bad" role="alert">{error}</span>}</div>
      </form>
    </section>

    <section className="panel">
      <h2>작품 목록 {works.data && <span className="muted" style={{ fontWeight: 400 }}>· {works.data.length}점</span>}</h2>
      <p className="hint">행을 누르면 편집할 수 있습니다. 휴지통으로 옮긴 작품은 목록에서 사라집니다.</p>
      {works.isPending && <p className="muted">불러오는 중입니다.</p>}
      {works.data?.length === 0 && <p className="muted">아직 작품이 없습니다. 위에서 첫 작품을 만들어 보세요.</p>}
      <ul className="rows">
        {works.data?.map(work => {
          const cover = coverOf(work);
          const converting = work.media.some(m => m.status === "pending" || m.status === "processing");
          const failed = work.media.some(m => m.status === "failed");
          const open = openId === work.id;
          return <li key={work.id} className={`row${open ? " open" : ""}`}>
            {cover ? <img className="thumb" src={cover.src} alt="" /> : <div className="thumb">없음</div>}
            <div>
              <div className="name">{work.title}</div>
              <div className="sub">
                <span className={`badge${work.is_published ? " on" : ""}`}>{work.is_published ? "공개" : "비공개"}</span>
                {work.featured && <span className="badge">대표</span>}
                {converting && <span className="badge warn">변환 중</span>}
                {failed && <span className="badge bad">변환 실패</span>}
                <span>{work.year || "연도 미정"} · {SALE_LABEL[work.sale_status]} · 미디어 {work.media.length}개 · /works/{work.slug}</span>
              </div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpenId(open ? null : work.id)}>{open ? "닫기" : "편집"}</button>
            {open && <ArtworkEditor work={work} series={series.data ?? []} csrf={csrf} onChanged={refresh} onClose={() => setOpenId(null)} />}
          </li>;
        })}
      </ul>
    </section>
  </>;
}

function ArtworkEditor({ work, series, csrf, onChanged, onClose }: { work: Artwork; series: Series[]; csrf: string; onChanged: () => Promise<void>; onClose: () => void }) {
  const [status, setStatus] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      slug: form.get("slug"), title: form.get("title"), year: Number(form.get("year")) || null,
      medium: form.get("medium"), dimensions: form.get("dimensions"), description: form.get("description"),
      price_text: String(form.get("price_text") || "").trim() || null, show_price: form.get("show_price") === "on",
      sale_status: form.get("sale_status"), is_published: form.get("is_published") === "on",
      featured: form.get("featured") === "on", series_id: form.get("series_id") || null,
    };
    try {
      await api(`/artworks/admin/${work.id}`, { method: "PUT", headers: json(csrf), body: JSON.stringify(body) });
      setStatus({ kind: "ok", text: body.is_published ? "저장했습니다. 사이트에 공개되었습니다." : "저장했습니다. (비공개)" });
      await onChanged();
    } catch (e) { setStatus({ kind: "bad", text: e instanceof Error ? e.message : "저장하지 못했습니다." }); }
  }

  async function trash() {
    if (!confirm(`'${work.title}'을(를) 휴지통으로 옮길까요? 사이트와 관리자 목록에서 사라집니다.`)) return;
    await api(`/artworks/admin/${work.id}`, { method: "DELETE", headers: { "X-CSRF-Token": csrf } });
    onClose();
    await onChanged();
  }

  async function removeMedia(media: Media) {
    if (!confirm("이 미디어를 작품에서 뺄까요?")) return;
    await api(`/media/${media.id}/admin`, { method: "DELETE", headers: { "X-CSRF-Token": csrf } });
    await onChanged();
  }

  return <div className="editor">
    <div>
      <h3 style={{ margin: "0 0 .8rem", fontSize: ".95rem" }}>사진·영상</h3>
      {work.media.length > 0 && <div className="media-grid" style={{ marginBottom: "1rem" }}>
        {work.media.map(m => {
          const src = m.media_type === "video" ? mediaUrl(m.poster_key) : mediaUrl(m.public_key);
          const label = m.status === "ready" ? (m.media_type === "video" ? "영상" : "이미지") : m.status === "failed" ? "변환 실패" : "변환 중…";
          return <div key={m.id} className="media-item">
            <div className="box">{src ? <img src={src} alt="" /> : <span>{label}</span>}</div>
            <div className="foot"><span className={m.status === "failed" ? "badge bad" : m.status === "ready" ? "" : "badge warn"}>{label}{m.width ? ` · ${m.width}×${m.height}` : ""}</span><button type="button" className="link-btn" onClick={() => void removeMedia(m)}>빼기</button></div>
          </div>;
        })}
      </div>}
      <MediaUpload artworkId={work.id} csrf={csrf} onComplete={() => void onChanged()} />
    </div>

    <form key={work.updated_at} className="admin-form" onSubmit={save}>
      <label className="c6">제목<input name="title" required maxLength={300} defaultValue={work.title} /></label>
      <label className="c3">주소(영문 슬러그)<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={work.slug} /></label>
      <label className="c3">연도<input name="year" type="number" min="1000" max="2200" defaultValue={work.year ?? ""} /></label>
      <label className="c6">재료<input name="medium" maxLength={300} defaultValue={work.medium} placeholder="예: 캔버스에 유채" /></label>
      <label className="c3">크기<input name="dimensions" maxLength={200} defaultValue={work.dimensions} placeholder="예: 120 × 80 cm" /></label>
      <label className="c3">시리즈<select name="series_id" defaultValue={work.series_id ?? ""}><option value="">없음</option>{series.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="c12">작품 설명<textarea name="description" rows={4} maxLength={10000} defaultValue={work.description} /></label>
      <label className="c3">판매 상태<select name="sale_status" defaultValue={work.sale_status}><option value="available">판매 가능</option><option value="sold">판매 완료</option><option value="unavailable">비매품</option></select></label>
      <label className="c3">가격<input name="price_text" maxLength={100} defaultValue={work.price_text ?? ""} placeholder="예: 3,000,000원" /></label>
      <div className="checks">
        <label className="check"><input type="checkbox" name="show_price" defaultChecked={work.show_price} /> 가격 공개 (끄면 '문의'로 표시)</label>
        <label className="check"><input type="checkbox" name="featured" defaultChecked={work.featured} /> 대표 작품 (홈에 표시)</label>
        <label className="check"><input type="checkbox" name="is_published" defaultChecked={work.is_published} /> <b>사이트에 공개</b></label>
      </div>
      <div className="actions">
        <button className="btn">저장</button>
        {work.is_published && <a className="link-btn" href={`/works/${work.slug}`} target="_blank" rel="noopener">사이트에서 보기 ↗</a>}
        {status && <span className={`badge ${status.kind === "ok" ? "on" : "bad"}`} role="status">{status.text}</span>}
        <span className="spacer" />
        <button type="button" className="btn btn-danger btn-sm" onClick={() => void trash()}>휴지통으로</button>
      </div>
    </form>
  </div>;
}
