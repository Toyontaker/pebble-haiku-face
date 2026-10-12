// ─── Haiku watchface: PebbleKit JS ────────────────────────────────────────
// スマホ側で動作。1日1回 LLM (Claude / ChatGPT) に俳句を作らせ、腕時計へ送る。

var Clay = require('@rebble/clay');
var cfg = require('./config');
var sun = require('./sun');
var weather = require('./weather');
var season = require('./season');
var moon = require('./moon');
var place = require('./place');
var special = require('./special');
var kigo = require('./kigo');
var schedule = require('./schedule');
var technique = require('./technique');
var kire = require('./kire');
var prompts = require('./prompts');

var clay = new Clay(cfg.build(), cfg.customClay, { autoHandleEvents: false });
clay.registerComponent(cfg.textareaComponent);

var STATUS_OK = 0;
var STATUS_ERROR = 1;

var CACHE_KEY = 'haiku-cache';
var LOC_KEY = 'last-location';
var HISTORY_KEY = 'haiku-history';
var STEPS_KEY = 'last-steps';
var inflight = false;

// ─── 設定 ────────────────────────────────────────────────────────────────
function clampHour(v, def) {
  var n = parseInt(v, 10);
  return (isNaN(n) || n < 0 || n > 23) ? def : n;
}

function loadSettings() {
  var s = {};
  try {
    s = JSON.parse(localStorage.getItem('clay-settings')) || {};
  } catch (e) {
    s = {};
  }
  return {
    provider: s.CFG_PROVIDER || 'claude',
    claudeKey: (s.CFG_CLAUDE_KEY || '').trim(),
    claudeModel: (s.CFG_CLAUDE_MODEL || '').trim() || cfg.DEFAULT_CLAUDE_MODEL,
    openaiKey: (s.CFG_OPENAI_KEY || '').trim(),
    openaiModel: (s.CFG_OPENAI_MODEL || '').trim() || cfg.DEFAULT_OPENAI_MODEL,
    geminiKey: (s.CFG_GEMINI_KEY || '').trim(),
    geminiModel: (s.CFG_GEMINI_MODEL || '').trim() || cfg.DEFAULT_GEMINI_MODEL,
    effort: { low: 'low', medium: 'medium', high: 'high', max: 'max' }[s.CFG_EFFORT] || 'low',
    lang: s.CFG_LANG === 'en' ? 'en' : 'ja',
    promptJa: (s.CFG_PROMPT_JA || '').trim() || cfg.DEFAULT_PROMPT_JA,
    promptEn: (s.CFG_PROMPT_EN || '').trim() || cfg.DEFAULT_PROMPT_EN,
    regen: !!s.CFG_REGEN,
    schedule: s.CFG_SCHEDULE === 'fixed' ? 'fixed' : 'auto',
    fixedTimes: [s.CFG_TIME_MORNING, s.CFG_TIME_NOON, s.CFG_TIME_EVENING],
    useWeather: s.CFG_WEATHER === undefined ? true : !!s.CFG_WEATHER,
    usePlace: s.CFG_PLACE === undefined ? true : !!s.CFG_PLACE,
    icsUrl: (s.CFG_ICS_URL || '').trim(),
    useSteps: s.CFG_STEPS === undefined ? true : !!s.CFG_STEPS,
    timeFont: { gyosho: 1, bold: 2, digital: 3 }[s.CFG_TIME_FONT] || 0,
    // C 側の番号と一致させる
    dayTheme: { zabuton: 0, tatami: 1, sakura: 2, wakaba: 3, banryoku: 4, kareha: 5, yukimoyoi: 6 }[s.CFG_DAY_THEME] || 0,
    nightTheme: { yami: 0, hoshizukiyo: 1, oborozukiyo: 2, mijikayo: 3, yukiyo: 4 }[s.CFG_NIGHT_THEME] || 0,
    nightMode: s.CFG_NIGHT_MODE === 'fixed' ? 0 : 1,  // 0: 固定時刻, 1: 日の出・日の入り
    nightStart: clampHour(s.CFG_NIGHT_START, 19),
    nightEnd: clampHour(s.CFG_NIGHT_END, 6),
    sideInfo: { battery: 1, weather: 2, steps: 3 }[s.CFG_SIDE_INFO] || 0  // C 側の SIDE_* と一致させる
  };
}

// 保存してあるプロンプトを今の既定に追いつかせる。既定を直した版に上がったとき、
// 手元に残った古い文の、利用者が書き換えていない行を入れ替える
function upgradePrompts() {
  var raw = {};
  try { raw = JSON.parse(localStorage.getItem('clay-settings')) || {}; } catch (e) {}
  [['CFG_PROMPT_JA', 'ja', cfg.DEFAULT_PROMPT_JA], ['CFG_PROMPT_EN', 'en', cfg.DEFAULT_PROMPT_EN]].forEach(function(p) {
    var text = raw[p[0]] || '';
    var next = prompts.upgrade(p[1], p[2], text);
    if (next !== text) {
      console.log('prompt upgraded: ' + p[0]);
      clay.setSettings(p[0], next);
    }
  });
}

// ─── 日付 ────────────────────────────────────────────────────────────────
function pad2(n) { return (n < 10 ? '0' : '') + n; }

function todayKey() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function humanDate(lang) {
  var d = new Date();
  if (lang === 'ja') {
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

// ─── 時間帯 ──────────────────────────────────────────────────────────────
// 日の出・日の入りと現在時刻の関係で、細かく時間帯を決める。
// 俳句はこの区分が変わるたびに詠み直す。
var PHASES = [
  { key: 'deepnight', ja: '夜更け',   en: 'deep night' },
  { key: 'predawn',   ja: '未明',     en: 'the small hours' },
  { key: 'dawn',      ja: '夜明け前', en: 'before dawn' },
  { key: 'sunrise',   ja: '朝ぼらけ', en: 'daybreak' },
  { key: 'morning',   ja: '朝',       en: 'morning' },
  { key: 'noon',      ja: '昼',       en: 'midday' },
  { key: 'afternoon', ja: '午後',     en: 'afternoon' },
  { key: 'dusk',      ja: '夕暮れ',   en: 'dusk' },
  { key: 'twilight',  ja: '薄暮',     en: 'twilight' },
  { key: 'evening',   ja: '宵',       en: 'evening' }
];

function phaseByKey(key) {
  for (var i = 0; i < PHASES.length; i++) {
    if (PHASES[i].key === key) return PHASES[i];
  }
  return PHASES[0];
}

// 現在の時間帯。日の出・日の入りに近い区分は太陽基準、日中は時計基準で分ける。
function periodOf(now, st) {
  var min = now.getHours() * 60 + now.getMinutes();
  var rise = (st && st.rise !== st.set) ? st.rise : 5 * 60 + 30;
  var set  = (st && st.rise !== st.set) ? st.set  : 18 * 60;

  if (min >= 22 * 60 + 30 || min < 4 * 60) return 'deepnight';
  if (min < rise - 90) return 'predawn';
  if (min < rise - 20) return 'dawn';
  if (min < rise + 45) return 'sunrise';
  if (min < 11 * 60)   return 'morning';
  if (min < 14 * 60)   return 'noon';
  if (min < set - 90)  return 'afternoon';
  if (min < set + 20)  return 'dusk';
  if (min < set + 70)  return 'twilight';
  return 'evening';
}

function periodWord(key, lang) {
  var p = phaseByKey(key);
  return lang === 'ja' ? p.ja : p.en;
}

// 「日の出の1時間後」「日の入りの40分前」のように、太陽との関係を言葉にする
function sunRelation(now, st, lang) {
  if (!st || st.rise === st.set) return null;
  var min = now.getHours() * 60 + now.getMinutes();
  var dRise = min - st.rise, dSet = min - st.set;
  var target = Math.abs(dRise) <= Math.abs(dSet) ? 'rise' : 'set';
  var diff = target === 'rise' ? dRise : dSet;
  var mins = Math.abs(diff);
  var h = Math.floor(mins / 60), m = mins % 60;

  var span;
  if (lang === 'ja') {
    span = (h ? h + '時間' : '') + (m || !h ? m + '分' : '');
    return (target === 'rise' ? '日の出' : '日の入り') + 'の' + span + (diff < 0 ? '前' : '後');
  }
  span = (h ? h + 'h ' : '') + m + 'min';
  return span + (diff < 0 ? ' before ' : ' after ') + (target === 'rise' ? 'sunrise' : 'sunset');
}

function dayType(now, lang) {
  var w = now.getDay();
  var weekend = (w === 0 || w === 6);
  if (lang === 'ja') return weekend ? '休日' : '平日';
  return weekend ? 'a weekend day' : 'a weekday';
}

// 腕時計から届いた歩数を、良し悪しの判定を含まない叙述の語にする。
// 生の数値は句に紛れ込むのでプロンプトには渡さない
function activityWord(steps, lang) {
  if (steps === null || steps === undefined) return null;
  if (lang === 'ja') {
    if (steps < 1000) return '家にこもりがちな一日';
    if (steps < 4000) return 'そぞろ歩き程度の一日';
    if (steps < 9000) return 'よく歩きたる一日';
    if (steps < 15000) return '街をめぐり歩いた一日';
    return '朝から歩き通した一日';
  }
  if (steps < 1000) return 'a day spent mostly indoors';
  if (steps < 4000) return 'a day of short strolls';
  if (steps < 9000) return 'a day of steady walking';
  if (steps < 15000) return 'a day of roaming the streets';
  return 'a day on foot from morning on';
}

function loadSteps() {
  try {
    var v = JSON.parse(localStorage.getItem(STEPS_KEY));
    if (v && v.date === todayKey()) return v.steps;
  } catch (e) {}
  return null;
}

function saveSteps(steps) {
  try { localStorage.setItem(STEPS_KEY, JSON.stringify({ date: todayKey(), steps: steps })); } catch (e) {}
}

// ─── 詠み直しのタイミング ────────────────────────────────────────────────
// "HH:MM" → 0:00 からの分。不正なら null
function parseClock(str) {
  var m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(str || '');
  if (!m) return null;
  var h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

// 決まった時刻モードの更新時刻（分）。空欄は飛ばし、昇順に並べる。全部空なら朝6時
function fixedSchedule(s) {
  var times = [];
  for (var i = 0; i < s.fixedTimes.length; i++) {
    var t = parseClock(s.fixedTimes[i]);
    if (t !== null) times.push(t);
  }
  times.sort(function(a, b) { return a - b; });
  return times.length ? times : [6 * 60];
}

function dateKeyOf(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// 「今の句」を識別する鍵。これが変わったときだけ詠み直す
//   自動:       日付#時間帯
//   決まった時刻: 直近に過ぎた更新時刻の 日付#番号（最初の時刻より前なら前日の最後の番号）
function currentKey(s, now) {
  now = now || new Date();
  if (s.schedule !== 'fixed') {
    return dateKeyOf(now) + '#' + periodOf(now, todaySunTimes());
  }
  var times = fixedSchedule(s);
  var min = now.getHours() * 60 + now.getMinutes();
  var idx = -1;
  for (var i = 0; i < times.length; i++) {
    if (min >= times[i]) idx = i;
  }
  if (idx < 0) {
    var yesterday = new Date(now.getTime() - 86400000);
    return dateKeyOf(yesterday) + '#' + (times.length - 1);
  }
  return dateKeyOf(now) + '#' + idx;
}

// ─── 直近の句（重複を避けるため） ────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; }
}

function pushHistory(lines) {
  var h = loadHistory();
  h.push(lines.join(' / '));
  if (h.length > 8) h = h.slice(-8);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch (e) {}
}

function clockText(now, lang) {
  var h = now.getHours(), m = now.getMinutes();
  if (lang === 'ja') return h + '時' + (m < 10 ? '0' : '') + m + '分';
  return h + ':' + (m < 10 ? '0' : '') + m;
}

// ─── キャッシュ ──────────────────────────────────────────────────────────
function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || null;
  } catch (e) {
    return null;
  }
}

function saveCache(c) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) {}
}

// ─── 位置情報と日の出・日の入り ──────────────────────────────────────────
function loadLocation() {
  try { return JSON.parse(localStorage.getItem(LOC_KEY)) || null; } catch (e) { return null; }
}

// 位置情報を取得して保存する。取得後 cb(changed) を呼ぶ
function refreshLocation(cb) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) { cb(false); return; }
  navigator.geolocation.getCurrentPosition(function(pos) {
    var prev = loadLocation();
    var loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, ts: Date.now() };
    try { localStorage.setItem(LOC_KEY, JSON.stringify(loc)); } catch (e) {}
    var changed = !prev || Math.abs(prev.lat - loc.lat) > 0.05 || Math.abs(prev.lon - loc.lon) > 0.05;
    console.log('location: ' + loc.lat.toFixed(2) + ',' + loc.lon.toFixed(2));
    cb(changed);
  }, function(err) {
    console.log('location error: ' + (err && err.message));
    cb(false);
  }, { timeout: 15000, maximumAge: 6 * 3600 * 1000 });
}

// 今日の日の出・日の入り（ローカル時刻の分）。位置情報が無い/白夜等なら null
function todaySunTimes() {
  var loc = loadLocation();
  if (!loc) return null;
  var now = new Date();
  return sun.sunTimes(loc.lat, loc.lon, now, -now.getTimezoneOffset());
}

// テーマ関連の設定だけを腕時計へ送る（俳句本文は含めない）
function themeFields() {
  var s = loadSettings();
  var st = s.nightMode === 1 ? todaySunTimes() : null;
  var sched = s.schedule === 'fixed' ? fixedSchedule(s) : [];
  return {
    SCHED_MODE: s.schedule === 'fixed' ? 1 : 0,
    SCHED_T1: sched.length > 0 ? sched[0] : -1,
    SCHED_T2: sched.length > 1 ? sched[1] : -1,
    SCHED_T3: sched.length > 2 ? sched[2] : -1,
    TIME_FONT: s.timeFont,
    DAY_THEME: s.dayTheme,
    NIGHT_THEME: s.nightTheme,
    NIGHT_START: s.nightStart,
    NIGHT_END: s.nightEnd,
    NIGHT_MODE: st ? 1 : 0,          // 日の出時刻が求められない場合は固定時刻にフォールバック
    SUN_RISE: st ? st.rise : 0,
    SUN_SET: st ? st.set : 0,
    SIDE_INFO: s.sideInfo
  };
}

// ─── 短冊の右に出す天気 ──────────────────────────────────────────────────
var SIDE_WEATHER_KEY = 'side-weather';

// WMO weather code → 印に入れる一字
function weatherKanji(code) {
  if (code === null || code === undefined) return '';
  if (code <= 1) return '晴';
  if (code <= 3) return '曇';
  if (code === 45 || code === 48) return '霧';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '雪';
  if (code >= 95) return '雷';
  if (code >= 51 && code <= 82) {
    // 強い雨（大雨・激しいにわか雨）は嵐とする
    return (code === 65 || code === 67 || code === 82) ? '嵐' : '雨';
  }
  return '';
}

function saveSideWeather(w) {
  if (!w || w.temp === null || w.temp === undefined) return;
  try {
    localStorage.setItem(SIDE_WEATHER_KEY, JSON.stringify({ kanji: weatherKanji(w.code), temp: w.temp, ts: Date.now() }));
  } catch (e) {}
}

function loadSideWeather() {
  try { return JSON.parse(localStorage.getItem(SIDE_WEATHER_KEY)) || null; } catch (e) { return null; }
}

function sideWeatherFields() {
  var sw = loadSideWeather();
  return sw ? { WEATHER_KANJI: sw.kanji, TEMP: sw.temp } : {};
}

// 腕時計から1時間ごとに頼まれる。30分以内に取った天気があればそれを送る
function sendSideWeather() {
  var sw = loadSideWeather();
  function send() {
    var msg = sideWeatherFields();
    if (msg.TEMP === undefined) return;
    Pebble.sendAppMessage(msg, function() {}, function(e) {
      console.log('side weather send failed: ' + JSON.stringify(e));
    });
  }
  if (sw && Date.now() - sw.ts < 30 * 60 * 1000) { send(); return; }
  weather.fetch(loadLocation(), function(w) {
    saveSideWeather(w);
    send();
  });
}

function sendTheme() {
  var msg = themeFields();
  var sw = sideWeatherFields();
  for (var k in sw) msg[k] = sw[k];
  Pebble.sendAppMessage(msg, function() {
    console.log('theme sent: ' + JSON.stringify(msg));
  }, function(e) {
    console.log('theme send failed: ' + JSON.stringify(e));
  });
}

// ─── 腕時計へ送信 ────────────────────────────────────────────────────────
function sendToWatch(lines, lang, status) {
  var msg = themeFields();
  var sw = sideWeatherFields();
  for (var k in sw) msg[k] = sw[k];
  var haiku = {
    HAIKU_L1: lines[0] || '',
    HAIKU_L2: lines[1] || '',
    HAIKU_L3: lines[2] || '',
    HAIKU_DATE: todayKey(),
    LANG: lang === 'en' ? 1 : 0,
    STATUS: status
  };
  for (var k in haiku) msg[k] = haiku[k];
  Pebble.sendAppMessage(msg, function() {
    console.log('sent to watch: ' + JSON.stringify(lines));
  }, function(e) {
    console.log('send failed: ' + JSON.stringify(e));
  });
}

function sendError(lang, jaMsg, enMsg) {
  console.log('error: ' + enMsg);
  sendToWatch([lang === 'ja' ? jaMsg : enMsg], lang, STATUS_ERROR);
}

// ─── LLM 出力の整形 ──────────────────────────────────────────────────────
function parseHaiku(text, lang) {
  text = (text || '').replace(/```/g, '').replace(/^["'「『\s]+|["'」』\s]+$/g, '');
  var lines = text.split(/\r?\n|／|\/|｜|\|/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i]
      .replace(/[\*_#`]/g, '')                     // Markdown 装飾を除去
      .replace(/^[\s\-・•\d\.\)]+/, '')            // 行頭の箸・番号
      .replace(/^["'「『]+|["'」』]+$/g, '')          // 引用符
      .replace(/[。、,\.\s]+$/, '')                 // 行末の句読点
      .trim();
    if (l) out.push(l);
  }
  // 1行で返ってきた日本語俳句は全角スペースで分割してみる
  if (out.length < 3 && lang === 'ja' && out.length === 1) {
    var parts = out[0].split(/[　\s]+/);
    if (parts.length >= 3) out = parts;
  }
  if (out.length > 3) out = out.slice(0, 3);
  return out;
}

// ─── Claude (Anthropic Messages API) ─────────────────────────────────────
// 思考は thinking: adaptive を付けたときだけ働き、effort がその深さを決める。
// 深いほど思考に出力枠を使うので max_tokens も広げる。
// 適応思考や effort を受け付けないモデル（Haiku 4.5 など）には付けずに呼び直す
var CLAUDE_MAX_TOKENS = { low: 4096, medium: 8192, high: 16000, max: 32000 };

function callClaude(s, prompt, cb, withoutThinking) {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', 'https://api.anthropic.com/v1/messages', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('x-api-key', s.claudeKey);
  xhr.setRequestHeader('anthropic-version', '2023-06-01');
  xhr.setRequestHeader('anthropic-dangerous-direct-browser-access', 'true');

  var body = {
    model: s.claudeModel,
    max_tokens: withoutThinking ? 4096 : (CLAUDE_MAX_TOKENS[s.effort] || 4096),
    system: 'You are a haiku poet. Reply with the haiku only.',
    messages: [{ role: 'user', content: prompt }]
  };
  if (!withoutThinking) {
    body.thinking = { type: 'adaptive' };
    body.output_config = { effort: s.effort };
  }
  // Opus 5 / Fable 系では、安全分類器による refusal 時にサーバー側で別モデルへ
  // フォールバックさせる（サポート対象モデルのみ付与する）
  if (/^claude-(opus-5|fable)/.test(s.claudeModel)) {
    xhr.setRequestHeader('anthropic-beta', 'server-side-fallback-2026-07-01');
    body.fallbacks = 'default';
  }

  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    if (xhr.status !== 200) {
      var detail = '';
      try { detail = JSON.parse(xhr.responseText).error.message || ''; } catch (e) {}
      if (xhr.status === 400 && !withoutThinking && /thinking|effort/i.test(detail)) {
        callClaude(s, prompt, cb, true);
        return;
      }
      cb('Claude API ' + xhr.status + (detail ? ': ' + detail.slice(0, 60) : ''), null);
      return;
    }
    try {
      var res = JSON.parse(xhr.responseText);
      if (res.stop_reason === 'refusal') {
        cb('Claude refused the request', null);
        return;
      }
      var text = '', thinking = 0;
      for (var i = 0; i < res.content.length; i++) {
        if (res.content[i].type === 'text') text += res.content[i].text;
        else if (res.content[i].type === 'thinking') thinking++;
      }
      if (res.usage) console.log('usage: in=' + res.usage.input_tokens + ' out=' + res.usage.output_tokens +
                                 ' thinking_blocks=' + thinking + ' stop=' + res.stop_reason);
      if (!text && res.stop_reason === 'max_tokens') {
        cb('Claude ran out of tokens while thinking', null);
        return;
      }
      cb(null, text);
    } catch (e) {
      cb('Claude parse error', null);
    }
  };
  xhr.onerror = function() { cb('Claude network error', null); };
  xhr.send(JSON.stringify(body));
}

// ─── ChatGPT (OpenAI Chat Completions API) ───────────────────────────────
// reasoning_effort を付けて呼ぶ。受け付けないモデル（推論なしのモデル）には付けずに呼び直す
function callOpenAI(s, prompt, cb, withoutEffort) {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', 'https://api.openai.com/v1/chat/completions', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Authorization', 'Bearer ' + s.openaiKey);

  var body = {
    model: s.openaiModel,
    messages: [
      { role: 'system', content: 'You are a haiku poet. Reply with the haiku only.' },
      { role: 'user', content: prompt }
    ],
    max_completion_tokens: 2048
  };
  // OpenAI と Gemini に「最大」はないので「高」で呼ぶ
  if (!withoutEffort) body.reasoning_effort = s.effort === 'max' ? 'high' : s.effort;

  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    if (xhr.status !== 200) {
      var detail = '';
      try { detail = JSON.parse(xhr.responseText).error.message || ''; } catch (e) {}
      if (xhr.status === 400 && !withoutEffort && /reasoning/i.test(detail)) {
        callOpenAI(s, prompt, cb, true);
        return;
      }
      cb('OpenAI API ' + xhr.status + (detail ? ': ' + detail.slice(0, 60) : ''), null);
      return;
    }
    try {
      var res = JSON.parse(xhr.responseText);
      if (res.usage) {
        var rt = res.usage.completion_tokens_details ? res.usage.completion_tokens_details.reasoning_tokens : undefined;
        console.log('usage: in=' + res.usage.prompt_tokens + ' out=' + res.usage.completion_tokens +
                    (rt !== undefined ? ' reasoning=' + rt : ''));
      }
      cb(null, res.choices[0].message.content);
    } catch (e) {
      cb('OpenAI parse error', null);
    }
  };
  xhr.onerror = function() { cb('OpenAI network error', null); };
  xhr.send(JSON.stringify(body));
}

// ─── Gemini (Google Generative Language API) ─────────────────────────────
// 思考を抑える設定（thinkingLevel）を付けて呼ぶ。受け付けない古いモデルには付けずに呼び直す
function callGemini(s, prompt, cb, withoutThinkingConfig) {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', 'https://generativelanguage.googleapis.com/v1beta/models/' +
                   encodeURIComponent(s.geminiModel) + ':generateContent', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('x-goog-api-key', s.geminiKey);   // URL にキーを載せない

  var body = {
    system_instruction: { parts: [{ text: 'You are a haiku poet. Reply with the haiku only.' }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 4096 }
  };
  if (!withoutThinkingConfig) {
    // 3.x 系は thinkingLevel（low / medium / high）を受け付ける
    body.generationConfig.thinkingConfig = { thinkingLevel: s.effort === 'max' ? 'high' : s.effort };
  }

  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    if (xhr.status !== 200) {
      var detail = '';
      try { detail = JSON.parse(xhr.responseText).error.message || ''; } catch (e) {}
      if (xhr.status === 400 && !withoutThinkingConfig && /thinking/i.test(detail)) {
        callGemini(s, prompt, cb, true);
        return;
      }
      cb('Gemini API ' + xhr.status + (detail ? ': ' + detail.slice(0, 60) : ''), null);
      return;
    }
    try {
      var res = JSON.parse(xhr.responseText);
      if (res.promptFeedback && res.promptFeedback.blockReason) {
        cb('Gemini blocked the prompt (' + res.promptFeedback.blockReason + ')', null);
        return;
      }
      var cand = res.candidates && res.candidates[0];
      if (!cand || !cand.content || !cand.content.parts) {
        cb('Gemini returned no text' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : ''), null);
        return;
      }
      var text = '';
      for (var i = 0; i < cand.content.parts.length; i++) {
        var part = cand.content.parts[i];
        if (part.thought) continue;          // 思考の要約は使わない
        if (part.text) text += part.text;
      }
      if (res.usageMetadata) {
        var um = res.usageMetadata;
        console.log('usage: in=' + um.promptTokenCount + ' out=' + um.candidatesTokenCount +
                    ' thinking=' + (um.thoughtsTokenCount || 0));
      }
      cb(null, text);
    } catch (e) {
      cb('Gemini parse error', null);
    }
  };
  xhr.onerror = function() { cb('Gemini network error', null); };
  xhr.send(JSON.stringify(body));
}

// ─── プロンプトの組み立て ────────────────────────────────────────────────
var WEATHER_PLACEHOLDERS = ['{weather}', '{forecast}', '{feel}', '{temp}', '{apparent}',
                            '{tempmax}', '{tempmin}', '{pop}', '{humidity}', '{wind}',
                            '{rain}', '{rainsum}', '{weather_change}', '{thunder}'];

// 「。」「改行」「. 」で文に区切る（正規表現の後読みを使わない）
function splitSentences(t) {
  var out = [], buf = '';
  for (var i = 0; i < t.length; i++) {
    var c = t.charAt(i);
    buf += c;
    var next = t.charAt(i + 1);
    if (c === '。' || c === '\n' || (c === '.' && (next === '' || next === ' ' || next === '\n'))) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf) out.push(buf);
  return out;
}

// 情報が取れなかったときは、その語を含む文ごと落とす
function dropSentencesWith(template, placeholders) {
  var kept = splitSentences(template).filter(function(sentence) {
    for (var i = 0; i < placeholders.length; i++) {
      if (sentence.indexOf(placeholders[i]) >= 0) return false;
    }
    return true;
  });
  // 文が落ちて中身の無くなった【見出し】を消し、増えた空行を節の区切り（空行1つ）まで詰める
  return kept.join('').replace(/^【[^】\n]*】\n(?=\n|$)/gm, '')
    .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// 【見出し】で始まる節（空行まで）がその語を含むなら、節ごと落とす。
// 見出しの行に説明が続く節では、文だけ落とすと説明が宙に浮くため
function dropSectionsWith(template, placeholders) {
  return template.split(/\n{2,}/).filter(function(block) {
    if (block.charAt(0) !== '【') return true;
    for (var i = 0; i < placeholders.length; i++) {
      if (block.indexOf(placeholders[i]) >= 0) return false;
    }
    return true;
  }).join('\n\n');
}

// 月の文を入れるか。昼間・新月前後・月が沈んでいる・厚い雲、のどれかなら入れない
var DAYTIME_PHASES = { sunrise: true, morning: true, noon: true, afternoon: true };

function moonApplies(now, st, w) {
  if (DAYTIME_PHASES[periodOf(now, st)]) return false;
  if (!moon.isVisiblePhase(now)) return false;
  if (w && w.cloud !== null && w.cloud >= 90) return false;
  var sunrise = (st && st.rise !== st.set) ? st.rise : 5 * 60 + 30;
  return moon.isUp(now, sunrise);
}

function buildPrompt(template, lang, w, opts) {
  var now = new Date();
  var text = w ? template : dropSentencesWith(template, WEATHER_PLACEHOLDERS);
  if (!(opts && opts.place)) text = dropSentencesWith(text, ['{place}']);
  if (loadSteps() === null) text = dropSentencesWith(text, ['{steps}', '{activity}']);
  if (!w || !weather.change(w, lang)) text = dropSentencesWith(text, ['{weather_change}']);
  if (!w || !weather.thunder(w, lang)) text = dropSentencesWith(text, ['{thunder}']);
  if (!special.sentence(now, lang)) text = dropSentencesWith(text, ['{special}']);
  var sched = schedule.sentence(opts && opts.events, now, lang);
  if (!sched) text = dropSentencesWith(text, ['{schedule}']);
  if (lang !== 'ja') text = dropSentencesWith(text, ['{kigo}', '{kigo_plain}']);
  var history = loadHistory().reverse();   // 新しい句から先に並べる（保存は古い順）
  if (!history.length) text = dropSentencesWith(dropSectionsWith(text, ['{recent}']), ['{recent}']);   // 初回は節ごと（節でなければ文ごと）落とす
  if (!moonApplies(now, todaySunTimes(), w)) text = dropSentencesWith(text, ['{moon}', '{moonage}']);
  var st = todaySunTimes();
  var map = {
    '{date}': humanDate(lang),
    '{season}': season.season(now, lang),
    '{sekki}': season.sekki(now, lang),
    '{time}': clockText(now, lang),
    '{timeofday}': periodWord(periodOf(now, st), lang),
    '{sun}': sunRelation(now, st, lang) || (lang === 'ja' ? '不明' : 'unknown'),
    '{moon}': moon.phase(now, lang),
    '{moonage}': moon.ageText(now),
    '{daytype}': dayType(now, lang),
    '{recent}': history.join(lang === 'ja' ? ' ／ ' : ' | ')
  };
  var steps = loadSteps();
  if (steps !== null) {
    map['{steps}'] = String(steps);
    map['{activity}'] = activityWord(steps, lang);
  }
  var change = weather.change(w, lang);
  if (change) map['{weather_change}'] = change;
  var thunder = weather.thunder(w, lang);
  if (thunder) map['{thunder}'] = thunder;
  // 今回使う技法。直近で使ったものは避ける。実際に詠ませたときだけ記録する
  var tech = opts && opts.technique;
  if (tech) map['{technique}'] = lang === 'ja' ? tech.ja : tech.en;
  var cut = opts && opts.kire;
  if (cut) map['{kire}'] = lang === 'ja' ? cut.ja : cut.en;

  // その時の季節・時期・時間帯・天気に合う季語の候補（日本語のみ）。
  // {kigo} は本意つき、{kigo_plain} は語だけ。どちらも24語並べる。
  // 別々に選ぶので、両方を同時にプロンプトへ置くことは想定していない。
  // 直近の句（{recent} と同じ8句）で使った季語は候補から外す
  if (lang === 'ja') {
    var seasonKey = { '春': 'spring', '夏': 'summer', '秋': 'autumn', '冬': 'winter' }[season.season(now, 'ja')];
    var periods = season.periods(now), tod = periodOf(now, st);
    var used = kigo.usedIn(history);
    if (used.length) console.log('recent kigo: ' + used.join('、'));
    // 物として描けない時候の季語は、技法が許すときだけ候補に入れる
    var cats = [];
    if (tech && tech.noJiko) cats.push('時候');
    if (tech && tech.noTenmon) cats.push('天文');   // 空と天気は地上の物と横に並ばない
    var list = kigo.listText(seasonKey, periods, tod, w, 24, false, used, cats);
    if (list) map['{kigo}'] = list;
    var plain = kigo.listText(seasonKey, periods, tod, w, 24, true, used, cats);
    if (plain) map['{kigo_plain}'] = plain;
  }
  if (sched) map['{schedule}'] = sched;
  var sp = special.sentence(now, lang);
  if (sp) map['{special}'] = sp;
  if (opts && opts.place) map['{place}'] = opts.place;
  if (w) {
    map['{feel}'] = weather.feel(w, lang);
    map['{apparent}'] = w.apparent === null ? '?' : String(w.apparent);
    map['{humidity}'] = w.humidity === null ? '?' : String(w.humidity);
    map['{wind}'] = w.wind === null ? '?' : String(w.wind);
    map['{weather}'] = weather.describe(w.code, lang);
    map['{forecast}'] = weather.describe(w.dailyCode, lang);
    map['{temp}'] = w.temp === null ? '?' : String(w.temp);
    // 直近1時間の降水量。現在値（15分値の地域と1時間値の地域がある）ではなく
    // 時間ごとの値を使い、意味を土地によらず一定にする
    var rainHour = null;
    if (w.hourly && w.hourly.precipitation && w.hourly.precipitation.length) {
      rainHour = w.hourly.precipitation[w.hourly.precipitation.length - 1];
    }
    if (rainHour === null || rainHour === undefined) rainHour = w.rain;
    map['{rain}'] = (rainHour === null || rainHour === undefined) ? '0' : String(Math.round(rainHour * 10) / 10);
    map['{rainsum}'] = w.rainSum === null || w.rainSum === undefined ? '0' : String(w.rainSum);  // 今日の合計 mm
    map['{tempmax}'] = w.tmax === null ? '?' : String(w.tmax);
    map['{tempmin}'] = w.tmin === null ? '?' : String(w.tmin);
    map['{pop}'] = w.pop === null ? '?' : String(w.pop);
  }
  Object.keys(map).forEach(function(k) {
    text = text.split(k).join(map[k]);
  });
  // 使われなかった置き換えが残っていても、そのまま送らない
  return text.replace(/\{[a-z]+\}/g, '').replace(/[ \t]{2,}/g, ' ').trim();
}

// ─── 生成の本体 ──────────────────────────────────────────────────────────
function generateHaiku(s) {
  var lang = s.lang;
  var template = lang === 'ja' ? s.promptJa : s.promptEn;

  var key = s.provider === 'openai' ? s.openaiKey : (s.provider === 'gemini' ? s.geminiKey : s.claudeKey);
  if (!key) {
    sendError(lang, 'APIキーが未設定です', 'API key not set');
    return;
  }

  if (inflight) return;
  inflight = true;

  // 天気と地名を集めてから俳句を作る。取れなかった情報は文ごと落とす
  var loc = loadLocation();
  weather.fetch(s.useWeather || s.sideInfo === 2 ? loc : null, function(w) {
    if (w) console.log('weather: ' + JSON.stringify(w));
    saveSideWeather(w);
    if (!s.useWeather) w = null;
    place.fetch(s.usePlace ? loc : null, lang, function(name) {
      if (name) console.log('place: ' + name);
      schedule.fetch(s.icsUrl, function(events) {
        if (events) console.log('calendar: ' + events.length + ' event(s) near now');
        var tech = technique.choose();
        console.log('technique: ' + tech.key);
        technique.remember(tech.key);
        var cut = kire.choose(tech.avoidKire);
        console.log('kire: ' + cut.key);
        kire.remember(cut.key);
        askLLM(s, buildPrompt(template, lang, w,
                              { place: name, technique: tech, kire: cut, events: events }), lang);
      });
    });
  });
}

// kigoRetried: 季重なりで一度詠み直させたか。二度目は重なっていてもそのまま使う
function askLLM(s, prompt, lang, retried, kigoRetried) {
  console.log('prompt: ' + prompt);
  var call = s.provider === 'openai' ? callOpenAI : (s.provider === 'gemini' ? callGemini : callClaude);
  call(s, prompt, function(err, text) {
    if (err) {
      // 一時的な失敗（5xx・通信エラー）は 20 秒後に一度だけやり直す
      if (!retried && /API 5\d\d|network error/.test(err)) {
        console.log('transient error, retrying in 20s: ' + err);
        setTimeout(function() { askLLM(s, prompt, lang, true, kigoRetried); }, 20000);
        return;
      }
      inflight = false;
      sendError(lang, 'エラー: ' + err, 'Error: ' + err);
      return;
    }
    var lines = parseHaiku(text, lang);
    // 季語が二つ以上入っていたら、どれが重なったかを添えて一度だけ詠み直させる
    var kigoFound = lang === 'ja' && lines.length ? kigo.inHaiku(lines) : [];
    if (kigoFound.length >= 2) {
      console.log('kigo overlap: ' + kigoFound.join('、') + ' in ' + JSON.stringify(lines));
      if (!kigoRetried) {
        askLLM(s, prompt + '\n\n【詠み直し】直前の案「' + lines.join(' ') + '」には季語が' +
               kigoFound.length + 'つ（' + kigoFound.join('・') + '）入っている。季語を一つだけにして詠み直す。',
               lang, retried, true);
        return;
      }
    }
    inflight = false;
    if (lines.length === 0) {
      sendError(lang, '俳句を取得できませんでした', 'No haiku received');
      return;
    }
    console.log('haiku: ' + JSON.stringify(lines));
    pushHistory(lines);
    saveCache({ key: currentKey(s), date: todayKey(), lang: lang, provider: s.provider,
                model: s.provider === 'openai' ? s.openaiModel : (s.provider === 'gemini' ? s.geminiModel : s.claudeModel),
                at: new Date().toISOString(), prompt: prompt, lines: lines });
    sendToWatch(lines, lang, STATUS_OK);
  });
}

// 今日の俳句があればそれを送り、無ければ生成する
// 鍵（日付#時間帯、または日付#更新番号）が同じなら手元の句を返し、変わっていれば詠み直す
function ensureHaiku(force) {
  var s = loadSettings();
  var c = loadCache();
  if (!force && c && c.key === currentKey(s) && c.lang === s.lang && c.lines) {
    sendToWatch(c.lines, s.lang, STATUS_OK);
    return;
  }
  generateHaiku(s);
}

// ─── Pebble イベント ─────────────────────────────────────────────────────
Pebble.addEventListener('ready', function() {
  console.log('PebbleKit JS ready');
  upgradePrompts();
  // まず手元の情報で即座に送り、位置情報が更新されたらテーマだけ送り直す
  ensureHaiku(false);
  refreshLocation(function(changed) {
    if (changed) sendTheme();
  });
});

Pebble.addEventListener('appmessage', function(e) {
  if (!e.payload) return;
  // 腕時計が今日の歩数を一緒に送ってくる。0 は計測できていないとみなして使わない
  if (e.payload.STEPS !== undefined && e.payload.STEPS > 0) {
    if (loadSettings().useSteps) saveSteps(e.payload.STEPS);
  }
  if (e.payload.REQUEST_WEATHER !== undefined && loadSettings().sideInfo === 2) {
    sendSideWeather();
  }
  if (e.payload.REQUEST_HAIKU !== undefined) {
    // 日付が変わった時など。位置情報を更新してから今日の句と日の出時刻を送る
    refreshLocation(function() {
      ensureHaiku(false);
    });
  }
});

Pebble.addEventListener('showConfiguration', function() {
  // 設定ページ内の関数が使う値を渡す: 既定プロンプト、いま表示している句、最近の句
  upgradePrompts();
  var c = loadCache();
  clay.meta.userData = {
    promptJa: cfg.DEFAULT_PROMPT_JA,
    promptEn: cfg.DEFAULT_PROMPT_EN,
    current: c && c.lines ? { lines: c.lines, at: c.at || '', provider: c.provider || '', model: c.model || '',
                              prompt: c.prompt || '' } : null,
    history: loadHistory()
  };
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) return;
  try {
    clay.getSettings(e.response, false);
  } catch (err) {
    console.log('config parse error: ' + err);
    return;
  }
  // 空欄で保存されたプロンプトには既定文を入れておく（次に開いたときに見える）
  var raw = {};
  try { raw = JSON.parse(localStorage.getItem('clay-settings')) || {}; } catch (err) {}
  if (!String(raw.CFG_PROMPT_JA || '').trim()) clay.setSettings('CFG_PROMPT_JA', cfg.DEFAULT_PROMPT_JA);
  if (!String(raw.CFG_PROMPT_EN || '').trim()) clay.setSettings('CFG_PROMPT_EN', cfg.DEFAULT_PROMPT_EN);

  var s = loadSettings();
  if (s.regen) {
    clay.setSettings('CFG_REGEN', false);
  }
  ensureHaiku(s.regen);
  if (s.sideInfo === 2) sendSideWeather();
});
