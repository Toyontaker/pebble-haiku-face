// 日の出・日の入りの計算（NOAA の簡易式）。精度は数分程度。
//
// sunTimes(lat, lon, date, tzOffsetMin)
//   lat, lon    : 度（東経・北緯が正）
//   date        : 計算する日（ローカル日付として使用）
//   tzOffsetMin : ローカル時刻の UTC からのオフセット（分。JST なら +540）
// 戻り値: { rise: 分, set: 分 }（0〜1439、ローカル時刻の 0:00 からの分）
//         白夜・極夜で日の出/日の入りが無い日は null

function norm(min) {
  min = min % 1440;
  if (min < 0) min += 1440;
  return Math.round(min);
}

function sunTimes(lat, lon, date, tzOffsetMin) {
  var rad = Math.PI / 180;
  var start = new Date(date.getFullYear(), 0, 0);
  var doy = Math.floor((date - start) / 86400000);

  // 正午付近の fractional year
  var g = (2 * Math.PI / 365) * (doy - 1 + 0.5);
  var eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) -
                         0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) -
             0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) -
             0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);

  var zenith = 90.833 * rad;
  var cosH = Math.cos(zenith) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  if (cosH > 1 || cosH < -1) return null;

  var ha = Math.acos(cosH) / rad;
  var riseUTC = 720 - 4 * (lon + ha) - eqtime;
  var setUTC  = 720 - 4 * (lon - ha) - eqtime;
  return { rise: norm(riseUTC + tzOffsetMin), set: norm(setUTC + tzOffsetMin) };
}

module.exports = { sunTimes: sunTimes };
