import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Category, Exhibition, Series } from "../lib/api";

type Status = { kind: "ok" | "bad"; text: string } | null;
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

// 추가 폼과 편집 폼이 같은 입력 칸을 쓴다
const seriesBody = (form: FormData) => ({
  name: text(form, "name"), description: text(form, "description"),
  name_en: text(form, "name_en"), description_en: text(form, "description_en"),
  sort_order: Number(form.get("sort_order")) || 0,
});
const categoryBody = (form: FormData) => ({
  name: text(form, "name"), name_en: text(form, "name_en"), parent_id: text(form, "parent_id") || null,
  sort_order: Number(form.get("sort_order")) || 0, is_visible: form.get("is_visible") === "on",
});
const exhibitionBody = (form: FormData) => ({
  slug: text(form, "slug"), title: text(form, "title"), venue: text(form, "venue"), location: text(form, "location"),
  start_date: text(form, "start_date") || null, end_date: text(form, "end_date") || null, description: String(form.get("description") ?? ""),
  title_en: text(form, "title_en"), venue_en: text(form, "venue_en"), location_en: text(form, "location_en"), description_en: String(form.get("description_en") ?? ""),
  is_published: form.get("is_published") === "on", sort_order: Number(form.get("sort_order")) || 0,
});

function SeriesFields({ item }: { item?: Series }) {
  return <>
    <label className="c4">이름<input name="name" required maxLength={200} defaultValue={item?.name} /></label>
    <label className="c6">설명<input name="description" maxLength={5000} defaultValue={item?.description} /></label>
    <label className="c2">정렬 순서<input name="sort_order" type="number" min="0" defaultValue={item?.sort_order ?? 0} /></label>
    <label className="c4">영어 이름<input name="name_en" maxLength={200} defaultValue={item?.name_en} placeholder="비우면 한국어 이름 표시" /></label>
    <label className="c8">영어 설명<input name="description_en" maxLength={5000} defaultValue={item?.description_en} /></label>
  </>;
}

/** 유형: 최상위이거나, 최상위 하나의 아래(하위). 하위 아래에는 둘 수 없어 최상위만 고를 수 있다 */
function CategoryFields({ item, tops }: { item?: Category; tops: Category[] }) {
  return <>
    <label className="c4">이름<input name="name" required maxLength={100} defaultValue={item?.name} placeholder="예: 설치" /></label>
    <label className="c4">영어 이름<input name="name_en" maxLength={100} defaultValue={item?.name_en} placeholder="비우면 한국어 이름 표시" /></label>
    <label className="c4">유형<select name="parent_id" defaultValue={item?.parent_id ?? ""}>
      <option value="">최상위 카테고리</option>
      {tops.filter(top => top.id !== item?.id).map(top => <option key={top.id} value={top.id}>{top.name} 아래 (하위)</option>)}
    </select></label>
    <label className="c2">순서<input name="sort_order" type="number" min="0" defaultValue={item?.sort_order ?? 0} /></label>
    <div className="checks"><label className="check"><input name="is_visible" type="checkbox" defaultChecked={item?.is_visible ?? true} /> 홈에 표시 (끄면 숨김. 최상위를 숨기면 하위도 숨습니다)</label></div>
  </>;
}

function ExhibitionFields({ item }: { item?: Exhibition }) {
  return <>
    <label className="c6">전시명<input name="title" required maxLength={300} defaultValue={item?.title} /></label>
    <label className="c6">주소(영문 슬러그)<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={item?.slug} placeholder="예: solo-2026" /></label>
    <label className="c6">장소<input name="venue" maxLength={300} defaultValue={item?.venue} /></label>
    <label className="c6">지역<input name="location" maxLength={300} defaultValue={item?.location} /></label>
    <label className="c3">시작일<input name="start_date" type="date" defaultValue={item?.start_date ?? ""} /></label>
    <label className="c3">종료일<input name="end_date" type="date" defaultValue={item?.end_date ?? ""} /></label>
    <label className="c3">정렬 순서<input name="sort_order" type="number" min="0" defaultValue={item?.sort_order ?? 0} /></label>
    <label className="c12">설명<textarea name="description" rows={3} maxLength={10000} defaultValue={item?.description} /></label>
    <fieldset className="lang-fields c12">
      <legend>영어 페이지 <span>비워 둔 칸은 영어 페이지에도 한국어로 나옵니다.</span></legend>
      <label className="c6">영어 전시명<input name="title_en" maxLength={300} defaultValue={item?.title_en} /></label>
      <label className="c3">영어 장소<input name="venue_en" maxLength={300} defaultValue={item?.venue_en} /></label>
      <label className="c3">영어 지역<input name="location_en" maxLength={300} defaultValue={item?.location_en} /></label>
      <label className="c12">영어 설명<textarea name="description_en" rows={3} maxLength={10000} defaultValue={item?.description_en} /></label>
    </fieldset>
    <div className="checks"><label className="check"><input name="is_published" type="checkbox" defaultChecked={item?.is_published} /> 사이트에 공개</label></div>
  </>;
}

export function CollectionManager({ csrf }: { csrf: string }) {
  const client = useQueryClient();
  const series = useQuery({ queryKey: ["admin-series"], queryFn: () => api<Series[]>("/series/admin/all") });
  const categories = useQuery({ queryKey: ["admin-categories"], queryFn: () => api<Category[]>("/categories/admin/all") });
  const tops = (categories.data ?? []).filter(c => !c.parent_id);
  const [categoryStatus, setCategoryStatus] = useState<Status>(null);
  const exhibitions = useQuery({ queryKey: ["admin-exhibitions"], queryFn: () => api<Exhibition[]>("/exhibitions/admin/all") });
  const [seriesStatus, setSeriesStatus] = useState<Status>(null);
  const [exhibitionStatus, setExhibitionStatus] = useState<Status>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const headers = { "Content-Type": "application/json", "X-CSRF-Token": csrf };

  // 시리즈 이름은 작품 목록·편집기에도 쓰이므로 관련 목록을 함께 새로 불러온다
  const refreshSeries = async () => {
    for (const key of ["admin-series", "series", "admin-works", "works"]) await client.invalidateQueries({ queryKey: [key] });
  };
  // 카테고리는 작품 편집기의 선택 목록과 홈 탭에도 쓰인다
  const refreshCategories = async () => {
    for (const key of ["admin-categories", "categories", "admin-works", "works", "home-category"]) await client.invalidateQueries({ queryKey: [key] });
  };
  const refreshExhibitions = async () => {
    for (const key of ["admin-exhibitions", "exhibitions"]) await client.invalidateQueries({ queryKey: [key] });
  };

  async function createSeries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    try {
      await api("/series/admin", { method: "POST", headers, body: JSON.stringify(seriesBody(new FormData(formEl))) });
      formEl.reset(); setSeriesStatus({ kind: "ok", text: "시리즈를 추가했습니다." });
      await refreshSeries();
    } catch (e) { setSeriesStatus({ kind: "bad", text: message(e, "추가하지 못했습니다.") }); }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    try {
      await api("/categories/admin", { method: "POST", headers, body: JSON.stringify(categoryBody(new FormData(formEl))) });
      formEl.reset(); setCategoryStatus({ kind: "ok", text: "카테고리를 추가했습니다." });
      await refreshCategories();
    } catch (e) { setCategoryStatus({ kind: "bad", text: message(e, "추가하지 못했습니다.") }); }
  }

  async function createExhibition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    try {
      await api("/exhibitions/admin", { method: "POST", headers, body: JSON.stringify(exhibitionBody(new FormData(formEl))) });
      formEl.reset(); setExhibitionStatus({ kind: "ok", text: "전시를 추가했습니다." });
      await refreshExhibitions();
    } catch (e) { setExhibitionStatus({ kind: "bad", text: message(e, "추가하지 못했습니다. 날짜와 주소를 확인하세요.") }); }
  }

  return <>
    <section className="panel">
      <h2>카테고리</h2>
      <p className="hint">홈의 작품 칸 위에 탭으로 나타납니다. 최상위 카테고리 아래에 하위 카테고리를 한 단계 더 둘 수 있습니다. 작품 편집에서 카테고리를 하나 고르면, 하위에 넣은 작품은 그 위 최상위 탭에도 나옵니다. 공개 작품이 없는 카테고리는 홈에 보이지 않습니다.</p>
      <form className="admin-form" onSubmit={createCategory}>
        <CategoryFields tops={tops} />
        <div className="actions"><button className="btn btn-ghost">카테고리 추가</button>{categoryStatus && <span className={`badge ${categoryStatus.kind === "ok" ? "on" : "bad"}`} role="status">{categoryStatus.text}</span>}</div>
      </form>
      <ul className="edit-list">
        {categories.data?.map(item => <EditRow key={item.id} open={openId === item.id} onToggle={() => setOpenId(openId === item.id ? null : item.id)}
          title={<span className={item.parent_id ? "sub-row" : undefined}>{item.parent_id && <span className="muted" aria-hidden="true">└ </span>}{item.name}{item.name_en && <span className="muted"> · {item.name_en}</span>}</span>}
          meta={<>{!item.is_visible && <span className="badge">숨김</span>} {item.parent_id ? "하위" : "최상위"} · 작품 {item.work_count} · 순서 {item.sort_order}</>}
          confirmText={`카테고리 '${item.name}'을(를) 삭제할까요? 이 카테고리의 작품은 '카테고리 없음'이 됩니다.`}
          onSave={form => api(`/categories/admin/${item.id}`, { method: "PUT", headers, body: JSON.stringify(categoryBody(form)) }).then(refreshCategories)}
          onDelete={() => api(`/categories/admin/${item.id}`, { method: "DELETE", headers }).then(async () => { setOpenId(null); await refreshCategories(); })}
          deleteHint="하위 카테고리가 있는 최상위는 하위를 먼저 옮기거나 삭제해야 합니다.">
          <CategoryFields item={item} tops={tops} />
        </EditRow>)}
      </ul>
    </section>
    <section className="panel">
      <h2>시리즈</h2>
      <p className="hint">작품을 묶는 연작입니다. 작품 편집에서 시리즈를 고르면 작품 목록에서 시리즈별로 볼 수 있습니다.</p>
      <form className="admin-form" onSubmit={createSeries}>
        <SeriesFields />
        <div className="actions"><button className="btn btn-ghost">시리즈 추가</button>{seriesStatus && <span className={`badge ${seriesStatus.kind === "ok" ? "on" : "bad"}`} role="status">{seriesStatus.text}</span>}</div>
      </form>
      <ul className="edit-list">
        {series.data?.map(item => <EditRow key={item.id} open={openId === item.id} onToggle={() => setOpenId(openId === item.id ? null : item.id)}
          title={<>{item.name}{item.name_en && <span className="muted"> · {item.name_en}</span>}</>} meta={`순서 ${item.sort_order}`}
          confirmText={`시리즈 '${item.name}'을(를) 삭제할까요?`}
          onSave={form => api(`/series/admin/${item.id}`, { method: "PUT", headers, body: JSON.stringify(seriesBody(form)) }).then(refreshSeries)}
          onDelete={() => api(`/series/admin/${item.id}`, { method: "DELETE", headers }).then(async () => { setOpenId(null); await refreshSeries(); })}
          deleteHint="작품에서 쓰고 있는 시리즈는 삭제할 수 없습니다. 먼저 작품의 시리즈를 바꾸세요.">
          <SeriesFields item={item} />
        </EditRow>)}
      </ul>
    </section>
    <section className="panel">
      <h2>전시</h2>
      <p className="hint">공개한 전시는 홈과 소개 페이지에 나타납니다. 홈에는 정렬 순서가 가장 앞선 전시가 표시됩니다.</p>
      <form className="admin-form" onSubmit={createExhibition}>
        <ExhibitionFields />
        <div className="actions"><button className="btn btn-ghost">전시 추가</button>{exhibitionStatus && <span className={`badge ${exhibitionStatus.kind === "ok" ? "on" : "bad"}`} role="status">{exhibitionStatus.text}</span>}</div>
      </form>
      <ul className="edit-list">
        {exhibitions.data?.map(item => <EditRow key={item.id} open={openId === item.id} onToggle={() => setOpenId(openId === item.id ? null : item.id)}
          title={<>{item.title}{item.venue && <span className="muted"> · {item.venue}</span>}</>}
          meta={<><span className={`badge${item.is_published ? " on" : ""}`}>{item.is_published ? "공개" : "비공개"}</span> 순서 {item.sort_order}</>}
          confirmText={`전시 '${item.title}'을(를) 삭제할까요? 사이트에서도 사라지고 되돌릴 수 없습니다.`}
          onSave={form => api(`/exhibitions/admin/${item.id}`, { method: "PUT", headers, body: JSON.stringify(exhibitionBody(form)) }).then(refreshExhibitions)}
          onDelete={() => api(`/exhibitions/admin/${item.id}`, { method: "DELETE", headers }).then(async () => { setOpenId(null); await refreshExhibitions(); })}>
          <ExhibitionFields item={item} />
        </EditRow>)}
      </ul>
    </section>
  </>;
}

type RowProps = {
  title: React.ReactNode; meta: React.ReactNode; open: boolean; onToggle: () => void;
  onSave: (form: FormData) => Promise<unknown>; onDelete: () => Promise<unknown>;
  confirmText: string; deleteHint?: string; children: React.ReactNode;
};

/** 목록 한 줄: 편집을 누르면 그 자리에 편집 폼이 열린다 */
function EditRow({ title, meta, open, onToggle, onSave, onDelete, confirmText, deleteHint, children }: RowProps) {
  const [status, setStatus] = useState<Status>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await onSave(new FormData(event.currentTarget)); setStatus({ kind: "ok", text: "저장했습니다." }); }
    catch (e) { setStatus({ kind: "bad", text: message(e, "저장하지 못했습니다.") }); }
  }
  async function remove() {
    if (!confirm(confirmText)) return;
    try { await onDelete(); }
    catch (e) { setStatus({ kind: "bad", text: message(e, "삭제하지 못했습니다.") }); }
  }
  return <li className={`edit-row${open ? " open" : ""}`}>
    <div className="edit-head">
      <span className="name">{title}</span>
      <small>{meta}</small>
      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => { setStatus(null); onToggle(); }}>{open ? "닫기" : "편집"}</button>
    </div>
    {open && <form className="admin-form edit-body" onSubmit={save}>
      {children}
      <div className="actions">
        <button className="btn">저장</button>
        {status && <span className={`badge ${status.kind === "ok" ? "on" : "bad"}`} role="status">{status.text}</span>}
        <span className="spacer" />
        <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove()} title={deleteHint}>삭제</button>
      </div>
    </form>}
  </li>;
}
