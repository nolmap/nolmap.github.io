/**
 * 놀맵 관리자 저장용 Cloudflare Worker  (plain-salad-81b0.nolguro0905.workers.dev)
 *
 * 필요한 Secret (Cloudflare → Workers → 이 Worker → Settings → Variables and Secrets)
 *   GITHUB_TOKEN    : nolmap/nolmap.github.io 저장소에 Contents 읽기/쓰기 권한이 있는 토큰
 *   ADMIN_PASSWORD  : admin.html에서 입력할 관리자 비밀번호 (길고 추측하기 어렵게)
 *
 * 엔드포인트 (모두 X-Admin-Password 헤더 필요)
 *   POST /admin/check   비밀번호 확인
 *   GET  /admin/data    places.json 최신본
 *   POST /admin/save    한 장소의 소개글·사진 저장
 *        { id, body, detail?, photos: [ "images/xxx.jpg" | { data: "<base64 jpeg>" } , ... ] }
 *        detail(자세한 설명)은 보냈을 때만 바꿔요. 빈 문자열이면 지워요.
 *        addr, tel, hours, rows(가게 정보)도 보냈을 때만 바꿔요.
 *        흥왕처럼 구로엔젤·삼대발견에 같이 있는 가게(pinOf)는 가게 정보를 짝에도 같이 저장해요.
 */

const REPO = 'nolmap/nolmap.github.io';
const BRANCH = 'main';
const ALLOWED_ORIGINS = ['https://nolmap.github.io'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/admin/')) return json({ ok: true, service: 'nolmap-admin' });

    const token = env.GITHUB_TOKEN || env.github_token;
    if (!token || !env.ADMIN_PASSWORD) {
      return json({ ok: false, error: 'Worker에 GITHUB_TOKEN 또는 ADMIN_PASSWORD secret이 없어요' }, 500);
    }

    // 비밀번호 확인 (틀리면 잠깐 기다리게 해서 마구 대입하기 어렵게)
    const given = request.headers.get('X-Admin-Password') || '';
    if (!(await sameText(given, env.ADMIN_PASSWORD))) {
      await new Promise(r => setTimeout(r, 800));
      return json({ ok: false, error: '비밀번호가 맞지 않아요' }, 401);
    }

    const gh = makeGitHub(token);

    try {
      if (url.pathname === '/admin/check' && request.method === 'POST') {
        const repo = await gh('');
        return json({ ok: true, repo: REPO, canWrite: !!(repo.permissions && repo.permissions.push) });
      }

      if (url.pathname === '/admin/data' && request.method === 'GET') {
        const { data } = await readPlaces(gh);
        return json({ ok: true, data });
      }

      if (url.pathname === '/admin/save' && request.method === 'POST') {
        const input = await request.json();
        return json(await savePlace(gh, input));
      }

      return json({ ok: false, error: '없는 주소예요' }, 404);
    } catch (e) {
      const code = e.status >= 400 && e.status < 500 ? e.status : 500;
      return json({ ok: false, error: e.message || String(e), status: code }, code);
    }
  }
};

// ---------- 저장 ----------
async function savePlace(gh, input) {
  const id = String(input.id || '');
  const body = String(input.body || '').trim().slice(0, 300);
  const hasDetail = Object.prototype.hasOwnProperty.call(input, 'detail');
  const detail = hasDetail ? String(input.detail || '').replace(/\r\n/g, '\n').trim().slice(0, 3000) : null;
  const photosIn = Array.isArray(input.photos) ? input.photos : [];
  if (!id) throw httpError(400, 'id가 없어요');
  if (photosIn.length > 12) throw httpError(400, '사진은 한 장소에 12장까지예요');
  const info = readInfo(input);

  const { sha, data } = await readPlaces(gh);
  const place = data.places && data.places[id];
  if (!place) throw httpError(404, 'places.json에 ' + id + ' 장소가 없어요');

  // 새 사진 이름: 장소 이름 글자·숫자만 + "-번호.jpg"
  const base = String(place.name).replace(/\(주\)|㈜/g, '').replace(/[^0-9A-Za-z가-힣]/g, '') || 'photo';
  const hasNew = photosIn.some(p => p && typeof p === 'object');
  let listing = [];
  if (hasNew) listing = await gh('/contents/images?ref=' + BRANCH);
  const re = new RegExp('^' + base + '-(\\d+)\\.jpg$');
  let n = listing.reduce((m, f) => { const r = f.name.match(re); return r ? Math.max(m, +r[1]) : m; }, 0);

  const finalPhotos = [];
  const added = [];
  for (const p of photosIn) {
    if (typeof p === 'string') {
      if (!/^images\/[^/]+$/.test(p)) throw httpError(400, '사진 경로가 이상해요: ' + p);
      finalPhotos.push(p);
      continue;
    }
    const b64 = String((p && p.data) || '').replace(/^data:image\/\w+;base64,/, '');
    if (!b64) throw httpError(400, '새 사진 데이터가 비어 있어요');
    if (b64.length > 4 * 1024 * 1024) throw httpError(400, '사진 한 장이 너무 커요 (3MB 이하)');
    const fname = base + '-' + (++n) + '.jpg';
    await gh('/contents/' + encPath('images/' + fname), {
      method: 'PUT',
      body: { message: '사진 추가: ' + place.name + ' (' + fname + ')', content: b64, branch: BRANCH }
    });
    finalPhotos.push('images/' + fname);
    added.push(fname);
  }

  const removed = (place.photos || []).filter(p => !finalPhotos.includes(p));
  place.body = body;
  if (hasDetail) { if (detail) place.detail = detail; else delete place.detail; }
  if (info) {
    const twinId = place.pinOf || Object.keys(data.places).find(k => data.places[k].pinOf === id);
    for (const p of [place, twinId && data.places[twinId]].filter(Boolean)) applyInfo(p, info);
  }
  if (finalPhotos.length) place.photos = finalPhotos; else delete place.photos;

  await gh('/contents/places.json', {
    method: 'PUT',
    body: {
      message: '장소 수정: ' + place.name + ' (소개글·사진)',
      content: textToB64(JSON.stringify(data, null, 2) + '\n'),
      sha,
      branch: BRANCH
    }
  });

  // 이제 아무 장소도 안 쓰는 사진 파일 지우기 (흥왕처럼 같이 쓰는 사진은 남김)
  const used = new Set(Object.values(data.places).flatMap(p => p.photos || []));
  const orphan = removed.filter(p => !used.has(p));
  const deleted = [];
  if (orphan.length) {
    const files = await gh('/contents/images?ref=' + BRANCH);
    for (const p of orphan) {
      const f = files.find(x => 'images/' + x.name === p);
      if (!f) continue;
      await gh('/contents/' + encPath(p), {
        method: 'DELETE',
        body: { message: '사진 삭제: ' + f.name, sha: f.sha, branch: BRANCH }
      });
      deleted.push(f.name);
    }
  }

  return {
    ok: true,
    place: {
      id, body: place.body, detail: place.detail || '', photos: place.photos || [],
      addr: place.addr || '', tel: place.tel || '', hours: place.hours || {}, rows: place.rows || []
    },
    added, deleted, data
  };
}

// ---------- 가게 정보 (주소·전화·운영시간·정보 줄) ----------
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_RANGE = /^([01]\d|2[0-4]):[0-5]\d-([01]\d|2[0-4]):[0-5]\d$/;
function readInfo(input) {
  const has = k => Object.prototype.hasOwnProperty.call(input, k);
  if (!['addr', 'tel', 'hours', 'rows'].some(has)) return null;
  const info = {};
  if (has('addr')) info.addr = String(input.addr || '').trim().slice(0, 60);
  if (has('tel')) {
    const tel = String(input.tel || '').trim();
    if (tel && !/^[0-9+\-\s()]{6,20}$/.test(tel)) throw httpError(400, '전화번호 형식이 이상해요');
    info.tel = tel;
  }
  if (has('hours')) {
    const h = input.hours && typeof input.hours === 'object' ? input.hours : {};
    const out = {};
    for (const d of DAYS) {
      const v = h[d];
      if (v === undefined || v === null || v === '') continue;
      const s = String(v).trim();
      const ok = s === 'closed' || s === '24h' || s.split(',').every(p => TIME_RANGE.test(p.trim()));
      if (!ok) throw httpError(400, '운영시간 형식이 이상해요: ' + d + ' ' + s);
      out[d] = s.split(',').map(p => p.trim()).join(',');
    }
    info.hours = out;
  }
  if (has('rows')) {
    if (!Array.isArray(input.rows) || input.rows.length > 15) throw httpError(400, '정보 줄은 15줄까지예요');
    info.rows = input.rows.map(r => {
      if (!Array.isArray(r)) throw httpError(400, '정보 줄 형식이 이상해요');
      return [String(r[0] || '').trim().slice(0, 8) || '📌', String(r[1] || '').trim().slice(0, 120)];
    }).filter(r => r[1]);
  }
  return info;
}
function applyInfo(p, info) {
  if ('addr' in info) { if (info.addr) p.addr = info.addr; else delete p.addr; }
  if ('tel' in info) { if (info.tel) p.tel = info.tel; else delete p.tel; }
  if ('hours' in info) { if (Object.keys(info.hours).length) p.hours = info.hours; else delete p.hours; }
  if ('rows' in info) p.rows = info.rows;
}

// ---------- GitHub ----------
function makeGitHub(token) {
  return async function gh(path, opts = {}) {
    const res = await fetch('https://api.github.com/repos/' + REPO + path, {
      method: opts.method || 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'nolmap-admin-worker',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!res.ok) {
      let msg = 'GitHub ' + res.status;
      try { const j = await res.json(); if (j.message) msg += ' · ' + j.message; } catch (_) {}
      // GitHub 쪽 오류는 409(동시 수정)만 그대로, 나머지는 502로 (관리자 비밀번호 오류 401과 헷갈리지 않게)
      throw httpError(res.status === 409 || res.status === 422 ? 409 : 502, msg);
    }
    return res.status === 204 ? null : res.json();
  };
}

async function readPlaces(gh) {
  const f = await gh('/contents/places.json?ref=' + BRANCH);
  return { sha: f.sha, data: JSON.parse(b64ToText(f.content)) };
}

// ---------- 도구 ----------
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const encPath = p => p.split('/').map(encodeURIComponent).join('/');
function textToB64(t) {
  const bytes = new TextEncoder().encode(t);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToText(b) {
  return new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), c => c.charCodeAt(0)));
}
async function sameText(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
