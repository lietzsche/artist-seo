import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Artwork, Series } from "../lib/api";
import { ArtworkCard } from "../components/ArtworkCard";

const STATUS = [["", "전체"], ["available", "판매 가능"], ["sold", "판매 완료"], ["unavailable", "비매품"]] as const;

export function Works() {
  const [status, setStatus] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const series = useQuery({ queryKey: ["series"], queryFn: () => api<Series[]>("/series") });
  const query = useQuery({
    queryKey: ["works", status, seriesId],
    queryFn: () => api<{ items: Artwork[]; total: number }>(`/artworks?size=50${status ? `&sale_status=${status}` : ""}${seriesId ? `&series_id=${seriesId}` : ""}`),
  });
  return <section className="container">
    <div className="page-head">
      <h1 className="display">작품</h1>
      {query.data && <span className="count">{query.data.total}점</span>}
    </div>
    <div className="toolbar">
      <div className="chips" role="group" aria-label="판매 상태">
        {STATUS.map(([value, label]) => <button key={value} type="button" className="chip" aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}
      </div>
      {!!series.data?.length && (
        <label className="select-inline">시리즈
          <select value={seriesId} onChange={e => setSeriesId(e.target.value)}>
            <option value="">전체</option>
            {series.data.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      )}
    </div>
    {query.isPending && <p className="state" role="status">작품을 불러오는 중입니다.</p>}
    {query.isError && <p className="state" role="alert">목록을 불러오지 못했습니다.</p>}
    {query.data?.items.length === 0 && <p className="state">조건에 맞는 작품이 없습니다.</p>}
    <div className="works-grid">{query.data?.items.map(work => <ArtworkCard key={work.id} work={work} />)}</div>
  </section>;
}
