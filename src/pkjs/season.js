// 二十四節気と季節。俳句の季語選びの手がかりとしてプロンプトに埋め込む。
// 節気の入りは年によって1日前後ずれるため、代表的な日付で近似している。

// [月, 日, 和名, 英名]
var SEKKI = [
  [1, 6, '小寒', 'Minor Cold'],       [1, 20, '大寒', 'Major Cold'],
  [2, 4, '立春', 'Start of Spring'],  [2, 19, '雨水', 'Rain Water'],
  [3, 6, '啓蟄', 'Awakening of Insects'], [3, 21, '春分', 'Spring Equinox'],
  [4, 5, '清明', 'Pure Brightness'],  [4, 20, '穀雨', 'Grain Rain'],
  [5, 6, '立夏', 'Start of Summer'],  [5, 21, '小満', 'Grain Full'],
  [6, 6, '芒種', 'Grain in Ear'],     [6, 21, '夏至', 'Summer Solstice'],
  [7, 7, '小暑', 'Minor Heat'],       [7, 23, '大暑', 'Major Heat'],
  [8, 8, '立秋', 'Start of Autumn'],  [8, 23, '処暑', 'End of Heat'],
  [9, 8, '白露', 'White Dew'],        [9, 23, '秋分', 'Autumn Equinox'],
  [10, 8, '寒露', 'Cold Dew'],        [10, 24, '霜降', 'Frost Descent'],
  [11, 8, '立冬', 'Start of Winter'], [11, 22, '小雪', 'Minor Snow'],
  [12, 7, '大雪', 'Major Snow'],      [12, 22, '冬至', 'Winter Solstice']
];

// その日が属する節気
function sekki(date, lang) {
  var m = date.getMonth() + 1, d = date.getDate();
  var found = SEKKI[SEKKI.length - 1];  // 1/1〜1/5 は前年の冬至
  for (var i = 0; i < SEKKI.length; i++) {
    var s = SEKKI[i];
    if (m > s[0] || (m === s[0] && d >= s[1])) found = s;
  }
  return lang === 'ja' ? found[2] : found[3];
}

// 二十四節気に合わせた季節（立春から春、立夏から夏…）
function season(date, lang) {
  var m = date.getMonth() + 1, d = date.getDate();
  var v = m * 100 + d;
  var name;
  if (v >= 204 && v < 506) name = ['春', 'spring'];
  else if (v >= 506 && v < 808) name = ['夏', 'summer'];
  else if (v >= 808 && v < 1108) name = ['秋', 'autumn'];
  else name = ['冬', 'winter'];
  return lang === 'ja' ? name[0] : name[1];
}

// 節気から「三春」「初春」などの時期区分を返す。季語表の絞り込みに使う
// 立春〜啓蟄=初春, 春分〜穀雨=仲春... のように、節気2つで1区分
var PERIOD_BY_SEKKI = {
  '立春': ['初春', '三春'], '雨水': ['初春', '三春'],
  '啓蟄': ['仲春', '三春'], '春分': ['仲春', '三春'],
  '清明': ['晩春', '三春'], '穀雨': ['晩春', '三春'],
  '立夏': ['初夏', '三夏'], '小満': ['初夏', '三夏'],
  '芒種': ['仲夏', '三夏'], '夏至': ['仲夏', '三夏'],
  '小暑': ['晩夏', '三夏'], '大暑': ['晩夏', '三夏'],
  '立秋': ['初秋', '三秋'], '処暑': ['初秋', '三秋'],
  '白露': ['仲秋', '三秋'], '秋分': ['仲秋', '三秋'],
  '寒露': ['晩秋', '三秋'], '霜降': ['晩秋', '三秋'],
  '立冬': ['初冬', '三冬'], '小雪': ['初冬', '三冬'],
  '大雪': ['仲冬', '三冬'], '冬至': ['仲冬', '三冬'],
  '小寒': ['晩冬', '三冬'], '大寒': ['晩冬', '三冬']
};

// その日に使ってよい時期区分。新年（1/1〜1/7）は新年の季語も含める
function periods(date) {
  var name = sekki(date, 'ja');
  var list = (PERIOD_BY_SEKKI[name] || []).slice();
  var m = date.getMonth() + 1, d = date.getDate();
  if (m === 1 && d <= 7) list.push('新年');
  if (m === 12 && d >= 20) list.push('暮');
  return list;
}

module.exports = { sekki: sekki, season: season, periods: periods };
