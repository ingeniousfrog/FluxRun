import * as THREE from 'three';
import type { PipeColor } from '../game/types';

export class MaterialLibrary {
  readonly ground = new THREE.MeshStandardMaterial({
    color: '#141a1d',
    roughness: 0.78,
    metalness: 0.24,
  });

  readonly gridLine = new THREE.MeshBasicMaterial({
    color: '#30424b',
    transparent: true,
    opacity: 0.55,
  });

  readonly route = new THREE.MeshBasicMaterial({
    color: '#d7f7ff',
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });

  readonly ghost = new THREE.MeshBasicMaterial({
    color: '#f8f3e2',
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  readonly blockedGhost = new THREE.MeshBasicMaterial({
    color: '#ff5e7b',
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });

  readonly pipeBase = new THREE.MeshStandardMaterial({
    color: '#202a30',
    roughness: 0.56,
    metalness: 0.46,
  });

  readonly pipeTrim = new THREE.MeshStandardMaterial({
    color: '#657986',
    roughness: 0.42,
    metalness: 0.72,
  });

  readonly source = new THREE.MeshStandardMaterial({
    color: '#f4eee0',
    emissive: '#365d64',
    emissiveIntensity: 0.45,
    roughness: 0.32,
    metalness: 0.5,
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

  readonly enemyCore = new THREE.MeshStandardMaterial({
    color: '#ff6d8d',
    emissive: '#5f1022',
    emissiveIntensity: 0.55,
    roughness: 0.36,
    metalness: 0.46,
  });

  readonly enemyArmor = new THREE.MeshStandardMaterial({
    color: '#332a3f',
    roughness: 0.55,
    metalness: 0.45,
  });

  readonly projectilePlayer = new THREE.MeshBasicMaterial({ color: '#b8fff1' });
  readonly projectileEnemy = new THREE.MeshBasicMaterial({ color: '#ff5e7b' });
  readonly worldMetal = new THREE.MeshStandardMaterial({ color: '#222d34', roughness: 0.62, metalness: 0.58 });
  readonly hazard = new THREE.MeshStandardMaterial({ color: '#ffb02f', roughness: 0.4, metalness: 0.2 });

  private readonly pipeColors: Record<PipeColor, THREE.MeshStandardMaterial> = {
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

  pipe(color: PipeColor): THREE.MeshStandardMaterial {
    return this.pipeColors[color];
  }

  dispose(): void {
    const materials = [
      this.ground,
      this.gridLine,
      this.route,
      this.ghost,
      this.blockedGhost,
      this.pipeBase,
      this.pipeTrim,
      this.source,
      this.tankHull,
      this.tankDark,
      this.glass,
      this.enemyCore,
      this.enemyArmor,
      this.projectilePlayer,
      this.projectileEnemy,
      this.worldMetal,
      this.hazard,
      ...Object.values(this.pipeColors),
    ];
    for (const material of materials) material.dispose();
  }
}
