import * as THREE from 'three';

export type AccentColor = 'cyan' | 'amber' | 'magenta' | 'lime';

export class MaterialLibrary {
  readonly ground = new THREE.MeshStandardMaterial({
    color: '#2d5a34',
    roughness: 0.88,
    metalness: 0.04,
  });

  readonly carDark = new THREE.MeshStandardMaterial({
    color: '#1a1f24',
    roughness: 0.55,
    metalness: 0.35,
  });

  readonly tire = new THREE.MeshStandardMaterial({
    color: '#121418',
    roughness: 0.95,
    metalness: 0.05,
  });

  readonly rim = new THREE.MeshStandardMaterial({
    color: '#c8d0d8',
    roughness: 0.28,
    metalness: 0.82,
  });

  readonly tankHull = new THREE.MeshStandardMaterial({
    color: '#e7edf1',
    roughness: 0.38,
    metalness: 0.62,
  });

  readonly tankDark = new THREE.MeshStandardMaterial({
    color: '#1b242c',
    roughness: 0.6,
    metalness: 0.5,
  });

  readonly glass = new THREE.MeshPhysicalMaterial({
    color: '#8fe9ff',
    emissive: '#14516a',
    emissiveIntensity: 0.32,
    roughness: 0.08,
    metalness: 0.05,
    transmission: 0.28,
    thickness: 0.18,
    clearcoat: 0.8,
  });

  readonly trim = new THREE.MeshStandardMaterial({
    color: '#657986',
    roughness: 0.42,
    metalness: 0.72,
  });

  readonly carBody = new THREE.MeshPhysicalMaterial({
    color: '#c8102e',
    roughness: 0.08,
    metalness: 0.88,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    reflectivity: 0.95,
  });

  carPaint(color: string): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.08,
      metalness: 0.88,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      reflectivity: 0.95,
    });
  }

  readonly wheel = new THREE.MeshStandardMaterial({
    color: '#15181c',
    roughness: 0.9,
    metalness: 0.15,
  });

  private readonly accents: Record<AccentColor, THREE.MeshStandardMaterial> = {
    cyan: new THREE.MeshStandardMaterial({
      color: '#42d9ff',
      emissive: '#0a4056',
      emissiveIntensity: 0.62,
      roughness: 0.28,
      metalness: 0.42,
    }),
    amber: new THREE.MeshStandardMaterial({
      color: '#ffbd4a',
      emissive: '#633c08',
      emissiveIntensity: 0.52,
      roughness: 0.32,
      metalness: 0.38,
    }),
    magenta: new THREE.MeshStandardMaterial({
      color: '#ff5fb1',
      emissive: '#62143c',
      emissiveIntensity: 0.5,
      roughness: 0.35,
      metalness: 0.36,
    }),
    lime: new THREE.MeshStandardMaterial({
      color: '#9cf15f',
      emissive: '#27580e',
      emissiveIntensity: 0.46,
      roughness: 0.36,
      metalness: 0.34,
    }),
  };

  accent(color: AccentColor): THREE.MeshStandardMaterial {
    return this.accents[color];
  }

  dispose(): void {
    const materials = [
      this.ground,
      this.carDark,
      this.tire,
      this.rim,
      this.tankHull,
      this.tankDark,
      this.glass,
      this.trim,
      this.carBody,
      this.wheel,
      ...Object.values(this.accents),
    ];
    for (const material of materials) material.dispose();
  }
}
