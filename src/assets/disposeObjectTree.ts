import * as THREE from 'three';

function disposeMaterial(
  material: THREE.Material,
  disposedMaterials: Set<THREE.Material>,
  disposedTextures: Set<THREE.Texture>,
): void {
  if (disposedMaterials.has(material)) return;
  disposedMaterials.add(material);

  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
      disposedTextures.add(value);
      value.dispose();
    }
  }
  material.dispose();
}

export function disposeObjectTree(root: THREE.Object3D): void {
  const disposedMaterials = new Set<THREE.Material>();
  const disposedTextures = new Set<THREE.Texture>();

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const material = object.material;
    if (Array.isArray(material)) {
      for (const item of material) disposeMaterial(item, disposedMaterials, disposedTextures);
      return;
    }
    disposeMaterial(material, disposedMaterials, disposedTextures);
  });
}
