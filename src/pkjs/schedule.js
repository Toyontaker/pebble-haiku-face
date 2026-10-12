// Google カレンダーなどが配る ICS（iCalendar）から、いま前後1時間にある予定を1件だけ取る。
// 見るのは時刻の付いた単発の予定だけで、次の2つは読み飛ばす。
//   終日予定   : DTSTART;VALUE=DATE:20260911（時刻を持たない）
//   繰り返し   : RRULE / RDATE / RECURRENCE-ID を持つ VEVENT
// 時刻は電話のローカル時間として扱う。末尾が Z の値だけ UTC から直す。
// TZID は見ない（電話と暦の時間帯が違うと、その差だけずれる）。

var WINDOW_MS = 60 * 60 * 1000;   // 予定の前後どこまでを句の条件にするか
var TIMEOUT_MS = 20000;

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function dayKey(d) {
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
}

// 75バイトで折り返された行を元に戻す（続きの行は空白かタブで始まる）
function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

// SUMMARY:研究会\, 第3回 のようなエスケープを戻す
function unescapeText(s) {
  return s.replace(/\\[nN]/g, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim();
}

// VEVENT の行から一つの属性を拾う。'DTSTART;TZID=Asia/Tokyo:20260911T140000' なら
// { params: ';TZID=Asia/Tokyo', value: '20260911T140000' }
function prop(lines, name) {
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.indexOf(name) !== 0) continue;
    var next = line.charAt(name.length);
    if (next !== ':' && next !== ';') continue;      // DTEND と DTSTAMP を取り違えない
    var colon = line.indexOf(':');
    if (colon < 0) continue;
    return { params: line.substring(name.length, colon), value: line.substring(colon + 1).trim() };
  }
  return null;
}

// 20260911T140000（ローカル）と 20260911T050000Z（UTC）を Date にする
function parseDateTime(value) {
  var m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return null;
  if (m[7]) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

// 一つの VEVENT から予定を作る。終日・繰り返し・日時が読めないものは null
function readEvent(lines, start) {
  if (prop(lines, 'RRULE') || prop(lines, 'RDATE') || prop(lines, 'RECURRENCE-ID')) return null;
  if (start.params.indexOf('VALUE=DATE') >= 0) return null;
  var from = parseDateTime(start.value);
  if (!from) return null;
  var end = prop(lines, 'DTEND');
  var to = end ? parseDateTime(end.value) : null;
  var title = prop(lines, 'SUMMARY');
  title = title ? unescapeText(title.value) : '';
  if (!title) return null;                          // 件名を句に使うので、無題は捨てる
  return { title: title, start: from, end: to && to >= from ? to : from };
}

// ICS の全文から、いまの前後にありうる予定だけを拾う。
// カレンダー全体（何千件にもなる）が返ってくるので、DTSTART の日付が近い VEVENT だけを開く。
// 見るのは DTSTART の値だけ。ブロック全体を探すと、書き出し時刻の DTSTAMP や
// CREATED が今日の日付を持つため、どの予定も「近い」ことになってしまう。
function parse(text, now) {
  var out = [];
  if (!text) return out;
  var body = unfold(text);
  var at = new Date(now.getTime());
  var keys = [];
  for (var d = -1; d <= 1; d++) {                   // UTC 表記で前後にずれるぶんを見込む
    at.setTime(now.getTime() + d * 24 * 60 * 60 * 1000);
    keys.push(dayKey(at));
  }
  var i = 0;
  while (true) {
    var b = body.indexOf('BEGIN:VEVENT', i);
    if (b < 0) break;
    var e = body.indexOf('END:VEVENT', b);
    if (e < 0) break;
    i = e + 10;
    var lines = body.substring(b, e).split('\n');
    var start = prop(lines, 'DTSTART');
    if (!start) continue;
    var day = start.value.substring(0, 8);
    var near = false;
    for (var k = 0; k < keys.length; k++) {
      if (keys[k] === day) { near = true; break; }
    }
    if (!near) continue;
    var ev = readEvent(lines, start);
    if (ev) out.push(ev);
  }
  return out;
}

// 前後1時間に入っている予定を1件だけ選ぶ。開催中を先に、次にいまへ近いものを取る
function pick(events, now) {
  var t = now.getTime(), best = null, bestGap = null;
  for (var i = 0; i < (events || []).length; i++) {
    var ev = events[i], gap;
    if (t >= ev.start.getTime() && t <= ev.end.getTime()) gap = 0;
    else if (t < ev.start.getTime()) gap = ev.start.getTime() - t;
    else gap = t - ev.end.getTime();
    if (gap > WINDOW_MS) continue;
    if (bestGap === null || gap < bestGap) { best = ev; bestGap = gap; }
  }
  return best;
}

function minutesOf(ms) { return Math.max(1, Math.round(ms / 60000)); }

// プロンプトに差し込む一文。句点は入れない（テンプレート側が持つ）
function sentence(events, now, lang) {
  var ev = pick(events, now);
  if (!ev) return null;
  var t = now.getTime();
  if (t >= ev.start.getTime() && t <= ev.end.getTime()) {
    return lang === 'ja' ? ev.title + 'の予定中です'
                         : 'you are in the middle of ' + ev.title;
  }
  if (t < ev.start.getTime()) {
    var before = minutesOf(ev.start.getTime() - t);
    return lang === 'ja' ? ev.title + 'の予定が' + before + '分後に入っています'
                         : ev.title + ' starts in ' + before + ' minutes';
  }
  var after = minutesOf(t - ev.end.getTime());
  return lang === 'ja' ? ev.title + 'の予定が終わってから' + after + '分後です'
                       : ev.title + ' ended ' + after + ' minutes ago';
}

// ICS を取る。取れなくても句作りは止めないので、失敗は null で返す
function fetch(url, cb) {
  if (!url) { cb(null); return; }

  var done = false;
  function finish(v) {
    if (done) return;
    done = true;
    cb(v);
  }
  setTimeout(function() { finish(null); }, TIMEOUT_MS);

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    if (xhr.status !== 200) {
      console.log('calendar error: ' + xhr.status);
      finish(null);
      return;
    }
    try {
      finish(parse(xhr.responseText, new Date()));
    } catch (err) {
      console.log('calendar parse error: ' + err);
      finish(null);
    }
  };
  xhr.onerror = function() { finish(null); };
  xhr.send();
}

module.exports = {
  fetch: fetch, parse: parse, pick: pick, sentence: sentence, WINDOW_MS: WINDOW_MS
};
