import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Exhibition, Series } from "../lib/api";

export function CollectionManager({ csrf }: { csrf: string }) {
  const client = useQueryClient();
  const series = useQuery({ queryKey: ["admin-series"], queryFn: () => api<Series[]>("/series/admin/all") });
  const exhibitions = useQuery({ queryKey: ["admin-exhibitions"], queryFn: () => api<Exhibition[]>("/exhibitions/admin/all") });
  const [seriesError, setSeriesError] = useState("");
  const [exhibitionError, setExhibitionError] = useState("");
  const headers = { "Content-Type": "application/json", "X-CSRF-Token": csrf };

  async function createSeries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    try {
      await api("/series/admin", { method: "POST", headers, body: JSON.stringify({ name: form.get("name"), description: form.get("description"), name_en: form.get("name_en") || "", description_en: form.get("description_en") || "", sort_order: Number(form.get("sort_order")) || 0 }) });
      formEl.reset(); setSeriesError("");
      await client.invalidateQueries({ queryKey: ["admin-series"] });
      await client.invalidateQueries({ queryKey: ["series"] });
    } catch (e) { setSeriesError(e instanceof Error ? e.message : "추가하지 못했습니다."); }
  }

  async function createExhibition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    try {
      await api("/exhibitions/admin", { method: "POST", headers, body: JSON.stringify({ slug: form.get("slug"), title: form.get("title"), venue: form.get("venue"), location: form.get("location"), start_date: form.get("start_date") || null, end_date: form.get("end_date") || null, description: form.get("description"), title_en: form.get("title_en") || "", venue_en: form.get("venue_en") || "", location_en: form.get("location_en") || "", description_en: form.get("description_en") || "", is_published: form.get("is_published") === "on", sort_order: Number(form.get("sort_order")) || 0 }) });
      formEl.reset(); setExhibitionError("");
      await client.invalidateQueries({ queryKey: ["admin-exhibitions"] });
      await client.invalidateQueries({ queryKey: ["exhibitions"] });
    } catch (e) { setExhibitionError(e instanceof Error ? e.message : "추가하지 못했습니다. 날짜와 슬러그를 확인하세요."); }
  }

  return <>
    <section className="panel">
      <h2>시리즈</h2>
      <p className="hint">작품을 묶는 연작입니다. 작품 편집에서 시리즈를 고르면 작품 목록에서 시리즈별로 볼 수 있습니다.</p>
      <form className="admin-form" onSubmit={createSeries}>
        <label className="c4">이름<input name="name" required maxLength={200} /></label>
        <label className="c6">설명<input name="description" maxLength={5000} /></label>
        <label className="c2">정렬 순서<input name="sort_order" type="number" min="0" defaultValue="0" /></label>
        <label className="c4">영어 이름<input name="name_en" maxLength={200} placeholder="비우면 한국어 이름 표시" /></label>
        <label className="c8">영어 설명<input name="description_en" maxLength={5000} /></label>
        <div className="actions"><button className="btn btn-ghost">시리즈 추가</button>{seriesError && <span className="badge bad" role="alert">{seriesError}</span>}</div>
      </form>
      <ul className="simple-list">{series.data?.map(item => <li key={item.id}><span>{item.name}{item.name_en ? ` · ${item.name_en}` : ""}</span><small>순서 {item.sort_order}</small></li>)}</ul>
    </section>
    <section className="panel">
      <h2>전시</h2>
      <p className="hint">공개한 전시는 홈과 소개 페이지에 나타납니다. 홈에는 정렬 순서가 가장 앞선 전시가 표시됩니다.</p>
      <form className="admin-form" onSubmit={createExhibition}>
        <label className="c6">전시명<input name="title" required maxLength={300} /></label>
        <label className="c6">주소(영문 슬러그)<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="예: solo-2026" /></label>
        <label className="c6">장소<input name="venue" maxLength={300} /></label>
        <label className="c6">지역<input name="location" maxLength={300} /></label>
        <label className="c3">시작일<input name="start_date" type="date" /></label>
        <label className="c3">종료일<input name="end_date" type="date" /></label>
        <label className="c3">정렬 순서<input name="sort_order" type="number" min="0" defaultValue="0" /></label>
        <label className="c12">설명<textarea name="description" rows={3} maxLength={10000} /></label>
        <fieldset className="lang-fields c12">
          <legend>영어 페이지 <span>비워 둔 칸은 영어 페이지에도 한국어로 나옵니다.</span></legend>
          <label className="c6">영어 전시명<input name="title_en" maxLength={300} /></label>
          <label className="c3">영어 장소<input name="venue_en" maxLength={300} /></label>
          <label className="c3">영어 지역<input name="location_en" maxLength={300} /></label>
          <label className="c12">영어 설명<textarea name="description_en" rows={3} maxLength={10000} /></label>
        </fieldset>
        <div className="checks"><label className="check"><input name="is_published" type="checkbox" /> 사이트에 공개</label></div>
        <div className="actions"><button className="btn btn-ghost">전시 추가</button>{exhibitionError && <span className="badge bad" role="alert">{exhibitionError}</span>}</div>
      </form>
      <ul className="simple-list">{exhibitions.data?.map(item => <li key={item.id}><span>{item.title} · {item.venue}</span><small>{item.is_published ? "공개" : "비공개"} · 순서 {item.sort_order}</small></li>)}</ul>
    </section>
  </>;
}
