// 現在地の地名を市区レベルで取得する。BigDataCloud の reverse-geocode-client
// （APIキー不要）を使い、結果は localStorage に貯めて使い回す。
// 緯度経度そのものは LLM に送らず、地名だけを渡す。

var API = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
var CACHE_KEY = 'place-cache';

function cacheKey(loc) {
  // 小数第2位（約1km）で丸めた位置を鍵にする
  return loc.lat.toFixed(2) + ',' + loc.lon.toFixed(2);
}

function load() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; }
}

function save(c) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) {}
}

function compose(d, lang) {
  var region = d.principalSubdivision || '';
  var city = d.locality || d.city || '';
  if (!region && !city) return null;
  if (lang === 'ja') {
    // 「東京都千代田区」「神奈川県鎌倉市」。市区が県名と同じなら県名だけ
    if (!city || city === region) return region;
    return region + city;
  }
  if (!city) return region;
  return region && region !== city ? city + ', ' + region : city;
}

// loc: {lat, lon} / cb(placeName|null)
function fetch(loc, lang, cb) {
  if (!loc) { cb(null); return; }

  var cache = load();
  var key = cacheKey(loc) + '|' + lang;
  if (cache[key]) { cb(cache[key]); return; }

  var done = false;
  function finish(name) {
    if (done) return;
    done = true;
    if (name) {
      cache[key] = name;
      save(cache);
    }
    cb(name);
  }
  setTimeout(function() { finish(null); }, 15000);

  var xhr = new XMLHttpRequest();
  xhr.open('GET', API + '?latitude=' + loc.lat.toFixed(3) +
                  '&longitude=' + loc.lon.toFixed(3) +
                  '&localityLanguage=' + (lang === 'ja' ? 'ja' : 'en'), true);
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    if (xhr.status !== 200) { finish(null); return; }
    try {
      finish(compose(JSON.parse(xhr.responseText), lang));
    } catch (e) {
      finish(null);
    }
  };
  xhr.onerror = function() { finish(null); };
  xhr.send();
}

module.exports = { fetch: fetch, compose: compose };
