import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { api } from "../lib/api";

// 작가(사이트 관리자)를 위한 사용 설명서. 실제 관리자 화면의 메뉴 이름과 맞춰 적는다.
const SECTIONS = [
  ["overview", "사이트 구성"],
  ["lang", "영어·한국어 페이지"],
  ["start", "처음 시작하기"],
  ["works", "작품 올리기"],
  ["media", "사진·영상"],
  ["profile", "작가 프로필"],
  ["collections", "시리즈·전시"],
  ["inquiries", "구매 문의"],
  ["status", "서버 현황"],
  ["faq", "자주 묻는 질문"],
  ["ops", "운영자용: 서버 관리"],
] as const;

export function Guide() {
  // 관리자 전용: 로그인하지 않았으면 로그인 화면으로 보내고, 로그인 후 다시 이 페이지로 돌아온다
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ email: string }>("/auth/me"), retry: false });
  useEffect(() => { document.title = "사용 가이드"; }, []);
  if (me.isPending) return <p className="container state" role="status">관리자 상태를 확인하는 중입니다.</p>;
  if (me.isError) return <Navigate to="/admin?next=/guide" replace />;
  return <section className="container guide">
    <header className="guide-head">
      <p className="eyebrow">Guide</p>
      <h1 className="title-lg">사이트 사용 가이드</h1>
      <p className="lead">작품을 올리고, 소개와 전시를 정리하고, 구매 문의를 받는 방법을 순서대로 정리했습니다. 모든 관리는 <Link to="/admin">관리 화면</Link>에서 합니다.</p>
    </header>

    <div className="guide-layout">
      <nav className="guide-toc" aria-label="가이드 목차">
        <ol>{SECTIONS.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}</ol>
      </nav>

      <div className="guide-body">
        <section id="overview">
          <h2>사이트 구성</h2>
          <p>방문자가 보는 공개 페이지와, 작가만 들어가는 관리 화면으로 나뉩니다. 아래 공개 페이지는 기본이 영어입니다.</p>
          <table className="guide-table">
            <thead><tr><th>주소</th><th>내용</th></tr></thead>
            <tbody>
              <tr><td><Link to="/">/</Link></td><td>홈. 대표 문구, 선정 작품(없으면 최근 작품), 대표 전시</td></tr>
              <tr><td><Link to="/works">/works</Link></td><td>공개한 작품 전체. 판매 상태, 시리즈, 연도별로 걸러 볼 수 있고, 고른 조건은 주소에 남아 그대로 공유할 수 있습니다(예: <code>/works?year=2026</code>)</td></tr>
              <tr><td>/works/작품주소</td><td>작품 상세. 사진·영상, 재료, 크기, 가격, (판매 가능 작품만) 문의 버튼</td></tr>
              <tr><td><Link to="/about">/about</Link></td><td>작가 소개, 약력, 전시 이력</td></tr>
              <tr><td><Link to="/contact">/contact</Link></td><td>구매·전시·협업 문의 양식. 입금 계좌를 넣었다면 여기에 표시됩니다</td></tr>
              <tr><td><Link to="/ko">/ko</Link></td><td>한국어 페이지. <code>/ko/works</code>, <code>/ko/about</code>처럼 위 주소 앞에 <code>/ko</code>를 붙입니다</td></tr>
              <tr><td><Link to="/admin">/admin</Link></td><td>관리 화면 (로그인 필요). 페이지 맨 아래 <b>관리</b> 링크로도 들어갈 수 있습니다</td></tr>
              <tr><td>/guide</td><td>이 가이드. 관리자로 로그인해야 보이고, 관리 화면 위쪽 <b>사용 가이드</b> 링크로 들어옵니다</td></tr>
            </tbody>
          </table>
          <h3>관리 화면 탭</h3>
          <table className="guide-table">
            <tbody>
              <tr><th>작품</th><td>작품 만들기, 사진·영상 올리기, 정보 수정, 공개·비공개, 휴지통</td></tr>
              <tr><th>문의</th><td>방문자가 보낸 문의 읽기, 확인 여부 표시</td></tr>
              <tr><th>작가 프로필</th><td>이름, 홈 문구, 소개, 약력, 입금 계좌 (영어 칸 포함)</td></tr>
              <tr><th>시리즈·전시</th><td>연작과 전시 이력 추가·수정·삭제</td></tr>
              <tr><th>서버 현황</th><td>저장 공간, 확인하지 않은 문의 수, 실패한 사진 처리</td></tr>
            </tbody>
          </table>
        </section>

        <section id="lang">
          <h2>영어·한국어 페이지</h2>
          <ul>
            <li>사이트 기본 언어는 <b>영어</b>입니다. 도메인으로 들어오면 영어 페이지가 열립니다.</li>
            <li>한국어 페이지는 주소 앞에 <code>/ko</code>가 붙습니다(예: <code>/ko/works</code>). 메뉴 오른쪽 <i>한국어</i> / <i>EN</i> 버튼으로 오갈 수 있습니다.</li>
            <li>메뉴나 버튼 같은 사이트 글자는 자동으로 바뀝니다. <b>작품 제목·설명, 작가 소개, 전시명</b>은 관리 화면의 <i>영어 페이지</i> 칸에 직접 써야 합니다.</li>
            <li>영어 칸을 비워 두면 영어 페이지에도 한국어 내용이 그대로 나옵니다. 우선 한국어로 올리고 영어는 나중에 채워도 됩니다.</li>
            <li>관리 화면과 이 가이드는 한국어로만 보입니다.</li>
          </ul>
          <p className="guide-note">가격은 영어 칸을 따로 둘 수 있습니다(예: 한국어 <code>3,000,000원</code>, 영어 <code>KRW 3,000,000</code>). 크기(예: <code>120 × 80 cm</code>)와 연도는 두 언어에 같이 쓰입니다.</p>
        </section>

        <section id="start">
          <h2>처음 시작하기</h2>
          <ol className="steps">
            <li><b>관리자 계정 만들기</b> — 사이트를 처음 열면 어느 주소로 들어가도 <i>관리자 계정 설정</i> 화면이 나옵니다. 작가 이름, 이메일, 비밀번호(10자 이상)를 넣으면 바로 로그인됩니다. 계정은 한 번만 만들 수 있으니, 사이트를 공개하자마자 먼저 만들어 두세요.</li>
            <li><b>작가 프로필 채우기</b> — 관리 화면의 <i>작가 프로필</i> 탭에서 이름, 홈 대표 문구, 소개, 약력을 넣습니다.</li>
            <li><b>작품 올리기</b> — <i>작품</i> 탭에서 작품을 만들고 사진을 올린 뒤 공개합니다. 아래 순서를 참고하세요.</li>
          </ol>
          <p className="guide-note">로그인은 <b>24시간</b> 유지됩니다. 작업 중 풀리면 로그인 화면으로 돌아가니 다시 로그인하면 됩니다. 비밀번호를 15분 안에 5번 틀리면 15분 동안 로그인이 막힙니다. 다른 사람과 같이 쓰는 컴퓨터라면 관리 화면 오른쪽 위 <i>로그아웃</i>을 눌러 두세요.</p>
        </section>

        <section id="works">
          <h2>작품 올리기</h2>
          <ol className="steps">
            <li><b>새 작품 만들기</b> — <i>작품</i> 탭 맨 위 <i>새 작품</i>에 제목만 넣고 <i>작품 만들기</i>를 누릅니다. 연도와 재료는 선택입니다. 만든 작품은 <b>비공개</b> 상태라 아직 사이트에 보이지 않습니다.</li>
            <li><b>사진·영상 올리기</b> — 만들면 바로 편집기가 열립니다. <i>사진·영상 올리기</i>로 파일을 고릅니다. 여러 장을 한 번에 골라도 됩니다.</li>
            <li><b>정보 채우기</b> — 크기, 작품 설명, 시리즈, 판매 상태, 가격을 넣습니다. 아래 <i>영어 페이지</i> 칸에 영어 제목·설명도 넣을 수 있습니다.</li>
            <li><b>공개하기</b> — <i>사이트에 공개</i>를 체크하고 <i>저장</i>을 누르면 사이트에 나타납니다. 저장 옆의 <i>사이트에서 보기</i>를 누르면 새 창에 영어 페이지가 열리고, 오른쪽 위 <i>한국어</i>로 한국어 화면도 확인할 수 있습니다.</li>
          </ol>

          <h3>편집기 항목</h3>
          <table className="guide-table">
            <tbody>
              <tr><th>주소(영문 슬러그)</th><td>작품 페이지 주소입니다(예: <code>morning-light</code> → /works/morning-light). 영문 소문자·숫자·하이픈만 쓸 수 있고, 처음에 비워 두면 자동으로 만들어집니다. 이미 공유한 작품의 주소를 바꾸면 예전 링크가 열리지 않습니다.</td></tr>
              <tr><th>판매 상태</th><td>
                <i>판매 가능</i>: 상세에 가격과 <i>이 작품 문의하기</i> 버튼이 나옵니다.<br />
                <i>판매 완료</i>: 목록과 상세에 빨간 점과 함께 ‘판매 완료’로 표시되고, 가격과 문의 버튼은 숨겨집니다.<br />
                <i>비매품</i>: 가격과 문의 버튼 없이 작품만 보여줍니다.</td></tr>
              <tr><th>가격 / 가격 공개</th><td>가격은 자유롭게 적습니다(예: 3,000,000원). 영어 페이지용 가격은 <i>영어 가격</i> 칸에 따로 적습니다. <i>가격 공개</i>를 끄면 방문자에게는 가격 대신 ‘문의’로 보입니다. 가격은 <i>판매 가능</i> 작품에만 표시됩니다.</td></tr>
              <tr><th>크기</th><td>영어·한국어 페이지에 같은 값이 나오므로 <code>120 × 80 cm</code>처럼 숫자와 단위로 적는 것을 권장합니다.</td></tr>
              <tr><th>대표 작품</th><td>체크한 작품이 홈의 <i>선정 작품</i>에 나옵니다. 그중 사진이 있는 첫 작품이 홈 첫 화면의 큰 사진이 됩니다. 대표 작품이 하나도 없으면 최근 작품이 대신 나옵니다.</td></tr>
              <tr><th>시리즈</th><td>작품을 연작으로 묶습니다. 먼저 <i>시리즈·전시</i> 탭에서 시리즈를 만들어야 목록에 나옵니다.</td></tr>
              <tr><th>휴지통으로</th><td>작품을 사이트와 관리 목록에서 지웁니다. 화면에서 되돌리는 기능은 없으니, 잠시 숨기려면 휴지통 대신 <i>사이트에 공개</i> 체크를 끄세요. 휴지통으로 옮겨도 작품 정보와 원본 파일은 서버에 남아 있어, 실수로 옮겼다면 운영자가 서버에서 되살릴 수 있습니다.</td></tr>
            </tbody>
          </table>
          <p className="guide-note">작품 목록의 표시: <span className="badge on">공개</span> <span className="badge">비공개</span> <span className="badge">대표</span> <span className="badge warn">변환 중</span> <span className="badge bad">변환 실패</span></p>
        </section>

        <section id="media">
          <h2>사진·영상</h2>
          <ul>
            <li><b>올릴 수 있는 형식</b>: 사진은 JPG·PNG·WebP(한 장 20MB까지), 영상은 MP4·WebM입니다. 아이폰 MOV 영상은 MP4로 내보내서 올리세요.</li>
            <li><b>아이폰 사진(HEIC)</b>은 그대로 올라가지 않습니다. 아이폰 <i>설정 → 카메라 → 포맷 → 높은 호환성</i>으로 바꾸고 찍거나, JPG로 바꿔서 올리세요.</li>
            <li>사진은 업로드가 끝나면 서버가 바로 웹용 크기로 만들어 미리보기가 나타납니다. <b>영상은 변환하지 않고 올린 파일을 그대로 재생</b>하므로, H.264 MP4(또는 WebM), 일반 영상(SDR), 가로 1920px 이하, 5~10Mbps 정도로 내보낸 파일을 올리세요. 크고 무거운 파일은 방문자 화면에서 첫 재생이 느립니다.</li>
            <li><b>먼저 올린 사진</b>이 작품의 대표 이미지(목록·홈 썸네일)가 됩니다. 영상이면 영상의 한 장면이 대표 이미지로 쓰이고, 목록에서 제목 옆에 <code>VIDEO</code>가 붙습니다.</li>
            <li><b>대표 이미지를 바꾸려면</b> 앞에 있는 사진을 <i>빼기</i>로 빼면 다음 사진이 대표가 됩니다. 뺀 사진은 다시 올리면 맨 뒤로 갑니다.</li>
            <li>상세 페이지에는 올린 순서대로 모든 사진·영상이 세로로 이어서 나옵니다.</li>
            <li>원본 파일은 화질 그대로 서버에 따로 보관되고, 방문자에게는 웹용 사본만 보입니다.</li>
            <li>업로드 중에는 진행률이 표시되고 <i>업로드 취소</i>로 멈출 수 있습니다. 중간에 실패하면 같은 파일을 다시 고르면 됩니다. 업로드가 끝날 때까지 창을 닫지 마세요.</li>
            <li><b>용량 한도</b>: 사진은 한 장 20MB, 영상은 파일 하나 5GB, 전체 원본은 100GB까지입니다.</li>
            <li>아이폰 등에서 찍은 HDR 영상은 일부 기기에서 색이 바래 보이므로 일반 영상(SDR)으로 내보내서 올리세요. 영상의 1초 지점 화면이 대표 이미지(포스터)로 자동 등록됩니다.</li>
            <li>사진을 작품에서 빼려면 사진 아래 <i>빼기</i>를 누릅니다.</li>
          </ul>
        </section>

        <section id="profile">
          <h2>작가 프로필</h2>
          <table className="guide-table">
            <tbody>
              <tr><th>작가 이름</th><td>사이트 왼쪽 위와 브라우저 탭 제목에 표시됩니다.</td></tr>
              <tr><th>활동 지역</th><td>소개 페이지와 페이지 맨 아래에 표시됩니다.</td></tr>
              <tr><th>홈 대표 문구</th><td>홈 첫 화면의 큰 제목입니다.</td></tr>
              <tr><th>홈 소개 문장</th><td>대표 문구 아래 짧은 소개입니다.</td></tr>
              <tr><th>작가 소개</th><td>소개 페이지 본문입니다. 줄을 바꾸면 문단이 나뉩니다.</td></tr>
              <tr><th>약력</th><td>한 줄에 하나씩 적습니다. <code>2024 개인전 《빛》, 서울</code>처럼 연도로 시작하면 연도가 왼쪽에 따로 정렬됩니다.</td></tr>
              <tr><th>영어 페이지 칸</th><td>위 항목들의 영어판입니다. 비워 둔 칸은 영어 페이지에도 한국어로 나옵니다.</td></tr>
              <tr><th>입금 계좌</th><td>은행, 계좌번호, 예금주를 넣으면 문의 페이지(영어·한국어)에 표시되고, 방문자가 <i>복사</i> 버튼으로 계좌번호를 복사할 수 있습니다. 계좌번호를 비우면 숨겨집니다. <b>누구나 볼 수 있는 페이지</b>이니 공개해도 되는 계좌만 넣으세요.</td></tr>
              <tr><th>안내 문구</th><td>계좌 아래 나오는 문장입니다. 비우면 ‘작품 구매가 확정된 뒤에 입금해 주세요’가 나옵니다. 해외 구매자는 국내 계좌로 송금하기 어려우니, <i>영어 안내 문구</i>에 <code>Please contact us for international payment.</code>처럼 따로 안내하는 것을 권장합니다.</td></tr>
            </tbody>
          </table>
          <p className="guide-note">프로필은 탭 맨 아래 <i>프로필 저장</i>을 눌러야 반영됩니다. 영어 칸과 입금 계좌도 같은 버튼으로 저장됩니다.</p>
        </section>

        <section id="collections">
          <h2>시리즈·전시</h2>
          <ul>
            <li><b>시리즈</b>: 연작 이름을 만들어 두면 작품 편집기에서 고를 수 있고, 작품 페이지에서 시리즈별로 걸러 볼 수 있습니다. 시리즈가 하나도 없으면 작품 페이지에 시리즈 선택이 나타나지 않습니다. 연도 선택은 작품에 연도를 넣으면 자동으로 생깁니다. <i>정렬 순서</i> 숫자가 작을수록 앞에 나옵니다.</li>
            <li><b>시리즈 설명</b>은 지금은 관리용 메모로만 쓰이고 사이트에는 표시되지 않습니다.</li>
            <li><b>전시</b>: 전시명, 장소, 기간을 넣고 <i>사이트에 공개</i>를 체크하면 소개 페이지의 전시 이력에 <code>연도 · 전시명, 장소, 지역</code>으로 나타납니다. 전시 주소(슬러그)는 영문으로 직접 넣어야 합니다(예: <code>solo-2026</code>).</li>
            <li><b>홈의 전시 소개</b>: 공개 전시 중 <i>정렬 순서</i> 숫자가 가장 작은 전시 하나가 홈 아래쪽에 기간·장소·설명과 함께 크게 나옵니다. 순서가 같으면 시작일이 최근인 전시가 앞섭니다. 지금 진행 중인 전시를 홈에 띄우려면 그 전시의 정렬 순서를 0으로, 나머지를 1 이상으로 두세요.</li>
          </ul>
          <p className="guide-note">목록에서 <i>편집</i>을 누르면 내용을 고치거나 <i>삭제</i>할 수 있습니다. 작품에서 쓰고 있는 시리즈는 지울 수 없으니, 먼저 그 작품들의 시리즈를 바꾸세요. 전시는 지우면 되돌릴 수 없으니 잠시 숨기려면 <i>사이트에 공개</i>를 끄세요.</p>
        </section>

        <section id="inquiries">
          <h2>구매 문의</h2>
          <ul>
            <li>방문자는 판매 가능 작품 상세의 <i>이 작품 문의하기</i> 버튼이나 <Link to="/contact">문의</Link> 페이지로 이름, 이메일, 내용(10자 이상)을 보냅니다. 개인정보 수집 동의에 체크해야 보낼 수 있습니다. 작품 페이지에서 들어오면 어떤 작품에 대한 문의인지 함께 기록되고, 문의 탭에 작품 링크가 붙습니다.</li>
            <li>관리 화면 <i>문의</i> 탭에서 내용을 봅니다. 확인하지 않은 문의가 있으면 탭 이름 옆에 숫자가 붙고, 목록에서 <span className="badge warn">미확인</span>으로 표시됩니다.</li>
            <li>방문자는 회원가입이나 로그인 없이 문의를 보내므로 사이트 안에서 답장할 곳이 없습니다. <b>답변은 문의에 적힌 이메일로 직접 보내 주세요.</b> 이메일 옆 <i>복사</i>를 누르면 주소가 복사됩니다. 작품 문의라면 메일 제목에 작품명을 넣어 주면 상대가 알아보기 쉽습니다.</li>
            <li>읽은 문의는 <i>확인함으로 표시</i>를 누르세요. <span className="badge on">확인함</span>으로 바뀌고 미확인 수에서 빠집니다. 다시 챙겨야 하면 <i>미확인으로 되돌리기</i>를 누릅니다.</li>
            <li>위쪽 <i>전체</i> / <i>미확인</i> 버튼으로 아직 확인하지 않은 문의만 모아 볼 수 있습니다.</li>
            <li><i>삭제</i>하면 보낸 사람의 이름·이메일·내용이 지워지고 되돌릴 수 없습니다. 개인정보 삭제를 요청받았을 때 쓰세요.</li>
            <li>방문자가 보내기를 누르면 화면 가운데 팝업으로 접수 완료(또는 실패)가 안내됩니다. 문의 횟수 제한은 없어서 여러 작품을 연달아 문의해도 모두 들어옵니다. 한 곳에서 요청이 비정상적으로 몰리는 공격은 Cloudflare가 앞단에서 막습니다.</li>
          </ul>
          <p className="guide-note">새 문의가 와도 메일이나 알림은 아직 오지 않습니다. 관리 화면에 들어와 <i>문의</i> 탭을 확인해 주세요.</p>
        </section>

        <section id="status">
          <h2>서버 현황</h2>
          <ul>
            <li><b>저장된 원본 / 한도</b>: 지금까지 올린 원본 파일 용량과 최대 용량입니다.</li>
            <li><b>남은 저장 용량</b>: 한도에서 저장된 원본과 진행 중인 업로드를 뺀 용량입니다. 다 차면 새 업로드가 거절됩니다.</li>
            <li><b>확인하지 않은 문의</b>: 아직 <i>확인함</i>으로 표시하지 않은 문의 수입니다.</li>
            <li><b>최근 실패한 이미지 처리</b>: 웹용 크기로 만들지 못한 사진이 여기에 나타납니다. <i>재시도</i>를 눌러 보고, 계속 실패하면 파일을 다른 형식(JPG)으로 바꿔 다시 올려 보세요.</li>
          </ul>
        </section>

        <section id="faq">
          <h2>자주 묻는 질문</h2>
          <dl className="faq">
            <dt>작품을 만들었는데 사이트에 안 보여요.</dt>
            <dd>편집기에서 <i>사이트에 공개</i>를 체크하고 <i>저장</i>을 눌렀는지 확인하세요. 목록에 <span className="badge on">공개</span>가 보여야 합니다.</dd>
            <dt>사진이 계속 ‘변환 중’이에요.</dt>
            <dd>보통은 업로드가 끝나는 즉시 처리됩니다. 그대로면 <i>서버 현황</i> 탭에 실패한 작업이 있는지 확인하세요.</dd>
            <dt>“지원하지 않는 형식입니다”라고 나와요.</dt>
            <dd>아이폰 HEIC 사진이나 MOV 영상일 가능성이 큽니다. 사진은 JPG로, 영상은 MP4로 바꿔 올리세요.</dd>
            <dt>영어 페이지에 한국어가 나와요.</dt>
            <dd>그 항목의 영어 칸이 비어 있어서 한국어를 대신 보여주는 것입니다. 작품 편집기나 작가 프로필의 <i>영어 페이지</i> 칸을 채우고 저장하세요.</dd>
            <dt>작품 페이지에 시리즈 선택이 안 보여요.</dt>
            <dd>시리즈가 하나도 없으면 숨겨집니다. <i>시리즈·전시</i> 탭에서 만들고, 작품 편집기에서 작품마다 시리즈를 지정하세요. 연도 선택도 작품에 연도를 넣어야 나타납니다.</dd>
            <dt>시리즈를 지울 수 없다고 나와요.</dt>
            <dd>그 시리즈를 쓰는 작품이 있어서입니다. 해당 작품들의 시리즈를 ‘없음’이나 다른 시리즈로 바꾼 뒤 지우세요.</dd>
            <dt>작품을 실수로 휴지통에 넣었어요.</dt>
            <dd>화면에서는 되살릴 수 없지만 서버에는 남아 있습니다. 아래 <i>운영자용</i>을 참고하거나 운영자에게 작품 제목을 알려 주세요.</dd>
            <dt>문의가 와도 알림이 없어요.</dt>
            <dd>아직 메일·휴대폰 알림 기능이 없습니다. 관리 화면 <i>문의</i> 탭 숫자로 확인하세요.</dd>
            <dt>휴대폰에 앱처럼 설치할 수 있나요?</dt>
            <dd>네. 사이트 맨 아래 <i>앱으로 설치</i>(영어 페이지는 <i>Install app</i>)를 누르면 홈 화면에 사이트 아이콘이 생기고, 누르면 주소창 없이 앱처럼 열립니다. 안드로이드·PC 크롬에서는 바로 설치 창이 뜨고, 아이폰은 Safari의 <i>공유 → 홈 화면에 추가</i>로 설치합니다. 이미 설치한 기기에서는 버튼이 보이지 않습니다. 설치해도 항상 최신 내용을 불러오고, 인터넷이 끊기면 안내 화면이 나옵니다.</dd>
            <dt>비밀번호를 잊었어요.</dt>
            <dd>화면에서 재설정할 수는 없습니다. 아래 <i>운영자용</i>의 비밀번호 재설정 방법으로 서버에서 새 비밀번호를 지정합니다.</dd>
            <dt>홈의 큰 사진은 어떻게 바꾸나요?</dt>
            <dd>작품 편집기에서 <i>대표 작품</i>을 체크하세요. 대표 작품 중 사진이 있는 첫 작품이 홈 큰 사진이 됩니다.</dd>
          </dl>
        </section>

        <section id="ops">
          <h2>운영자용: 서버 관리</h2>
          <p>사이트를 돌리는 컴퓨터(서버)에서 터미널로 하는 일입니다. 모든 명령은 프로젝트 폴더(<code>artist-seo</code>)에서 실행합니다.</p>
          <table className="guide-table">
            <tbody>
              <tr><th>코드 반영(배포)</th><td><code>./scripts/deploy.sh</code> — 설정 점검 → DB 백업 → 빌드·재시작 → 접속 확인까지 한 번에 합니다. GitHub의 최신 코드를 받아서 배포하려면 <code>./scripts/deploy.sh --pull</code>.</td></tr>
              <tr><th>백업</th><td>배포할 때마다 DB가 <code>backups/</code> 폴더에 <code>db-날짜.sql.gz</code>로 저장되고 최근 10개가 남습니다. 사진·영상 파일은 DB 백업에 들어가지 않고 Docker 볼륨(<code>artist_originals</code>, <code>artist_public</code>)에 있습니다.</td></tr>
              <tr><th>비밀번호 재설정</th><td><code>.env</code>의 <code>ADMIN_EMAIL</code>에 관리자 이메일, <code>ADMIN_PASSWORD</code>에 새 비밀번호(10자 이상)를 넣고 <code>./scripts/deploy.sh</code>를 실행하면 그 비밀번호로 바뀝니다.</td></tr>
              <tr><th>휴지통 작품 되살리기</th><td><code>{`docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`}</code>로 DB에 들어가 <code>{`UPDATE artworks SET deleted_at = NULL WHERE title = '작품 제목';`}</code>를 실행합니다. 되살린 작품은 비공개 상태이니 관리 화면에서 다시 공개하세요.</td></tr>
              <tr><th>상태·로그 보기</th><td><code>docker compose --profile tunnel ps</code> (실행 상태), <code>docker compose logs -f api</code> (서버 기록), <code>docker compose logs cloudflared</code> (도메인 연결)</td></tr>
              <tr><th>도메인이 안 열릴 때</th><td>Cloudflare 대시보드의 터널 경로가 <code>http://gateway:8080</code>인지, <code>.env</code>의 <code>PUBLIC_ORIGIN</code>이 실제 주소(<code>https://…</code>)와 같은지 확인합니다. 자세한 내용은 저장소의 <code>docs/deploy-cloudflare.md</code>에 있습니다.</td></tr>
            </tbody>
          </table>
          <p className="guide-note"><code>docker compose down -v</code>처럼 <code>-v</code>를 붙이면 <b>DB와 업로드한 사진·영상이 모두 지워집니다.</b> 운영 중에는 절대 쓰지 마세요. 컨테이너만 멈추려면 <code>-v</code> 없이 <code>docker compose --profile tunnel down</code>을 씁니다.</p>
        </section>
      </div>
    </div>
  </section>;
}
