export class AudioSystem {
  private context: AudioContext | null = null;
  private unlocked = false;
  private muted = false;
  private ambience: OscillatorNode | null = null;
  private ambienceGain: GainNode | null = null;

  constructor() {
    const unlock = () => {
      void this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    await this.context.resume();
    this.unlocked = true;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ambienceGain) {
      this.ambienceGain.gain.value = muted ? 0 : 0.018;
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  startAmbience(): void {
    if (!this.context || this.muted || this.ambience) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 46;
    gain.gain.value = 0.018;
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    this.ambience = oscillator;
    this.ambienceGain = gain;
  }

  stopAmbience(): void {
    if (!this.ambience || !this.context) return;
    const now = this.context.currentTime;
    this.ambienceGain?.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    this.ambience.stop(now + 0.22);
    this.ambience = null;
    this.ambienceGain = null;
  }

  place(): void {
    this.blip(180, 330, 0.08, 'square', 0.055);
  }

  rotate(): void {
    this.blip(420, 260, 0.055, 'triangle', 0.045);
  }

  rush(): void {
    this.blip(110, 720, 0.38, 'sawtooth', 0.08);
    this.startAmbience();
  }

  shot(): void {
    this.blip(520, 960, 0.08, 'triangle', 0.035);
  }

  hit(): void {
    this.blip(140, 80, 0.14, 'sawtooth', 0.07);
  }

  combo(level: number): void {
    this.blip(320 + level * 42, 780 + level * 58, 0.18, 'triangle', 0.06);
  }

  fail(): void {
    this.blip(220, 64, 0.42, 'sawtooth', 0.1);
    this.stopAmbience();
  }

  cleared(): void {
    this.blip(260, 920, 0.5, 'triangle', 0.09);
    this.stopAmbience();
  }

  pickup(index: number): void {
    this.combo(index);
  }

  private blip(start: number, end: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.context || this.context.state !== 'running') return;
    if (this.muted) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, start), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, end), now + Math.max(0.02, duration * 0.72));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  dispose(): void {
    this.stopAmbience();
    void this.context?.close();
    this.context = null;
  }
}
