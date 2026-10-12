// 特別な日。この日は通常の作り方より優先して主題にさせる。
// 旧暦にもとづく日（中秋の名月・十三夜）は月齢から求めるとずれるため、年ごとの表で持つ。

// 固定日 [月, 日, 和文, 英文]
var FIXED = [
  [1, 1,   '元日',       "New Year's Day"],
  [1, 7,   '七草',       'the day of the seven herbs'],
  [2, 3,   '節分',       'Setsubun, the eve of spring'],
  [3, 3,   '雛祭り',     'the Doll Festival'],
  [5, 5,   '端午の節句', "Children's Day"],
  [7, 7,   '七夕',       'Tanabata, the star festival'],
  [12, 31, '大晦日',     "New Year's Eve"]
];

// 旧暦由来の日 'YYYY-MM-DD': [和文, 英文]
var LUNAR = {
  '2025-10-06': ['中秋の名月', 'the harvest moon'],
  '2025-11-02': ['十三夜',     'the thirteenth-night moon'],
  '2026-09-25': ['中秋の名月', 'the harvest moon'],
  '2026-10-23': ['十三夜',     'the thirteenth-night moon'],
  '2027-09-15': ['中秋の名月', 'the harvest moon'],
  '2027-10-12': ['十三夜',     'the thirteenth-night moon'],
  '2028-10-03': ['中秋の名月', 'the harvest moon'],
  '2028-10-30': ['十三夜',     'the thirteenth-night moon'],
  '2029-09-22': ['中秋の名月', 'the harvest moon'],
  '2029-10-20': ['十三夜',     'the thirteenth-night moon'],
  '2030-09-12': ['中秋の名月', 'the harvest moon'],
  '2030-10-09': ['十三夜',     'the thirteenth-night moon']
};

function pad2(n) { return (n < 10 ? '0' : '') + n; }

// その日の呼び名。特別な日でなければ null
function nameOf(date, lang) {
  var key = date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  var lunar = LUNAR[key];
  if (lunar) return lang === 'ja' ? lunar[0] : lunar[1];

  var m = date.getMonth() + 1, d = date.getDate();
  for (var i = 0; i < FIXED.length; i++) {
    if (FIXED[i][0] === m && FIXED[i][1] === d) return lang === 'ja' ? FIXED[i][2] : FIXED[i][3];
  }
  return null;
}

// プロンプトに差し込む一文。通常の作り方より優先させる
function sentence(date, lang) {
  var name = nameOf(date, lang);
  if (!name) return null;
  if (lang === 'ja') {
    return '【本日は' + name + '】上の条件よりもこの一事を優先し、これを主題として詠むこと。';
  }
  return '[Today is ' + name + '] Make this the subject of the haiku, ahead of everything above.';
}

module.exports = { nameOf: nameOf, sentence: sentence };
