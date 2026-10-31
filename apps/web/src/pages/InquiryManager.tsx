import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export type Inquiry = {
  id: string; artwork_id: string | null; artwork_title: string | null; artwork_slug: string | null;
  name: string; email: string; message: string; status: "new" | "done"; created_at: string;
};

export const inquiriesQuery = { queryKey: ["admin-inquiries"], queryFn: () => api<Inquiry[]>("/inquiries/admin") };

const when = (iso: string) => new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function InquiryManager({ csrf }: { csrf: string }) {
  const client = useQueryClient();
  const inquiries = useQuery({ ...inquiriesQuery, refetchInterval: 60_000 });
  const [onlyNew, setOnlyNew] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["admin-inquiries"] });
    await client.invalidateQueries({ queryKey: ["admin-overview"] });
  };
  async function mark(item: Inquiry, status: Inquiry["status"]) {
    try { await api(`/inquiries/admin/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ status }) }); setError(""); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "바꾸지 못했습니다."); }
  }
  async function remove(item: Inquiry) {
    if (!confirm(`${item.name}님의 문의를 삭제할까요? 이름·이메일·내용이 지워지고 되돌릴 수 없습니다.`)) return;
    try { await api(`/inquiries/admin/${item.id}`, { method: "DELETE", headers: { "X-CSRF-Token": csrf } }); setError(""); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "삭제하지 못했습니다."); }
  }

  const all = inquiries.data ?? [];
  const newCount = all.filter(i => i.status === "new").length;
  const list = onlyNew ? all.filter(i => i.status === "new") : all;

  return <section className="panel">
    <h2>문의</h2>
    <p className="hint">문의 페이지와 작품의 ‘문의하기’로 들어온 내용입니다. <b>답장하기</b>를 누르면 메일 앱이 열립니다. 답장한 뒤 <b>처리 완료</b>로 표시해 두세요.</p>
    <div className="chips" role="group" aria-label="보기" style={{ margin: "1rem 0 .5rem" }}>
      <button type="button" className="chip" aria-pressed={!onlyNew} onClick={() => setOnlyNew(false)}>전체 {all.length}</button>
      <button type="button" className="chip" aria-pressed={onlyNew} onClick={() => setOnlyNew(true)}>새 문의 {newCount}</button>
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {inquiries.isPending && <p className="muted">불러오는 중입니다.</p>}
    {inquiries.isSuccess && list.length === 0 && <p className="muted">{onlyNew ? "새 문의가 없습니다." : "아직 들어온 문의가 없습니다."}</p>}
    <ul className="inquiry-list">
      {list.map(item => {
        const subject = encodeURIComponent(item.artwork_title ? `Re: ${item.artwork_title}` : "Re: 문의");
        return <li key={item.id} className={`inquiry${item.status === "new" ? " is-new" : ""}`}>
          <div className="inquiry-head">
            <span className={`badge${item.status === "new" ? " warn" : " on"}`}>{item.status === "new" ? "새 문의" : "처리 완료"}</span>
            <strong>{item.name}</strong>
            <a href={`mailto:${item.email}`} className="muted">{item.email}</a>
            <time className="muted" dateTime={item.created_at}>{when(item.created_at)}</time>
          </div>
          {item.artwork_title && <p className="inquiry-work">작품: <a href={`/works/${item.artwork_slug}`} target="_blank" rel="noopener">{item.artwork_title} ↗</a></p>}
          {item.artwork_id && !item.artwork_title && <p className="inquiry-work muted">작품: 삭제된 작품</p>}
          <p className="inquiry-message">{item.message}</p>
          <div className="actions">
            <a className="btn btn-sm" href={`mailto:${item.email}?subject=${subject}`}>답장하기</a>
            {item.status === "new"
              ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => void mark(item, "done")}>처리 완료</button>
              : <button type="button" className="btn btn-ghost btn-sm" onClick={() => void mark(item, "new")}>새 문의로 되돌리기</button>}
            <span className="spacer" />
            <button type="button" className="link-btn" onClick={() => void remove(item)}>삭제</button>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
