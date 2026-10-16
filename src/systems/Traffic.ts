import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EnvironmentSystem } from './Environment';
import { RoadsSystem } from './Roads';

export type TrafficDensity = 'off' | 'low' | 'medium' | 'high';

export interface RoadGraphNode {
  id: string;
  x: number;
  z: number;
  connections: string[]; // Segment IDs meeting at this node
}

export interface RoadGraphSegment {
  id: string;
  name: string;
  nodeAId: string;
  nodeBId: string;
  width: number;
  speedLimit: number; // m/s
  length: number;
  dirX: number;
  dirZ: number;
  rightX: number;
  rightZ: number;
}

export type VehicleType = 'taxi' | 'car' | 'truck';

interface TrafficVehicle {
  id: number;
  type: VehicleType;
  color: THREE.Color;
  active: boolean;

  // Segment navigation state
  segmentId: string;
  forward: boolean; // true = moving from nodeA to nodeB, false = nodeB to nodeA
  distanceAlongSegment: number;
  speed: number;
  targetSpeed: number;

  // World coordinates & orientation
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;

  // Smooth junction turning state
  isTurning: boolean;
  turnProgress: number; // 0 to 1
  turnDuration: number;
  turnP0: THREE.Vector3;
  turnP1: THREE.Vector3;
  turnP2: THREE.Vector3;
  turnP3: THREE.Vector3;
  turnTargetSegmentId: string;
  turnTargetForward: boolean;

  // Visual wheels & lights
  wheelRotation: number;
}

export class TrafficSystem {
  private scene: THREE.Scene;
  private roads: RoadsSystem;

  // Road Graph
  private nodes: Map<string, RoadGraphNode> = new Map();
  private segments: Map<string, RoadGraphSegment> = new Map();
  private segmentList: RoadGraphSegment[] = [];

  // Vehicle instances and pool
  private vehicles: TrafficVehicle[] = [];
  private nextVehicleId = 1;
  private readonly maxVehiclePool = 65;

  // Instanced Meshes (2 per vehicle type: body + details)
  private taxiBodyInst!: THREE.InstancedMesh;
  private taxiDetailInst!: THREE.InstancedMesh;
  private carBodyInst!: THREE.InstancedMesh;
  private carDetailInst!: THREE.InstancedMesh;
  private truckBodyInst!: THREE.InstancedMesh;
  private truckDetailInst!: THREE.InstancedMesh;

  // Settings & FPS Throttling
  public density: TrafficDensity = 'medium';
  private fpsThrottleOffset = 0;
  private lowFpsAccumulator = 0;
  private goodFpsAccumulator = 0;
  private spawnCooldown = 0;

  // Scratch objects for zero allocations during update loop
  private dummyObj = new THREE.Object3D();
  private scratchVec = new THREE.Vector3();
  private scratchVec2 = new THREE.Vector3();

  // Color palettes
  private static readonly TAXI_YELLOW = new THREE.Color(0xf59e0b);
  private static readonly CAR_COLORS: THREE.Color[] = [
    new THREE.Color(0x2563eb), // Royal Blue
    new THREE.Color(0xdc2626), // Carmine Red
    new THREE.Color(0xe2e8f0), // Pearl Silver
    new THREE.Color(0x334155), // Graphite Dark Slate
    new THREE.Color(0x059669), // Emerald Green
    new THREE.Color(0x475569), // Slate Gray
    new THREE.Color(0x7c3aed), // Deep Violet
    new THREE.Color(0x0891b2), // Cyan Teal
  ];
  private static readonly TRUCK_COLORS: THREE.Color[] = [
    new THREE.Color(0xf1f5f9), // White Cab
    new THREE.Color(0x0284c7), // Sky Blue Cab
    new THREE.Color(0xb91c1c), // Red Transport Cab
    new THREE.Color(0x4d7c0f), // Olive Green Cab
  ];

  constructor(scene: THREE.Scene, roads: RoadsSystem) {
    this.scene = scene;
    this.roads = roads;

    // Load saved traffic density setting
    try {
      const saved = localStorage.getItem('fonima_3d_traffic_density');
      if (
        saved === 'off' ||
        saved === 'low' ||
        saved === 'medium' ||
        saved === 'high'
      ) {
        this.density = saved;
      }
    } catch {
      this.density = 'medium';
    }

    this.buildRoadGraph();
    this.buildVehicleMeshes();
  }

  // Build the complete road network connecting Freetown, Highway, and Bo City
  private buildRoadGraph(): void {
    // Helper to register node
    const addNode = (id: string, x: number, z: number): void => {
      this.nodes.set(id, { id, x, z, connections: [] });
    };

    // Helper to register bidirectional segment
    const addSegment = (
      id: string,
      name: string,
      nodeAId: string,
      nodeBId: string,
      width: number,
      speedLimit: number
    ): void => {
      const nodeA = this.nodes.get(nodeAId);
      const nodeB = this.nodes.get(nodeBId);
      if (!nodeA || !nodeB) return;

      const dx = nodeB.x - nodeA.x;
      const dz = nodeB.z - nodeA.z;
      const length = Math.hypot(dx, dz);
      if (length < 0.5) return;

      const dirX = dx / length;
      const dirZ = dz / length;
      // 2D right-hand normal vector
      const rightX = dirZ;
      const rightZ = -dirX;

      const seg: RoadGraphSegment = {
        id,
        name,
        nodeAId,
        nodeBId,
        width,
        speedLimit,
        length,
        dirX,
        dirZ,
        rightX,
        rightZ,
      };

      this.segments.set(id, seg);
      this.segmentList.push(seg);
      nodeA.connections.push(id);
      nodeB.connections.push(id);
    };

    // 1. FREETOWN / FONIMA NODES
    addNode('ft_williams_w', -90, 0);
    addNode('ft_jct_fonima_williams', -23.5, 0);
    addNode('ft_jct_east_williams', 27.5, 0);
    addNode('ft_williams_e', 95, 0);

    addNode('ft_peninsula_w', -90, -59);
    addNode('ft_jct_fonima_peninsula', -23.5, -59);
    addNode('ft_jct_east_peninsula', 27.5, -59);
    addNode('ft_peninsula_e', 90, -59);

    addNode('ft_fonima_n', -23.5, -80);
    addNode('ft_fonima_s', -23.5, 80);

    addNode('ft_east_fonima_n', 27.5, -80);
    addNode('ft_east_fonima_s', 27.5, 80);

    // FREETOWN ROAD SEGMENTS
    addSegment(
      'seg_williams_w',
      'Williams Street (West)',
      'ft_williams_w',
      'ft_jct_fonima_williams',
      7.4,
      10.0
    );
    addSegment(
      'seg_williams_mid',
      'Williams Street (Mid)',
      'ft_jct_fonima_williams',
      'ft_jct_east_williams',
      7.4,
      11.0
    );
    addSegment(
      'seg_williams_e',
      'Williams Street (East)',
      'ft_jct_east_williams',
      'ft_williams_e',
      7.4,
      12.0
    );

    addSegment(
      'seg_peninsula_w',
      'Peninsula Road (West)',
      'ft_peninsula_w',
      'ft_jct_fonima_peninsula',
      8.6,
      13.0
    );
    addSegment(
      'seg_peninsula_mid',
      'Peninsula Road (Mid)',
      'ft_jct_fonima_peninsula',
      'ft_jct_east_peninsula',
      8.6,
      13.0
    );
    addSegment(
      'seg_peninsula_e',
      'Peninsula Road (East)',
      'ft_jct_east_peninsula',
      'ft_peninsula_e',
      8.6,
      13.0
    );

    addSegment(
      'seg_fonima_n',
      'Fonima Drive (North)',
      'ft_fonima_n',
      'ft_jct_fonima_peninsula',
      6.0,
      9.0
    );
    addSegment(
      'seg_fonima_mid',
      'Fonima Drive (Mid)',
      'ft_jct_fonima_peninsula',
      'ft_jct_fonima_williams',
      6.0,
      9.0
    );
    addSegment(
      'seg_fonima_s',
      'Fonima Drive (South)',
      'ft_jct_fonima_williams',
      'ft_fonima_s',
      6.0,
      9.0
    );

    addSegment(
      'seg_east_fonima_n',
      'East Fonima Street (North)',
      'ft_east_fonima_n',
      'ft_jct_east_peninsula',
      6.0,
      9.0
    );
    addSegment(
      'seg_east_fonima_mid',
      'East Fonima Street (Mid)',
      'ft_jct_east_peninsula',
      'ft_jct_east_williams',
      6.0,
      9.0
    );
    addSegment(
      'seg_east_fonima_s',
      'East Fonima Street (South)',
      'ft_jct_east_williams',
      'ft_east_fonima_s',
      6.0,
      9.0
    );

    // 2. FREETOWN-BO HIGHWAY (Continuous connected curve from X=95 to X=1060)
    const hwySteps = [
      95, 135, 175, 220, 265, 310, 360, 410, 465, 520, 575, 630, 685, 740, 795,
      850, 905, 960, 1010, 1060,
    ];
    for (let i = 0; i < hwySteps.length; i++) {
      const hx = hwySteps[i];
      const hz = EnvironmentSystem.getHighwayCenterZ(hx);
      const nodeId = i === 0 ? 'ft_williams_e' : `hwy_node_${i}`;
      if (i > 0) {
        addNode(nodeId, hx, hz);
      }
    }
    for (let i = 0; i < hwySteps.length - 1; i++) {
      const prevId = i === 0 ? 'ft_williams_e' : `hwy_node_${i}`;
      const nextId =
        i === hwySteps.length - 2 ? 'bo_entrance' : `hwy_node_${i + 1}`;
      if (i === hwySteps.length - 2) {
        addNode('bo_entrance', 1060, 0);
      }
      addSegment(
        `seg_hwy_${i}`,
        `Freetown–Bo Highway Section ${i + 1}`,
        prevId,
        nextId,
        8.6,
        19.0
      );
    }

    // 3. BO CITY NODES & STREETS (X in [1060, 1300])
    addNode('bo_jct_fenton', 1150, 0); // Bo Clocktower roundabout
    addNode('bo_jct_sewa', 1220, 0);
    addNode('bo_east_end', 1300, 0);

    addNode('bo_fenton_n', 1150, -50);
    addNode('bo_fenton_dambala', 1150, -38);
    addNode('bo_fenton_tikonko', 1150, 38);
    addNode('bo_fenton_s', 1150, 50);

    addNode('bo_sewa_n', 1220, -50);
    addNode('bo_sewa_dambala', 1220, -38);
    addNode('bo_sewa_tikonko', 1220, 38);
    addNode('bo_sewa_s', 1220, 50);

    addNode('bo_dambala_w', 1120, -38);
    addNode('bo_dambala_e', 1280, -38);

    addNode('bo_tikonko_w', 1120, 38);
    addNode('bo_tikonko_e', 1280, 38);

    // BO CITY SEGMENTS
    addSegment(
      'seg_bojon_w',
      'Bojon Street (West)',
      'bo_entrance',
      'bo_jct_fenton',
      8.0,
      11.0
    );
    addSegment(
      'seg_bojon_mid',
      'Bojon Street (Clocktower to Market)',
      'bo_jct_fenton',
      'bo_jct_sewa',
      8.0,
      10.0
    );
    addSegment(
      'seg_bojon_e',
      'Bojon Street (East)',
      'bo_jct_sewa',
      'bo_east_end',
      7.4,
      10.0
    );

    addSegment(
      'seg_fenton_n',
      'Fenton Road (North)',
      'bo_fenton_n',
      'bo_fenton_dambala',
      6.0,
      9.0
    );
    addSegment(
      'seg_fenton_mid_n',
      'Fenton Road (Mid North)',
      'bo_fenton_dambala',
      'bo_jct_fenton',
      6.0,
      9.0
    );
    addSegment(
      'seg_fenton_mid_s',
      'Fenton Road (Mid South)',
      'bo_jct_fenton',
      'bo_fenton_tikonko',
      6.0,
      9.0
    );
    addSegment(
      'seg_fenton_s',
      'Fenton Road (South)',
      'bo_fenton_tikonko',
      'bo_fenton_s',
      6.0,
      9.0
    );

    addSegment(
      'seg_sewa_n',
      'Sewa Road (North)',
      'bo_sewa_n',
      'bo_sewa_dambala',
      6.0,
      9.0
    );
    addSegment(
      'seg_sewa_mid_n',
      'Sewa Road (Mid North)',
      'bo_sewa_dambala',
      'bo_jct_sewa',
      6.0,
      9.0
    );
    addSegment(
      'seg_sewa_mid_s',
      'Sewa Road (Mid South)',
      'bo_jct_sewa',
      'bo_sewa_tikonko',
      6.0,
      9.0
    );
    addSegment(
      'seg_sewa_s',
      'Sewa Road (South)',
      'bo_sewa_tikonko',
      'bo_sewa_s',
      6.0,
      9.0
    );

    addSegment(
      'seg_dambala_w',
      'Dambala Road (West)',
      'bo_dambala_w',
      'bo_fenton_dambala',
      6.0,
      9.0
    );
    addSegment(
      'seg_dambala_mid',
      'Dambala Road (Mid)',
      'bo_fenton_dambala',
      'bo_sewa_dambala',
      6.0,
      9.0
    );
    addSegment(
      'seg_dambala_e',
      'Dambala Road (East)',
      'bo_sewa_dambala',
      'bo_dambala_e',
      6.0,
      9.0
    );

    addSegment(
      'seg_tikonko_w',
      'Tikonko Road (West)',
      'bo_tikonko_w',
      'bo_fenton_tikonko',
      6.0,
      9.0
    );
    addSegment(
      'seg_tikonko_mid',
      'Tikonko Road (Mid)',
      'bo_fenton_tikonko',
      'bo_sewa_tikonko',
      6.0,
      9.0
    );
    addSegment(
      'seg_tikonko_e',
      'Tikonko Road (East)',
      'bo_sewa_tikonko',
      'bo_tikonko_e',
      6.0,
      9.0
    );
  }

  // Construct low-poly geometries and InstancedMeshes
  private buildVehicleMeshes(): void {
    // 1. YELLOW TAXI
    // Body: chassis + hood + cabin roof + front/rear bumpers
    const taxiChassis = new THREE.BoxGeometry(1.72, 0.42, 4.1);
    taxiChassis.translate(0, 0.42, 0);

    const taxiCabin = new THREE.BoxGeometry(1.42, 0.52, 2.1);
    taxiCabin.translate(0, 0.88, -0.15);

    const taxiBumpFront = new THREE.BoxGeometry(1.76, 0.22, 0.22);
    taxiBumpFront.translate(0, 0.32, 2.1);

    const taxiBumpRear = new THREE.BoxGeometry(1.76, 0.22, 0.22);
    taxiBumpRear.translate(0, 0.32, -2.1);

    const taxiBodyGeo = BufferGeometryUtils.mergeGeometries([
      taxiChassis,
      taxiCabin,
      taxiBumpFront,
      taxiBumpRear,
    ])!;
    taxiBodyGeo.computeVertexNormals();

    // Taxi Details: tinted glass + roof sign + headlights + wheels
    const taxiGlassFront = new THREE.BoxGeometry(1.36, 0.46, 0.12);
    taxiGlassFront.translate(0, 0.86, 0.9);
    taxiGlassFront.rotateX(0.24);

    const taxiGlassRear = new THREE.BoxGeometry(1.36, 0.44, 0.12);
    taxiGlassRear.translate(0, 0.86, -1.2);
    taxiGlassRear.rotateX(-0.24);

    const taxiGlassSides = new THREE.BoxGeometry(1.46, 0.42, 1.85);
    taxiGlassSides.translate(0, 0.88, -0.15);

    // Roof Taxi Sign
    const taxiSign = new THREE.BoxGeometry(0.55, 0.15, 0.22);
    taxiSign.translate(0, 1.22, -0.15);

    // Wheels (4 cylinders with horizontal rotation)
    const wheelGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.24, 10);
    wheelGeo.rotateZ(Math.PI / 2);

    const wFL = wheelGeo.clone().translate(-0.84, 0.31, 1.25);
    const wFR = wheelGeo.clone().translate(0.84, 0.31, 1.25);
    const wRL = wheelGeo.clone().translate(-0.84, 0.31, -1.25);
    const wRR = wheelGeo.clone().translate(0.84, 0.31, -1.25);

    // Headlights
    const hlL = new THREE.BoxGeometry(0.28, 0.14, 0.08).translate(
      -0.62,
      0.48,
      2.06
    );
    const hlR = new THREE.BoxGeometry(0.28, 0.14, 0.08).translate(
      0.62,
      0.48,
      2.06
    );

    const taxiDetailGeo = BufferGeometryUtils.mergeGeometries([
      taxiGlassFront,
      taxiGlassRear,
      taxiGlassSides,
      taxiSign,
      wFL,
      wFR,
      wRL,
      wRR,
      hlL,
      hlR,
    ])!;
    taxiDetailGeo.computeVertexNormals();

    // 2. PRIVATE CAR
    const carChassis = new THREE.BoxGeometry(1.74, 0.44, 4.25);
    carChassis.translate(0, 0.43, 0);

    const carCabin = new THREE.BoxGeometry(1.44, 0.52, 2.2);
    carCabin.translate(0, 0.89, -0.1);

    const carBumpF = new THREE.BoxGeometry(1.78, 0.22, 0.22).translate(
      0,
      0.32,
      2.16
    );
    const carBumpR = new THREE.BoxGeometry(1.78, 0.22, 0.22).translate(
      0,
      0.32,
      -2.16
    );

    const carBodyGeo = BufferGeometryUtils.mergeGeometries([
      carChassis,
      carCabin,
      carBumpF,
      carBumpR,
    ])!;
    carBodyGeo.computeVertexNormals();

    const carGlassFront = new THREE.BoxGeometry(1.38, 0.46, 0.12)
      .translate(0, 0.87, 0.96)
      .rotateX(0.28);
    const carGlassRear = new THREE.BoxGeometry(1.38, 0.44, 0.12)
      .translate(0, 0.87, -1.16)
      .rotateX(-0.28);
    const carGlassSides = new THREE.BoxGeometry(1.48, 0.42, 1.95).translate(
      0,
      0.89,
      -0.1
    );

    const cwFL = wheelGeo.clone().translate(-0.85, 0.31, 1.3);
    const cwFR = wheelGeo.clone().translate(0.85, 0.31, 1.3);
    const cwRL = wheelGeo.clone().translate(-0.85, 0.31, -1.3);
    const cwRR = wheelGeo.clone().translate(0.85, 0.31, -1.3);

    const carDetailGeo = BufferGeometryUtils.mergeGeometries([
      carGlassFront,
      carGlassRear,
      carGlassSides,
      cwFL,
      cwFR,
      cwRL,
      cwRR,
      hlL.clone().translate(0, 0, 0.06),
      hlR.clone().translate(0, 0, 0.06),
    ])!;
    carDetailGeo.computeVertexNormals();

    // 3. SMALL TRUCK
    // Front cab + rear flatbed / pickup bed
    const truckCab = new THREE.BoxGeometry(1.82, 0.98, 1.6);
    truckCab.translate(0, 0.84, 1.2);

    const truckBed = new THREE.BoxGeometry(1.86, 0.48, 2.7);
    truckBed.translate(0, 0.58, -0.9);

    const truckBumper = new THREE.BoxGeometry(1.88, 0.26, 0.22).translate(
      0,
      0.36,
      2.04
    );

    const truckBodyGeo = BufferGeometryUtils.mergeGeometries([
      truckCab,
      truckBed,
      truckBumper,
    ])!;
    truckBodyGeo.computeVertexNormals();

    // Truck glass + heavy wheels
    const truckGlass = new THREE.BoxGeometry(1.68, 0.52, 0.12).translate(
      0,
      1.04,
      1.98
    );
    const truckSideGlass = new THREE.BoxGeometry(1.86, 0.46, 0.95).translate(
      0,
      1.04,
      1.15
    );

    const truckWheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
    truckWheelGeo.rotateZ(Math.PI / 2);

    const twFL = truckWheelGeo.clone().translate(-0.92, 0.36, 1.25);
    const twFR = truckWheelGeo.clone().translate(0.92, 0.36, 1.25);
    const twRL = truckWheelGeo.clone().translate(-0.92, 0.36, -1.35);
    const twRR = truckWheelGeo.clone().translate(0.92, 0.36, -1.35);

    const truckDetailGeo = BufferGeometryUtils.mergeGeometries([
      truckGlass,
      truckSideGlass,
      twFL,
      twFR,
      twRL,
      twRR,
    ])!;
    truckDetailGeo.computeVertexNormals();

    // Shared Materials
    const taxiBodyMat = new THREE.MeshStandardMaterial({
      color: TrafficSystem.TAXI_YELLOW,
      roughness: 0.42,
      metalness: 0.18,
    });

    const carBodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.38,
      metalness: 0.32,
    });

    const truckBodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.52,
      metalness: 0.15,
    });

    const detailMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.75,
      metalness: 0.25,
    });

    // Create Instanced Meshes
    this.taxiBodyInst = new THREE.InstancedMesh(
      taxiBodyGeo,
      taxiBodyMat,
      this.maxVehiclePool
    );
    this.taxiDetailInst = new THREE.InstancedMesh(
      taxiDetailGeo,
      detailMat,
      this.maxVehiclePool
    );

    this.carBodyInst = new THREE.InstancedMesh(
      carBodyGeo,
      carBodyMat,
      this.maxVehiclePool
    );
    this.carDetailInst = new THREE.InstancedMesh(
      carDetailGeo,
      detailMat,
      this.maxVehiclePool
    );

    this.truckBodyInst = new THREE.InstancedMesh(
      truckBodyGeo,
      truckBodyMat,
      this.maxVehiclePool
    );
    this.truckDetailInst = new THREE.InstancedMesh(
      truckDetailGeo,
      detailMat,
      this.maxVehiclePool
    );

    [
      this.taxiBodyInst,
      this.taxiDetailInst,
      this.carBodyInst,
      this.carDetailInst,
      this.truckBodyInst,
      this.truckDetailInst,
    ].forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Hide all unused instances far below ground initially
      this.dummyObj.position.set(0, -999, 0);
      this.dummyObj.scale.set(0, 0, 0);
      this.dummyObj.updateMatrix();
      for (let i = 0; i < this.maxVehiclePool; i++) {
        mesh.setMatrixAt(i, this.dummyObj.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    });
  }

  // Calculate target active vehicle count based on setting & dynamic FPS throttle
  public getTargetVehicleCount(): number {
    if (this.density === 'off') return 0;
    let base = 30;
    if (this.density === 'low') base = 15;
    else if (this.density === 'medium') base = 30;
    else if (this.density === 'high') base = 42;

    const target = Math.max(0, base - this.fpsThrottleOffset);
    return Math.min(this.maxVehiclePool, target);
  }

  // Update loop called every frame
  public update(
    dt: number,
    focusPos: THREE.Vector3,
    currentFps: number,
    playerCarPos?: THREE.Vector3,
    isPlayerDriving?: boolean
  ): void {
    const safeDt = Math.min(dt, 0.05);

    // 1. Dynamic FPS Auto-Throttling (Target 60 FPS on mid-range Android phone)
    if (currentFps < 45) {
      this.lowFpsAccumulator += safeDt;
      this.goodFpsAccumulator = 0;
      if (this.lowFpsAccumulator > 2.0) {
        this.fpsThrottleOffset = Math.min(this.fpsThrottleOffset + 2, 28);
        this.lowFpsAccumulator = 0;
      }
    } else if (currentFps >= 55) {
      this.goodFpsAccumulator += safeDt;
      this.lowFpsAccumulator = 0;
      if (this.goodFpsAccumulator > 3.5) {
        this.fpsThrottleOffset = Math.max(0, this.fpsThrottleOffset - 1);
        this.goodFpsAccumulator = 0;
      }
    }

    const targetCount = this.getTargetVehicleCount();

    // 2. Manage Vehicle Spawning and Despawning
    this.spawnCooldown -= safeDt;

    // Despawn vehicles farther than 320m from focus position or if over target cap
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      const dist = Math.hypot(v.x - focusPos.x, v.z - focusPos.z);
      if (
        dist > 320 ||
        (this.vehicles.length > targetCount && dist > 180 && !v.isTurning)
      ) {
        this.vehicles.splice(i, 1);
      }
    }

    // Spawn new vehicles if below target count
    if (
      this.vehicles.length < targetCount &&
      this.spawnCooldown <= 0 &&
      this.segmentList.length > 0
    ) {
      this.trySpawnVehicleNear(focusPos);
      this.spawnCooldown = 0.12; // Gradual smooth spawning
    }

    // 3. Update Vehicle Physics & Behavior
    for (let i = 0; i < this.vehicles.length; i++) {
      this.updateVehicle(
        this.vehicles[i],
        safeDt,
        playerCarPos,
        isPlayerDriving
      );
    }

    // 4. Update Instanced Meshes
    this.renderInstancedMeshes();
  }

  // Update individual vehicle navigation, speed, steering, anti-collision, and terrain following
  private updateVehicle(
    v: TrafficVehicle,
    dt: number,
    playerCarPos?: THREE.Vector3,
    isPlayerDriving?: boolean
  ): void {
    const seg = this.segments.get(v.segmentId);
    if (!seg) return;

    // A. Smooth Junction Turning Mode
    if (v.isTurning) {
      v.turnProgress += dt / v.turnDuration;
      const t = Math.min(1, Math.max(0, v.turnProgress));

      // Cubic Bézier curve evaluation
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;

      const p0 = v.turnP0;
      const p1 = v.turnP1;
      const p2 = v.turnP2;
      const p3 = v.turnP3;

      const px =
        uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
      const pz =
        uuu * p0.z + 3 * uu * t * p1.z + 3 * u * tt * p2.z + ttt * p3.z;

      // Tangent derivative for exact heading
      const dpx =
        3 * uu * (p1.x - p0.x) +
        6 * u * t * (p2.x - p1.x) +
        3 * tt * (p3.x - p2.x);
      const dpz =
        3 * uu * (p1.z - p0.z) +
        6 * u * t * (p2.z - p1.z) +
        3 * tt * (p3.z - p2.z);

      v.x = px;
      v.z = pz;
      v.yaw = Math.atan2(dpx, dpz);

      // Follow road surface height
      const targetY = this.roads.getSurfaceHeightAt(v.x, v.z);
      v.y = targetY;

      // Wheel rotation
      v.wheelRotation += (v.speed / 0.32) * dt;

      if (v.turnProgress >= 1.0) {
        // Transition finished, proceed on new segment
        v.isTurning = false;
        v.segmentId = v.turnTargetSegmentId;
        v.forward = v.turnTargetForward;
        v.distanceAlongSegment = 0.5;
      }
      return;
    }

    // B. Straight / Highway Lane Following Mode
    const laneOffset = seg.width * 0.25; // Drive on the right-hand side
    const dirFactor = v.forward ? 1 : -1;
    const travelDirX = seg.dirX * dirFactor;
    const travelDirZ = seg.dirZ * dirFactor;
    const rightNormalX = seg.rightX * dirFactor;
    const rightNormalZ = seg.rightZ * dirFactor;

    // B1. Anti-Collision: check for lead vehicles in same lane
    let effectiveTargetSpeed = seg.speedLimit;
    const distToEnd = seg.length - v.distanceAlongSegment;

    // Slow down for upcoming junction / corner
    if (distToEnd < 15.0) {
      const junctionSlowdown = Math.max(4.5, (distToEnd / 15.0) * seg.speedLimit);
      effectiveTargetSpeed = Math.min(effectiveTargetSpeed, junctionSlowdown);
    }

    // Check other traffic vehicles ahead
    for (let j = 0; j < this.vehicles.length; j++) {
      const other = this.vehicles[j];
      if (other.id === v.id) continue;

      const toOtherX = other.x - v.x;
      const toOtherZ = other.z - v.z;
      const dist = Math.hypot(toOtherX, toOtherZ);

      if (dist < 18.0) {
        // Project onto our heading to see if it's in front of us
        const dotForward =
          (toOtherX * travelDirX + toOtherZ * travelDirZ) / (dist || 1);
        if (dotForward > 0.65) {
          if (dist < 4.5) {
            effectiveTargetSpeed = 0; // Hard brake to avoid clipping
          } else if (dist < 10.0) {
            effectiveTargetSpeed = Math.min(
              effectiveTargetSpeed,
              other.speed * 0.75
            );
          } else {
            effectiveTargetSpeed = Math.min(
              effectiveTargetSpeed,
              other.speed + 1.5
            );
          }
        }
      }
    }

    // Check player vehicle ahead
    if (playerCarPos) {
      const toPlayerX = playerCarPos.x - v.x;
      const toPlayerZ = playerCarPos.z - v.z;
      const distToPlayer = Math.hypot(toPlayerX, toPlayerZ);

      if (distToPlayer < 20.0) {
        const dotForward =
          (toPlayerX * travelDirX + toPlayerZ * travelDirZ) /
          (distToPlayer || 1);
        if (dotForward > 0.6) {
          if (distToPlayer < 5.5) {
            effectiveTargetSpeed = 0; // Stop behind player
          } else if (distToPlayer < 12.0) {
            effectiveTargetSpeed = Math.min(effectiveTargetSpeed, 2.5);
          }
        }
      }
    }

    // B2. Smooth acceleration and braking
    if (v.speed < effectiveTargetSpeed) {
      v.speed = Math.min(effectiveTargetSpeed, v.speed + 3.2 * dt);
    } else {
      v.speed = Math.max(effectiveTargetSpeed, v.speed - 6.5 * dt);
    }

    // B3. Advance distance along road
    v.distanceAlongSegment += v.speed * dt;

    // Check if reached junction / end of segment
    if (v.distanceAlongSegment >= seg.length) {
      this.handleReachSegmentEnd(v, seg);
      return;
    }

    // B4. Compute current world position
    const nodeA = this.nodes.get(seg.nodeAId)!;
    const nodeB = this.nodes.get(seg.nodeBId)!;

    const s = v.forward
      ? v.distanceAlongSegment
      : seg.length - v.distanceAlongSegment;
    const centerLineX = nodeA.x + seg.dirX * s;
    const centerLineZ = nodeA.z + seg.dirZ * s;

    // Offset to right-hand lane
    v.x = centerLineX + rightNormalX * laneOffset;
    v.z = centerLineZ + rightNormalZ * laneOffset;

    // Yaw facing travel direction
    v.yaw = Math.atan2(travelDirX, travelDirZ);

    // Calculate surface height and slope pitch
    const currentY = this.roads.getSurfaceHeightAt(v.x, v.z);
    v.y = currentY;

    const probeAheadDist = 2.5;
    const aheadX = v.x + travelDirX * probeAheadDist;
    const aheadZ = v.z + travelDirZ * probeAheadDist;
    const aheadY = this.roads.getSurfaceHeightAt(aheadX, aheadZ);
    const dy = aheadY - currentY;
    v.pitch = -Math.atan2(dy, probeAheadDist); // Upward pitch tilts nose up

    // Wheel rotation
    v.wheelRotation += (v.speed / 0.32) * dt;
  }

  // Handle junction decision and initiate smooth Bézier curve turning
  private handleReachSegmentEnd(
    v: TrafficVehicle,
    currentSeg: RoadGraphSegment
  ): void {
    const endNodeId = v.forward ? currentSeg.nodeBId : currentSeg.nodeAId;
    const node = this.nodes.get(endNodeId);
    if (!node) return;

    // Connected segments at this junction
    const availableSegIds = node.connections.filter(
      (id) => id !== currentSeg.id
    );

    // If dead end, reverse direction along same segment
    if (availableSegIds.length === 0) {
      v.forward = !v.forward;
      v.distanceAlongSegment = 0.5;
      v.yaw += Math.PI;
      return;
    }

    // Pick random connected segment
    const nextSegId =
      availableSegIds[Math.floor(Math.random() * availableSegIds.length)];
    const nextSeg = this.segments.get(nextSegId);
    if (!nextSeg) return;

    // Determine target forward direction (leaves from this junction node)
    const targetForward = nextSeg.nodeAId === endNodeId;

    // Setup smooth turn arc
    const startPos = new THREE.Vector3(v.x, v.y, v.z);
    const dirFactor = v.forward ? 1 : -1;
    const inHeading = new THREE.Vector3(
      currentSeg.dirX * dirFactor,
      0,
      currentSeg.dirZ * dirFactor
    );

    const outDirFactor = targetForward ? 1 : -1;
    const outHeading = new THREE.Vector3(
      nextSeg.dirX * outDirFactor,
      0,
      nextSeg.dirZ * outDirFactor
    );

    // Target lane start position on next segment
    const nextNodeStart = targetForward
      ? this.nodes.get(nextSeg.nodeAId)!
      : this.nodes.get(nextSeg.nodeBId)!;
    const nextRightNormX = nextSeg.rightX * outDirFactor;
    const nextRightNormZ = nextSeg.rightZ * outDirFactor;
    const nextLaneOffset = nextSeg.width * 0.25;

    const targetPos = new THREE.Vector3(
      nextNodeStart.x +
        outHeading.x * 2.0 +
        nextRightNormX * nextLaneOffset,
      this.roads.getSurfaceHeightAt(nextNodeStart.x, nextNodeStart.z),
      nextNodeStart.z +
        outHeading.z * 2.0 +
        nextRightNormZ * nextLaneOffset
    );

    const turnDist = startPos.distanceTo(targetPos);
    const tangentScale = Math.max(2.0, turnDist * 0.45);

    v.isTurning = true;
    v.turnProgress = 0;
    v.turnDuration = Math.max(1.2, turnDist / Math.max(3.5, v.speed));
    v.turnP0 = startPos;
    v.turnP1 = startPos.clone().addScaledVector(inHeading, tangentScale);
    v.turnP2 = targetPos.clone().addScaledVector(outHeading, -tangentScale);
    v.turnP3 = targetPos;
    v.turnTargetSegmentId = nextSegId;
    v.turnTargetForward = targetForward;
  }

  // Attempt to spawn a new vehicle on a valid road segment near the player/drone
  private trySpawnVehicleNear(focusPos: THREE.Vector3): void {
    // Filter segments within [40m, 280m] of focus position
    const candidateSegments = this.segmentList.filter((seg) => {
      const nodeA = this.nodes.get(seg.nodeAId)!;
      const nodeB = this.nodes.get(seg.nodeBId)!;
      const midX = (nodeA.x + nodeB.x) / 2;
      const midZ = (nodeA.z + nodeB.z) / 2;
      const dist = Math.hypot(midX - focusPos.x, midZ - focusPos.z);
      return dist >= 35 && dist <= 270;
    });

    if (candidateSegments.length === 0) return;

    const seg =
      candidateSegments[Math.floor(Math.random() * candidateSegments.length)];
    const forward = Math.random() > 0.5;
    const distAlong = Math.random() * (seg.length - 8.0) + 4.0;

    // Check distance from existing vehicles on this segment
    for (let i = 0; i < this.vehicles.length; i++) {
      const other = this.vehicles[i];
      if (other.segmentId === seg.id && other.forward === forward) {
        if (Math.abs(other.distanceAlongSegment - distAlong) < 16.0) {
          return; // Too close, skip
        }
      }
    }

    // Vehicle Type Distribution: 45% Yellow Taxis, 35% Private Cars, 20% Small Trucks
    const r = Math.random();
    let type: VehicleType = 'taxi';
    let color = TrafficSystem.TAXI_YELLOW;

    if (r < 0.45) {
      type = 'taxi';
      color = TrafficSystem.TAXI_YELLOW;
    } else if (r < 0.8) {
      type = 'car';
      color =
        TrafficSystem.CAR_COLORS[
          Math.floor(Math.random() * TrafficSystem.CAR_COLORS.length)
        ];
    } else {
      type = 'truck';
      color =
        TrafficSystem.TRUCK_COLORS[
          Math.floor(Math.random() * TrafficSystem.TRUCK_COLORS.length)
        ];
    }

    const nodeA = this.nodes.get(seg.nodeAId)!;
    const dirFactor = forward ? 1 : -1;
    const rightNormalX = seg.rightX * dirFactor;
    const rightNormalZ = seg.rightZ * dirFactor;
    const laneOffset = seg.width * 0.25;

    const s = forward ? distAlong : seg.length - distAlong;
    const cx = nodeA.x + seg.dirX * s;
    const cz = nodeA.z + seg.dirZ * s;
    const x = cx + rightNormalX * laneOffset;
    const z = cz + rightNormalZ * laneOffset;
    const y = this.roads.getSurfaceHeightAt(x, z);

    const v: TrafficVehicle = {
      id: this.nextVehicleId++,
      type,
      color,
      active: true,
      segmentId: seg.id,
      forward,
      distanceAlongSegment: distAlong,
      speed: seg.speedLimit * (0.65 + Math.random() * 0.25),
      targetSpeed: seg.speedLimit,
      x,
      y,
      z,
      yaw: Math.atan2(seg.dirX * dirFactor, seg.dirZ * dirFactor),
      pitch: 0,
      isTurning: false,
      turnProgress: 0,
      turnDuration: 2.0,
      turnP0: new THREE.Vector3(),
      turnP1: new THREE.Vector3(),
      turnP2: new THREE.Vector3(),
      turnP3: new THREE.Vector3(),
      turnTargetSegmentId: '',
      turnTargetForward: true,
      wheelRotation: 0,
    };

    this.vehicles.push(v);
  }

  // Populate InstancedMesh matrices and colors for ultra-fast rendering (6 draw calls total)
  private renderInstancedMeshes(): void {
    let taxiIndex = 0;
    let carIndex = 0;
    let truckIndex = 0;

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];

      this.dummyObj.position.set(v.x, v.y, v.z);
      this.dummyObj.rotation.set(v.pitch, v.yaw, 0, 'YXZ');
      this.dummyObj.scale.set(1, 1, 1);
      this.dummyObj.updateMatrix();

      if (v.type === 'taxi' && taxiIndex < this.maxVehiclePool) {
        this.taxiBodyInst.setMatrixAt(taxiIndex, this.dummyObj.matrix);
        this.taxiDetailInst.setMatrixAt(taxiIndex, this.dummyObj.matrix);
        taxiIndex++;
      } else if (v.type === 'car' && carIndex < this.maxVehiclePool) {
        this.carBodyInst.setMatrixAt(carIndex, this.dummyObj.matrix);
        this.carDetailInst.setMatrixAt(carIndex, this.dummyObj.matrix);
        this.carBodyInst.setColorAt(carIndex, v.color);
        carIndex++;
      } else if (v.type === 'truck' && truckIndex < this.maxVehiclePool) {
        this.truckBodyInst.setMatrixAt(truckIndex, this.dummyObj.matrix);
        this.truckDetailInst.setMatrixAt(truckIndex, this.dummyObj.matrix);
        this.truckBodyInst.setColorAt(truckIndex, v.color);
        truckIndex++;
      }
    }

    // Hide remaining unused instances below ground
    this.dummyObj.position.set(0, -999, 0);
    this.dummyObj.scale.set(0, 0, 0);
    this.dummyObj.updateMatrix();

    for (let i = taxiIndex; i < this.maxVehiclePool; i++) {
      this.taxiBodyInst.setMatrixAt(i, this.dummyObj.matrix);
      this.taxiDetailInst.setMatrixAt(i, this.dummyObj.matrix);
    }
    for (let i = carIndex; i < this.maxVehiclePool; i++) {
      this.carBodyInst.setMatrixAt(i, this.dummyObj.matrix);
      this.carDetailInst.setMatrixAt(i, this.dummyObj.matrix);
    }
    for (let i = truckIndex; i < this.maxVehiclePool; i++) {
      this.truckBodyInst.setMatrixAt(i, this.dummyObj.matrix);
      this.truckDetailInst.setMatrixAt(i, this.dummyObj.matrix);
    }

    this.taxiBodyInst.instanceMatrix.needsUpdate = true;
    this.taxiDetailInst.instanceMatrix.needsUpdate = true;

    this.carBodyInst.instanceMatrix.needsUpdate = true;
    this.carDetailInst.instanceMatrix.needsUpdate = true;
    if (this.carBodyInst.instanceColor) {
      this.carBodyInst.instanceColor.needsUpdate = true;
    }

    this.truckBodyInst.instanceMatrix.needsUpdate = true;
    this.truckDetailInst.instanceMatrix.needsUpdate = true;
    if (this.truckBodyInst.instanceColor) {
      this.truckBodyInst.instanceColor.needsUpdate = true;
    }
  }

  // Set Traffic Density and persist setting
  public setDensity(density: TrafficDensity): void {
    this.density = density;
    this.fpsThrottleOffset = 0;
    try {
      localStorage.setItem('fonima_3d_traffic_density', density);
    } catch {
      // Ignored
    }

    if (density === 'off') {
      this.vehicles = [];
      this.renderInstancedMeshes();
    }
  }

  // Get active vehicle count for telemetry / HUD display
  public getActiveCount(): number {
    return this.vehicles.length;
  }

  // Get breakdown of vehicle types for diagnostics
  public getCountsByType(): { taxis: number; cars: number; trucks: number } {
    let taxis = 0;
    let cars = 0;
    let trucks = 0;
    for (let i = 0; i < this.vehicles.length; i++) {
      if (this.vehicles[i].type === 'taxi') taxis++;
      else if (this.vehicles[i].type === 'car') cars++;
      else if (this.vehicles[i].type === 'truck') trucks++;
    }
    return { taxis, cars, trucks };
  }

  // Clean up resources on disposal
  public dispose(): void {
    [
      this.taxiBodyInst,
      this.taxiDetailInst,
      this.carBodyInst,
      this.carDetailInst,
      this.truckBodyInst,
      this.truckDetailInst,
    ].forEach((mesh) => {
      if (mesh) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
    this.vehicles = [];
  }
}
