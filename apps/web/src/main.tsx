import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./pages/Layout";
import { Home } from "./pages/Home";
import { Works } from "./pages/Works";
import { WorkDetail } from "./pages/WorkDetail";
import { About } from "./pages/About";
import { Contact } from "./pages/Contact";
import { Admin } from "./pages/Admin";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
// 제목용 세리프: 영문 Cormorant Garamond, 한글 Noto Serif KR (한글은 필요한 글자 조각만 내려받는다)
import "@fontsource/cormorant-garamond/300.css";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/noto-serif-kr/400.css";
import "./styles.css";

// 공개 페이지는 기본 영어(/...), 한국어는 /ko/... 주소로 같은 화면을 보여준다
const publicPages = () => [
  { index: true, element: <Home /> },
  { path: "works", element: <Works /> },
  { path: "works/:slug", element: <WorkDetail /> },
  { path: "about", element: <About /> },
  { path: "contact", element: <Contact /> },
];

const router = createBrowserRouter([{
  path: "/", element: <Layout />, children: [
    ...publicPages(),
    { path: "ko", children: publicPages() },
    { path: "admin", element: <Admin /> },
    { path: "guide", lazy: () => import("./pages/Guide").then(m => ({ Component: m.Guide })) },
  ],
}]);
const queryClient = new QueryClient();

// 앱 설치용 서비스 워커 (배포된 사이트에서만)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => undefined); });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></React.StrictMode>,
);
