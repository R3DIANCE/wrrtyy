// Wayfarer — infinite procedural terrain, rendered entirely in a fragment shader.
// World positions are split into an integer part (camInt) and a float part so
// precision holds no matter how far the player wanders.

struct Poi { v: vec4<f32> }; // xy = position relative to camera, z = kind, w = state

struct U {
  camInt: vec2<i32>,
  camFrac: vec2<f32>,
  res: vec2<f32>,
  ppu: f32,
  time: f32,
  day: f32,
  seed: u32,
  poiCount: u32,
  facing: f32,
  player: vec2<f32>,
  walk: f32,
  dusk: f32,
  pois: array<vec4<f32>, 48>,
};

@group(0) @binding(0) var<uniform> u: U;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -3.0), vec2<f32>(-1.0, 1.0), vec2<f32>(3.0, 1.0));
  return vec4<f32>(p[i], 0.0, 1.0);
}

// ---------- hashing / noise (mirrors src/world.ts) ----------

fn hash(x: i32, y: i32, s: u32) -> u32 {
  var h: u32 = (bitcast<u32>(x) * 0x8da6b343u) ^ (bitcast<u32>(y) * 0xd8163841u) ^ (s * 0xcb1ab31fu);
  h = (h ^ (h >> 16u)) * 0x7feb352du;
  h = (h ^ (h >> 15u)) * 0x846ca68bu;
  return h ^ (h >> 16u);
}

fn h01(x: i32, y: i32, s: u32) -> f32 {
  return f32(hash(x, y, s) & 0xffffffu) / 16777215.0;
}

fn fdiv(a: i32, b: i32) -> i32 {
  var q = a / b;
  if ((a % b) != 0 && a < 0) { q = q - 1; }
  return q;
}

// World position = ci + lf. C = lattice cell size in world units.
fn vn(ci: vec2<i32>, lf: vec2<f32>, C: i32, s: u32) -> f32 {
  let fl = floor(lf);
  let w = ci + vec2<i32>(fl);
  let f = lf - fl;
  let cx = fdiv(w.x, C);
  let cy = fdiv(w.y, C);
  let t = (vec2<f32>(f32(w.x - cx * C), f32(w.y - cy * C)) + f) / f32(C);
  let k = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  let a = h01(cx, cy, s);
  let b = h01(cx + 1, cy, s);
  let c = h01(cx, cy + 1, s);
  let d = h01(cx + 1, cy + 1, s);
  return mix(mix(a, b, k.x), mix(c, d, k.x), k.y);
}

// Sub-unit detail noise: scales world by k (integer).
fn vfine(ci: vec2<i32>, lf: vec2<f32>, k: i32, s: u32) -> f32 {
  return vn(ci * k, lf * f32(k), 1, s);
}

fn height(ci: vec2<i32>, lf: vec2<f32>) -> f32 {
  let s = u.seed;
  let h = macroH(ci, lf) + 0.06 * vn(ci, lf, 4, s + 4u);
  return clamp((h - 0.5) * 1.9 + 0.5, 0.0, 1.0);
}

// Large-scale relief only; used for smooth hillshading.
fn macroH(ci: vec2<i32>, lf: vec2<f32>) -> f32 {
  let s = u.seed;
  return 0.35 * vn(ci, lf, 1024, s)
       + 0.29 * vn(ci, lf, 256, s + 1u)
       + 0.19 * vn(ci, lf, 64, s + 2u)
       + 0.11 * vn(ci, lf, 16, s + 3u);
}

fn moisture(ci: vec2<i32>, lf: vec2<f32>) -> f32 {
  let s = u.seed;
  let m = 0.5 * vn(ci, lf, 512, s + 10u) + 0.3 * vn(ci, lf, 128, s + 11u) + 0.2 * vn(ci, lf, 32, s + 12u);
  return clamp((m - 0.5) * 1.8 + 0.5, 0.0, 1.0);
}

// ---------- palette ----------
const C_DEEP = vec3<f32>(0.122, 0.306, 0.420);
const C_SHALLOW = vec3<f32>(0.247, 0.541, 0.627);
const C_BEACH = vec3<f32>(0.886, 0.812, 0.604);
const C_DESERT = vec3<f32>(0.851, 0.718, 0.471);
const C_GRASS = vec3<f32>(0.545, 0.667, 0.369);
const C_FOREST = vec3<f32>(0.310, 0.490, 0.227);
const C_ROCK = vec3<f32>(0.541, 0.510, 0.451);
const C_SNOW = vec3<f32>(0.933, 0.945, 0.949);
const C_MARSH = vec3<f32>(0.424, 0.541, 0.353);

fn biome(h: f32, m: f32) -> i32 {
  if (h < 0.38) { return 0; }
  if (h < 0.45) { return 1; }
  if (h < 0.47) { return 2; }
  if (h > 0.82) { return 7; }
  if (h > 0.7) { return 6; }
  if (h < 0.53 && m > 0.68) { return 8; }
  if (m < 0.32) { return 3; }
  if (m > 0.55) { return 5; }
  return 4;
}

fn landColor(b: i32, h: f32, m: f32) -> vec3<f32> {
  switch b {
    case 2: { return C_BEACH; }
    case 3: { return C_DESERT; }
    case 5: { return mix(C_FOREST, C_GRASS, 0.15); }
    case 6: { return mix(C_ROCK, C_GRASS * 0.8, smoothstep(0.74, 0.7, h) * 0.5); }
    case 7: { return C_SNOW; }
    case 8: { return C_MARSH; }
    default: { return mix(C_GRASS, C_DESERT, smoothstep(0.42, 0.32, m) * 0.6); }
  }
}

fn sdBox(p: vec2<f32>, b: vec2<f32>) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0);
}

@fragment
fn fs(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
  let px = frag.xy - u.res * 0.5;
  let rel = px / u.ppu;              // world offset from camera
  let ci = u.camInt;
  let lf = u.camFrac + rel;          // ci + lf = absolute world position
  let t = u.time;

  let h = height(ci, lf);
  let m = moisture(ci, lf);
  let e = 0.75;
  let hm = macroH(ci, lf);
  let hx = macroH(ci, lf + vec2<f32>(e, 0.0));
  let hy = macroH(ci, lf + vec2<f32>(0.0, e));

  // Contour lines (computed in uniform control flow for fwidth).
  let ch = h * 28.0;
  let cw = fwidth(ch);
  let cf = fract(ch);
  let contour = 1.0 - smoothstep(0.0, cw * 1.3, min(cf, 1.0 - cf));
  let pixelWorld = 1.0 / u.ppu;

  let b = biome(h, m);
  var col: vec3<f32>;

  // Hillshade from the height gradient. Sun from the upper-left.
  let g = vec2<f32>(hx - hm, hy - hm) / e * 1.9;
  let n = normalize(vec3<f32>(-g * 30.0, 1.0));
  let sun = normalize(vec3<f32>(-0.55, -0.65, 0.55));
  let shade = 1.0 + (dot(n, sun) - sun.z) * 1.15;

  if (b <= 1) {
    // ----- Water -----
    let depth = smoothstep(0.45, 0.30, h);
    col = mix(C_SHALLOW, C_DEEP, depth);
    let w1 = vn(ci, lf + vec2<f32>(t * 0.7, t * 0.35), 3, u.seed + 40u);
    let w2 = vn(ci, lf + vec2<f32>(-t * 0.5, t * 0.6), 2, u.seed + 41u);
    let ripple = smoothstep(0.62, 0.7, (w1 + w2) * 0.5);
    col = col + vec3<f32>(0.10, 0.14, 0.14) * ripple * (1.0 - depth * 0.6);
    // Shoreline foam bands.
    let shore = smoothstep(0.415, 0.45, h);
    let band = 0.5 + 0.5 * sin(h * 420.0 - t * 2.2);
    col = mix(col, vec3<f32>(0.86, 0.93, 0.92), shore * smoothstep(0.55, 0.95, band) * 0.55);
    col = mix(col, C_BEACH * 0.95, smoothstep(0.442, 0.45, h) * 0.6);
  } else {
    // ----- Land -----
    col = landColor(b, h, m);
    let grain = vfine(ci, lf, 2, u.seed + 30u);
    let patchy = vn(ci, lf, 6, u.seed + 31u);
    col = col * (0.95 + 0.05 * grain + 0.06 * (patchy - 0.5)) * (1.06 - 0.25 * (h - 0.5));
    col = col * clamp(shade, 0.55, 1.35);
    col = col * (1.0 - 0.10 * contour);

    // ----- Scattered flora & stones on a 2-unit grid -----
    let fl = floor(lf);
    let wcell = ci + vec2<i32>(fl);
    let fr = lf - fl;
    let cx = fdiv(wcell.x, 2);
    let cy = fdiv(wcell.y, 2);
    let lc = vec2<f32>(f32(wcell.x - cx * 2), f32(wcell.y - cy * 2)) + fr;
    let r0 = h01(cx, cy, u.seed + 50u);
    var density = 0.0;
    var kind = 0; // 1 = broadleaf, 2 = pine, 3 = stone, 4 = reed
    if (b == 5) { density = 0.72; kind = 1; }
    else if (b == 4) { density = 0.07; kind = 1; }
    else if (b == 6) { density = 0.16; kind = 2; }
    else if (b == 8) { density = 0.35; kind = 4; }
    else if (b == 3) { density = 0.05; kind = 3; }
    if (b == 6 && h > 0.75) { kind = 3; density = 0.12; }
    if (r0 < density) {
      let center = vec2<f32>(0.8 + 0.4 * h01(cx, cy, u.seed + 51u), 0.8 + 0.4 * h01(cx, cy, u.seed + 52u));
      let rr = h01(cx, cy, u.seed + 53u);
      let d = lc - center;
      if (kind == 1 || kind == 2) {
        let rad = 0.42 + 0.32 * rr;
        let ds = length(d - vec2<f32>(0.2, 0.22));
        col = mix(col, col * 0.55, 1.0 - smoothstep(rad - pixelWorld, rad + pixelWorld * 2.0, ds));
        var leaf = vec3<f32>(0.20, 0.38, 0.17);
        if (kind == 2) { leaf = vec3<f32>(0.16, 0.30, 0.22); }
        leaf = leaf * (0.85 + 0.3 * rr);
        let dd = length(d);
        let lit = clamp(1.0 - length(d + vec2<f32>(rad * 0.35, rad * 0.4)) / (rad * 1.4), 0.0, 1.0);
        var tree = leaf * (0.75 + 0.6 * lit);
        if (kind == 2) {
          // Pines: star-like crown.
          let a = atan2(d.y, d.x);
          let star = rad * (0.78 + 0.22 * cos(a * 7.0));
          tree = tree * (0.9 + 0.2 * cos(a * 7.0));
          col = mix(col, tree, 1.0 - smoothstep(star - pixelWorld, star + pixelWorld, dd));
        } else {
          let bump = vfine(ci, lf, 5, u.seed + 54u);
          let edge = rad * (0.9 + 0.12 * bump);
          tree = tree * (0.9 + 0.2 * bump);
          col = mix(col, tree, 1.0 - smoothstep(edge - pixelWorld, edge + pixelWorld, dd));
        }
      } else if (kind == 3) {
        let rad = 0.16 + 0.22 * rr;
        let ds = length(d - vec2<f32>(0.08, 0.1));
        col = mix(col, col * 0.6, 1.0 - smoothstep(rad - pixelWorld, rad + pixelWorld * 2.0, ds));
        let lit = clamp(1.0 - length(d + vec2<f32>(rad * 0.4)) / (rad * 1.5), 0.0, 1.0);
        let stone = vec3<f32>(0.55, 0.53, 0.5) * (0.7 + 0.6 * lit);
        col = mix(col, stone, 1.0 - smoothstep(rad - pixelWorld, rad + pixelWorld, length(d)));
      } else if (kind == 4) {
        // Reed tufts.
        let a = atan2(d.y, d.x);
        let tuft = 0.28 * (0.6 + 0.4 * abs(cos(a * 3.0 + rr * 6.0)));
        col = mix(col, vec3<f32>(0.33, 0.42, 0.22), (1.0 - smoothstep(tuft - pixelWorld, tuft + pixelWorld, length(d))) * 0.9);
      }
    }
  }

  // ----- Points of interest -----
  var glow = vec3<f32>(0.0);
  for (var i = 0u; i < u.poiCount; i = i + 1u) {
    let p = u.pois[i];
    let d = rel - p.xy;
    let dist = length(d);
    if (dist > 8.0) { continue; }
    if (p.z < 0.5) {
      // Relic shard: pulsing diamond.
      let pulse = 0.5 + 0.5 * sin(t * 3.0 + p.w * 6.28);
      let bob = sin(t * 2.0 + p.w * 6.28) * 0.08;
      let q = d - vec2<f32>(0.0, bob);
      let ds = length(d - vec2<f32>(0.18, 0.28));
      col = mix(col, col * 0.6, (1.0 - smoothstep(0.18, 0.3, ds)) * 0.7);
      let dia = abs(q.x) * 1.4 + abs(q.y);
      let inside = 1.0 - smoothstep(0.32 - pixelWorld, 0.32 + pixelWorld, dia);
      let facet = select(vec3<f32>(0.55, 0.95, 0.95), vec3<f32>(0.98, 0.86, 0.45), q.x > 0.0);
      col = mix(col, facet * (1.0 + 0.3 * pulse), inside);
      glow = glow + vec3<f32>(0.45, 0.85, 0.9) * exp(-dist * 1.6) * (0.35 + 0.35 * pulse);
    } else {
      // Landmark monolith with ring of standing stones.
      let found = p.w;
      let ring = abs(dist - 2.2);
      let ang = atan2(d.y, d.x);
      let seg = fract(ang / 6.2831853 * 8.0 + 0.0625);
      let stoneMask = (1.0 - smoothstep(0.18, 0.26, ring)) * step(abs(seg - 0.5), 0.18);
      col = mix(col, col * 0.55, (1.0 - smoothstep(0.0, 0.5, ring - 0.05)) * 0.25);
      col = mix(col, vec3<f32>(0.42, 0.40, 0.38), stoneMask);
      let sd = sdBox(d, vec2<f32>(0.42, 0.42));
      let sh = sdBox(d - vec2<f32>(0.35, 0.45), vec2<f32>(0.42, 0.42));
      col = mix(col, col * 0.5, 1.0 - smoothstep(0.0, 0.25, sh));
      let lit = clamp(0.6 - d.x * 0.6 - d.y * 0.6, 0.0, 1.0);
      col = mix(col, vec3<f32>(0.24, 0.22, 0.24) * (0.8 + 0.6 * lit), 1.0 - smoothstep(-pixelWorld, pixelWorld, sd));
      // Rune glow.
      let rune = (1.0 - smoothstep(0.02, 0.06, abs(sdBox(d, vec2<f32>(0.22, 0.22))))) * step(sd, 0.0);
      let rc = mix(vec3<f32>(0.55, 0.6, 0.7), vec3<f32>(0.98, 0.72, 0.35), found);
      col = mix(col, rc, rune * (0.6 + 0.4 * sin(t * 2.0)));
      glow = glow + rc * exp(-dist * 0.9) * 0.18 * (0.5 + found);
    }
  }

  // ----- Player -----
  let pd = rel - u.player;
  let fdir = vec2<f32>(cos(u.facing), sin(u.facing));
  let side = vec2<f32>(-fdir.y, fdir.x);
  let bob = 1.0 + 0.04 * sin(u.walk * 12.0);
  let shadowD = length((pd - vec2<f32>(0.14, 0.2)) * vec2<f32>(1.0, 1.25));
  col = mix(col, col * 0.5, 1.0 - smoothstep(0.38, 0.5, shadowD));
  let body = length(pd);
  let cloak = vec3<f32>(0.62, 0.23, 0.18) * (0.85 + 0.35 * clamp(-dot(normalize(pd + vec2<f32>(1e-4)), vec2<f32>(0.6, 0.7)), 0.0, 1.0));
  col = mix(col, vec3<f32>(0.18, 0.08, 0.06), 1.0 - smoothstep(0.42 * bob, 0.42 * bob + pixelWorld * 1.5, body));
  col = mix(col, cloak, 1.0 - smoothstep(0.38 * bob - pixelWorld, 0.38 * bob + pixelWorld, body));
  let hood = length(pd - fdir * 0.1);
  col = mix(col, vec3<f32>(0.80, 0.37, 0.27), 1.0 - smoothstep(0.21 - pixelWorld, 0.21 + pixelWorld, hood));
  col = mix(col, vec3<f32>(0.95, 0.8, 0.62), (1.0 - smoothstep(0.07, 0.07 + pixelWorld, length(pd - fdir * 0.24))) * 0.9);
  let lanternPos = u.player + side * 0.46 + fdir * 0.12;
  let ld = length(rel - lanternPos);
  col = mix(col, vec3<f32>(1.0, 0.86, 0.5), 1.0 - smoothstep(0.08, 0.08 + pixelWorld, ld));

  // ----- Day / night lighting -----
  let day = u.day;
  let nightTint = vec3<f32>(0.16, 0.2, 0.36);
  var ambient = mix(nightTint, vec3<f32>(1.0), day);
  ambient = ambient * mix(vec3<f32>(1.0), vec3<f32>(1.12, 0.86, 0.7), u.dusk);
  let lampR = length(rel - lanternPos) / 6.5;
  let flicker = 0.94 + 0.06 * sin(t * 13.0) * sin(t * 7.3);
  let lamp = vec3<f32>(1.0, 0.72, 0.4) * exp(-lampR * lampR * 2.2) * (1.0 - day) * 1.25 * flicker;
  var outc = col * (ambient + lamp) + glow * (0.6 + (1.0 - day) * 1.4);
  outc = outc + vec3<f32>(1.0, 0.85, 0.5) * exp(-ld * 9.0) * (0.25 + (1.0 - day) * 0.8);

  // Vignette.
  let uv = frag.xy / u.res;
  let vig = 1.0 - 0.32 * pow(length((uv - 0.5) * vec2<f32>(1.0, 0.9)) * 1.35, 2.2);
  outc = outc * vig;
  return vec4<f32>(outc, 1.0);
}
