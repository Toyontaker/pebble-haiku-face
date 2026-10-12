// 技法の渡し方を比べる実験。
//
//   A 旧方式       : 旧15種（省略4種・音の反復を含む）から一つを【技法】で指定。省略の常時指定なし
//   D 構成のみ     : 構成10種から一つを指定し、省略は【作句】で常に守らせる
//   N 構成16種     : 今の technique.js（一物仕立て・見立て・影と映りなどを足し、光と色の温度を分けたもの）
//
// A と D の差で「省略を選択肢から外し常時にした」効果、D と N の差で「構成を足した」効果を見る。
// （2026年10月の比較で、着眼を別の節で足す案 E は D と差が出ず、着眼×構成の型 P は D を下回ったので外した）
// 状況（日時・天気・地名・季語候補）は一度だけ実物の経路で組み立てて固定し、
// 技法の節と省略の一行だけを差し替える。--variants D,P のように案を絞れる。
//
//   node test/technique_ab.js --dry-run              プロンプト3案を表示（通信なし）
//   node test/technique_ab.js --n 12 --key-file ~/k  実験して結果を保存
//   node test/technique_ab.js --analyze <results.json>  保存済みの結果を再集計
//
// API を呼ばずにサブエージェントで詠ませ・審査させるとき（3段階）:
//   node test/technique_ab.js --export <dir> --n 12   プロンプトを伏せた名前で書き出す（poet_*.txt が詠み手ごとの割り当て）
//     --from-scenes test/out/scn/prompts を足すと、scenes.js --dry --ab-base の場面ごとのプロンプトを土台にする
//     → 詠み手が <dir>/gen_<k>.json に [{"file","lines"}] を書く
//   node test/technique_ab.js --judge-tasks <dir>     句を集めて審査の依頼文 judge_<k>.txt を書き出す
//     → 審査役が <dir>/judge_<k>.json に {"judge":[...],"rank":[...]} を書く
//   node test/technique_ab.js --import <dir>          取り込んで集計し、<dir>/results.json に保存
//
// キーは --key-file か環境変数（ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY）から読む。

var https = require('https');
var fs = require('fs');
var path = require('path');
var mora = require('../src/pkjs/mora');
var kigo = require('../src/pkjs/kigo');
var technique = require('../src/pkjs/technique');

var ROOT = path.join(__dirname, '..');


var https = require('https');
var fs = require('fs');
var path = require('path');
var mora = require('../src/pkjs/mora');
var kigo = require('../src/pkjs/kigo');

var ROOT = path.join(__dirname, '..');

// ─── 引数 ────────────────────────────────────────────────────────────────
function arg(name, def) {
  var i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && process.argv[i + 1].indexOf('--') !== 0
    ? process.argv[i + 1] : def;
}
function flag(name) { return process.argv.indexOf('--' + name) >= 0; }

var OPT = {
  n: parseInt(arg('n', '12'), 10),
  provider: arg('provider', 'claude'),
  model: arg('model', 'claude-sonnet-5'),
  judgeModel: arg('judge-model', 'claude-opus-5'),
  effort: arg('effort', 'low'),
  judgeEffort: arg('judge-effort', 'medium'),
  out: arg('out', path.join(ROOT, 'technique-ab-results.json')),
  concurrency: parseInt(arg('concurrency', '3'), 10)
};

function apiKey() {
  var f = arg('key-file', null);
  if (f) return fs.readFileSync(f.replace(/^~/, process.env.HOME), 'utf8').trim();
  var env = { claude: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };
  var k = process.env[env[OPT.provider]];
  if (!k) {
    console.error('APIキーがありません。--key-file <path> か ' + env[OPT.provider] + ' を指定してください。');
    process.exit(1);
  }
  return k.trim();
}


// ─── 技法の指定 ──────────────────────────────────────────────────────────
// 旧方式の15種（v1.5.0 の technique.js の ja をそのまま）
var OLD_TECHNIQUES = [
  { key: 'scale',       ja: '取り合わせ――極大のものと極小のものを並べ、大きさの隔たりを感じさせる' },
  { key: 'color',       ja: '取り合わせ――色の異なる二つの像を並べ、その対比を見せる' },
  { key: 'time',        ja: '取り合わせ――一瞬と永遠、今とかつてを並べ、時の隔たりを感じさせる' },
  { key: 'pan',         ja: '視線の運動――目を横へ移し、一つの像から隣の像へ渡す' },
  { key: 'zoomin',      ja: '視線の運動――全景から始め、一点へ目を寄せる' },
  { key: 'zoomout',     ja: '視線の運動――一点から始め、全景へ目を引く' },
  { key: 'sound2mind',  ja: '感覚の転換――音を心の状態として感じさせる。触覚・嗅覚を一つだけ用いてよい' },
  { key: 'seefeel',     ja: '感覚の転換――見た目と触感の食い違いを感じさせる。触覚・嗅覚を一つだけ用いてよい' },
  { key: 'lightheat',   ja: '感覚の転換――光や色に温度を感じさせる。触覚・嗅覚を一つだけ用いてよい' },
  { key: 'omit_who',    ja: '省略――誰がいるのか、誰がしたのかを言わない' },
  { key: 'omit_result', ja: '省略――その後どうなったかを言わない' },
  { key: 'omit_feel',   ja: '省略――どう感じたかを言わない' },
  { key: 'omit_why',    ja: '省略――なぜそうなったかを言わない' },
  { key: 'repeat',      ja: '音の操作――同じ音や語を繰り返して響かせる' },
  { key: 'onomat',      ja: '音の操作――その場の音だけを写す擬音を作る。既成のオノマトペは使わない' }
];

// 既定プロンプトの【作句】にある、省略を常に守らせる一行
var OMIT_LINE = '・誰がいるのか、誰がしたのかは名指さず、人は物や動作の跡で示す。その後どうなったか、どう感じたか、なぜそうなったかは言わない。';

// 構成のみの案（D）で使う10種。16種に広げる前の technique.js の構成をそのまま持つ
var STRUCTURES = [
  { key: 'scale',      ja: '取り合わせ――極大のものと極小のものを並べ、大きさの隔たりを感じさせる' },
  { key: 'color',      ja: '取り合わせ――色の異なる二つの像を並べ、その対比を見せる' },
  { key: 'time',       ja: '取り合わせ――一瞬で消えるものと長く残るものを並べ、時の隔たりを感じさせる' },
  { key: 'pan',        ja: '視線の運動――目を横へ移し、一つの像から隣の像へ渡す' },
  { key: 'zoomin',     ja: '視線の運動――全景から始め、一点へ目を寄せる' },
  { key: 'zoomout',    ja: '視線の運動――一点から始め、全景へ目を引く' },
  { key: 'sound2mind', ja: '感覚の転換――心の語は使わず、音の置き方だけで心の状態を感じさせる。触覚・嗅覚を一つだけ用いてよい' },
  { key: 'seefeel',    ja: '感覚の転換――見た目と触感の食い違いを感じさせる。触覚・嗅覚を一つだけ用いてよい' },
  { key: 'lightheat',  ja: '感覚の転換――光や色に温度を感じさせる。触覚・嗅覚を一つだけ用いてよい' },
  { key: 'onomat',     ja: '擬音――その場の物が立てる音を新たに作り、一つだけ置く。既成のオノマトペは使わない' }
];

// spec: { old, tech, cur }。block は【技法】〜【形式】の手前に入る文、desc は審査に見せる指定
var ALL_VARIANTS = [
  { id: 'A', label: '旧方式（15種・省略は選択）', omit: false,
    block: function(sp) { return '【技法】' + sp.old.ja + '。技法名の語は句に出さない。'; },
    desc: function(sp) { return '技法「' + sp.old.ja + '」'; },
    key: function(sp) { return sp.old.key; } },
  { id: 'D', label: '構成のみ＋常時省略', omit: true,
    block: function(sp) { return '【技法】' + sp.tech.ja + '。技法名の語は句に出さない。'; },
    desc: function(sp) { return '技法「' + sp.tech.ja + '」'; },
    key: function(sp) { return sp.tech.key; } },
  { id: 'N', label: '構成16種＋常時省略', omit: true,
    block: function(sp) { return '【技法】' + sp.cur.ja + '。技法名の語は句に出さない。'; },
    desc: function(sp) { return '技法「' + sp.cur.ja + '」'; },
    key: function(sp) { return sp.cur.key; } }
];
// --variants A,D,P で案を絞る（既定は全部）
var VARIANTS = (function() {
  var want = arg('variants', null);
  if (!want) return ALL_VARIANTS;
  var ids = want.split(',');
  return ALL_VARIANTS.filter(function(v) { return ids.indexOf(v.id) >= 0; });
})();

function shuffled(a) {
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// 各回の指定。旧方式は旧15種を、D は構成10種を、N は今の technique.js の構成を巡回する
function specSequence(n) {
  var olds = shuffled(OLD_TECHNIQUES), techs = shuffled(STRUCTURES), curs = shuffled(technique.all);
  var seq = [];
  for (var k = 0; k < n; k++) {
    seq.push({ old: olds[k % olds.length], tech: techs[k % techs.length], cur: curs[k % curs.length] });
  }
  return seq;
}

function specFromKeys(k) {
  function find(list, key) { return list.filter(function(t) { return t.key === key; })[0]; }
  return { old: find(OLD_TECHNIQUES, k.old), tech: find(STRUCTURES, k.tech), cur: find(technique.all, k.cur) };
}

// ─── 実物の経路で状況プロンプトを1本だけ組み立てる ───────────────────────
// build/pebble-js-app.js を Pebble 環境のモックの上で走らせ、LLM に飛ぶ本文を捕まえる。
function captureBasePrompt() {
  return new Promise(function(resolve, reject) {
    var handlers = {}, xhrs = [], store = {};

    global.localStorage = {
      getItem: function(k) { return store.hasOwnProperty(k) ? store[k] : null; },
      setItem: function(k, v) { store[k] = String(v); },
      removeItem: function(k) { delete store[k]; }
    };
    global.Pebble = {
      platform: 'pypkjs',
      addEventListener: function(name, fn) { handlers[name] = fn; },
      sendAppMessage: function(msg, ok) { if (ok) ok(); },
      openURL: function() {},
      getActiveWatchInfo: function() { return { platform: 'basalt' }; },
      getAccountToken: function() { return ''; },
      getWatchToken: function() { return ''; }
    };

    function XHR() { this.headers = {}; xhrs.push(this); }
    XHR.prototype.open = function(m, u) { this.method = m; this.url = u; };
    XHR.prototype.setRequestHeader = function(k, v) { this.headers[k] = v; };
    XHR.prototype.respond = function(status, obj) {
      this.status = status; this.readyState = 4; this.responseText = JSON.stringify(obj);
      this.onreadystatechange();
    };
    XHR.prototype.send = function(body) {
      this.body = body ? JSON.parse(body) : null;
      var self = this;
      if (this.url.indexOf('open-meteo') >= 0) {
        setTimeout(function() {
          self.respond(200, {
            // 9月7日 朝の小雨。README の例（処暑・霧雨）に近い状況
            current: { temperature_2m: 21.5, apparent_temperature: 22.0,
                       relative_humidity_2m: 91, wind_speed_10m: 6.2,
                       precipitation: 0.4, cloud_cover: 92, weather_code: 53 },
            daily: { weather_code: [63], temperature_2m_max: [23.0], temperature_2m_min: [20.0],
                     precipitation_probability_max: [96], precipitation_sum: [4.2] },
            hourly: { time: ['t-3', 't-2', 't-1', 't0'],
                      weather_code: [61, 61, 53, 53], precipitation: [1.8, 1.2, 0.6, 0.4],
                      temperature_2m: [22.0, 21.8, 21.5, 21.4],
                      wind_speed_10m: [6.0, 6.1, 6.2, 6.2],
                      cloud_cover: [95, 94, 92, 92] }
          });
        }, 0);
      } else if (this.url.indexOf('bigdatacloud') >= 0) {
        setTimeout(function() {
          self.respond(200, { principalSubdivision: '東京都', locality: '千代田区', city: '東京都' });
        }, 0);
      } else {
        // LLM へのリクエスト。本文を捕まえてここで終わり
        setTimeout(function() {
          self.respond(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'a\nb\nc' }] });
          resolve(self.body.messages[0].content);
        }, 0);
      }
    };
    global.XMLHttpRequest = XHR;

    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
      geolocation: { getCurrentPosition: function(ok) { ok({ coords: { latitude: 35.68, longitude: 139.77 } }); } }
    } });

    // 日時を固定（2026年9月7日 8時55分・処暑・朝）
    var RealDate = Date;
    var fixed = new RealDate(2026, 8, 7, 8, 55, 0).getTime();
    global.Date = class extends RealDate {
      constructor() { if (arguments.length === 0) super(fixed); else super(...arguments); }
      static now() { return fixed; }
    };

    store['clay-settings'] = JSON.stringify({
      CFG_PROVIDER: 'claude', CFG_CLAUDE_KEY: 'dummy', CFG_LANG: 'ja'
    });
    store['last-location'] = JSON.stringify({ lat: 35.68, lon: 139.77, ts: fixed });
    store['last-steps'] = JSON.stringify({ date: '2026-09-07', steps: 7321 });
    // 場違いが選ばれると季語の候補が動物・植物に絞られ、全案の状況が偏る。土台では選ばせない
    store['focus-history'] = JSON.stringify(['misplaced']);

    var bundle = path.join(ROOT, 'build/pebble-js-app.js');
    if (!fs.existsSync(bundle)) {
      reject(new Error('build/pebble-js-app.js がありません。先に pebble build を実行してください。'));
      return;
    }
    require(bundle);
    handlers.appmessage({ payload: { REQUEST_HAIKU: 1 } });
    setTimeout(function() { reject(new Error('プロンプトを捕捉できませんでした')); }, 5000);
  });
}


// 捕まえたプロンプトの【技法】〜【形式】の間を差し替え、案によっては省略の一行を外す
function buildVariant(base, v, sp) {
  var from = base.indexOf('【技法】');
  var to = base.indexOf('【形式】');
  if (from < 0 || to < 0) throw new Error('【技法】〜【形式】が見つかりません');
  var p = base.slice(0, from) + v.block(sp) + '\n\n' + base.slice(to);
  if (!v.omit) {
    if (p.indexOf(OMIT_LINE + '\n') < 0) throw new Error('省略の一行が見つかりません');
    p = p.replace(OMIT_LINE + '\n', '');
  }
  return p;
}

// ─── API 呼び出し ────────────────────────────────────────────────────────
function post(host, pathname, headers, body) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify(body);
    var req = https.request({
      host: host, path: pathname, method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json',
                               'content-length': Buffer.byteLength(data) }, headers)
    }, function(res) {
      var buf = '';
      res.on('data', function(c) { buf += c; });
      res.on('end', function() {
        var parsed = null;
        try { parsed = JSON.parse(buf); } catch (e) {}
        resolve({ status: res.statusCode, body: parsed, raw: buf });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// system + user を投げて本文を返す。429/5xx は少し待って3回まで再試行
async function ask(key, model, effort, system, user, tries) {
  tries = tries || 0;
  var res, text = '', usage = null;
  if (OPT.provider === 'openai') {
    res = await post('api.openai.com', '/v1/chat/completions',
      { authorization: 'Bearer ' + key },
      { model: model, max_completion_tokens: 4096, reasoning_effort: effort,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
    if (res.status === 200) {
      text = res.body.choices[0].message.content;
      usage = res.body.usage;
    }
  } else if (OPT.provider === 'gemini') {
    res = await post('generativelanguage.googleapis.com',
      '/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
      { 'x-goog-api-key': key },
      { system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: effort } } });
    if (res.status === 200) {
      var parts = (((res.body.candidates || [])[0] || {}).content || {}).parts || [];
      for (var i = 0; i < parts.length; i++) if (!parts[i].thought && parts[i].text) text += parts[i].text;
      usage = res.body.usageMetadata;
    }
  } else {
    res = await post('api.anthropic.com', '/v1/messages',
      { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      { model: model, max_tokens: 4096, system: system,
        messages: [{ role: 'user', content: user }], output_config: { effort: effort } });
    if (res.status === 200) {
      var content = res.body.content || [];
      for (var j = 0; j < content.length; j++) if (content[j].type === 'text') text += content[j].text;
      usage = res.body.usage;
    }
  }
  if (res.status !== 200) {
    var retryable = res.status === 429 || res.status >= 500;
    if (retryable && tries < 5) {
      await sleep(5000 * (tries + 1));   // Gemini は分あたりの上限に当たりやすい
      return ask(key, model, effort, system, user, tries + 1);
    }
    throw new Error('HTTP ' + res.status + ': ' + res.raw.slice(0, 200));
  }
  return { text: text, usage: usage };
}

// index.js の parseHaiku と同じ整形
function parseHaiku(text) {
  text = (text || '').replace(/```/g, '').replace(/^["'「『\s]+|["'」』\s]+$/g, '');
  var lines = text.split(/\r?\n|／|\/|｜|\|/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].replace(/[\*_#`]/g, '').replace(/^[\s\-・•\d\.\)]+/, '')
                    .replace(/^["'「『]+|["'」』]+$/g, '').replace(/[。、,\.\s]+$/, '').trim();
    if (l) out.push(l);
  }
  if (out.length > 3) out = out.slice(0, 3);
  return out;
}

// ─── 採点 ────────────────────────────────────────────────────────────────
var SEASON_KEY = 'a';           // 状況が1つのときは秋（処暑）に固定

// 回の季節（季語表の記号）。場面ごとの状況があればそこから読む
function seasonKeyOf(data, sample) {
  var sit = (data.situations || [])[sample] || data.situation || '';
  var m = /、(春|夏|秋|冬)。/.exec(sit);
  return m ? { 春: 's', 夏: 'u', 秋: 'a', 冬: 'w' }[m[1]] : SEASON_KEY;
}
var SEASON_NAME = { s: '春', s2: '夏', a: '秋', w: '冬', n: '新年', y: '暮' };

function tokens(lines) {
  var m = lines.join('').match(/[一-鿿々]+|[゠-ヿー]+|[぀-ゟ]+/g);
  return m || [];
}

// 句に含まれる季語を季語表から拾う（2文字以上のみ。1文字は誤検出が多い）
function kigoHits(lines) {
  var text = lines.join('');
  var hits = [];
  var rows = kigo.table();
  for (var i = 0; i < rows.length; i++) {
    var w = rows[i].w;
    if ([].concat(Array.from(w)).length < 2) continue;
    if (text.indexOf(w) >= 0) hits.push({ w: w, season: rows[i].season });
  }
  return hits;
}

function displayOk(lines) {
  if (lines.length !== 3) return false;
  for (var i = 0; i < 3; i++) if (Array.from(lines[i]).length > 7) return false;
  return true;
}


// ─── 審査（別呼び出し。案の名前は伏せる） ────────────────────────────────
var JUDGE_SYSTEM = 'あなたは俳句の選者です。求められた JSON だけを返し、他の文字は出力しません。';

function judgePrompt(lines, desc, situation) {
  return '次の俳句を評価してください。\n\n' +
    '俳句:\n' + lines.join('\n') + '\n\n' +
    '詠まれた状況（要約）:\n' + situation + '\n\n' +
    '指定されていた手法: ' + desc + '\n\n' +
    '次の JSON だけを返してください。\n' +
    '{"yomi":["上五の読み","中七の読み","下五の読み"],' +
    '"kigo":"句に含まれる季語（無ければ null）",' +
    '"kigo_season":"その季語の季節（春/夏/秋/冬/新年/無）",' +
    '"kigo_count":季語の数,' +
    '"technique":0〜2（指定の手法が実現できていれば2、部分的なら1、できていなければ0）,' +
    '"technique_reason":"20字以内の理由",' +
    '"omission":0〜2（誰が・その後どうなったか・どう感じたか・なぜを言わずに像で済ませていれば2、一部を言っていれば1、説明していれば0）,' +
    '"quality":1〜5（俳句としての出来。像が立ち、説明に堕ちず、余情があるほど高い）,' +
    '"quality_reason":"20字以内の理由",' +
    '"faults":["説明的","季重なり","動詞過多","類想","破調","像が弱い" などから当てはまるもの"]}\n' +
    'yomi は全て平仮名で、漢字を残さないこと。';
}

// 同じ状況で、案ごとに別の指定で詠んだ句を並べて順位をつけさせる（どの案かは伏せ、並びも毎回変える）
function rankPrompt(items, situation) {
  var body = items.map(function(it, i) {
    return (i + 1) + ')\n' + it.lines.join('\n');
  }).join('\n\n');
  return '同じ状況で詠まれた ' + items.length + ' 句です。\n\n' + body + '\n\n' +
    '状況（要約）:\n' + situation + '\n\n' +
    '次の JSON だけを返してください。\n' +
    '{"best_overall":番号（俳句として最も良い句）,' +
    '"worst_overall":番号（俳句として最も弱い句）,' +
    '"reason":"30字以内"}';
}

function parseJson(text) {
  var t = String(text).replace(/```json|```/g, '').trim();
  var s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('JSON が読めません: ' + t.slice(0, 120));
  return JSON.parse(t.slice(s, e + 1));
}


async function pool(jobs, limit) {
  var results = new Array(jobs.length);
  var next = 0;
  async function worker() {
    while (next < jobs.length) {
      var i = next++;
      results[i] = await jobs[i]();
    }
  }
  var workers = [];
  for (var w = 0; w < Math.min(limit, jobs.length); w++) workers.push(worker());
  await Promise.all(workers);
  return results;
}


// ─── 実行 ────────────────────────────────────────────────────────────────
async function run() {
  var key = apiKey();
  var base = await captureBasePrompt();
  var situation = base.slice(0, base.indexOf('【作句】')).trim();

  var seq = specSequence(OPT.n);
  console.log('指定列:');
  seq.forEach(function(sp, i) {
    console.log('  [' + i + '] A ' + sp.old.key + ' / D ' + sp.tech.key + ' / N ' + sp.cur.key);
  });
  console.log('モデル: ' + OPT.model + '（effort ' + OPT.effort + '） / 審査: ' + OPT.judgeModel);
  console.log('');

  // 生成
  var jobs = [];
  seq.forEach(function(sp, i) {
    VARIANTS.forEach(function(v) {
      jobs.push(async function() {
        var prompt = buildVariant(base, v, sp);
        var r = await ask(key, OPT.model, OPT.effort,
                          'You are a haiku poet. Reply with the haiku only.', prompt);
        var lines = parseHaiku(r.text);
        process.stdout.write('.');
        return { variant: v.id, sample: i, spec: v.key(sp), desc: v.desc(sp), lines: lines,
                 prompt_chars: prompt.length, usage: r.usage, raw: r.text };
      });
    });
  });
  var gens = await pool(jobs, OPT.concurrency);
  console.log('\n生成 ' + gens.length + ' 句');

  // 1句ずつの審査
  var judgeJobs = gens.map(function(g) {
    return async function() {
      var r = await ask(key, OPT.judgeModel, OPT.judgeEffort, JUDGE_SYSTEM,
                        judgePrompt(g.lines, g.desc, situation));
      process.stdout.write('.');
      try { return parseJson(r.text); } catch (e) { return { error: String(e) }; }
    };
  });
  var judged = await pool(judgeJobs, OPT.concurrency);
  gens.forEach(function(g, i) { g.judge = judged[i]; });
  console.log('\n審査 ' + judged.length + ' 件');

  // 同じ状況の3句を並べた順位づけ
  var rankJobs = seq.map(function(sp, i) {
    return async function() {
      var items = gens.filter(function(g) { return g.sample === i; });
      var order = shuffled(items);
      var r = await ask(key, OPT.judgeModel, OPT.judgeEffort, JUDGE_SYSTEM, rankPrompt(order, situation));
      process.stdout.write('.');
      var res;
      try { res = parseJson(r.text); } catch (e) { return { error: String(e) }; }
      return {
        sample: i,
        best_overall: (order[res.best_overall - 1] || {}).variant,
        worst_overall: (order[res.worst_overall - 1] || {}).variant,
        reason: res.reason
      };
    };
  });
  var ranks = await pool(rankJobs, OPT.concurrency);
  console.log('\n順位づけ ' + ranks.length + ' 件\n');

  var out = { opt: OPT, at: new Date().toISOString(), situation: situation,
              base_prompt: base,
              sequence: seq.map(function(sp) { return { old: sp.old.key, tech: sp.tech.key, cur: sp.cur.key }; }),
              generations: gens, ranks: ranks };
  fs.writeFileSync(OPT.out, JSON.stringify(out, null, 2));
  console.log('結果を保存: ' + OPT.out + '\n');
  report(out);
}

// ─── 集計 ────────────────────────────────────────────────────────────────
function mean(list) {
  var v = list.filter(function(x) { return typeof x === 'number'; });
  return v.length ? (v.reduce(function(a, b) { return a + b; }, 0) / v.length).toFixed(2) : '-';
}

function pad(s, n) {
  s = String(s);
  var w = 0;
  for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2000 ? 2 : 1;
  return s + ' '.repeat(Math.max(0, n - w));
}

function report(data) {
  var gens = data.generations;
  var ranks = data.ranks || [];

  function pct(a, b) { return b ? (100 * a / b).toFixed(0) + '%' : '-'; }
  function q(list) { return mean(list.map(function(x) { return (x.judge || {}).quality; })); }

  var rows = [];
  VARIANTS.forEach(function(v) {
    var g = gens.filter(function(x) { return x.variant === v.id; });
    var moraOk = 0, kigoOk = 0, kasanari = 0, offSeason = 0, dispOk = 0, rust = 0;
    g.forEach(function(x) {
      var j = x.judge || {};
      x.mora = undefined;
      if (Array.isArray(j.yomi) && j.yomi.length === 3) {
        var counts = j.yomi.map(function(y) { return mora.count(y); });
        x.mora = counts.join('-');
        if (counts[0] === 5 && counts[1] === 7 && counts[2] === 5) moraOk++;
      }
      if (j.kigo) kigoOk++;
      if (j.kigo_count >= 2) kasanari++;
      if (displayOk(x.lines)) dispOk++;
      if (x.lines.join('').indexOf('錆') >= 0) rust++;   // 構成「時」の括弧の例が句に漏れていないか
      var hits = kigoHits(x.lines);
      var sk = seasonKeyOf(data, x.sample);
      if (hits.some(function(h) { return h.season !== sk && h.season !== 'n'; })) offSeason++;
    });
    var firsts = {}, toks = {};
    g.forEach(function(x) {
      firsts[x.lines[0]] = 1;
      tokens(x.lines).forEach(function(t) { toks[t] = 1; });
    });
    rows.push({
      v: v,
      n: g.length,
      tech: mean(g.map(function(x) { return (x.judge || {}).technique; })),
      omit: mean(g.map(function(x) { return (x.judge || {}).omission; })),
      quality: q(g),
      mora: pct(moraOk, g.length),
      disp: pct(dispOk, g.length),
      kasanari: pct(kasanari, g.length),
      off: pct(offSeason, g.length),
      firsts: Object.keys(firsts).length,
      toks: Object.keys(toks).length,
      rust: rust,
      inTok: Math.round(g.reduce(function(a, x) {
        var u = x.usage || {};
        return a + (u.input_tokens || u.prompt_tokens || u.promptTokenCount || 0);
      }, 0) / (g.length || 1)),
      win: ranks.filter(function(r) { return r.best_overall === v.id; }).length,
      lose: ranks.filter(function(r) { return r.worst_overall === v.id; }).length
    });
  });

  console.log('案                            技法  省略  出来  五七五  表示  季重  他季  上五   語数  錆  入力tok  最良    最弱');
  console.log('─'.repeat(116));
  rows.forEach(function(r) {
    console.log(
      pad(r.v.id + ' ' + r.v.label, 30) +
      pad(r.tech, 6) + pad(r.omit, 6) + pad(r.quality, 6) + pad(r.mora, 8) + pad(r.disp, 6) +
      pad(r.kasanari, 6) + pad(r.off, 6) +
      pad(r.firsts + '/' + r.n, 7) + pad(r.toks, 6) + pad(r.rust, 4) + pad(r.inTok, 9) +
      pad(r.win + '/' + ranks.length, 8) + pad(r.lose + '/' + ranks.length, 8));
  });

  // 旧方式で省略が当たった回と、同じ回の D・E を並べる（省略の句が弱いという問題を直接見る）
  if (gens.some(function(x) { return x.variant === 'A'; })) {
    var a = gens.filter(function(x) { return x.variant === 'A'; });
    var omitSamples = a.filter(function(x) { return x.spec.indexOf('omit') === 0; }).map(function(x) { return x.sample; });
    function at(id) {
      return gens.filter(function(x) { return x.variant === id && omitSamples.indexOf(x.sample) >= 0; });
    }
    console.log('\n── 旧方式で省略が当たった回（' + omitSamples.length + '回）の出来 ──');
    console.log('  A ' + q(at('A')) + '  /  D ' + q(at('D')) + '  /  N ' + q(at('N')) +
                '   （A の省略以外の回: ' + q(a.filter(function(x) { return omitSamples.indexOf(x.sample) < 0; })) + '）');
  }

  // 16種に足した技法の出来（D に無いもの）
  var added = technique.all.filter(function(t) { return !STRUCTURES.some(function(x) { return x.key === t.key; }); });
  if (gens.some(function(x) { return x.variant === 'N'; })) {
    console.log('\n── N で足した技法の出来 ──');
    added.forEach(function(t) {
      var list = gens.filter(function(x) { return x.variant === 'N' && x.spec === t.key; });
      if (list.length) console.log('  ' + pad(t.ja.split('――')[0], 12) + q(list) + '（' + list.length + '句）');
    });
  }

  console.log('\n── 句 ──');
  var bySample = {};
  gens.forEach(function(g) { (bySample[g.sample] = bySample[g.sample] || []).push(g); });
  Object.keys(bySample).forEach(function(k) {
    var list = bySample[k];
    var rk = ranks.filter(function(r) { return r.sample === Number(k); })[0] || {};
    console.log('\n[' + k + ']' + (rk.best_overall ? ' 最良 ' + rk.best_overall + ' / 最弱 ' + rk.worst_overall + ' ' + (rk.reason || '') : ''));
    list.sort(function(x, y) { return x.variant < y.variant ? -1 : 1; }).forEach(function(g) {
      var j = g.judge || {};
      console.log('  ' + g.variant + ' ' + pad(g.lines.join(' / '), 34) +
                  ' 技法' + (j.technique === undefined ? '?' : j.technique) +
                  ' 省略' + (j.omission === undefined ? '?' : j.omission) +
                  ' 出来' + (j.quality === undefined ? '?' : j.quality) +
                  ' ' + (g.mora || '?') + ' 〔' + g.spec + '〕');
    });
  });
}

// ─── 入口 ────────────────────────────────────────────────────────────────
// ─── サブエージェント用の書き出し・取り込み ───────────────────────────────
var POET_BATCH = 6;     // 詠み手1人あたりのプロンプト数。案ごとにまとめ、同じ案の別の回だけを渡す
var JUDGE_BATCH = 4;    // 審査役1人あたりの回数（1回 = 3句）

function readJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

// --from-scenes <dir> を付けると、scenes.js --dry --ab-base が書き出したプロンプトを1本ずつ回の土台にする
// （場面・切れ・季語の候補が回ごとに変わる）。付けなければ固定の状況1つを全回で使う
function sceneBases(dir) {
  return fs.readdirSync(dir).filter(function(f) { return /\.txt$/.test(f); }).sort()
    .map(function(f) { return { name: f, text: fs.readFileSync(path.join(dir, f), 'utf8') }; });
}

function situationOf(base) { return base.slice(0, base.indexOf('【作句】')).trim(); }

async function exportPrompts(dir) {
  fs.mkdirSync(dir, { recursive: true });
  var from = arg('from-scenes', null);
  var bases = from ? sceneBases(from) : null;
  var single = bases ? null : await captureBasePrompt();
  var n = bases ? bases.length : OPT.n;
  function baseOf(i) { return bases ? bases[i].text : single; }
  var seq = specSequence(n);
  var items = [];
  seq.forEach(function(sp, i) {
    VARIANTS.forEach(function(v) { items.push({ variant: v.id, sample: i, spec: v.key(sp), desc: v.desc(sp), v: v, sp: sp }); });
  });
  // ファイル名からは案も回も分からないようにする
  items = shuffled(items);
  var manifest = {};
  items.forEach(function(it, k) {
    it.file = 'p' + String(k + 1).padStart(2, '0') + '.txt';
    fs.writeFileSync(path.join(dir, it.file), buildVariant(baseOf(it.sample), it.v, it.sp));
    manifest[it.file] = { variant: it.variant, sample: it.sample, spec: it.spec, desc: it.desc };
  });
  var batches = [];
  VARIANTS.forEach(function(v) {
    var mine = items.filter(function(it) { return it.variant === v.id; });
    for (var b = 0; b < mine.length; b += POET_BATCH) batches.push(mine.slice(b, b + POET_BATCH).map(function(it) { return it.file; }));
  });
  batches = shuffled(batches);
  batches.forEach(function(files, k) {
    fs.writeFileSync(path.join(dir, 'poet_' + (k + 1) + '.txt'), files.join('\n') + '\n');
  });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    opt: OPT, at: new Date().toISOString(), situation: single ? situationOf(single) : null,
    situations: seq.map(function(sp, i) { return situationOf(baseOf(i)); }),
    scenes: bases ? bases.map(function(b) { return b.name; }) : null,
    base_prompt: single,
    sequence: seq.map(function(sp) { return { old: sp.old.key, tech: sp.tech.key, cur: sp.cur.key }; }),
    files: manifest, poets: batches.length
  }, null, 1));
  console.log(items.length + ' 本のプロンプトと詠み手 ' + batches.length + ' 人分の割り当てを ' + dir + ' に書き出しました');
}

function collectGenerations(dir, man) {
  var lines = {};
  fs.readdirSync(dir).filter(function(f) { return /^gen_\d+\.json$/.test(f); }).forEach(function(f) {
    readJson(path.join(dir, f)).forEach(function(r) { lines[r.file] = r.lines; });
  });
  var gens = [];
  Object.keys(man.files).forEach(function(file) {
    var m = man.files[file];
    if (!lines[file]) { console.log('句がありません: ' + file); return; }
    gens.push({ file: file, variant: m.variant, sample: m.sample, spec: m.spec, desc: m.desc,
                lines: parseHaiku(lines[file].join('\n')), prompt_chars: fs.readFileSync(path.join(dir, file), 'utf8').length });
  });
  return gens;
}

function judgeTasks(dir) {
  var man = readJson(path.join(dir, 'manifest.json'));
  var gens = collectGenerations(dir, man);
  var samples = shuffled(Object.keys(man.sequence).map(Number));
  var n = 0;
  for (var b = 0; b < samples.length; b += JUDGE_BATCH) {
    n++;
    var body = '';
    samples.slice(b, b + JUDGE_BATCH).forEach(function(i) {
      var group = shuffled(gens.filter(function(g) { return g.sample === i; }));
      body += '════ 回 ' + i + ' ════\n';
      group.forEach(function(g, k) {
        body += '── 句 ' + g.file + '（順位づけでは ' + (k + 1) + ' 番）──\n' +
                judgePrompt(g.lines, g.desc, (man.situations || [])[i] || man.situation) + '\n\n';
      });
      body += '── 回 ' + i + ' の順位づけ ──\n' + rankPrompt(group, (man.situations || [])[i] || man.situation) + '\n\n';
    });
    var head = 'あなたは俳句の選者です。以下の各「句」について求められた JSON を作り、各「回」について順位づけの JSON を作ってください。\n' +
      '句どうしは独立に評価し、どういう条件で詠まれたかを推測しないこと。\n' +
      '結果は次の形で一つの JSON ファイルに書くこと。\n' +
      '{"judge":[{"file":"pNN.txt", …句ごとの JSON の項目…}],"rank":[{"sample":回の番号,"best_overall":番号,"worst_overall":番号,"reason":"…"}]}\n' +
      '番号は各回の中で「順位づけでは N 番」と書いた N を使う。\n\n';
    fs.writeFileSync(path.join(dir, 'judge_' + n + '.txt'), head + body);
    // 順位の番号から句を引けるよう、並びを残す
    man.rankOrder = man.rankOrder || {};
    samples.slice(b, b + JUDGE_BATCH).forEach(function(i) {
      man.rankOrder[i] = (body.match(new RegExp('════ 回 ' + i + ' ════\\n([\\s\\S]*?)── 回 ' + i + ' の順位づけ')) || ['', ''])[1]
        .match(/── 句 (p\d+\.txt)/g).map(function(x) { return x.replace(/^── 句 /, ''); });
    });
  }
  man.judges = n;
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(man, null, 1));
  console.log('句 ' + gens.length + ' 件を集め、審査の依頼 ' + n + ' 本を ' + dir + ' に書き出しました');
}

function importResults(dir) {
  var man = readJson(path.join(dir, 'manifest.json'));
  var gens = collectGenerations(dir, man);
  var byFile = {};
  gens.forEach(function(g) { byFile[g.file] = g; });
  var ranks = [];
  fs.readdirSync(dir).filter(function(f) { return /^judge_\d+\.json$/.test(f); }).forEach(function(f) {
    var j = readJson(path.join(dir, f));
    (j.judge || []).forEach(function(r) { if (byFile[r.file]) byFile[r.file].judge = r; });
    (j.rank || []).forEach(function(r) {
      var order = man.rankOrder[r.sample] || [];
      function v(n) { return (byFile[String(order[n - 1] || '').trim()] || {}).variant; }
      ranks.push({ sample: r.sample, best_overall: v(r.best_overall), worst_overall: v(r.worst_overall), reason: r.reason });
    });
  });
  var out = { opt: man.opt, at: man.at, situation: man.situation, situations: man.situations, scenes: man.scenes,
              base_prompt: man.base_prompt,
              sequence: man.sequence, generations: gens, ranks: ranks, via: 'subagents' };
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(out, null, 2));
  report(out);
}

if (flag('export')) {
  exportPrompts(arg('export', 'test/out/ab')).then(function() { process.exit(0); })
    .catch(function(e) { console.error(e); process.exit(1); });
} else if (flag('judge-tasks')) {
  judgeTasks(arg('judge-tasks', 'test/out/ab'));
} else if (flag('import')) {
  importResults(arg('import', 'test/out/ab'));
} else if (flag('analyze')) {
  var f = arg('analyze', OPT.out);
  report(JSON.parse(fs.readFileSync(f, 'utf8')));
} else if (flag('dry-run')) {
  captureBasePrompt().then(function(base) {
    var sp = specFromKeys({ old: 'omit_feel', tech: 'color', cur: 'mitate' });
    VARIANTS.forEach(function(v) {
      var p = buildVariant(base, v, sp);
      console.log('════════════════ ' + v.id + ' ' + v.label + '（' + p.length + '字）════════════════');
      console.log(p);
      console.log('');
    });
    process.exit(0);
  }).catch(function(e) { console.error(e); process.exit(1); });
} else {
  run().then(function() { process.exit(0); })
       .catch(function(e) { console.error(e); process.exit(1); });
}
