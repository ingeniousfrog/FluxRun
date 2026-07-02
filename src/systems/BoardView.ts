import * as THREE from 'three';
import type { MaterialLibrary } from '../assets/MaterialLibrary';
import { BOARD_COLS, BOARD_ROWS, CELL_SIZE } from '../game/constants';
import {
  boardToWorld,
  canPlacePiece,
  connectorsFor,
  getCell,
  getPieceCells,
  replacePiece,
} from '../game/pipes';
import type { Board, BoardPoint, Direction, Piece, PipeCell } from '../game/types';

export class BoardView {
  readonly group = new THREE.Group();

  private readonly cellBase = new THREE.BoxGeometry(CELL_SIZE * 0.92, 0.1, CELL_SIZE * 0.92);
  private readonly connectorHorizontal = new THREE.BoxGeometry(CELL_SIZE * 0.54, 0.16, CELL_SIZE * 0.16);
  private readonly connectorVertical = new THREE.BoxGeometry(CELL_SIZE * 0.16, 0.16, CELL_SIZE * 0.54);
  private readonly hub = new THREE.CylinderGeometry(CELL_SIZE * 0.21, CELL_SIZE * 0.25, 0.18, 18);
  private readonly boost = new THREE.ConeGeometry(CELL_SIZE * 0.18, 0.28, 16);
  private readonly reflector = new THREE.TorusGeometry(CELL_SIZE * 0.2, 0.035, 6, 18, Math.PI * 1.35);
  private readonly reservoir = new THREE.CylinderGeometry(CELL_SIZE * 0.3, CELL_SIZE * 0.34, 0.24, 20);
  private readonly arrow = new THREE.ConeGeometry(CELL_SIZE * 0.14, 0.32, 3);
  private readonly levelRing = new THREE.TorusGeometry(CELL_SIZE * 0.28, 0.018, 5, 24);
  private readonly routePlate = new THREE.PlaneGeometry(CELL_SIZE * 0.78, CELL_SIZE * 0.78);
  private readonly gridLineHorizontal = new THREE.BoxGeometry(CELL_SIZE * BOARD_COLS, 0.012, 0.012);
  private readonly gridLineVertical = new THREE.BoxGeometry(0.012, 0.012, CELL_SIZE * BOARD_ROWS);

  constructor(private readonly materials: MaterialLibrary) {
    this.group.name = 'boardView';
  }

  sync(
    board: Board,
    activePiece: Piece,
    cursor: BoardPoint,
    route: ReadonlyArray<BoardPoint>,
    previewRoute: ReadonlyArray<BoardPoint>,
    phase: string,
  ): void {
    this.group.clear();
    this.group.add(this.createGround());
    this.group.add(this.createGrid());
    this.group.add(this.createRouteLayer(previewRoute, false));
    this.group.add(this.createRouteLayer(route, true));

    for (let y = 0; y < board.rows; y += 1) {
      for (let x = 0; x < board.cols; x += 1) {
        const cell = getCell(board, x, y);
        if (cell) this.group.add(this.createPipeCell({ x, y }, cell, route.some((point) => point.x === x && point.y === y)));
      }
    }

    if (phase === 'build' || phase === 'flow') {
      this.group.add(this.createGhost(board, activePiece, cursor));
    }
  }

  dispose(): void {
    this.cellBase.dispose();
    this.connectorHorizontal.dispose();
    this.connectorVertical.dispose();
    this.hub.dispose();
    this.boost.dispose();
    this.reflector.dispose();
    this.reservoir.dispose();
    this.arrow.dispose();
    this.levelRing.dispose();
    this.routePlate.dispose();
    this.gridLineHorizontal.dispose();
    this.gridLineVertical.dispose();
  }

  private createGround(): THREE.Mesh {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_COLS * CELL_SIZE + 0.34, BOARD_ROWS * CELL_SIZE + 0.34),
      this.materials.ground,
    );
    ground.name = 'circuitGround';
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.012;
    ground.receiveShadow = true;
    return ground;
  }

  private createGrid(): THREE.Group {
    const grid = new THREE.Group();
    grid.name = 'boardGridLines';

    for (let row = 0; row <= BOARD_ROWS; row += 1) {
      const mesh = new THREE.Mesh(this.gridLineHorizontal, this.materials.gridLine);
      mesh.position.set(0, 0.018, (row - BOARD_ROWS / 2) * CELL_SIZE);
      grid.add(mesh);
    }

    for (let col = 0; col <= BOARD_COLS; col += 1) {
      const mesh = new THREE.Mesh(this.gridLineVertical, this.materials.gridLine);
      mesh.position.set((col - BOARD_COLS / 2) * CELL_SIZE, 0.019, 0);
      grid.add(mesh);
    }

    return grid;
  }

  private createRouteLayer(route: ReadonlyArray<BoardPoint>, filled: boolean): THREE.Group {
    const layer = new THREE.Group();
    layer.name = filled ? 'filledFlowLayer' : 'previewFlowLayer';

    for (const point of route) {
      const plate = new THREE.Mesh(this.routePlate, filled ? this.materials.route : this.materials.previewRoute);
      const position = boardToWorld(point, 0.024);
      plate.position.copy(position);
      plate.rotation.x = -Math.PI / 2;
      layer.add(plate);
    }

    return layer;
  }

  private createPipeCell(point: BoardPoint, cell: PipeCell, charged: boolean): THREE.Group {
    const group = new THREE.Group();
    const position = boardToWorld(point, 0);
    group.name = `pipe-${point.x}-${point.y}`;
    group.position.copy(position);

    const baseMaterial = cell.kind === 'source'
      ? this.materials.source
      : cell.kind === 'drain'
        ? this.materials.drain
        : this.materials.pipeBase;
    const base = new THREE.Mesh(this.cellBase, baseMaterial);
    base.position.y = 0.06;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    for (const direction of connectorsFor(cell)) {
      group.add(this.createConnector(direction, cell, charged));
    }

    const hub = new THREE.Mesh(this.hub, cell.kind === 'drain' ? this.materials.drain : this.materials.pipe(cell.color));
    hub.position.y = 0.21 + cell.level * 0.018;
    hub.castShadow = true;
    group.add(hub);

    if (cell.kind === 'reservoir') {
      const tank = new THREE.Mesh(this.reservoir, this.materials.pipe('cyan'));
      tank.name = 'reservoirTank';
      tank.position.y = 0.39;
      tank.castShadow = true;
      group.add(tank);
    }

    if (cell.kind === 'oneWay') {
      const arrow = new THREE.Mesh(this.arrow, this.materials.pipe('amber'));
      arrow.name = 'oneWayArrow';
      arrow.position.y = 0.45;
      arrow.rotation.x = Math.PI / 2;
      arrow.rotation.z = cell.rotation * (Math.PI / 2) - Math.PI / 2;
      arrow.castShadow = true;
      group.add(arrow);
    }

    if (cell.kind === 'source') {
      const boost = new THREE.Mesh(this.boost, this.materials.source);
      boost.position.y = 0.42;
      boost.rotation.x = -Math.PI / 2;
      boost.rotation.z = -Math.PI / 2;
      boost.castShadow = true;
      group.add(boost);
    }

    if (cell.kind === 'drain') {
      const reflector = new THREE.Mesh(this.reflector, this.materials.drain);
      reflector.position.y = 0.37;
      reflector.rotation.x = Math.PI / 2;
      group.add(reflector);
    }

    if (cell.level > 1) {
      const levelRing = new THREE.Mesh(this.levelRing, this.materials.pipeTrim);
      levelRing.position.y = 0.33 + cell.level * 0.035;
      levelRing.rotation.x = Math.PI / 2;
      group.add(levelRing);
    }

    return group;
  }

  private createConnector(direction: Direction, cell: PipeCell, charged: boolean): THREE.Mesh {
    const horizontal = direction === 'E' || direction === 'W';
    const connector = new THREE.Mesh(
      horizontal ? this.connectorHorizontal : this.connectorVertical,
      charged ? this.materials.pipe(cell.color) : this.materials.pipeTrim,
    );
    connector.name = `connector-${direction}`;
    connector.position.y = 0.22;

    if (direction === 'E') connector.position.x = CELL_SIZE * 0.24;
    if (direction === 'W') connector.position.x = -CELL_SIZE * 0.24;
    if (direction === 'N') connector.position.z = -CELL_SIZE * 0.24;
    if (direction === 'S') connector.position.z = CELL_SIZE * 0.24;

    connector.castShadow = true;
    return connector;
  }

  private createGhost(board: Board, activePiece: Piece, cursor: BoardPoint): THREE.Group {
    const ghost = new THREE.Group();
    ghost.name = 'activePieceGhost';
    const canPlace = canPlacePiece(board, activePiece, cursor) || replacePiece(board, activePiece, cursor).placed.length > 0;
    const material = canPlace ? this.materials.ghost : this.materials.blockedGhost;

    for (const placed of getPieceCells(activePiece, cursor)) {
      const group = new THREE.Group();
      group.position.copy(boardToWorld(placed, 0.18));
      const plate = new THREE.Mesh(this.cellBase, material);
      plate.position.y = 0.08;
      group.add(plate);
      for (const direction of connectorsFor(placed.cell)) {
        const connector = new THREE.Mesh(
          direction === 'E' || direction === 'W' ? this.connectorHorizontal : this.connectorVertical,
          material,
        );
        connector.position.y = 0.23;
        if (direction === 'E') connector.position.x = CELL_SIZE * 0.24;
        if (direction === 'W') connector.position.x = -CELL_SIZE * 0.24;
        if (direction === 'N') connector.position.z = -CELL_SIZE * 0.24;
        if (direction === 'S') connector.position.z = CELL_SIZE * 0.24;
        group.add(connector);
      }
      ghost.add(group);
    }

    return ghost;
  }
}
