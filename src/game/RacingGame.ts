import * as THREE from 'three';
import { MaterialLibrary } from '../assets/MaterialLibrary';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { RaceCar } from '../entities/RaceCar';
import type { CarPhysicsState } from '../physics/CarPhysics';
import { RacePhysicsWorld } from '../physics/RacePhysicsWorld';
import { VehicleController } from '../physics/VehicleController';
import { AudioSystem } from '../systems/AudioSystem';
import { DriftVfx } from '../systems/DriftVfx';
import { LapSystem } from '../systems/LapSystem';
import type { LapSnapshot } from '../systems/LapSystem';
import { RaceCamera } from '../systems/RaceCamera';
import { CockpitInterior } from '../systems/CockpitInterior';
import { RacingHud } from '../systems/RacingHud';
import { SceneEnvironment } from '../systems/SceneEnvironment';
import { TrackView } from '../systems/TrackView';
import { WeatherSystem } from '../systems/WeatherSystem';
import { generateTrack, parseRaceSeedFromUrl, randomRaceSeed } from '../track/TrackGenerator';
import { AiOpponentManager } from '../systems/AiOpponentManager';
import { pickWeather } from '../track/Weather';
import type { GeneratedTrack, RacePhase, WeatherPreset } from '../track/types';

const TOTAL_LAPS = 3;
const COUNTDOWN_SECONDS = 3;
const AUTO_RESTART_DELAY = 5;
const STORAGE_KEY = 'fluxrun-racing-meta';

type RacingMeta = {
  runs: number;
  bestTime: number | null;
};

export class RacingGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 420);
  private readonly carLight = new THREE.PointLight('#fff4e8', 1.6, 28, 1.4);
  private readonly materials = new MaterialLibrary();
  private readonly input: InputController;
  private readonly audio = new AudioSystem();
  private readonly hud = new RacingHud();
  private readonly raceCamera = new RaceCamera(this.camera);
  private readonly weatherSystem: WeatherSystem;
  private readonly driftVfx = new DriftVfx();
  private readonly chassisPos = new THREE.Vector3();
  private readonly chassisQuat = new THREE.Quaternion();
  private readonly velocity = new THREE.Vector3();
  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );

  private trackView!: TrackView;
  private sceneEnvironment!: SceneEnvironment;
  private physicsWorld!: RacePhysicsWorld;
  private playerVehicle!: VehicleController;
  private lapSystem!: LapSystem;
  private raceCar = new RaceCar(this.materials);
  private track!: GeneratedTrack;
  private weather!: WeatherPreset;
  private driveSnapshot: LapSnapshot = {
    progress: 0,
    speed: 0,
    lateral: 0,
    lap: 0,
    lapProgress: 0,
    finished: false,
    onTrack: true,
  };

  private phase: RacePhase = 'ready';
  private countdown = COUNTDOWN_SECONDS;
  private elapsed = 0;
  private frame = 0;
  private lapTime = 0;
  private raceTime = 0;
  private bestLap: number | null = null;
  private lapStart = 0;
  private lastCompletedLap = 0;
  private message = '准备发车';
  private muted = false;
  private meta: RacingMeta = { runs: 0, bestTime: null };
  private readonly movement = new THREE.Vector2();
  private steerInput = 0;
  private readonly aiOpponents: AiOpponentManager;
  private readonly cockpit: CockpitInterior;
  private racePosition = 1;
  private finishHold = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.weatherSystem = new WeatherSystem(this.scene);
    this.input = new InputController(
      document.querySelector('#touch-stick')!,
      document.querySelector('#touch-knob')!,
      document.querySelector('#boost-button')!,
      Array.from(document.querySelectorAll<HTMLElement>('#touch-actions [data-action], #mute-action')),
    );
    this.loadMeta();
    this.aiOpponents = new AiOpponentManager(this.scene, this.materials);
    this.cockpit = new CockpitInterior(this.materials);
    this.bootstrapRace(parseRaceSeedFromUrl());
    this.createScene();
    this.hud.onRaceGo(() => this.beginCountdown());
    this.raceCamera.snapTo(this.raceCar.position, this.getHeading(), this.chassisQuat);
    resizeRenderer(this.renderer, this.camera, 1.75);
    window.addEventListener('resize', this.onResize);
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.materials.dispose();
    this.cockpit.dispose();
    this.trackView?.dispose();
    this.sceneEnvironment?.dispose();
    this.physicsWorld?.dispose();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
  }

  private readonly onResize = () => {
    resizeRenderer(this.renderer, this.camera, 1.75);
  };

  private createScene(): void {
    const ambient = new THREE.HemisphereLight('#eef8ff', '#3d6a48', 1.25);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight('#fff8ec', 3.1);
    key.position.set(-16, 28, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 120;
    key.shadow.camera.left = -55;
    key.shadow.camera.right = 55;
    key.shadow.camera.top = 55;
    key.shadow.camera.bottom = -55;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight('#9ed0ff', 0.75);
    rim.position.set(18, 10, -14);
    this.scene.add(rim);

    this.carLight.castShadow = false;
    this.scene.add(this.carLight);

    this.scene.add(this.sceneEnvironment.root);
    this.scene.add(this.trackView.root);
    this.scene.add(this.raceCar.root);
    this.raceCar.root.add(this.cockpit.root);
    this.cockpit.registerMirrorOccluder(this.raceCar.root);
    this.scene.add(this.driftVfx.group);
  }

  private bootstrapRace(seed: number): void {
    if (this.physicsWorld) {
      this.physicsWorld.dispose();
    }

    this.track = generateTrack(seed);
    this.weather = pickWeather(seed);
    this.sceneEnvironment = new SceneEnvironment(this.track);
    this.trackView = new TrackView(this.track);
    const start = this.track.samples[0];
    const heading = Math.atan2(start.tangent.x, start.tangent.z);

    this.physicsWorld = new RacePhysicsWorld();
    this.physicsWorld.buildTrack(this.track);
    this.playerVehicle = this.physicsWorld.addVehicle(start.position.x, start.position.z, heading);
    this.playerVehicle.setGrip(this.weather.grip);

    this.lapSystem = new LapSystem(this.track, TOTAL_LAPS);
    this.lapSystem.reset();
    this.aiOpponents.setup(this.track, this.physicsWorld, this.weather.grip);
    this.weatherSystem.apply(this.weather);
    this.hud.setTrack(this.track);
    this.physicsWorld.settleAll(120);
    this.syncCarVisual(0);
    this.resetRaceState();
    this.finishHold = 0;
    this.racePosition = 1;
  }

  private startRace(seed?: number): void {
    const nextSeed = seed ?? randomRaceSeed(this.track.seed);
    if (this.trackView) {
      this.scene.remove(this.trackView.root);
      this.trackView.dispose();
    }
    if (this.sceneEnvironment) {
      this.scene.remove(this.sceneEnvironment.root);
      this.sceneEnvironment.dispose();
    }
    this.bootstrapRace(nextSeed);
    this.scene.add(this.sceneEnvironment.root);
    this.scene.add(this.trackView.root);
    this.raceCamera.snapTo(this.raceCar.position, this.getHeading(), this.chassisQuat);
    this.message = `${this.track.name} · ${this.weather.label}`;
  }

  private resetRaceState(): void {
    this.phase = 'ready';
    this.countdown = COUNTDOWN_SECONDS;
    this.lapTime = 0;
    this.raceTime = 0;
    this.bestLap = null;
    this.lapStart = 0;
    this.lastCompletedLap = 0;
    this.message = `${this.track.name} · ${this.weather.label}`;
    const start = this.track.samples[0];
    const heading = Math.atan2(start.tangent.x, start.tangent.z);
    this.playerVehicle.reset(start.position.x, start.position.z, heading);
    this.lapSystem.reset();
    this.applyCameraMode();
  }

  private beginCountdown(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'countdown';
    this.countdown = COUNTDOWN_SECONDS;
    this.message = '准备发车…';
  }

  private applyCameraMode(): void {
    const cockpit = this.raceCamera.getMode() === 'cockpit';
    this.cockpit.setVisible(cockpit);
    this.raceCar.setExteriorVisible(!cockpit);
  }

  private buildDriveInput(move: THREE.Vector2, allowDrive: boolean): {
    steer: number;
    throttle: number;
    brake: number;
    boost: boolean;
    handbrake: boolean;
  } {
    if (!allowDrive) {
      return { steer: 0, throttle: 0, brake: 0.4, boost: false, handbrake: false };
    }
    const forward = Math.max(0, -move.y);
    const reverseOrBrake = Math.max(0, move.y);
    return {
      steer: move.x,
      throttle: forward,
      brake: reverseOrBrake,
      boost: this.input.isDashHeld(),
      handbrake: this.input.isHandbrakeHeld(),
    };
  }

  private simulatePhysics(delta: number, racing: boolean): CarPhysicsState {
    this.aiOpponents.driveAll(delta, racing);
    this.physicsWorld.simulate(delta);
    if (racing) {
      this.aiOpponents.finalizeLaps();
    }
    return this.playerVehicle.getState();
  }

  private update(delta: number, elapsed: number): void {
    this.elapsed = elapsed;
    this.frame += 1;
    resizeRenderer(this.renderer, this.camera, 1.75);
    this.handleInput();

    if (this.phase === 'ready') {
      const move = this.input.readMovement(this.movement);
      this.steerInput = move.x;
      this.playerVehicle.drive(delta, this.buildDriveInput(move, false));
      this.simulatePhysics(delta, false);
      this.syncCarVisual(0);
    }

    if (this.phase === 'countdown') {
      this.countdown -= delta;
      const move = this.input.readMovement(this.movement);
      this.steerInput = move.x;
      this.playerVehicle.drive(delta, this.buildDriveInput(move, false));
      this.simulatePhysics(delta, false);
      this.syncCarVisual(0);
      if (this.countdown <= 0) {
        this.phase = 'race';
        this.lapStart = elapsed;
        this.message = 'GO!';
        this.audio.startEngine();
      }
    }

    if (this.phase === 'race' || this.phase === 'finished') {
      const move = this.input.readMovement(this.movement);
      this.steerInput = move.x;
      this.playerVehicle.drive(delta, this.buildDriveInput(move, this.phase === 'race'));
      const physics = this.simulatePhysics(delta, this.phase === 'race');

      if (this.phase === 'race') {
        this.racePosition = this.computeRacePosition();
      }

      this.chassisPos.set(physics.position.x, physics.position.y, physics.position.z);
      this.chassisQuat.set(
        this.playerVehicle.chassisBody.quaternion.x,
        this.playerVehicle.chassisBody.quaternion.y,
        this.playerVehicle.chassisBody.quaternion.z,
        this.playerVehicle.chassisBody.quaternion.w,
      );
      this.velocity.set(physics.velocity.x, physics.velocity.y, physics.velocity.z);

      this.raceCar.syncFromPhysics(
        this.chassisPos,
        this.chassisQuat,
        this.playerVehicle.getWheelInfos(),
        this.steerInput,
        physics.speed,
        physics.driftAmount,
        delta,
      );

      this.driftVfx.update(
        delta,
        this.raceCar.position,
        this.getHeading(),
        physics.driftAmount,
        physics.speed,
        this.playerVehicle.getWheelInfos(),
      );

      if (physics.hitWall) {
        this.raceCar.flashWallHit();
      }

      if (this.phase === 'race') {
        this.raceTime += delta;
        this.lapTime = elapsed - this.lapStart;
        const lap = this.lapSystem.update(physics.position.x, physics.position.z, physics.speed);
        this.driveSnapshot = { ...lap, onTrack: physics.onTrack };

        if (this.driveSnapshot.lap > this.lastCompletedLap && this.driveSnapshot.lap < TOTAL_LAPS) {
          if (this.lapTime > 1 && (!this.bestLap || this.lapTime < this.bestLap)) {
            this.bestLap = this.lapTime;
          }
          this.lastCompletedLap = this.driveSnapshot.lap;
          this.lapStart = elapsed;
          this.lapTime = 0;
          this.message = `第 ${this.driveSnapshot.lap + 1} 圈`;
        }

        if (this.driveSnapshot.finished) {
          this.phase = 'finished';
          if (!this.bestLap || this.lapTime < this.bestLap) {
            this.bestLap = this.lapTime;
          }
          this.meta.runs += 1;
          if (!this.meta.bestTime || this.raceTime < this.meta.bestTime) {
            this.meta.bestTime = this.raceTime;
          }
          this.saveMeta();
          this.message = `完赛！P${this.racePosition} · 总用时 ${this.formatTime(this.raceTime)}`;
          this.finishHold = AUTO_RESTART_DELAY;
        }
      }

      if (this.phase === 'finished' && this.finishHold > 0) {
        this.finishHold -= delta;
        if (this.finishHold <= 0) {
          this.startRace();
        }
      }
    }

    const focus = this.raceCar.position;
    this.carLight.position.set(focus.x, focus.y + 1.8, focus.z);
    this.cockpit.update(this.steerInput, delta);
    this.weatherSystem.update(delta, focus);
    this.renderer.toneMappingExposure = this.weatherSystem.getExposure();
    this.raceCamera.update(
      delta,
      focus,
      this.getHeading(),
      this.velocity,
      this.driveSnapshot.speed,
      this.chassisQuat,
    );
    if (this.raceCamera.getMode() === 'cockpit') {
      this.cockpit.renderMirrors(this.renderer, this.scene, focus, this.chassisQuat);
    }
    this.audio.updateEngine(this.driveSnapshot.speed, this.input.readMovement(this.movement).y < 0);
    this.updateHud();
    this.publishDiagnostics();
  }

  private syncCarVisual(drift: number): void {
    this.chassisPos.set(
      this.playerVehicle.chassisBody.position.x,
      this.playerVehicle.chassisBody.position.y,
      this.playerVehicle.chassisBody.position.z,
    );
    this.chassisQuat.set(
      this.playerVehicle.chassisBody.quaternion.x,
      this.playerVehicle.chassisBody.quaternion.y,
      this.playerVehicle.chassisBody.quaternion.z,
      this.playerVehicle.chassisBody.quaternion.w,
    );
    this.raceCar.syncFromPhysics(
      this.chassisPos,
      this.chassisQuat,
      this.playerVehicle.getWheelInfos(),
      this.steerInput,
      0,
      drift,
      0.016,
    );
  }

  private getHeading(): number {
    const q = this.playerVehicle.chassisBody.quaternion;
    return Math.atan2(
      2 * (q.w * q.y + q.x * q.z),
      1 - 2 * (q.y ** 2 + q.z ** 2),
    );
  }

  private handleInput(): void {
    if (this.input.consumeMute()) {
      this.muted = this.audio.toggleMuted();
      this.message = this.muted ? '静音' : '音效开启';
    }

    if (this.input.consumePause()) {
      if (this.phase === 'race') {
        this.phase = 'paused';
        this.message = '暂停';
      } else if (this.phase === 'paused') {
        this.phase = 'race';
        this.message = '继续比赛';
      }
    }

    if (this.input.consumeRestart()) {
      this.startRace();
      return;
    }

    if (this.input.consumeCameraToggle()) {
      this.raceCamera.toggleMode();
      this.applyCameraMode();
      this.message = this.raceCamera.getMode() === 'cockpit' ? '车内视角' : '追背视角';
    }

    if (this.phase === 'ready' && this.input.consumeRush()) {
      this.beginCountdown();
      return;
    }

    if (this.phase === 'countdown' && this.input.consumeRush()) {
      this.countdown = Math.min(this.countdown, 0.2);
    }
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private updateHud(): void {
    this.hud.setMuted(this.muted);
    this.hud.render({
      phase: this.phase,
      trackName: this.track.name,
      layout: this.track.layout,
      weather: this.weather,
      drive: this.driveSnapshot,
      lapTime: this.lapTime,
      bestLap: this.bestLap,
      totalLaps: TOTAL_LAPS,
      message: this.message,
      runs: this.meta.runs,
      personalBest: this.meta.bestTime,
      countdown: this.countdown,
      carX: this.raceCar.position.x,
      carZ: this.raceCar.position.z,
      heading: this.getHeading(),
      racePosition: this.racePosition,
      totalRacers: 1 + this.aiOpponents.getSnapshots().length,
      cameraMode: this.raceCamera.getMode(),
      opponents: this.aiOpponents.getSnapshots().map((ai) => ({
        x: ai.position.x,
        z: ai.position.z,
        heading: ai.heading,
        color: ai.color,
      })),
    });
  }

  private computeRacePosition(): number {
    const playerDistance = this.driveSnapshot.lap + this.driveSnapshot.lapProgress;
    let ahead = 0;
    for (const ai of this.aiOpponents.getSnapshots()) {
      const aiDistance = this.lapDistance(ai.progress);
      if (aiDistance > playerDistance + 0.002) ahead += 1;
    }
    return ahead + 1;
  }

  /** Convert normalized race progress back to lap + lapProgress distance. */
  private lapDistance(progress: number): number {
    return progress * TOTAL_LAPS;
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds - mins * 60;
    return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
  }

  private loadMeta(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      this.meta = JSON.parse(raw) as RacingMeta;
    } catch {
      this.meta = { runs: 0, bestTime: null };
    }
  }

  private saveMeta(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.meta));
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    const pos = this.raceCar.position;

    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      phase: this.phase,
      score: Math.floor(this.raceTime * 100),
      lap: this.driveSnapshot.lap + 1,
      totalLaps: TOTAL_LAPS,
      speed: this.driveSnapshot.speed,
      grip: this.weather.grip,
      onTrack: this.driveSnapshot.onTrack,
      player: {
        position: { x: pos.x, y: pos.y, z: pos.z },
        heading: this.getHeading(),
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: this.renderer.getPixelRatio(),
      },
      trackSeed: this.track.seed,
      trackLayout: this.track.layout,
      cameraMode: this.raceCamera.getMode(),
      isDaily: new URLSearchParams(window.location.search).has('daily'),
    };
  }
}
