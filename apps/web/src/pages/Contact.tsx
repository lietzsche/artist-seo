import { FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export function Contact() {
  const [params] = useSearchParams(); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); const form = new FormData(event.currentTarget); try { await api("/inquiries", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ artwork_id: params.get("artwork") || null, name: form.get("name"), email: form.get("email"), message: form.get("message"), consent: form.get("consent") === "on", website: form.get("website") }) }); setMessage("문의가 접수되었습니다. 관리자가 확인 후 답변드립니다."); event.currentTarget.reset(); } catch (e) { setError(e instanceof Error ? e.message : "문의 접수에 실패했습니다."); } }
  return <section className="section page form-page"><p className="eyebrow">CONTACT</p><h1>작품 문의</h1><p>구매와 전시에 관한 문의를 남겨주세요. 입력 정보는 답변 목적으로만 사용됩니다.</p><form onSubmit={submit}><label>이름<input name="name" required maxLength={120}/></label><label>회신 이메일<input type="email" name="email" required maxLength={320}/></label><label>문의 내용<textarea name="message" required minLength={10} maxLength={5000} rows={7}/></label><label className="consent"><input type="checkbox" name="consent" required/> 문의 답변을 위한 개인정보 수집에 동의합니다.</label><label className="honeypot" aria-hidden="true">웹사이트<input name="website" tabIndex={-1} autoComplete="off"/></label><button className="button" type="submit">문의 보내기</button></form>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</section>;
}
