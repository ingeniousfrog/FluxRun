import * as THREE from 'three';

type Particle = {
  readonly mesh: THREE.Mesh;
  readonly velocity: THREE.Vector3;
  readonly spin: THREE.Vector3;
  life: number;
  maxLife: number;
};

export class VfxSystem {
  readonly group = new THREE.Group();

  private readonly particles: Particle[] = [];
  private readonly shardGeometry = new THREE.TetrahedronGeometry(0.08, 0);
  private readonly ringGeometry = new THREE.TorusGeometry(0.36, 0.018, 6, 28);

  spawnTrail(position: THREE.Vector3, color: string): void {
    this.spawnBurst(position, color, 6);
  }

  spawnBurst(position: THREE.Vector3, color: string, count: number): void {
    const particles = Array.from({ length: count }, (_, index) => {
      const angle = (index / count) * Math.PI * 2;
      const speed = 1.4 + (index % 3) * 0.34;
      const mesh = new THREE.Mesh(
        this.shardGeometry,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }),
      );
      mesh.position.copy(position);
      this.group.add(mesh);
      return {
        mesh,
        velocity: new THREE.Vector3(Math.cos(angle) * speed, 0.35 + (index % 4) * 0.1, Math.sin(angle) * speed),
        spin: new THREE.Vector3(1 + index * 0.1, 0.7, 0.4),
        life: 0.5,
        maxLife: 0.5,
      };
    });
    this.particles.push(...particles);
  }

  spawnRing(position: THREE.Vector3, color: string): void {
    const mesh = new THREE.Mesh(
      this.ringGeometry,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    mesh.position.copy(position);
    mesh.position.y += 0.08;
    mesh.rotation.x = Math.PI / 2;
    this.group.add(mesh);
    this.particles.push({
      mesh,
      velocity: new THREE.Vector3(0, 0.3, 0),
      spin: new THREE.Vector3(0, 0, 0),
      life: 0.42,
      maxLife: 0.42,
    });
  }

  update(delta: number): void {
    const nextParticles: Particle[] = [];
    for (const particle of this.particles) {
      particle.life -= delta;
      if (particle.life <= 0) {
        this.group.remove(particle.mesh);
        particle.mesh.geometry.dispose();
        const material = particle.mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material.dispose();
        continue;
      }
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.rotation.x += particle.spin.x * delta;
      particle.mesh.rotation.y += particle.spin.y * delta;
      particle.mesh.rotation.z += particle.spin.z * delta;
      const alpha = Math.max(0, particle.life / particle.maxLife);
      const material = particle.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = alpha;
      particle.mesh.scale.setScalar(1 + (1 - alpha) * 1.8);
      nextParticles.push(particle);
    }
    this.particles.length = 0;
    this.particles.push(...nextParticles);
  }

  dispose(): void {
    for (const particle of this.particles) {
      this.group.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      const material = particle.mesh.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
    this.particles.length = 0;
    this.shardGeometry.dispose();
    this.ringGeometry.dispose();
  }
}
