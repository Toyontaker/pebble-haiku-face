// 月齢と月相。俳句の季感の手がかりとしてプロンプトに渡す。
// 平均朔望月による近似で、誤差はおおむね1日以内。

var SYNODIC = 29.530588853;
// 2000-01-06 18:14 UTC の新月を基準にする
var NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14) / 86400000;

// 月齢（0〜29.5）
function age(date) {
  var days = date.getTime() / 86400000;
  var a = (days - NEW_MOON_EPOCH) % SYNODIC;
  if (a < 0) a += SYNODIC;
  return a;
}

var PHASES = [
  [1.0,  '新月',   'new moon'],
  [3.5,  '繊月',   'waxing crescent'],
  [6.0,  '三日月', 'crescent moon'],
  [9.0,  '上弦の月', 'first quarter'],
  [12.5, '十日夜の月', 'waxing gibbous'],
  [14.0, '小望月', 'nearly full moon'],
  [16.5, '満月',   'full moon'],
  [19.0, '十六夜の月', 'waning gibbous'],
  [22.0, '寝待月', 'waning gibbous'],
  [24.5, '下弦の月', 'last quarter'],
  [27.5, '有明月', 'waning crescent'],
  [30.0, '晦の月', 'old moon']
];

function phase(date, lang) {
  var a = age(date);
  for (var i = 0; i < PHASES.length; i++) {
    if (a < PHASES[i][0]) return lang === 'ja' ? PHASES[i][1] : PHASES[i][2];
  }
  return lang === 'ja' ? '晦の月' : 'old moon';
}

// 月が地平線の上にあるかの近似。
// 月の出は新月で日の出と同時、その後は1日あたり約49分ずつ遅れ、出てから約12.4時間で沈むとみなす。
// 緯度や月の赤緯は無視しているので、境目では1〜2時間ずれる。
function isUp(date, sunriseMin) {
  var a = age(date);
  var rise = (sunriseMin + a * (1440 / SYNODIC)) % 1440;   // 月の出（分）
  var span = 1440 * 0.517;                                  // 出ている時間（約12.4時間）
  var now = date.getHours() * 60 + date.getMinutes();
  var since = now - rise;
  if (since < 0) since += 1440;
  return since < span;
}

// 見える月か（新月前後は見えない）
function isVisiblePhase(date) {
  var a = age(date);
  return a >= 1.5 && a <= 28.0;
}

module.exports = {
  isUp: isUp,
  isVisiblePhase: isVisiblePhase,
  age: age,
  phase: phase,
  ageText: function(date) { return age(date).toFixed(1); }
};
