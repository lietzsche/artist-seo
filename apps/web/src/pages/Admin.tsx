import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArtworkManager } from "./ArtworkManager";
import { CollectionManager } from "./CollectionManager";
import { ProfileManager } from "./ProfileManager";

type Me = { email: string; csrf_token: string };
type Overview = { storage: { stored_bytes: number; reserved_bytes: number; max_total_bytes: number; disk_free_bytes: number; min_free_bytes: number; max_file_bytes: number }; new_inquiries: number; failed_jobs: { id: string; media_id: string; kind: string; attempts: number; max_attempts: number; error: string | null }[] };
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GiB` : value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(1)} MiB` : `${value} B`;
const TABS = [["works", "작품"], ["profile", "작가 프로필"], ["collections", "시리즈·전시"], ["status", "서버 현황"]] as const;
type Tab = typeof TABS[number][0];

export function Admin() {
  const client = useQueryClient();
  const setup = useQuery({ queryKey: ["setup"], queryFn: () => api<{ needs_setup: boolean }>("/auth/setup"), staleTime: Infinity });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me"), retry: false });
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("works");

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      setError("");
      await client.invalidateQueries({ queryKey: ["me"] });
    } catch (e) { setError(e instanceof Error ? e.message : "로그인 실패"); }
  }

  async function setupAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("password_confirm")) { setError("비밀번호가 서로 다릅니다."); return; }
    try {
      await api("/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password"), artist_name: form.get("artist_name") || "" }) });
      setError("");
      client.setQueryData(["setup"], { needs_setup: false });
      await client.invalidateQueries({ queryKey: ["me"] });
      await client.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) { setError(e instanceof Error ? e.message : "설정 실패"); await client.invalidateQueries({ queryKey: ["setup"] }); }
  }

  async function logout() {
    if (!me.data) return;
    await api("/auth/logout", { method: "POST", headers: { "X-CSRF-Token": me.data.csrf_token } }).catch(() => undefined);
    client.removeQueries({ queryKey: ["me"] });
    await client.invalidateQueries({ queryKey: ["me"] });
  }

  if (setup.data?.needs_setup) return <section className="container admin-auth">
    <p className="eyebrow">First setup</p>
    <h1>관리자 계정 설정</h1>
    <p className="muted" style={{ margin: 0 }}>처음 실행이라 관리자 계정이 없습니다. 작품을 관리할 이메일과 비밀번호를 정해 주세요. 계정은 한 번만 만들 수 있고, 만들면 바로 로그인됩니다.</p>
    <form onSubmit={setupAdmin}>
      <label>작가 이름 (사이트에 표시, 나중에 변경 가능)<input name="artist_name" maxLength={120} /></label>
      <label>관리자 이메일<input type="email" name="email" required autoComplete="username" /></label>
      <label>비밀번호 (10자 이상)<input type="password" name="password" required minLength={10} autoComplete="new-password" /></label>
      <label>비밀번호 확인<input type="password" name="password_confirm" required minLength={10} autoComplete="new-password" /></label>
      <button className="btn">관리자 계정 만들기</button>
    </form>
    {error && <p className="notice error" role="alert">{error}</p>}
  </section>;

  if (me.isPending || setup.isPending) return <p className="container state" role="status">관리자 상태를 확인하는 중입니다.</p>;

  if (me.isError) return <section className="container admin-auth">
    <p className="eyebrow">Admin</p>
    <h1>관리자 로그인</h1>
    <form onSubmit={login}>
      <label>이메일<input type="email" name="email" required autoComplete="username" /></label>
      <label>비밀번호<input type="password" name="password" required minLength={10} autoComplete="current-password" /></label>
      <button className="btn">로그인</button>
    </form>
    {error && <p className="notice error" role="alert">{error}</p>}
  </section>;

  const csrf = me.data.csrf_token;
  return <section className="container admin">
    <div className="admin-top">
      <div><p className="eyebrow">Admin</p><h1>사이트 관리</h1></div>
      <div className="sub" style={{ display: "flex", gap: "1rem", alignItems: "center", fontSize: ".85rem" }}>
        <span className="muted">{me.data.email}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void logout()}>로그아웃</button>
      </div>
    </div>
    <div className="tabs" role="tablist">
      {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {tab === "works" && <ArtworkManager csrf={csrf} />}
    {tab === "profile" && <ProfileManager csrf={csrf} />}
    {tab === "collections" && <CollectionManager csrf={csrf} />}
    {tab === "status" && <ServerStatus csrf={csrf} />}
  </section>;
}

function ServerStatus({ csrf }: { csrf: string }) {
  const client = useQueryClient();
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => api<Overview>("/admin/overview") });
  async function retry(jobId: string) {
    await api(`/admin/jobs/${jobId}/retry`, { method: "POST", headers: { "X-CSRF-Token": csrf } });
    await client.invalidateQueries({ queryKey: ["admin-overview"] });
  }
  const o = overview.data;
  if (!o) return <p className="muted">불러오는 중입니다.</p>;
  return <>
    <div className="stats">
      <div><strong>{bytes(o.storage.stored_bytes)}</strong><span>저장된 원본 / 한도 {bytes(o.storage.max_total_bytes)}</span></div>
      <div><strong>{bytes(o.storage.reserved_bytes)}</strong><span>진행 중 업로드 예약량</span></div>
      <div><strong>{bytes(o.storage.disk_free_bytes)}</strong><span>디스크 잔여 공간</span></div>
      <div><strong>{o.new_inquiries}</strong><span>새 구매 문의</span></div>
    </div>
    <section className="panel" style={{ marginTop: "1.25rem" }}>
      <h2>최근 실패한 변환 작업</h2>
      <p className="hint">사진·영상 변환이 실패하면 여기에 나타납니다. 원인을 확인한 뒤 다시 시도할 수 있습니다.</p>
      {o.failed_jobs.length === 0 ? <p className="muted" style={{ margin: 0 }}>실패한 작업이 없습니다.</p> :
        <ul className="rows failed-jobs">{o.failed_jobs.map(job => <li key={job.id} className="row">
          <div><div className="name">{job.kind} · {job.attempts}/{job.max_attempts}회 시도</div><div className="sub" style={{ color: "#8b241c" }}>{job.error}</div></div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void retry(job.id)}>재시도</button>
        </li>)}</ul>}
    </section>
  </>;
}
