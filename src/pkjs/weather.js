// Open-Meteo から今日の天気を取得する。API キーは不要。
// https://open-meteo.com/  (無料・非商用/商用いずれも利用可、出典表示のみ)

var API = 'https://api.open-meteo.com/v1/forecast';

// WMO weather code → 天気の言葉
var CODES = {
  0:  { ja: '快晴',           en: 'clear sky' },
  1:  { ja: '晴れ',           en: 'mainly clear' },
  2:  { ja: '薄曇り',         en: 'partly cloudy' },
  3:  { ja: '曇り',           en: 'overcast' },
  45: { ja: '霧',             en: 'fog' },
  48: { ja: '霧氷の霧',       en: 'freezing fog' },
  // 霧雨と呼ばないのは、「霧」の字が霧の季語（秋霧・朝霧）を呼ぶため。
  // 霧が出ていないのに霧を詠ませてしまう。霧の字を使うのは実際に霧が出る 45・48 だけにする
  51: { ja: 'ごく弱い雨',     en: 'light drizzle' },
  53: { ja: '弱い雨',         en: 'drizzle' },
  55: { ja: '絶え間ない弱い雨', en: 'heavy drizzle' },
  56: { ja: '凍る弱い雨',     en: 'freezing drizzle' },
  57: { ja: '強く凍る弱い雨', en: 'heavy freezing drizzle' },
  61: { ja: '小雨',           en: 'light rain' },
  63: { ja: '雨',             en: 'rain' },
  65: { ja: '大雨',           en: 'heavy rain' },
  66: { ja: '凍る雨',         en: 'freezing rain' },
  67: { ja: '強く凍る雨',     en: 'heavy freezing rain' },
  71: { ja: '小雪',           en: 'light snow' },
  73: { ja: '雪',             en: 'snow' },
  75: { ja: '大雪',           en: 'heavy snow' },
  77: { ja: '細氷',           en: 'snow grains' },
  80: { ja: 'にわか雨',       en: 'rain showers' },
  81: { ja: '強いにわか雨',   en: 'heavy rain showers' },
  82: { ja: '激しいにわか雨', en: 'violent rain showers' },
  85: { ja: 'にわか雪',       en: 'snow showers' },
  86: { ja: '強いにわか雪',   en: 'heavy snow showers' },
  95: { ja: '雷雨',           en: 'thunderstorm' },
  96: { ja: '雹まじりの雷雨', en: 'thunderstorm with hail' },
  99: { ja: '激しい雷雨',     en: 'severe thunderstorm' }
};

// 降っているものが雪か雨か。霰・霙は雨の側に置く（体感が雨に近い）
function snowing(w) {
  var c = w && w.code;
  return (c >= 71 && c <= 77) || c === 85 || c === 86;
}

function describe(code, lang) {
  var c = CODES[code];
  if (!c) return lang === 'ja' ? '不明' : 'unknown';
  return lang === 'ja' ? c.ja : c.en;
}

// loc: {lat, lon} / cb(weather|null)
// weather: { code, temp, dailyCode, tmax, tmin, pop }
function fetch(loc, cb) {
  if (!loc) { cb(null); return; }

  var done = false;
  function finish(w) {
    if (done) return;
    done = true;
    cb(w);
  }
  // 応答が返らなくても俳句の生成を止めない
  setTimeout(function() { finish(null); }, 20000);

  var url = API +
    '?latitude=' + loc.lat.toFixed(3) +
    '&longitude=' + loc.lon.toFixed(3) +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,cloud_cover,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum' +
    '&hourly=weather_code,precipitation,temperature_2m,wind_speed_10m,cloud_cover' +
    '&past_hours=3&forecast_hours=1' +
    '&timezone=auto&forecast_days=1';

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    if (xhr.status !== 200) {
      console.log('weather error: ' + xhr.status);
      finish(null);
      return;
    }
    try {
      var r = JSON.parse(xhr.responseText);
      var d = r.daily || {};
      var c = r.current || {};
      finish({
        code: c.weather_code,
        temp: c.temperature_2m === undefined ? null : Math.round(c.temperature_2m),
        apparent: c.apparent_temperature === undefined ? null : Math.round(c.apparent_temperature),
        humidity: c.relative_humidity_2m === undefined ? null : Math.round(c.relative_humidity_2m),
        wind: c.wind_speed_10m === undefined ? null : Math.round(c.wind_speed_10m * 10) / 10,
        rain: c.precipitation === undefined ? null : c.precipitation,
        cloud: c.cloud_cover === undefined ? null : Math.round(c.cloud_cover),
        dailyCode: d.weather_code ? d.weather_code[0] : null,
        tmax: d.temperature_2m_max ? Math.round(d.temperature_2m_max[0]) : null,
        tmin: d.temperature_2m_min ? Math.round(d.temperature_2m_min[0]) : null,
        pop: d.precipitation_probability_max ? d.precipitation_probability_max[0] : null,
        rainSum: d.precipitation_sum ? Math.round(d.precipitation_sum[0] * 10) / 10 : null,
        hourly: r.hourly || null
      });
    } catch (e) {
      console.log('weather parse error: ' + e);
      finish(null);
    }
  };
  xhr.onerror = function() { finish(null); };
  xhr.send();
}

// 気温・湿度・風・雨から「体感」を言葉にする。予報の分類より肌の感覚に近い。
function feel(w, lang) {
  if (!w) return null;
  var t = w.apparent === null ? w.temp : w.apparent;
  var parts = [];

  if (t !== null) {
    if (t >= 33)      parts.push(lang === 'ja' ? '茹だるような暑さ' : 'blistering heat');
    else if (t >= 28) parts.push(lang === 'ja' ? '汗ばむ暑さ' : 'sweaty heat');
    else if (t >= 23) parts.push(lang === 'ja' ? 'ぬるい暖かさ' : 'mild warmth');
    else if (t >= 17) parts.push(lang === 'ja' ? '過ごしやすい涼しさ' : 'comfortable coolness');
    else if (t >= 11) parts.push(lang === 'ja' ? '肌寒さ' : 'a chill in the air');
    else if (t >= 4)  parts.push(lang === 'ja' ? '底冷え' : 'penetrating cold');
    else if (t >= -3) parts.push(lang === 'ja' ? '凍てつく寒さ' : 'freezing cold');
    else              parts.push(lang === 'ja' ? '身を切る寒さ' : 'biting cold');
  }
  if (w.humidity !== null && w.humidity >= 80 && t !== null && t >= 22) {
    parts.push(lang === 'ja' ? '空気は湿って重い' : 'the air is heavy and humid');
  } else if (w.humidity !== null && w.humidity <= 35) {
    parts.push(lang === 'ja' ? '空気は乾いている' : 'the air is dry');
  }
  if (w.wind !== null) {
    if (w.wind >= 10)     parts.push(lang === 'ja' ? '風が強く吹きつける' : 'the wind gusts hard');
    else if (w.wind >= 5) parts.push(lang === 'ja' ? '風がある' : 'there is a breeze');
    else if (w.wind < 1)  parts.push(lang === 'ja' ? '風はほとんど無い' : 'the air is still');
  }
  if (w.rain !== null && w.rain > 0) {
    if (snowing(w)) parts.push(lang === 'ja' ? '今まさに雪が降っている' : 'snow is falling right now');
    else            parts.push(lang === 'ja' ? '今まさに雨が落ちている' : 'rain is falling right now');
  }
  return parts.join(lang === 'ja' ? '、' : ', ');
}

// 天気の移り目。1〜3時間前と今を比べて、変わった点を一文にする。
// 変化が無ければ null（プロンプトからその文ごと落とす）
function change(w, lang) {
  if (!w || !w.hourly || !w.hourly.time || w.hourly.time.length < 2) return null;
  var h = w.hourly;
  // Open-Meteo は現在の時間帯を配列の最後に返す。その時間と、2〜3時間前を比べる
  var now = h.time.length - 1, before = Math.max(0, now - 3);
  if (now === before) return null;

  function at(key, i) {
    return (h[key] && h[key][i] !== undefined && h[key][i] !== null) ? h[key][i] : null;
  }
  // 現在値（15分ごと）と食い違う移り目は出さない。プロンプト内の矛盾を避ける
  var rainNowActual = (w.rain === undefined || w.rain === null) ? null : w.rain;
  var rainNow = at('precipitation', now), rainBefore = at('precipitation', before);
  var tempNow = at('temperature_2m', now), tempBefore = at('temperature_2m', before);
  var windNow = at('wind_speed_10m', now), windBefore = at('wind_speed_10m', before);
  var cloudNow = at('cloud_cover', now), cloudBefore = at('cloud_cover', before);

  var ja = lang === 'ja';
  // 時間ごとの値は本降りでも、いまは霧雨や小やみ、ということがある。
  // そのままだと「直近1時間は6ミリ」と「空は霧雨」が同じプロンプトに並んで食い違うので、
  // 弱まったことを言って辻褄を合わせる
  var snow = snowing(w);
  if (rainNow !== null && rainNow >= 2) {
    var drizzling = w.code >= 51 && w.code <= 55;
    var nearlyStopped = rainNowActual !== null && rainNowActual <= 0.3;
    if (drizzling || nearlyStopped) {
      if (snow) return ja ? '雪が弱まってきた' : 'the snow is easing off';
      return ja ? '雨脚が弱まってきた' : 'the rain is easing off';
    }
  }
  if (rainNow !== null && rainBefore !== null) {
    var rainingNow = rainNowActual === null ? (rainNow > 0.05) : (rainNowActual > 0.05);
    if (rainBefore > 0.1 && !rainingNow) {
      if (snow) return ja ? '先ほどまで降っていた雪が止んだところ' : 'the snow has just stopped';
      return ja ? '先ほどまで降っていた雨が上がったところ' : 'the rain has just stopped';
    }
    if (rainBefore <= 0.05 && rainingNow) return ja ? '降り出したばかり' : (snow ? 'snow has just begun' : 'rain has just begun');
    if (rainBefore > 0.1 && rainingNow && rainNow > rainBefore * 2) {
      if (snow) return ja ? '雪が強くなってきた' : 'the snow is getting heavier';
      return ja ? '雨脚が強まってきた' : 'the rain is getting heavier';
    }
    if (rainBefore > 0.1 && rainingNow && rainNow * 2 < rainBefore) {
      if (snow) return ja ? '雪が弱まってきた' : 'the snow is easing off';
      return ja ? '雨脚が弱まってきた' : 'the rain is easing off';
    }
  }
  if (cloudNow !== null && cloudBefore !== null) {
    if (cloudBefore >= 80 && cloudNow <= 40) return ja ? '雲が切れて空が明るくなってきた' : 'the clouds have broken and the sky is brightening';
    if (cloudBefore <= 40 && cloudNow >= 80) return ja ? '雲が広がってきた' : 'clouds have been gathering';
  }
  if (windNow !== null && windBefore !== null) {
    if (windNow - windBefore >= 4) return ja ? '風が出てきた' : 'the wind has picked up';
    if (windBefore - windNow >= 4) return ja ? '風がおさまってきた' : 'the wind has died down';
  }
  if (tempNow !== null && tempBefore !== null) {
    if (tempNow - tempBefore >= 3) return ja ? '気温が上がってきた' : 'it has been warming up';
    if (tempBefore - tempNow >= 3) return ja ? '冷え込んできた' : 'it has been growing colder';
  }
  return null;
}

// 雷の有無を明文化する。鳴っていれば必ず伝え、鳴っていなくても
// 荒天（強い雨・強風）のときは「鳴っていない」と明示する。
// 穏やかな日は触れない（言及そのものが連想の種になるため）
function thunder(w, lang) {
  if (!w || w.code === null || w.code === undefined) return null;
  var ja = lang === 'ja';
  if (w.code === 95 || w.code === 96 || w.code === 99) {
    return ja ? '雷が鳴っている' : 'thunder is sounding';
  }
  var stormy = (w.rain !== null && w.rain !== undefined && w.rain >= 1.0) ||
               (w.wind !== null && w.wind !== undefined && w.wind >= 8.0) ||
               w.code === 65 || w.code === 82 || w.code === 86;   // 大雨・激しいにわか雨・強いにわか雪
  if (!stormy) return null;
  return ja ? '雷は鳴っていない' : 'there is no thunder';
}

module.exports = { fetch: fetch, describe: describe, feel: feel, change: change, thunder: thunder };
