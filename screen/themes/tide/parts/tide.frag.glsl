// 夜潮 · light on a near-black base: glowing wave fronts, fbm filaments on the
// backwash, an afterglow where the water has been. The text is a texture the
// waves carry away. Ported verbatim from echo's tide.js (NW = 6 waves).
precision highp float;
uniform vec2  uRes;
uniform float uT, uBeat;
uniform vec4  uWA[6];     // tt(已过秒数,<0=还没到), reach, seed, Tu
uniform vec4  uWB[6];     // Tb, 厚度, isLineWave, -
uniform sampler2D uTex;       // R 当前句(锐) G 当前句(糊=光晕) B 上一句(锐,等着被带走)
uniform sampler2D uBirth;     // 每个字"何时被唱到"(R 当前句 / G 上一句),编码 = 行内秒数 / SPAN
uniform vec2  uClock;         // 行内时钟:x 当前句, y 上一句
uniform vec2  uSpan;          // 编码量程(秒):按每句实际唱多长定,8bit 才够细
uniform vec3  uAccent;

const vec3 BASE = vec3(0.010, 0.014, 0.045);

float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.,0.)), c = hash(i + vec2(0.,1.)), d = hash(i + vec2(1.,1.));
  vec2 u = f*f*(3.-2.*f); return mix(mix(a,b,u.x), mix(c,d,u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a*noise(p); p = p*2.03 + 1.7; a *= .5; } return v; }
// 多尺度的"脊":每一层都取噪声的折痕,叠起来是粗细连续变化的光丝,没有任何硬边
float ridged(vec2 p){ float v = 0., a = .55;
  for (int i = 0; i < 4; i++){ float n = 1. - abs(2.*noise(p) - 1.); v += a*n*n; p = p*2.11 + 3.3; a *= .5; } return v; }
float baseLine(float x){ return 0.17 + 0.022 * sin(x * 2.1 + uT * 0.33) + 0.05 * (fbm(vec2(x * 1.3, uT * 0.05)) - 0.5); }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  float x = uv.x * aspect, v = 1. - uv.y;          // v: 0=上(水来的方向) → 1=下
  float b = baseLine(x);

  float W = b, glow = 0., flashAg = 0., reachBand = 0., crest = 0.;
  float topK = 0., topFoam = 0.5, active = 0.;
  float passAge = -1., wiping = 0.;                // 换句浪前缘扫过这一点多久了(擦旧字用)
  for (int i = 0; i < 6; i++) {
    float tt = uWA[i].x, R = uWA[i].y, seed = uWA[i].z, Tu = uWA[i].w, Tb = uWB[i].x;   // tt = 这阵浪已经走了多久(JS 侧算好,免得大数相减丢精度)
    if (R <= 0.) continue;
    float lobe = 0.74 + 0.52 * fbm(vec2(x * 1.6 + seed * 17.3, seed * 3.1));
    float Rx = b + (R - b) * lobe;
    if (tt < 0.) {                                 // 还没到:远处一道柔光向这边推
      float k = clamp(1. + tt / 1.8, 0., 1.);
      float c = mix(-0.08, b - 0.01, k * k) + 0.05 * (fbm(vec2(x * 1.1 + seed * 5., seed)) - 0.5);
      crest = max(crest, exp(-abs(v - c) / (0.012 + 0.02 * k)) * k * (0.45 + 0.9 * fbm(vec2(x * 5. + seed, uT * 0.4))));
      continue;
    }
    float f, kB = 0.;
    if (tt < Tu) { float k = tt / Tu; f = b + (Rx - b) * (1. - pow(1. - k, 2.4)); }
    else { kB = min((tt - Tu) / Tb, 1.); f = b + (Rx - b) * (1. - kB * kB); }
    if (f > W) { W = f; topK = kB; topFoam = uWB[i].y; active = 1.; }
    // 前缘何时扫过这一点(上冲函数反解)
    if (uWB[i].z > 0.5 && tt < Tu + 1.6) {
      wiping = 1.;
      float r = clamp((v - b) / max(Rx - b, 1e-4), 0., 1.);
      if (v < Rx) passAge = max(passAge, tt - (1. - pow(1. - r, 1. / 2.4)) * Tu);
    }
    if (tt >= Tu) {
      if (v < Rx && v > f) {                       // 何时露出来(回落函数反解)→ 余辉
        float kL = sqrt(clamp(1. - (v - b) / max(Rx - b, 1e-4), 0., 1.));
        float dtl = max(tt - (Tu + kL * Tb), 0.);
        glow = max(glow, exp(-dtl / 6.) * uWB[i].y);
        flashAg = max(flashAg, exp(-dtl / 0.9));
      }
      reachBand = max(reachBand, exp(-abs(v - Rx) / 0.022) * exp(-(tt - Tu) / 4.5) * uWB[i].y);
    }
  }
  float d = W - v;
  float under = smoothstep(-0.004, 0.010, d);
  float foamK = topFoam * (active > 0.5 ? 1. : 0.4);

  // ── 水体:和流体同一套扭曲 fbm,只是很暗 ──
  vec2 P = vec2(x, v) * 2.6;
  float t = uT * 0.07;
  vec2 q = vec2(fbm(P + t), fbm(P + vec2(5.2, 1.3) - t));
  float body = fbm(P + 3.2 * q + vec2(0., -uT * 0.05));

  // ── 前缘的光 + 身后的光丝 ──
  float along = 0.5 + 0.95 * fbm(vec2(x * 4.5, uT * 0.25 + W * 9.));          // 前缘沿岸明暗不均
  float front = (under * exp(-max(d, 0.) / (0.014 + 0.030 * foamK)) + (1. - under) * exp(min(d, 0.) / 0.005) * 0.5) * along;
  vec2 vp = vec2(x, (v - W * 0.85) / (1. + 1.7 * topK)) * 4.2;                // 跟着水走;回落时拉长
  vec2 vq = vec2(fbm(vp * 0.8 + uT * 0.05), fbm(vp * 0.8 + 7.3 - uT * 0.04)) - 0.5;
  float near = exp(-max(d, 0.) / (0.09 + 0.30 * foamK));
  float veins = pow(ridged(vp + 2.4 * vq), mix(4.6, 1.9, near));              // 近前缘成片,往后只剩细丝
  float veinLum = veins * near * under * (1. - 0.6 * topK) * (0.6 + 0.8 * foamK);

  // ── 退去之后:余辉 + 零星闪点 ──
  float after = (1. - under) * (glow * (0.012 + 0.30 * body * body * body) + flashAg * 0.10 * (0.4 + body));
  vec2 sg = vec2(x, v) * uRes.y / 3.2; vec2 sc = fract(sg) - 0.5; float sh = hash(floor(sg));
  float tw = 0.5 + 0.5 * sin(uT * (2.5 + sh * 6.) + sh * 40.);
  float spark = step(0.9965 - 0.03 * reachBand - 0.004 * glow, sh) * smoothstep(0.5, 0.12, length(sc))
              * tw * (glow * 0.7 + reachBand * 1.4) * (1. - under) * (1. + uBeat * 1.5);

  // ── 歌词 ──
  vec2 tuv = vec2(uv.x, 1. - uv.y);
  vec2 rip = (vec2(noise(vec2(x * 16., v * 16. + uT * 1.1)), noise(vec2(x * 16. + 9., v * 16. - uT * 0.9))) - 0.5) * 0.007 * under;
  vec3 tx = texture2D(uTex, tuv + rip).rgb;
  // 字不是"蹦"出来的:整句一次性画进纹理,显隐全在这里按每个字的出生时刻算。
  // 光晕先到(光先聚起来),字形随后在 ~0.45s 里凝实,出生那一下光晕再鼓一下。
  // 8bit 编码沿字宽渐变会出竖条纹 → 逐像素抖动半个量化步,条纹化成看不见的细噪
  vec2 born = (texture2D(uBirth, tuv + rip).rg + (hash(gl_FragCoord.xy + 3.7) - 0.5) / 255.) * uSpan;
  float rev   = smoothstep(born.r - 0.04, born.r + 0.42, uClock.x);
  float pre   = smoothstep(born.r - 0.32, born.r + 0.10, uClock.x);
  float bloom = exp(-abs(uClock.x - born.r - 0.10) / 0.24) * step(born.r - 0.4, uClock.x);
  float textLum = tx.r * rev * mix(1., 0.62, under);
  float halo = tx.g * (pre * 0.9 + bloom * 2.2);
  float revPrev = smoothstep(born.g - 0.04, born.g + 0.42, uClock.y);
  // 上一句:前缘没到 → 原样亮着;扫到的瞬间惊亮;之后沿水流回溯采样 → 被拉成光丝带走
  float ink = 0.;
  if (wiping < 0.5 || passAge < 0.) ink = texture2D(uTex, tuv).b * revPrev;
  else {
    vec2 flow = vec2((q.x - 0.5) * 1.6 + (vq.x) * 0.8, 1.0);                   // 主要向下(水冲的方向),带横向湍动
    // 16 次采样 + 逐像素抖动:离散的重影被抹成连续的光丝(抖动噪点藏在暗部里)
    float jit = hash(gl_FragCoord.xy + 17.);
    for (int i = 0; i < 16; i++) {
      float k = (float(i) + jit) / 16.;
      vec2 wob = vec2(sin(k * 9. + q.y * 12.) * 0.35, 0.);                       // 拖尾越远越蜿蜒
      vec2 suv = tuv - (flow + wob * k) * passAge * (0.26 * k * k + 0.015) * vec2(1. / aspect, 1.);
      ink += texture2D(uTex, suv).b * (1. - 0.8 * k);
    }
    ink = ink / 9.6 * exp(-passAge / 0.35) * (1. + 2.4 * exp(-passAge / 0.12));
  }

  // ── 合成:只有"加光",最后软压高光(不裁切 → 没有"白漆") ──
  vec3 hot = mix(vec3(1.), uAccent, 0.30) * vec3(0.92, 1.0, 1.0);
  vec3 col = BASE * (1. + 1.5 * body);
  col += uAccent * (under * (0.035 + 0.12 * body * body) + after + veinLum * 0.55 + front * (0.5 + 0.3 * uBeat) + crest * 0.30 + halo * 0.30);
  col += hot * (veinLum * veinLum * 1.3 + front * front * 1.6 + crest * crest * 0.35 + spark);
  col += vec3(1.) * (textLum + ink) * 2.8;                                   // 交接给浪的那一刻亮度不能跳
  col = 1. - exp(-col * 1.55);
  vec2 c = uv - 0.5; c.x *= aspect; col *= 1.0 - dot(c, c) * 0.35;
  col += (hash(gl_FragCoord.xy + uT) - 0.5) / 255. * 1.6;                      // 抖动,暗部渐变不出色带
  gl_FragColor = vec4(col, 1.);
}
