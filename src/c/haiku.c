#include <pebble.h>

/*
 * Haiku watchface
 *
 * 和風デザイン: 上部に時刻帯、下に短冊（紙）と筆。
 * 紙の上に LLM が詠んだ今日の俳句を表示する。
 *   日本語: 縦書き 3 行（右から左）
 *   英語  : 横書き 3 行
 * 日本語の描画は端末にインストールされた日本語フォント（システムフォント）に依存する。
 */

#define LINE_MAX 64

// 永続ストレージのキー
#define PERSIST_L1   1
#define PERSIST_L2   2
#define PERSIST_L3   3
#define PERSIST_DATE 4
#define PERSIST_LANG 5
#define PERSIST_DAY_THEME   6
#define PERSIST_NIGHT_START 7
#define PERSIST_NIGHT_END   8
#define PERSIST_NIGHT_MODE  9
#define PERSIST_SUN_RISE    10
#define PERSIST_SUN_SET     11
#define PERSIST_TIME_FONT   12
#define PERSIST_SCHED_MODE  13
#define PERSIST_SCHED_T1    14
#define PERSIST_SCHED_T2    15
#define PERSIST_SCHED_T3    16
#define PERSIST_NIGHT_THEME 17
#define PERSIST_SIDE_INFO   18
#define PERSIST_W_KANJI     19
#define PERSIST_TEMP        20

#define TIME_FONT_KAISHO  0   // 筆文字（楷書）
#define TIME_FONT_GYOSHO  1   // 筆文字（行書）
#define TIME_FONT_BOLD    2   // 筆文字（太字）
#define TIME_FONT_DIGITAL 3   // デジタル（システムフォント）

#define NIGHT_MODE_FIXED 0
#define NIGHT_MODE_SUN   1

// 日中の背景（季語にちなんだ色）
#define THEME_ZABUTON   0   // 座布団の紺
#define THEME_TATAMI    1   // 畳の緑
#define THEME_SAKURA    2   // 桜（春）: 桜色に花びら
#define THEME_WAKABA    3   // 若葉（初夏）: 明るい緑に葉
#define THEME_BANRYOKU  4   // 万緑（夏）: 濃い緑
#define THEME_KAREHA    5   // 枯葉（冬）: 枯葉色に落葉
#define THEME_YUKIMOYOI 6   // 雪催（冬）: 灰色に雪
#define THEME_DAY_MAX   6

// 夜の背景
#define NIGHT_YAMI        0 // 闇: 黒
#define NIGHT_HOSHIZUKIYO 1 // 星月夜（秋）: 紺に星
#define NIGHT_OBOROZUKIYO 2 // 朧月夜（春）: 暗い紫
#define NIGHT_MIJIKAYO    3 // 短夜（夏）: 暗い青緑
#define NIGHT_YUKIYO      4 // 雪の夜（冬）: 暗い灰色に雪
#define NIGHT_MAX         4

#define LANG_JA 0
#define LANG_EN 1

static Window *s_window;
static Layer  *s_canvas;

static char s_lines[3][LINE_MAX];
static char s_date_key[16];      // "YYYY-MM-DD" 俳句を取得した日
static int  s_lang = LANG_JA;
static bool s_has_haiku = false;

// 背景テーマ: 夜は黒、日中は畳の緑 / 座布団の紺
static int  s_day_theme   = THEME_ZABUTON;
static int  s_night_theme = NIGHT_YAMI;
static int  s_night_start = 19;   // この時刻から夜
static int  s_night_end   = 6;    // この時刻から日中
static int  s_night_mode  = NIGHT_MODE_FIXED;  // スマホから日の出時刻が届くと SUN になる
static int  s_sun_rise    = 0;    // 日の出（0:00 からの分）
static int  s_sun_set     = 0;    // 日の入り（0:00 からの分）
static bool s_night = false;      // 描画時に判定

// 短冊の右に出す情報（日本語・大きい画面のみ）。番号は JS の sideInfo と一致させる
#define SIDE_NONE    0
#define SIDE_BATTERY 1
#define SIDE_WEATHER 2
#define SIDE_STEPS   3
#define TEMP_UNKNOWN -999
static int  s_side_info = SIDE_NONE;
static char s_w_kanji[8];             // 天気の一字（UTF-8）
static int  s_temp = TEMP_UNKNOWN;    // 気温（℃）

// 描画中に使う可変色（テーマと昼夜で変わる）
static GColor s_bg;
static GColor s_col_handle, s_col_handle2, s_col_ferrule, s_col_bristle, s_col_outline;

static char s_time_text[8];
static char s_date_text[16];     // "9/6"
static char s_wday_text[16];     // "日曜" / "Sun"
static int  s_wday = 0;          // 0=日 … 6=土

static const char *WDAY_JA[] = {"日", "月", "火", "水", "木", "金", "土"};
static const char *WDAY_EN[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};

static GFont s_font_time;        // デジタル（システム）
static GFont s_font_brush_kaisho;      // 小（rect 144px 用）
static GFont s_font_brush_kaisho_lg;   // 大（180px 以上）
static GFont s_font_brush_gyosho;
static GFont s_font_brush_gyosho_lg;
static GFont s_font_brush_bold;
static GFont s_font_brush_bold_lg;
static int   s_time_font = TIME_FONT_KAISHO;

// 詠み直しのタイミング。0: 時間帯が変わるたび（30分ごとに問い合わせ） 1: 決まった時刻
static int s_sched_mode = 0;
static int s_sched[3] = {-1, -1, -1};   // 決まった時刻（0:00 からの分。-1 は未設定）
static GFont s_font_small;
static GFont s_font_date;        // 日付 18px 太字（basalt など 144px 幅）
static GFont s_font_date_sm;     // 日付 14px 太字（時刻と重なるときの控え）
static GFont s_font_date_lg;     // 日付 24px 太字（emery など 180px 幅以上）
static GFont s_font_g14;
static GFont s_font_g18;
static GFont s_font_g24;

// ─── 色 ──────────────────────────────────────────────────────────────────
#define COLOR_BAND    GColorBlack
#define COLOR_PAPER   GColorWhite
#define COLOR_FRAME   PBL_IF_COLOR_ELSE(GColorWindsorTan, GColorBlack)
#define COLOR_INK     GColorBlack
#define COLOR_HANKO   PBL_IF_COLOR_ELSE(GColorDarkCandyAppleRed, GColorBlack)
#define COLOR_TEXTURE PBL_IF_COLOR_ELSE(GColorLightGray, GColorWhite)

// ─── UTF-8 ユーティリティ ─────────────────────────────────────────────────
static int utf8_char_len(unsigned char b) {
  if (b < 0x80) return 1;
  if ((b & 0xE0) == 0xC0) return 2;
  if ((b & 0xF0) == 0xE0) return 3;
  if ((b & 0xF8) == 0xF0) return 4;
  return 1;
}

static int utf8_count(const char *s) {
  int n = 0;
  while (*s) {
    s += utf8_char_len((unsigned char)*s);
    n++;
  }
  return n;
}

static void draw_hanko(GContext *ctx, int x, int y);
static int today_steps(void);

// ─── 縦書き ──────────────────────────────────────────────────────────────
// 1 列を縦に描く。x は列の左端、y は先頭文字の上端。
static void draw_vertical_line(GContext *ctx, const char *s, GFont font,
                               int x, int y, int col_w, int pitch) {
  char ch[5];
  while (*s) {
    int len = utf8_char_len((unsigned char)*s);
    memcpy(ch, s, len);
    ch[len] = '\0';
    // 縦書きで見栄えの悪い長音記号は縦線に置き換える
    if (strcmp(ch, "ー") == 0) {
      graphics_context_set_stroke_width(ctx, 2);
      graphics_draw_line(ctx, GPoint(x + col_w / 2, y + 3), GPoint(x + col_w / 2, y + pitch - 3));
      graphics_context_set_stroke_width(ctx, 1);
    } else {
      graphics_draw_text(ctx, ch, font, GRect(x, y, col_w, pitch + 6),
                         GTextOverflowModeFill, GTextAlignmentCenter, NULL);
    }
    s += len;
    y += pitch;
  }
}

// 縦書きの俳句を描き、落款を置く余白があれば落款も描く
static void draw_haiku_vertical(GContext *ctx, GRect paper) {
  int n[3];
  int max_len = 1;
  for (int i = 0; i < 3; i++) {
    n[i] = utf8_count(s_lines[i]);
    if (n[i] > max_len) max_len = n[i];
  }

  // 高さに収まる文字ピッチを選び、それに合うフォントを選ぶ
  int avail_h = paper.size.h - 10;
  int pitch = avail_h / max_len;
  GFont font;
  int col_w;
  if (pitch >= 21) {
    pitch = 21; font = s_font_g24; col_w = 24;
  } else if (pitch >= 16) {
    pitch = 16; font = s_font_g18; col_w = 20;
  } else {
    if (pitch > 14) pitch = 14;
    font = s_font_g14; col_w = 16;
  }
  if (pitch < 10) pitch = 10;

  int col_gap = (paper.size.w - 12) / 3;
  int gap_max = col_w + 8 + (paper.size.w > 96 ? (paper.size.w - 96) / 4 : 0);
  if (col_gap > gap_max) col_gap = gap_max;

  // 伝統的な三行書き: 上・中・下の句を少しずつ下げる（収まる範囲で）
  int stagger = (avail_h - max_len * pitch) / 2;
  if (stagger > 10) stagger = 10;
  if (stagger < 0) stagger = 0;

  int right = paper.origin.x + paper.size.w - 6;
  int top = paper.origin.y + 5;
  int last_bottom = top;
  graphics_context_set_text_color(ctx, COLOR_INK);
  for (int i = 0; i < 3; i++) {
    if (!s_lines[i][0]) continue;
    int x = right - col_gap * (i + 1) + (col_gap - col_w) / 2;
    int off = stagger * i;
    if (off + n[i] * pitch > avail_h) off = avail_h - n[i] * pitch;
    if (off < 0) off = 0;
    draw_vertical_line(ctx, s_lines[i], font, x, top + off, col_w, pitch);
    last_bottom = top + off + n[i] * pitch;
  }

  // 落款は最後の句の下（紙の左下）。重なるなら省略する
  const int hanko = 17;
  int hanko_y = paper.origin.y + paper.size.h - 6 - hanko;
  if (last_bottom + 2 <= hanko_y) {
    draw_hanko(ctx, paper.origin.x + 6, hanko_y);
  }
}

// ─── 横書き（英語） ──────────────────────────────────────────────────────
// 全行が収まる最大のフォントを選び、長い行は折り返す。落款は右下に置く。
static void draw_haiku_horizontal(GContext *ctx, GRect paper) {
  const int hanko = 17;
  GRect inner = GRect(paper.origin.x + 8, paper.origin.y + 4, paper.size.w - 16, paper.size.h - 8);

  GFont fonts[3]  = { s_font_g24, s_font_g18, s_font_g14 };
  int   heights[3];
  GFont font = s_font_g14;
  int total_h = 0;

  for (int f = 0; f < 3; f++) {
    total_h = 0;
    for (int i = 0; i < 3; i++) {
      if (!s_lines[i][0]) { heights[i] = 0; continue; }
      GSize sz = graphics_text_layout_get_content_size(s_lines[i], fonts[f],
                   GRect(0, 0, inner.size.w, 200), GTextOverflowModeWordWrap, GTextAlignmentLeft);
      heights[i] = sz.h + 1;
      total_h += heights[i];
    }
    font = fonts[f];
    if (total_h <= inner.size.h) break;
  }

  int y = inner.origin.y + (inner.size.h - total_h) / 2;
  if (y < inner.origin.y) y = inner.origin.y;

  // 落款との重なりを避ける: 文字ブロックを上へ寄せられるなら寄せる
  int hanko_x = paper.origin.x + paper.size.w - 6 - hanko;
  int hanko_y = paper.origin.y + paper.size.h - 6 - hanko;
  bool draw_seal = true;
  if (y + total_h > hanko_y - 2) {
    if (inner.origin.y + total_h <= hanko_y - 2) {
      y = inner.origin.y;
    } else {
      draw_seal = false;
    }
  }

  graphics_context_set_text_color(ctx, COLOR_INK);
  for (int i = 0; i < 3; i++) {
    if (!heights[i]) continue;
    graphics_draw_text(ctx, s_lines[i], font, GRect(inner.origin.x, y - 3, inner.size.w, heights[i] + 4),
                       GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
    y += heights[i];
  }

  if (draw_seal) draw_hanko(ctx, hanko_x, hanko_y);
}

// ─── 装飾 ────────────────────────────────────────────────────────────────
static void draw_paper(GContext *ctx, GRect r) {
  // 影
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, GRect(r.origin.x + 3, r.origin.y + 3, r.size.w, r.size.h), 0, GCornerNone);
  // 枠（掛け軸の縁）
  graphics_context_set_fill_color(ctx, COLOR_FRAME);
  graphics_fill_rect(ctx, r, 0, GCornerNone);
  // 紙
  graphics_context_set_fill_color(ctx, COLOR_PAPER);
  graphics_fill_rect(ctx, grect_inset(r, GEdgeInsets(3)), 0, GCornerNone);

#ifdef PBL_COLOR
  // 和紙の風合い: 薄い点をまばらに散らす（固定シード）
  graphics_context_set_stroke_color(ctx, COLOR_TEXTURE);
  uint32_t seed = 0x1234567u;
  for (int i = 0; i < 40; i++) {
    seed = seed * 1103515245u + 12345u;
    int px = r.origin.x + 4 + (int)((seed >> 8) % (uint32_t)(r.size.w - 8));
    seed = seed * 1103515245u + 12345u;
    int py = r.origin.y + 4 + (int)((seed >> 8) % (uint32_t)(r.size.h - 8));
    graphics_draw_pixel(ctx, GPoint(px, py));
  }
#endif
}

// 落款（赤い印）に日を入れる
static void draw_hanko(GContext *ctx, int x, int y) {
  const int size = 17;
  graphics_context_set_fill_color(ctx, COLOR_HANKO);
  graphics_fill_rect(ctx, GRect(x, y, size, size), 2, GCornersAll);
#ifdef PBL_BW
  graphics_context_set_stroke_color(ctx, GColorWhite);
  graphics_draw_rect(ctx, GRect(x + 1, y + 1, size - 2, size - 2));
#endif
  time_t now = time(NULL);
  struct tm *t = localtime(&now);
  static char day[4];
  snprintf(day, sizeof(day), "%d", t->tm_mday);
  graphics_context_set_text_color(ctx, GColorWhite);
  graphics_draw_text(ctx, day, s_font_small, GRect(x, y - 1, size, size),
                     GTextOverflowModeFill, GTextAlignmentCenter, NULL);
}

// 縦置きの筆。cx は中心 x、top は柄の上端、tip_y は穂先の先端。
static void draw_brush_vertical(GContext *ctx, int cx, int top, int tip_y) {
  const int bristle_h = 26;
  const int ferrule_h = 9;
  int ferrule_y = tip_y - bristle_h - ferrule_h;
  int handle_h = ferrule_y - top;
  if (handle_h < 10) return;

  // 柄
  graphics_context_set_fill_color(ctx, s_col_handle);
  graphics_fill_rect(ctx, GRect(cx - 4, top, 9, handle_h + 2), 4, GCornersTop);
  graphics_context_set_fill_color(ctx, s_col_handle2);
  graphics_fill_rect(ctx, GRect(cx + 2, top + 4, 2, handle_h - 4), 0, GCornerNone);
  // 柄の頭の紐穴
  graphics_context_set_fill_color(ctx, s_bg);
  graphics_fill_circle(ctx, GPoint(cx, top + 4), 1);
#ifdef PBL_BW
  graphics_context_set_stroke_color(ctx, s_col_handle2);
  graphics_draw_line(ctx, GPoint(cx - 2, top + 8), GPoint(cx - 2, ferrule_y - 2));
#endif

  // 口金
  graphics_context_set_fill_color(ctx, s_col_ferrule);
  graphics_fill_rect(ctx, GRect(cx - 5, ferrule_y, 11, ferrule_h), 0, GCornerNone);
  graphics_context_set_stroke_color(ctx, s_col_outline);
  graphics_draw_rect(ctx, GRect(cx - 5, ferrule_y, 11, ferrule_h));

  // 穂（先が細くなる）
  GPoint pts[] = {
    GPoint(cx - 5, ferrule_y + ferrule_h),
    GPoint(cx + 5, ferrule_y + ferrule_h),
    GPoint(cx + 3, ferrule_y + ferrule_h + 10),
    GPoint(cx, tip_y),
    GPoint(cx - 3, ferrule_y + ferrule_h + 10),
  };
  GPathInfo info = { .num_points = 5, .points = pts };
  GPath *path = gpath_create(&info);
  graphics_context_set_fill_color(ctx, s_col_bristle);
  gpath_draw_filled(ctx, path);
#ifdef PBL_BW
  // モノクロでは穂の輪郭を見せる
  graphics_context_set_stroke_color(ctx, s_col_outline);
  gpath_draw_outline(ctx, path);
#endif
  gpath_destroy(path);
#ifdef PBL_COLOR
  // 穂の毛並み
  graphics_context_set_stroke_color(ctx, GColorDarkGray);
  graphics_draw_line(ctx, GPoint(cx - 1, ferrule_y + ferrule_h + 2), GPoint(cx - 1, tip_y - 8));
  graphics_draw_line(ctx, GPoint(cx + 2, ferrule_y + ferrule_h + 2), GPoint(cx + 1, tip_y - 12));
#endif

  // 墨の滴
  graphics_context_set_fill_color(ctx, s_col_bristle);
  graphics_fill_circle(ctx, GPoint(cx + 7, tip_y - 1), 1);
}

// 横置きの筆。cy は中心 y、left は柄の左端、tip_x は穂先の先端。
static void draw_brush_horizontal(GContext *ctx, int cy, int left, int tip_x) {
  const int bristle_w = 26;
  const int ferrule_w = 9;
  int ferrule_x = tip_x - bristle_w - ferrule_w;
  int handle_w = ferrule_x - left;
  if (handle_w < 10) return;

  graphics_context_set_fill_color(ctx, s_col_handle);
  graphics_fill_rect(ctx, GRect(left, cy - 4, handle_w + 2, 9), 4, GCornersLeft);
  graphics_context_set_fill_color(ctx, s_col_handle2);
  graphics_fill_rect(ctx, GRect(left + 4, cy + 2, handle_w - 4, 2), 0, GCornerNone);
  graphics_context_set_fill_color(ctx, s_bg);
  graphics_fill_circle(ctx, GPoint(left + 4, cy), 1);
#ifdef PBL_BW
  graphics_context_set_stroke_color(ctx, s_col_handle2);
  graphics_draw_line(ctx, GPoint(left + 8, cy - 2), GPoint(ferrule_x - 2, cy - 2));
#endif

  graphics_context_set_fill_color(ctx, s_col_ferrule);
  graphics_fill_rect(ctx, GRect(ferrule_x, cy - 5, ferrule_w, 11), 0, GCornerNone);
  graphics_context_set_stroke_color(ctx, s_col_outline);
  graphics_draw_rect(ctx, GRect(ferrule_x, cy - 5, ferrule_w, 11));

  GPoint pts[] = {
    GPoint(ferrule_x + ferrule_w, cy - 5),
    GPoint(ferrule_x + ferrule_w, cy + 5),
    GPoint(ferrule_x + ferrule_w + 10, cy + 3),
    GPoint(tip_x, cy),
    GPoint(ferrule_x + ferrule_w + 10, cy - 3),
  };
  GPathInfo info = { .num_points = 5, .points = pts };
  GPath *path = gpath_create(&info);
  graphics_context_set_fill_color(ctx, s_col_bristle);
  gpath_draw_filled(ctx, path);
#ifdef PBL_BW
  graphics_context_set_stroke_color(ctx, s_col_outline);
  gpath_draw_outline(ctx, path);
#endif
  gpath_destroy(path);
#ifdef PBL_COLOR
  graphics_context_set_stroke_color(ctx, GColorDarkGray);
  graphics_draw_line(ctx, GPoint(ferrule_x + ferrule_w + 2, cy - 1), GPoint(tip_x - 8, cy - 1));
  graphics_draw_line(ctx, GPoint(ferrule_x + ferrule_w + 2, cy + 2), GPoint(tip_x - 12, cy + 1));
#endif

  graphics_context_set_fill_color(ctx, s_col_bristle);
  graphics_fill_circle(ctx, GPoint(tip_x - 1, cy + 7), 1);
}

// ─── テーマ ──────────────────────────────────────────────────────────────
static bool is_night(int hour, int min) {
  if (s_night_mode == NIGHT_MODE_SUN && s_sun_rise != s_sun_set) {
    int now = hour * 60 + min;
    return now < s_sun_rise || now >= s_sun_set;
  }
  if (s_night_start == s_night_end) return false;
  if (s_night_start < s_night_end) return hour >= s_night_start && hour < s_night_end;
  return hour >= s_night_start || hour < s_night_end;
}

static void update_theme_colors(void) {
  time_t now = time(NULL);
  struct tm *t = localtime(&now);
  s_night = is_night(t->tm_hour, t->tm_min);

#ifdef PBL_COLOR
  if (s_night) {
    switch (s_night_theme) {
      case NIGHT_HOSHIZUKIYO: s_bg = GColorOxfordBlue;     break;
      case NIGHT_OBOROZUKIYO: s_bg = GColorImperialPurple; break;
      case NIGHT_MIJIKAYO:    s_bg = GColorMidnightGreen;  break;
      case NIGHT_YUKIYO:      s_bg = GColorDarkGray;       break;
      default:                s_bg = GColorBlack;          break;
    }
  } else {
    switch (s_day_theme) {
      case THEME_TATAMI:    s_bg = GColorArmyGreen;  break;
      case THEME_SAKURA:    s_bg = GColorMelon;      break;
      case THEME_WAKABA:    s_bg = GColorMintGreen;  break;
      case THEME_BANRYOKU:  s_bg = GColorDarkGreen;  break;
      case THEME_KAREHA:    s_bg = GColorBrass;      break;
      case THEME_YUKIMOYOI: s_bg = GColorLightGray;  break;
      default:              s_bg = GColorOxfordBlue; break;
    }
  }
  s_col_handle  = GColorWindsorTan;
  s_col_handle2 = GColorBulgarianRose;
  s_col_ferrule = GColorLightGray;
  s_col_bristle = GColorBlack;
  s_col_outline = GColorBlack;
#else
  if (s_night) {
    // 黒背景では筆を白で描く
    s_bg = GColorBlack;
    s_col_handle  = GColorWhite;
    s_col_handle2 = GColorBlack;
    s_col_ferrule = GColorBlack;
    s_col_bristle = GColorWhite;
    s_col_outline = GColorWhite;
  } else {
    s_bg = GColorWhite;
    s_col_handle  = GColorBlack;
    s_col_handle2 = GColorWhite;
    s_col_ferrule = GColorWhite;
    s_col_bristle = GColorBlack;
    s_col_outline = GColorBlack;
  }
#endif
}

// 背景。畳テーマでは織り目の横線を入れる
#ifdef PBL_COLOR
// 季語のモチーフを背景に散らす（位置は固定シードで毎回同じ）
typedef enum { MOTIF_NONE, MOTIF_DOT, MOTIF_STAR, MOTIF_PETAL, MOTIF_LEAF, MOTIF_FLAKE } Motif;

static void draw_motifs(GContext *ctx, GRect area, Motif motif, GColor color, int count) {
  if (motif == MOTIF_NONE || area.size.w < 8 || area.size.h < 8) return;
  graphics_context_set_stroke_color(ctx, color);
  graphics_context_set_fill_color(ctx, color);
  uint32_t seed = 0x9E3779B9u;
  for (int i = 0; i < count; i++) {
    seed = seed * 1103515245u + 12345u;
    int x = area.origin.x + 3 + (int)((seed >> 8) % (uint32_t)(area.size.w - 6));
    seed = seed * 1103515245u + 12345u;
    int y = area.origin.y + 3 + (int)((seed >> 8) % (uint32_t)(area.size.h - 6));
    switch (motif) {
      case MOTIF_DOT:
        graphics_draw_pixel(ctx, GPoint(x, y));
        break;
      case MOTIF_STAR:   // ほとんどは点、ときどき十字の明るい星
        graphics_draw_pixel(ctx, GPoint(x, y));
        if (i % 5 == 0) {
          graphics_draw_pixel(ctx, GPoint(x - 1, y)); graphics_draw_pixel(ctx, GPoint(x + 1, y));
          graphics_draw_pixel(ctx, GPoint(x, y - 1)); graphics_draw_pixel(ctx, GPoint(x, y + 1));
        }
        break;
      case MOTIF_PETAL:  // 花びら: 小さな十字に中心の抜けた形
        graphics_draw_pixel(ctx, GPoint(x - 1, y)); graphics_draw_pixel(ctx, GPoint(x + 1, y));
        graphics_draw_pixel(ctx, GPoint(x, y - 1)); graphics_draw_pixel(ctx, GPoint(x, y + 1));
        if (i % 3 == 0) graphics_draw_pixel(ctx, GPoint(x, y));
        break;
      case MOTIF_LEAF:   // 葉: 斜めの短い線と葉脈の点
        graphics_draw_line(ctx, GPoint(x, y + 2), GPoint(x + 3, y - 1));
        graphics_draw_pixel(ctx, GPoint(x + 2, y + 1));
        break;
      case MOTIF_FLAKE:  // 雪: 点と、ときどき小さな×
        graphics_draw_pixel(ctx, GPoint(x, y));
        if (i % 4 == 0) {
          graphics_draw_pixel(ctx, GPoint(x - 1, y - 1)); graphics_draw_pixel(ctx, GPoint(x + 1, y + 1));
          graphics_draw_pixel(ctx, GPoint(x - 1, y + 1)); graphics_draw_pixel(ctx, GPoint(x + 1, y - 1));
        }
        break;
      default:
        break;
    }
  }
}
#endif

static void draw_background(GContext *ctx, GRect b, int band_h) {
  graphics_context_set_fill_color(ctx, s_bg);
  graphics_fill_rect(ctx, b, 0, GCornerNone);
#ifdef PBL_COLOR
  GRect area = GRect(0, band_h + 2, b.size.w, b.size.h - band_h - 2);
  if (s_night) {
    switch (s_night_theme) {
      case NIGHT_HOSHIZUKIYO: draw_motifs(ctx, area, MOTIF_STAR,  GColorWhite,     26); break;
      case NIGHT_YUKIYO:      draw_motifs(ctx, area, MOTIF_FLAKE, GColorWhite,     22); break;
      case NIGHT_OBOROZUKIYO: draw_motifs(ctx, area, MOTIF_DOT,   GColorPurpureus, 30); break;
      default: break;
    }
    return;
  }
  switch (s_day_theme) {
    case THEME_TATAMI:
      graphics_context_set_stroke_color(ctx, GColorDarkGreen);
      for (int y = band_h + 3; y < b.size.h; y += 3) {
        graphics_draw_line(ctx, GPoint(0, y), GPoint(b.size.w, y));
      }
      break;
    case THEME_SAKURA:    draw_motifs(ctx, area, MOTIF_PETAL, GColorBrilliantRose, 22); break;
    case THEME_WAKABA:    draw_motifs(ctx, area, MOTIF_LEAF,  GColorKellyGreen,    18); break;
    case THEME_BANRYOKU:  draw_motifs(ctx, area, MOTIF_LEAF,  GColorJaegerGreen,   22); break;
    case THEME_KAREHA:    draw_motifs(ctx, area, MOTIF_LEAF,  GColorWindsorTan,    18); break;
    case THEME_YUKIMOYOI: draw_motifs(ctx, area, MOTIF_FLAKE, GColorWhite,         26); break;
    default: break;
  }
#endif
}

// 画面幅に合わせて筆文字の大きさを選ぶ
static GFont current_time_font(int screen_w) {
  bool large = screen_w >= 180;
  switch (s_time_font) {
    case TIME_FONT_GYOSHO:  return large ? s_font_brush_gyosho_lg : s_font_brush_gyosho;
    case TIME_FONT_BOLD:    return large ? s_font_brush_bold_lg : s_font_brush_bold;
    case TIME_FONT_DIGITAL: return s_font_time;
    default:                return large ? s_font_brush_kaisho_lg : s_font_brush_kaisho;
  }
}

// 時刻を帯の中で縦方向に中央揃えして描く
// 描いた時刻の右端の x を返す（日付との重なり判定に使う）
static int draw_time_text(GContext *ctx, GRect box, GTextAlignment align, int screen_w) {
  GFont font = current_time_font(screen_w);
  GSize sz = graphics_text_layout_get_content_size(s_time_text, font,
               GRect(0, 0, box.size.w, 80), GTextOverflowModeFill, align);
  int y = box.origin.y + (box.size.h - sz.h) / 2;
  graphics_draw_text(ctx, s_time_text, font,
                     GRect(box.origin.x, y, box.size.w, sz.h + 6),
                     GTextOverflowModeFill, align, NULL);
  if (align == GTextAlignmentCenter) return box.origin.x + (box.size.w + sz.w) / 2;
  return box.origin.x + sz.w;
}

// emery (200px 幅) 用: 日付と曜日を1段で大きく描く。「12/31(日)」「Thu 12/31」
static void draw_date_line(GContext *ctx, int right, int band_h, int time_right) {
  static char line[40];
  if (s_lang == LANG_JA) snprintf(line, sizeof(line), "%s(%s)", s_date_text, WDAY_JA[s_wday]);
  else                   snprintf(line, sizeof(line), "%s %s", s_wday_text, s_date_text);

  GFont font = s_font_date_lg;
  int line_h = 28;
  GSize sz = graphics_text_layout_get_content_size(line, font, GRect(0, 0, 160, 40),
                                                   GTextOverflowModeFill, GTextAlignmentRight);
  if (right - sz.w < time_right + 4) {   // 時刻と重なる日は 18px に落とす
    font = s_font_date; line_h = 22;
  }
  int left = time_right + 2;
  graphics_draw_text(ctx, line, font, GRect(left, (band_h - line_h) / 2 - 2, right - left, line_h + 4),
                     GTextOverflowModeFill, GTextAlignmentRight, NULL);
}

// 日付と曜日を右寄せで2段に描く。画面幅で字の大きさを変え、
// 時刻と重なるなら一段小さい字にする
static void draw_date_stack(GContext *ctx, int right, int band_h, int time_right, bool large) {
  GFont f1, f2, f1_small, f2_small;
  int line_h, line_h_small;
  if (large) {   // emery (200px 幅)
    f1 = s_font_date_lg; f2 = s_font_g24; line_h = 27;
    f1_small = s_font_date; f2_small = s_font_g18; line_h_small = 22;
  } else {       // basalt / diorite (144px 幅)
    f1 = s_font_date; f2 = s_font_g18; line_h = 22;
    f1_small = s_font_date_sm; f2_small = s_font_g14; line_h_small = 17;
  }
  GSize d = graphics_text_layout_get_content_size(s_date_text, f1, GRect(0, 0, 120, 40),
                                                  GTextOverflowModeFill, GTextAlignmentRight);
  GSize wd = graphics_text_layout_get_content_size(s_wday_text, f2, GRect(0, 0, 120, 40),
                                                   GTextOverflowModeFill, GTextAlignmentRight);
  int widest = d.w > wd.w ? d.w : wd.w;
  if (right - widest < time_right + 4) {
    f1 = f1_small; f2 = f2_small; line_h = line_h_small;
  }
  int total = line_h * 2;
  int y = (band_h - total) / 2 - 2;
  int left = time_right + 2;
  graphics_draw_text(ctx, s_date_text, f1, GRect(left, y, right - left, line_h + 4),
                     GTextOverflowModeFill, GTextAlignmentRight, NULL);
  graphics_draw_text(ctx, s_wday_text, f2, GRect(left, y + line_h, right - left, line_h + 4),
                     GTextOverflowModeFill, GTextAlignmentRight, NULL);
}

// ─── 描画 ────────────────────────────────────────────────────────────────

// ─── 短冊の右の情報 ──────────────────────────────────────────────────────
// 朱の丸印に一字、その下に漢数字を縦に並べる。電池「八分」、気温「十八度」、道のり「一里半」

static const char *KANJI_DIGIT[10] = { "零", "一", "二", "三", "四", "五", "六", "七", "八", "九" };

// 0〜99 を漢数字にして buf に足す（十・十五・二十・二十三）
static void append_kanji_number(char *buf, size_t size, int n) {
  if (n < 0) n = 0;
  if (n > 99) n = 99;
  size_t len = strlen(buf);
  if (n < 10) {
    snprintf(buf + len, size - len, "%s", KANJI_DIGIT[n]);
    return;
  }
  int tens = n / 10, ones = n % 10;
  snprintf(buf + len, size - len, "%s十%s", tens > 1 ? KANJI_DIGIT[tens] : "", ones ? KANJI_DIGIT[ones] : "");
}

// 印の字と縦に並べる文を作る。出すものが無ければ false
static bool side_info_text(char *seal, size_t seal_size, char *text, size_t text_size) {
  text[0] = '\0';
  switch (s_side_info) {
    case SIDE_BATTERY: {
      // 一割を「一分」とする（八分目の言い方）。満充電は「十分」
      int tenths = (battery_state_service_peek().charge_percent + 5) / 10;
      snprintf(seal, seal_size, "電");
      append_kanji_number(text, text_size, tenths);
      strncat(text, "分", text_size - strlen(text) - 1);
      return true;
    }
    case SIDE_WEATHER: {
      if (s_temp == TEMP_UNKNOWN || !s_w_kanji[0]) return false;
      snprintf(seal, seal_size, "%s", s_w_kanji);
      if (s_temp < 0) strncat(text, "零下", text_size - 1);
      append_kanji_number(text, text_size, s_temp < 0 ? -s_temp : s_temp);
      strncat(text, "度", text_size - strlen(text) - 1);
      return true;
    }
    case SIDE_STEPS: {
      int meters = -1;
#if defined(PBL_HEALTH)
      HealthServiceAccessibilityMask ok = health_service_metric_accessible(
          HealthMetricWalkedDistanceMeters, time_start_of_today(), time(NULL));
      if (ok & HealthServiceAccessibilityMaskAvailable) {
        meters = (int)health_service_sum_today(HealthMetricWalkedDistanceMeters);
      }
#endif
      if (meters < 0) {
        int steps = today_steps();
        if (steps < 0) return false;
        meters = steps * 7 / 10;   // 歩幅 0.7m とみなす
      }
      // 一里 = 約3927m。半里刻みで切り捨てる
      int halves = meters * 2 / 3927;
      snprintf(seal, seal_size, "歩");
      if (halves == 0) {
        snprintf(text, text_size, "半里未満");
      } else if (halves == 1) {
        snprintf(text, text_size, "半里");
      } else {
        append_kanji_number(text, text_size, halves / 2);
        strncat(text, halves % 2 ? "里半" : "里", text_size - strlen(text) - 1);
      }
      return true;
    }
  }
  return false;
}

// cx は列の中心、cy は印の中心。bottom を越える字は描かない
static void draw_side_info(GContext *ctx, int cx, int cy, int r, int bottom) {
  char seal[8], text[32];
  if (!side_info_text(seal, sizeof(seal), text, sizeof(text))) return;

  graphics_context_set_fill_color(ctx, COLOR_HANKO);
  graphics_fill_circle(ctx, GPoint(cx, cy), r);
  graphics_context_set_text_color(ctx, GColorWhite);
  graphics_draw_text(ctx, seal, s_font_g18, GRect(cx - r, cy - r + 1, r * 2, r * 2 + 4),
                     GTextOverflowModeFill, GTextAlignmentCenter, NULL);

  // 長い文（零下十八度など）は小さい字で詰める
  int n = utf8_count(text);
  int y = cy + r + 4;
  GFont font = s_font_g18;
  int col_w = 20, pitch = 18;
  if (y + n * pitch > bottom) { font = s_font_g14; col_w = 16; pitch = 14; }
  while (n > 0 && y + n * pitch > bottom) n--;
  graphics_context_set_text_color(ctx, gcolor_legible_over(s_bg));
  draw_vertical_line(ctx, text, font, cx - col_w / 2, y - 4, col_w, pitch);
}

static void canvas_update_proc(Layer *layer, GContext *ctx) {
  GRect b = layer_get_bounds(layer);
  const int w = b.size.w;
  const int h = b.size.h;
  const bool round = PBL_IF_ROUND_ELSE(true, false);

  const bool large = !round && w >= 180;          // emery
  // 丸画面の寸法は chalk (180px) を基準に画面幅に比例させる。gabbro (260px) では約1.44倍
  const int rs = round ? w : 180;
#define RS(v) ((v) * rs / 180)
  // gabbro は時刻帯を比例より詰め、その分だけ短冊を縦に伸ばす（縦書きで 24px の字が使えるように）
  const bool big_round = round && w >= 220;
  const int band_h = round ? (big_round ? 72 : RS(58)) : 44;

  update_theme_colors();
  draw_background(ctx, b, band_h);

  // ── 時刻帯 ──
  graphics_context_set_fill_color(ctx, COLOR_BAND);
  graphics_fill_rect(ctx, GRect(0, 0, w, band_h), 0, GCornerNone);
  graphics_context_set_text_color(ctx, GColorWhite);
  if (round) {
    draw_time_text(ctx, GRect(0, 0, w, band_h - RS(22)), GTextAlignmentCenter, w);
    static char line[32];
    if (s_lang == LANG_JA) snprintf(line, sizeof(line), "%s %s", s_date_text, s_wday_text);
    else                   snprintf(line, sizeof(line), "%s %s", s_wday_text, s_date_text);
    GFont date_font = w >= 220 ? s_font_date_lg : s_font_date;   // gabbro は一回り大きい字
    graphics_draw_text(ctx, line, date_font, GRect(0, band_h - RS(26), w, RS(24) + 4),
                       GTextOverflowModeFill, GTextAlignmentCenter, NULL);
  } else {
    int time_right = draw_time_text(ctx, GRect(6, 0, w - 12, band_h), GTextAlignmentLeft, w);
    if (large) draw_date_line(ctx, w - 6, band_h, time_right);        // emery: 1段で大きく
    else       draw_date_stack(ctx, w - 6, band_h, time_right, false); // basalt: 2段
  }
  // 帯の下の細い朱線
  graphics_context_set_fill_color(ctx, COLOR_HANKO);
  graphics_fill_rect(ctx, GRect(0, band_h, w, 2), 0, GCornerNone);

  // ── 紙と筆 ──
  int top = band_h + 2;
  if (s_lang == LANG_JA) {
    GRect paper;
    int brush_cx;
    // 短冊の右に情報を出すのは、右に一列分の余地がある Round 2 と Time 2 だけ
    const bool side = s_side_info != SIDE_NONE && (big_round || (!round && w >= 200));
    if (round) {
      paper = GRect(w / 2 - RS(34), top + 4, RS(78), h - top - (big_round ? 26 : RS(30)));
      brush_cx = paper.origin.x - RS(18);
    } else {
      // Time 2 は短冊を細くして右に列を空ける
      paper = GRect(42, top + 6, w - 42 - (side ? 38 : 8), h - top - 12);
      brush_cx = 20;
    }
    draw_paper(ctx, paper);
    if (side) {
      int right = paper.origin.x + paper.size.w;
      int cx = big_round ? right + 24 : right + (w - right) / 2;
      draw_side_info(ctx, cx, top + (big_round ? 30 : 20), big_round ? 13 : 12,
                     big_round ? h - 50 : h - 8);
    }
    if (s_has_haiku) {
      draw_haiku_vertical(ctx, paper);
    } else {
      draw_hanko(ctx, paper.origin.x + 6, paper.origin.y + paper.size.h - 6 - 17);
    }
    draw_brush_vertical(ctx, brush_cx, round ? top + RS(22) : top + 2,
                        round ? h - RS(40) : h - 5);
  } else {
    GRect paper;
    if (round) {
      paper = GRect(RS(26), top + 4, w - RS(52), h - top - (big_round ? 58 : RS(52)));
      draw_paper(ctx, paper);
      if (s_has_haiku) draw_haiku_horizontal(ctx, paper);
      else draw_hanko(ctx, paper.origin.x + paper.size.w - 6 - 17, paper.origin.y + paper.size.h - 6 - 17);
      draw_brush_horizontal(ctx, h - RS(30), RS(52), w - RS(52));
    } else {
      paper = GRect(8, top + 6, w - 16, h - top - 42);
      draw_paper(ctx, paper);
      if (s_has_haiku) draw_haiku_horizontal(ctx, paper);
      else draw_hanko(ctx, paper.origin.x + paper.size.w - 6 - 17, paper.origin.y + paper.size.h - 6 - 17);
      draw_brush_horizontal(ctx, h - 16, 10, w - 8);
    }
  }
}

#undef RS

// ─── 時刻 ────────────────────────────────────────────────────────────────

static void update_time(void) {
  time_t now = time(NULL);
  struct tm *t = localtime(&now);
  strftime(s_time_text, sizeof(s_time_text), clock_is_24h_style() ? "%H:%M" : "%I:%M", t);
  snprintf(s_date_text, sizeof(s_date_text), "%d/%d", t->tm_mon + 1, t->tm_mday);
  s_wday = t->tm_wday;
  if (s_lang == LANG_JA) {
    snprintf(s_wday_text, sizeof(s_wday_text), "%s曜", WDAY_JA[t->tm_wday]);
  } else {
    snprintf(s_wday_text, sizeof(s_wday_text), "%s", WDAY_EN[t->tm_wday]);
  }
  layer_mark_dirty(s_canvas);
}

static void set_placeholder(void) {
  if (s_lang == LANG_JA) {
    strcpy(s_lines[0], "俳句を");
    strcpy(s_lines[1], "取得中");
    s_lines[2][0] = '\0';
  } else {
    strcpy(s_lines[0], "Waiting for");
    strcpy(s_lines[1], "today's haiku...");
    s_lines[2][0] = '\0';
  }
  s_has_haiku = true;
}

// ─── AppMessage ──────────────────────────────────────────────────────────
// Pebble Health の今日の歩数。取れない機種・未設定なら -1
static int today_steps(void) {
#if defined(PBL_HEALTH)
  HealthServiceAccessibilityMask ok = health_service_metric_accessible(
      HealthMetricStepCount, time_start_of_today(), time(NULL));
  if (ok & HealthServiceAccessibilityMaskAvailable) {
    return (int)health_service_sum_today(HealthMetricStepCount);
  }
#endif
  return -1;
}

static void request_haiku(void) {
  DictionaryIterator *iter;
  if (app_message_outbox_begin(&iter) != APP_MSG_OK) return;
  dict_write_uint8(iter, MESSAGE_KEY_REQUEST_HAIKU, 1);
  dict_write_int32(iter, MESSAGE_KEY_STEPS, today_steps());
  app_message_outbox_send();
}

static void inbox_received(DictionaryIterator *iter, void *context) {
  Tuple *lang_t = dict_find(iter, MESSAGE_KEY_LANG);
  Tuple *stat_t = dict_find(iter, MESSAGE_KEY_STATUS);
  Tuple *l1 = dict_find(iter, MESSAGE_KEY_HAIKU_L1);
  Tuple *l2 = dict_find(iter, MESSAGE_KEY_HAIKU_L2);
  Tuple *l3 = dict_find(iter, MESSAGE_KEY_HAIKU_L3);
  Tuple *date_t = dict_find(iter, MESSAGE_KEY_HAIKU_DATE);

  if (lang_t) {
    s_lang = lang_t->value->int32 == LANG_EN ? LANG_EN : LANG_JA;
    persist_write_int(PERSIST_LANG, s_lang);
  }

  Tuple *theme_t = dict_find(iter, MESSAGE_KEY_DAY_THEME);
  Tuple *ns_t = dict_find(iter, MESSAGE_KEY_NIGHT_START);
  Tuple *ne_t = dict_find(iter, MESSAGE_KEY_NIGHT_END);
  if (theme_t) {
    int v = (int)theme_t->value->int32;
    s_day_theme = (v >= 0 && v <= THEME_DAY_MAX) ? v : THEME_ZABUTON;
    persist_write_int(PERSIST_DAY_THEME, s_day_theme);
  }
  Tuple *nt_t = dict_find(iter, MESSAGE_KEY_NIGHT_THEME);
  if (nt_t) {
    int v = (int)nt_t->value->int32;
    s_night_theme = (v >= 0 && v <= NIGHT_MAX) ? v : NIGHT_YAMI;
    persist_write_int(PERSIST_NIGHT_THEME, s_night_theme);
  }
  if (ns_t) {
    int v = (int)ns_t->value->int32;
    if (v >= 0 && v <= 23) { s_night_start = v; persist_write_int(PERSIST_NIGHT_START, v); }
  }
  if (ne_t) {
    int v = (int)ne_t->value->int32;
    if (v >= 0 && v <= 23) { s_night_end = v; persist_write_int(PERSIST_NIGHT_END, v); }
  }
  Tuple *tf_t = dict_find(iter, MESSAGE_KEY_TIME_FONT);
  if (tf_t) {
    int v = (int)tf_t->value->int32;
    if (v >= TIME_FONT_KAISHO && v <= TIME_FONT_DIGITAL) {
      s_time_font = v;
      persist_write_int(PERSIST_TIME_FONT, v);
    }
  }
  Tuple *sm_t = dict_find(iter, MESSAGE_KEY_SCHED_MODE);
  if (sm_t) {
    s_sched_mode = sm_t->value->int32 == 1 ? 1 : 0;
    persist_write_int(PERSIST_SCHED_MODE, s_sched_mode);
  }
  const uint32_t sched_keys[3] = { MESSAGE_KEY_SCHED_T1, MESSAGE_KEY_SCHED_T2, MESSAGE_KEY_SCHED_T3 };
  for (int i = 0; i < 3; i++) {
    Tuple *st = dict_find(iter, sched_keys[i]);
    if (!st) continue;
    int v = (int)st->value->int32;
    s_sched[i] = (v >= 0 && v < 1440) ? v : -1;
    persist_write_int(PERSIST_SCHED_T1 + i, s_sched[i]);
  }
  Tuple *mode_t = dict_find(iter, MESSAGE_KEY_NIGHT_MODE);
  Tuple *rise_t = dict_find(iter, MESSAGE_KEY_SUN_RISE);
  Tuple *set_t  = dict_find(iter, MESSAGE_KEY_SUN_SET);
  if (mode_t) {
    s_night_mode = mode_t->value->int32 == NIGHT_MODE_SUN ? NIGHT_MODE_SUN : NIGHT_MODE_FIXED;
    persist_write_int(PERSIST_NIGHT_MODE, s_night_mode);
  }
  if (rise_t && set_t) {
    int r = (int)rise_t->value->int32, st = (int)set_t->value->int32;
    if (r >= 0 && r < 1440 && st >= 0 && st < 1440) {
      s_sun_rise = r; s_sun_set = st;
      persist_write_int(PERSIST_SUN_RISE, r);
      persist_write_int(PERSIST_SUN_SET, st);
    }
  }

  Tuple *side_t = dict_find(iter, MESSAGE_KEY_SIDE_INFO);
  if (side_t) {
    int v = (int)side_t->value->int32;
    if (v >= SIDE_NONE && v <= SIDE_STEPS && v != s_side_info) {
      s_side_info = v;
      persist_write_int(PERSIST_SIDE_INFO, v);
    }
  }
  Tuple *wk_t = dict_find(iter, MESSAGE_KEY_WEATHER_KANJI);
  Tuple *temp_t = dict_find(iter, MESSAGE_KEY_TEMP);
  if (wk_t && temp_t) {
    strncpy(s_w_kanji, wk_t->value->cstring, sizeof(s_w_kanji) - 1);
    s_temp = (int)temp_t->value->int32;
    persist_write_string(PERSIST_W_KANJI, s_w_kanji);
    persist_write_int(PERSIST_TEMP, s_temp);
  }

  // 俳句本文を含まない（テーマ設定のみの）メッセージはここで終わり
  if (!l1 && !l2 && !l3) {
    update_time();
    return;
  }

  int status = stat_t ? (int)stat_t->value->int32 : 0;
  if (status != 0) {
    // エラー: 既に俳句があればそれを残し、無ければエラー文を紙に出す
    APP_LOG(APP_LOG_LEVEL_WARNING, "haiku error: %s", l1 ? l1->value->cstring : "?");
    if (!persist_exists(PERSIST_L1)) {
      s_lines[0][0] = s_lines[1][0] = s_lines[2][0] = '\0';
      if (l1) strncpy(s_lines[0], l1->value->cstring, LINE_MAX - 1);
      s_has_haiku = true;
      // 英語の1行エラー文は横書きの方が読みやすい
    }
    update_time();
    return;
  }

  s_lines[0][0] = s_lines[1][0] = s_lines[2][0] = '\0';
  if (l1) strncpy(s_lines[0], l1->value->cstring, LINE_MAX - 1);
  if (l2) strncpy(s_lines[1], l2->value->cstring, LINE_MAX - 1);
  if (l3) strncpy(s_lines[2], l3->value->cstring, LINE_MAX - 1);
  if (date_t) strncpy(s_date_key, date_t->value->cstring, sizeof(s_date_key) - 1);
  s_has_haiku = true;

  persist_write_string(PERSIST_L1, s_lines[0]);
  persist_write_string(PERSIST_L2, s_lines[1]);
  persist_write_string(PERSIST_L3, s_lines[2]);
  persist_write_string(PERSIST_DATE, s_date_key);

  update_time();
}

static void inbox_dropped(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_WARNING, "inbox dropped: %d", (int)reason);
}

// ─── 手首を叩く → 今日の句と日の出時刻を再取得 ───────────────────────────
static time_t s_last_request = 0;

// 連打や腕の動きで何度も通信しないよう間隔を空ける
static void request_haiku_throttled(int min_interval_sec) {
  time_t now = time(NULL);
  if (s_last_request != 0 && now - s_last_request < min_interval_sec) return;
  s_last_request = now;
  request_haiku();
}

// 短冊の右に天気を出しているとき、天気の取り直しを頼む
static void request_weather(void) {
  if (s_side_info != SIDE_WEATHER || s_lang != LANG_JA) return;
  DictionaryIterator *iter;
  if (app_message_outbox_begin(&iter) != APP_MSG_OK) return;
  dict_write_uint8(iter, MESSAGE_KEY_REQUEST_WEATHER, 1);
  app_message_outbox_send();
}

static void battery_handler(BatteryChargeState state) {
  if (s_side_info == SIDE_BATTERY) layer_mark_dirty(s_canvas);
}

static void tap_handler(AccelAxisType axis, int32_t direction) {
  request_haiku_throttled(60);
}

// ─── Tick ────────────────────────────────────────────────────────────────
static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  update_time();
  // 句の問い合わせ（毎正時・30分）と重ならない 15 分に、1時間ごとに天気を取り直す
  if (tick_time->tm_min == 15) request_weather();
  if (units_changed & DAY_UNIT) {
    request_haiku_throttled(60);
    return;
  }
  int now_min = tick_time->tm_hour * 60 + tick_time->tm_min;
  if (s_sched_mode == 1) {
    // 決まった時刻: その分と次の分に問い合わせる（スマホと時計の秒差を吸収）。
    // 取りこぼしに備えて毎正時にも問い合わせる
    for (int i = 0; i < 3; i++) {
      if (s_sched[i] >= 0 && (now_min == s_sched[i] || now_min == s_sched[i] + 1)) {
        request_haiku_throttled(50);
        return;
      }
    }
    if (tick_time->tm_min == 0) request_haiku_throttled(900);
    return;
  }
  // 時間帯が変わるたび: 30分ごとに問い合わせる。時間帯が変わっていなければ
  // スマホ側が手元の句をそのまま返すので、通信は AppMessage 1 往復で済む
  if (tick_time->tm_min == 0 || tick_time->tm_min == 30) {
    request_haiku_throttled(900);
  }
}

static void startup_request(void *data) {
  // 保存済みの俳句が今日のものでなければ取得を依頼する
  time_t now = time(NULL);
  struct tm *t = localtime(&now);
  char today[16];
  strftime(today, sizeof(today), "%Y-%m-%d", t);
  if (strcmp(today, s_date_key) != 0) {
    request_haiku_throttled(0);
  } else if (s_temp == TEMP_UNKNOWN) {
    request_weather();
  }
}

// ─── Window ──────────────────────────────────────────────────────────────
static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_font_time  = fonts_get_system_font(FONT_KEY_LECO_32_BOLD_NUMBERS);
  s_font_brush_kaisho    = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_BRUSH_KAISHO_26));
  s_font_brush_kaisho_lg = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_BRUSH_KAISHO_34));
  s_font_brush_gyosho    = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_BRUSH_GYOSHO_26));
  s_font_brush_gyosho_lg = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_BRUSH_GYOSHO_34));
  s_font_brush_bold      = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_BRUSH_BOLD_26));
  s_font_brush_bold_lg   = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_BRUSH_BOLD_34));
  s_font_small = fonts_get_system_font(FONT_KEY_GOTHIC_14);
  s_font_date    = fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);
  s_font_date_sm = fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD);
  s_font_date_lg = fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD);
  s_font_g14   = fonts_get_system_font(FONT_KEY_GOTHIC_14);
  s_font_g18   = fonts_get_system_font(FONT_KEY_GOTHIC_18);
  s_font_g24   = fonts_get_system_font(FONT_KEY_GOTHIC_24);

  s_canvas = layer_create(bounds);
  layer_set_update_proc(s_canvas, canvas_update_proc);
  layer_add_child(root, s_canvas);

  update_time();
}

static void window_unload(Window *window) {
  layer_destroy(s_canvas);
  fonts_unload_custom_font(s_font_brush_kaisho);
  fonts_unload_custom_font(s_font_brush_kaisho_lg);
  fonts_unload_custom_font(s_font_brush_gyosho);
  fonts_unload_custom_font(s_font_brush_gyosho_lg);
  fonts_unload_custom_font(s_font_brush_bold);
  fonts_unload_custom_font(s_font_brush_bold_lg);
}

static void init(void) {
  if (persist_exists(PERSIST_LANG)) {
    s_lang = persist_read_int(PERSIST_LANG) == LANG_EN ? LANG_EN : LANG_JA;
  }
  if (persist_exists(PERSIST_DAY_THEME))   s_day_theme   = persist_read_int(PERSIST_DAY_THEME);
  if (persist_exists(PERSIST_NIGHT_THEME)) s_night_theme = persist_read_int(PERSIST_NIGHT_THEME);
  if (s_day_theme < 0 || s_day_theme > THEME_DAY_MAX) s_day_theme = THEME_ZABUTON;
  if (s_night_theme < 0 || s_night_theme > NIGHT_MAX) s_night_theme = NIGHT_YAMI;
  if (persist_exists(PERSIST_NIGHT_START)) s_night_start = persist_read_int(PERSIST_NIGHT_START);
  if (persist_exists(PERSIST_NIGHT_END))   s_night_end   = persist_read_int(PERSIST_NIGHT_END);
  if (persist_exists(PERSIST_NIGHT_MODE))  s_night_mode  = persist_read_int(PERSIST_NIGHT_MODE);
  if (persist_exists(PERSIST_SUN_RISE))    s_sun_rise    = persist_read_int(PERSIST_SUN_RISE);
  if (persist_exists(PERSIST_SUN_SET))     s_sun_set     = persist_read_int(PERSIST_SUN_SET);
  if (persist_exists(PERSIST_TIME_FONT))   s_time_font   = persist_read_int(PERSIST_TIME_FONT);
  if (persist_exists(PERSIST_SCHED_MODE))  s_sched_mode  = persist_read_int(PERSIST_SCHED_MODE);
  for (int i = 0; i < 3; i++) {
    if (persist_exists(PERSIST_SCHED_T1 + i)) s_sched[i] = persist_read_int(PERSIST_SCHED_T1 + i);
  }
  if (persist_exists(PERSIST_SIDE_INFO))   s_side_info   = persist_read_int(PERSIST_SIDE_INFO);
  if (s_side_info < SIDE_NONE || s_side_info > SIDE_STEPS) s_side_info = SIDE_NONE;
  if (persist_exists(PERSIST_TEMP) && persist_exists(PERSIST_W_KANJI)) {
    s_temp = persist_read_int(PERSIST_TEMP);
    persist_read_string(PERSIST_W_KANJI, s_w_kanji, sizeof(s_w_kanji));
  }
  update_theme_colors();
  if (persist_exists(PERSIST_L1)) {
    persist_read_string(PERSIST_L1, s_lines[0], LINE_MAX);
    persist_read_string(PERSIST_L2, s_lines[1], LINE_MAX);
    persist_read_string(PERSIST_L3, s_lines[2], LINE_MAX);
    persist_read_string(PERSIST_DATE, s_date_key, sizeof(s_date_key));
    s_has_haiku = true;
  } else {
    set_placeholder();
  }

  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = window_load,
    .unload = window_unload,
  });
  window_stack_push(s_window, true);

  app_message_register_inbox_received(inbox_received);
  app_message_register_inbox_dropped(inbox_dropped);
  app_message_open(512, 64);

  tick_timer_service_subscribe(MINUTE_UNIT | DAY_UNIT, tick_handler);
  accel_tap_service_subscribe(tap_handler);
  battery_state_service_subscribe(battery_handler);
  app_timer_register(4000, startup_request, NULL);
}

static void deinit(void) {
  accel_tap_service_unsubscribe();
  battery_state_service_unsubscribe();
  tick_timer_service_unsubscribe();
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
