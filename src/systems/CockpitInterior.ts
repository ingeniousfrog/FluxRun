import * as THREE from 'three';
import type { MaterialLibrary } from '../assets/MaterialLibrary';

const _mirrorPos = new THREE.Vector3();
const _mirrorLook = new THREE.Vector3();
const _mirrorForward = new THREE.Vector3();
const _mirrorRight = new THREE.Vector3();

type MirrorRig = {
  readonly camera: THREE.PerspectiveCamera;
  readonly target: THREE.WebGLRenderTarget;
  readonly mesh: THREE.Mesh;
};

export class CockpitInterior {
  readonly root = new THREE.Group();
  private readonly steeringWheel: THREE.Group;
  private readonly leftHand: THREE.Group;
  private readonly rightHand: THREE.Group;
  private readonly mirrors: MirrorRig[] = [];
  private readonly hideDuringMirror: THREE.Object3D[] = [];
  private steerAngle = 0;

  constructor(materials: MaterialLibrary) {
    this.root.name = 'cockpitInterior';

    const dashMat = new THREE.MeshStandardMaterial({ color: '#14181e', roughness: 0.72, metalness: 0.28 });
    const trimMat = materials.trim;
    const leatherMat = new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.78, metalness: 0.08 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: '#111418', roughness: 0.9, metalness: 0.05 });
    const mirrorFrameMat = new THREE.MeshStandardMaterial({ color: '#2a3038', roughness: 0.5, metalness: 0.6 });

    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.28, 0.42), dashMat);
    dash.position.set(0, 0.34, 0.48);
    dash.castShadow = true;
    this.root.add(dash);

    const ip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.06), trimMat);
    ip.position.set(0, 0.44, 0.62);
    this.root.add(ip);

    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.024, 12, 24), trimMat);
    rim.rotation.x = -0.35;
    wheel.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.035, 12), trimMat);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    for (let i = 0; i < 3; i += 1) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.14, 0.018), trimMat);
      spoke.rotation.z = (i / 3) * Math.PI * 2;
      wheel.add(spoke);
    }
    wheel.position.set(0, 0.42, 0.44);
    wheel.rotation.x = -0.32;
    this.steeringWheel = wheel;
    this.root.add(wheel);

    this.leftHand = this.createHand(gloveMat, -0.18);
    this.rightHand = this.createHand(gloveMat, 0.18);
    this.root.add(this.leftHand, this.rightHand);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.48, 0.68), leatherMat);
    seat.position.set(0, 0.16, -0.16);
    this.root.add(seat);

    this.mirrors.push(
      this.createMirrorRig(mirrorFrameMat, {
        name: 'rear',
        frameSize: [0.48, 0.12, 0.02] as const,
        planeSize: [0.42, 0.09] as const,
        position: new THREE.Vector3(0, 0.66, 0.04),
        planeOffset: new THREE.Vector3(0, 0, 0.015),
        fov: 68,
        aspect: 4.6,
        lookBack: 22,
        lookUp: 0.45,
        camUp: 0.66,
        camBack: 0.15,
      }),
      this.createMirrorRig(mirrorFrameMat, {
        name: 'left',
        frameSize: [0.16, 0.09, 0.015] as const,
        planeSize: [0.12, 0.065] as const,
        position: new THREE.Vector3(-0.5, 0.58, 0.3),
        planeOffset: new THREE.Vector3(0.01, 0, 0.02),
        rotationY: 0.48,
        fov: 52,
        aspect: 1.85,
        lookBack: 10,
        lookSide: -14,
        lookUp: 0.35,
        camUp: 0.58,
        camBack: 0.08,
        camSide: -0.12,
      }),
      this.createMirrorRig(mirrorFrameMat, {
        name: 'right',
        frameSize: [0.16, 0.09, 0.015] as const,
        planeSize: [0.12, 0.065] as const,
        position: new THREE.Vector3(0.5, 0.58, 0.3),
        planeOffset: new THREE.Vector3(-0.01, 0, 0.02),
        rotationY: -0.48,
        fov: 52,
        aspect: 1.85,
        lookBack: 10,
        lookSide: 14,
        lookUp: 0.35,
        camUp: 0.58,
        camBack: 0.08,
        camSide: 0.12,
      }),
    );

    const aPillarL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), trimMat);
    aPillarL.position.set(-0.44, 0.58, 0.22);
    const aPillarR = aPillarL.clone();
    aPillarR.position.x = 0.44;
    this.root.add(aPillarL, aPillarR);

    this.root.visible = false;
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  registerMirrorOccluder(object: THREE.Object3D): void {
    this.hideDuringMirror.push(object);
  }

  update(steer: number, delta: number): void {
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, steer * 0.55, Math.min(1, delta * 10));
    this.steeringWheel.rotation.y = this.steerAngle;
    this.leftHand.rotation.y = this.steerAngle * 0.9;
    this.rightHand.rotation.y = this.steerAngle * 0.9;
    this.leftHand.position.x = -0.18 + this.steerAngle * 0.04;
    this.rightHand.position.x = 0.18 + this.steerAngle * 0.04;
  }

  renderMirrors(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    carPosition: THREE.Vector3,
    carQuat: THREE.Quaternion,
  ): void {
    if (!this.root.visible) return;

    _mirrorForward.set(0, 0, 1).applyQuaternion(carQuat);
    _mirrorRight.set(1, 0, 0).applyQuaternion(carQuat);

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const cockpitVisible = this.root.visible;
    const occluderVisibility = this.hideDuringMirror.map((obj) => obj.visible);

    this.root.visible = false;
    for (let i = 0; i < this.hideDuringMirror.length; i += 1) {
      this.hideDuringMirror[i].visible = false;
    }

    renderer.autoClear = true;

    for (const mirror of this.mirrors) {
      const spec = mirror.mesh.userData.mirrorSpec as MirrorSpec;
      _mirrorPos
        .set(spec.camSide ?? 0, spec.camUp, -spec.camBack)
        .applyQuaternion(carQuat)
        .add(carPosition);
      mirror.camera.position.copy(_mirrorPos);

      _mirrorLook
        .set(spec.lookSide ?? 0, spec.lookUp, spec.lookBack)
        .applyQuaternion(carQuat)
        .add(_mirrorPos);
      mirror.camera.lookAt(_mirrorLook);
      mirror.camera.updateMatrixWorld();

      renderer.setRenderTarget(mirror.target);
      renderer.clear();
      renderer.render(scene, mirror.camera);
    }

    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    this.root.visible = cockpitVisible;
    for (let i = 0; i < this.hideDuringMirror.length; i += 1) {
      this.hideDuringMirror[i].visible = occluderVisibility[i];
    }
  }

  dispose(): void {
    for (const mirror of this.mirrors) {
      mirror.target.dispose();
    }
  }

  private createHand(material: THREE.Material, x: number): THREE.Group {
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.1), material);
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.06), material);
    fingers.position.set(0, 0, 0.07);
    hand.add(palm, fingers);
    hand.position.set(x, 0.4, 0.42);
    hand.rotation.x = -0.35;
    return hand;
  }

  private createMirrorRig(
    frameMat: THREE.Material,
    spec: MirrorSpec,
  ): MirrorRig {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(...spec.frameSize), frameMat);
    frame.position.copy(spec.position);
    if (spec.rotationY) frame.rotation.y = spec.rotationY;
    this.root.add(frame);

    const target = new THREE.WebGLRenderTarget(320, Math.round(320 / spec.aspect));
    target.texture.colorSpace = THREE.SRGBColorSpace;

    const camera = new THREE.PerspectiveCamera(spec.fov, spec.aspect, 0.1, 140);

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(...spec.planeSize),
      new THREE.MeshBasicMaterial({ map: target.texture }),
    );
    mesh.position.copy(spec.position).add(spec.planeOffset);
    if (spec.rotationY) mesh.rotation.y = spec.rotationY;
    mesh.userData.mirrorSpec = spec;
    this.root.add(mesh);

    return { camera, target, mesh };
  }
}

type MirrorSpec = {
  readonly name: string;
  readonly frameSize: readonly [number, number, number];
  readonly planeSize: readonly [number, number];
  readonly position: THREE.Vector3;
  readonly planeOffset: THREE.Vector3;
  readonly rotationY?: number;
  readonly fov: number;
  readonly aspect: number;
  readonly lookBack: number;
  readonly lookUp: number;
  readonly camUp: number;
  readonly camBack: number;
  readonly lookSide?: number;
  readonly camSide?: number;
};
