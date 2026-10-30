import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, Artwork, MEDIA_BASE, Series } from "../lib/api";

export function Works() {
  const [status, setStatus] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const series = useQuery({queryKey:["series"], queryFn:() => api<Series[]>("/series")});
  const query = useQuery({ queryKey: ["works", status, seriesId], queryFn: () => api<{items: Artwork[], total: number}>(`/artworks?size=24${status ? `&sale_status=${status}` : ""}${seriesId ? `&series_id=${seriesId}` : ""}`) });
  return <section className="section page"><div className="page-title"><p className="eyebrow">WORKS</p><h1>작품</h1></div>
    <div className="filters"><label className="filter">시리즈 <select value={seriesId} onChange={e => setSeriesId(e.target.value)}><option value="">전체</option>{series.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="filter">판매 상태 <select value={status} onChange={e => setStatus(e.target.value)}><option value="">전체</option><option value="available">판매 가능</option><option value="sold">판매 완료</option><option value="unavailable">문의 불가</option></select></label></div>
    {query.isPending && <p role="status">작품을 불러오는 중입니다.</p>}{query.isError && <p role="alert">목록을 불러오지 못했습니다.</p>}
    <div className="grid">{query.data?.items.map(work => <Link className="card" to={`/works/${work.slug}`} key={work.id}>
      {work.media[0]?.public_key ? <img src={`${MEDIA_BASE}/${work.media[0].public_key}`} alt={work.title} width={work.media[0].width || 1200} height={work.media[0].height || 900} loading="lazy"/> : <div className="placeholder"/>}
      <h2>{work.title}</h2><p>{work.year} · {work.medium}</p><span className="status">{work.sale_status === "available" ? "판매 가능" : work.sale_status === "sold" ? "판매 완료" : "문의 불가"}</span>
    </Link>)}</div>{query.data?.items.length === 0 && <p>조건에 맞는 작품이 없습니다.</p>}
  </section>;
}

