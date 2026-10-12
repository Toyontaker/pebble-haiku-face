// Clay 設定画面の定義（日本語 / English 併記）
// 値は Clay が localStorage('clay-settings') に保存する。腕時計には送らない。

var DEFAULT_PROMPT_JA =
  'ウォッチフェイス用に、今の状況を想起させる俳句を一句作る。\n' +
  '\n' +
  '【状況】\n' +
  '{date}（{daytype}）の{timeofday}、{time}。{sun}。{sekki}、{season}。{moon}（月齢{moonage}）。{place}あたり。\n' +
  '{weather}。{feel}。{thunder}。{weather_change}。今日は{activity}。\n' +
  '{schedule}\n' +
  '{special}\n' +
  '\n' +
  '【避ける】次の句と同じ・似た季語、着想、景\n' +
  '{recent}\n' +
  '\n' +
  '【作句】\n' +
  '・状況のうち心が動く一、二点に絞り、具体を一つ置いて像で示す。説明せず、言い切らない。\n' +
  '・視覚・聴覚が主。状況の体感語や、心・想い・記憶など内面の語は使わない。\n' +
  '・動詞は一つまで。省略しても景は一つに定まること。\n' +
  '・場所は地形・構造・物で示し、由来や歴史は書かない。地名は句の要になるときだけ使い、下五に置かない。\n' +
  '・文語は活用を正しく。拍合わせで崩さず、語を替える。\n' +
  '・状況の表現を直接使わない。\n' +
  '・修飾を重ねて景を絞り込まない（〜の〜の〜など）\n' +
  '・誰がいるのか、誰がしたのかは名指さず、人は物や動作の跡で示す。その後どうなったか、どう感じたか、なぜそうなったかは言わない。\n' +
  '\n' +
  '【切れ】{kire}\n' +
  '\n' +
  '【季語】\n' +
  '{season}の季語を一つだけ（動植物の季重なりに注意）。歳時記の本意どおりに使い、季語自体が含む動作（鳴く・咲く等）は書かない。別の季語に替えても成り立つなら不可。気象の季語は状況の範囲内から。「季節＋名詞」型は避ける。\n' +
  '候補（他でも可。括弧内は本意・拍数の注記で句に入れない）：{kigo}\n' +
  '\n' +
  '【技法】{technique}。技法名の語は句に出さない。\n' +
  '\n' +
  '【形式】\n' +
  '五七五を拍で数える（拗音1拍、っ・ん・ーは各1拍）。縦書きのため各行7文字以内。常用漢字のみ、それ以外はひらがな。上五・中七・下五の三行で句だけを出力する。';

var DEFAULT_PROMPT_EN =
  'Write one haiku for a watch face that brings the present moment to mind.\n' +
  '\n' +
  'SITUATION\n' +
  'It is {time} on {date}, {daytype}, in the {timeofday}. {sun}. The solar term is {sekki}, in {season}. A {moon} (age {moonage} days). Around {place}.\n' +
  'The sky is {weather}. The body feels {feel}. Right now {thunder}. Just now, {weather_change}. Today has been {activity}.\n' +
  'On the calendar, {schedule}.\n' +
  '{special}\n' +
  '\n' +
  'Avoid the season words, ideas and scenes of these recent haiku: {recent}.\n' +
  '\n' +
  'COMPOSITION\n' +
  '- Narrow the situation to the one or two details that move you most, set down one concrete thing, and show it as an image. Do not explain or state the meaning.\n' +
  '- Sight and sound lead. Do not use the felt-condition words from the situation, or inner words such as heart, longing or memory.\n' +
  '- At most one verb. Even with words left out, the poem must settle on a single scene.\n' +
  '- Show the place through its landforms, structures and things, never its history or origins. Use a place name only when the poem turns on it, and never in the last line.\n' +
  '- Do not reuse the wording of the situation.\n' +
  '- Do not stack modifiers to pin down the scene (the A of the B of the C).\n' +
  '- Never name who is there or who did it; let people show only through things and the traces of what they do. Leave out what happened next, how it felt and why.\n' +
  '\n' +
  'CUT: {kire}.\n' +
  '\n' +
  'SEASON WORD\n' +
  'Include exactly one season word (kigo) of {season}; plants and animals count, so check that there is not a second one. Use it in its traditional sense, the scene it actually names, and do not write the action the word already carries (a bird\'s call, a flower\'s opening). If another season word would work just as well, it is decoration: do not use it. A weather-related season word must name something stated above. Avoid season-plus-noun words such as "autumn wind".\n' +
  '\n' +
  'TECHNIQUE: {technique}. Never let the name of the technique appear in the poem.\n' +
  '\n' +
  'FORM\n' +
  'Three lines of 5-7-5 syllables, counted as spoken beats; avoid words whose pronunciation is ambiguous. Each line must fit in 16 characters. Output exactly one haiku as three lines, and nothing else.';


var textareaComponent = {
  name: 'textarea',
  template:
    '<div class="component component-input component-textarea">' +
    '  <label class="tap-highlight">' +
    '    <span class="label">{{{label}}}</span>' +
    '    <span class="input">' +
    '      <textarea data-manipulator-target {{each key: attributes}}{{key}}="{{this}}"{{/each}}></textarea>' +
    '    </span>' +
    '  </label>' +
    '  {{if description}}<div class="description">{{{description}}}</div>{{/if}}' +
    '</div>',
  style:
    '.component-textarea textarea {' +
    '  display: block; width: 100%; box-sizing: border-box; min-height: 11em;' +
    '  background: #666666; color: #ffffff; border: none; border-radius: 4px;' +
    '  padding: 0.4rem 0.6rem; font-size: inherit; font-family: inherit; line-height: 1.5;' +
    '  resize: vertical; -webkit-appearance: none; appearance: none;' +
    '}' +
    '.component-textarea textarea:focus { outline: none; box-shadow: none; }',
  manipulator: 'val',
  defaults: { label: '', description: '', attributes: {} }
};

// 設定ページ内で動く関数。toString() で注入されるため、外の変数は参照できない。
// 既定のプロンプトは clayConfig.meta.userData 経由で受け取る。
function customClay(minified) {
  var clayConfig = this;

  function defaults() {
    return (clayConfig.meta && clayConfig.meta.userData) || {};
  }

  function isBlank(v) {
    return !String(v === undefined || v === null ? '' : v).replace(/^\s+|\s+$/g, '');
  }

  // 空欄のままにされた欄には既定のプロンプトを入れる
  function keepFilled(key, defKey) {
    var item = clayConfig.getItemByMessageKey(key);
    if (!item) return;
    if (isBlank(item.get()) && defaults()[defKey]) item.set(defaults()[defKey]);
    item.on('change', function() {
      if (isBlank(this.get()) && defaults()[defKey]) this.set(defaults()[defKey]);
    });
  }

  function bindReset(buttonId, key, defKey) {
    var button = clayConfig.getItemById(buttonId);
    var item = clayConfig.getItemByMessageKey(key);
    if (!button || !item) return;
    button.on('click', function() {
      if (defaults()[defKey]) item.set(defaults()[defKey]);
    });
  }

  function escapeHtml(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function providerName(p) {
    return { claude: 'Claude', openai: 'ChatGPT', gemini: 'Gemini' }[p] || p || '';
  }

  function localTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
  }

  // いま表示している句と最近の句を書き出す
  function showCurrentHaiku() {
    var item = clayConfig.getItemById('current-haiku');
    var cur = defaults().current;
    if (!item || !cur || !cur.lines || !cur.lines.length) return;
    var html = '<span style="display:block;font-size:1.35em;line-height:1.7;padding:.2em 0 .4em">' +
               cur.lines.map(escapeHtml).join('<br>') + '</span>';
    var meta = [];
    if (cur.at) meta.push(localTime(cur.at));
    if (cur.provider || cur.model) meta.push(providerName(cur.provider) + (cur.model ? ' ' + cur.model : ''));
    if (meta.length) html += '<span style="display:block;opacity:.7;font-size:.9em">' + escapeHtml(meta.join(' · ')) + '</span>';
    var hist = defaults().history || [];
    var older = hist.slice(0, -1).reverse();
    if (older.length) {
      html += '<span style="display:block;margin-top:.8em;opacity:.7;font-size:.9em">最近の句 / Recent</span>' +
              '<span style="display:block;font-size:.95em;line-height:1.6">' + older.map(escapeHtml).join('<br>') + '</span>';
    }
    if (cur.prompt) {
      html += '<details style="margin-top:.8em;opacity:.8;font-size:.85em"><summary>使ったプロンプト / Prompt used</summary>' +
              '<span style="display:block;white-space:pre-wrap;margin-top:.4em">' + escapeHtml(cur.prompt) + '</span></details>';
    }
    item.set(html);
  }

  function readSetting(key) {
    var it = clayConfig.getItemByMessageKey(key);
    return it ? it.get() : undefined;
  }

  // ページから直接 LLM を呼ぶ（スマホの回線を使う。腕時計は介さない）
  function llmRequest(provider, opts, cb, stripped) {
    var xhr = new XMLHttpRequest();
    var body, url;
    if (provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      body = { model: opts.model, max_completion_tokens: 2000,
               messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }] };
      if (!stripped) body.reasoning_effort = opts.effort === 'max' ? 'high' : opts.effort;
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Authorization', 'Bearer ' + opts.key);
    } else if (provider === 'gemini') {
      url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(opts.model) + ':generateContent';
      body = { system_instruction: { parts: [{ text: opts.system }] },
               contents: [{ role: 'user', parts: [{ text: opts.user }] }],
               generationConfig: { maxOutputTokens: 4096 } };
      if (!stripped) body.generationConfig.thinkingConfig = { thinkingLevel: opts.effort === 'max' ? 'high' : opts.effort };
      xhr.open('POST', url, true);
      xhr.setRequestHeader('x-goog-api-key', opts.key);
    } else {
      url = 'https://api.anthropic.com/v1/messages';
      body = { model: opts.model, max_tokens: 4096, system: opts.system,
               messages: [{ role: 'user', content: opts.user }] };
      if (!stripped) {
        body.thinking = { type: 'adaptive' };
        body.output_config = { effort: opts.effort };
        body.max_tokens = { low: 4096, medium: 8192, high: 16000, max: 32000 }[opts.effort] || 4096;
      }
      xhr.open('POST', url, true);
      xhr.setRequestHeader('x-api-key', opts.key);
      xhr.setRequestHeader('anthropic-version', '2023-06-01');
      xhr.setRequestHeader('anthropic-dangerous-direct-browser-access', 'true');
      if (/^claude-(opus-5|fable)/.test(opts.model)) {
        xhr.setRequestHeader('anthropic-beta', 'server-side-fallback-2026-07-01');
        body.fallbacks = 'default';
      }
    }
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) return;
      var res = null;
      try { res = JSON.parse(xhr.responseText); } catch (e) {}
      if (xhr.status !== 200) {
        var msg = (res && res.error && res.error.message) || '';
        if (xhr.status === 400 && !stripped && /thinking|reasoning|effort/i.test(msg)) {
          llmRequest(provider, opts, cb, true);   // 思考設定を受け付けないモデル
          return;
        }
        cb('HTTP ' + xhr.status + (msg ? ': ' + msg.slice(0, 160) : ''), null);
        return;
      }
      try {
        var text = '';
        if (provider === 'openai') {
          text = res.choices[0].message.content;
        } else if (provider === 'gemini') {
          var parts = res.candidates[0].content.parts;
          for (var i = 0; i < parts.length; i++) if (!parts[i].thought && parts[i].text) text += parts[i].text;
        } else {
          if (res.stop_reason === 'refusal') { cb('refused', null); return; }
          for (var j = 0; j < res.content.length; j++) if (res.content[j].type === 'text') text += res.content[j].text;
        }
        cb(null, text);
      } catch (e) {
        cb('parse error', null);
      }
    };
    xhr.onerror = function() { cb('network error', null); };
    xhr.send(JSON.stringify(body));
  }

  function explainHaiku() {
    var out = clayConfig.getItemById('haiku-explanation');
    var button = clayConfig.getItemById('explain-haiku');
    var cur = defaults().current;
    if (!out || !cur || !cur.lines) return;

    var provider = readSetting('CFG_PROVIDER') || 'claude';
    var lang = readSetting('CFG_LANG') === 'en' ? 'en' : 'ja';
    var effort = readSetting('CFG_EFFORT') || 'low';
    var keys = { claude: 'CFG_CLAUDE_KEY', openai: 'CFG_OPENAI_KEY', gemini: 'CFG_GEMINI_KEY' };
    var models = { claude: 'CFG_CLAUDE_MODEL', openai: 'CFG_OPENAI_MODEL', gemini: 'CFG_GEMINI_MODEL' };
    var fallbackModel = { claude: 'claude-sonnet-5', openai: 'gpt-5-mini', gemini: 'gemini-flash-latest' };
    var key = String(readSetting(keys[provider]) || '').replace(/^\s+|\s+$/g, '');
    var model = String(readSetting(models[provider]) || '').replace(/^\s+|\s+$/g, '') || fallbackModel[provider];
    if (!key) {
      out.set(lang === 'ja' ? 'API キーを入力してから押してください。' : 'Enter an API key first.');
      return;
    }

    var haiku = cur.lines.join('\n');
    var system, user;
    if (lang === 'ja') {
      system = 'あなたは俳句の鑑賞と解説に長けた指導者です。読み手が楽しめるよう、やさしい言葉で書いてください。';
      user = '次の俳句を解説してください。季語と季節感、切れや音の運び、情景と余情、工夫している点を短くまとめ、' +
             '最後に一言で味わいどころを添えてください。全体で300字以内、見出しや記号は使わず文章で。\n\n' +
             '俳句:\n' + haiku + '\n\n' +
             'この句は次の指示（その時の状況）から詠まれました。解説の参考にしてください。\n' + (cur.prompt || '（不明）');
    } else {
      system = 'You are a warm, knowledgeable haiku teacher. Write for a curious reader in plain language.';
      user = 'Explain this haiku: its seasonal reference and mood, the cut and rhythm, the imagery and what is left unsaid, ' +
             'and any craft worth noticing. Keep it under 150 words, in prose without headings.\n\n' +
             'Haiku:\n' + haiku + '\n\n' +
             'It was written from this prompt describing the moment; use it as context:\n' + (cur.prompt || '(unknown)');
    }

    if (button) button.disable();
    out.set(lang === 'ja' ? '解説を書いています…' : 'Writing the commentary…');
    llmRequest(provider, { key: key, model: model, effort: effort, system: system, user: user }, function(err, text) {
      if (button) button.enable();
      if (err) {
        out.set((lang === 'ja' ? '解説を取得できませんでした: ' : 'Could not get the commentary: ') + escapeHtml(err));
        return;
      }
      out.set('<span style="display:block;line-height:1.7;white-space:pre-wrap">' + escapeHtml(String(text).replace(/^\s+|\s+$/g, '')) + '</span>' +
              '<span style="display:block;opacity:.6;font-size:.85em;margin-top:.5em">' + escapeHtml(providerName(provider) + ' ' + model) + '</span>');
    });
  }

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    showCurrentHaiku();
    var explainButton = clayConfig.getItemById('explain-haiku');
    if (explainButton) {
      if (!defaults().current) explainButton.hide();
      explainButton.on('click', explainHaiku);
    }
    keepFilled('CFG_PROMPT_JA', 'promptJa');
    keepFilled('CFG_PROMPT_EN', 'promptEn');
    bindReset('reset-prompt-ja', 'CFG_PROMPT_JA', 'promptJa');
    bindReset('reset-prompt-en', 'CFG_PROMPT_EN', 'promptEn');
  });
}

module.exports = {
  textareaComponent: textareaComponent,
  customClay: customClay,
  DEFAULT_PROMPT_JA: DEFAULT_PROMPT_JA,
  DEFAULT_PROMPT_EN: DEFAULT_PROMPT_EN,
  DEFAULT_CLAUDE_MODEL: 'claude-sonnet-5',
  DEFAULT_OPENAI_MODEL: 'gpt-5-mini',
  DEFAULT_GEMINI_MODEL: 'gemini-flash-latest',

  build: function() {
    return [
      {
        type: 'heading',
        defaultValue: '俳句 / Haiku'
      },
      {
        type: 'text',
        defaultValue: '朝・昼・夜ごとに、LLMがその時の季節と天気を詠んだ俳句を表示します。<br>' +
                      'Shows a haiku written by an LLM for each morning, daytime and night.'
      },
      {
        type: 'section',
        items: [
          { type: 'heading', defaultValue: 'いま表示している句 / Current haiku' },
          {
            type: 'text',
            id: 'current-haiku',
            defaultValue: 'まだ句がありません。<br>No haiku yet.'
          },
          {
            type: 'button',
            id: 'explain-haiku',
            defaultValue: 'この句の解説を読む / Explain this haiku',
            description: '句と、詠ませたときのプロンプトを LLM に渡して解説させます。上で選んだ LLM とキーを使います。<br>' +
                         'Sends the haiku and its prompt to the LLM selected above and shows the commentary here.'
          },
          {
            type: 'text',
            id: 'haiku-explanation',
            defaultValue: ''
          }
        ]
      },
      {
        type: 'section',
        items: [
          { type: 'heading', defaultValue: 'LLM' },
          {
            type: 'select',
            messageKey: 'CFG_PROVIDER',
            label: '使用するLLM / Provider',
            defaultValue: 'claude',
            options: [
              { label: 'Claude (Anthropic)', value: 'claude' },
              { label: 'ChatGPT (OpenAI)', value: 'openai' },
              { label: 'Gemini (Google)', value: 'gemini' }
            ]
          },
          {
            type: 'input',
            messageKey: 'CFG_CLAUDE_KEY',
            label: 'Claude APIキー / API key',
            defaultValue: '',
            attributes: { placeholder: 'sk-ant-...' }
          },
          {
            type: 'input',
            messageKey: 'CFG_CLAUDE_MODEL',
            label: 'Claude モデル / model',
            defaultValue: 'claude-sonnet-5',
            attributes: { placeholder: 'claude-sonnet-5' },
            description: '既定は中位の Sonnet 5。上位は claude-opus-5、下位は claude-haiku-4-5。<br>' +
                         'Default is the mid-tier Sonnet 5; claude-opus-5 above it, claude-haiku-4-5 below.'
          },
          {
            type: 'input',
            messageKey: 'CFG_OPENAI_KEY',
            label: 'OpenAI APIキー / API key',
            defaultValue: '',
            attributes: { placeholder: 'sk-...' }
          },
          {
            type: 'input',
            messageKey: 'CFG_OPENAI_MODEL',
            label: 'OpenAI モデル / model',
            defaultValue: 'gpt-5-mini',
            attributes: { placeholder: 'gpt-5-mini' },
            description: '既定は中位の gpt-5-mini。上位は gpt-5、下位は gpt-5-nano。<br>' +
                         'Default is the mid-tier gpt-5-mini; gpt-5 above it, gpt-5-nano below.'
          },
          {
            type: 'input',
            messageKey: 'CFG_GEMINI_KEY',
            label: 'Gemini APIキー / API key',
            defaultValue: '',
            attributes: { placeholder: 'AIza... / AQ....' }
          },
          {
            type: 'input',
            messageKey: 'CFG_GEMINI_MODEL',
            label: 'Gemini モデル / model',
            defaultValue: 'gemini-flash-latest',
            attributes: { placeholder: 'gemini-flash-latest' },
            description: '既定は中位の Flash（gemini-flash-latest は最新の Flash を指す別名）。上位は gemini-pro-latest、下位は gemini-flash-lite-latest。' +
                         'gemini-3.8-flash のように固定もできます。<br>' +
                         'Default is the mid-tier Flash (gemini-flash-latest always points at the newest Flash); gemini-pro-latest above it, gemini-flash-lite-latest below.'
          },
          {
            type: 'select',
            messageKey: 'CFG_EFFORT',
            label: '思考の深さ / Thinking effort',
            defaultValue: 'low',
            options: [
              { label: '低（速い・安い） / Low', value: 'low' },
              { label: '中 / Medium', value: 'medium' },
              { label: '高（遅い・高い） / High', value: 'high' },
              { label: '最大（Claude のみ。他は「高」） / Max (Claude only; High elsewhere)', value: 'max' }
            ],
            description: 'Claude は適応思考（thinking: adaptive）の effort、Gemini は thinkingLevel、OpenAI は reasoning_effort に対応します。' +
                         '俳句には「低」で十分なことが多く、費用と待ち時間を抑えられます。思考設定を受け付けないモデルでは自動的に外します。<br>' +
                         'Maps to Claude adaptive-thinking effort, Gemini thinkingLevel and OpenAI reasoning_effort. Low is usually enough for a haiku. ' +
                         'Models that reject the setting are called without it.'
          }
        ]
      },
      {
        type: 'section',
        items: [
          { type: 'heading', defaultValue: '言語とプロンプト / Language & Prompt' },
          {
            type: 'select',
            messageKey: 'CFG_LANG',
            label: '言語 / Language',
            defaultValue: 'ja',
            options: [
              { label: '日本語（縦書き）', value: 'ja' },
              { label: 'English', value: 'en' }
            ]
          },
          {
            type: 'textarea',
            messageKey: 'CFG_PROMPT_JA',
            label: 'プロンプト（日本語）',
            defaultValue: DEFAULT_PROMPT_JA,
            attributes: { rows: 10, spellcheck: 'false' },
            description: '使える置き換え: {date} {time} {timeofday} {sun} {daytype} {season} {sekki} {moon} {moonage} ' +
                         '{place} {feel} {weather} {thunder} {weather_change} {apparent} {temp} {humidity} {wind} {rain} {rainsum} {forecast} {tempmax} {tempmin} {pop} ' +
                         '{steps} {activity} {kigo} {kigo_plain} {technique} {kire} {special} {recent} {schedule}<br>' +
                         '{kigo} は本意つきの候補24語、{kigo_plain} は語だけの候補24語です。どちらか一方を使ってください。<br>' +
                         '取得できなかった情報は、その語を含む文ごと自動的に取り除かれます。月は夜で空に出ているときだけ入ります。' +
                         '空欄にすると既定のプロンプトが入ります。'
          },
          {
            type: 'button',
            id: 'reset-prompt-ja',
            defaultValue: '日本語プロンプトを既定に戻す'
          },
          {
            type: 'textarea',
            messageKey: 'CFG_PROMPT_EN',
            label: 'Prompt (English)',
            defaultValue: DEFAULT_PROMPT_EN,
            attributes: { rows: 10, spellcheck: 'false' },
            description: 'Placeholders: {date} {time} {timeofday} {sun} {daytype} {season} {sekki} {moon} {moonage} ' +
                         '{place} {feel} {weather} {thunder} {weather_change} {apparent} {temp} {humidity} {wind} {rain} {rainsum} {forecast} {tempmax} {tempmin} {pop} ' +
                         '{steps} {activity} {kigo} {kigo_plain} {technique} {kire} {special} {recent} {schedule}<br>' +
                         '{kigo} lists twenty-four season words with a short gloss; {kigo_plain} lists the same number of bare words. Use one or the other. ' +
                         'A sentence is dropped when the data it needs is unavailable. The moon is mentioned only at night while it is up. ' +
                         'Leaving the field empty restores the default prompt.'
          },
          {
            type: 'button',
            id: 'reset-prompt-en',
            defaultValue: 'Reset English prompt to default'
          }
        ]
      },
      {
        type: 'section',
        items: [
          { type: 'heading', defaultValue: '詠み直すタイミング / Update schedule' },
          {
            type: 'select',
            messageKey: 'CFG_SCHEDULE',
            label: '新しい句を詠む / Write a new haiku',
            defaultValue: 'auto',
            options: [
              { label: '時間帯が変わるたび / Whenever the time of day changes', value: 'auto' },
              { label: '決まった時刻に / At fixed times', value: 'fixed' }
            ],
            description: '「時間帯が変わるたび」は未明・朝・昼・夕暮れ…の区切りごと（1日10回まで）。<br>' +
                         '"Time of day" writes at each phase of the day (up to 10 a day).'
          },
          {
            type: 'input',
            messageKey: 'CFG_TIME_MORNING',
            label: '朝 / Morning',
            defaultValue: '06:30',
            attributes: { type: 'time' }
          },
          {
            type: 'input',
            messageKey: 'CFG_TIME_NOON',
            label: '昼 / Noon',
            defaultValue: '12:00',
            attributes: { type: 'time' }
          },
          {
            type: 'input',
            messageKey: 'CFG_TIME_EVENING',
            label: '晩 / Evening',
            defaultValue: '18:30',
            attributes: { type: 'time' },
            description: '「決まった時刻に」のときに使います。空欄にした回は詠み直しません（1日1〜3回）。<br>' +
                         'Used with "fixed times". Leave a field empty to skip that update (1 to 3 a day).'
          }
        ]
      },
      {
        type: 'section',
        items: [
          { type: 'heading', defaultValue: '天気 / Weather' },
          {
            type: 'toggle',
            messageKey: 'CFG_WEATHER',
            label: '天気・体感を反映 / Use weather',
            defaultValue: true,
            description: 'Open-Meteo から現在地の気温・体感温度・湿度・風を取得します（APIキー不要）。<br>Fetches temperature, apparent temperature, humidity and wind from Open-Meteo (no API key).'
          },
          {
            type: 'toggle',
            messageKey: 'CFG_PLACE',
            label: '場所を反映 / Use place name',
            defaultValue: true,
            description: '市区レベルの地名だけを LLM に渡します。緯度経度は送りません。<br>Only a city-level place name is sent to the LLM, never the coordinates.'
          },
          {
            type: 'input',
            messageKey: 'CFG_ICS_URL',
            label: '予定を反映 / Calendar (ICS URL)',
            defaultValue: '',
            attributes: { placeholder: 'https://calendar.google.com/calendar/ical/.../basic.ics' },
            description: 'Google カレンダーの「非公開URL（iCal形式）」を貼ると、前後1時間にある予定を1件だけ句の条件に加えます。件名がそのまま LLM に渡ります。空欄なら取得しません。終日予定と繰り返し予定は使いません。<br>' +
                         'Paste the private iCal URL of a calendar. One event within an hour of now is added to the prompt, with its title. All-day and repeating events are ignored.'
          },
          {
            type: 'toggle',
            messageKey: 'CFG_STEPS',
            label: '歩数・活動量を反映 / Use step count',
            defaultValue: true,
            description: 'Pebble Health の今日の歩数を使います。<br>Uses today\'s step count from Pebble Health.'
          }
        ]
      },
      {
        type: 'section',
        items: [
          { type: 'heading', defaultValue: '時刻の書体 / Time font' },
          {
            type: 'select',
            messageKey: 'CFG_TIME_FONT',
            label: '書体 / Font',
            defaultValue: 'kaisho',
            options: [
              { label: '筆文字・楷書 / Brush (kaisho)', value: 'kaisho' },
              { label: '筆文字・行書 / Brush (cursive)', value: 'gyosho' },
              { label: '筆文字・太字 / Brush (bold)', value: 'bold' },
              { label: 'デジタル / Digital', value: 'digital' }
            ]
          }
        ]
      },
      {
        type: 'section',
        items: [
          { type: 'heading', defaultValue: '背景 / Background' },
          {
            type: 'select',
            messageKey: 'CFG_SIDE_INFO',
            label: '短冊の右の表示 / Beside the tanzaku',
            defaultValue: 'none',
            options: [
              { label: 'なし / None', value: 'none' },
              { label: '電池（八分・十分） / Battery', value: 'battery' },
              { label: '天気・気温（晴・十八度） / Weather & temperature', value: 'weather' },
              { label: '歩数（一里半） / Distance walked in ri', value: 'steps' }
            ],
            description: '日本語表示の Pebble Round 2 と Pebble Time 2 で、短冊の右に朱の印と漢数字で出します。天気は位置情報を使い、1時間ごとに更新します。歩数は一里（約3.9km）を半里刻みで表します。<br>Japanese display on Pebble Round 2 and Pebble Time 2 only.'
          },
          {
            type: 'select',
            messageKey: 'CFG_NIGHT_MODE',
            label: '夜の判定 / Night detection',
            defaultValue: 'sun',
            options: [
              { label: '日の出・日の入り（位置情報） / Sunrise & sunset', value: 'sun' },
              { label: '固定時刻 / Fixed hours', value: 'fixed' }
            ],
            description: '位置情報が取得できない場合は固定時刻を使います。<br>Falls back to fixed hours when location is unavailable.'
          },
          {
            type: 'select',
            messageKey: 'CFG_DAY_THEME',
            label: '日中の背景 / Daytime background',
            defaultValue: 'zabuton',
            options: [
              { label: '座布団の紺 / Cushion navy', value: 'zabuton' },
              { label: '畳の緑 / Tatami green', value: 'tatami' },
              { label: '桜（春）桜色に花びら / Sakura pink', value: 'sakura' },
              { label: '若葉（初夏）明るい緑に葉 / Young leaves', value: 'wakaba' },
              { label: '万緑（夏）濃い緑 / Deep summer green', value: 'banryoku' },
              { label: '枯葉（冬）枯葉色に落葉 / Fallen leaves', value: 'kareha' },
              { label: '雪催（冬）灰色に雪 / Snow-gray', value: 'yukimoyoi' }
            ],
            description: '色の名前は季語です。モノクロ機種では白背景になります。<br>Named after season words; monochrome watches use a white background.'
          },
          {
            type: 'select',
            messageKey: 'CFG_NIGHT_THEME',
            label: '夜の背景 / Night background',
            defaultValue: 'yami',
            options: [
              { label: '闇 黒 / Black', value: 'yami' },
              { label: '星月夜（秋）紺に星 / Starry night', value: 'hoshizukiyo' },
              { label: '朧月夜（春）暗い紫 / Hazy moon night', value: 'oborozukiyo' },
              { label: '短夜（夏）暗い青緑 / Short summer night', value: 'mijikayo' },
              { label: '雪の夜（冬）暗い灰色に雪 / Snowy night', value: 'yukiyo' }
            ],
            description: 'モノクロ機種では黒背景になります。<br>Monochrome watches use a black background.'
          },
          {
            type: 'select',
            messageKey: 'CFG_NIGHT_START',
            label: '夜の開始（固定時刻） / Night starts (fixed)',
            defaultValue: '19',
            options: [
              { label: '17:00', value: '17' }, { label: '18:00', value: '18' },
              { label: '19:00', value: '19' }, { label: '20:00', value: '20' },
              { label: '21:00', value: '21' }, { label: '22:00', value: '22' },
              { label: '23:00', value: '23' }, { label: '0:00', value: '0' }
            ]
          },
          {
            type: 'select',
            messageKey: 'CFG_NIGHT_END',
            label: '夜の終了（固定時刻） / Night ends (fixed)',
            defaultValue: '6',
            options: [
              { label: '4:00', value: '4' }, { label: '5:00', value: '5' },
              { label: '6:00', value: '6' }, { label: '7:00', value: '7' },
              { label: '8:00', value: '8' }, { label: '9:00', value: '9' }
            ]
          }
        ]
      },
      {
        type: 'section',
        items: [
          {
            type: 'toggle',
            messageKey: 'CFG_REGEN',
            label: '保存時に俳句を再生成 / Regenerate on save',
            defaultValue: false
          }
        ]
      },
      {
        type: 'submit',
        defaultValue: '保存 / Save'
      }
    ];
  }
};
