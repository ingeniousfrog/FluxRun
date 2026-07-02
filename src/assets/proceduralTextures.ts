import * as THREE from 'three';

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, alpha: number): void {
  const image = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    image.data[i] += n;
    image.data[i + 1] += n;
    image.data[i + 2] += n;
    image.data[i + 3] = Math.floor(255 * alpha);
  }
  ctx.putImageData(image, 0, 0);
}

function solidTexture(color: string, repeatX = 1, repeatY = 1): THREE.Texture {
  const tex = new THREE.DataTexture(new Uint8Array([53, 59, 66, 255]), 1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  void color;
  return tex;
}

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function createAsphaltTexture(): THREE.Texture {
  const size = 256;
  const canvas = createCanvas(size, size);
  if (!canvas) return solidTexture('#353b42', 6, 24);

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#353b42';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, size, 28, 0.35);
  for (let i = 0; i < 1200; i += 1) {
    const g = 40 + Math.random() * 30;
    ctx.fillStyle = `rgba(${g},${g + 2},${g + 4},0.12)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGrassTexture(): THREE.Texture {
  const size = 256;
  const canvas = createCanvas(size, size);
  if (!canvas) return solidTexture('#3f7a45', 18, 18);

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3f7a45';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, size, 22, 0.5);
  for (let i = 0; i < 800; i += 1) {
    ctx.strokeStyle = `rgba(${30 + Math.random() * 40},${90 + Math.random() * 50},${35 + Math.random() * 30},0.25)`;
    ctx.beginPath();
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 6, y - 4 - Math.random() * 6);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSkyGradient(skyTop: string, skyBottom: string): THREE.Texture {
  const canvas = createCanvas(4, 256);
  if (!canvas) {
    const tex = new THREE.DataTexture(new Uint8Array([77, 166, 255, 255]), 1, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, skyTop);
  grad.addColorStop(1, skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
