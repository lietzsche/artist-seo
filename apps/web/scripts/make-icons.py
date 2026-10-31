# 사이트 아이콘(SVG) 생성기. 사용법: python3 scripts/make-icons.py <출력 폴더>
# 만든 SVG를 크롬으로 192·512·180·32px PNG로 그린 뒤 public/ 과 public/icons/ 에 넣는다.
# 테마 아이콘 SVG 생성: 먹색 바탕 + 얇은 원 + 맞춤 십자 + 뼈마디처럼 이어진 곡선(척추)
import math, sys
BONE = "#d6c7ae"; INK = "#e3dacb"; BG = "#0b0a08"

def spine(n, p0, p1, p2, rx, ry, start=0.0, end=1.0):
    out = []
    for i in range(n):
        t = start + (end - start) * i / (n - 1)
        x = (1-t)**2*p0[0] + 2*(1-t)*t*p1[0] + t**2*p2[0]
        y = (1-t)**2*p0[1] + 2*(1-t)*t*p1[1] + t**2*p2[1]
        dx = 2*(1-t)*(p1[0]-p0[0]) + 2*t*(p2[0]-p1[0])
        dy = 2*(1-t)*(p1[1]-p0[1]) + 2*t*(p2[1]-p1[1])
        ang = math.degrees(math.atan2(dy, dx)) + 90  # 마디는 곡선에 수직
        s = 0.55 + 0.45 * math.sin(math.pi * (0.15 + 0.85 * i / (n - 1)))  # 끝으로 갈수록 가늘게
        out.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{rx*s:.1f}" ry="{ry*s:.1f}" transform="rotate({ang:.1f} {x:.1f} {y:.1f})" fill="{BONE}"/>')
    return "\n  ".join(out)

def full(rounded=False):
    grid = []
    for v in (128, 256, 384):
        grid.append(f'<path d="M{v} 0V512M0 {v}H512" stroke="{INK}" stroke-opacity=".07" stroke-width="2"/>')
    for x in (128, 384):
        for y in (128, 384):
            grid.append(f'<path d="M{x-12} {y}h24M{x} {y-12}v24" stroke="{INK}" stroke-opacity=".35" stroke-width="2.5"/>')
    rx = ' rx="96"' if rounded else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512"{rx} fill="{BG}"/>
  {"".join(grid)}
  <circle cx="256" cy="256" r="158" fill="none" stroke="{INK}" stroke-opacity=".55" stroke-width="4"/>
  <path d="M256 70v58M256 384v58M70 256h58M384 256h58" stroke="{INK}" stroke-opacity=".5" stroke-width="3"/>
  <path d="M200 130Q395 250 215 395" fill="none" stroke="{BONE}" stroke-opacity=".55" stroke-width="3"/>
  {spine(12, (200, 130), (395, 250), (215, 395), 30, 13)}
</svg>'''

def small():
    # 탭(16~32px)용: 격자를 빼고 선을 굵게
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="110" fill="{BG}"/>
  <circle cx="256" cy="256" r="178" fill="none" stroke="{INK}" stroke-opacity=".7" stroke-width="26"/>
  <path d="M205 120Q420 250 215 400" fill="none" stroke="{BONE}" stroke-width="14"/>
  {spine(6, (205, 120), (420, 250), (215, 400), 66, 30)}
</svg>'''

open(sys.argv[1] + "/icon.svg", "w").write(full())
open(sys.argv[1] + "/icon-rounded.svg", "w").write(full(rounded=True))
open(sys.argv[1] + "/favicon.svg", "w").write(small())
