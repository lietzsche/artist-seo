import { useEffect, useState } from "react";

// 크롬·엣지·삼성 인터넷이 주는 설치 이벤트 (표준 타입에 아직 없다)
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** 앱 설치 버튼 상태: 안드로이드·PC 크롬은 설치 창을 띄우고, 아이폰은 ‘홈 화면에 추가’ 방법을 안내한다. 이미 설치해 열었으면 숨긴다. */
export function useInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(() => standalone());
  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  if (installed) return { mode: "none" as const };
  if (prompt) return { mode: "prompt" as const, install: async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); } };
  if (isIos()) return { mode: "ios" as const };
  return { mode: "none" as const };
}
