const MAX_KMH = 240;

export class SpeedometerHud {
  private readonly needle: SVGLineElement;
  private readonly value: HTMLElement;
  private readonly arc: SVGCircleElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <defs>
          <linearGradient id="spd-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#42d9ff"/>
            <stop offset="100%" stop-color="#9cf15f"/>
          </linearGradient>
        </defs>
        <circle cx="80" cy="80" r="72" fill="rgba(8,13,18,0.84)" stroke="rgba(66,217,255,0.35)" stroke-width="2"/>
        <circle id="spd-arc" cx="80" cy="80" r="58" fill="none" stroke="url(#spd-grad)" stroke-width="5"
          stroke-dasharray="220 365" stroke-linecap="round" transform="rotate(135 80 80)"/>
        <g stroke="rgba(244,240,229,0.22)" stroke-width="1">
          ${Array.from({ length: 13 }, (_, i) => {
            const a = (-120 + i * 20) * (Math.PI / 180);
            const x1 = 80 + Math.cos(a) * 48;
            const y1 = 80 + Math.sin(a) * 48;
            const x2 = 80 + Math.cos(a) * (i % 3 === 0 ? 56 : 52);
            const y2 = 80 + Math.sin(a) * (i % 3 === 0 ? 56 : 52);
            return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
          }).join('')}
        </g>
        <line id="spd-needle" x1="80" y1="80" x2="80" y2="30" stroke="#ff4d57" stroke-width="3" stroke-linecap="round"/>
        <circle cx="80" cy="80" r="5" fill="#f4f0e5"/>
      </svg>
      <div id="spd-readout"><strong id="spd-value">0</strong><span>KM/H</span></div>
    `;
    this.needle = root.querySelector('#spd-needle')!;
    this.arc = root.querySelector('#spd-arc')!;
    this.value = root.querySelector('#spd-value')!;
  }

  render(speedMs: number): void {
    const kmh = Math.max(0, speedMs * 3.6);
    const clamped = Math.min(MAX_KMH, kmh);
    const angle = -120 + (clamped / MAX_KMH) * 240;
    const rad = (angle - 90) * (Math.PI / 180);
    const x2 = 80 + Math.cos(rad) * 50;
    const y2 = 80 + Math.sin(rad) * 50;
    this.needle.setAttribute('x2', x2.toFixed(1));
    this.needle.setAttribute('y2', y2.toFixed(1));
    this.value.textContent = String(Math.round(kmh));
    const dash = 220 * (clamped / MAX_KMH);
    this.arc.setAttribute('stroke-dasharray', `${dash.toFixed(1)} 365`);
  }
}
