import * as THREE from 'three';
import { createSkyGradient } from '../assets/proceduralTextures';
import type { WeatherPreset } from '../track/types';

export class WeatherSystem {
  private readonly rainGroup = new THREE.Group();
  private readonly snowGroup = new THREE.Group();
  private rainPoints: THREE.Points | null = null;
  private snowPoints: THREE.Points | null = null;
  private preset: WeatherPreset | null = null;
  private skyTexture: THREE.Texture | null = null;

  constructor(private readonly scene: THREE.Scene) {
    this.scene.add(this.rainGroup, this.snowGroup);
  }

  apply(preset: WeatherPreset): void {
    this.preset = preset;
    this.scene.fog = new THREE.Fog(preset.skyBottom ?? preset.sky, preset.fogNear, preset.fogFar);
    if (this.skyTexture) this.skyTexture.dispose();
    this.skyTexture = createSkyGradient(preset.sky, preset.skyBottom ?? preset.sky);
    this.scene.background = this.skyTexture;
    this.ensureParticles(preset);
    this.updateParticleVisibility(preset);
  }

  update(delta: number, focus: THREE.Vector3): void {
    if (!this.preset) return;
    const intensity = this.preset.rainIntensity;
    if (intensity <= 0) return;

    const points = this.preset.type === 'snow' ? this.snowPoints : this.rainPoints;
    if (!points) return;

    const positions = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const count = positions.count;
    for (let i = 0; i < count; i += 1) {
      let y = positions.getY(i) - delta * (this.preset.type === 'snow' ? 8 : 22);
      if (y < focus.y - 6) y = focus.y + 18 + Math.random() * 8;
      positions.setY(i, y);

      let x = positions.getX(i);
      let z = positions.getZ(i);
      x += (Math.random() - 0.5) * delta * (this.preset.type === 'snow' ? 1.2 : 0.4);
      z += (Math.random() - 0.5) * delta * (this.preset.type === 'snow' ? 1.2 : 0.4);
      if (Math.abs(x - focus.x) > 28) x = focus.x + (Math.random() - 0.5) * 24;
      if (Math.abs(z - focus.z) > 28) z = focus.z + (Math.random() - 0.5) * 24;
      positions.setX(i, x);
      positions.setZ(i, z);
    }
    positions.needsUpdate = true;
  }

  getExposure(): number {
    return this.preset?.exposure ?? 1;
  }

  private ensureParticles(preset: WeatherPreset): void {
    if (!this.rainPoints) {
      this.rainPoints = this.createParticles(1800, 0.08, '#9ed8ff', 0.55);
      this.rainGroup.add(this.rainPoints);
    }
    if (!this.snowPoints) {
      this.snowPoints = this.createParticles(1200, 0.16, '#f4f8ff', 0.85);
      this.snowGroup.add(this.snowPoints);
    }
    this.scatterParticles(this.rainPoints, preset);
    this.scatterParticles(this.snowPoints, preset);
  }

  private updateParticleVisibility(preset: WeatherPreset): void {
    const rainOn = preset.type === 'rain' || preset.type === 'storm' || preset.type === 'fog';
    const snowOn = preset.type === 'snow';
    this.rainGroup.visible = rainOn && preset.rainIntensity > 0;
    this.snowGroup.visible = snowOn;
    if (this.rainPoints) {
      const material = this.rainPoints.material as THREE.PointsMaterial;
      material.opacity = preset.type === 'storm' ? 0.75 : 0.55;
    }
  }

  private createParticles(count: number, size: number, color: string, opacity: number): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    return new THREE.Points(geometry, material);
  }

  private scatterParticles(points: THREE.Points, preset: WeatherPreset): void {
    const positions = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const spread = preset.type === 'fog' ? 18 : 26;
    for (let i = 0; i < positions.count; i += 1) {
      positions.setXYZ(
        i,
        (Math.random() - 0.5) * spread * 2,
        Math.random() * 20 + 4,
        (Math.random() - 0.5) * spread * 2,
      );
    }
    positions.needsUpdate = true;
  }
}
