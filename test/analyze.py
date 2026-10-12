# -*- coding: utf-8 -*-
"""詠ませた句を集計する。
   node test/scenes.js --dry --n 10  でプロンプトを書き出し、
   haiku-poet サブエージェントに詠ませて out/scene<N>.json を置いてから

     python3 test/analyze.py [--out <dir>]

   季語が入っているか、候補から選んだか、季重なり、季節のまたがり、
   季節の＋名詞（秋の日など）、本意の写り込み、体感の語（ぬるい・重い など）の写り込み、
   7文字超、切れ字の重複を数える。
"""
import json, io, re, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
if '--out' in sys.argv:
    OUT = os.path.abspath(sys.argv[sys.argv.index('--out') + 1])

KJ = io.open(os.path.join(HERE, '..', 'src', 'pkjs', 'kigo.js'), encoding='utf-8').read()
ROWS = [r.split('|') for r in re.findall(r"^\s*'([^']+)',", KJ, re.M) if r.count('|') == 7]
for r in ROWS:                                     # 紅葉:もみじ のように読みを持つ行は語だけを見出しにする
    r[0] = r[0].split(':')[0]
SEASON = {'s': '春', 'u': '夏', 'a': '秋', 'w': '冬', 'n': '新年', 'y': '暮'}
TABLE = {r[0]: r for r in ROWS}
WORDS = sorted(TABLE, key=len, reverse=True)      # 長い語から見る（秋の水 を 秋 で拾わない）

# 仮名で書かれた季語と表の見出しの対応。kigo.js の ALIAS を読む
# （直近の句の季語を候補から外す照合と共用。足すときは kigo.js 側に）
ALIAS = dict(re.findall(r"'([ぁ-ん]+)':\s*'([^']+)'",
                        re.search(r'var ALIAS = \{(.*?)\};', KJ, re.S).group(1)))
KANA = re.compile(r'[ぁ-んァ-ヶー]')

def skeleton(t):
    return KANA.sub('', t)

def kigo_in(h):
    """句に入っている表の季語。漢字だけを比べる照合と仮名の別表記も見る"""
    found, rest, sk = [], h, skeleton(h)
    for w in WORDS:
        if w in rest:
            found.append(w)
            rest = rest.replace(w, '　' * len(w))
    for kana, w in ALIAS.items():
        if kana in h and w not in found and w in TABLE:
            found.append(w)
    for w in WORDS:                                # 落葉/落ち葉、山笑ふ/山笑う
        s = skeleton(w)
        if any(s in skeleton(f) for f in found): continue  # 春の日 の中の 春日 は数えない
        if len(s) >= 2 and s in sk and w not in found:
            found.append(w)
    return found

def common(a, b, n=2):
    out = set()
    for i in range(len(a)):
        for j in range(i + n, len(a) + 1):
            if a[i:j] in b: out.add(a[i:j])
    return {x for x in out if not any(x != y and x in y for y in out)}

# 助詞や活用でたまたま重なるだけのものは写り込みに数えない
NOISE = re.compile(r'^[ぁ-んー]{2,3}$')
SEASON_NOUN = re.compile(r'^[春夏秋冬]の')
# 「肌に感じるのは」の文（weather.js の feel）に出る語の語幹。句にそのまま写ると
# ぬるき・重き のような説明になる。言い換えの 蒸す も同じ引きずられ方なので数える
FEEL = re.compile(r'ぬる|重|湿|蒸|汗ば|茹だ|肌寒|底冷|凍て|身を切|乾|吹きつけ')

manifest = {m['file']: m for m in json.load(io.open(os.path.join(OUT, 'manifest.json'), encoding='utf-8'))}
rows = []
for name in sorted(os.listdir(OUT)):
    if not re.match(r'scene\d+\.json$', name): continue
    for r in json.load(io.open(os.path.join(OUT, name), encoding='utf-8')):
        m = manifest.get(r['file'], {})
        lines = r['lines']; h = ''.join(lines)
        cands = [w.split('（')[0] for w in m.get('kigo', '').split('、')]
        gl = [x for x in re.findall(r'（([^）]*)）', m.get('kigo', '')) if '拍・中七' not in x]
        used = kigo_in(h)
        leak = set()
        for g in gl:
            for c in common(g, h):
                if any(c in w for w in used) or NOISE.match(c): continue
                leak.add(c + '←' + g)
        rows.append({
            'scene': m.get('scene', '?'), 'lines': lines, 'technique': m.get('technique', ''),
            'kigo': used, 'from_cand': [w for w in used if w in cands],
            'seasons': sorted({SEASON[TABLE[w][2]] for w in used}), 'leak': sorted(leak),
            # 秋の日・春の暮のような輪郭の薄い語。どんな景にも付くので逃げに使われやすい
            'bare': [w for w in used if SEASON_NOUN.match(w)],
            'feel': FEEL.findall(h),
            'over7': [l for l in lines if len(l) > 7],
            'double_cut': ('や' in ''.join(lines[:2])) and (lines[2].endswith('かな') or lines[2].endswith('けり')),
        })

if not rows:
    print('句が見つかりません。' + OUT + '/scene<N>.json を置いてから実行してください')
    raise SystemExit(1)

by = collections.OrderedDict()
for r in rows: by.setdefault(r['scene'], []).append(r)
print('総数 {} 句\n'.format(len(rows)))
for scene, g in by.items():
    n = len(g)
    print('■ {} （{}句）'.format(scene, n))
    for label, f in [('季語あり', lambda r: r['kigo']), ('候補から', lambda r: r['from_cand']),
                     ('季語2語以上', lambda r: len(r['kigo']) > 1),
                     ('季節またぎ', lambda r: len(r['seasons']) > 1),
                     ('季節の＋名詞', lambda r: r['bare']),
                     ('本意の写り込み', lambda r: r['leak']), ('体感の語', lambda r: r['feel']),
                     ('7文字超', lambda r: r['over7']), ('切れ字の重複', lambda r: r['double_cut'])]:
        c = sum(1 for r in g if f(r))
        detail = lambda r: r['feel'] if label == '体感の語' else (r['kigo'] or r['leak'] or r['over7'])
        print('  {:<14}{:>3}/{}'.format(label, c, n) + ('  ' + str([(''.join(r['lines']), detail(r)) for r in g if f(r)]) if c and label not in ('季語あり', '候補から') else ''))
    for r in g:
        print('    {} 〔{}〕 季語:{}'.format(' / '.join(r['lines']), r['technique'][:14], '・'.join(r['kigo']) or 'なし'))
    print()

n = len(rows)
print('=== 全体 ===')
for label, f in [('季語あり', lambda r: r['kigo']), ('候補から選んだ', lambda r: r['from_cand']),
                 ('季語2語以上', lambda r: len(r['kigo']) > 1), ('季節またぎ', lambda r: len(r['seasons']) > 1),
                 ('季節の＋名詞', lambda r: r['bare']), ('本意の写り込み', lambda r: r['leak']),
                 ('体感の語', lambda r: r['feel']), ('7文字超', lambda r: r['over7']),
                 ('切れ字の重複', lambda r: r['double_cut'])]:
    c = sum(1 for r in rows if f(r))
    print('  {:<16}{:>3}/{}  ({:.0%})'.format(label, c, n, c / n))
c = collections.Counter(w for r in rows for w in r['kigo'])
print('\n使われた季語 {} 種: '.format(len(c)) + '、'.join('{}({})'.format(w, k) for w, k in c.most_common()))
kanji = collections.Counter(ch for r in rows for ch in ''.join(r['lines']) if '一' <= ch <= '鿿')
print('\n句に出た漢字（常用外の確認用）: ' + '、'.join(ch for ch, _ in kanji.most_common()))
