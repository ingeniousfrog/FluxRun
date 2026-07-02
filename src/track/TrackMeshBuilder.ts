import * as THREE from 'three';
import { createAsphaltTexture } from '../assets/proceduralTextures';
import {
  getBarrierEdgeOffset,
  TRACK_CURB_WIDTH,
  TRACK_SHOULDER_WIDTH,
} from './trackLayout';
import type { GeneratedTrack, TrackSample } from './types';

const BARRIER_HEIGHT = 0.72;

export type TrackMeshes = {
  readonly root: THREE.Group;
  readonly asphalt: THREE.Mesh;
  readonly shoulders: THREE.Mesh;
  readonly curbs: THREE.Group;
  readonly barriers: THREE.Group;
  readonly centerLine: THREE.Mesh;
  readonly startLine: THREE.Group;
};

function buildRibbon(
  samples: ReadonlyArray<TrackSample>,
  halfWidth: number,
  yOffset: number,
  uvScale = 1,
): { positions: Float32Array; uvs: Float32Array; indices: Uint32Array } {
  const count = samples.length;
  const vertexCount = count * 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array((count - 1) * 6);

  for (let i = 0; i < count; i += 1) {
    const sample = samples[i];
    const left = sample.normal.clone().multiplyScalar(halfWidth).add(sample.position);
    const right = sample.normal.clone().multiplyScalar(-halfWidth).add(sample.position);
    const li = i * 2;
    const ri = i * 2 + 1;

    positions[li * 3] = left.x;
    positions[li * 3 + 1] = left.y + yOffset;
    positions[li * 3 + 2] = left.z;
    positions[ri * 3] = right.x;
    positions[ri * 3 + 1] = right.y + yOffset;
    positions[ri * 3 + 2] = right.z;

    const v = (i / count) * uvScale;
    uvs[li * 2] = 0;
    uvs[li * 2 + 1] = v;
    uvs[ri * 2] = 1;
    uvs[ri * 2 + 1] = v;
  }

  let indexOffset = 0;
  for (let i = 0; i < count - 1; i += 1) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = i * 2 + 2;
    const d = i * 2 + 3;
    indices[indexOffset++] = a;
    indices[indexOffset++] = c;
    indices[indexOffset++] = b;
    indices[indexOffset++] = b;
    indices[indexOffset++] = c;
    indices[indexOffset++] = d;
  }

  return { positions, uvs, indices };
}

function createRibbonMesh(
  samples: ReadonlyArray<TrackSample>,
  halfWidth: number,
  material: THREE.Material,
  yOffset = 0.08,
  uvScale = 1,
): THREE.Mesh {
  const { positions, uvs, indices } = buildRibbon(samples, halfWidth, yOffset, uvScale);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function buildCurbSide(
  samples: ReadonlyArray<TrackSample>,
  halfWidth: number,
  side: 1 | -1,
  material: THREE.Material,
): THREE.Mesh {
  const inner = halfWidth;
  const outer = halfWidth + TRACK_CURB_WIDTH;
  const count = samples.length;
  const positions = new Float32Array(count * 2 * 3);
  const colors = new Float32Array(count * 2 * 3);

  for (let i = 0; i < count; i += 1) {
    const sample = samples[i];
    const innerPt = sample.normal.clone().multiplyScalar(side * inner).add(sample.position);
    const outerPt = sample.normal.clone().multiplyScalar(side * outer).add(sample.position);
    const li = i * 6;
    positions[li] = innerPt.x;
    positions[li + 1] = 0.095;
    positions[li + 2] = innerPt.z;
    positions[li + 3] = outerPt.x;
    positions[li + 4] = 0.1;
    positions[li + 5] = outerPt.z;

    const isRed = Math.floor(i / 2) % 2 === 0;
    const c = isRed ? new THREE.Color('#d92d3a') : new THREE.Color('#ece8df');
    colors[li] = c.r; colors[li + 1] = c.g; colors[li + 2] = c.b;
    colors[li + 3] = c.r; colors[li + 4] = c.g; colors[li + 5] = c.b;
  }

  const indices = new Uint32Array((count - 1) * 6);
  let o = 0;
  for (let i = 0; i < count - 1; i += 1) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = i * 2 + 2;
    const d = i * 2 + 3;
    indices[o++] = a; indices[o++] = c; indices[o++] = b;
    indices[o++] = b; indices[o++] = c; indices[o++] = d;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function buildCurbs(samples: ReadonlyArray<TrackSample>, halfWidth: number): THREE.Group {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  group.add(buildCurbSide(samples, halfWidth, 1, material));
  group.add(buildCurbSide(samples, halfWidth, -1, material));
  return group;
}

function buildConcreteWallSide(
  samples: ReadonlyArray<TrackSample>,
  edge: number,
  side: 1 | -1,
): THREE.BufferGeometry {
  const count = samples.length;
  const inner = edge - 0.22;
  const outer = edge + 0.08;
  const height = 1.05;
  const bottom = new Float32Array(count * 2 * 3);
  const top = new Float32Array(count * 2 * 3);

  for (let i = 0; i < count; i += 1) {
    const sample = samples[i];
    const innerPt = sample.normal.clone().multiplyScalar(side * inner).add(sample.position);
    const outerPt = sample.normal.clone().multiplyScalar(side * outer).add(sample.position);
    const bi = i * 6;
    bottom[bi] = innerPt.x; bottom[bi + 1] = 0.1; bottom[bi + 2] = innerPt.z;
    bottom[bi + 3] = outerPt.x; bottom[bi + 4] = 0.1; bottom[bi + 5] = outerPt.z;
    top[bi] = innerPt.x; top[bi + 1] = height; top[bi + 2] = innerPt.z;
    top[bi + 3] = outerPt.x; top[bi + 4] = height; top[bi + 5] = outerPt.z;
  }

  const positions = new Float32Array(count * 4 * 3);
  positions.set(bottom, 0);
  positions.set(top, bottom.length);

  const indices = new Uint32Array((count - 1) * 12);
  let o = 0;
  for (let i = 0; i < count - 1; i += 1) {
    const b0 = i * 2; const b1 = i * 2 + 1; const b2 = i * 2 + 2; const b3 = i * 2 + 3;
    const t0 = count * 2 + i * 2; const t1 = count * 2 + i * 2 + 1;
    const t2 = count * 2 + i * 2 + 2; const t3 = count * 2 + i * 2 + 3;
    indices[o++] = b0; indices[o++] = b2; indices[o++] = t0;
    indices[o++] = b2; indices[o++] = t2; indices[o++] = t0;
    indices[o++] = b1; indices[o++] = t3; indices[o++] = b3;
    indices[o++] = b1; indices[o++] = t1; indices[o++] = t3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function buildConcreteWalls(samples: ReadonlyArray<TrackSample>, halfWidth: number): THREE.Group {
  const edge = getBarrierEdgeOffset(halfWidth);
  const mat = new THREE.MeshStandardMaterial({
    color: '#8a9098',
    roughness: 0.88,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(buildConcreteWallSide(samples, edge, 1), mat));
  group.add(new THREE.Mesh(buildConcreteWallSide(samples, edge, -1), mat.clone()));
  return group;
}

function buildArmcoBarriers(samples: ReadonlyArray<TrackSample>, halfWidth: number): THREE.Group {
  const group = new THREE.Group();
  const railMat = new THREE.MeshStandardMaterial({
    color: '#c5ced6',
    roughness: 0.32,
    metalness: 0.78,
  });
  const postMat = new THREE.MeshStandardMaterial({
    color: '#8e98a2',
    roughness: 0.45,
    metalness: 0.55,
  });
  const edge = getBarrierEdgeOffset(halfWidth);
  const step = 4;

  for (let i = 0; i < samples.length; i += step) {
    const sample = samples[i];
    const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
    for (const side of [-1, 1]) {
      const px = sample.position.x + sample.normal.x * side * edge;
      const pz = sample.position.z + sample.normal.z * side * edge;

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, BARRIER_HEIGHT, 6), postMat);
      post.position.set(px, BARRIER_HEIGHT * 0.5, pz);
      post.castShadow = true;
      group.add(post);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.8), railMat);
      rail.position.set(px, BARRIER_HEIGHT * 0.72, pz);
      rail.rotation.y = yaw;
      rail.castShadow = true;
      group.add(rail);

      const railLow = rail.clone();
      railLow.position.y = BARRIER_HEIGHT * 0.38;
      group.add(railLow);
    }
  }

  return group;
}

function buildCenterLine(samples: ReadonlyArray<TrackSample>): THREE.Mesh {
  const dashed = samples.filter((_, i) => i % 6 < 3);
  if (dashed.length < 2) return new THREE.Mesh();
  return createRibbonMesh(
    dashed,
    0.09,
    new THREE.MeshStandardMaterial({
      color: '#f2de6a',
      emissive: '#5a4810',
      emissiveIntensity: 0.2,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide,
    }),
    0.095,
  );
}

function buildStartLine(samples: ReadonlyArray<TrackSample>, halfWidth: number): THREE.Group {
  const group = new THREE.Group();
  const slice = samples.slice(0, 5);
  for (let stripe = 0; stripe < 8; stripe += 1) {
    const offset = (stripe / 8 - 0.5) * halfWidth * 1.6;
    const mini = slice.map((s) => ({
      ...s,
      position: s.position.clone().add(s.normal.clone().multiplyScalar(offset)),
      tangent: s.tangent.clone(),
      normal: s.normal.clone(),
    }));
    const dark = stripe % 2 === 0;
    const mesh = createRibbonMesh(
      mini,
      0.55,
      new THREE.MeshStandardMaterial({
        color: dark ? '#1a1d22' : '#f3f0e8',
        roughness: 0.42,
        metalness: 0.06,
        side: THREE.DoubleSide,
      }),
      0.105,
    );
    group.add(mesh);
  }
  return group;
}

export function buildTrackMeshes(track: GeneratedTrack): TrackMeshes {
  const root = new THREE.Group();
  const halfWidth = track.width / 2;
  const samples = track.samples;
  const asphaltMap = createAsphaltTexture();

  const asphalt = createRibbonMesh(
    samples,
    halfWidth,
    new THREE.MeshStandardMaterial({
      map: asphaltMap,
      color: '#e2e6ea',
      roughness: 0.78,
      metalness: 0.22,
      side: THREE.DoubleSide,
    }),
    0.08,
    40,
  );

  const shoulders = createRibbonMesh(
    samples,
    halfWidth + TRACK_SHOULDER_WIDTH,
    new THREE.MeshStandardMaterial({
      color: '#5fa864',
      roughness: 0.9,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    0.055,
  );

  const curbs = buildCurbs(samples, halfWidth);
  const concreteWalls = buildConcreteWalls(samples, halfWidth);
  const barriers = buildArmcoBarriers(samples, halfWidth);
  const centerLine = buildCenterLine(samples);
  const startLine = buildStartLine(samples, halfWidth);

  root.add(shoulders, asphalt, curbs, concreteWalls, centerLine, startLine, barriers);
  return { root, asphalt, shoulders, curbs, barriers, centerLine, startLine };
}

export function getTrackHalfWidth(track: GeneratedTrack): number {
  return track.width / 2;
}
