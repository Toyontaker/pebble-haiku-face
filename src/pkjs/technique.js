// 俳句の技法。「型」（季語と何を並べるか）と「レンズ」（どう撮るか）の組み合わせで一つを選ぶ。
// 省略（誰が・その後・感情・因果を言わない）は選ぶものではなく、既定プロンプトの【作句】で常に守らせる。
// 型とレンズの文を単純に足すと条件が重なって崩れるため、組み合わせごとに一つの文として書いてある（cells）。
// 句のどこに置くか（上五に〜）は指定しない。字数と語順を縛ると出来が落ちるため、置き方はモデルに任せる。
// 天気で組み合わせを絞ることもしない（光の要る技法も、灯や月など何かの光で詠める）。
//
// 型ごとに切れの型を変える（kire.js のキー）。avoidKire はその組み合わせで使わない切れ。
//   X1 一物仕立て: 季語一つを詠み切るので、句中の「や」で二つに割らない
//   X2・X3 取り合わせ: 二物の間で切るので、「かな」の詠嘆で一つにまとめない
//   「けり」は動作を言い終えるか動詞で終わるため、どの型でも使わない
// noJiko は季語の候補から時候（暖か・春昼など）を外すか。物として描けない季語では撮りようがない。
// noTenmon は天文（月・雷・雪など空と天気）も外すか。地上の物と横に並べられない水平パンの異景と、
// 一部分から全体へ引けない一物仕立てのズームアウトで使う。
// 直近で使ったレンズを避けて選び、同じ手つきが続かないようにする。

var TYPES = {
  x1: { name: '一物仕立て', enName: 'single subject',
        // 枠・光の出所・場所など、レンズがそれ無しでは成り立たない物だけは置かせる。
        // 「季語以外は置かない」と言い切ると、額縁やモーションの指定とぶつかって詠めなくなる
        note: '季語のものを主役にし、ほかに置くのはこの技法が求めるもの（枠・光の出所・場所など）だけにする。図鑑のような説明（数・名前・性質）や擬人化は入れない。その場で見えた様子として書く',
        noteEn: 'the season word\'s thing is the subject; add nothing else except what this technique needs (a frame, a light source, a place); no field-guide facts, no personification; write it as it looks right now',
        avoidKire: ['kamigo_ya', 'nakashichi_ya', 'keri'] },
  x2: { name: '同景の取り合わせ', enName: 'two things in one view',
        note: '二つの物は、同じ場所で同時に一目で見えるものにする',
        noteEn: 'the two things are in the same place, both seen at a single glance',
        avoidKire: ['kana', 'keri'] },
  x3: { name: '異景の取り合わせ', enName: 'season word and daily life',
        note: '日常の側は生活の中のありふれた物にし、二つのつながり（理由・因果・感想）は書かない。切れ字「や」を使うときは季語に付ける',
        noteEn: 'the everyday side is an ordinary thing from daily life; never state any link (reason, cause or feeling) between the two',
        avoidKire: ['kana', 'keri'] }
};

// cells の null はその型と組ませない（一物仕立てで横に並ぶ二物は置けない、など）。
// jiko はその型に限って時候の季語を使ってよい（ほかは時候を外す）
var LENSES = [
  { key: 'S1', name: 'ズームイン', enName: 'zoom in',
    common: '「見る」「寄る」「覗く」など目の動きを言う語は使わない',
    commonEn: 'no words for the eye moving (look, peer, close in)',
    ja: {
      x1: '季語の全体から始め、その細部の一点（形・色・質感のどれか）へ、語順だけで目を寄せる。細部は季語の一部に限り、ほかの物は置かない',
      x2: '季語を含む広い景から始め、同じ場所の手元にある物一つへ目を寄せる。寄せた先の物は手に収まるほど小さい物にする',
      x3: '遠くにある季語から始め、手元の日用品一つへ目を寄せる。日用品は季語と関わりのない生活の物にする' },
    en: {
      x1: 'start from the whole of the season word\'s thing and, by word order alone, close in on one detail of it (shape, colour or texture); the detail is part of that thing, nothing else',
      x2: 'start from the wide scene holding the season word and close in on one small thing at hand in the same place, small enough to hold',
      x3: 'start from the season word far away and close in on one everyday object at hand that has nothing to do with it' } },

  { key: 'S2', name: 'ズームアウト', enName: 'zoom out',
    common: '「見る」「仰ぐ」「広がる」など目の動きや広さを言う語は使わない',
    commonEn: 'no words for the eye moving or for wideness (look up, spread)',
    avoidKire: ['kamigo_ya'],   // 上五で切ると目の動きが途切れる
    noTenmon: ['x1'],           // 雪・霧など天文の季語には「一部分」が無く、全体へ引けない
    ja: {
      // 引いた先を「周りの景」にすると、その景が別の物になって一物仕立てとぶつかる。
      // 一部分から季語全体へ引けば、引いた先も季語のままで済む
      x1: '季語のものの一部分（蕊・根元・端など）から始め、そのもの全体へ目を引く。全体は季語の名で言い切り、周りの景や別の物は置かない',
      x2: '手元の物一つから始め、同じ場所に見えている大きな季語へ目を引く',
      x3: '手元の日常の動作一つから始め、遠くの季語へ目を引く。動作をする人は書かず、場所は屋内に限らない' },
    en: {
      x1: 'start from one part of the season word\'s thing (its centre, base or edge) and pull back to the whole thing, named by the season word; no surroundings and no other object',
      x2: 'start from one thing at hand and pull back to the large season word seen in the same place',
      x3: 'start from one everyday action at hand and pull back to the season word far off; do not mention who does it; it need not be indoors' } },

  { key: 'S3', name: '垂直チルト', enName: 'vertical tilt',
    common: '「上」「下」「仰ぐ」「見下ろす」など向きや目の動きを言う語は使わない',
    commonEn: 'no words for direction or the eye moving (above, below, look up, look down)',
    ja: {
      x1: '季語の高い部分と低い部分（先端と根元など）を二つに分けて置く。高さの差は季語の部位そのもので分かるようにする',
      x2: '頭上にある季語と、足元にある物一つを並べる。上下どちらから始めてもよい',
      x3: '高い位置にある生活の場の物と、地面にある季語を並べる' },
    en: {
      x1: 'set the high part and the low part of the season word\'s thing (tip and root, say) apart; let the parts themselves show the height',
      x2: 'set the season word overhead beside one thing at your feet; begin from either end',
      x3: 'set something high up in a lived-in place beside the season word on the ground' } },

  { key: 'S4', name: '水平パン', enName: 'horizontal pan',
    common: '「右」「左」「横」「隣」など方向の語や、「見る」「移る」など目の動きを言う語は使わない',
    commonEn: 'no words for direction (left, right, beside, next) or for the eye moving',
    ja: {
      x1: null,
      // 言い回し（名詞だけ・助詞一つ）は縛らない。「名詞二つだけ」とすると十七音が埋まらず、
      // かえって三つ目の名詞や修飾を足してしまう。
      // 同景では季語を並べる物の一つにしない（季語の景の中の二物）。月・雷など空の季語は地上の物と横に並ばないため。
      // 異景では季語が並ぶ物の一つなので、空と天気の季語（天文）を候補から外す（noTenmon）。順番も縛らない
      x2: '季語の景の中で、横に並ぶ二つの物を、目が片方から隣へ移る順に置く。目が横へ動いたことが、二つの物の位置から読み取れるようにする',
      x3: '季語と、その横に並ぶ日常の物一つを、目が片方から隣へ移る順に置く。どちらから始めてもよい。物は季語を含めて二つだけにする' },
    en: {
      x1: null,
      x2: 'within the season word\'s scene, place two things side by side in the order the eye moves from one to the next, so the sideways move can be read from where they stand',
      x3: 'place the season word and one everyday thing beside it in the order the eye moves from one to the other, starting from either; only these two things' },
    noTenmon: ['x3'] },

  { key: 'S5', name: '額縁・透過', enName: 'frame and veil',
    common: '「見ゆ」「覗く」など見えることを言う語は使わない',
    commonEn: 'no words for seeing (visible, peek)',
    ja: {
      x1: '季語を囲む枠か、季語を薄く隔てる膜を一つ置き、その向こうの季語を描く。枠や膜は季語の景の中にあるものに限る',
      x2: '透ける境界を一つ挟み、手前の物と奥の季語を並べる。境界の名を句に入れる',
      x3: '生活の場の開口部や境界を一つ置き、その向こうの季語を描く。開口部は窓に限らない' },
    en: {
      x1: 'put one frame around the season word\'s thing, or one thin veil before it, and draw the thing beyond; the frame or veil belongs to the season word\'s own scene',
      x2: 'set one see-through boundary between a thing in front and the season word behind; name the boundary',
      x3: 'put one opening or boundary of a lived-in place, and draw the season word beyond it; it need not be a window' } },

  { key: 'S6', name: '奥行', enName: 'depth',
    common: '「遥か」「彼方」「果て」「遠く」など距離を言う語は使わない',
    commonEn: 'no words for distance (far, beyond, the end)',
    ja: {
      x1: '道や流れなど奥へまっすぐ伸びる季語を一つ置き、その先が細っていく様を描く',
      x2: '手前に季語を、その奥へまっすぐ続く構造物を一つ置く',
      x3: '手元の日常の物と、奥へまっすぐ伸びる季節の景を並べる' },
    en: {
      x1: 'take one season word that runs straight into the distance, like a path or a stream, and draw it narrowing away',
      x2: 'put the season word in front and one structure running straight back behind it',
      x3: 'set an everyday thing at hand beside a seasonal scene running straight into the distance' } },

  { key: 'T1', name: '高速静止', enName: 'high-speed freeze',
    common: '動詞は句全体で一つ。「一瞬」「刹那」「止まる」など静止を説明する語は使わない',
    commonEn: 'one verb in the whole poem; no words that explain stillness (instant, moment, stop)',
    avoidKire: ['kana'],   // 詠嘆で結ぶと止まった感じが緩む
    // 異景で中七を「や」で切ると、言い終えていない動作の途中に季語が割り込み、文が壊れる
    // （朝刊を／丘の枯木や／かかへつつ）
    avoidKireBy: { x3: ['nakashichi_ya'] },
    ja: {
      x1: '散る・跳ねる・落ちる途中の季語を、動作を言い終えない形で名詞にかけ、名詞止めで終える',
      x2: '動作の途中にある季語と、まったく動かない物一つを並べる。動詞は季語の側に一つだけ置く',
      x3: '言い終えていない日常の動作と、ただそこにある季語を並べる。動詞は日常の動作の側に一つだけ置き、季語は名詞のまま置く。動作を言う語句の途中に季語を挟まない' },
    en: {
      x1: 'catch the season word\'s thing midway through scattering, leaping or falling, with the action left unfinished as it describes the noun, and end on a noun',
      x2: 'set the season word caught mid-movement beside one thing that does not move at all; the only verb belongs to the season word',
      x3: 'set an unfinished everyday action beside the season word simply there; the only verb belongs to the action, the season word stays a noun; never break the action\'s phrase to put the season word inside it' } },

  { key: 'T2', name: 'モーション', enName: 'motion',
    common: '動詞は句全体で一つ。「軌跡」「線」「速し」など動きを説明する語は使わない',
    commonEn: 'one verb in the whole poem; no words that explain motion (trail, line, swift)',
    avoidKire: ['kana'],   // 詠嘆で結ぶと動きが止まる
    ja: {
      x1: '季語の飛ぶ・滑る・落ちる動きを動詞一つで描き、動きの始まりか終わりのどちらか一方の場所を添える',
      x2: '動かない背景を一つ置き、そこを横切る季語を動詞一つで描く',
      x3: '日常の動作を名詞で置き、その勢いに続くように動く季語を動詞一つで描く。二つのあいだの因果は書かない' },
    en: {
      x1: 'draw the season word\'s thing flying, sliding or falling with one verb, and add the place where the movement starts or ends (only one)',
      x2: 'set one still background and draw the season word crossing it with one verb',
      x3: 'give an everyday action as a noun, and draw the season word moving on as if carried by its momentum, with one verb; state no cause between them' } },

  { key: 'T3', name: 'タイムラプス', enName: 'time-lapse',
    common: '「やがて」「いつしか」「次第に」「ゆっくり」など時の経過を言う語は使わない',
    commonEn: 'no words for time passing (soon, gradually, slowly)',
    jiko: ['x3'],
    ja: {
      x1: '積もる・解ける・乾くなど、数分から数十分で進む季語の変化を、途中の状態として描く。変化の前と後を両方書かない',
      x2: '変化の途中にある季語と、長く形を変えていない物一つを並べる。古びた物は年月の跡が目に見える姿で書く',
      x3: '日常の中で何かを待っている物の状態と、変わりつつある季語を並べる。待つ人や待つ理由は書かない' },
    en: {
      x1: 'draw a change in the season word\'s thing that runs over minutes (piling, melting, drying) as a state midway; never give both before and after',
      x2: 'set the season word midway through a change beside one thing that has not changed shape in years, with the marks of time visible on it',
      x3: 'set the state of an everyday thing that is waiting beside the season word as it changes; do not say who waits or why' } },

  { key: 'T4', name: '予兆', enName: 'omen',
    common: '「今にも」「まさに」「寸前」など直前であることを言う語は使わない',
    commonEn: 'no words that say it is about to happen (about to, on the verge)',
    jiko: ['x3'],
    ja: {
      x1: '落ちる・割れる・ほどける直前の季語を、その形（ふくらみ・しなり・重み）で描く。起きたことは書かない',
      // 「隙間」を描かせると、あと一つ・紙一重・指の幅など、寸前を言い換えた語で隙間を測ってしまう
      x2: '季語が別の物へ向かって伸びる・傾く・垂れる姿と、その先にある物一つを並べる。近さは二つの位置と向きだけで見せ、隙間の幅や残りの量（あと少し・紙一重・指の幅など）は言わない。触れたかどうかは書かない',
      x3: '日常の行為を始める直前の物の状態と、季節の気配を並べる。行為そのものは書かない' },
    en: {
      x1: 'draw the season word\'s thing just before it falls, breaks or comes undone, through its shape (swelling, bending, weight); never say it happened',
      x2: 'set the season word reaching, leaning or drooping toward one other thing; show how close they are only by where they are and which way it points, never by measuring the gap (almost, a hair\'s breadth, a finger\'s width); never say whether they touch',
      x3: 'set the state of a thing just before an everyday act begins beside a hint of the season; never show the act itself' } },

  { key: 'T5', name: '痕跡・不在', enName: 'trace and absence',
    common: '「去る」「いない」「なし」「跡」など不在を説明する語は使わない',
    commonEn: 'no words that explain absence (gone, left, no one, trace)',
    jiko: ['x3'],
    ja: {
      x1: null,   // 季語を描かずに季語一つを詠むことになり、成り立たない
      x2: '何かがいなくなったあとの物と、今そこにある季語を並べる。いなくなったものの名は書かない',
      x3: '人が離れたばかりの生活の道具と、近くにある季語を並べる。人は書かず、場所は屋内に限らない' },
    en: {
      x1: null,
      x2: 'set something left after something went away beside the season word here now; never name what went away',
      x3: 'set an everyday tool just left behind by someone beside the season word nearby; no person; it need not be indoors' } },

  { key: 'D1', name: '映り', enName: 'reflection',
    common: '天気によらず映る面（窓ガラス・鏡・器・水面など）を使い、何が何に映っているかを言葉で示す。空・遠景・降っているもの・光そのものは映さない',
    commonEn: 'use a surface that reflects whatever the weather (window glass, a mirror, a vessel, water) and say what is reflected in what; never reflect the sky, distant views, falling weather or light itself',
    ja: {
      x1: '季語が近くの面に映った姿だけを描き、実物は書かない。映りならではの揺れ・歪み・逆さを一点添える',
      x2: '季語ともう一つの物が、同じ面に重なって映る姿を描く',
      x3: '生活の中の物の面に、近くの季語が映り込んだ姿を描く。映す面は屋外の物でもよい' },
    en: {
      x1: 'draw only the season word\'s thing as it appears in a surface close by, not the thing itself; add one wobble, warp or upside-down touch that only a reflection has',
      x2: 'draw the season word and one other thing reflected overlapping in the same surface',
      x3: 'draw the season word nearby reflected in the surface of an everyday object, which may be outdoors' } },

  { key: 'D2', name: '色彩', enName: 'colour',
    common: '「対」「映ゆ」「鮮やか」など色の対比や強さを説明する語は使わない',
    commonEn: 'no words that explain contrast or vividness (contrast, vivid, bright)',
    ja: {
      x1: '季語が持つ色を一つだけ、色の名か色の決まる部位で示し、ほかの色は出さない',
      x2: '季語の色と、それと対照的な色を持つ物一つを並べる。色の名は一つまでにし、もう一方は物で色を示す',
      x3: '色味のない日常の物と、強い色を持つ季語を並べる。色の名を使うなら季語の側だけにする' },
    en: {
      x1: 'show one colour of the season word\'s thing only, by a colour name or a part whose colour is unmistakable; no other colour',
      x2: 'set the season word\'s colour beside one thing of a contrasting colour; at most one colour name, the other shown by the thing',
      x3: 'set a colourless everyday thing beside a strongly coloured season word; any colour name goes only on the season word' } },

  { key: 'D3', name: '明暗', enName: 'light and dark',
    common: '「明暗」「明るし」「暗し」など明るさを説明する語は使わない',
    commonEn: 'no words that explain brightness (bright, dark)',
    ja: {
      x1: '闇か逆光の中で、季語の輪郭だけが浮かぶ姿を描く。光の出所を名で一つ示す',
      x2: '光の当たる季語と、影の中にある物一つを並べる',
      x3: '暗い生活の場にある手元の物と、光の当たる季語を並べる。場所は屋内に限らない' },
    en: {
      x1: 'draw only the outline of the season word\'s thing rising out of darkness or against the light; name the one source of the light',
      x2: 'set the season word in the light beside one thing in shadow',
      x3: 'set a thing at hand in a dim lived-in place beside the season word in the light; it need not be indoors' } },

  { key: 'D4', name: '共感覚', enName: 'synaesthesia',
    // 冷たし・寒し・暖か・涼しなど温度の形容詞の多くはそれ自体が季語で、季重なりになる
    // （冷たき紅の／冬芽かな）。温度は形容詞で言わせず、触れれば熱い・冷たいと分かる物の名で示させる。
    // 同じ理由で、時候の季語（温度そのもの）も候補に入れない
    common: '温度は「冷たし」「寒し」「暖か」「ぬくし」「涼し」など温度を言う語で言わず、触れれば熱い・冷たいと分かる物の名（鉄・湯・火・石など）一つで示す。季語になる物（氷・霜など）は使わない。「のに」「ながら」など逆接でつながず、意外さを説明しない',
    commonEn: 'never state temperature with a word for it (cold, warm, cool); show it with the name of one thing whose heat or chill is known to the touch (iron, hot water, fire, stone), and not one that is itself a season word (ice, frost); no "yet" or "though", never explain the surprise',
    ja: {
      x1: '季語の光か色に、温度を思わせる物一つを重ねる。色から思うのとは逆の温度の物を選ぶ（暖色なら冷たい物、寒色なら温かい物。白・黒は使わない）',
      x2: '温かい物と冷たい物を一つずつ並べ、触れたときの温度の差を見せる。季語はどちらか一方にする',
      x3: null },
    en: {
      x1: 'lay one thing that carries a temperature over the season word\'s light or colour, its warmth the opposite of what the colour suggests (a cold thing for a warm colour, a warm thing for a cool one; no white or black)',
      x2: 'set one warm thing and one cold thing side by side so the difference to the touch is felt; the season word is one of them',
      x3: null } },

  { key: 'D5', name: 'マテリアル', enName: 'material',
    common: '「感触」「手触り」「質感」など触れ心地を説明する語は使わない',
    commonEn: 'no words that explain texture (feel, touch, texture)',
    ja: {
      x1: '季語の表面の濡れ・乾き・ざらつき・ぬめりのどれか一つを一点示す。触れる動作は書かない',
      x2: '瑞々しい季語と、錆・苔・ひびなど傷みの見える物一つを並べる',
      x3: '作られた素材でできた日常の物と、生きている季語を並べる。質感はそれぞれ一語で示す' },
    en: {
      x1: 'show one surface quality of the season word\'s thing (wet, dry, rough or slick) at one spot; never show touching',
      x2: 'set the fresh season word beside one thing visibly worn (rust, moss, a crack)',
      x3: 'set an everyday thing of a made material beside the living season word; give each texture in one word' } },

  { key: 'D6', name: 'ミクロ', enName: 'macro',
    common: '数は漢数字で、数える物のすぐ前に置く。概数や名前の一部の数は使わない。「だけ」「のみ」は付けない',
    commonEn: 'put the number right before what it counts; no round figures, no number that is part of a name; never add "only"',
    ja: {
      x1: '季語の小さな部位か欠けを一点だけ描く。数は使わない',
      x2: '見て数えられる小さな数（ひとつ以外）で限った極小の物と、大きな季語を並べる',
      x3: '数えられる日用品と、大きな季節の現象を並べる。数は日用品の側に置く' },
    en: {
      x1: 'draw one tiny part or flaw of the season word\'s thing only; use no number',
      x2: 'set a tiny thing limited by a small number you could count by eye (not one) beside the large season word',
      x3: 'set countable everyday things beside a large seasonal phenomenon; the number goes on the everyday things' } },

  { key: 'D7', name: '微音', enName: 'faint sound',
    common: '擬音は使わない。「静けさ」「しじま」「寂し」など静かさや心を言う語は使わない',
    commonEn: 'no onomatopoeia; no words for silence or the mind (quiet, stillness, lonely)',
    jiko: ['x3'],
    ja: {
      x1: '季語が立てる微かな音を一つ、何の音かを名で書いて示す。ほかの音は書かない',
      x2: '動かない景の中で、季語か物のどちらか一方が立てる音を一つだけ示す',
      x3: '生活の音がやんだあとに目に見えて残る物と、季語を並べる。やんだ音は何の音かを名で書く' },
    en: {
      x1: 'show one faint sound the season word\'s thing makes, naming what the sound is; no other sound',
      x2: 'in a still scene, show one sound made by either the season word or the other thing',
      x3: 'set something visible that remains after an everyday sound has stopped beside the season word; name the sound that stopped' } },

  { key: 'D8', name: '擬音', enName: 'sound word',
    common: '既成のオノマトペは使わない。擬音はひらがなかカタカナで、読んで音が思い浮かぶ短さにする。「音」「響く」「鳴る」など音であることを説明する語は使わない',
    commonEn: 'never a ready-made onomatopoeia; keep the coined word short enough to hear; no words that explain it is a sound (sound, ring, echo)',
    jiko: ['x3'],
    ja: {
      x1: '季語が立てる音を、新しく作った擬音一つで示す。音の主である季語の名を句に置く',
      x2: '一方の物が立てる新しい擬音一つと、音を立てない季語を並べる',
      x3: '日常の動作の音を新しく作った擬音一つで示し、季語を並べる' },
    en: {
      x1: 'show the sound the season word\'s thing makes with one newly coined sound word; name the thing in the poem',
      x2: 'set one newly coined sound word made by one thing beside a silent season word',
      x3: 'give the sound of an everyday action as one newly coined sound word and set the season word beside it' } }
];

// 型とレンズの組み合わせを、そのまま {technique} に入れる一つの技法にする
function cell(lens, x) {
  var ty = TYPES[x];
  var avoid = ty.avoidKire.slice();
  (lens.avoidKire || []).concat((lens.avoidKireBy || {})[x] || [])
    .forEach(function(k) { if (avoid.indexOf(k) < 0) avoid.push(k); });
  return {
    key: lens.key + '.' + x,
    lens: lens.key,
    type: x,
    ja: lens.name + '（' + ty.name + '）――' + lens.ja[x] + '。' + ty.note + '。' + lens.common,
    en: lens.enName + ' (' + ty.enName + '): ' + lens.en[x] + '; ' + ty.noteEn + '; ' + lens.commonEn,
    avoidKire: avoid,
    noJiko: !(lens.jiko && lens.jiko.indexOf(x) >= 0),
    noTenmon: !!(lens.noTenmon && lens.noTenmon.indexOf(x) >= 0)   // 空と天気の季語（天文）も外すか
  };
}

var ALL = [];
LENSES.forEach(function(l) {
  ['x1', 'x2', 'x3'].forEach(function(x) { if (l.ja[x]) ALL.push(cell(l, x)); });
});

var KEY = 'technique-history';
var AVOID = 6;   // 直近6回のレンズを避ける

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
}

// key は「S1.x2」。レンズの部分だけを覚える
function remember(key) {
  var h = loadHistory();
  h.push(String(key).split('.')[0]);
  if (h.length > AVOID) h = h.slice(-AVOID);
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch (e) {}
}

// 直近で使っていないレンズの組み合わせから一つ選ぶ。全部使っていれば全体から選ぶ。
// レンズを先に選んでから型を選ぶ（型の数が違うレンズでも、レンズごとの出やすさを揃える）
function choose() {
  var recent = loadHistory();
  var lenses = LENSES.filter(function(l) { return recent.indexOf(l.key) < 0; });
  if (!lenses.length) lenses = LENSES;
  var lens = lenses[Math.floor(Math.random() * lenses.length)];
  var cells = ALL.filter(function(c) { return c.lens === lens.key; });
  return cells[Math.floor(Math.random() * cells.length)];
}

// 例を差し込む技法は今は無い。テスト・集計の呼び出しはそのまま使えるようにしておく
function render(t) { return t; }
function matches(t, text) { return t.ja === text; }

module.exports = { choose: choose, remember: remember, render: render, matches: matches,
                   all: ALL, lenses: LENSES, types: TYPES };
