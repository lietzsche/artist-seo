import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Artwork, Series } from "../lib/api";
import { useLang } from "../lib/i18n";
import { ArtworkCard } from "../components/ArtworkCard";

const STATUSES = ["", "available", "sold", "unavailable"] as const;

export function Works() {
  const { t, seriesName } = useLang();
  const [status, setStatus] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const series = useQuery({ queryKey: ["series"], queryFn: () => api<Series[]>("/series") });
  const query = useQuery({
    queryKey: ["works", status, seriesId],
    queryFn: () => api<{ items: Artwork[]; total: number }>(`/artworks?size=50${status ? `&sale_status=${status}` : ""}${seriesId ? `&series_id=${seriesId}` : ""}`),
  });
  return <section className="container">
    <div className="page-head">
      <h1 className="display">{t.works}</h1>
      {query.data && <span className="count">{t.count(query.data.total)}</span>}
    </div>
    <div className="toolbar">
      <div className="chips" role="group" aria-label={t.saleStatus}>
        {STATUSES.map(value => <button key={value} type="button" className="chip" aria-pressed={status === value} onClick={() => setStatus(value)}>{value ? t.sale[value] : t.all}</button>)}
      </div>
      {!!series.data?.length && (
        <label className="select-inline">{t.series}
          <select value={seriesId} onChange={e => setSeriesId(e.target.value)}>
            <option value="">{t.all}</option>
            {series.data.map(item => <option key={item.id} value={item.id}>{seriesName(item)}</option>)}
          </select>
        </label>
      )}
    </div>
    {query.isPending && <p className="state" role="status">{t.loadingWorks}</p>}
    {query.isError && <p className="state" role="alert">{t.loadFailed}</p>}
    {query.data?.items.length === 0 && <p className="state">{t.noMatch}</p>}
    <div className="works-grid">{query.data?.items.map(work => <ArtworkCard key={work.id} work={work} />)}</div>
  </section>;
}
