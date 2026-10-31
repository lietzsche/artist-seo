import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, Profile } from "../lib/api";
import { useLang } from "../lib/i18n";

export function Contact() {
  const { lang, t, to, profile: localize } = useLang();
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/profile") });
  const [params] = useSearchParams();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const artworkTitle = params.get("title");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSending(true);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    try {
      await api("/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artwork_id: params.get("artwork") || null, name: form.get("name"), email: form.get("email"), message: form.get("message"), consent: form.get("consent") === "on", website: form.get("website") }) });
      setMessage(t.sent);
      formEl.reset();
    } catch (e) {
      // 서버 오류 문구는 한국어라, 영어 페이지에서는 영어 안내로 바꿔 보여준다
      if (e instanceof ApiError && e.status === 429) setError(t.tooMany);
      else setError(lang === "ko" && e instanceof Error ? e.message : t.sendFailed);
    }
    finally { setSending(false); }
  }

  return <section className="container contact">
    <div style={{ display: "grid", gap: "1.5rem", alignContent: "start" }}>
      <h1 className="display">{t.contact}</h1>
      <p className="lead" style={{ margin: 0 }}>{t.contactLead}</p>
      {profile.data?.bank_account && <Payment profile={profile.data} note={localize(profile.data).paymentNote} />}
      {artworkTitle && <p className="notice">{t.inquiryWork} <strong>{artworkTitle}</strong> · <Link to={to("/contact")} style={{ textDecoration: "underline" }}>{t.clearWork}</Link></p>}
    </div>
    <form className="form" onSubmit={submit}>
      <label className="field">{t.name}<input name="name" required maxLength={120} autoComplete="name" /></label>
      <label className="field">{t.email}<input type="email" name="email" required maxLength={320} autoComplete="email" /></label>
      <label className="field">{t.message}<textarea name="message" required minLength={10} maxLength={5000} rows={7} placeholder={t.messageHint} /></label>
      <label className="check"><input type="checkbox" name="consent" required /> {t.consent}</label>
      <label className="honeypot" aria-hidden="true">{t.website}<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <div><button className="btn" type="submit" disabled={sending}>{sending ? t.sending : t.send}</button></div>
      {message && <p className="notice success" role="status">{message}</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
    </form>
  </section>;
}

/** 관리 화면에서 계좌번호를 넣었을 때만 보이는 입금 계좌 안내 */
function Payment({ profile, note }: { profile: Profile; note: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(profile.bank_account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* 복사가 막힌 브라우저에서는 직접 선택해 복사한다 */ }
  }
  return <section className="payment" aria-labelledby="payment-title">
    <h2 id="payment-title">{t.payment}</h2>
    <dl>
      {profile.bank_name && <><dt>{t.bank}</dt><dd>{profile.bank_name}</dd></>}
      <dt>{t.account}</dt>
      <dd><span className="account">{profile.bank_account}</span><button type="button" className="link-btn" onClick={() => void copy()}>{copied ? t.copied : t.copy}</button></dd>
      {profile.bank_holder && <><dt>{t.holder}</dt><dd>{profile.bank_holder}</dd></>}
    </dl>
    <p>{note || t.paymentDefault}</p>
  </section>;
}
