import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, Artwork, Series } from "../lib/api";
import { useLang } from "../lib/i18n";
import { ArtworkCard } from "../components/ArtworkCard";

const STATUSES = ["", "available", "sold", "unavailable"] as const;

export function Works() {
  const { t, seriesName } = useLang();
  // 고른 조건은 주소(?series=…&year=…)에 남겨, 새로고침하거나 링크를 공유해도 같은 목록이 보이게 한다
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const seriesId = params.get("series") ?? "";
  const year = params.get("year") ?? "";
  const setFilter = (key: string, value: string) => setParams(prev => {
    const next = new URLSearchParams(prev);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true });

  const series = useQuery({ queryKey: ["series"], queryFn: () => api<Series[]>("/series") });
  const years = useQuery({ queryKey: ["work-years"], queryFn: () => api<number[]>("/artworks/years") });
  const query = useQuery({
    queryKey: ["works", status, seriesId, year],
    queryFn: () => {
      const search = new URLSearchParams({ size: "50" });
      if (status) search.set("sale_status", status);
      if (seriesId) search.set("series_id", seriesId);
      if (year) search.set("year", year);
      return api<{ items: Artwork[]; total: number }>(`/artworks?${search}`);
    },
  });
  const filtered = !!(status || seriesId || year);

  return <section className="container">
    <div className="page-head">
      <h1 className="display">{t.works}</h1>
      {query.data && <span className="count">{t.count(query.data.total)}</span>}
    </div>
    <div className="toolbar">
      <div className="chips" role="group" aria-label={t.saleStatus}>
        {STATUSES.map(value => <button key={value} type="button" className="chip" aria-pressed={status === value} onClick={() => setFilter("status", value)}>{value ? t.sale[value] : t.all}</button>)}
      </div>
      <div className="filters">
        {!!series.data?.length && (
          <label className="select-inline">{t.series}
            <select value={seriesId} onChange={e => setFilter("series", e.target.value)}>
              <option value="">{t.all}</option>
              {series.data.map(item => <option key={item.id} value={item.id}>{seriesName(item)}</option>)}
            </select>
          </label>
        )}
        {!!years.data?.length && (
          <label className="select-inline">{t.year}
            <select value={year} onChange={e => setFilter("year", e.target.value)}>
              <option value="">{t.all}</option>
              {years.data.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        )}
        {filtered && <button type="button" className="link-btn" onClick={() => setParams({}, { replace: true })}>{t.clearFilters}</button>}
      </div>
    </div>
    {query.isPending && <p className="state" role="status">{t.loadingWorks}</p>}
    {query.isError && <p className="state" role="alert">{t.loadFailed}</p>}
    {query.data?.items.length === 0 && <p className="state">{t.noMatch}</p>}
    <div className="works-grid">{query.data?.items.map(work => <ArtworkCard key={work.id} work={work} />)}</div>
  </section>;
}
