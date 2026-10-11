/*
 * 놀맵 운영시간 도우미 (index.html, admin.html 공용)
 *
 * places.json 장소에 들어가는 형식:
 *   "hours": { "mon": "11:00-21:00", "tue": "closed", "sat": "24h",
 *              "wed": "11:00-15:00,17:00-21:00" }
 *   - 요일 키: mon tue wed thu fri sat sun
 *   - "HH:MM-HH:MM" (쉼표로 여러 구간), "closed"(휴무), "24h"(24시간)
 *   - 키가 없는 요일 = 정보 없음 (영업 여부를 표시하지 않아요)
 *   - 닫는 시간이 여는 시간보다 이르면 다음 날 새벽까지 영업으로 봐요 (예: 18:00-02:00)
 */
(function (root) {
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const KO = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
  const RANGE = /^([01]\d|2[0-4]):([0-5]\d)-([01]\d|2[0-4]):([0-5]\d)$/;

  const toMin = (h, m) => (+h) * 60 + (+m);
  const fmt = min => {
    min = ((min % 1440) + 1440) % 1440;
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  };

  // "11:00-15:00,17:00-21:00" -> [{open:660, close:900}, ...]; "24h" -> [{open:0, close:1440}]; "closed" -> []
  function parseDay(v) {
    if (v === undefined || v === null || v === '') return null;
    v = String(v).trim();
    if (v === 'closed') return [];
    if (v === '24h') return [{ open: 0, close: 1440 }];
    const out = [];
    for (const part of v.split(',')) {
      const m = part.trim().match(RANGE);
      if (!m) return null;
      let open = toMin(m[1], m[2]), close = toMin(m[3], m[4]);
      if (close <= open) close += 1440;          // 새벽까지 영업
      out.push({ open, close });
    }
    return out;
  }
  function isValidDay(v) { return v === 'closed' || v === '24h' || parseDay(v) !== null; }

  // 한국 시간 기준 요일 / 분
  function seoulNow(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date || new Date());
    const get = t => (parts.find(p => p.type === t) || {}).value;
    const dayIdx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
    return { dayIdx, min: toMin(get('hour'), get('minute')) };
  }

  /**
   * 지금 영업 상태
   * 반환: null (정보 없음) 또는
   *   { open:true,  soon:bool, label:'영업 중', detail:'21:00까지' | '24시간' }
   *   { open:false, label:'영업 전'|'영업 끝'|'오늘 휴무', detail:'11:00에 열어요' | '내일 11:00 열어요' | ... }
   */
  function status(hours, date) {
    if (!hours) return null;
    const { dayIdx, min } = seoulNow(date);
    const today = DAYS[dayIdx], yest = DAYS[(dayIdx + 6) % 7];
    const t = parseDay(hours[today]);
    const y = parseDay(hours[yest]);

    // 어제 밤부터 이어지는 영업
    if (y) for (const r of y) if (r.close > 1440 && min < r.close - 1440) {
      return { open: true, soon: r.close - 1440 - min <= 30, label: '영업 중', detail: fmt(r.close) + '까지' };
    }
    if (t === null) return null;                       // 오늘 정보 없음
    for (const r of t) if (min >= r.open && min < r.close) {
      if (r.open === 0 && r.close === 1440) {
        const tm = parseDay(hours[DAYS[(dayIdx + 1) % 7]]);
        if (tm && tm.length && tm[0].open === 0) return { open: true, soon: false, label: '영업 중', detail: '24시간' };
      }
      return { open: true, soon: r.close - min <= 30, label: '영업 중', detail: fmt(r.close) + '까지' };
    }
    // 오늘 이따가 여는지
    const later = t.find(r => r.open > min);
    if (later) return { open: false, label: '영업 전', detail: fmt(later.open) + '에 열어요' };
    // 다음 영업일 찾기 (최대 7일)
    for (let k = 1; k <= 7; k++) {
      const d = DAYS[(dayIdx + k) % 7];
      const ranges = parseDay(hours[d]);
      if (ranges === null) break;                       // 정보 없는 날을 만나면 멈춤
      if (ranges.length) {
        const when = k === 1 ? '내일' : KO[d] + '요일';
        return { open: false, label: t.length ? '영업 끝' : '오늘 휴무', detail: when + ' ' + fmt(ranges[0].open) + ' 열어요' };
      }
    }
    return { open: false, label: t.length ? '영업 끝' : '오늘 휴무', detail: '' };
  }

  // 요일별 시간을 한 줄로 요약 (예: "월~토 11:00~21:00 / 일 휴무")
  function summarize(hours) {
    if (!hours) return '';
    const show = v => v === '24h' ? '24시간' : String(v).split(',').map(s => s.trim().replace('-', '~')).join(', ');
    const known = DAYS.filter(d => hours[d] !== undefined && hours[d] !== null && hours[d] !== '');
    if (!known.length) return '';
    if (known.length === 7 && known.every(d => hours[d] === hours.mon)) {
      return hours.mon === 'closed' ? '휴무' : hours.mon === '24h' ? '24시간 (매일)' : '매일 ' + show(hours.mon);
    }
    // 같은 값끼리 묶기 (연속 요일은 "월~금")
    const groups = [];
    for (const d of known) {
      const g = groups.find(x => x.v === hours[d]);
      if (g) g.days.push(d); else groups.push({ v: hours[d], days: [d] });
    }
    const dayText = days => {
      const idx = days.map(d => DAYS.indexOf(d));
      if (idx.join() === '0,1,2,3,4') return '평일';
      if (idx.join() === '5,6') return '주말';
      const runs = [];
      for (const i of idx) {
        const last = runs[runs.length - 1];
        if (last && i === last[1] + 1) last[1] = i; else runs.push([i, i]);
      }
      return runs.map(([a, b]) => a === b ? KO[DAYS[a]] : (b === a + 1 ? KO[DAYS[a]] + '·' + KO[DAYS[b]] : KO[DAYS[a]] + '~' + KO[DAYS[b]])).join('·');
    };
    const open = groups.filter(g => g.v !== 'closed').map(g => dayText(g.days) + ' ' + show(g.v));
    const closed = groups.filter(g => g.v === 'closed').map(g => dayText(g.days) + ' 휴무');
    return open.concat(closed).join(' / ');
  }

  root.NolHours = { DAYS, KO, parseDay, isValidDay, status, summarize };
})(typeof window !== 'undefined' ? window : globalThis);
