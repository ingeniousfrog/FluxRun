import * as THREE from 'three';
import { createTrackCurve } from '../track/TrackGenerator';
import { buildTrackMeshes } from '../track/TrackMeshBuilder';
import type { GeneratedTrack } from '../track/types';

export class TrackView {
  readonly root: THREE.Group;
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly track: GeneratedTrack;
  private readonly startGate = new THREE.Group();

  constructor(track: GeneratedTrack) {
    this.track = track;
    this.curve = createTrackCurve(track);
    const meshes = buildTrackMeshes(track);
    this.root = meshes.root;
    this.buildStartGate(track.width / 2);
    this.root.add(this.startGate);
  }

  getCurve(): THREE.CatmullRomCurve3 {
    return this.curve;
  }

  getTrack(): GeneratedTrack {
    return this.track;
  }

  private buildStartGate(halfWidth: number): void {
    const start = this.track.samples[0];
    const tangent = start.tangent.clone().normalize();
    this.startGate.position.copy(start.position);
    this.startGate.position.y = 0.12;
    this.startGate.lookAt(start.position.clone().add(tangent));

    const frameMat = new THREE.MeshStandardMaterial({
      color: '#dfe8ef',
      roughness: 0.35,
      metalness: 0.55,
    });
    const bannerMat = new THREE.MeshStandardMaterial({
      color: '#1f6feb',
      emissive: '#0a2040',
      emissiveIntensity: 0.25,
      roughness: 0.4,
      metalness: 0.2,
    });

    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.2, 0.14), frameMat);
    postL.position.set(-halfWidth - 0.35, 1.6, 0);
    postL.castShadow = true;
    const postR = postL.clone();
    postR.position.x = halfWidth + 0.35;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2 + 0.9, 0.14, 0.14), frameMat);
    beam.position.y = 3.2;
    beam.castShadow = true;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2 + 0.5, 0.7, 0.06), bannerMat);
    banner.position.y = 2.55;
    this.startGate.add(postL, postR, beam, banner);
  }
}
