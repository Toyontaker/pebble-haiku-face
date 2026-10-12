# アイコンを描く（採用は案B: 生成り地に行書の「句」と落款「俳」）。リポジトリの根で python3 tools/make_icon.py <出力先>
# B_144/B_80 は store/icon_144.png・icon_80.png、B_25 は resources/images/menu_icon.png に置いている
import sys, os
from PIL import Image, ImageDraw, ImageFont
OUT = sys.argv[1]; F = 'resources/fonts/'   # リポジトリの根から実行する
NAVY, BROWN, DARK, PAPER, INK, RED = (0,30,70), (150,85,75), (90,45,40), (255,255,255), (20,20,20), (200,40,40)

def card_scene(n=144):   # 案A: 文字盤そのまま（紺地・枠つき色紙・筆）
    im = Image.new('RGB', (n, n), NAVY); d = ImageDraw.Draw(im); u = n / 48
    d.rectangle([17*u, 7*u, 44*u, 43*u], fill=(0,0,0))           # 影
    d.rectangle([15*u, 5*u, 42*u, 41*u], fill=BROWN)
    d.rectangle([17*u, 7*u, 40*u, 39*u], fill=PAPER)
    f = ImageFont.truetype(F + 'brush-kaisho.ttf', int(9*u))
    for i, (col, txt) in enumerate([(33, '句'), (25, '季')]):
        d.text((col*u, (11 + i*8)*u), txt, font=f, fill=INK, anchor='mt')
    d.rounded_rectangle([5*u, 4*u, 9*u, 33*u], radius=2*u, fill=BROWN)  # 筆の軸
    d.rectangle([5*u, 33*u, 9*u, 36*u], fill=(170,170,170))
    d.polygon([(5*u, 36*u), (9*u, 36*u), (7*u, 44*u)], fill=INK)
    return im

def glyph(n, ch, bg, fg, font, seal):   # 案B・C: 筆文字一字
    im = Image.new('RGB', (n, n), bg); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(F + font, int(n * 0.78))
    d.text((n*0.47, n*0.5), ch, font=f, fill=fg, anchor='mm')
    if seal:
        s = n * 0.2; x, y = n*0.74, n*0.72
        d.rectangle([x, y, x+s, y+s], fill=RED)
        d.text((x+s/2, y+s/2), '俳', font=ImageFont.truetype(F + 'brush-kaisho.ttf', int(s*0.8)), fill=PAPER, anchor='mm')
    return im

big = {
  'A': card_scene(144),
  'B': glyph(144, '句', (245,240,225), INK, 'brush-gyosho.ttf', True),
  'C': glyph(144, '句', NAVY, PAPER, 'brush-bold.ttf', False),
}
sheet = Image.new("RGB", (3*190+10, 270), (40,40,40)); d = ImageDraw.Draw(sheet)
for i, (k, im) in enumerate(big.items()):
    x = 10 + i*190
    sheet.paste(im, (x, 30)); d.text((x, 8), '案' + k, font=ImageFont.truetype(F+'brush-kaisho.ttf', 18), fill=(255,255,255))
    for j, n in enumerate([80, 25]):
        sm = im.resize((n, n), Image.LANCZOS); sm.save(f'{OUT}/{k}_{n}.png')
        sheet.paste(sm, (x + j*90, 180))
    im.save(f'{OUT}/{k}_144.png')
sheet.save(f'{OUT}/sheet.png')
