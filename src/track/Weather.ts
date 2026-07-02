import type { WeatherPreset, WeatherType } from './types';

const WEATHER_TABLE: Record<WeatherType, Omit<WeatherPreset, 'type'>> = {
  clear: {
    label: 'CLEAR',
    grip: 1,
    fogNear: 70,
    fogFar: 180,
    rainIntensity: 0,
    exposure: 1.08,
    sky: '#4da6ff',
    skyBottom: '#b8e4ff',
    ambient: '#dff4ff',
  },
  rain: {
    label: 'RAIN',
    grip: 0.82,
    fogNear: 35,
    fogFar: 95,
    rainIntensity: 0.75,
    exposure: 0.98,
    sky: '#0b141c',
    ambient: '#9ed8ff',
  },
  fog: {
    label: 'FOG',
    grip: 0.88,
    fogNear: 8,
    fogFar: 42,
    rainIntensity: 0.15,
    exposure: 0.92,
    sky: '#121820',
    ambient: '#b8c4cc',
  },
  storm: {
    label: 'STORM',
    grip: 0.72,
    fogNear: 18,
    fogFar: 72,
    rainIntensity: 1.15,
    exposure: 0.86,
    sky: '#060a10',
    ambient: '#7ab0d8',
  },
  snow: {
    label: 'SNOW',
    grip: 0.68,
    fogNear: 45,
    fogFar: 160,
    rainIntensity: 0.55,
    exposure: 1.12,
    sky: '#8eb8d8',
    skyBottom: '#dceaf4',
    ambient: '#e8f4ff',
  },
};

const WEATHER_ORDER: WeatherType[] = ['clear', 'rain', 'fog', 'storm', 'snow'];

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeather(seed: number): WeatherPreset {
  const params = new URLSearchParams(window.location.search);
  const forced = params.get('weather') as WeatherType | null;
  if (forced && WEATHER_ORDER.includes(forced)) {
    return { type: forced, ...WEATHER_TABLE[forced] };
  }

  const rng = mulberry32(seed ^ 0x9e3779b9);
  const type = WEATHER_ORDER[Math.floor(rng() * WEATHER_ORDER.length)];
  return { type, ...WEATHER_TABLE[type] };
}
