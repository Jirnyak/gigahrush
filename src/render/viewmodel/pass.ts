/**
 * Проход отрисовки вьюмодели.
 *
 * Рисует уже готовые квады в тот же низкий кадр, что и мир, — после спрайтов и
 * частиц, до блума. Из этого следует всё, ради чего так и сделано: руки красит
 * свет этажа, их мнёт самосбор, дульная вспышка попадает в блум, и пиксель у
 * оружия ровно тот же, что у стены.
 *
 * Проход не решает НИЧЕГО: что рисовать, где и каким цветом, посчитано в
 * `runtime`. Здесь только кэш текстур и два треугольника.
 */

import type { ViewmodelFrameState } from './types';
import { VM } from './types';

/** Текстур в кэше: две руки на три кадра плюс вспышка и запас на смену. */
const TEXTURE_CACHE_MAX = 24;
const TEXTURE_CACHE_TARGET = 18;

export interface ViewmodelPassContext {
  screenW: number;
  screenH: number;
  frame: ViewmodelFrameState;
}

export interface ViewmodelPassHandle {
  render(gl: WebGL2RenderingContext, ctx: ViewmodelPassContext): number;
  dispose(gl: WebGL2RenderingContext): void;
}

const VERT_SRC = /* glsl */ `#version 300 es
precision highp float;

in vec2 aPos;

uniform vec2  uResolution;
uniform vec4  uRect;   // x, y, w, h в пикселях кадра
uniform float uRoll;

out vec2 vUV;

void main() {
  // Никакого переворота по вертикали. Здесь стояло 1.0 - aPos.y, и оно
  // ПЕРЕВОРАЧИВАЛО оружие вверх ногами: texImage2D кладёт нулевую строку данных
  // в v = 0, а нулевая строка холста — это его ВЕРХ, поэтому верху экрана
  // соответствует v = 0, а не единица. Экранная система координат уже
  // перевёрнута ниже, в gl_Position; второй переворот ставил ствол в пол.
  vUV = aPos;
  vec2 local = aPos * uRect.zw;
  // Наклон вокруг низа-центра холста: рука висит на запястье, а не на макушке.
  vec2 pivot = vec2(uRect.z * 0.5, uRect.w);
  float s = sin(uRoll), c = cos(uRoll);
  vec2 r = local - pivot;
  local = pivot + vec2(r.x * c - r.y * s, r.x * s + r.y * c);
  vec2 px = uRect.xy + local;
  gl_Position = vec4((px / uResolution) * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
}
`;

const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUV;

uniform sampler2D uTex;
uniform vec3  uTint;
uniform float uAlpha;

out vec4 fragColor;

void main() {
  vec4 t = texture(uTex, vUV);
  if (t.a <= 0.004) discard;
  fragColor = vec4(t.rgb * uTint, t.a * uAlpha);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`viewmodel shader: ${log}`);
  }
  return sh;
}

interface TextureEntry {
  texture: WebGLTexture;
  usedAt: number;
}

export function createViewmodelPass(gl: WebGL2RenderingContext): ViewmodelPassHandle {
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
    throw new Error(`viewmodel program: ${log}`);
  }

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 1,
  ]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const uResolution = gl.getUniformLocation(prog, 'uResolution');
  const uRect = gl.getUniformLocation(prog, 'uRect');
  const uRoll = gl.getUniformLocation(prog, 'uRoll');
  const uTex = gl.getUniformLocation(prog, 'uTex');
  const uTint = gl.getUniformLocation(prog, 'uTint');
  const uAlpha = gl.getUniformLocation(prog, 'uAlpha');

  const textures = new Map<string, TextureEntry>();
  let clock = 0;

  function textureFor(glCtx: WebGL2RenderingContext, key: string, sprite: Uint32Array): WebGLTexture | undefined {
    const hit = textures.get(key);
    if (hit) { hit.usedAt = ++clock; return hit.texture; }
    if (sprite.length !== VM * VM) return undefined;
    const tex = glCtx.createTexture();
    if (!tex) return undefined;
    glCtx.bindTexture(glCtx.TEXTURE_2D, tex);
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.NEAREST);
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, glCtx.NEAREST);
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, glCtx.CLAMP_TO_EDGE);
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, glCtx.CLAMP_TO_EDGE);
    glCtx.texImage2D(
      glCtx.TEXTURE_2D, 0, glCtx.RGBA8, VM, VM, 0, glCtx.RGBA, glCtx.UNSIGNED_BYTE,
      new Uint8Array(sprite.buffer, sprite.byteOffset, sprite.byteLength),
    );
    textures.set(key, { texture: tex, usedAt: ++clock });
    if (textures.size > TEXTURE_CACHE_MAX) {
      const ordered = [...textures.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt);
      for (let i = 0; i < ordered.length && textures.size > TEXTURE_CACHE_TARGET; i++) {
        glCtx.deleteTexture(ordered[i][1].texture);
        textures.delete(ordered[i][0]);
      }
    }
    return tex;
  }

  return {
    render(glCtx, ctx) {
      const quads = ctx.frame.quads;
      if (!quads.length) return 0;

      glCtx.useProgram(prog);
      glCtx.bindVertexArray(vao);
      glCtx.enable(glCtx.BLEND);
      glCtx.depthMask(false);
      glCtx.uniform2f(uResolution, ctx.screenW, ctx.screenH);
      glCtx.activeTexture(glCtx.TEXTURE0);
      glCtx.uniform1i(uTex, 0);

      let drawn = 0;
      for (let i = 0; i < quads.length; i++) {
        const q = quads[i];
        const tex = textureFor(glCtx, q.key, q.sprite);
        if (!tex) continue;
        glCtx.blendFunc(glCtx.SRC_ALPHA, q.additive ? glCtx.ONE : glCtx.ONE_MINUS_SRC_ALPHA);
        glCtx.bindTexture(glCtx.TEXTURE_2D, tex);
        const side = VM * q.scale;
        glCtx.uniform4f(uRect, q.x, q.y, side, side);
        glCtx.uniform1f(uRoll, q.roll);
        glCtx.uniform3f(uTint, q.tint[0], q.tint[1], q.tint[2]);
        glCtx.uniform1f(uAlpha, q.alpha);
        glCtx.drawArrays(glCtx.TRIANGLES, 0, 6);
        drawn++;
      }

      glCtx.blendFunc(glCtx.SRC_ALPHA, glCtx.ONE_MINUS_SRC_ALPHA);
      glCtx.depthMask(true);
      glCtx.disable(glCtx.BLEND);
      glCtx.bindVertexArray(null);
      return drawn;
    },
    dispose(glCtx) {
      for (const entry of textures.values()) glCtx.deleteTexture(entry.texture);
      textures.clear();
      glCtx.deleteBuffer(quad);
      glCtx.deleteVertexArray(vao);
      glCtx.deleteProgram(prog);
    },
  };
}
