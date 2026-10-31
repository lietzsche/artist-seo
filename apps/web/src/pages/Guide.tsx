import { useEffect } from "react";
import { Link } from "react-router-dom";

// 작가(사이트 관리자)를 위한 사용 설명서. 실제 관리자 화면의 메뉴 이름과 맞춰 적는다.
const SECTIONS = [
  ["overview", "사이트 구성"],
  ["start", "처음 시작하기"],
  ["works", "작품 올리기"],
  ["media", "사진·영상"],
  ["profile", "작가 프로필"],
  ["collections", "시리즈·전시"],
  ["inquiries", "구매 문의"],
  ["status", "서버 현황"],
  ["faq", "자주 묻는 질문"],
] as const;

export function Guide() {
  useEffect(() => { document.title = "사용 가이드"; }, []);
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
          <p>방문자가 보는 공개 페이지와, 작가만 들어가는 관리 화면으로 나뉩니다.</p>
          <table className="guide-table">
            <thead><tr><th>주소</th><th>내용</th></tr></thead>
            <tbody>
              <tr><td><Link to="/">/</Link></td><td>홈. 대표 문구, 선정 작품(없으면 최근 작품), 대표 전시</td></tr>
              <tr><td><Link to="/works">/works</Link></td><td>공개한 작품 전체. 시리즈별로 걸러 볼 수 있습니다</td></tr>
              <tr><td>/works/작품주소</td><td>작품 상세. 사진·영상, 재료, 크기, 가격, (판매 가능 작품만) 문의 버튼</td></tr>
              <tr><td><Link to="/about">/about</Link></td><td>작가 소개, 약력, 전시 이력</td></tr>
              <tr><td><Link to="/contact">/contact</Link></td><td>구매·전시·협업 문의 양식</td></tr>
              <tr><td><Link to="/admin">/admin</Link></td><td>관리 화면 (로그인 필요). 페이지 맨 아래 <b>관리</b> 링크로도 들어갈 수 있습니다</td></tr>
            </tbody>
          </table>
        </section>

        <section id="start">
          <h2>처음 시작하기</h2>
          <ol className="steps">
            <li><b>관리자 계정 만들기</b> — 사이트를 처음 열면 어느 주소로 들어가도 <i>관리자 계정 설정</i> 화면이 나옵니다. 작가 이름, 이메일, 비밀번호(10자 이상)를 넣으면 바로 로그인됩니다. 계정은 한 번만 만들 수 있으니, 사이트를 공개하자마자 먼저 만들어 두세요.</li>
            <li><b>작가 프로필 채우기</b> — 관리 화면의 <i>작가 프로필</i> 탭에서 이름, 홈 대표 문구, 소개, 약력을 넣습니다.</li>
            <li><b>작품 올리기</b> — <i>작품</i> 탭에서 작품을 만들고 사진을 올린 뒤 공개합니다. 아래 순서를 참고하세요.</li>
          </ol>
          <p className="guide-note">로그인은 일정 시간이 지나면 풀립니다. 작업 중 풀리면 로그인 화면으로 돌아가니 다시 로그인하면 됩니다. 비밀번호를 15분 안에 5번 틀리면 잠시 로그인이 막힙니다.</p>
        </section>

        <section id="works">
          <h2>작품 올리기</h2>
          <ol className="steps">
            <li><b>새 작품 만들기</b> — <i>작품</i> 탭 맨 위 <i>새 작품</i>에 제목만 넣고 <i>작품 만들기</i>를 누릅니다. 연도와 재료는 선택입니다. 만든 작품은 <b>비공개</b> 상태라 아직 사이트에 보이지 않습니다.</li>
            <li><b>사진·영상 올리기</b> — 만들면 바로 편집기가 열립니다. <i>사진·영상 올리기</i>로 파일을 고릅니다. 여러 장을 한 번에 골라도 됩니다.</li>
            <li><b>정보 채우기</b> — 크기, 작품 설명, 시리즈, 판매 상태, 가격을 넣습니다.</li>
            <li><b>공개하기</b> — <i>사이트에 공개</i>를 체크하고 <i>저장</i>을 누르면 사이트에 나타납니다. 저장 옆의 <i>사이트에서 보기</i>로 바로 확인할 수 있습니다.</li>
          </ol>

          <h3>편집기 항목</h3>
          <table className="guide-table">
            <tbody>
              <tr><th>주소(영문 슬러그)</th><td>작품 페이지 주소입니다(예: <code>morning-light</code> → /works/morning-light). 영문 소문자·숫자·하이픈만 쓸 수 있고, 처음에 비워 두면 자동으로 만들어집니다. 이미 공유한 작품의 주소를 바꾸면 예전 링크가 열리지 않습니다.</td></tr>
              <tr><th>판매 상태</th><td><i>판매 가능</i> · <i>판매 완료</i> · <i>비매품</i> 중 고릅니다. 작품 목록과 상세에 표시됩니다.</td></tr>
              <tr><th>가격 / 가격 공개</th><td>가격은 자유롭게 적습니다(예: 3,000,000원). <i>가격 공개</i>를 끄면 방문자에게는 가격 대신 ‘문의’로 보입니다.</td></tr>
              <tr><th>대표 작품</th><td>체크한 작품이 홈의 <i>선정 작품</i>에 나옵니다. 그중 사진이 있는 첫 작품이 홈 첫 화면의 큰 사진이 됩니다. 대표 작품이 하나도 없으면 최근 작품이 대신 나옵니다.</td></tr>
              <tr><th>시리즈</th><td>작품을 연작으로 묶습니다. 먼저 <i>시리즈·전시</i> 탭에서 시리즈를 만들어야 목록에 나옵니다.</td></tr>
              <tr><th>휴지통으로</th><td>작품을 사이트와 관리 목록에서 지웁니다. 화면에서 되돌리는 기능은 없으니, 잠시 숨기려면 휴지통 대신 <i>사이트에 공개</i> 체크를 끄세요.</td></tr>
            </tbody>
          </table>
          <p className="guide-note">작품 목록의 표시: <span className="badge on">공개</span> <span className="badge">비공개</span> <span className="badge">대표</span> <span className="badge warn">변환 중</span> <span className="badge bad">변환 실패</span></p>
        </section>

        <section id="media">
          <h2>사진·영상</h2>
          <ul>
            <li><b>올릴 수 있는 형식</b>: 사진은 JPG·PNG·WebP, 영상은 MP4·MOV·WebM입니다.</li>
            <li><b>아이폰 사진(HEIC)</b>은 그대로 올라가지 않습니다. 아이폰 <i>설정 → 카메라 → 포맷 → 높은 호환성</i>으로 바꾸고 찍거나, JPG로 바꿔서 올리세요.</li>
            <li>올린 뒤 <span className="badge warn">변환 중</span>이 잠시 표시됩니다. 서버가 웹용 크기로 바꾸는 중이고, 영상은 몇 분 걸릴 수 있습니다. 끝나면 자동으로 미리보기가 나타납니다.</li>
            <li><b>먼저 올린 사진</b>이 작품의 대표 이미지(목록·홈 썸네일)가 됩니다. 영상만 있으면 영상의 첫 장면이 쓰입니다.</li>
            <li>원본 파일은 화질 그대로 서버에 따로 보관되고, 방문자에게는 웹용 사본만 보입니다.</li>
            <li>업로드 중에는 진행률이 표시되고 <i>업로드 취소</i>로 멈출 수 있습니다. 중간에 실패하면 같은 파일을 다시 고르면 됩니다. 업로드가 끝날 때까지 창을 닫지 마세요.</li>
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
            </tbody>
          </table>
        </section>

        <section id="collections">
          <h2>시리즈·전시</h2>
          <ul>
            <li><b>시리즈</b>: 연작 이름을 만들어 두면 작품 편집기에서 고를 수 있고, 작품 페이지에서 시리즈별로 걸러 볼 수 있습니다. <i>정렬 순서</i> 숫자가 작을수록 앞에 나옵니다.</li>
            <li><b>전시</b>: 전시명, 장소, 기간을 넣고 <i>사이트에 공개</i>를 체크하면 소개 페이지의 전시 이력에 나타납니다. 정렬 순서가 가장 앞선 공개 전시는 홈에도 소개됩니다. 전시 주소(슬러그)는 영문으로 직접 넣어야 합니다(예: <code>solo-2026</code>).</li>
          </ul>
          <p className="guide-note">지금은 시리즈와 전시를 <b>추가</b>만 할 수 있고, 관리 화면에서 고치거나 지울 수는 없습니다. 넣기 전에 내용을 한 번 더 확인하세요.</p>
        </section>

        <section id="inquiries">
          <h2>구매 문의</h2>
          <ul>
            <li>방문자는 판매 가능 작품 상세의 <i>이 작품 문의하기</i> 버튼이나 <Link to="/contact">문의</Link> 페이지로 이름, 이메일, 내용을 보냅니다. 작품 페이지에서 들어오면 어떤 작품에 대한 문의인지 함께 기록됩니다.</li>
            <li>새 문의가 몇 건인지는 관리 화면 <i>서버 현황</i> 탭에서 볼 수 있습니다.</li>
          </ul>
          <p className="guide-note">문의 <b>내용</b>을 보는 화면은 아직 준비 중입니다. 그 전까지는 사이트를 운영하는 분께 문의 내역 확인을 요청하세요.</p>
        </section>

        <section id="status">
          <h2>서버 현황</h2>
          <ul>
            <li><b>저장된 원본 / 한도</b>: 지금까지 올린 원본 파일 용량과 최대 용량입니다.</li>
            <li><b>디스크 잔여 공간</b>: 서버 저장 공간이 얼마나 남았는지 보여줍니다. 거의 차면 새 업로드가 거절됩니다.</li>
            <li><b>새 구매 문의</b>: 아직 처리하지 않은 문의 수입니다.</li>
            <li><b>최근 실패한 변환 작업</b>: 사진·영상 변환이 실패한 경우 여기에 나타납니다. <i>재시도</i>를 눌러 보고, 계속 실패하면 파일을 다른 형식으로 바꿔 다시 올려 보세요.</li>
          </ul>
        </section>

        <section id="faq">
          <h2>자주 묻는 질문</h2>
          <dl className="faq">
            <dt>작품을 만들었는데 사이트에 안 보여요.</dt>
            <dd>편집기에서 <i>사이트에 공개</i>를 체크하고 <i>저장</i>을 눌렀는지 확인하세요. 목록에 <span className="badge on">공개</span>가 보여야 합니다.</dd>
            <dt>사진이 계속 ‘변환 중’이에요.</dt>
            <dd>영상은 길이에 따라 몇 분 걸립니다. 10분 넘게 그대로면 <i>서버 현황</i> 탭에 실패한 작업이 있는지 확인하세요.</dd>
            <dt>“지원하지 않는 형식입니다”라고 나와요.</dt>
            <dd>아이폰 HEIC 사진일 가능성이 큽니다. JPG로 바꿔 올리세요.</dd>
            <dt>비밀번호를 잊었어요.</dt>
            <dd>화면에서 재설정할 수는 없습니다. 사이트를 운영하는 분께 요청하면 서버 설정으로 새 비밀번호를 지정할 수 있습니다.</dd>
            <dt>홈의 큰 사진은 어떻게 바꾸나요?</dt>
            <dd>작품 편집기에서 <i>대표 작품</i>을 체크하세요. 대표 작품 중 사진이 있는 첫 작품이 홈 큰 사진이 됩니다.</dd>
          </dl>
        </section>
      </div>
    </div>
  </section>;
}
