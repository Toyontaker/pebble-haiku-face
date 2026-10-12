// 技法ごとの出来を見る。scenes.js --dry --ab-base の場面ごとのプロンプト（各場面の1本目）を土台に、
// 【技法】だけを差し替えて技法ごとに8場面分のプロンプトを作る。詠むのも審査もサブエージェントで行う。
//
//   node test/technique_sweep.js --export test/out/sweep [--only scale,color]
//     → <dir>/<key>/n1.txt … が詠み手への割り当て。詠み手は <dir>/<key>/gen.json に [{"file","lines"}] を書く
//   node test/technique_sweep.js --judge-tasks test/out/sweep [--only …]
//     → <dir>/<key>/judge.txt。審査役は <dir>/<key>/judge.json に {"judge":[…]} を書く
//   node test/technique_sweep.js --report test/out/sweep
//     → 技法ごとの出来と技法の実現度。基準（出来の平均3以上・技法がすべて2）に届かない技法に印を付ける

var fs = require('fs');
var path = require('path');
var technique = require('../src/pkjs/technique');
var kire = require('../src/pkjs/kire');
var kigo = require('../src/pkjs/kigo');

function arg(name, def) {
  var i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && process.argv[i + 1].indexOf('--') !== 0 ? process.argv[i + 1] : def;
}

var BASES = arg('from-scenes', path.join(__dirname, 'out/scn/prompts'));
var ONLY = arg('only', null);
// 1技法あたりの場面数。型×レンズで技法が多いので、場面をずらしながら少数ずつ割り当てる
var PER = Number(arg('per', '0')) || 0;

function selected() {
  if (!ONLY) return technique.all;
  var keys = ONLY.split(',');
  return technique.all.filter(function(t) { return keys.indexOf(t.key) >= 0; });
}

function bases() {
  return fs.readdirSync(BASES).filter(function(f) { return /_1\.txt$/.test(f); }).sort()
    .map(function(f) { return fs.readFileSync(path.join(BASES, f), 'utf8'); });
}

function exportPrompts(dir) {
  var bs = bases();
  var jiko = kigo.table().filter(function(r) { return r.cat === '時候'; }).map(function(r) { return r.w; });
  var tenmon = kigo.table().filter(function(r) { return r.cat === '天文'; }).map(function(r) { return r.w; });
  selected().forEach(function(t, ti) {
    var d = path.join(dir, t.key);
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
    var use = PER ? Array.apply(null, Array(PER)).map(function(_, k) { return bs[(ti * PER + k) % bs.length]; }) : bs;
    use.forEach(function(b, i) {
      var line = '【技法】' + technique.render(t).ja + '。技法名の語は句に出さない。';
      var text = b.replace(/【技法】[^\n]*/, line);
      // 本番と同じく、時候（と水平パンの異景では天文）を季語の候補から外す
      var out = (t.noJiko ? jiko : []).concat(t.noTenmon ? tenmon : []);
      if (out.length) {
        text = text.replace(/(候補[^：\n]*：)([^\n]*)/, function(m, head, list) {
          return head + list.split('、').filter(function(x) { return out.indexOf(x.replace(/（.*$/, '')) < 0; }).join('、');
        });
      }
      // 本番と同じく、技法と噛み合わない切れの型（avoidKire）は別の型に差し替える
      if (t.avoidKire) {
        var cur = kire.all.filter(function(k) { return text.indexOf('【切れ】' + k.ja) >= 0; })[0];
        if (cur && t.avoidKire.indexOf(cur.key) >= 0) {
          var ok = kire.all.filter(function(k) { return t.avoidKire.indexOf(k.key) < 0; });
          text = text.replace('【切れ】' + cur.ja, '【切れ】' + ok[i % ok.length].ja);
        }
      }
      fs.writeFileSync(path.join(d, 'n' + (i + 1) + '.txt'), text);
    });
    fs.writeFileSync(path.join(d, 'technique.txt'), t.ja + '\n');
  });
  console.log(selected().length + ' 技法 × ' + (PER || bs.length) + ' 場面を ' + dir + ' に書き出しました');
}

var JUDGE_HEAD =
  'あなたは俳句の選者です。以下の各句を独立に評価し、結果を一つの JSON ファイルに {"judge":[{"file":"nN.txt",…}]} の形で書くこと。\n' +
  '各句の項目: yomi(上中下の平仮名の読み3要素), kigo, kigo_count, ' +
  'technique(0〜2: 指定の手法が実現できていれば2、部分的なら1、できていなければ0), technique_reason(20字以内), ' +
  'quality(1〜5: 俳句としての出来。像が立ち、説明に堕ちず、余情があるほど高い), quality_reason(30字以内), ' +
  'faults(説明的/季重なり/動詞過多/類想/破調/像が弱い/技法が飾り などから)。\n\n';

function judgeTasks(dir) {
  selected().forEach(function(t) {
    var d = path.join(dir, t.key);
    var gen = JSON.parse(fs.readFileSync(path.join(d, 'gen.json'), 'utf8'));
    var body = gen.map(function(r) {
      var p = fs.readFileSync(path.join(d, r.file), 'utf8');
      // 例を入れ替える技法は、その句に実際に渡した文で審査する
      var used = (/【技法】(.+?)。技法名の語は句に出さない。/.exec(p) || [, t.ja])[1];
      return '── 句 ' + r.file + ' ──\n俳句:\n' + r.lines.join('\n') + '\n\n詠まれた状況:\n' +
             p.slice(0, p.indexOf('【作句】')).trim() + '\n\n指定されていた手法: 技法「' + used + '」\n';
    }).join('\n');
    fs.writeFileSync(path.join(d, 'judge.txt'), JUDGE_HEAD + body);
  });
  console.log(selected().length + ' 技法の審査の依頼を書き出しました');
}

function report(dir) {
  var ok = 0, total = 0;
  technique.all.forEach(function(t) {
    var d = path.join(dir, t.key);
    if (!fs.existsSync(path.join(d, 'judge.json'))) return;
    total++;
    var gen = JSON.parse(fs.readFileSync(path.join(d, 'gen.json'), 'utf8'));
    var by = {};
    JSON.parse(fs.readFileSync(path.join(d, 'judge.json'), 'utf8')).judge.forEach(function(j) { by[j.file] = j; });
    var qs = [], ts = [];
    gen.forEach(function(r) { var j = by[r.file] || {}; qs.push(j.quality); ts.push(j.technique); });
    var q = qs.reduce(function(a, b) { return a + b; }, 0) / qs.length;
    var tq = ts.reduce(function(a, b) { return a + b; }, 0) / ts.length;
    var pass = q >= 3 && tq >= 2;
    if (pass) ok++;
    console.log((pass ? '  ' : '✗ ') + t.key + '  出来 ' + q.toFixed(2) + '  技法 ' + tq.toFixed(2) + '  ' + t.ja.split('――')[0]);
    gen.forEach(function(r) {
      var j = by[r.file] || {};
      if (j.technique < 2 || j.quality < 3) {
        console.log('      ' + r.file + ' ' + r.lines.join('／') + '  出来' + j.quality + ' 技法' + j.technique +
                    '  ' + (j.technique_reason || '') + ' / ' + (j.quality_reason || ''));
      }
    });
  });
  console.log('\n基準を満たした技法: ' + ok + ' / ' + total);
}

if (arg('export', null)) exportPrompts(arg('export'));
else if (arg('judge-tasks', null)) judgeTasks(arg('judge-tasks'));
else if (arg('report', null)) report(arg('report'));
else console.log('--export / --judge-tasks / --report <dir> のどれかを付けてください');
