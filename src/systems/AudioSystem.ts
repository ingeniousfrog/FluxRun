export class AudioSystem {
  private context: AudioContext | null = null;
  private unlocked = false;
  private muted = false;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

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
    if (this.engineGain) {
      this.engineGain.gain.value = muted ? 0 : 0.06;
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  startEngine(): void {
    if (!this.context || this.muted || this.engineOsc) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 72;
    gain.gain.value = 0.06;
    osc.connect(gain).connect(this.context.destination);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = gain;
  }

  updateEngine(speed: number, throttling: boolean): void {
    if (!this.engineOsc || !this.engineGain || this.muted) return;
    const rpm = 70 + speed * 9 + (throttling ? 18 : 0);
    this.engineOsc.frequency.setTargetAtTime(rpm, this.context!.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(0.04 + Math.min(0.05, speed / 80), this.context!.currentTime, 0.1);
  }

  stopEngine(): void {
    if (!this.engineOsc || !this.context) return;
    this.engineOsc.stop();
    this.engineOsc.disconnect();
    this.engineGain?.disconnect();
    this.engineOsc = null;
    this.engineGain = null;
  }

  dispose(): void {
    this.stopEngine();
    void this.context?.close();
    this.context = null;
  }
}
