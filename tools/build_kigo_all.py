#!/usr/bin/env python3
# data/kigosai_all.txt（きごさい歳時記の季語一覧を貼ったもの）から
# src/pkjs/kigo_all.js（季重なりの照合に使う全季語）と
# data/kigosai_all.tsv（語・季節・時期・分類の一覧。kigo.js に足す語を選ぶときに使う）を作る。
#   python3 tools/build_kigo_all.py
import re, os, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'kigosai_all.txt')

SEASON = {'春': 's', '夏': 'u', '秋': 'a', '冬': 'w'}
# 一覧の側の綴じ損ない（空白が抜けて二語がつながったもの、途中で切れたもの）
FIX = {
    '梅雨の月梅雨の星': ['梅雨の月', '梅雨の星'],
    '泥鰌掘るどてら': ['泥鰌掘る', 'どてら'],
    '義朝忌臘八会': ['義朝忌', '臘八会'],
    '宝鐸草の': ['宝鐸草の花'],
}

def forms(tok):
    """見出しと、括弧の読みで置き換えた別表記を返す（鵲(かささぎ)の巣 → 鵲の巣 / かささぎの巣）"""
    tok = tok.replace('（', '(').replace('）', ')')
    main = re.sub(r'\([^)]*\)', '', tok)
    alts = []
    if '(' in tok:
        alt = re.sub(r'[一-龥々〆ヶ]+\(([^)]*)\)', r'\1', tok)
        alt = re.sub(r'\([^)]*\)', '', alt)
        if alt != main:
            alts.append(alt)
    return main, alts

rows = []      # (語, 季節, 時期, 分類, 別表記)
season = period = cat = None
for line in open(SRC, encoding='utf-8'):
    line = line.strip().replace('topへ', '').strip()
    if not line:
        continue
    m = re.match(r'^([春夏秋冬])の季語', line)
    if m:
        season = SEASON[m.group(1)]; continue
    if line.startswith('暮・新年の季語'):
        continue
    if line.startswith('暮の季語'):
        season, period = 'y', '暮'; continue
    if line.startswith('新年の季語'):
        season, period = 'n', '新年'; continue
    m = re.match(r'^(三春|初春|仲春|晩春|三夏|初夏|仲夏|晩夏|三秋|初秋|仲秋|晩秋|三冬|初冬|仲冬|晩冬)\(', line)
    if m:
        period = m.group(1); continue
    m = re.match(r'^【(.+)】$', line)
    if m:
        cat = m.group(1); continue
    for tok in re.split(r'[\s　]+', line):
        if not tok:
            continue
        for t in FIX.get(tok, [tok]):
            main, alts = forms(t)
            rows.append((main, season, period, cat, alts))

with open(os.path.join(ROOT, 'data', 'kigosai_all.tsv'), 'w', encoding='utf-8') as f:
    for r in rows:
        f.write('\t'.join([r[0], r[1], r[2], r[3], ','.join(r[4])]) + '\n')

# 照合用。季節ごとに「語|別表記」を空白で並べる（同じ語が二季にあれば両方に置く）
by = {}
seen = set()
for w, s, p, c, alts in rows:
    key = (w, s)
    if key in seen:
        continue
    seen.add(key)
    by.setdefault(s, []).append('|'.join([w] + alts))

out = ['// tools/build_kigo_all.py が data/kigosai_all.txt から作る。手で直さない。',
       '// きごさい歳時記（https://kigosai.sub.jp/）の季語一覧。季重なりの照合にだけ使う。',
       '// 季節ごとに「語|別表記」を空白区切りで並べる。s=春 u=夏 a=秋 w=冬 y=暮 n=新年',
       '',
       'module.exports = {']
keys = [k for k in ['s', 'u', 'a', 'w', 'y', 'n'] if k in by]
for i, k in enumerate(keys):
    out.append('  %s: %s%s' % (k, json.dumps(' '.join(by[k]), ensure_ascii=False), ',' if i < len(keys) - 1 else ''))
out.append('};')
open(os.path.join(ROOT, 'src', 'pkjs', 'kigo_all.js'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('%d rows, %d unique words' % (len(rows), len(set(r[0] for r in rows))))
