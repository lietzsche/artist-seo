import { useEffect, useRef } from "react";
import { keepPreviousData, QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, Artwork, coverOf } from "../lib/api";
import { useLang } from "../lib/i18n";
import { usePageTitle } from "../lib/title";
import { ArtworkCard } from "../components/ArtworkCard";

// 3열·2열 그리드 모두 줄이 딱 맞아떨어지는 수
const PAGE_SIZE = 12;
// 미리 받은 페이지를 다시 받지 않고 쓰는 시간
const STALE_MS = 5 * 60_000;

type WorksPage = { items: Artwork[]; total: number };
const worksQuery = (page: number) => ({
  queryKey: ["works", page],
  queryFn: () => api<WorksPage>(`/artworks?page=${page}&size=${PAGE_SIZE}`),
  staleTime: STALE_MS,
});

/** 이웃 페이지의 목록과 카드 사진을 미리 받아 두어, 번호를 누르면 바로 바뀌게 한다 */
async function prefetchPage(client: QueryClient, page: number) {
  await client.prefetchQuery(worksQuery(page));
  const data = client.getQueryData<WorksPage>(["works", page]);
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (!data || saveData) return;
  for (const work of data.items) {
    const cover = coverOf(work);
    if (cover) new Image().src = cover.src;
  }
}

/** 보여줄 페이지 번호. 처음·끝·현재 앞뒤만 두고 나머지는 "…"로 줄인다 (1 … 4 5 6 … 12) */
function pageItems(current: number, last: number): (number | "gap")[] {
  const keep = new Set([1, last, current - 1, current, current + 1]);
  const items: (number | "gap")[] = [];
  for (let n = 1; n <= last; n++) {
    if (keep.has(n)) items.push(n);
    else if (items[items.length - 1] !== "gap") items.push("gap");
  }
  return items;
}

export function Works() {
  const { t } = useLang();
  usePageTitle(t.works);
  // 페이지는 주소(?page=2)에 남겨, 새로고침하거나 링크를 공유해도 같은 페이지가 보이게 한다
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get("page") ?? 1);
  const page = Number.isInteger(raw) && raw >= 1 ? raw : 1;

  const client = useQueryClient();
  const query = useQuery({ ...worksQuery(page), placeholderData: keepPreviousData });
  const total = query.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 없는 페이지(?page=999)로 들어오면 마지막 페이지로 보낸다
  useEffect(() => {
    if (query.data && page > lastPage) setParams(lastPage > 1 ? { page: String(lastPage) } : {}, { replace: true });
  }, [query.data, page, lastPage, setParams]);
  // 새 페이지의 작품이 화면에 나왔을 때 맨 위로 올린다 (도착 전에 올리면 이전 작품이 잠깐 보인다)
  const ready = !!query.data && !query.isPlaceholderData;
  const scrolledFor = useRef(page);
  useEffect(() => {
    if (!ready || scrolledFor.current === page) return;
    scrolledFor.current = page;
    window.scrollTo(0, 0);
  }, [ready, page]);

  useEffect(() => {
    if (!ready) return;
    for (const near of [page - 1, page + 1]) if (near >= 1 && near <= lastPage) void prefetchPage(client, near);
  }, [ready, page, lastPage, client]);

  const href = (n: number) => ({ search: n > 1 ? `?page=${n}` : "" });

  return <section className="container">
    <div className="page-head">
      <h1 className="display">{t.works}</h1>
      {query.data && <span className="count">{t.count(total)}</span>}
    </div>
    {query.isPending && <p className="state" role="status">{t.loadingWorks}</p>}
    {query.isError && <p className="state" role="alert">{t.loadFailed}</p>}
    {query.data?.items.length === 0 && page <= lastPage && <p className="state">{t.noWorks}</p>}
    <div className={`works-grid${query.isPlaceholderData ? " is-loading" : ""}`} aria-busy={query.isPlaceholderData}>{query.data?.items.map(work => <ArtworkCard key={work.id} work={work} />)}</div>
    {lastPage > 1 && (
      <nav className="pager" aria-label={t.pages}>
        {page > 1 ? <Link to={href(page - 1)} rel="prev" aria-label={t.prevPage}>‹</Link> : <span aria-hidden="true">‹</span>}
        {pageItems(page, lastPage).map((item, i) => item === "gap"
          ? <span key={`gap-${i}`} className="gap" aria-hidden="true">…</span>
          : <Link key={item} to={href(item)} aria-current={item === page ? "page" : undefined}>{item}</Link>)}
        {page < lastPage ? <Link to={href(page + 1)} rel="next" aria-label={t.nextPage}>›</Link> : <span aria-hidden="true">›</span>}
      </nav>
    )}
  </section>;
}
