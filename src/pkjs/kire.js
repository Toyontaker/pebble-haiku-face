// 切れの型。呼び出すたびに一つを無作為に選び、句の切れ方を指定する。
// 直近2回に使った型は避け、同じ切れ方が続かないようにする。

var KIRE = [
  { key: 'kamigo_ya',     ja: '上五の末尾を切れ字「や」で切る。中七・下五には切れ字を置かない',
                          en: 'a cut at the end of the first line' },
  { key: 'nakashichi_ya', ja: '中七の末尾を切れ字「や」で切る。上五・下五には切れ字を置かない',
                          en: 'a cut at the end of the second line' },
  { key: 'kana',          ja: '下五の末尾を「かな」で結ぶ。上五・中七には切れ字を置かない',
                          en: 'a closing line that ends in quiet wonder' },
  { key: 'keri',          ja: '下五の末尾を「けり」で結ぶ。上五・中七には切れ字を置かない',
                          en: 'a closing line that ends on a sudden realisation' },
  { key: 'none',          ja: '切れ字（や・かな・けり）を使わない。名詞止めや句中の間で切るか、二物を並べる',
                          en: 'no explicit cut; let a pause or two side-by-side images do the work' }
];

var KEY = 'kire-history';
var AVOID = 2;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
}

function remember(key) {
  var h = loadHistory();
  h.push(key);
  if (h.length > AVOID) h = h.slice(-AVOID);
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch (e) {}
}

// 直近で使っていない型から一つ選ぶ。avoid は技法と噛み合わない型（technique.js の avoidKire）
function choose(avoid) {
  var recent = loadHistory();
  var ok = [], pool = [];
  for (var i = 0; i < KIRE.length; i++) {
    if (!avoid || avoid.indexOf(KIRE[i].key) < 0) ok.push(KIRE[i]);
  }
  for (var j = 0; j < ok.length; j++) {
    if (recent.indexOf(ok[j].key) < 0) pool.push(ok[j]);
  }
  if (!pool.length) pool = ok;
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = { choose: choose, remember: remember, all: KIRE };
