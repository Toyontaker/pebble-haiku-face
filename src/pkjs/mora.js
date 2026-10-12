// 仮名の読みから拍（モーラ）を数える。
// 拗音（きゃ・しゅ等）の小書き仮名は直前と合わせて1拍。
// 促音「っ」撥音「ん」長音「ー」はそれぞれ1拍。

var SMALL = 'ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ';

function count(yomi) {
  if (!yomi) return 0;
  var n = 0;
  for (var i = 0; i < yomi.length; i++) {
    var ch = yomi.charAt(i);
    if (ch === ' ' || ch === '　') continue;
    if (SMALL.indexOf(ch) >= 0 && n > 0) continue;   // 小書き仮名は直前と合わせて1拍
    n++;
  }
  return n;
}

module.exports = { count: count };
