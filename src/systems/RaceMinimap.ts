import type { GeneratedTrack } from '../track/types';

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type MinimapRacer = {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly color: string;
  readonly isPlayer?: boolean;
};

export class RaceMinimap {
  private readonly ctx: CanvasRenderingContext2D;
  private centerPath: Float32Array | null = null;
  private bounds: Bounds | null = null;
  private readonly size: number;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Minimap canvas unsupported');
    this.ctx = ctx;
    this.size = canvas.width;
  }

  setTrack(track: GeneratedTrack): void {
    const points = new Float32Array(track.samples.length * 2);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < track.samples.length; i += 1) {
      const p = track.samples[i].position;
      points[i * 2] = p.x;
      points[i * 2 + 1] = p.z;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }

    this.centerPath = points;
    const pad = track.width * 0.9;
    this.bounds = {
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad,
    };
  }

  render(
    carX: number,
    carZ: number,
    heading: number,
    opponents: ReadonlyArray<MinimapRacer> = [],
  ): void {
    if (!this.centerPath || !this.bounds) return;

    const { ctx, size } = this;
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const scale = (size - 24) / Math.max(spanX, spanZ);

    const toScreen = (x: number, z: number): [number, number] => [
      (x - minX) * scale + 12,
      (z - minZ) * scale + 12,
    ];

    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(8, 13, 18, 0.88)';
    ctx.strokeStyle = 'rgba(66, 217, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, size - 1, size - 1, 10);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(244, 240, 229, 0.55)';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < this.centerPath.length / 2; i += 1) {
      const [sx, sy] = toScreen(this.centerPath[i * 2], this.centerPath[i * 2 + 1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.stroke();

    for (const opponent of opponents) {
      this.drawRacer(toScreen(opponent.x, opponent.z), opponent.heading, opponent.color, false);
    }

    this.drawRacer(toScreen(carX, carZ), heading, '#ff4d57', true);
  }

  private drawRacer(
    pos: [number, number],
    heading: number,
    color: string,
    isPlayer: boolean,
  ): void {
    const [cx, cy] = pos;
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(heading);
    ctx.fillStyle = color;
    ctx.strokeStyle = isPlayer ? '#fff' : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = isPlayer ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (isPlayer) {
      ctx.fillStyle = 'rgba(156, 241, 95, 0.95)';
      ctx.beginPath();
      ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
