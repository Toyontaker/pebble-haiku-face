// 季節・天気・場所を変えてプロンプトを組み立て、句を詠ませる。
//
//   node test/scenes.js --dry --n 10
//       → test/out/prompts/ にプロンプトを書き出す（通信なし）。
//         書き出したファイルを haiku-poet サブエージェント（Sonnet）に渡して詠ませ、
//         結果を test/out/scene<N>.json に置いてから test/analyze.py で集計する。
//
//   node test/scenes.js --key-file ~/gkey --n 2
//       → Gemini に実際に送って句を表示する（キーは引数のファイルから読む）。
//
//   --scene 3     その場面だけ（6,7 のように複数も可）／  --out <dir>   出力先（既定 test/out）
//   --prompt-file p.txt  既定の代わりにそのファイルの日本語プロンプトを使う（A/B 用）
//   --ab-base     technique_ab.js --from-scenes の土台にする（場違いの型を選ばせない）
//   ※先に pebble build が必要
var https = require('https'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');

function arg(name, def) {
  var i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : def;
}
function flag(name) { return process.argv.indexOf('--' + name) > 0; }

var DRY  = flag('dry');
var N    = parseInt(arg('n', DRY ? 10 : 2), 10);
var ONLY = arg('scene', null);
var OUT  = path.resolve(arg('out', path.join(__dirname, 'out')));
var KEY  = DRY ? 'dummy' : fs.readFileSync(arg('key-file', ''), 'utf8').trim();
var AB_BASE = flag('ab-base');
var PROMPT_JA = arg('prompt-file', null) ? fs.readFileSync(arg('prompt-file', null), 'utf8') : '';

// 場面。日時・座標・天気を差し替える。地名だけは実際に引く（本物の地名が入る）
var SCENES = [
  { name:'冬の朝・山あいの盆地', lat:36.2381, lon:137.9720, at:'2027-01-15T08:10:00',
    w:{ code:0, t:-3.2, feel:-6.4, hum:62, wind:1.5, rain:0, cloud:6,
        dcode:0, tmax:5, tmin:-6, pop:0, sum:0, hr:[0,0,0,0] } },
  { name:'冬の雪・雪国', lat:37.1305, lon:138.7556, at:'2027-02-10T15:20:00',
    w:{ code:73, t:-0.5, feel:-4.0, hum:92, wind:3.1, rain:0.8, cloud:100,
        dcode:75, tmax:1, tmin:-4, pop:100, sum:24, hr:[0.9,1.1,0.7,0.8] } },
  { name:'春の霞む朝・甲府盆地', lat:35.6642, lon:138.5684, at:'2027-04-05T10:05:00',
    w:{ code:45, t:16.8, feel:16.0, hum:88, wind:1.2, rain:0, cloud:80,
        dcode:3, tmax:22, tmin:9, pop:10, sum:0, hr:[0,0,0,0] } },
  { name:'夏の夕立・海べり', lat:35.3093, lon:139.5500, at:'2027-07-25T16:40:00',
    w:{ code:95, t:27.8, feel:32.1, hum:78, wind:7.2, rain:8.4, cloud:96,
        dcode:95, tmax:33, tmin:25, pop:80, sum:18, hr:[0.2,3.1,9.0,8.4] } },
  { name:'秋の月夜・高原', lat:36.1461, lon:137.2522, at:'2027-09-15T20:15:00',
    w:{ code:0, t:11.4, feel:10.2, hum:70, wind:0.8, rain:0, cloud:4,
        dcode:0, tmax:23, tmin:10, pop:0, sum:0, hr:[0,0,0,0] } },
  // 何も起きていない日。強い事象が無いと候補から選ぶので、秋の日・春の暮のような
  // 輪郭の薄い語に逃げるかどうかが出やすい
  { name:'秋の晴れた昼・城下町', lat:35.9251, lon:139.4858, at:'2027-10-20T14:30:00',
    w:{ code:1, t:19.2, feel:18.6, hum:55, wind:2.0, rain:0, cloud:15,
        dcode:1, tmax:21, tmin:11, pop:0, sum:0, hr:[0,0,0,0] } },
  { name:'春の穏やかな夕・古都', lat:34.6851, lon:135.8048, at:'2027-04-20T18:15:00',
    w:{ code:2, t:17.5, feel:17.0, hum:60, wind:1.4, rain:0, cloud:40,
        dcode:2, tmax:22, tmin:10, pop:0, sum:0, hr:[0,0,0,0] } },
  // 蒸し暑い宵。体感の語（ぬるい暖かさ・湿って重い）がそのまま句に写るかを見る
  { name:'初秋の蒸す宵・街なか', lat:35.6895, lon:139.6917, at:'2027-09-08T19:30:00',
    w:{ code:3, t:24.6, feel:27.2, hum:88, wind:0.7, rain:0, cloud:90,
        dcode:3, tmax:29, tmin:23, pop:20, sum:0, hr:[0,0,0,0] } }
];

var store = {}, handlers = {}, sent = [], prompts = [], manifest = [];
global.localStorage = {
  getItem:function(k){ return store.hasOwnProperty(k) ? store[k] : null; },
  setItem:function(k,v){ store[k] = String(v); }, removeItem:function(k){ delete store[k]; }
};
global.Pebble = { platform:'pypkjs', addEventListener:function(n,f){ handlers[n]=f; },
  sendAppMessage:function(m,ok){ sent.push(m); if (ok) ok(); }, openURL:function(){},
  getActiveWatchInfo:function(){ return { platform:'basalt' }; },
  getAccountToken:function(){ return ''; }, getWatchToken:function(){ return ''; } };

var scene = SCENES[0];
function payload(w) {
  return JSON.stringify({
    current:{ temperature_2m:w.t, apparent_temperature:w.feel, relative_humidity_2m:w.hum,
              wind_speed_10m:w.wind, precipitation:w.rain, cloud_cover:w.cloud, weather_code:w.code },
    daily:{ weather_code:[w.dcode], temperature_2m_max:[w.tmax], temperature_2m_min:[w.tmin],
            precipitation_probability_max:[w.pop], precipitation_sum:[w.sum] },
    hourly:{ time:['t-3','t-2','t-1','t0'], weather_code:[w.code,w.code,w.code,w.code],
             precipitation:w.hr, temperature_2m:[w.t,w.t,w.t,w.t],
             wind_speed_10m:[w.wind,w.wind,w.wind,w.wind], cloud_cover:[w.cloud,w.cloud,w.cloud,w.cloud] }
  });
}

function XHR(){ this.headers = {}; }
XHR.prototype.open = function(m,u){ this.method=m; this.url=u; };
XHR.prototype.setRequestHeader = function(k,v){ this.headers[k]=v; };
XHR.prototype.send = function(body) {
  var self = this;
  if (this.url.indexOf('open-meteo') >= 0) {
    var p = payload(scene.w);
    setTimeout(function(){ self.status=200; self.readyState=4; self.responseText=p; self.onreadystatechange(); }, 0);
    return;
  }
  if (body) prompts.push(JSON.parse(body));
  if (DRY && body) {
    // 送らずに、作り話の応答を返して次へ進める（アプリ側の inflight を解く）
    var fake = JSON.stringify({ candidates:[{ content:{ parts:[{ text:'仮の句\nしばらく待てば\n消える句' }] } }] });
    setTimeout(function(){ self.status=200; self.readyState=4; self.responseText=fake; self.onreadystatechange(); }, 0);
    return;
  }
  var u = require('url').parse(this.url);
  var req = https.request({ host:u.host, path:u.path, method:this.method, headers:this.headers }, function(res){
    var buf = '';
    res.on('data', function(d){ buf += d; });
    res.on('end', function(){ self.status=res.statusCode; self.readyState=4; self.responseText=buf; self.onreadystatechange(); });
  });
  req.on('error', function(e){ console.log('net error: ' + e.message); if (self.onerror) self.onerror(); });
  req.end(body || null);
};
global.XMLHttpRequest = XHR;
Object.defineProperty(globalThis, 'navigator', { configurable:true, value:{ geolocation:{
  getCurrentPosition:function(ok){ ok({ coords:{ latitude:scene.lat, longitude:scene.lon } }); } } } });

// 日時を場面に合わせて止める
var RealDate = Date;
function setNow(iso) {
  var base = new RealDate(iso).getTime();
  function D(a,b,c,d,e,f) {
    if (arguments.length === 0) return new RealDate(base);
    if (arguments.length === 1) return new RealDate(a);
    return new RealDate(a,b,c,d||0,e||0,f||0);
  }
  D.prototype = RealDate.prototype;
  D.now = function(){ return base; };
  D.UTC = RealDate.UTC; D.parse = RealDate.parse;
  global.Date = D;
}

store['clay-settings'] = JSON.stringify({ CFG_PROVIDER:'gemini', CFG_GEMINI_KEY:KEY, CFG_LANG:'ja',
  CFG_WEATHER:true, CFG_PLACE:true, CFG_STEPS:true, CFG_EFFORT:'low', CFG_PROMPT_JA:PROMPT_JA });
require(path.join(ROOT, 'build', 'pebble-js-app.js'));

function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

(async function() {
  if (DRY) fs.mkdirSync(path.join(OUT, 'prompts'), { recursive: true });
  await wait(300);
  for (var s = 0; s < SCENES.length; s++) {
    if (ONLY && String(ONLY).split(',').indexOf(String(s + 1)) < 0) continue;
    scene = SCENES[s];
    setNow(scene.at);
    delete store['cached-location']; delete store['haiku-history']; delete store['last-steps'];
    console.log('\n######## ' + scene.name + ' ########');
    for (var i = 0; i < N; i++) {
      delete store['haiku-cache'];
      // A/B の土台にするときは場違いを選ばせない（季語の候補が動物・植物に絞られ、全案に効いてしまう）
      if (AB_BASE) store['focus-history'] = JSON.stringify(['misplaced']);
      sent.length = 0; prompts.length = 0;
      handlers.appmessage({ payload:{ REQUEST_HAIKU:1, STEPS:3200 } });
      for (var t = 0; t < 60 && !sent.length; t++) await wait(700);
      var p = prompts.length ? prompts[0].contents[0].parts[0].text : '';
      var tech = (/【技法】([^。\n]+?)――/.exec(p) || /TECHNIQUE: ([^:;.\n]+)/.exec(p) || ['',''])[1];
      var kigo = (/候補[^：\n]*：([^\n]*)/.exec(p) || ['',''])[1];
      if (i === 0) {
        console.log('状況: ' + p.split('\n').slice(0, 2).join('\n      '));
        console.log('候補: ' + kigo);
      }
      if (DRY) {
        var name = 'scene' + (s + 1) + '_' + (i + 1) + '.txt';
        fs.writeFileSync(path.join(OUT, 'prompts', name), p);
        manifest.push({ file:name, scene:scene.name, technique:tech, kigo:kigo });
      } else {
        console.log('句  : ' + (sent.length
          ? [sent[0].HAIKU_L1, sent[0].HAIKU_L2, sent[0].HAIKU_L3].join(' / ') : '(応答なし)')
          + '   〔' + tech + '〕');
      }
    }
  }
  if (DRY) {
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
    console.log('\nプロンプト ' + manifest.length + ' 本を ' + path.join(OUT, 'prompts') + ' に書き出しました');
    console.log('haiku-poet サブエージェントに詠ませ、結果を ' + OUT + '/scene<N>.json に置いてください');
  }
  process.exit(0);
})();
