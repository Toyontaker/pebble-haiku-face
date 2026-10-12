// いまの実況で既定プロンプトを組み立てて表示する。
// 天気（Open-Meteo）と地名（BigDataCloud）は本物を取りに行き、LLM には送らずに捕まえる。
//
//   node test/prompt_live.js                     東京駅
//   node test/prompt_live.js 35.0116 135.7681    京都市
//   node test/prompt_live.js 35.0116 135.7681 en 英語のプロンプト
//   ※先に pebble build が必要
var https = require('https');
var path = require('path');

var lat = parseFloat(process.argv[2]) || 35.6812;
var lon = parseFloat(process.argv[3]) || 139.7671;
var lang = process.argv[4] === 'en' ? 'en' : 'ja';

var store = {}, handlers = {}, sent = [], captured = null;

global.localStorage = {
  getItem: function(k) { return store.hasOwnProperty(k) ? store[k] : null; },
  setItem: function(k, v) { store[k] = String(v); },
  removeItem: function(k) { delete store[k]; }
};
global.Pebble = {
  platform: 'pypkjs',
  addEventListener: function(n, f) { handlers[n] = f; },
  sendAppMessage: function(m, ok) { sent.push(m); if (ok) ok(); },
  openURL: function() {},
  getActiveWatchInfo: function() { return { platform: 'basalt' }; },
  getAccountToken: function() { return ''; },
  getWatchToken: function() { return ''; }
};

function XHR() { this.headers = {}; }
XHR.prototype.open = function(m, u) { this.method = m; this.url = u; };
XHR.prototype.setRequestHeader = function(k, v) { this.headers[k] = v; };
XHR.prototype.send = function(body) {
  var self = this;
  if (this.url.indexOf('open-meteo') >= 0 || this.url.indexOf('bigdatacloud') >= 0) {
    https.get(this.url, function(res) {
      var buf = '';
      res.on('data', function(d) { buf += d; });
      res.on('end', function() {
        self.status = res.statusCode; self.readyState = 4; self.responseText = buf;
        self.onreadystatechange();
      });
    }).on('error', function(e) {
      console.log('通信できませんでした: ' + e.message);
      if (self.onerror) self.onerror();
    });
    return;
  }
  captured = { url: this.url, body: body ? JSON.parse(body) : null };   // LLM へは送らない
};
global.XMLHttpRequest = XHR;

Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  geolocation: { getCurrentPosition: function(ok) { ok({ coords: { latitude: lat, longitude: lon } }); } }
} });

store['clay-settings'] = JSON.stringify({
  CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'dummy', CFG_LANG: lang,
  CFG_WEATHER: true, CFG_PLACE: true, CFG_STEPS: true
});
require(path.join(__dirname, '..', 'build', 'pebble-js-app.js'));

setTimeout(function() {
  handlers.appmessage({ payload: { REQUEST_HAIKU: 1, STEPS: 6480 } });
  setTimeout(function() {
    if (!captured) {
      console.log('\n!! LLM 呼び出しまで届きませんでした（通信か設定を確認）');
      process.exit(1);
    }
    console.log('\n==== 送信先 ====\n' + captured.url);
    console.log('\n==== プロンプト ====\n' + captured.body.messages[0].content);
    process.exit(0);
  }, 8000);
}, 300);
