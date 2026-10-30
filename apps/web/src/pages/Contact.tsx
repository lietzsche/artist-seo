import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export function Contact() {
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
      setMessage("문의가 접수되었습니다. 확인 후 회신 이메일로 답변드리겠습니다.");
      formEl.reset();
    } catch (e) { setError(e instanceof Error ? e.message : "문의 접수에 실패했습니다."); }
    finally { setSending(false); }
  }

  return <section className="container contact">
    <div style={{ display: "grid", gap: "1.5rem", alignContent: "start" }}>
      <h1 className="display">문의</h1>
      <p className="lead" style={{ margin: 0 }}>작품 구매, 전시, 협업에 관한 문의를 남겨 주세요. 입력하신 정보는 답변 목적으로만 사용합니다.</p>
      {artworkTitle && <p className="notice">문의 작품: <strong>{artworkTitle}</strong> · <Link to="/contact" style={{ textDecoration: "underline" }}>작품 선택 해제</Link></p>}
    </div>
    <form className="form" onSubmit={submit}>
      <label className="field">이름<input name="name" required maxLength={120} autoComplete="name" /></label>
      <label className="field">회신 이메일<input type="email" name="email" required maxLength={320} autoComplete="email" /></label>
      <label className="field">문의 내용<textarea name="message" required minLength={10} maxLength={5000} rows={7} placeholder="10자 이상 입력해 주세요" /></label>
      <label className="check"><input type="checkbox" name="consent" required /> 문의 답변을 위한 개인정보(이름, 이메일) 수집에 동의합니다.</label>
      <label className="honeypot" aria-hidden="true">웹사이트<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <div><button className="btn" type="submit" disabled={sending}>{sending ? "보내는 중…" : "문의 보내기"}</button></div>
      {message && <p className="notice success" role="status">{message}</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
    </form>
  </section>;
}
