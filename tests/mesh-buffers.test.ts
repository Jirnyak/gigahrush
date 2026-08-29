import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MESH_VERTEX_STRIDE,
  buildMeshVertexBatch,
  type MeshInstance,
} from '../src/render/mesh/buffers';
import type { VoxelChunkMesh } from '../src/render/mesh/voxel/types';

const BASE_INSTANCE: MeshInstance = {
  kind: 'debug_column',
  x: 1.5,
  y: 2.5,
  z: 0,
  yaw: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  color: [120, 120, 112],
  seed: 1,
};

test('mesh buffer builder draws zero for empty instance list', () => {
  const result = buildMeshVertexBatch([], 128);
  assert.equal(result.vertexCount, 0);
  assert.equal(result.triangleCount, 0);
  assert.equal(result.submittedInstances, 0);
});

test('mesh buffer builder skips unknown model ids safely', () => {
  const result = buildMeshVertexBatch([{ ...BASE_INSTANCE, kind: 'missing_model' }], 128);
  assert.equal(result.vertexCount, 0);
  assert.equal(result.triangleCount, 0);
  assert.equal(result.submittedInstances, 0);
  assert.equal(result.skippedInstances, 1);
});

test('mesh buffer builder truncates at triangle cap', () => {
  const result = buildMeshVertexBatch(
    [BASE_INSTANCE, { ...BASE_INSTANCE, x: 3.5 }],
    12,
  );
  assert.equal(result.truncated, true);
  assert.ok(result.triangleCount <= 12);
  assert.equal(result.vertexCount * MESH_VERTEX_STRIDE <= result.vertices.length, true);
});

test('mesh buffer builder emits finite triangle data', () => {
  const result = buildMeshVertexBatch([BASE_INSTANCE], 128);
  assert.equal(result.submittedInstances, 1);
  assert.equal(result.vertexCount > 0, true);
  assert.equal(result.triangleCount > 0, true);
  for (let i = 0; i < result.vertexCount * MESH_VERTEX_STRIDE; i++) {
    assert.equal(Number.isFinite(result.vertices[i]), true, `vertex float ${i} must be finite`);
  }
});

test('mesh buffer builder appends capped voxel chunk geometry', () => {
  const chunk: VoxelChunkMesh = {
    chunkX: 0,
    chunkY: 0,
    originX: 5,
    originY: 6,
    fieldWidth: 1,
    fieldHeight: 1,
    fieldDepth: 4,
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 2,
    ]),
    normals: new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]),
    colors: new Uint8Array([
      80, 90, 100, 255,
      80, 90, 100, 255,
      80, 90, 100, 255,
    ]),
    indices: new Uint32Array([0, 1, 2]),
    triangleCount: 1,
    truncated: false,
    skippedReason: '',
  };
  const result = buildMeshVertexBatch([], 1, undefined, [chunk]);
  assert.equal(result.submittedChunks, 1);
  assert.equal(result.triangleCount, 1);
  assert.equal(result.vertexCount, 3);
  assert.equal(result.vertices[0], 5);
  assert.equal(result.vertices[1], 6);
  assert.equal(result.vertices[2], 0);
  // Смещение считается ОТ шага, а не вписывается числом: раньше здесь стояло
  // `vertices[20]`, и добавление поля в вершину превратило проверку глубины
  // третьей вершины в проверку её же координаты X — тест покраснел не по делу.
  assert.equal(result.vertices[2 * MESH_VERTEX_STRIDE + 2], 0.5, 'z третьей вершины = 2 * (1/fieldDepth)');
});

test('mesh buffer writes a per-vertex fade radius', () => {
  // Дистанция растворения — свойство вершины, а не прохода: у процедурных полей
  // край свой и вчетверо ближе клеточного. Ноль сюда попадать не должен ни при
  // каких обстоятельствах — он означал бы edgeFade = 1, то есть невидимый меш.
  const result = buildMeshVertexBatch(
    [{ kind: 'debug_column', x: 2, y: 3, z: 0, yaw: 0, scaleX: 1, scaleY: 1, scaleZ: 1, color: [90, 90, 90], seed: 1, fadeRadius: 8 }],
    64,
  );
  assert.equal(result.vertexCount > 0, true);
  for (let v = 0; v < result.vertexCount; v++) {
    assert.equal(result.vertices[v * MESH_VERTEX_STRIDE + 9], 8, `вершина ${v} несёт свою дистанцию растворения`);
  }
});

test('mesh buffer never writes a zero or NaN fade radius', () => {
  // Тесты типами не проверяются, поэтому недостающее поле реально доходит сюда.
  // Нулевой или нечисловой край не должен гасить геометрию — он означает
  // «не растворять».
  const broken = { kind: 'debug_column', x: 2, y: 3, z: 0, yaw: 0, scaleX: 1, scaleY: 1, scaleZ: 1, color: [90, 90, 90], seed: 1 } as never;
  const result = buildMeshVertexBatch([broken], 64);
  assert.equal(result.vertexCount > 0, true);
  for (let v = 0; v < result.vertexCount; v++) {
    const fade = result.vertices[v * MESH_VERTEX_STRIDE + 9];
    assert.equal(Number.isFinite(fade) && fade > 0, true, `вершина ${v}: край ${fade} погасил бы меш`);
  }
});
