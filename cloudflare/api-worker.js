/**
 * 놀맵 공개 API Worker  (nolmap.nolguro0905.workers.dev)
 *
 *   GET  /  또는 /route   도보 길찾기 (카카오 도보 길찾기 API)
 *        ?sx=경도&sy=위도&ex=경도&ey=위도[&route_mode=ACCESSIBLE]
 *        → { ok, mode:'walk', distance(m), time(초), path:[[위도,경도], ...] }
 *   GET  /holiday        오늘(또는 ?date=YYYY-MM-DD)이 대한민국 공휴일인지
 *        → { ok, date, isHoliday, name, localName }
 *   POST /contact        문의하기 메일 보내기 (Resend)
 *        { subject, message, name, phone } → { ok }
 *        받는 주소는 아래 CONTACT_TO로 고정 (사이트에서 보내는 to 값은 무시해요)
 *
 * 필요한 Secret (Cloudflare → Workers → nolmap → Settings → Variables and Secrets)
 *   KAKAO_REST_API_KEY   카카오 개발자 콘솔의 REST API 키
 *   RESEND_API_KEY       Resend API 키
 */

const CONTACT_TO = 'playguro1@naver.com';
const CONTACT_FROM = '놀맵 문의 <onboarding@resend.dev>';
const SITE_ORIGINS = ['https://nolmap.github.io'];

// 공휴일 데이터에 빠질 수 있는 날(선거일, 임시공휴일, 대체공휴일 등)을 여기에 직접 추가할 수 있어요.
// 예: '2026-06-03': '전국동시지방선거'
const EXTRA_HOLIDAYS = {};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': SITE_ORIGINS.includes(origin) ? origin : '*',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      let res;
      if (url.pathname === '/contact') res = await handleContact(request, env, cors, origin);
      else if (url.pathname === '/holiday') res = await handleHoliday(request, url, cors, ctx);
      else if (url.pathname === '/' || url.pathname === '/route') res = await handleRoute(request, env, url, cors);
      else res = json({ ok: false, error: '존재하지 않는 API 주소입니다.' }, 404, cors);
      // ?debug=1 이면 오류도 200으로 돌려줘서 내용을 확인하기 쉽게 (원래 상태 코드는 _status에)
      if (url.searchParams.get('debug') === '1' && res.status !== 200) {
        const body = await res.json().catch(() => ({}));
        return json({ ...body, _status: res.status }, 200, cors);
      }
      return res;
    } catch (error) {
      console.error('Worker 오류:', error);
      return json({ ok: false, error: '서버 오류', detail: String(error) }, 500, cors);
    }
  }
};

// ======================================================
// 🗺️ 길찾기 (카카오 도보)
// ======================================================
async function handleRoute(request, env, url, cors) {
  if (request.method !== 'GET') return json({ ok: false, error: '길찾기는 GET 요청만 허용됩니다.' }, 405, cors);

  const q = k => url.searchParams.get(k);
  const sx = Number(q('sx')), sy = Number(q('sy')), ex = Number(q('ex')), ey = Number(q('ey'));
  if (![sx, sy, ex, ey].every(Number.isFinite)) {
    // 아무 값 없이 열면 상태 확인용 응답
    if (!q('sx') && !q('sy') && !q('ex') && !q('ey')) return json({ ok: true, service: 'nolmap-api' }, 200, cors);
    return json({ ok: false, error: 'sx, sy, ex, ey가 필요합니다.' }, 400, cors);
  }
  // 대한민국 범위 밖 좌표는 거절 (키 남용 방지)
  const inKorea = (x, y) => x > 124 && x < 132 && y > 33 && y < 39;
  if (!inKorea(sx, sy) || !inKorea(ex, ey)) return json({ ok: false, error: '대한민국 안의 좌표만 찾을 수 있어요.' }, 400, cors);

  if (!env.KAKAO_REST_API_KEY) return json({ ok: false, error: 'KAKAO_REST_API_KEY가 설정되지 않았습니다.' }, 500, cors);

  const routeMode = q('route_mode') === 'NORMAL' ? 'NORMAL' : 'ACCESSIBLE';
  const params = new URLSearchParams({
    start_x: String(sx), start_y: String(sy), end_x: String(ex), end_y: String(ey), route_mode: routeMode
  });
  const kakaoResponse = await fetch('https://dapi.kakao.com/v2/routing/walk?' + params, {
    headers: { Authorization: 'KakaoAK ' + env.KAKAO_REST_API_KEY }
  });

  let kakaoData;
  try { kakaoData = await kakaoResponse.json(); }
  catch { return json({ ok: false, error: 'Kakao API 응답을 읽지 못했습니다.' }, 502, cors); }

  if (!kakaoResponse.ok) {
    return json({ ok: false, error: 'Kakao WALK API 오류', status: kakaoResponse.status, detail: kakaoData }, kakaoResponse.status, cors);
  }
  if (kakaoData.status !== 'OK' || !kakaoData.route) {
    return json({ ok: false, error: kakaoData.status || 'ROUTE_RESULT_NOT_FOUND', detail: kakaoData }, 200, cors);
  }

  // 경로 좌표 추출 ([경도, 위도] → [위도, 경도]) + 연속 중복 제거
  const path = [];
  for (const leg of kakaoData.route.legs || []) {
    for (const step of leg.steps || []) {
      for (const point of (step.path && step.path.points) || []) {
        if (!Array.isArray(point) || point.length < 2) continue;
        const lng = Number(point[0]), lat = Number(point[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const prev = path[path.length - 1];
        if (!prev || prev[0] !== lat || prev[1] !== lng) path.push([lat, lng]);
      }
    }
  }

  const properties = kakaoData.route.properties || {};
  const distance = Number(properties.totalDistance) || 0;
  const time = Number(properties.totalTime) || 0;

  if (path.length < 2) return json({ ok: false, error: '경로 좌표를 찾지 못했습니다.', distance, time }, 200, cors);
  return json({ ok: true, mode: 'walk', distance, time, path }, 200, cors);
}

// ======================================================
// 📅 대한민국 공휴일
// ======================================================
async function handleHoliday(request, url, cors, ctx) {
  if (request.method !== 'GET') return json({ ok: false, error: '공휴일 조회는 GET만 허용됩니다.' }, 405, cors);

  let date = url.searchParams.get('date');
  if (!date) date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: 'date는 YYYY-MM-DD 형식이어야 합니다.' }, 400, cors);

  if (EXTRA_HOLIDAYS[date]) {
    return json({ ok: true, date, isHoliday: true, name: EXTRA_HOLIDAYS[date], localName: EXTRA_HOLIDAYS[date] }, 200, cors);
  }

  let holidays;
  try {
    holidays = await holidaysOf(date.slice(0, 4), ctx);
  } catch (e) {
    return json({ ok: false, error: '공휴일 정보를 가져오지 못했습니다.', detail: String(e) }, 502, cors);
  }

  const holiday = holidays.find(h => h.date === date);
  return json(holiday
    ? { ok: true, date, isHoliday: true, name: holiday.name, localName: holiday.localName || holiday.name }
    : { ok: true, date, isHoliday: false, name: null }, 200, cors);
}

// 연도별 공휴일 목록 (하루 동안 Cloudflare 캐시에 보관)
async function holidaysOf(year, ctx) {
  const cache = caches.default;
  const key = new Request('https://nolmap-cache.internal/holidays/KR/' + year);
  const hit = await cache.match(key);
  if (hit) return hit.json();

  const res = await fetch('https://date.nager.at/api/v3/PublicHolidays/' + year + '/KR', {
    headers: { 'Accept': 'application/json', 'User-Agent': 'nolmap-api-worker' }
  });
  if (!res.ok) throw new Error('date.nager.at ' + res.status);
  const list = (await res.json())
    .filter(h => h && h.date && (h.global !== false) && (!h.types || h.types.includes('Public')))
    .map(h => ({ date: h.date, name: h.name, localName: h.localName }));

  const toStore = new Response(JSON.stringify(list), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' }
  });
  if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(key, toStore)); else await cache.put(key, toStore);
  return list;
}

// ======================================================
// ✉️ 문의하기 (Resend)
// ======================================================
async function handleContact(request, env, cors, origin) {
  if (request.method !== 'POST') return json({ ok: false, error: '문의하기는 POST 요청만 허용됩니다.' }, 405, cors);
  // 다른 사이트에서 이 주소로 문의를 보내지 못하게 (놀맵 사이트에서만)
  if (origin && !SITE_ORIGINS.includes(origin)) return json({ ok: false, error: '허용되지 않은 사이트예요.' }, 403, cors);
  if (!env.RESEND_API_KEY) return json({ ok: false, error: 'RESEND_API_KEY가 설정되지 않았습니다.' }, 500, cors);

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: '잘못된 요청 데이터입니다.' }, 400, cors); }

  const subject = String(body.subject ?? '').trim().slice(0, 100);
  const message = String(body.message ?? '').trim().slice(0, 5000);
  const name = String(body.name ?? '').trim().slice(0, 50);
  const phone = String(body.phone ?? '').trim().slice(0, 30);
  if (!message) return json({ ok: false, error: '문의 내용을 입력해주세요.' }, 400, cors);

  const safeSubject = subject || '놀맵 문의';
  const emailHtml = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;">
      <h2>놀맵 문의가 도착했습니다.</h2>
      <hr>
      <p><strong>제목:</strong> ${escapeHtml(safeSubject)}</p>
      <p><strong>이름:</strong> ${escapeHtml(name || '익명')}</p>
      <p><strong>연락처:</strong> ${escapeHtml(phone || '입력하지 않음')}</p>
      <h3>문의 내용</h3>
      <div style="white-space:pre-wrap;padding:15px;border:1px solid #ddd;border-radius:10px;background:#f7f7f7;">${escapeHtml(message)}</div>
      <hr>
      <p style="color:#777;font-size:12px;">이 메일은 놀맵 문의하기에서 자동으로 전송되었습니다.</p>
    </div>`;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: CONTACT_FROM, to: [CONTACT_TO], subject: '[놀맵 문의] ' + safeSubject, html: emailHtml })
  });
  let resendData = {};
  try { resendData = await resendResponse.json(); } catch {}

  if (!resendResponse.ok) {
    console.error('Resend 오류:', resendData);
    return json({ ok: false, error: '이메일 전송에 실패했습니다.', detail: resendData }, 500, cors);
  }
  return json({ ok: true, message: '문의가 정상적으로 전송되었습니다.', id: resendData.id }, 200, cors);
}

// ======================================================
// 도구
// ======================================================
function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
  });
}
