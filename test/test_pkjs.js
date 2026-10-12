// Pebble の環境をモックして PebbleKit JS (build/pebble-js-app.js) を検証する。
//   node test/test_pkjs.js     ※先に pebble build が必要
var assert = require('assert');

var handlers = {};
var sent = [];
var opened = [];
var store = {};
var xhrs = [];

global.localStorage = {
  getItem: function(k) { return store.hasOwnProperty(k) ? store[k] : null; },
  setItem: function(k, v) { store[k] = String(v); },
  removeItem: function(k) { delete store[k]; }
};

global.Pebble = {
  platform: 'pypkjs',
  addEventListener: function(name, fn) { handlers[name] = fn; },
  sendAppMessage: function(msg, ok) { sent.push(msg); if (ok) ok(); },
  openURL: function(u) { opened.push(u); },
  getActiveWatchInfo: function() { return { platform: 'basalt' }; },
  getAccountToken: function() { return ''; },
  getWatchToken: function() { return ''; }
};

// ─── XHR モック ───────────────────────────────────────────────────────────
// 天気（Open-Meteo）は自動で応答し、LLM へのリクエストはテストから応答させる
var weatherFail = false;
var weatherCalls = 0;
var weatherCloud = 75;
var weatherCode = 2;
var weatherRain = 0.4;
var placeCalls = 0;
var icsCalls = 0;
var icsText = null;       // カレンダー（ICS）の応答本文。null なら 404 を返す

function XHR() { this.headers = {}; xhrs.push(this); }
XHR.prototype.open = function(m, u) { this.method = m; this.url = u; };
XHR.prototype.setRequestHeader = function(k, v) { this.headers[k] = v; };
XHR.prototype.send = function(body) {
  this.body = body ? JSON.parse(body) : null;
  var self = this;
  if (this.url.indexOf('open-meteo') >= 0) {
    weatherCalls++;
    setTimeout(function() {
      if (weatherFail) {
        self.respond(500, { error: true });
      } else {
        self.respond(200, {
          current: { temperature_2m: 21.5, apparent_temperature: 24.0,
                     relative_humidity_2m: 88, wind_speed_10m: 6.2,
                     precipitation: weatherRain, cloud_cover: weatherCloud, weather_code: weatherCode },
          daily: { weather_code: [65], temperature_2m_max: [23.8],
                   temperature_2m_min: [20.0], precipitation_probability_max: [96],
                   precipitation_sum: [12.4] },
          // 3時間前は本降り、今は小雨（現在値 precipitation 0.4 と矛盾しない）
          hourly: { time: ['t-3', 't-2', 't-1', 't0'],
                    weather_code: [61, 61, 61, 61], precipitation: [1.8, 1.2, 0.6, 0.4],
                    temperature_2m: [22.0, 21.8, 21.5, 21.4], wind_speed_10m: [6.0, 6.1, 6.2, 6.2],
                    cloud_cover: [95, 92, weatherCloud, weatherCloud] }
        });
      }
    }, 0);
  } else if (this.url.indexOf('.ics') >= 0) {
    icsCalls++;
    setTimeout(function() {
      if (icsText === null) self.respondText(404, '');
      else self.respondText(200, icsText);
    }, 0);
  } else if (this.url.indexOf('bigdatacloud') >= 0) {
    placeCalls++;
    setTimeout(function() {
      self.respond(200, { principalSubdivision: '東京都', locality: '千代田区', city: '東京都' });
    }, 0);
  }
};
XHR.prototype.respondText = function(status, text) {
  this.status = status; this.readyState = 4; this.responseText = text;
  this.onreadystatechange();
};
XHR.prototype.respond = function(status, obj) {
  this.status = status; this.readyState = 4; this.responseText = JSON.stringify(obj);
  this.onreadystatechange();
};
global.XMLHttpRequest = XHR;

// 位置情報のモック（東京）
var geoFail = false;
var geoCalls = 0;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  geolocation: { getCurrentPosition: function(ok, err) {
    geoCalls++;
    if (geoFail) err({ message: 'denied' });
    else ok({ coords: { latitude: 35.68, longitude: 139.77 } });
  } }
} });

require(require('path').join(__dirname, '..', 'build', 'pebble-js-app.js'));

// ─── ヘルパー ─────────────────────────────────────────────────────────────
function llm() {
  return xhrs.filter(function(x) {
    return x.url.indexOf('open-meteo') < 0 && x.url.indexOf('bigdatacloud') < 0 &&
           x.url.indexOf('.ics') < 0;
  });
}
function last() { return sent[sent.length - 1]; }
function reset() { sent = []; xhrs = []; }
function wait(ms) { return new Promise(function(r) { setTimeout(r, ms || 20); }); }
function ok(msg) { console.log('ok: ' + msg); }

function today() {
  var d = new Date();
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// 時刻を固定して朝・昼・夜を試すための Date 差し替え
var RealDate = Date;
function setNow(h, m, y, mo, d) {
  var base = new RealDate();
  var fixed = new RealDate(y || base.getFullYear(), mo === undefined ? base.getMonth() : mo,
                           d || base.getDate(), h, m, 0).getTime();
  global.Date = class extends RealDate {
    constructor() {
      if (arguments.length === 0) super(fixed);
      else super(...arguments);
    }
    static now() { return fixed; }
  };
}
function restoreNow() { global.Date = RealDate; }

var CLAUDE_OK = { stop_reason: 'end_turn', content: [{ type: 'text', text: '古池や\n蛙飛び込む\n水の音。' }] };

async function main() {
  // 1. APIキー未設定 → 腕時計にエラーを表示。位置情報が届くとテーマだけ送り直す
  handlers.ready();
  await wait();
  assert.strictEqual(sent.length, 2, 'error message + theme update');
  assert.strictEqual(sent[0].STATUS, 1);
  assert.strictEqual(sent[0].HAIKU_L1, 'APIキーが未設定です');
  assert.strictEqual(sent[0].LANG, 0);
  assert.strictEqual(sent[0].DAY_THEME, 0, 'default zabuton');
  assert.strictEqual(sent[0].NIGHT_THEME, 0, 'default black night');
  assert.strictEqual(sent[0].TIME_FONT, 0, 'default brush kaisho');
  assert.strictEqual(sent[0].NIGHT_START, 19);
  assert.strictEqual(sent[0].NIGHT_END, 6);
  assert.strictEqual(sent[0].NIGHT_MODE, 0, 'no location yet -> fixed hours');
  var theme = sent[1];
  assert.strictEqual(theme.HAIKU_L1, undefined, 'theme-only message carries no haiku');
  assert.strictEqual(theme.NIGHT_MODE, 1, 'sunrise/sunset mode once location known');
  assert.ok(theme.SUN_RISE > 0 && theme.SUN_RISE < 1440);
  assert.ok(theme.SUN_SET > theme.SUN_RISE);
  ok('no-key error + sun times ' + theme.SUN_RISE + '/' + theme.SUN_SET);

  // 2. 位置が変わっていなければテーマの再送はしない
  reset();
  handlers.ready();
  await wait();
  assert.strictEqual(sent.length, 1);
  ok('cached location, no duplicate theme send');

  // 3. 固定時刻を選べば位置があっても固定時刻
  store['clay-settings'] = JSON.stringify({ CFG_NIGHT_MODE: 'fixed' });
  reset();
  handlers.ready();
  await wait();
  assert.strictEqual(sent[0].NIGHT_MODE, 0);
  ok('fixed mode respected');

  // 4. 位置情報の取得に失敗しても、前回の位置で動く
  geoFail = true;
  store['clay-settings'] = JSON.stringify({});
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(sent[0].NIGHT_MODE, 1, 'last known location still used');
  geoFail = false;
  ok('geolocation failure fallback');

  // 5. Claude: 天気を取ってからプロンプトに埋め込む
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'sk-ant-test', CFG_LANG: 'ja' });
  reset();
  var wBefore = weatherCalls;
  handlers.ready();
  await wait();
  assert.strictEqual(weatherCalls, wBefore + 1, 'weather fetched');
  assert.strictEqual(llm().length, 1, 'one LLM request');
  var x = llm()[0];
  assert.strictEqual(x.url, 'https://api.anthropic.com/v1/messages');
  assert.strictEqual(x.headers['x-api-key'], 'sk-ant-test');
  assert.strictEqual(x.headers['anthropic-version'], '2023-06-01');
  assert.strictEqual(x.body.model, 'claude-sonnet-5', 'default is the mid-tier Sonnet 5');
  assert.strictEqual(x.headers['anthropic-beta'], undefined, 'no fallback header for Sonnet');
  assert.strictEqual(x.body.fallbacks, undefined);
  var prompt = x.body.messages[0].content;
  assert.ok(/\d+年\d+月\d+日/.test(prompt), 'date: ' + prompt);
  assert.ok(prompt.indexOf('薄曇り') >= 0, 'current weather in prompt: ' + prompt);
  assert.ok(prompt.indexOf('汗ばむ暑さ') >= 0 || prompt.indexOf('ぬるい暖かさ') >= 0, 'felt condition: ' + prompt);
  assert.ok(prompt.indexOf('空気は湿って重い') >= 0, 'humidity felt');
  assert.ok(prompt.indexOf('雨脚が弱まってきた') >= 0, 'weather change sentence: ' + prompt);
  assert.ok(prompt.indexOf('雨が上がった') < 0, 'no change that contradicts the current reading');
  assert.ok(prompt.indexOf('気象の季語は状況の範囲内から') >= 0, 'kigo must come from stated facts');
  // 既定プロンプトは実測値を送らず、体感の言葉だけで伝える
  assert.ok(prompt.indexOf('℃') < 0 && prompt.indexOf('湿度') < 0 && prompt.indexOf('降水量') < 0,
            'raw readings not in the default prompt: ' + prompt);
  assert.ok(prompt.indexOf('今日の降水量') < 0, 'daily total not in the default prompt');
  assert.ok(prompt.indexOf('降水確率') < 0, 'chance of rain is not in the default prompt');
  assert.ok(/【切れ】.+\n/.test(prompt) && prompt.indexOf('{kire}') < 0, 'one cutting form is named: ' + prompt);
  assert.ok(prompt.indexOf('場所は地形・構造・物で示し') >= 0, 'place-name rule');
  assert.ok(prompt.indexOf('【技法】') >= 0 && prompt.indexOf('【切れ】') >= 0 && prompt.indexOf('【季語】') >= 0, 'cut, kigo and technique sections');
  assert.ok(prompt.indexOf('誰がしたのかは名指さず') >= 0 && prompt.indexOf('なぜそうなったかは言わない') >= 0, 'omission is always asked for');
  assert.ok(prompt.indexOf('常用漢字のみ') >= 0, 'joyo kanji only');
  // 句の履歴が無いときは、【避ける】の節ごと残さない
  assert.ok(prompt.indexOf('【避ける】') < 0 && /^ウォッチフェイス用に.+\n\n【状況】\n/.test(prompt) && !/】\n\n/.test(prompt),
            'empty section heading dropped: ' + prompt.slice(0, 600));
  assert.ok(/【技法】.+――.+。技法名の語は句に出さない。/.test(prompt) && prompt.indexOf('{technique}') < 0, 'one technique is named: ' + prompt.slice(-400));
  assert.ok(prompt.indexOf('句だけを出力する') >= 0, 'exactly one haiku requested');
  // 穏やかな天気では雷に触れない（言及そのものが連想の種になる）
  assert.ok(prompt.indexOf('雷') < 0, 'no thunder mention in calm weather: ' + prompt);
  assert.ok(prompt.indexOf('【作句】') >= 0 && prompt.indexOf('【季語】') >= 0 && prompt.indexOf('【形式】') >= 0,
            'composition, kigo and form sections');
  assert.ok(prompt.indexOf('拍で数える') >= 0 && prompt.indexOf('【切れ】') >= 0, 'meter and cutting-word rules');
  assert.ok(prompt.indexOf('動詞は一つまで') >= 0, 'one verb rule');
  assert.ok(prompt.indexOf('東京都千代田区') >= 0, 'place name');
  assert.ok(/[春夏秋冬]/.test(prompt), 'season in prompt');
  assert.ok(/平日|休日/.test(prompt), 'weekday/weekend in prompt');
  assert.ok(/日の出|日の入り/.test(prompt), 'relation to sunrise/sunset');
  assert.ok(/\d+時\d+分/.test(prompt), 'clock time in prompt');
  assert.ok(prompt.indexOf('緯度') < 0 && prompt.indexOf('35.6') < 0, 'coordinates are not sent');
  assert.ok(prompt.indexOf('{') < 0, 'no leftover placeholder');
  assert.ok(prompt.indexOf('の季語を一つだけ') >= 0, 'season word required in the default prompt');
  assert.strictEqual(placeCalls > 0, true, 'place looked up');
  x.respond(200, CLAUDE_OK);
  assert.deepStrictEqual([last().HAIKU_L1, last().HAIKU_L2, last().HAIKU_L3], ['古池や', '蛙飛び込む', '水の音']);
  assert.strictEqual(last().STATUS, 0);
  ok('claude request with weather-aware prompt');

  // 6. 同じ日はキャッシュから返す（天気もLLMも呼ばない）
  reset();
  wBefore = weatherCalls;
  handlers.ready();
  await wait();
  assert.strictEqual(xhrs.length, 0, 'no network on cache hit');
  assert.strictEqual(weatherCalls, wBefore);
  assert.strictEqual(sent[0].HAIKU_L2, '蛙飛び込む');
  ok('cache hit');

  // 7. 腕時計からの要求で位置を取り直す
  reset();
  var gBefore = geoCalls;
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(geoCalls, gBefore + 1, 'location refreshed on request');
  assert.strictEqual(sent.length, 1);
  ok('REQUEST_HAIKU');

  // 8. 設定画面のURL生成
  handlers.showConfiguration();
  assert.strictEqual(opened.length, 1);
  var page = decodeURIComponent(opened[0].split('#').pop());
  assert.ok(page.indexOf('CFG_CLAUDE_KEY') >= 0);
  assert.ok(page.indexOf('sk-ant-test') >= 0, 'existing settings are pre-filled');
  assert.ok(page.indexOf('CFG_WEATHER') >= 0, 'weather toggle on the config page');
  assert.ok(page.indexOf('<textarea') >= 0, 'multi-line prompt fields');
  assert.ok(page.indexOf('reset-prompt-ja') >= 0 && page.indexOf('reset-prompt-en') >= 0, 'reset buttons');
  assert.ok(page.indexOf('keepFilled') >= 0, 'page-side default filling injected');
  assert.ok(page.indexOf('{moon}（月齢{moonage}）') >= 0, 'default prompt passed to the page');
  assert.ok(page.indexOf('current-haiku') >= 0, 'current haiku placeholder');
  assert.ok(page.indexOf('蛙飛び込む') >= 0, 'current haiku lines passed to the page');
  assert.ok(page.indexOf('showCurrentHaiku') >= 0, 'page-side renderer injected');
  assert.ok(page.indexOf('explain-haiku') >= 0 && page.indexOf('explainHaiku') >= 0, 'explain button and handler');
  var meta = JSON.parse(store['haiku-cache']);
  assert.strictEqual(meta.model, 'claude-sonnet-5', 'model recorded with the haiku');
  assert.ok(meta.at && meta.prompt, 'time and prompt recorded');
  ok('config page url (' + opened[0].length + ' chars)');

  // 8b. 空欄で保存されたプロンプトは既定文に置き換えて保存する
  handlers.webviewclosed({ response: encodeURIComponent(JSON.stringify({
    CFG_PROVIDER: { value: 'claude' }, CFG_CLAUDE_KEY: { value: 'sk-ant-test' }, CFG_LANG: { value: 'ja' },
    CFG_PROMPT_JA: { value: '   ' }, CFG_PROMPT_EN: { value: '' }
  })) });
  await wait();
  var savedCfg = JSON.parse(store['clay-settings']);
  assert.ok(savedCfg.CFG_PROMPT_JA.indexOf('{moon}（月齢{moonage}）') >= 0, 'empty JA prompt replaced by default');
  assert.ok(savedCfg.CFG_PROMPT_EN.indexOf('(age {moonage} days)') >= 0, 'empty EN prompt replaced by default');
  ok('empty prompt -> default stored');

  // 9. 設定を保存 → OpenAI・英語・再生成
  reset();
  handlers.webviewclosed({ response: encodeURIComponent(JSON.stringify({
    CFG_PROVIDER: { value: 'openai' },
    CFG_OPENAI_KEY: { value: 'sk-openai-test' },
    CFG_OPENAI_MODEL: { value: '' },
    CFG_LANG: { value: 'en' },
    CFG_REGEN: { value: true },
    CFG_WEATHER: { value: true },
    CFG_CLAUDE_KEY: { value: 'sk-ant-test' },
    CFG_DAY_THEME: { value: 'sakura' },
    CFG_NIGHT_THEME: { value: 'hoshizukiyo' },
    CFG_TIME_FONT: { value: 'digital' },
    CFG_NIGHT_START: { value: '21' },
    CFG_NIGHT_END: { value: '5' }
  })) });
  await wait();
  assert.strictEqual(llm().length, 1, 'regen forces a new request');
  x = llm()[0];
  assert.strictEqual(x.url, 'https://api.openai.com/v1/chat/completions');
  assert.strictEqual(x.headers['Authorization'], 'Bearer sk-openai-test');
  assert.strictEqual(x.body.model, 'gpt-5-mini');
  assert.strictEqual(x.body.reasoning_effort, 'low', 'openai reasoning effort');
  prompt = x.body.messages[1].content;
  assert.ok(/(January|February|March|April|May|June|July|August|September|October|November|December) \d+, \d{4}/.test(prompt), prompt);
  assert.ok(prompt.indexOf('partly cloudy') >= 0, 'english weather: ' + prompt);
  assert.ok(/heat|warmth|coolness|chill|cold/.test(prompt), 'english felt condition');
  assert.ok(prompt.indexOf('COMPOSITION') >= 0 && prompt.indexOf('SEASON WORD') >= 0 && prompt.indexOf('FORM') >= 0, 'english sections');
  assert.ok(/TECHNIQUE: .+: .+\. Never let/.test(prompt) && prompt.indexOf('{technique}') < 0, 'english technique named');
  assert.ok(prompt.indexOf('Never name who is there') >= 0, 'english omission always asked for');
  assert.ok(prompt.indexOf('exactly one haiku') >= 0, 'english asks for one haiku');
  assert.ok(prompt.indexOf('the rain is easing off') >= 0, 'english weather change');
  assert.ok(prompt.indexOf('mm of rain') < 0 && prompt.indexOf(' C,') < 0, 'english default sends no raw readings');
  assert.ok(/CUT: .+\./.test(prompt) && prompt.indexOf('{kire}') < 0, 'english cut named');
  assert.ok(prompt.indexOf('must name something stated above') >= 0, 'english kigo rule');
  assert.ok(/autumn|spring|summer|winter/.test(prompt), 'english season');
  assert.ok(/weekday|weekend/.test(prompt), 'english day type');
  assert.ok(/sunrise|sunset/.test(prompt), 'english sun relation');
  assert.ok(/season word \(kigo\)/.test(prompt), 'english prompt requires a season word');
  assert.ok(prompt.indexOf('参考季語') < 0, 'the Japanese kigo list is not sent in English');
  x.respond(200, { choices: [{ message: { content: '**Autumn wind**\nLeaves drift over stone\nThe pond holds the sky' } }] });
  assert.strictEqual(last().LANG, 1);
  assert.strictEqual(last().DAY_THEME, 2, 'sakura');
  assert.strictEqual(last().NIGHT_THEME, 1, 'starry night');
  assert.strictEqual(last().TIME_FONT, 3, 'digital');
  assert.strictEqual(last().NIGHT_START, 21);
  assert.strictEqual(last().NIGHT_END, 5);
  assert.deepStrictEqual([last().HAIKU_L1, last().HAIKU_L2, last().HAIKU_L3],
    ['Autumn wind', 'Leaves drift over stone', 'The pond holds the sky']);
  assert.strictEqual(JSON.parse(store['clay-settings']).CFG_REGEN, false, 'regen toggle reset');
  ok('webviewclosed -> openai regen with weather');

  // 10. 天気が取れないときは、天気の語を含む文を落として俳句を作る
  weatherFail = true;
  store['haiku-cache'] = JSON.stringify({ date: '2000-01-01', lang: 'en', lines: ['x'] });
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(llm().length, 1, 'haiku still requested without weather');
  prompt = llm()[0].body.messages[1].content;
  assert.ok(prompt.indexOf('{') < 0, 'no leftover placeholder: ' + prompt);
  assert.ok(prompt.indexOf('body feels') < 0 && prompt.indexOf('Apparent temperature') < 0, 'weather sentences dropped: ' + prompt);
  assert.ok(prompt.indexOf('haiku') >= 0, 'instructions kept');
  assert.ok(/(January|February|March|April|May|June|July|August|September|October|November|December) \d+/.test(prompt), 'date kept');
  llm()[0].respond(200, { choices: [{ message: { content: 'Rain on the roof\nA sparrow waits it out\nThe eaves keep dripping' } }] });
  assert.strictEqual(last().STATUS, 0, 'haiku delivered without weather');
  weatherFail = false;
  ok('weather failure -> weather sentences dropped');

  // 11. 天気オフなら天気は取りに行かない
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja', CFG_WEATHER: false });
  store['haiku-cache'] = JSON.stringify({ date: '2000-01-01', lang: 'ja', lines: ['x'] });
  reset();
  wBefore = weatherCalls;
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(weatherCalls, wBefore, 'no weather request');
  assert.strictEqual(llm().length, 1);
  prompt = llm()[0].body.messages[0].content;
  assert.ok(prompt.indexOf('肌に感じる') < 0 && prompt.indexOf('空は') < 0, 'weather sentences dropped: ' + prompt);
  assert.ok(prompt.indexOf('降水量') < 0 && prompt.indexOf('体感温度') < 0, 'measurement line dropped too');
  assert.ok(prompt.indexOf('雨脚') < 0, 'weather change dropped too');
  assert.ok(/[春夏秋冬]/.test(prompt), 'season still present');
  assert.ok(prompt.indexOf('{') < 0, 'no leftover placeholder');
  llm()[0].respond(200, CLAUDE_OK);
  assert.strictEqual(last().STATUS, 0);
  ok('weather disabled');

  // 12. 時間帯が変われば作り直す（キャッシュの時間帯を書き換えて確認）
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });
  var cached = JSON.parse(store['haiku-cache']);
  cached.date = today();
  cached.lang = 'ja';
  cached.lines = ['朝の句', 'その二', 'その三'];
  cached.key = today() + '#morning';
  store['haiku-cache'] = JSON.stringify(cached);
  reset();
  handlers.ready();
  await wait();
  var regenerated = llm().length === 1;
  if (regenerated) {
    // 今が朝以外 → 新しい句を詠み直す
    llm()[0].respond(200, CLAUDE_OK);
    assert.strictEqual(last().HAIKU_L1, '古池や');
    assert.notStrictEqual(JSON.parse(store['haiku-cache']).key, today() + '#morning');
  } else {
    // 今が朝 → 手元の句をそのまま返す
    assert.strictEqual(last().HAIKU_L1, '朝の句');
  }
  ok('period change -> ' + (regenerated ? 'regenerated' : 'cache kept (currently morning)'));

  // 13. 朝・昼・夜で別の句を詠ませる（時刻を固定して確認）
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });
  var expected = { 8: '朝', 12: '昼', 23: '夜更け' };
  var seenPeriods = {};
  for (var hour of [8, 12, 23]) {
    setNow(hour, 0);
    delete store['haiku-cache'];
    reset();
    handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
    await wait();
    assert.strictEqual(llm().length, 1, 'haiku requested at ' + hour + ':00');
    var pr = llm()[0].body.messages[0].content;
    assert.ok(pr.indexOf(expected[hour]) >= 0, hour + ':00 -> ' + expected[hour] + ': ' + pr.slice(0, 60));
    assert.ok(pr.indexOf(hour + '時00分') >= 0, 'clock time: ' + pr.slice(0, 40));
    llm()[0].respond(200, CLAUDE_OK);
    seenPeriods[hour] = JSON.parse(store['haiku-cache']).key.split('#')[1];
  }
  restoreNow();
  assert.strictEqual(seenPeriods[8], 'morning');
  assert.strictEqual(seenPeriods[12], 'noon');
  assert.strictEqual(seenPeriods[23], 'deepnight');
  ok('time-of-day phases produce different prompts');

  // 13b. 決まった時刻モード: 更新時刻をまたいだときだけ詠み直す
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja',
    CFG_SCHEDULE: 'fixed', CFG_TIME_MORNING: '06:30', CFG_TIME_NOON: '', CFG_TIME_EVENING: '18:30' });
  // 07:00 → 朝の枠。腕時計には時刻表（分）と枠数が渡る
  setNow(7, 0);
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(llm().length, 1, 'first request of the morning slot');
  llm()[0].respond(200, CLAUDE_OK);
  assert.strictEqual(last().SCHED_MODE, 1);
  assert.deepStrictEqual([last().SCHED_T1, last().SCHED_T2, last().SCHED_T3], [390, 1110, -1], 'empty noon skipped, times sorted');
  var keyMorning = JSON.parse(store['haiku-cache']).key;
  assert.ok(keyMorning.indexOf('#0') > 0, 'morning slot key: ' + keyMorning);
  // 12:00 → 昼は空欄なので、まだ朝の枠のまま（詠み直さない）
  setNow(12, 0);
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(llm().length, 0, 'no regeneration at noon when the noon slot is empty');
  assert.strictEqual(last().HAIKU_L1, '古池や');
  // 18:30 → 晩の枠に入ったので詠み直す
  setNow(18, 30);
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(llm().length, 1, 'regenerated at the evening time');
  llm()[0].respond(200, CLAUDE_OK);
  assert.ok(JSON.parse(store['haiku-cache']).key.indexOf('#1') > 0, 'evening slot key');
  // 翌日 05:00 → まだ前日の晩の枠（詠み直さない）
  var tomorrow = new RealDate(RealDate.now() + 86400000);
  setNow(5, 0, tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(llm().length, 0, 'before the first time next day -> still last evening slot');
  // 翌日 06:31 → 朝の枠で詠み直す
  setNow(6, 31, tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(llm().length, 1, 'regenerated next morning');
  llm()[0].respond(200, CLAUDE_OK);
  // 全部空欄なら朝6時の1回
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja',
    CFG_SCHEDULE: 'fixed', CFG_TIME_MORNING: '', CFG_TIME_NOON: '', CFG_TIME_EVENING: '' });
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  if (llm().length) llm()[0].respond(200, CLAUDE_OK);
  assert.deepStrictEqual([last().SCHED_T1, last().SCHED_T2, last().SCHED_T3], [360, -1, -1], 'all empty -> once at 06:00');
  restoreNow();
  // 自動モードでは時刻表を送らない
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  if (llm().length) llm()[0].respond(200, CLAUDE_OK);
  assert.strictEqual(last().SCHED_MODE, 0);
  assert.strictEqual(last().SCHED_T1, -1);
  ok('fixed schedule: slots, empty fields, day boundary');

  // 13b2. 5xx は 20 秒後に一度だけやり直す（タイマーを進めて確認）
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });
  delete store['haiku-cache'];
  reset();
  var realSetTimeout = global.setTimeout;
  var pendingRetry = null;
  global.setTimeout = function(fn, ms) {
    if (ms === 20000) { pendingRetry = fn; return 0; }
    return realSetTimeout(fn, ms);
  };
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  llm()[0].respond(503, { error: { message: 'The service is currently unavailable.' } });
  assert.strictEqual(sent.length, 0, 'no error shown yet, retry scheduled');
  assert.ok(pendingRetry, 'retry timer set');
  pendingRetry(); pendingRetry = null;
  await wait();
  assert.strictEqual(llm().length, 2, 'second attempt made');
  llm()[1].respond(200, CLAUDE_OK);
  assert.strictEqual(last().STATUS, 0, 'retry succeeded');
  // 2 回目も失敗ならエラーを出す
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  llm()[0].respond(503, { error: { message: 'unavailable' } });
  pendingRetry(); pendingRetry = null;
  await wait();
  llm()[1].respond(503, { error: { message: 'unavailable' } });
  assert.strictEqual(last().STATUS, 1, 'error after second failure');
  assert.ok(last().HAIKU_L1.indexOf('503') >= 0);
  global.setTimeout = realSetTimeout;
  ok('transient 5xx retried once');

  // 13b3. 思考の深さ: 各 LLM のパラメータに反映。受け付けないモデルには付けずに呼び直す
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja', CFG_EFFORT: 'high' });
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.deepStrictEqual(llm()[0].body.output_config, { effort: 'high' }, 'claude effort high');
  assert.deepStrictEqual(llm()[0].body.thinking, { type: 'adaptive' }, 'claude thinking on');
  assert.strictEqual(llm()[0].body.max_tokens, 16000, 'room for thinking');
  llm()[0].respond(200, CLAUDE_OK);
  // 適応思考を受け付けないモデルには付けずに呼び直す
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_CLAUDE_MODEL: 'claude-haiku-4-5', CFG_LANG: 'ja', CFG_EFFORT: 'high' });
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  llm()[0].respond(400, { error: { message: 'adaptive thinking is not supported on this model' } });
  await wait();
  assert.strictEqual(llm().length, 2, 'claude retried without thinking');
  assert.strictEqual(llm()[1].body.thinking, undefined);
  assert.strictEqual(llm()[1].body.output_config, undefined);
  llm()[1].respond(200, CLAUDE_OK);
  assert.strictEqual(last().STATUS, 0);
  // 最大: Claude はそのまま、Gemini は「高」で呼ぶ
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja', CFG_EFFORT: 'max' });
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.deepStrictEqual(llm()[0].body.output_config, { effort: 'max' }, 'claude effort max');
  assert.strictEqual(llm()[0].body.max_tokens, 32000);
  llm()[0].respond(200, CLAUDE_OK);
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'gemini', CFG_GEMINI_KEY: 'k', CFG_LANG: 'ja', CFG_EFFORT: 'max' });
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(llm()[0].body.generationConfig.thinkingConfig.thinkingLevel, 'high', 'gemini max -> high');
  llm()[0].respond(200, { candidates: [{ content: { parts: [{ text: '朝の雨\n傘の花咲く\n交差点' }] } }] });
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'gemini', CFG_GEMINI_KEY: 'k', CFG_LANG: 'ja', CFG_EFFORT: 'medium' });
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(llm()[0].body.generationConfig.thinkingConfig.thinkingLevel, 'medium', 'gemini medium');
  llm()[0].respond(200, { candidates: [{ content: { parts: [{ text: '朝の雨\n傘の花咲く\n交差点' }] } }] });
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'openai', CFG_OPENAI_KEY: 'k', CFG_OPENAI_MODEL: 'gpt-4.1', CFG_LANG: 'en', CFG_EFFORT: 'medium' });
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(llm()[0].body.reasoning_effort, 'medium', 'openai medium');
  llm()[0].respond(400, { error: { message: "Unsupported parameter: 'reasoning_effort' is not supported with this model." } });
  await wait();
  assert.strictEqual(llm().length, 2, 'retried without reasoning_effort');
  assert.strictEqual(llm()[1].body.reasoning_effort, undefined);
  llm()[1].respond(200, { choices: [{ message: { content: 'Rain at the crossing\nUmbrellas bloom\nMorning light' } }] });
  assert.strictEqual(last().STATUS, 0);
  // Opus 5 を選んだときだけ、拒否時のフォールバック指定を付ける
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_CLAUDE_MODEL: 'claude-opus-5', CFG_LANG: 'ja' });
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(llm()[0].body.model, 'claude-opus-5');
  assert.strictEqual(llm()[0].headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.strictEqual(llm()[0].body.fallbacks, 'default');
  llm()[0].respond(200, CLAUDE_OK);
  // 不正な値は低に丸める
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja', CFG_EFFORT: 'extreme' });
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.deepStrictEqual(llm()[0].body.output_config, { effort: 'low' }, 'unknown value falls back to low');
  llm()[0].respond(200, CLAUDE_OK);
  ok('thinking effort setting across providers');

  // 13c. Gemini: リクエストの形と応答の取り出し
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'gemini', CFG_GEMINI_KEY: 'AQ.test-key', CFG_LANG: 'ja' });
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.strictEqual(llm().length, 1);
  x = llm()[0];
  assert.strictEqual(x.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent');
  assert.strictEqual(x.headers['x-goog-api-key'], 'AQ.test-key');
  assert.ok(x.url.indexOf('key=') < 0, 'key is not in the URL');
  assert.strictEqual(x.body.contents[0].role, 'user');
  assert.ok(x.body.contents[0].parts[0].text.indexOf('俳句') >= 0, 'prompt in the request');
  assert.ok(x.body.system_instruction.parts[0].text.indexOf('haiku') >= 0, 'system instruction');
  assert.strictEqual(x.body.generationConfig.thinkingConfig.thinkingLevel, 'low', 'low thinking level');
  x.respond(200, { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [
    { thought: true, text: 'considering the season...' },
    { text: '薄曇り\n路地にひとすじ\n処暑の暮れ' } ] } }] });
  assert.deepStrictEqual([last().HAIKU_L1, last().HAIKU_L2, last().HAIKU_L3], ['薄曇り', '路地にひとすじ', '処暑の暮れ']);
  assert.strictEqual(last().STATUS, 0);
  // 残高切れなどのエラーはそのまま腕時計に出す
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  llm()[0].respond(429, { error: { code: 429, message: 'Your prepayment credits are depleted. Please go to AI Studio', status: 'RESOURCE_EXHAUSTED' } });
  assert.strictEqual(last().STATUS, 1);
  assert.ok(last().HAIKU_L1.indexOf('Gemini API 429') >= 0, last().HAIKU_L1);
  // thinkingLevel を受け付けない古いモデルには、付けずに呼び直す
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  llm()[0].respond(400, { error: { code: 400, message: 'Invalid JSON payload received. Unknown name "thinkingLevel" at generation_config.thinking_config' } });
  await wait();
  assert.strictEqual(llm().length, 2, 'retried without thinkingConfig');
  assert.strictEqual(llm()[1].body.generationConfig.thinkingConfig, undefined);
  llm()[1].respond(200, { candidates: [{ content: { parts: [{ text: '秋の雨\n傘を忘れて\n宵の道' }] } }] });
  assert.strictEqual(last().HAIKU_L1, '秋の雨');
  // 安全性でブロックされた場合
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  llm()[0].respond(200, { promptFeedback: { blockReason: 'SAFETY' } });
  assert.strictEqual(last().STATUS, 1);
  assert.ok(last().HAIKU_L1.indexOf('blocked') >= 0);
  // モデル名の変更
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'gemini', CFG_GEMINI_KEY: 'k', CFG_GEMINI_MODEL: 'gemini-2.5-flash', CFG_LANG: 'en' });
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.ok(llm()[0].url.indexOf('/models/gemini-2.5-flash:generateContent') > 0, 'custom model');
  llm()[0].respond(200, { candidates: [{ content: { parts: [{ text: 'Autumn dusk\nWind through the alley\nA thin cloud' }] } }] });
  assert.strictEqual(last().LANG, 1);
  ok('gemini request, thought parts skipped, errors surfaced');

  // 13c2. 雷の有無を明文化する
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });
  weatherCode = 95;                       // 雷雨
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  prompt = llm()[0].body.messages[0].content;
  assert.ok(prompt.indexOf('雷が鳴っている') >= 0, 'thunder stated when it is thundering: ' + prompt);
  llm()[0].respond(200, CLAUDE_OK);
  weatherCode = 65;                       // 大雨。雷ではない
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  prompt = llm()[0].body.messages[0].content;
  assert.ok(prompt.indexOf('雷は鳴っていない') >= 0, 'absence stated in stormy weather: ' + prompt);
  llm()[0].respond(200, CLAUDE_OK);
  weatherCode = 2;
  ok('thunder stated when present, denied only in stormy weather');

  // 13c3. 季語の候補を、季節・時期・時間帯・天気で絞って渡す
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  prompt = llm()[0].body.messages[0].content;
  var m = /候補（他でも可[^\n]*?）：(.+)/.exec(prompt);
  assert.ok(m, 'kigo list in the prompt: ' + prompt.slice(0, 300));
  var listed = m[1].split('、');
  // 既定プロンプトが使うのは {kigo}。24語を並べ、本意の分かりにくい語には括弧で語釈を添える
  assert.ok(listed.length >= 20 && listed.length <= 24, 'about two dozen candidates: ' + listed.length);
  assert.ok(prompt.indexOf('中七のみ') >= 0 || listed.every(function(x) { return x.indexOf('拍') < 0; }),
            'long kigo are marked');
  assert.ok(listed.some(function(x) { return /（[^）\d][^）]{2,11}）$/.test(x); }),
            'the list carries the traditional sense of each word: ' + m[1]);
  assert.ok(prompt.indexOf('本意') >= 0 && prompt.indexOf('歳時記の本意どおりに使い') >= 0,
            'the prompt tells the model to keep each kigo in its traditional scene');
  assert.ok(prompt.indexOf('括弧内は本意・拍数の注記で句に入れない') >= 0,
            'glosses are marked as notes, not material for the haiku');
  assert.ok(/【切れ】.*(には切れ字を置かない|切れ字（や・かな・けり）を使わない)/.test(prompt), 'cutting words are not stacked');
  assert.ok(prompt.indexOf('季重なりに注意') >= 0, 'the prompt asks for a check against two season words');
  llm()[0].respond(200, CLAUDE_OK);
  // 呼ぶたびに候補が入れ替わる
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  var second = /候補（他でも可[^\n]*?）：(.+)/.exec(llm()[0].body.messages[0].content)[1];
  llm()[0].respond(200, CLAUDE_OK);
  assert.ok(second !== m[1] || listed.length < 4, 'candidates are shuffled between calls');
  // 雨が降っていなければ、雨の季語は候補に出ない
  weatherCode = 0; weatherRain = 0; weatherCloud = 5;
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  var clearList = /候補（他でも可[^\n]*?）：(.+)/.exec(llm()[0].body.messages[0].content)[1];
  assert.ok(clearList.indexOf('秋の雨') < 0 && clearList.indexOf('露けし') < 0,
            'no rain kigo under a clear sky: ' + clearList);
  llm()[0].respond(200, CLAUDE_OK);
  weatherCode = 2; weatherRain = 0.4; weatherCloud = 75;
  ok('kigo candidates filtered by season, time and weather');

  // 13c3b. 時刻を含む季語は、その時間帯にしか出さない
  var kigoTable = require('../src/pkjs/kigo');
  function candidates(timeOfDay, periods, seasonKey) {
    return kigoTable.pick(seasonKey, periods, timeOfDay, null, 400).map(function(r) { return r.w; });
  }
  var night = candidates('deepnight', ['仲秋', '三秋'], 'autumn');
  var noon  = candidates('noon',      ['仲秋', '三秋'], 'autumn');
  assert.ok(night.indexOf('初潮') >= 0, '初潮 is offered at night');
  assert.ok(noon.indexOf('初潮') < 0,   '初潮 is not offered at noon');
  assert.ok(noon.indexOf('霞') < 0 && night.indexOf('霞') < 0, 'a spring kigo never reaches autumn');
  var morning = candidates('morning', ['初秋', '三秋'], 'autumn');
  assert.ok(morning.indexOf('朝顔') >= 0 && candidates('deepnight', ['初秋', '三秋'], 'autumn').indexOf('朝顔') < 0,
            '朝顔 is offered in the morning only');
  // 夏の季語は夏に出る（季節コードが春と同じだと一語も出ない）
  var summer = candidates('noon', ['三夏', '晩夏'], 'summer');
  assert.ok(summer.length > 20, 'summer has candidates: ' + summer.length);
  // {kigo_plain} 側（語だけ24語）も引けること。既定プロンプトでは使っていない
  var plainList = kigoTable.listText('autumn', ['仲秋', '三秋'], 'deepnight', null, 24, true).split('、');
  assert.strictEqual(plainList.length, 24, 'the plain list holds 24 words: ' + plainList.length);
  assert.ok(plainList.every(function(x) { return x.indexOf('（') < 0 || /（([ぁ-ん]+)?(・)?(\d拍・中七のみ)?）$/.test(x); }),
            'the plain list carries no glosses: ' + plainList.join('、'));
  ok('kigo bound to a time of day are offered only then');

  // 13c3b2. 読みで拍数が変わる語は読みごとに行を持ち、候補には読みを添えて一つだけ載せる
  var momiji = table0().filter(function(r) { return r.w === '紅葉'; });
  assert.deepStrictEqual(momiji.map(function(r) { return r.yomi + r.m; }).sort(), ['こうよう4', 'もみじ3'], 'one row per reading');
  assert.strictEqual(table0().filter(function(r) { return r.w === '菖蒲'; })[0].yomi, 'しょうぶ', 'the kigo reading only');
  assert.strictEqual(table0().filter(function(r) { return r.w === '河豚'; })[0].yomi, '', 'same mora, no reading');
  for (var rt = 0; rt < 30; rt++) {
    var listed = kigoTable.listText('autumn', ['晩秋', '三秋'], 'day', null, 40, false).split('、');
    var heads = listed.map(function(x) { return x.replace(/（.*$/, ''); });
    assert.strictEqual(new Set(heads).size, heads.length, 'a word appears once: ' + listed.join('、'));
    listed.filter(function(x) { return /^紅葉（/.test(x); }).forEach(function(x) {
      assert.ok(/^紅葉（(もみじ|こうよう)[・）]/.test(x), 'the reading is shown: ' + x);
    });
  }
  ok('readings that change the mora are listed per reading');

  function table0() { return kigoTable.table(); }
  // 13c3c. 本意に反する天気のときは候補から外す（否定条件と、曇り・冷え・雨上がりの判定）
  function gatesFor(wx) { return kigoTable.allowedGates(wx); }
  function offered(season, periods, tod, wx) {
    return kigoTable.pick(season, periods, tod, wx, 400).map(function(r) { return r.w; });
  }
  var rainy  = { code: 61, rain: 0.4, cloud: 95, wind: 6, temp: 20, hourly: { precipitation: [1.8, 1.2, 0.6, 0.4] } };
  var sunny  = { code: 0,  rain: 0,   cloud: 5,  wind: 1, temp: 20, hourly: { precipitation: [0, 0, 0, 0] } };
  var cloudy = { code: 3,  rain: 0,   cloud: 85, wind: 1, temp: 20, hourly: { precipitation: [0, 0, 0, 0] } };
  var after  = { code: 3,  rain: 0,   cloud: 60, wind: 1, temp: 20, hourly: { precipitation: [1.2, 0.6, 0.2, 0] } };
  var breezy = { code: 0,  rain: 0,   cloud: 5,  wind: 8, temp: 20, hourly: { precipitation: [0, 0, 0, 0] } };
  var chilly = { code: 3,  rain: 0,   cloud: 60, wind: 1, temp: 8,  hourly: { precipitation: [0, 0, 0, 0] } };

  assert.deepStrictEqual(gatesFor(cloudy), ['cloud'], 'an overcast sky opens the cloud kigo');
  assert.ok(gatesFor(chilly).indexOf('cold') >= 0, 'a chilly day opens 花冷え');
  assert.ok(gatesFor(after).indexOf('afterrain') >= 0 && gatesFor(after).indexOf('rain') < 0,
            'rain that has just stopped is still afterrain');
  assert.ok(gatesFor(sunny).indexOf('afterrain') < 0, 'a dry day is not afterrain');

  var autumnRain = offered('autumn', ['三秋', '初秋'], 'day', rainy);
  var autumnSun  = offered('autumn', ['三秋', '初秋'], 'day', sunny);
  // 雨の日の「秋の水」は水たまりを連想させる。本意（澄んだ川や池）に反するので外す
  assert.ok(autumnRain.indexOf('秋の水') < 0, '秋の水 is withheld while it rains');
  assert.ok(autumnSun.indexOf('秋の水') >= 0, '秋の水 is offered under a clear sky');
  assert.ok(autumnRain.indexOf('秋高し') < 0 && autumnSun.indexOf('秋高し') >= 0, '秋高し needs a clear sky');
  assert.ok(autumnRain.indexOf('水澄む') < 0, '水澄む is withheld while it rains');
  // 曇りの季語は、晴れでも雨でもなく曇りのときに出す
  assert.ok(offered('autumn', ['三秋', '初秋'], 'day', cloudy).indexOf('鰯雲') >= 0, '鰯雲 under an overcast sky');
  assert.ok(autumnSun.indexOf('鰯雲') < 0, '鰯雲 is not offered under a clear sky');
  // 雨が上がった後だけ出る語
  var springAfter = offered('spring', ['三春', '仲春'], 'day', after);
  assert.ok(springAfter.indexOf('春泥') >= 0, '春泥 after the rain');
  assert.ok(offered('spring', ['三春', '仲春'], 'day', sunny).indexOf('春泥') < 0, '春泥 needs rain to have fallen');
  // 風の有無で切り替わる語
  assert.ok(offered('summer', ['三夏', '晩夏'], 'dusk', sunny).indexOf('夕凪') >= 0, '夕凪 on a still evening');
  assert.ok(offered('summer', ['三夏', '晩夏'], 'dusk', breezy).indexOf('夕凪') < 0, '夕凪 is not offered in wind');
  // 天気が取れないときは、天気に依る語を一切出さない（肯定・否定とも）
  var unknown = offered('autumn', ['三秋', '初秋'], 'day', null);
  assert.ok(unknown.indexOf('秋の水') < 0 && unknown.indexOf('秋高し') < 0,
            'no weather-bound kigo when the weather is unknown');

  // 本意が字面から読めない語には語釈が付く
  var table = kigoTable.table();
  function noteOf(w) {
    for (var i = 0; i < table.length; i++) if (table[i].w === w) return table[i].note;
    return null;
  }
  assert.ok(noteOf('秋の水').indexOf('澄') >= 0, '秋の水 carries its traditional scene: ' + noteOf('秋の水'));
  // 本意は短くまとめる。何であるかの説明（モデルが既に知っていること）に字を使わない
  var noted = table.filter(function(r) { return r.note; });
  assert.ok(noted.length > 300, 'most words carry their sense: ' + noted.length);
  var longOnes = noted.filter(function(r) { return r.note.length > 10; });
  assert.deepStrictEqual(longOnes, [], 'the sense is stated in ten characters or fewer: ' +
            longOnes.map(function(r) { return r.w + '＝' + r.note; }).join('、'));
  assert.strictEqual(noteOf('水温む'), '春の訪れ', 'a literal restatement is replaced by the sense');
  assert.strictEqual(noteOf('桐一葉'), '衰えの兆し', 'the sense, not the surface');
  // 何であるかの説明はモデルが既に知っているので書かない
  assert.strictEqual(noteOf('蟷螂'), '構えの鋭さ', 'no bare identification of a common word');
  assert.ok(noted.every(function(r) { return !/のこと$|の名$|もの$/.test(r.note); }),
            'no gloss merely names the thing');
  assert.ok(noteOf('清水') && noteOf('泉') && noteOf('爽やか') && noteOf('春潮'),
            'the words whose surface hides their sense carry a gloss');
  // 季節の＋名詞は本意が無いとどんな景にも付く逃げの語になるので、必ず本意を持つ
  var bare = table.filter(function(r) { return /^[春夏秋冬]の/.test(r.w) && !r.note; });
  assert.deepStrictEqual(bare.map(function(r) { return r.w; }), [],
            'every season-prefixed word carries its sense');
  assert.strictEqual(noteOf('秋の日'), '澄んで短い日ざし', '秋の日 is no longer a catch-all');
  ok('kigo kept to their traditional scene by weather gates and glosses');

  // 13c3d. 雲と空の季語は、降っている間は出さない（本降りの空に鰯雲は無い）
  assert.ok(offered('autumn', ['三秋', '初秋'], 'day', cloudy).indexOf('鰯雲') >= 0, '鰯雲 under a dry overcast sky');
  assert.ok(autumnRain.indexOf('鰯雲') < 0, '鰯雲 is withheld while it rains');
  assert.ok(autumnRain.indexOf('秋の空') < 0 && autumnSun.indexOf('秋の空') >= 0, '秋の空 needs the rain to hold off');
  assert.strictEqual(noteOf('秋の空'), '移ろいやすい空', '秋の空 carries its sense');

  // 13c3e. 時間ごとの降水量と、いまの空の様子が食い違うときは弱まったと言う
  var weatherModule = require('../src/pkjs/weather');
  function changeOf(w) { return weatherModule.change(w, 'ja'); }
  assert.strictEqual(changeOf({ code: 53, rain: 0.2, cloud: 92,
      hourly: { time: ['a', 'b', 'c', 'd'], precipitation: [7.4, 12.7, 8, 6.3] } }),
      '雨脚が弱まってきた', 'a drizzle after a heavy hour reads as easing');
  assert.strictEqual(changeOf({ code: 65, rain: 3.0, cloud: 92,
      hourly: { time: ['a', 'b', 'c', 'd'], precipitation: [6.0, 6.2, 6.1, 6.3] } }),
      null, 'steady heavy rain is not eased');
  ok('the rain figure and the sky never contradict each other');

  // 13c3f. 霧の字は、実際に霧が出ているときの天気にだけ使う
  assert.ok(weatherModule.describe(53, 'ja').indexOf('霧') < 0,
            'drizzle is not called 霧雨: ' + weatherModule.describe(53, 'ja'));
  assert.ok([51, 55, 56, 57].every(function(c) { return weatherModule.describe(c, 'ja').indexOf('霧') < 0; }),
            'no drizzle code carries the character 霧');
  assert.strictEqual(weatherModule.describe(45, 'ja'), '霧', 'real fog is still called 霧');
  ok('fog is named only when there is fog');

  // 13c3g. 降っているのが雪のときは、雨とは言わない
  var snowNow = { code: 73, rain: 0.8, cloud: 100, temp: -0.5, wind: 3,
                  hourly: { time: ['a','b','c','d'], precipitation: [0.2, 0.4, 0.7, 0.8] } };
  assert.ok(weatherModule.feel(snowNow, 'ja').indexOf('雪が降っている') >= 0,
            'falling snow is called snow: ' + weatherModule.feel(snowNow, 'ja'));
  assert.ok(weatherModule.feel(snowNow, 'ja').indexOf('雨') < 0, 'falling snow is never called rain');
  assert.strictEqual(weatherModule.change({ code: 73, rain: 0.5, cloud: 100,
      hourly: { time: ['a','b','c','d'], precipitation: [4.0, 3.0, 2.0, 0.5] } }, 'ja'),
      '雪が弱まってきた', 'easing snow is snow, not rain');
  // 霞は朝夕にも立つ
  assert.ok(kigoTable.pick('spring', ['三春', '仲春'], 'morning',
      { code: 45, rain: 0, cloud: 80, wind: 1, temp: 12, hourly: { precipitation: [0,0,0,0] } }, 400)
      .map(function(r) { return r.w; }).indexOf('霞') >= 0, '霞 is offered in the morning');
  ok('snow is named snow, and haze reaches the morning');

  // 13c3h. 直近の句で使った季語は候補から外す
  var usedOf = kigoTable.usedIn;
  var usedWater = usedOf(['澄みきって / 秋の水ゆく / 石の上']);
  assert.ok(usedWater.indexOf('秋の水') >= 0 && usedWater.indexOf('秋') < 0,
            'the longest word is taken, not 秋 inside 秋の水: ' + usedWater.join('、'));
  assert.ok(usedOf(['ひぐらしや / 山の端うすく / 暮れのこる']).indexOf('蜩') >= 0,
            'a kigo written in kana is recognised');
  assert.ok(usedOf(['落ち葉掃く / 音のしずかに / 寺の朝']).indexOf('落葉') >= 0,
            'a kigo with different okurigana is recognised');
  assert.deepStrictEqual(usedOf([]), [], 'nothing is excluded before the first haiku');
  var withoutRecent = kigoTable.pick('autumn', ['仲秋', '三秋'], 'deepnight', null, 400, ['初潮', '夜長'])
      .map(function(r) { return r.w; });
  assert.ok(withoutRecent.indexOf('初潮') < 0 && withoutRecent.indexOf('夜長') < 0,
            'excluded words are not offered');
  var nightAll = candidates('deepnight', ['仲秋', '三秋'], 'autumn');
  assert.strictEqual(kigoTable.pick('autumn', ['仲秋', '三秋'], 'deepnight', null, 400, nightAll).length,
                     nightAll.length, 'nothing is excluded when nothing would remain');
  // プロンプトの候補にも効く。前回の候補を並べた句を履歴に置くと、次の候補には一つも出ない
  var keptKigoHistory = store['haiku-history'];
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });
  function listedKigo() {
    return /候補（他でも可[^\n]*?）：(.+)/.exec(llm()[0].body.messages[0].content)[1]
        .split('、').map(function(x) { return x.replace(/（.*$/, ''); });
  }
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  var prevList = listedKigo();
  llm()[0].respond(200, CLAUDE_OK);
  store['haiku-history'] = JSON.stringify([prevList.join('、')]);
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  var nextList = listedKigo();
  llm()[0].respond(200, CLAUDE_OK);
  var repeated = nextList.filter(function(x) { return prevList.indexOf(x) >= 0; });
  assert.deepStrictEqual(repeated, [], 'kigo of the recent haiku are not offered again: ' + repeated.join('、'));
  assert.ok(nextList.length > 0, 'candidates remain after the exclusion');
  if (keptKigoHistory === undefined) delete store['haiku-history'];
  else store['haiku-history'] = keptKigoHistory;
  ok('kigo used in the recent haiku are left out of the candidates');

  // 13c4. 技法（型×レンズ）は毎回一つだけ指定し、直近6回に使ったレンズは避ける。
  // 時候を描けない組み合わせでは、季語の候補から時候を外す
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });
  var techMod = require('../src/pkjs/technique');
  var jikoWords = kigoTable.table().filter(function(r) { return r.cat === '時候'; }).map(function(r) { return r.w; });
  var tenmonWords = kigoTable.table().filter(function(r) { return r.cat === '天文'; }).map(function(r) { return r.w; });
  var seen = [], sawJiko = false;
  for (var ti = 0; ti < 30; ti++) {
    delete store['haiku-cache'];
    reset();
    handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
    await wait();
    var body = llm()[0].body.messages[0].content;
    var tm = /【技法】(.+?)。技法名/.exec(body);
    assert.ok(tm, 'technique named on run ' + ti);
    var te = techMod.all.filter(function(t) { return techMod.matches(t, tm[1]); })[0];
    assert.ok(te, 'a known technique: ' + tm[1]);
    seen.push(te.lens);
    var cand = (/候補[^：]*：(.+)/.exec(body) || [, ''])[1].split('、').map(function(x) { return x.replace(/（.*$/, ''); });
    var jiko = cand.filter(function(x) { return jikoWords.indexOf(x) >= 0; });
    if (te.noJiko) assert.deepStrictEqual(jiko, [], 'no 時候 kigo for ' + te.key + ': ' + jiko.join('、'));
    if (te.noTenmon) {
      var sky = cand.filter(function(x) { return tenmonWords.indexOf(x) >= 0; });
      assert.deepStrictEqual(sky, [], 'no 天文 kigo for ' + te.key + ': ' + sky.join('、'));
    }
    else if (jiko.length) sawJiko = true;
    llm()[0].respond(200, CLAUDE_OK);
  }
  for (var tj = 1; tj < seen.length; tj++) {
    var win = seen.slice(Math.max(0, tj - 6), tj);
    assert.ok(win.indexOf(seen[tj]) < 0, 'lens not reused within six runs: ' + win.concat(seen[tj]).join(' / '));
  }
  assert.strictEqual(techMod.all.length, 54, 'every allowed type × lens pair is a technique');
  assert.ok(!techMod.all.some(function(t) { return t.key === 'S4.x1' || t.key === 'D4.x3' || t.key === 'T5.x1'; }), 'forbidden pairs are left out');
  assert.ok(techMod.all.every(function(t) { return t.avoidKire.indexOf('keri') >= 0; }), 'no technique ends on keri');
  assert.ok(techMod.all.every(function(t) { return t.ja.indexOf('上五') < 0 && t.ja.indexOf('下五') < 0; }), 'no line positions are fixed');
  void sawJiko;
  ok('one technique per haiku, no repeats within six runs');

  // 13c4b. 季語が二つ入った句は、重なった季語を添えて一度だけ詠み直させる。二度目はそのまま使う
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  var firstPrompt = llm()[0].body.messages[0].content;
  llm()[0].respond(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: '山笑う\n落ち葉の上に\n蝶ひとつ' }] });
  await wait();
  assert.strictEqual(llm().length, 2, 'a second request after a kigo overlap');
  var retryPrompt = llm()[1].body.messages[0].content;
  assert.ok(retryPrompt.indexOf(firstPrompt) === 0, 'the retry keeps the original prompt');
  assert.ok(/【詠み直し】.*山笑う 落ち葉の上に 蝶ひとつ.*季語が3つ（山笑ふ・落葉・蝶）/.test(retryPrompt),
            'the retry names the overlapping kigo: ' + retryPrompt.slice(-200));
  llm()[1].respond(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: '桜散る\n川面に春の\n月ひとつ' }] });
  await wait();
  assert.strictEqual(llm().length, 2, 'no third request');
  assert.deepStrictEqual([last().HAIKU_L1, last().HAIKU_L2, last().HAIKU_L3], ['桜散る', '川面に春の', '月ひとつ'],
                         'the second haiku is used even if it still overlaps');
  // 季語が一つなら詠み直さない
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  llm()[0].respond(200, CLAUDE_OK);
  await wait();
  assert.strictEqual(llm().length, 1, 'one kigo, no retry');
  // 照合そのもの：色の名・送り仮名違い・行をまたぐ語
  var kigoMod = require('../src/pkjs/kigo');
  assert.deepStrictEqual(kigoMod.inHaiku(['桜色', '頬にのこして', '秋の風']), ['秋風'], 'colour names are not kigo');
  assert.deepStrictEqual(kigoMod.inHaiku(['秋の灯の', '橙帯びて', '曇りかな']), ['秋の灯'], 'orange as a colour');
  assert.deepStrictEqual(kigoMod.inHaiku(['薄曇り', '風の涼しさ', '処暑の暮れ']).sort(), ['処暑', '涼し'].sort(), 'a weather word and a solar term');
  assert.deepStrictEqual(kigoMod.inHaiku(['花を見る', '人の背に', '雲ひとつ']), ['花見'], 'one kigo counted once');
  ok('kigo overlap is checked against the full saijiki and retried once');

  // 13c5. 切れの型は呼ぶたびに無作為に一つ選び、直近2回に使った型は避ける
  var kireMod = require('../src/pkjs/kire');
  var cuts = {}, cutSeq = [], cutTech = [];
  for (var ki = 0; ki < 40; ki++) {
    delete store['haiku-cache'];
    reset();
    handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
    await wait();
    var km = /【切れ】(.+?)\n/.exec(llm()[0].body.messages[0].content);
    assert.ok(km, 'cutting form named on run ' + ki);
    assert.ok(kireMod.all.some(function(k) { return k.ja === km[1]; }), 'a known cutting form: ' + km[1]);
    var kt = /【技法】(.+?)。技法名/.exec(llm()[0].body.messages[0].content);
    var ktech = techMod.all.filter(function(t) { return techMod.matches(t, kt[1]); })[0];
    var kkey = kireMod.all.filter(function(k) { return k.ja === km[1]; })[0].key;
    assert.ok(ktech.avoidKire.indexOf(kkey) < 0, 'cut fits the technique: ' + ktech.key + ' / ' + kkey);
    cuts[km[1]] = true;
    cutSeq.push(kkey);
    cutTech.push(ktech);
    llm()[0].respond(200, CLAUDE_OK);
  }
  assert.ok(Object.keys(cuts).length >= 3, 'cutting forms vary between calls: ' + Object.keys(cuts).join(' / '));
  for (var kj = 1; kj < cutSeq.length; kj++) {
    // 型が許す切れが直近2回で尽きているときだけ、続けて同じ切れになってよい
    var recentCuts = cutSeq.slice(Math.max(0, kj - 2), kj);
    var allowed = kireMod.all.filter(function(k) { return cutTech[kj].avoidKire.indexOf(k.key) < 0; });
    var forced = allowed.every(function(k) { return recentCuts.indexOf(k.key) >= 0; });
    assert.ok(forced || recentCuts.indexOf(cutSeq[kj]) < 0,
              'cutting form not reused within two runs: ' + recentCuts.concat(cutSeq[kj]).join(' / '));
  }
  ok('a cutting form is picked at random for each haiku, avoiding the last two');

  // 13d. 特別な日は、その一事を優先させる文を差し込む
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });
  setNow(20, 0, 2026, 8, 25);          // 2026年の中秋の名月
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  prompt = llm()[0].body.messages[0].content;
  assert.ok(prompt.indexOf('【本日は中秋の名月】') >= 0, 'special day inserted: ' + prompt.slice(0, 200));
  assert.ok(prompt.indexOf('この一事を優先') >= 0, 'override instruction');
  llm()[0].respond(200, CLAUDE_OK);
  setNow(20, 0, 2026, 8, 24);          // 前日は特別な日ではない
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  prompt = llm()[0].body.messages[0].content;
  assert.ok(prompt.indexOf('本日は') < 0, 'no special sentence on an ordinary day');
  assert.ok(prompt.indexOf('{') < 0, 'no leftover placeholder');
  llm()[0].respond(200, CLAUDE_OK);
  restoreNow();
  ok('special day overrides the usual subject');

  // 14. 腕時計から届いた歩数がプロンプトに入る
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1, STEPS: 7321 } });
  await wait();
  assert.strictEqual(llm().length, 1);
  prompt = llm()[0].body.messages[0].content;
  assert.ok(prompt.indexOf('よく歩きたる一日') >= 0, 'activity phrase: ' + prompt);
  assert.ok(prompt.indexOf('7321') < 0, 'the raw step count is not in the default prompt: ' + prompt);
  llm()[0].respond(200, CLAUDE_OK);
  // 0 歩は「計測なし」として文ごと落とす
  delete store['haiku-cache'];
  delete store['last-steps'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1, STEPS: 0 } });
  await wait();
  prompt = llm()[0].body.messages[0].content;
  assert.ok(prompt.indexOf('歩') < 0, 'zero steps are not mentioned: ' + prompt);
  llm()[0].respond(200, CLAUDE_OK);
  ok('step count from the watch');

  // 15. 直近の句をプロンプトに入れて重複を避けさせる
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1, STEPS: 7321 } });
  await wait();
  prompt = llm()[0].body.messages[0].content;
  assert.ok(prompt.indexOf('古池や / 蛙飛び込む / 水の音') >= 0, 'recent haiku listed: ' + prompt.slice(-160));
  assert.ok(prompt.indexOf('【避ける】') >= 0, 'instruction to avoid repeats');
  llm()[0].respond(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: '朝顔や\n釣瓶とられて\nもらひ水' }] });
  assert.ok(JSON.parse(store['haiku-history']).length >= 2, 'history grows');
  ok('recent haiku passed back to avoid repetition');

  // 15a. カレンダー（ICS）の予定を、前後1時間だけ句の条件に入れる
  function icsStamp(d) {
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    // 秒まで書く。00 に丸めると「30分後」が秒しだいで「29分後」になる
    return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + 'T' +
           p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
  }
  function icsEvent(title, startMin, endMin, extra) {
    var base = Date.now();
    return 'BEGIN:VEVENT\r\n' +
           'DTSTAMP:' + icsStamp(new Date(base)) + '\r\n' +
           'DTSTART:' + icsStamp(new Date(base + startMin * 60000)) + '\r\n' +
           'DTEND:' + icsStamp(new Date(base + endMin * 60000)) + '\r\n' +
           'SUMMARY:' + title + '\r\n' + (extra || '') + 'END:VEVENT\r\n';
  }
  function icsWrap(body) {
    return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' + body + 'END:VCALENDAR\r\n';
  }
  async function promptWithIcs(text) {
    icsText = text;
    delete store['haiku-cache'];
    reset();
    handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
    await wait();
    var p = llm()[0].body.messages[0].content;
    llm()[0].respond(200, CLAUDE_OK);
    return p;
  }
  store['clay-settings'] = JSON.stringify({
    CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja',
    CFG_ICS_URL: 'https://calendar.google.com/calendar/ical/x/private-y/basic.ics'
  });
  // 30分後に始まる予定
  prompt = await promptWithIcs(icsWrap(icsEvent('歯医者', 30, 90)));
  assert.ok(prompt.indexOf('歯医者の予定が30分後に入っています') >= 0, 'upcoming event: ' + prompt.slice(0, 400));
  // 開催中
  prompt = await promptWithIcs(icsWrap(icsEvent('composition レビュー', -20, 40)));
  assert.ok(prompt.indexOf('composition レビューの予定中です') >= 0, 'ongoing event: ' + prompt.slice(0, 400));
  // 終わって25分後
  prompt = await promptWithIcs(icsWrap(icsEvent('朝会', -55, -25)));
  assert.ok(prompt.indexOf('朝会の予定が終わってから25分後です') >= 0, 'finished event: ' + prompt.slice(0, 400));
  // 3時間後の予定は遠すぎるので、文ごと落ちる
  prompt = await promptWithIcs(icsWrap(icsEvent('遠い予定', 180, 240)));
  assert.ok(prompt.indexOf('遠い予定') < 0 && prompt.indexOf('予定') < 0, 'far event dropped: ' + prompt.slice(0, 400));
  // 終日予定と繰り返し予定は使わない
  prompt = await promptWithIcs(icsWrap(
    'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:' + icsStamp(new Date()).slice(0, 8) +
    '\r\nSUMMARY:終日の催し\r\nEND:VEVENT\r\n' +
    icsEvent('毎週の会議', 20, 80, 'RRULE:FREQ=WEEKLY;BYDAY=MO\r\n')));
  assert.ok(prompt.indexOf('終日の催し') < 0 && prompt.indexOf('毎週の会議') < 0,
            'all-day and repeating events ignored: ' + prompt.slice(0, 400));
  // 近い予定が複数あれば、いまに近いほうを1件だけ
  prompt = await promptWithIcs(icsWrap(icsEvent('あとの用', 50, 80) + icsEvent('さきの用', 10, 40)));
  assert.ok(prompt.indexOf('さきの用の予定が10分後に入っています') >= 0 && prompt.indexOf('あとの用') < 0,
            'only the nearest event: ' + prompt.slice(0, 400));
  // 取得に失敗しても句作りは止まらない
  prompt = await promptWithIcs(null);
  assert.ok(prompt.indexOf('五七五') >= 0 && prompt.indexOf('予定') < 0, 'a failed fetch drops the sentence');
  // URL が空なら取りに行かない
  icsCalls = 0;
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });
  prompt = await promptWithIcs(icsWrap(icsEvent('呼ばれない', 30, 90)));
  assert.strictEqual(icsCalls, 0, 'no calendar request without a URL');
  assert.ok(prompt.indexOf('呼ばれない') < 0, 'no event without a URL');
  // 過去の予定は開かない。ICS の DTSTAMP・CREATED には書き出した今日の日付が入るので、
  // VEVENT の中を日付で丸ごと探すと、カレンダー全体が「いまに近い予定」になってしまう
  var scheduleModule = require('../src/pkjs/schedule.js');
  var mixed = icsWrap(
    'BEGIN:VEVENT\r\nDTSTAMP:' + icsStamp(new Date()) + '\r\n' +
    'CREATED:' + icsStamp(new Date()) + '\r\n' +
    'DTSTART:20081206T063000Z\r\nDTEND:20081206T080000Z\r\n' +
    'SUMMARY:18年前の予定\r\nEND:VEVENT\r\n' + icsEvent('近い予定', 30, 90));
  var nearEvents = scheduleModule.parse(mixed, new Date());
  assert.strictEqual(nearEvents.length, 1, 'only events whose DTSTART is near now are opened');
  assert.strictEqual(nearEvents[0].title, '近い予定');
  // 英語の既定プロンプトにも予定の文がある。予定が無ければ文ごと落ちる
  store['clay-settings'] = JSON.stringify({
    CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'en',
    CFG_ICS_URL: 'https://calendar.google.com/calendar/ical/x/private-y/basic.ics'
  });
  prompt = await promptWithIcs(icsWrap(icsEvent('Dentist', 30, 90)));
  assert.ok(prompt.indexOf('On the calendar, Dentist starts in 30 minutes.') >= 0,
            'the English default carries the event: ' + prompt.slice(0, 600));
  prompt = await promptWithIcs(icsWrap(icsEvent('Far away', 180, 240)));
  assert.ok(prompt.indexOf('On the calendar') < 0 && prompt.indexOf('{schedule}') < 0 &&
            prompt.indexOf('COMPOSITION') >= 0, 'no event drops only that sentence: ' + prompt.slice(0, 600));
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });

  icsText = null;
  ok('calendar events within an hour reach the prompt');

  // 15b. 直近の句は新しいものから並べる（保存は古い順）
  var keptHistory = store['haiku-history'];
  store['haiku-history'] = JSON.stringify(['古き句 / その中七 / その下五',
                                           '中の句 / その中七 / その下五',
                                           '新しき句 / その中七 / その下五']);
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  prompt = llm()[0].body.messages[0].content;
  assert.ok(prompt.indexOf('新しき句') >= 0 && prompt.indexOf('古き句') >= 0, 'all recent haiku listed');
  assert.ok(prompt.indexOf('新しき句') < prompt.indexOf('中の句') &&
            prompt.indexOf('中の句') < prompt.indexOf('古き句'),
            'recent haiku are listed newest first: ' + (/直前に詠んだ句[^\n]*/.exec(prompt) || [''])[0]);
  llm()[0].respond(200, CLAUDE_OK);
  store['haiku-history'] = keptHistory;
  // 履歴が無い初回は、その一文ごと落とす（「なし」とは書かない）
  delete store['haiku-history'];
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  prompt = llm()[0].body.messages[0].content;
  assert.ok(prompt.indexOf('【避ける】') < 0 && prompt.indexOf('なし') < 0,
            'the first run carries no empty list of recent haiku');
  assert.ok(prompt.indexOf('五七五') >= 0, 'the rest of the prompt survives');
  llm()[0].respond(200, CLAUDE_OK);
  store['haiku-history'] = keptHistory;
  ok('recent haiku listed newest first');

  // 16. 歩数と場所をオフにすると、その文は落ちる
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja',
                                            CFG_PLACE: false, CFG_STEPS: false });
  delete store['haiku-cache'];
  delete store['last-steps'];
  reset();
  var pBefore = placeCalls;
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1, STEPS: 7321 } });
  await wait();
  assert.strictEqual(placeCalls, pBefore, 'no reverse geocoding when disabled');
  prompt = llm()[0].body.messages[0].content;
  assert.ok(prompt.indexOf('あたり。') < 0, 'place sentence dropped: ' + prompt);
  assert.ok(prompt.indexOf('歩き') < 0, 'step sentence dropped');
  assert.ok(prompt.indexOf('{') < 0, 'no leftover placeholder');
  llm()[0].respond(200, CLAUDE_OK);
  ok('place and steps disabled');

  // 17. 月は「夜」で「空に出ている」ときだけ
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });
  var moonCases = [
    // [時, 分, 年, 月(0始), 日, 期待, 説明]
    [21, 0, 2026, 8, 26, true,  'full moon evening'],
    [12, 0, 2026, 8, 26, false, 'full moon at noon (daytime)'],
    [21, 0, 2026, 8, 11, false, 'new moon'],
    [2, 0, 2026, 8, 19, false, 'first-quarter moon already set at 2am'],
    [4, 30, 2026, 8, 5, true,  'last-quarter moon before dawn']
  ];
  for (var mc of moonCases) {
    setNow(mc[0], mc[1], mc[2], mc[3], mc[4]);
    delete store['haiku-cache'];
    reset();
    handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
    await wait();
    var pm = llm()[0].body.messages[0].content;
    var hasMoon = pm.indexOf('（月齢') >= 0;
    assert.strictEqual(hasMoon, mc[5], mc[6] + ': ' + pm.slice(0, 120));
    if (mc[5]) assert.ok(/（月齢\d/.test(pm), 'moon age present');
    llm()[0].respond(200, CLAUDE_OK);
  }
  // 厚い雲なら月の文を入れない
  weatherCloud = 96;
  setNow(21, 0, 2026, 8, 26);
  delete store['haiku-cache'];
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  assert.ok(llm()[0].body.messages[0].content.indexOf('（月齢') < 0, 'overcast hides the moon');
  llm()[0].respond(200, CLAUDE_OK);
  weatherCloud = 75;
  restoreNow();
  ok('moon only at night while it is up');

  // 18. APIエラー
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'openai', CFG_OPENAI_KEY: 'bad', CFG_LANG: 'en' });
  store['haiku-cache'] = JSON.stringify({ date: '2000-01-01', lang: 'en', lines: ['x'] });
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  llm()[0].respond(401, { error: { message: 'Incorrect API key provided' } });
  assert.strictEqual(last().STATUS, 1);
  assert.ok(last().HAIKU_L1.indexOf('OpenAI API 401') >= 0, last().HAIKU_L1);
  ok('api error -> ' + last().HAIKU_L1);

  // 19. Claude が拒否した場合
  store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja' });
  store['haiku-cache'] = JSON.stringify({ date: '2000-01-01', lang: 'ja', lines: ['x'] });
  reset();
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
  await wait();
  llm()[0].respond(200, { stop_reason: 'refusal', content: [] });
  assert.strictEqual(last().STATUS, 1);
  ok('refusal handled');

  // 20. 失敗しても手元の句は消えない
  assert.strictEqual(JSON.parse(store['haiku-cache']).date, '2000-01-01', 'failed run keeps old cache');
  ok('cache untouched on failure');

  // 21. 既定プロンプトを直したら、保存してあるプロンプトにも行ごとに当てる
  var promptsMod = require('../src/pkjs/prompts');
  var b0 = 'A\nB\nC\n\nD';
  assert.strictEqual(promptsMod.merge(b0, 'A\nB2\nC\n\nD', b0), 'A\nB2\nC\n\nD',
                     'an untouched copy becomes the new default');
  assert.strictEqual(promptsMod.merge(b0, 'A\nB2\nC\n\nD', 'A!\nB\nC\n\nD'), 'A!\nB2\nC\n\nD',
                     'a changed line reaches an edited prompt');
  assert.strictEqual(promptsMod.merge(b0, 'A\nB2\nC\n\nD', 'A\nB mine\nC\n\nD'), 'A\nB mine\nC\n\nD',
                     'a line the user rewrote is left alone');
  assert.strictEqual(promptsMod.merge(b0, 'A\nB\nX\nC\n\nD', 'A\nB\nC\nY\n\nD'), 'A\nB\nX\nC\nY\n\nD',
                     'an added line goes after the line it follows');
  assert.strictEqual(promptsMod.merge(b0, 'A\nC\n\nD', 'Z\nA\nB\nC\n\nD'), 'Z\nA\nC\n\nD',
                     'a removed line is removed');

  var cfgMod = require('../src/pkjs/config');
  var newCut = '【切れ】{kire}';
  var oldCut = '切れ字（や・かな・けり）で切るか、関わりのない二つの像を並べて余韻を作るか、どちらかの形を取る。';
  assert.ok(cfgMod.DEFAULT_PROMPT_JA.indexOf(newCut) >= 0, 'the default carries the new line');
  // base を覚える前の版の既定
  var oldDefault = require('../src/pkjs/prompt_legacy').ja;
  assert.ok(oldDefault.indexOf(oldCut) >= 0, 'the legacy default is the oldest one');
  async function startWithPrompt(text) {
    reset();
    store['clay-settings'] = JSON.stringify({ CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'k', CFG_LANG: 'ja',
                                              CFG_PROMPT_JA: text });
    handlers.ready();
    await wait();
    llm().forEach(function(x) { if (!x.status) x.respond(200, CLAUDE_OK); });
    return JSON.parse(store['clay-settings']).CFG_PROMPT_JA;
  }
  // 以前の既定をそのまま持っている端末は、起動したときに今の既定へ入れ替わる
  delete store['prompt-base'];
  assert.strictEqual(await startWithPrompt(oldDefault), cfgMod.DEFAULT_PROMPT_JA,
                     'a saved copy of the old default is upgraded on start');
  // 手を入れてあっても、書き換えていない行は入れ替わり、足した行は残る
  delete store['prompt-base'];
  var upgraded = await startWithPrompt(oldDefault.replace('【作句】', '【作句】\n自分で足した一行。'));
  assert.ok(upgraded.indexOf(newCut) >= 0 && upgraded.indexOf(oldCut) < 0, 'the changed line reaches an edited prompt');
  assert.ok(upgraded.indexOf('【作句】\n自分で足した一行。') >= 0, 'the line the user added stays');
  // 一度追いついた後は、利用者が自分で戻した行をもう一度書き換えない
  assert.strictEqual(await startWithPrompt(oldDefault), oldDefault, 'a choice made after the upgrade is kept');
  // 一つ前の既定（base を覚えている端末）からも、切れの型の行へ入れ替わる
  var prevCut = '切れ字（や・かな・けり）で切るか、または二物を並べる。\n' +
                '切れ字「や」は上五または中七の末尾に置く。下五末尾には置かない。\n' +
                '下五を切る場合は「かな」「けり」を用いる。';
  var prevDefault = cfgMod.DEFAULT_PROMPT_JA.split(newCut).join(prevCut);
  store['prompt-base'] = JSON.stringify({ ja: prevDefault });
  assert.strictEqual(await startWithPrompt(prevDefault), cfgMod.DEFAULT_PROMPT_JA,
                     'the previous default moves to the random cutting form');
  ok('saved prompts follow changes to the default prompt');

  console.log('ALL OK');
  process.exit(0);
}

main().catch(function(e) { console.error(e); process.exit(1); });
