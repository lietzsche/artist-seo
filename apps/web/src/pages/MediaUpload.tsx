import { useRef, useState } from "react";
import { API_BASE, api } from "../lib/api";

type Props = { artworkId: string; csrf: string; onComplete: () => void };
type UploadState = { id: string; received_bytes: number };

// 선택창은 모바일에서 사진·영상이 모두 보이도록 image/*, video/* 로 열고, 지원 형식은 여기서 거른다.
// (형식을 하나씩 나열하면 일부 안드로이드 사진 선택기가 영상만 보여준다. 최종 확인은 서버가 파일 내용으로 한다)
const SUPPORTED = /\.(jpe?g|png|webp|mp4|mov|m4v|webm)$/i;
const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"];
const isSupported = (file: File) => SUPPORTED_TYPES.includes(file.type) || (!file.type && SUPPORTED.test(file.name));

export function MediaUpload({ artworkId, csrf, onComplete }: Props) {
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState("");
  const controller = useRef<AbortController | null>(null);
  const uploadId = useRef<string | null>(null);

  async function start(file: File): Promise<boolean> {
    setError(""); setProgress(0); setStage("업로드 준비 중");
    controller.current = new AbortController();
    try {
      const upload = await api<UploadState>("/media/uploads", { method:"POST", headers:{"Content-Type":"application/json", "X-CSRF-Token":csrf}, body:JSON.stringify({artwork_id:artworkId, filename:file.name, content_type:file.type || "application/octet-stream", total_bytes:file.size}), signal:controller.current.signal });
      uploadId.current = upload.id;
      const chunkSize = 5 * 1024 * 1024;
      let offset = upload.received_bytes;
      while (offset < file.size) {
        setStage("원본 업로드 중");
        const response = await fetch(`${API_BASE}/media/uploads/${upload.id}`, { method:"PATCH", credentials:"include", headers:{"X-CSRF-Token":csrf, "Upload-Offset":String(offset), "Content-Type":"application/offset+octet-stream"}, body:file.slice(offset, offset + chunkSize), signal:controller.current.signal });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "청크 업로드에 실패했습니다.");
        offset = Number(response.headers.get("Upload-Offset"));
        setProgress(Math.round(offset / file.size * 100));
      }
      setStage("형식 확인 및 원본 저장 중");
      await api(`/media/uploads/${upload.id}/complete`, { method:"POST", headers:{"X-CSRF-Token":csrf}, signal:controller.current.signal });
      setStage("업로드 완료");
      uploadId.current = null;
      onComplete();
      return true;
    } catch (reason) {
      if ((reason as Error).name !== "AbortError") setError(reason instanceof Error ? reason.message : "업로드에 실패했습니다.");
      setStage((reason as Error).name === "AbortError" ? "취소됨" : "실패");
      return false;
    }
  }

  async function cancel() {
    controller.current?.abort();
    if (uploadId.current) await api(`/media/uploads/${uploadId.current}`, {method:"DELETE", headers:{"X-CSRF-Token":csrf}}).catch(() => undefined);
    uploadId.current = null;
    setStage("취소됨");
  }

  const active = ["업로드 준비 중", "원본 업로드 중", "형식 확인 및 원본 저장 중"].includes(stage);

  async function startMany(files: FileList) {
    // 여러 파일을 고르면 하나씩 차례로 올린다
    const list = Array.from(files);
    const rejected = list.filter(file => !isSupported(file));
    if (rejected.length) {
      setStage("실패"); setCurrent("");
      setError(`지원하지 않는 형식입니다: ${rejected.map(f => f.name).join(", ")} (JPG·PNG·WebP 이미지, MP4·MOV·WebM 영상만 가능. 아이폰 HEIC 사진은 JPG로 바꿔 올려 주세요.)`);
      return;
    }
    for (let i = 0; i < list.length; i++) {
      setCurrent(list.length > 1 ? `${i + 1}/${list.length} · ${list[i].name}` : list[i].name);
      const ok = await start(list[i]);
      if (!ok) break;
    }
  }

  return <div className="uploader">
    <div className="line">
      <label className="btn btn-ghost btn-sm" style={{ cursor: active ? "not-allowed" : "pointer" }}>
        사진·영상 올리기
        <input type="file" multiple hidden accept="image/*,video/*" disabled={active}
          onChange={event => { const files = event.target.files; if (files?.length) void startMany(files); event.target.value = ""; }} />
      </label>
      <span className="muted">JPG·PNG·WebP 이미지, MP4·MOV·WebM 영상 · 여러 개 선택 가능</span>
    </div>
    {stage && <div className="line" role="status"><span>{current && <strong>{current}</strong>} {stage}</span>{active && <button type="button" className="link-btn" onClick={() => void cancel()}>업로드 취소</button>}</div>}
    {active && progress > 0 && <progress max="100" value={progress}>{progress}%</progress>}
    {error && <p className="err" role="alert">{error}{stage === "실패" && !error.startsWith("지원하지") ? " 같은 파일을 다시 선택하면 재시도합니다." : ""}</p>}
  </div>;
}
