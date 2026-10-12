// 保存してあるプロンプトを、直した既定プロンプトに追いつかせる。
// 設定画面は空欄に既定文をそのまま書き込むので、既定を直しても手元には古い文が残る。
// そこで手元の文がどの既定から来たか（base）を覚えておき、既定が変わったら
// base → 今の既定 の変更を行ごとに手元の文へ当てる。利用者が書き換えた行には触れない。

var BASE_KEY = 'prompt-base';

// base を覚えるようになる前の版から上がるときは、その版の既定を base とみなす
var LEGACY = require('./prompt_legacy');

function loadBases() {
  try { return JSON.parse(localStorage.getItem(BASE_KEY)) || {}; } catch (e) { return {}; }
}

function saveBases(b) {
  try { localStorage.setItem(BASE_KEY, JSON.stringify(b)); } catch (e) {}
}

// a → b の行の差分を、変わった行のまとまりごとに返す。
// anchor はまとまりの直前にある変わらない行。空行は目印にならないので飛ばす
function hunks(a, b) {
  var n = a.length, m = b.length, i, j, L = [];
  for (i = 0; i <= n; i++) {
    L.push([]);
    for (j = 0; j <= m; j++) L[i].push(0);
  }
  for (i = n - 1; i >= 0; i--) {
    for (j = m - 1; j >= 0; j--) {
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  var out = [], cur = null, anchor = null;
  i = 0; j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      if (cur) { out.push(cur); cur = null; }
      if (a[i].trim()) anchor = a[i];
      i++; j++;
    } else {
      if (!cur) cur = { anchor: anchor, del: [], ins: [] };
      if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) cur.ins.push(b[j++]);
      else cur.del.push(a[i++]);
    }
  }
  if (cur) out.push(cur);
  return out;
}

// lines の from 以降で、run と同じ行の並びが始まる位置
function runAt(lines, run, from) {
  for (var k = from; k + run.length <= lines.length; k++) {
    var hit = true;
    for (var r = 0; r < run.length; r++) {
      if (lines[k + r] !== run[r]) { hit = false; break; }
    }
    if (hit) return k;
  }
  return -1;
}

// base から next への変更を text に当てる
function merge(base, next, text) {
  if (text === base || text === next) return next;
  var p = text.split('\n'), hs = hunks(base.split('\n'), next.split('\n'));
  for (var h = 0; h < hs.length; h++) {
    var hk = hs[h], from = 0;
    if (hk.anchor !== null) {
      var at = p.indexOf(hk.anchor);
      if (at >= 0) from = at + 1;
      else if (!hk.del.length) continue;             // 足す行の置き場所が分からない
    }
    if (hk.del.length) {
      var k = runAt(p, hk.del, from);
      if (k < 0) continue;                           // 利用者が書き換えた行には触れない
      p.splice.apply(p, [k, hk.del.length].concat(hk.ins));
    } else if (runAt(p, hk.ins, from) !== from) {    // すでに同じ行があれば足さない
      p.splice.apply(p, [from, 0].concat(hk.ins));
    }
  }
  return p.join('\n');
}

// 手元のプロンプト text を、今の既定 def に追いつかせた文を返す。lang は 'ja' / 'en'
function upgrade(lang, def, text) {
  var bases = loadBases(), base = bases[lang];
  if (typeof base !== 'string') base = LEGACY[lang] || def;
  var out = text;
  if (base !== def && String(text || '').trim()) out = merge(base, def, String(text).replace(/\r\n/g, '\n'));
  if (bases[lang] !== def) { bases[lang] = def; saveBases(bases); }
  return out;
}

module.exports = { upgrade: upgrade, merge: merge };
