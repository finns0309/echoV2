// 流体 · domain-warped fbm. Ported verbatim from echo's fx.js (FRAG_PLASMA).
// uTime is a beat-modulated phase accumulator, not wall-clock seconds, so a
// pulse speeds the flow up without ever jumping the field to a new position.
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uBeat;
// fbm octave count, 3–6 (tray menu 流体画质). GLSL ES 1.0 needs a constant
// loop bound, so loop to the max and break early.
uniform float uOctaves;
// Cover-derived mid-tone color. ONLY the middle palette stop comes from the
// cover — the dark and bright stops are fixed, so the contrast structure
// stays intact regardless of how muddy the album's palette is. This means
// each song "tints" the plasma toward its dominant color without ever
// collapsing to a flat one-color wash (the bug we hit before).
uniform vec3  uAccent;

// Fixed dark + bright stops. BASE_DARK is a saturated deep indigo (not near-
// black), BASE_HOT is near-white cyan. Any cover-derived mid color slots
// between these and the eye reads visible contrast.
const vec3 BASE_DARK = vec3(0.10, 0.04, 0.28);
const vec3 BASE_HOT  = vec3(0.55, 1.00, 1.00);

// Hash21 from David Hoskins (https://www.shadertoy.com/view/4djSRW). The
// classic fract(sin(dot(...)) * 43758) hash collapses on Apple silicon GPUs
// once the input magnitude exceeds ~30 — sin(huge)*43758 produces values with
// no significand precision left, fract returns a degenerate constant, fbm
// becomes uniform across the whole canvas. This variant stays stable across
// the full shader range we hit.
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  // Octaves ARE visible detail, unlike buffer resolution: on a large display
  // 3 octaves reads as out-of-focus silk, 5 as sharp marbling. Tunable.
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uOctaves) break;
    v += a * noise(p); p *= 2.0; a *= 0.5;
  }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 4.0;
  // uTime is already a beat-modulated phase accumulator (see fx.js loop);
  // adding uBeat here would re-introduce the positional jump on each line
  // change.
  float t = uTime;
  // Two-layer domain warp: q feeds r, r feeds final fbm. 5 fbm calls × 3
  // octaves per pixel; with the half-res canvas this is ~40% of the
  // original 5-octave double-warp cost.
  vec2 q = vec2(fbm(p + t),
                fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 3.5 * q + vec2(1.7, 9.2) + t * 1.2),
                fbm(p + 3.5 * q + vec2(8.3, 2.8) - t * 0.9));
  float f = fbm(p + 3.0 * r);
  f = smoothstep(0.25, 0.85, f);
  vec3 col = mix(BASE_DARK, uAccent, f);
  col = mix(col, BASE_HOT, clamp(r.x, 0.0, 1.0) * 0.65);
  col *= 0.6 + 0.55 * f;
  // Beat already accelerates t (the warp speed), which gives a kinetic
  // pulse on every line change. Don't also add a global brightness boost —
  // that flashes the entire canvas on each lyric and reads as a visual glitch.
  vec2 c = uv - 0.5; c.x *= aspect;
  col *= 1.0 - dot(c, c) * 0.4;
  gl_FragColor = vec4(col, 1.0);
}
