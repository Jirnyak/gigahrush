export const MESH_VERT_SRC = /* glsl */ `#version 300 es
precision highp float;

in vec3 aWorld;
in vec3 aNormal;
in vec3 aColor;

uniform vec2 uCam;
uniform vec2 uDir;
uniform vec2 uPlane;
uniform vec2 uPitchHeight;
uniform vec2 uResolution;
uniform float uInvDet;
uniform float uWorldSize;
uniform float uMaxDraw;

out vec3 vColor;
out vec3 vNormal;
out float vForward;

float torusDelta(float value, float origin) {
  float d = value - origin;
  float halfSize = uWorldSize * 0.5;
  if (d > halfSize) d -= uWorldSize;
  if (d < -halfSize) d += uWorldSize;
  return d;
}

void main() {
  float dx = torusDelta(aWorld.x, uCam.x);
  float dy = torusDelta(aWorld.y, uCam.y);
  float tx = uInvDet * (uDir.y * dx - uDir.x * dy);
  float ty = uInvDet * (-uPlane.y * dx + uPlane.x * dy);
  float depth = clamp(ty / uMaxDraw, 0.0, 1.0);
  float clipY = 2.0 * (aWorld.z - uPitchHeight.y) - 2.0 * uPitchHeight.x * ty;
  gl_Position = vec4(tx, clipY, (depth * 2.0 - 1.0) * ty, ty);
  vColor = aColor;
  vNormal = normalize(aNormal);
  vForward = ty;
}
`;

export const MESH_FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;

in vec3 vColor;
in vec3 vNormal;
in float vForward;

uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uAmbient;
uniform float uTime;
uniform float uMaxDraw;

out vec4 fragColor;

const float MESH_NEAR = 0.1;
const float MESH_DEPTH_BIAS = 0.015;

void main() {
  if (vForward <= MESH_NEAR) discard;
  vec3 lightDir = normalize(vec3(-0.42, 0.58, 0.72));
  float diffuse = max(0.0, dot(normalize(vNormal), lightDir));
  float side = 0.78 + 0.08 * sin(uTime * 0.7 + vColor.r * 6.2831);
  float shade = clamp(uAmbient + diffuse * 0.58 + side * 0.18, 0.12, 1.0);
  float fogBase = max(0.0, vForward * max(0.02, uFogDensity));
  float fog = clamp(1.0 - exp(-fogBase * fogBase * 1.15), 0.0, 0.92);
  vec3 color = mix(vColor * shade, uFogColor, fog);
  fragColor = vec4(color, 1.0);
  gl_FragDepth = clamp((vForward - MESH_DEPTH_BIAS) / max(1.0, uMaxDraw), 0.0, 1.0);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('mesh shader allocation failed');
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`mesh shader compile error: ${log}`);
  }
  return shader;
}

export function createMeshProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, MESH_VERT_SRC);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, MESH_FRAG_SRC);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error('mesh program allocation failed');
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown error';
    gl.deleteProgram(program);
    throw new Error(`mesh program link error: ${log}`);
  }
  return program;
}
