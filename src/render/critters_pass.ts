/**
 * Проход фоновой живности. Особей не существует ни в памяти, ни в сейве:
 * инстансов ровно `block² × perCell`, каждый берёт свою клетку рядом с игроком,
 * читает по ней поля мира (`uCells`, `uFeatures`, `uLight`, `uDanger`) и решает
 * САМ, кто он и есть ли он вообще. Не совпало с весами ни одного вида — инстанс
 * схлопывается за пределы клипа и ничего не стоит.
 *
 * Отсюда следует всё остальное: живность контекстна по построению (мухи там, где
 * поле трупного запаха, тараканы там, где плита и темно), CPU не платит ни за
 * одну особь, а сохранять нечего.
 */
import { Cell, Feature, W } from '../core/types';
import { CRITTER_ACTIVE_SPECIES_CAP, CRITTER_SPECIES_STRIDE, CritterMotion } from '../data/critters';

/** Вершин на квад. */
const QUAD_VERTS = 6;

export interface CritterPassContext {
  /** Позиция и ориентация камеры. */
  posX: number;
  posY: number;
  angle: number;
  pitch: number;
  /**
   * Высота глаза. Была захардкожена половиной прямо в шейдере, и живность
   * оттого висела в воздухе: ошибка по вертикали равна (0.5 − высота)·H/ty, то
   * есть росла с приближением и ходила вместе с камерой. Дышащая, приседающая и
   * летающая камера двигала крыс вместе с собой.
   */
  camHeight: number;
  planeLen: number;
  time: number;
  /** Свет: тот же контракт, что у спрайтов. */
  ambient: number;
  flashlight: number;
  fogDensity: number;
  fogColor: readonly [number, number, number];
  /** Экранные масштабы приходят из webgl.ts, чтобы константы не двоились. */
  screenW: number;
  screenH: number;
  worldScreenScale: number;
  minScreenSize: number;
  maxScreenSize: number;
  cullDist: number;
  /** Общие текстуры мира. */
  cellsTex: WebGLTexture;
  featuresTex: WebGLTexture;
  lightTex: WebGLTexture;
  dangerTex: WebGLTexture;
  /** Таблица активных видов и её длина (см. `packCritterSpecies`). */
  species: Float32Array;
  speciesCount: number;
  /** Сторона блока клеток вокруг игрока и число слотов на клетку. */
  block: number;
  perCell: number;
}

export interface CritterPassHandle {
  render(gl: WebGL2RenderingContext, ctx: CritterPassContext): number;
  dispose(gl: WebGL2RenderingContext): void;
}

const VERT_SRC = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

in vec2 aPos;

uniform vec2  uResolution;
uniform vec2  uPos;
uniform float uAngle;
uniform float uPitch;
uniform float uCamHeight;
uniform float uPlaneLen;
uniform float uTime;
uniform float uAmbient;
uniform float uFlashlight;
uniform float uFogDensity;
uniform vec3  uFogColor;
uniform float uWorldScale;
uniform float uMinSize;
uniform float uMaxSize;
uniform float uCullDist;
uniform int   uBlock;
uniform int   uPerCell;
uniform int   uSpeciesCount;
uniform vec4  uSpecies[${CRITTER_ACTIVE_SPECIES_CAP * 4}];

uniform highp usampler2D uCells;
uniform highp usampler2D uFeatures;
uniform sampler2D        uLight;
uniform highp usampler2D uDanger;

out vec4  vColor;
out vec2  vLocal;
out float vDepth;
out float vWing;
out float vAspect;
/** 0 — тельце-клякса; ±1 — зверёк с головой и хвостом, знак задаёт, куда мордой. */
out float vShape;
/** Фаза походки: виляние хвоста, чтобы он не был палкой. */
out float vPhase;

const int   W_SIZE = ${W};
const float W_F    = ${W}.0;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Гладкий шум по клеткам: соседние клетки коррелируют, поэтому выходят пятна. */
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

ivec2 wrapCell(ivec2 c) { return ivec2(c.x & (W_SIZE - 1), c.y & (W_SIZE - 1)); }
uint  cellAt(ivec2 c)   { return texelFetch(uCells, wrapCell(c), 0).r; }
uint  featAt(ivec2 c)   { return texelFetch(uFeatures, wrapCell(c), 0).r; }
float lightAt(ivec2 c)  { return texelFetch(uLight, wrapCell(c), 0).r; }
float bloodAt(ivec2 c)  { return float(texelFetch(uDanger, wrapCell(c), 0).r) / 255.0; }

// Оси признаков из кодов Feature. Разделены по смыслу, а не по мебели:
// «еда» — где готовят и хранят, «грязь» — где сыро, «укрытие» — где не ходят.
float featFood(uint f)  { return (f == ${Feature.STOVE}u || f == ${Feature.SINK}u || f == ${Feature.SHELF}u) ? 1.0 : 0.0; }
float featFilth(uint f) { return (f == ${Feature.TOILET}u) ? 1.0 : 0.0; }
float featGlow(uint f)  { return (f == ${Feature.LAMP}u || f == ${Feature.CANDLE}u) ? 1.0 : 0.0; }
float featCover(uint f) { return (f == ${Feature.TABLE}u || f == ${Feature.DESK}u || f == ${Feature.BED}u || f == ${Feature.SHELF}u) ? 1.0 : 0.0; }

bool solidAt(ivec2 c) {
  uint t = cellAt(c);
  return t == ${Cell.WALL}u || t == ${Cell.ABYSS}u || t == ${Cell.LIFT}u;
}

void main() {
  int slot   = gl_InstanceID / uPerCell;
  int member = gl_InstanceID - slot * uPerCell;
  int bx     = slot - (slot / uBlock) * uBlock;
  int by     = slot / uBlock;
  int half_  = uBlock / 2;

  ivec2 base = ivec2(floor(uPos));
  ivec2 cell = wrapCell(base + ivec2(bx - half_, by - half_));

  // Жить можно только на полу. Стена, пропасть, шахта и вода отсекаются сразу.
  if (cellAt(cell) != ${Cell.FLOOR}u) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

  // Признаки источников берутся с оглядкой на соседей: плита стоит в своей
  // клетке, а таракан бежит по соседней.
  uint fC = featAt(cell);
  uint fL = featAt(cell + ivec2(-1, 0));
  uint fR = featAt(cell + ivec2( 1, 0));
  uint fD = featAt(cell + ivec2( 0,-1));
  uint fU = featAt(cell + ivec2( 0, 1));

  float food  = max(featFood(fC),  0.55 * max(max(featFood(fL),  featFood(fR)),  max(featFood(fD),  featFood(fU))));
  float filth = max(featFilth(fC), 0.55 * max(max(featFilth(fL), featFilth(fR)), max(featFilth(fD), featFilth(fU))));
  float glow  = max(featGlow(fC),  0.7  * max(max(featGlow(fL),  featGlow(fR)),  max(featGlow(fD),  featGlow(fU))));
  float cover = max(featCover(fC), 0.5  * max(max(featCover(fL), featCover(fR)), max(featCover(fD), featCover(fU))));

  // Угол из стен — тоже укрытие: туда просто никто не ходит.
  float solids = 0.0;
  if (solidAt(cell + ivec2(-1, 0))) solids += 1.0;
  if (solidAt(cell + ivec2( 1, 0))) solids += 1.0;
  if (solidAt(cell + ivec2( 0,-1))) solids += 1.0;
  if (solidAt(cell + ivec2( 0, 1))) solids += 1.0;
  cover = max(cover, clamp((solids - 1.0) * 0.5, 0.0, 1.0));

  float lit   = lightAt(cell);
  float blood = bloodAt(cell);
  float dark  = 1.0 - clamp(lit, 0.0, 1.0);
  glow *= clamp(lit * 1.6, 0.0, 1.0);

  /* Вид клетки выбирается сравнением её признаков с весами. Нормировка на
   * максимальный вес даёт смысл «главная ось удовлетворена — вид присутствует».
   *
   * Оси делятся на ИСТОЧНИКИ (труп, еда, сырость, лампа) и ФОН (тьма, укрытие).
   * Источник — это причина в конкретной точке; фон есть почти на каждой клетке
   * пола, и вид, чьё присутствие держится только на нём, раньше рождался ВЕЗДЕ,
   * ровно по одной особи на клетку — отсюда и брала начало решётка чёрных точек.
   * Поэтому доля фона в счёте гасится колониальным шумом: гладкое поле по
   * клеткам со своим сдвигом на вид даёт пятна размером с половину комнаты, а
   * между ними пусто. Особь у трупа или лампы шум не трогает: там причина есть. */
  float cellNoise = hash21(vec2(cell));
  int   best = -1;
  float bestScore = 0.0;
  for (int i = 0; i < ${CRITTER_ACTIVE_SPECIES_CAP}; i++) {
    if (i >= uSpeciesCount) break;
    vec4 wA = uSpecies[i * 4 + 2];
    vec4 wB = uSpecies[i * 4 + 3];
    float peak = max(max(max(wA.x, wA.y), max(wA.z, wA.w)), max(wB.x, wB.y));
    if (peak <= 0.0) continue;
    float src = wA.x * blood + wA.y * food + wA.z * filth + wB.x * glow;
    float amb = wA.w * dark + wB.y * cover;
    float sc  = clamp((src + amb) / peak, 0.0, 1.0);
    float colony = vnoise(vec2(cell) * 0.15 + vec2(float(i) * 37.0, float(i) * -19.0));
    sc *= mix(1.0, smoothstep(0.50, 0.88, colony), amb / max(1e-4, src + amb));
    sc *= 0.7 + 0.6 * hash21(vec2(cellNoise * 91.7, float(i)));
    if (sc > bestScore) { bestScore = sc; best = i; }
  }
  if (best < 0 || bestScore < 0.34) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

  vec4 s0 = uSpecies[best * 4];       // цвет.rgb, размер
  vec4 s1 = uSpecies[best * 4 + 1];   // baseZ, zAmp, roam, speed
  vec4 s3 = uSpecies[best * 4 + 3];   // вес glow, вес cover, радиус испуга, motion+плотность×4
  float packed  = s3.w;
  float density = floor(packed / 4.0);
  int   motion  = int(packed - density * 4.0);
  float flee    = s3.z;

  // Плотность клетки — от того, насколько сильно она подходит виду.
  int count = int(max(1.0, floor(density * bestScore + 0.5)));
  if (member >= count) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

  float seed = hash21(vec2(float(cell.x * 31 + cell.y), float(member) * 13.7 + 1.3));
  vec2  offset;
  float z = s1.x;
  // Куда особь обращена: направление шага, а при испуге — направление бегства.
  vec2  head  = vec2(0.0);
  float gait  = 0.0;

  bool onFoot = motion == ${CritterMotion.GROUND} || motion == ${CritterMotion.SCURRY};
  if (onFoot) {
    // Рывок — пауза — рывок: цель меняется ступенями, между ними сглаживание.
    float t   = uTime * s1.w * 0.5 + seed * 10.0;
    float leg = floor(t);
    float f   = smoothstep(0.0, 1.0, fract(t));
    vec2 a = vec2(hash21(vec2(leg, seed)), hash21(vec2(leg + 0.5, seed)));
    vec2 b = vec2(hash21(vec2(leg + 1.0, seed)), hash21(vec2(leg + 1.5, seed)));
    offset = s1.z * (mix(a, b, f) - 0.5) * 2.0;
    head   = b - a;
    gait   = t * 12.566;
    // Покачивание тела на бегу: пик приходится на середину рывка, а не на паузу.
    if (motion == ${CritterMotion.SCURRY}) z += 0.022 * abs(sin(gait)) * (1.0 - abs(fract(t) * 2.0 - 1.0));
  } else {
    // Рой и нимб: орбита вокруг клетки, у нимба шире и выше.
    float halo = motion == ${CritterMotion.HALO} ? 1.7 : 1.0;
    float ang  = seed * 6.2831 + uTime * s1.w * (0.5 + seed);
    float r    = s1.z * halo * (0.55 + 0.45 * sin(uTime * 2.7 + seed * 9.0));
    offset = vec2(cos(ang), sin(ang)) * r;
    z += s1.y * sin(uTime * 4.3 + seed * 6.0);
  }

  vec2 pos = vec2(cell) + 0.5 + offset;

  /* Испуг без состояния. Раньше особь ровно вытеснялась на границу радиуса и там
   * висела, а отойдёшь — упруго возвращалась; на решётке одинаковых особей это
   * читалось не как бегство, а как натянутая и отпущенная сеть. Правки три, и
   * все против «поля»: свой радиус срабатывания у каждой особи, свой угол и своя
   * длина рывка, и главное — добежав, особь ГАСНЕТ, а не встаёт на границе. */
  vec2 d = pos - uPos;
  d -= W_F * floor(d / W_F + 0.5);
  float dl = length(d);
  float fade = 1.0;
  flee *= 0.6 + 0.8 * hash21(vec2(seed, 17.3));
  if (flee > 0.0 && dl < flee) {
    float panic = 1.0 - dl / flee;
    vec2  away  = dl > 1e-4 ? d / dl : vec2(1.0, 0.0);
    float ja    = (hash21(vec2(seed, 5.3)) - 0.5) * 1.1;
    away = vec2(away.x * cos(ja) - away.y * sin(ja), away.x * sin(ja) + away.y * cos(ja));
    // Уйти далеко, а не отступить на шаг: до границы радиуса плюс своя длина
    // сверх неё. Путь шагается по полклетки с запасом, поэтому рывок не может
    // перепрыгнуть стену и оказаться в соседней комнате; упёрлась — встала там.
    float run   = (flee - dl) + flee * (0.6 + hash21(vec2(seed, 2.1))) * panic;
    vec2  stepv = away * min(0.7, run * 0.125);
    vec2  fled  = pos;
    for (int k = 0; k < 8; k++) {
      vec2 nxt = fled + stepv;
      if (cellAt(ivec2(floor(nxt))) != ${Cell.FLOOR}u) break;
      fled = nxt;
    }
    // Гаснет ровно настолько, насколько успела убежать: загнанная в угол особь
    // остаётся видимой, а не растворяется на месте.
    float moved = clamp(length(fled - pos) / max(1e-3, run), 0.0, 1.0);
    pos  = fled;
    head = away;
    d = pos - uPos;
    d -= W_F * floor(d / W_F + 0.5);
    dl = length(d);
    fade = 1.0 - panic * panic * moved;
  }
  if (dl > uCullDist) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

  vec2  dir   = vec2(cos(uAngle), sin(uAngle));
  vec2  plane = vec2(-dir.y, dir.x) * uPlaneLen;
  float invDet = 1.0 / (plane.x * dir.y - dir.x * plane.y);
  float tx = invDet * (dir.y * d.x - dir.x * d.y);
  float ty = invDet * (-plane.y * d.x + plane.x * d.y);
  if (ty <= 0.1) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

  float screenSize = min(uMaxSize, (uResolution.y / ty) * uWorldScale * s0.w);
  if (screenSize < uMinSize) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

  float halfH = floor(uResolution.y * 0.5) + floor(uPitch * uResolution.y);
  float sx = (uResolution.x * 0.5) * (1.0 + tx / ty);
  // Та же арифметика, что у спрайтов (footY в webgl.ts) и у пола раскастера:
  // экранная высота считается от ГЛАЗА, а не от условной половины.
  float footY = halfH + (uCamHeight - z) * uResolution.y / ty;

  /* Свет: запечённый плюс ambient плюс ближний свет глаза плюс фонарь, и та же
   * кривая тени 1.32, что у мешей и спрайтов.
   *
   * Фонарь стал ЛУЧОМ. Раньше он был всенаправленным: до 0.95 на всё в радиусе
   * одиннадцати клеток независимо от того, куда игрок смотрит. Вместе с ближним
   * светом сумма упиралась в потолок клэмпа раньше, чем успевал сказаться
   * запечённый свет, и живность светилась ровно и одинаково хоть под лампой,
   * хоть в темноте. Убрать фонарь совсем нельзя — в тёмном коридоре крысы
   * пропали бы при включённом свете; поэтому он остался, но только там, куда
   * действительно направлен. Вне луча яркость снова решает лампа. */
  float beam = clamp(1.0 - abs(tx) / max(0.35, ty) * 1.15, 0.0, 1.0);
  float ft = max(0.0, 1.0 - dl / 11.5);
  float fb = uFlashlight > 0.0 ? uFlashlight * ft * ft * beam * 0.75 : 0.0;
  float el = (1.0 - smoothstep(0.5, 11.0, dl)) * 0.22;
  float cellLit = pow(clamp(uAmbient + lit * (1.0 - uAmbient) + el + fb, 0.0, 1.0), 1.32);

  float fogF  = uFogDensity <= 0.0 ? 0.0 : min(0.985, max(0.0, 1.0 - exp(-dl * uFogDensity)));
  vec3  rgb   = mix(s0.rgb * cellLit, uFogColor, fogF);
  float alpha = (1.0 - fogF * 0.75) * fade;

  /* Куда мордой на ЭКРАНЕ. Проецируем точку чуть впереди особи тем же
   * преобразованием и сравниваем экранные абсциссы: знак и есть направление
   * силуэта. Дешевле, чем тянуть в шейдер отдельный поворот. */
  vShape = 0.0;
  if (motion == ${CritterMotion.SCURRY}) {
    vec2 dh = pos + head * 0.3 - uPos;
    dh -= W_F * floor(dh / W_F + 0.5);
    float txh = invDet * (dir.y * dh.x - dir.x * dh.y);
    float tyh = invDet * (-plane.y * dh.x + plane.x * dh.y);
    float sxh = tyh > 0.1 ? (uResolution.x * 0.5) * (1.0 + txh / tyh) : sx;
    vShape = sxh >= sx ? 1.0 : -1.0;
  }
  vPhase  = gait;
  vAspect = motion == ${CritterMotion.SCURRY} ? 1.9 : (motion == ${CritterMotion.GROUND} ? 1.6 : 1.0);
  vWing   = (motion == ${CritterMotion.HOVER} || motion == ${CritterMotion.HALO}) ? 1.0 : 0.0;
  vColor  = vec4(rgb, alpha);
  vLocal  = aPos;
  vDepth  = clamp(1.0 - 0.1 / max(0.1, ty), 0.0, 0.999);

  // Квад опирается на ноги: раньше он центрировался на точке, и половина
  // особи уходила под пол — как у спрайтов, где startY = footY - spriteH.
  float px = sx + aPos.x * screenSize * vAspect;
  float py = footY + (aPos.y - 0.5) * screenSize;
  gl_Position = vec4((px / uResolution.x) * 2.0 - 1.0, 1.0 - (py / uResolution.y) * 2.0, 0.0, 1.0);
  // Мерцание крыла уносим в частоту, зависящую от особи, иначе рой пульсирует хором.
  vWing *= 0.55 + 0.45 * sin(uTime * 47.0 + seed * 61.0);
}
`;

const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
in vec4  vColor;
in vec2  vLocal;
in float vDepth;
in float vWing;
in float vShape;
in float vPhase;
out vec4 fragColor;

/**
 * Силуэт зверька: тело, голова и виляющий хвост. Локальный +x — вперёд,
 * +y — вниз к полу, поэтому тело смещено вниз и стоит на ногах, а не висит
 * серединой квада. Квад растянут по горизонтали (vAspect), так что локальный
 * круг ложится на экран нужной вытянутости.
 */
float beastMask(vec2 p, float phase) {
  float body = 1.0 - smoothstep(0.74, 1.0, length((p - vec2(0.02, 0.22)) / vec2(0.30, 0.24)));
  float head = 1.0 - smoothstep(0.72, 1.0, length((p - vec2(0.30, 0.18)) / vec2(0.15, 0.13)));
  float tx   = clamp(-p.x - 0.12, 0.0, 0.36);
  float wave = 0.10 * sin(tx * 14.0 - phase);
  float th   = 0.06 * (1.0 - tx / 0.44);
  float tail = p.x < -0.10 ? 1.0 - smoothstep(th * 0.4, th, abs(p.y - 0.20 - wave)) : 0.0;
  return clamp(max(max(body, head), tail), 0.0, 1.0);
}

void main() {
  float mask;
  if (vShape != 0.0) {
    mask = beastMask(vec2(vLocal.x * vShape, vLocal.y), vPhase);
    if (mask <= 0.01) discard;
  } else {
    // Квад уже растянут по горизонтали на vAspect, поэтому круг в локальных
    // координатах ложится на экран вытянутым телом наземной особи.
    float d = length(vLocal);
    if (d > 0.5) discard;
    mask = 1.0 - smoothstep(0.18, 0.5, d);
  }
  // Взмах крыла: летающая особь то плотнее, то прозрачнее.
  float wing = 1.0 - vWing * 0.45;
  gl_FragDepth = vDepth;
  fragColor = vec4(vColor.rgb, vColor.a * mask * wing);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`critter shader: ${log}`);
  }
  return sh;
}

const UNIFORM_NAMES = [
  'uResolution', 'uPos', 'uAngle', 'uPitch', 'uCamHeight', 'uPlaneLen', 'uTime',
  'uAmbient', 'uFlashlight', 'uFogDensity', 'uFogColor',
  'uWorldScale', 'uMinSize', 'uMaxSize', 'uCullDist',
  'uBlock', 'uPerCell', 'uSpeciesCount', 'uSpecies',
  'uCells', 'uFeatures', 'uLight', 'uDanger',
] as const;

export function createCritterPass(gl: WebGL2RenderingContext): CritterPassHandle {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`critter program: ${log}`);
  }

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    -0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
  ]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const name of UNIFORM_NAMES) u[name] = gl.getUniformLocation(prog, name);

  return {
    render(glCtx, ctx) {
      if (ctx.speciesCount <= 0 || ctx.block <= 0 || ctx.perCell <= 0) return 0;
      const instances = ctx.block * ctx.block * ctx.perCell;

      glCtx.useProgram(prog);
      glCtx.bindVertexArray(vao);
      glCtx.enable(glCtx.BLEND);
      glCtx.blendFunc(glCtx.SRC_ALPHA, glCtx.ONE_MINUS_SRC_ALPHA);
      glCtx.depthMask(false);

      glCtx.uniform2f(u['uResolution']!, ctx.screenW, ctx.screenH);
      glCtx.uniform2f(u['uPos']!, ctx.posX, ctx.posY);
      glCtx.uniform1f(u['uAngle']!, ctx.angle);
      glCtx.uniform1f(u['uPitch']!, ctx.pitch);
      glCtx.uniform1f(u['uCamHeight']!, ctx.camHeight);
      glCtx.uniform1f(u['uPlaneLen']!, ctx.planeLen);
      glCtx.uniform1f(u['uTime']!, ctx.time);
      glCtx.uniform1f(u['uAmbient']!, ctx.ambient);
      glCtx.uniform1f(u['uFlashlight']!, ctx.flashlight);
      glCtx.uniform1f(u['uFogDensity']!, ctx.fogDensity);
      glCtx.uniform3f(u['uFogColor']!, ctx.fogColor[0], ctx.fogColor[1], ctx.fogColor[2]);
      glCtx.uniform1f(u['uWorldScale']!, ctx.worldScreenScale);
      glCtx.uniform1f(u['uMinSize']!, ctx.minScreenSize);
      glCtx.uniform1f(u['uMaxSize']!, ctx.maxScreenSize);
      glCtx.uniform1f(u['uCullDist']!, ctx.cullDist);
      glCtx.uniform1i(u['uBlock']!, ctx.block);
      glCtx.uniform1i(u['uPerCell']!, ctx.perCell);
      glCtx.uniform1i(u['uSpeciesCount']!, ctx.speciesCount);
      glCtx.uniform4fv(u['uSpecies']!, ctx.species, 0, CRITTER_ACTIVE_SPECIES_CAP * CRITTER_SPECIES_STRIDE);

      glCtx.activeTexture(glCtx.TEXTURE0);
      glCtx.bindTexture(glCtx.TEXTURE_2D, ctx.cellsTex);
      glCtx.uniform1i(u['uCells']!, 0);
      glCtx.activeTexture(glCtx.TEXTURE1);
      glCtx.bindTexture(glCtx.TEXTURE_2D, ctx.featuresTex);
      glCtx.uniform1i(u['uFeatures']!, 1);
      glCtx.activeTexture(glCtx.TEXTURE2);
      glCtx.bindTexture(glCtx.TEXTURE_2D, ctx.lightTex);
      glCtx.uniform1i(u['uLight']!, 2);
      glCtx.activeTexture(glCtx.TEXTURE3);
      glCtx.bindTexture(glCtx.TEXTURE_2D, ctx.dangerTex);
      glCtx.uniform1i(u['uDanger']!, 3);

      glCtx.drawArraysInstanced(glCtx.TRIANGLES, 0, QUAD_VERTS, instances);

      glCtx.depthMask(true);
      glCtx.disable(glCtx.BLEND);
      glCtx.bindVertexArray(null);
      return instances;
    },
    dispose(glCtx) {
      glCtx.deleteBuffer(quad);
      glCtx.deleteVertexArray(vao);
      glCtx.deleteProgram(prog);
    },
  };
}
