# Haiku — ストア掲載用テキスト

Rebble アプリストアや配布ページに貼り付ける用の文面です。日本語と英語を用意しています。

---

## タイトル

Haiku

## 一行紹介（日本語）

いまの季節・天気・時間帯を、LLM が一句に詠むウォッチフェイス。

## 一行紹介（English）

A watchface that turns this moment — season, weather, time of day — into a haiku written by an LLM.

---

## 説明文（日本語）

短冊と筆をあしらった和風のウォッチフェイスです。
Claude、ChatGPT、Gemini のいずれかが、いまこの瞬間を一句に詠み、短冊の上に縦書きで表示します。

句は朝・昼・夜など時間帯が変わるたびに新しく詠み直されます。取り合わせ、視線の運動、感覚の転換、省略、音の操作といった俳句の技法を毎回ひとつ指定し、その時の季節と天気に合う季語の候補を添えるので、同じような句が続きません。決まった時刻（朝・昼・晩、1日1〜3回）に詠み直す設定もできます。詠むときには次の情報を手がかりにします。

- 日付、曜日（平日・休日）、二十四節気
- 時間帯（未明、夜明け前、朝ぼらけ、朝、昼、午後、夕暮れ、薄暮、宵、夜更け）と、日の出・日の入りからの経過
- 現在地の天気。予報の分類ではなく、体感温度・湿度・風・降水から「肌寒い」「空気が湿って重い」といった体感で伝えます
- 月齢と月相（夜で、月が空に出ているときだけ）
- 市区レベルの地名（都心か、海辺の町か）
- 今日の歩数（Pebble Health）
- いまの前後1時間にある予定（カレンダーの iCal URL を設定したときだけ）
- 直前に詠んだ句。同じ言葉や着想を繰り返さないようにします

背景は日の出・日の入りに連動して切り替わります。日中は座布団の紺・畳の緑・桜・若葉・万緑・枯葉・雪催、夜は闇・星月夜・朧月夜・短夜・雪の夜から選べ、色に合わせて花びらや葉、星、雪のモチーフが散ります。
時刻の書体は筆文字（楷書・行書・太字）とデジタルから選べます。紙の隅には日付入りの落款（赤い印）が押されます。

日本語（縦書き）と英語（横書き）に対応。プロンプトは設定画面から自由に書き換えられ、LLM の思考の深さ（低・中・高）も選べます。設定画面では、いま表示している句と最近の句、使ったプロンプトを確認でき、ボタン一つで LLM にその句の解説を書かせることもできます。

### 必要なもの

- Claude（Anthropic）、OpenAI、Gemini（Google AI Studio）のいずれかの API キー。ご自身のアカウントで取得し、設定画面に入力してください。生成のたびに少量の API 利用料がかかります（1日10回程度。既定の中位モデルで月に百数十円が目安。上位・下位のモデルも選べます）
- 句の生成にはスマホとの接続が必要です。生成済みの句は時計に保存されるので、接続が切れても直前の句は表示されます
- 日本語表示には、時計本体に日本語フォント（非公式の言語パック）が入っている必要があります。入っていない場合は漢字が □ で表示されます。その場合は設定で English を選んでください

### プライバシー

- API キーはスマホのアプリ内にだけ保存され、時計にも第三者にも送りません
- 位置情報は天気・日の出時刻・地名の取得に使います。LLM に送るのは市区レベルの地名だけで、緯度経度は送りません。地名の利用は設定でオフにできます
- 歩数は今日の合計値だけを LLM に送ります。設定でオフにできます
- カレンダーは iCal URL を設定したときだけ読み、前後1時間にある予定1件の件名を LLM に送ります。終日予定と繰り返し予定は使いません。既定は空欄で、設定しなければ通信もしません
- 開発者側のサーバーはありません。通信はスマホから Anthropic / OpenAI / Google / Open-Meteo / BigDataCloud へ直接行われます

### 対応機種

Pebble Time / Time Steel（basalt）、Pebble Time Round（chalk）、Pebble 2（diorite）、Pebble Time 2（emery）

### クレジット

- 天気: Open-Meteo（https://open-meteo.com/）
- 季語: きごさい歳時記（https://kigosai.sub.jp/）の「基本季語700」
- 地名: BigDataCloud reverse-geocode-client
- 筆文字フォント: Yuji Syuku、Yuji Mai（The Yuji Project Authors）、Reggae One（The Reggae Project Authors）。いずれも SIL Open Font License 1.1

---

## Description (English)

A Japanese-style watchface with a paper strip and a calligraphy brush.
Claude, ChatGPT or Gemini writes a haiku about this very moment and the watch shows it on the paper — vertically in Japanese, or in three lines in English.

A new haiku is written whenever the time of day changes, or at fixed times of your choice (morning, noon, evening — one to three a day). Each poem is asked to use one haiku technique — juxtaposition, a moving gaze, crossed senses, omission or sound — so the poems do not fall into a pattern. The prompt draws on:

- The date, weekday or weekend, and the traditional solar term (sekki)
- The time of day — from the small hours through daybreak, midday, dusk and twilight to deep night — and how long since sunrise or sunset
- Local weather, described the way it feels: apparent temperature, humidity, wind and rain rather than a forecast label
- The moon's age and phase, only at night while the moon is up
- Your city-level location (downtown, or a town by the sea)
- Today's step count from Pebble Health
- An event within an hour of now, if you paste a calendar's iCal URL
- The haiku written just before, so words and images are not repeated

The background follows sunrise and sunset. Daytime and night colours are named after season words — cherry blossom, young leaves, deep summer green, fallen leaves, snow-laden sky by day; starry night, hazy moon, short summer night, snowy night after dark — each with small petals, leaves, stars or snowflakes scattered behind the paper. The time can be shown in brush calligraphy (regular, cursive or bold) or a digital typeface. A red seal with today's date sits in the corner of the paper.

Japanese (vertical) and English (horizontal) are supported. The prompt is fully editable in the settings page, and the model's thinking effort (low, medium, high, max) can be chosen. The settings page also shows the current haiku, recent ones and the prompt that produced them, and can ask the LLM for a short commentary on the current haiku.

### Requirements

- An API key for Claude (Anthropic), OpenAI or Gemini (Google AI Studio), entered in the settings. Each haiku costs a small amount of API usage (roughly ten per day; about a dollar a month with the default mid-tier models, more or less depending on the model you pick)
- A phone connection to generate haiku. The latest haiku is stored on the watch and stays visible when the phone is out of reach
- Japanese display needs a Japanese font installed on the watch (an unofficial language pack). Without it, kanji appear as boxes — choose English in the settings instead

### Privacy

- Your API key is stored only inside the phone app. It is never sent to the watch or to anyone else
- Location is used for weather, sunrise/sunset and the place name. Only a city-level place name is sent to the LLM, never coordinates. This can be turned off
- Only today's total step count is sent to the LLM. This can be turned off
- A calendar is read only if you paste its iCal URL. The title of one event within an hour of now is sent to the LLM; all-day and repeating events are ignored. It is empty by default, and nothing is fetched until you set it
- There is no server of ours. The phone talks directly to Anthropic / OpenAI / Google, Open-Meteo and BigDataCloud

### Supported watches

Pebble Time / Time Steel (basalt), Pebble Time Round (chalk), Pebble 2 (diorite), Pebble Time 2 (emery)

### Credits

- Weather: Open-Meteo (https://open-meteo.com/)
- Season words: "Kihon Kigo 700" from Kigosai Saijiki (https://kigosai.sub.jp/)
- Place names: BigDataCloud reverse-geocode-client
- Brush fonts: Yuji Syuku and Yuji Mai (The Yuji Project Authors), Reggae One (The Reggae Project Authors), all under the SIL Open Font License 1.1

---

## スクリーンショットについて

`screenshots/` の日本語画面は、エミュレータに日本語言語パックを適用して撮影しています。実機で言語パックを入れた場合と同じ見え方です。

## アイコンについて

ストアに登録するアイコンは `store/icon_144.png`（大）と `store/icon_80.png`（小、80×80 推奨）です。生成りの地に行書の「句」と落款「俳」で、`tools/make_icon.py` で描いています。時計のメニュー用の 25×25 は `resources/images/menu_icon.png` にあり、アプリに同梱しています。

## リリースノート / Release notes

### 1.5.0

- 既定プロンプト（日本語・英語）を簡潔に書き直し。実測値（気温・湿度・風速・降水量・歩数）は送らず、体感と天気の言葉だけで状況を伝える
- 技法の指定を「技法名――定義。付帯ルール」の形に。感覚の転換では触覚・嗅覚を一つだけ使える
- 以前の既定プロンプトを保存している端末は、起動時に新しい既定へ追従
- 季重なりの検査：句に季語が二つ以上入っていたら、重なった季語を添えて一度だけ詠み直す（きごさい歳時記の全季語で照合）
- 季語の候補を259語追加（本意の説明が要らない、いまの暮らしの名詞）
- アプリのアイコンを追加（行書の「句」と落款）
- Claude の思考の深さが効いていなかったのを修正（適応思考をオンにして effort を渡す）。「最大」を追加（Claude のみ。他は「高」で呼ぶ）

- Default prompts (Japanese and English) rewritten more concisely; raw readings (temperature, humidity, wind, rain, steps) are no longer sent, only felt and weather words
- Each technique is now given with its definition and its own rules; crossed senses may use one touch or smell
- Saved copies of the old default prompt are upgraded on start
- Two season words in one haiku are now detected against the full Kigosai saijiki, and the haiku is rewritten once
- 259 more everyday season words added to the candidate list
- Added an app icon (a brush-written 句 with a red seal)
- Fixed Claude ignoring the thinking effort (adaptive thinking is now turned on); added a Max level (Claude only; other providers use High)

### 1.0.0

- 初回リリース
- Claude / ChatGPT / Gemini による俳句生成。時間帯ごと、または決まった時刻に詠み直し
- 天気（体感）、月齢、地名、歩数、平日・休日、直前の句をプロンプトに反映
- 日の出・日の入りに連動した背景。季語の名前が付いた昼7種・夜5種の色とモチーフ
- 筆文字フォント3種とデジタル
- 日本語（縦書き）／英語（横書き）
- 設定画面で現在の句の確認と解説

- First release
- Haiku by Claude, ChatGPT or Gemini, rewritten for each time of day or at fixed times
- Felt weather, moon, place, steps, weekday/weekend and recent haiku in the prompt
- Background follows sunrise and sunset; seven daytime and five night themes named after season words
- Three brush fonts plus digital
- Japanese (vertical) and English (horizontal)
- Current haiku and LLM commentary on the settings page

---

## 短い告知文（SNS 用）

Pebble 用ウォッチフェイス「Haiku」を公開しました。
いまの季節・天気・時間帯・月・場所を手がかりに、Claude・ChatGPT・Gemini のいずれかが一句を詠み、短冊に縦書きで表示します。
朝・昼・夜で句が変わり、背景は日の出と日の入りで切り替わります。API キーはご自身のものを使います。

New Pebble watchface: Haiku.
Claude, ChatGPT or Gemini writes a haiku from this moment — season, weather, time of day, moon and place — and the watch shows it on a paper strip.
The haiku changes through the day and the background follows sunrise and sunset. Bring your own API key.
