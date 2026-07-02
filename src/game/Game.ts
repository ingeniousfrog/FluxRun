import * as THREE from 'three';
import { MaterialLibrary } from '../assets/MaterialLibrary';
import { createWorldKit, type EnemyKind } from '../assets/modelFactories';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { createEnemy, createProjectile, type Enemy, type Projectile } from '../entities/combat';
import { HoverTank } from '../entities/HoverTank';
import { AudioSystem } from '../systems/AudioSystem';
import { BoardView } from '../systems/BoardView';
import { CameraRig } from '../systems/CameraRig';
import { DebugTools, type DebugTuning } from '../systems/DebugTools';
import { Hud } from '../systems/Hud';
import { VfxSystem } from '../systems/VfxSystem';
import {
  BUILD_REPEAT_SECONDS,
  RUSH_MIN_ROUTE,
} from './constants';
import {
  boardToWorld,
  canPlacePiece,
  clampCursor,
  createInitialBoard,
  createPiece,
  findEnergyRoute,
  getCell,
  placePiece,
  resolveMatches,
  rotatePiece,
} from './pipes';
import type { Board, BoardPoint, Phase, Piece, Relic, RouteStats } from './types';

type PhaseBeforePause = Exclude<Phase, 'paused'>;

const RELICS: ReadonlyArray<Relic> = [
  { id: 'capacitor-coil', name: 'Capacitor Coil', short: '+chain on boosters', value: 1 },
  { id: 'glass-vane', name: 'Glass Vane', short: 'reflectors flip shots', value: 2 },
  { id: 'rgb-loop', name: 'RGB Loop', short: '3 colors raise score', value: 3 },
];

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 90);
  private readonly materials = new MaterialLibrary();
  private readonly boardView = new BoardView(this.materials);
  private readonly tank = new HoverTank(this.materials);
  private readonly vfx = new VfxSystem();
  private readonly input: InputController;
  private readonly audio = new AudioSystem();
  private readonly hud = new Hud();
  private readonly cameraRig = new CameraRig(this.camera, new THREE.Vector3(0, 8.4, 8.8));
  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );

  private readonly tuning: DebugTuning = {
    rushSpeed: 2.55,
    boostMultiplier: 1.62,
    strafeSpeed: 2.6,
    fireRate: 5.2,
    cameraLag: 0.13,
    exposure: 1.12,
    maxDpr: 1.75,
  };

  private readonly debugTools: DebugTools;
  private readonly routeScratch = new THREE.Vector3();
  private readonly lateralScratch = new THREE.Vector3();
  private readonly forwardScratch = new THREE.Vector3();
  private readonly movement = new THREE.Vector2();

  private board: Board = createInitialBoard();
  private activePiece: Piece = createPiece(0);
  private pieceSequence = 1;
  private cursor: BoardPoint = { x: 7, y: 4 };
  private route: RouteStats = findEnergyRoute(this.board);
  private phase: Phase = 'build';
  private phaseBeforePause: PhaseBeforePause = 'build';

  private routePoints: THREE.Vector3[] = [];
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private frame = 0;
  private elapsed = 0;
  private buildRepeat = 0;
  private rushProgress = 0;
  private lateralOffset = 0;
  private health = 4;
  private score = 0;
  private chain = 0;
  private wave = 1;
  private shotTimer = 0;
  private damagePulse = 0;
  private lastRouteCell = -1;
  private message = 'BUILD CIRCUIT';
  private muted = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = this.tuning.exposure;

    const stick = this.getElement('#touch-stick');
    const knob = this.getElement('#touch-knob');
    const boostButton = this.getElement('#boost-button');
    const actionButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-action]'));
    this.input = new InputController(stick, knob, boostButton, actionButtons);

    this.debugTools = new DebugTools(this.tuning, () => {
      this.renderer.toneMappingExposure = this.tuning.exposure;
      resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    });

    this.createScene();
    this.refreshBoardView();
    this.cameraRig.snapTo(new THREE.Vector3(0, 0, 0.8));
    this.syncTankToRoute(0);
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.debugTools.dispose();
    this.boardView.dispose();
    this.vfx.dispose();
    this.materials.dispose();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
  }

  private update(delta: number, elapsed: number): void {
    this.frame += 1;
    this.elapsed = elapsed;
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.handleGlobalInput();

    if (this.phase === 'paused') {
      this.updateHud();
      this.publishDiagnostics();
      return;
    }

    if (this.phase === 'build') this.updateBuild(delta);
    if (this.phase === 'rush') this.updateRush(delta);
    if (this.phase === 'failed' || this.phase === 'cleared') this.updateEndState(delta);

    this.vfx.update(delta);
    this.damagePulse = Math.max(0, this.damagePulse - delta * 2.8);
    this.updateHud();
    this.publishDiagnostics();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private createScene(): void {
    this.scene.background = new THREE.Color('#080d12');
    this.scene.fog = new THREE.Fog('#080d12', 17, 46);

    const ambient = new THREE.HemisphereLight('#c7f8ff', '#14202a', 1.7);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight('#fff1d2', 2.4);
    key.position.set(-4, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 28;
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight('#73f6ff', 1.1);
    rim.position.set(5, 4, -5);
    this.scene.add(rim);

    this.scene.add(createWorldKit(this.materials));
    this.scene.add(this.boardView.group);
    this.scene.add(this.tank.group);
    this.scene.add(this.vfx.group);
  }

  private handleGlobalInput(): void {
    if (this.input.consumeMute()) {
      this.muted = this.audio.toggleMuted();
      this.message = this.muted ? 'AUDIO MUTED' : 'AUDIO ONLINE';
    }

    if (this.input.consumePause()) {
      if (this.phase === 'paused') {
        this.phase = this.phaseBeforePause;
        if (this.phase === 'rush') this.audio.startAmbience();
        this.message = this.phase === 'rush' ? 'RUSH RESUMED' : 'BUILD RESUMED';
      } else {
        this.phaseBeforePause = this.phase as PhaseBeforePause;
        this.phase = 'paused';
        this.audio.stopAmbience();
        this.message = 'GRID PAUSED';
      }
    }

    if (this.input.consumeRestart()) {
      this.resetToBuild();
    }
  }

  private updateBuild(delta: number): void {
    this.buildRepeat = Math.max(0, this.buildRepeat - delta);
    const move = this.input.consumeBuildMove();
    const stick = this.input.readMovement(this.movement);
    const stickMove = this.buildRepeat <= 0 && stick.lengthSq() > 0.45
      ? new THREE.Vector2(Math.round(stick.x), Math.round(stick.y))
      : new THREE.Vector2();
    const buildMove = move.lengthSq() ? move : stickMove;

    if (buildMove.lengthSq()) {
      this.cursor = clampCursor({ x: this.cursor.x + buildMove.x, y: this.cursor.y + buildMove.y });
      this.buildRepeat = BUILD_REPEAT_SECONDS;
      this.refreshBoardView();
    }

    if (this.input.consumeRotateClockwise()) {
      this.activePiece = rotatePiece(this.activePiece, true);
      this.audio.rotate();
      this.hud.flashStatus('place');
      this.refreshBoardView();
    }

    if (this.input.consumeRotateCounterClockwise()) {
      this.activePiece = rotatePiece(this.activePiece, false);
      this.audio.rotate();
      this.hud.flashStatus('place');
      this.refreshBoardView();
    }

    if (this.input.consumePlace()) {
      this.placeActivePiece();
    }

    if (this.input.consumeRush()) {
      this.tryStartRush();
    }

    this.cameraRig.update(delta, new THREE.Vector3(0, 0, 0.8), this.tuning.cameraLag * 2);
  }

  private placeActivePiece(): void {
    if (!canPlacePiece(this.board, this.activePiece, this.cursor)) {
      this.message = 'CELL BLOCKED';
      this.hud.flashStatus('hit');
      this.audio.hit();
      return;
    }

    const placement = placePiece(this.board, this.activePiece, this.cursor);
    const matchResult = resolveMatches(placement.board);
    this.board = matchResult.board;
    this.activePiece = createPiece(this.pieceSequence);
    this.pieceSequence += 1;
    this.route = findEnergyRoute(this.board);
    this.message = matchResult.upgraded ? `FUSION x${matchResult.upgraded}` : 'MODULE LOCKED';
    this.audio.place();
    if (matchResult.upgraded) this.audio.combo(matchResult.upgraded);
    for (const placed of placement.placed) {
      this.vfx.spawnRing(boardToWorld(placed, 0.36), '#42d9ff');
    }
    this.refreshBoardView();
    this.hud.flashStatus(matchResult.upgraded ? 'combo' : 'place');
  }

  private tryStartRush(): void {
    this.route = findEnergyRoute(this.board);
    if (this.route.route.length < RUSH_MIN_ROUTE) {
      this.message = 'ROUTE TOO SHORT';
      this.hud.flashStatus('hit');
      this.audio.hit();
      return;
    }

    this.phase = 'rush';
    this.health = 4;
    this.score = 0;
    this.chain = Math.max(0, this.route.colors - 1);
    this.rushProgress = 0;
    this.lateralOffset = 0;
    this.shotTimer = 0.18;
    this.lastRouteCell = -1;
    this.routePoints = this.route.route.map((point) => boardToWorld(point, 0.16));
    this.message = 'FLUX RUN';
    this.clearCombat();
    this.spawnWave();
    this.audio.rush();
    this.hud.flashStatus('rush');
    this.refreshBoardView();
    this.syncTankToRoute(0);
  }

  private updateRush(delta: number): void {
    if (this.routePoints.length < 2) {
      this.phase = 'failed';
      this.message = 'ROUTE COLLAPSED';
      return;
    }

    const boosted = this.input.isDashHeld();
    const speed = this.tuning.rushSpeed * (boosted ? this.tuning.boostMultiplier : 1);
    this.rushProgress = Math.min(this.routePoints.length - 1.001, this.rushProgress + delta * speed);
    this.syncTankToRoute(delta);
    this.handleRouteCell();
    this.updateProjectiles(delta);
    this.updateEnemies(delta);
    this.updatePlayerFire(delta, boosted);
    this.cameraRig.update(delta, this.tank.position, this.tuning.cameraLag);

    if (this.health <= 0) {
      this.failRun();
      return;
    }
    if (this.rushProgress >= this.routePoints.length - 1.02) this.clearRun();
  }

  private syncTankToRoute(delta: number): void {
    const index = Math.min(Math.floor(this.rushProgress), Math.max(0, this.routePoints.length - 2));
    const nextIndex = Math.min(index + 1, this.routePoints.length - 1);
    const segmentT = THREE.MathUtils.clamp(this.rushProgress - index, 0, 1);
    const start = this.routePoints[index] ?? boardToWorld(this.route.route[0] ?? { x: 0, y: 0 }, 0.16);
    const end = this.routePoints[nextIndex] ?? start;
    this.routeScratch.copy(start).lerp(end, segmentT);
    this.forwardScratch.copy(end).sub(start);
    if (this.forwardScratch.lengthSq() < 0.001) this.forwardScratch.set(0, 0, -1);
    this.forwardScratch.normalize();

    if (this.phase === 'rush') {
      this.input.readMovement(this.movement);
      const targetOffset = THREE.MathUtils.clamp(this.movement.x * 0.56, -0.56, 0.56);
      this.lateralOffset = THREE.MathUtils.damp(this.lateralOffset, targetOffset, this.tuning.strafeSpeed, delta);
    }

    this.lateralScratch.set(-this.forwardScratch.z, 0, this.forwardScratch.x).multiplyScalar(this.lateralOffset);
    this.routeScratch.add(this.lateralScratch);
    this.tank.sync(this.routeScratch, this.forwardScratch, this.input.isDashHeld(), this.damagePulse);
  }

  private handleRouteCell(): void {
    const routeIndex = Math.min(Math.floor(this.rushProgress), this.route.route.length - 1);
    if (routeIndex === this.lastRouteCell) return;
    this.lastRouteCell = routeIndex;

    const point = this.route.route[routeIndex];
    const cell = point ? getCell(this.board, point.x, point.y) : null;
    if (!cell) return;

    if (cell.kind === 'booster') {
      this.chain += 1 + RELICS[0].value;
      this.score += Math.round(12 * this.route.multiplier);
      this.message = 'BOOSTER CHAIN';
      this.audio.combo(this.chain);
      this.vfx.spawnRing(boardToWorld(point, 0.42), '#ffbd4a');
      this.hud.flashStatus('combo');
    }

    if (cell.kind === 'reflector') {
      const reflected = this.reflectEnemyProjectiles();
      this.chain += reflected ? RELICS[1].value : 1;
      this.message = reflected ? `REFLECT x${reflected}` : 'REFLECTOR ARMED';
      this.audio.combo(this.chain);
      this.vfx.spawnRing(boardToWorld(point, 0.42), '#ff5fb1');
      this.hud.flashStatus('combo');
    }
  }

  private updatePlayerFire(delta: number, boosted: boolean): void {
    while (this.input.consumePlace()) {
      // Space doubles as build-place and rush-boost. Drain queued build actions during combat.
    }

    this.shotTimer -= delta * (boosted ? 1.4 : 1);
    if (this.shotTimer > 0) return;
    this.shotTimer = 1 / this.tuning.fireRate;

    const damage = this.route.colors >= 3 ? 2 : 1;
    const position = this.tank.position.clone().addScaledVector(this.forwardScratch, 0.62);
    position.y += 0.28;
    const velocity = this.forwardScratch.clone().multiplyScalar(8.8 + this.chain * 0.08);
    const projectile = createProjectile(`p-${this.frame}-${this.projectiles.length}`, 'player', position, velocity, this.materials, damage);
    this.projectiles.push(projectile);
    this.scene.add(projectile.mesh);
    this.audio.shot();
  }

  private updateProjectiles(delta: number): void {
    const nextProjectiles: Projectile[] = [];

    for (const projectile of this.projectiles) {
      projectile.life -= delta;
      projectile.position.addScaledVector(projectile.velocity, delta);
      projectile.mesh.position.copy(projectile.position);

      if (projectile.owner === 'player') {
        const hitEnemy = this.enemies.find((enemy) => enemy.alive && enemy.position.distanceTo(projectile.position) < enemy.radius + projectile.radius);
        if (hitEnemy) {
          hitEnemy.hp -= projectile.damage;
          projectile.life = 0;
          this.vfx.spawnBurst(projectile.position, '#b8fff1', 7);
          this.audio.hit();
          if (hitEnemy.hp <= 0) this.destroyEnemy(hitEnemy);
        }
      } else if (this.tank.position.distanceTo(projectile.position) < 0.42 + projectile.radius && this.damagePulse <= 0) {
        projectile.life = 0;
        this.health -= 1;
        this.damagePulse = 1;
        this.message = 'HULL HIT';
        this.vfx.spawnBurst(this.tank.position, '#ff5e7b', 12);
        this.hud.flashStatus('hit');
        this.audio.hit();
      }

      if (projectile.life > 0) {
        nextProjectiles.push(projectile);
      } else {
        this.scene.remove(projectile.mesh);
      }
    }

    this.projectiles = nextProjectiles;
  }

  private updateEnemies(delta: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.fireTimer -= delta;
      enemy.group.position.y = Math.sin(this.elapsed * 3.2 + enemy.position.x) * 0.06;
      enemy.group.lookAt(this.tank.position.x, enemy.group.position.y, this.tank.position.z);

      if (enemy.fireTimer <= 0) {
        enemy.fireTimer = enemy.kind === 'turret' ? 1.2 : enemy.kind === 'drone' ? 1.55 : 2.2;
        const origin = enemy.position.clone();
        origin.y += 0.62;
        const velocity = this.tank.position.clone().sub(enemy.position).normalize().multiplyScalar(enemy.kind === 'drone' ? 2.8 : 2.25);
        const projectile = createProjectile(`e-${this.frame}-${this.projectiles.length}`, 'enemy', origin, velocity, this.materials);
        this.projectiles.push(projectile);
        this.scene.add(projectile.mesh);
      }
    }
  }

  private reflectEnemyProjectiles(): number {
    let reflected = 0;
    const nextProjectiles: Projectile[] = [];
    const reflectedProjectiles: Projectile[] = [];
    for (const projectile of this.projectiles) {
      if (projectile.owner === 'enemy' && projectile.position.distanceTo(this.tank.position) < 2.35) {
        this.scene.remove(projectile.mesh);
        const reflectedShot = createProjectile(
          `r-${this.frame}-${reflected}`,
          'player',
          projectile.position,
          this.forwardScratch.clone().multiplyScalar(9.4),
          this.materials,
          2,
        );
        reflectedProjectiles.push(reflectedShot);
        this.scene.add(reflectedShot.mesh);
        reflected += 1;
      } else {
        nextProjectiles.push(projectile);
      }
    }
    this.projectiles = [...nextProjectiles, ...reflectedProjectiles];
    return reflected;
  }

  private destroyEnemy(enemy: Enemy): void {
    enemy.alive = false;
    this.scene.remove(enemy.group);
    const colorBonus = this.route.colors >= 3 ? RELICS[2].value * 15 : 0;
    this.chain += 1;
    this.score += Math.round((enemy.score + colorBonus) * this.route.multiplier * (1 + this.chain * 0.05));
    this.message = `CHAIN ${this.chain}`;
    this.vfx.spawnBurst(enemy.position, '#ffbd4a', 16);
    this.hud.flashStatus('combo');
    this.audio.combo(this.chain);
  }

  private updateEndState(delta: number): void {
    this.cameraRig.update(delta, this.tank.position, this.tuning.cameraLag * 1.4);
    if (this.input.consumeRush()) {
      this.resetToBuild();
    }
  }

  private failRun(): void {
    this.phase = 'failed';
    this.message = 'RUN BROKEN';
    this.audio.fail();
  }

  private clearRun(): void {
    this.phase = 'cleared';
    this.wave += 1;
    this.message = this.route.complete ? 'GRID LOOP CLOSED' : 'SEGMENT CLEARED';
    this.score += Math.round(this.route.energy * this.route.multiplier + this.health * 75 + this.chain * 22);
    this.audio.cleared();
    this.vfx.spawnRing(this.tank.position, '#9cf15f');
  }

  private resetToBuild(): void {
    this.phase = 'build';
    this.health = 4;
    this.score = 0;
    this.chain = 0;
    this.rushProgress = 0;
    this.lateralOffset = 0;
    this.lastRouteCell = -1;
    this.message = 'BUILD CIRCUIT';
    this.audio.stopAmbience();
    this.clearCombat();
    this.route = findEnergyRoute(this.board);
    this.routePoints = this.route.route.map((point) => boardToWorld(point, 0.16));
    this.syncTankToRoute(0);
    this.refreshBoardView();
  }

  private spawnWave(): void {
    const route = this.route.route;
    const kinds: ReadonlyArray<EnemyKind> = ['drone', 'turret', 'mine'];
    const spawnIndexes = route
      .map((point, index) => ({ point, index }))
      .filter(({ index }) => index >= 2 && index % 2 === 0)
      .slice(0, 7 + Math.min(3, this.wave));

    for (const { point, index } of spawnIndexes) {
      const base = boardToWorld(point, 0.08);
      const previous = boardToWorld(route[Math.max(0, index - 1)] ?? point, 0.08);
      const next = boardToWorld(route[Math.min(route.length - 1, index + 1)] ?? point, 0.08);
      const tangent = next.sub(previous).normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(index % 4 < 2 ? 0.92 : -0.92);
      const position = base.add(side);
      const enemy = createEnemy(`enemy-${this.wave}-${index}`, kinds[index % kinds.length], position, this.materials);
      this.enemies.push(enemy);
      this.scene.add(enemy.group);
    }
  }

  private clearCombat(): void {
    for (const enemy of this.enemies) this.scene.remove(enemy.group);
    for (const projectile of this.projectiles) this.scene.remove(projectile.mesh);
    this.enemies = [];
    this.projectiles = [];
  }

  private refreshBoardView(): void {
    this.route = findEnergyRoute(this.board);
    this.boardView.sync(this.board, this.activePiece, this.cursor, this.route.route, this.phase);
    this.updateHud();
  }

  private updateHud(): void {
    const phaseMessage: Record<Phase, string> = {
      build: this.message,
      rush: this.message,
      paused: 'PAUSED',
      failed: 'FAILED / RETRY',
      cleared: 'CLEARED / CONTINUE',
    };

    this.hud.update({
      phase: this.phase,
      route: this.route,
      score: this.score,
      chain: this.chain,
      health: this.health,
      wave: this.wave,
      pieceName: canPlacePiece(this.board, this.activePiece, this.cursor)
        ? this.activePiece.name
        : `${this.activePiece.name} BLOCKED`,
      relics: RELICS,
      message: phaseMessage[this.phase],
      muted: this.muted,
    });
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      phase: this.phase,
      score: this.score,
      routeLength: this.route.route.length,
      routeEnergy: this.route.energy,
      multiplier: this.route.multiplier,
      health: this.health,
      enemies: this.enemies.filter((enemy) => enemy.alive).length,
      projectiles: this.projectiles.length,
      board: {
        occupied: this.board.cells.filter(Boolean).length,
        cols: this.board.cols,
        rows: this.board.rows,
      },
      player: {
        position: {
          x: this.tank.position.x,
          y: this.tank.position.y,
          z: this.tank.position.z,
        },
        speed: this.phase === 'rush' ? this.tuning.rushSpeed : 0,
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
        dpr: Math.min(window.devicePixelRatio || 1, this.tuning.maxDpr),
      },
    };
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }
}
