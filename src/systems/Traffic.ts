import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoadsSystem } from './Roads';
import { RoadGraph, RoadGraphNode, RoadGraphSegment } from './RoadGraph';

export type TrafficDensity = 'off' | 'low' | 'medium' | 'high';
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
  roll: number;

  // Smooth junction turning state
  isTurning: boolean;
  turnProgress: number; // 0 to 1
  turnDistanceTraveled: number;
  turnArcLength: number;
  turnP0: THREE.Vector3;
  turnP1: THREE.Vector3;
  turnP2: THREE.Vector3;
  turnP3: THREE.Vector3;
  turnTargetSegmentId: string;
  turnTargetForward: boolean;

  // Visual wheel spin
  wheelRotation: number;
}

export class TrafficSystem {
  private scene: THREE.Scene;
  private roads: RoadsSystem;

  // Vehicles
  private vehicles: TrafficVehicle[] = [];
  private nextVehicleId = 1;
  private readonly maxVehiclePool = 65;

  // Instanced Meshes (2 per vehicle type: body + detail)
  private taxiBodyInst!: THREE.InstancedMesh;
  private taxiDetailInst!: THREE.InstancedMesh;
  private carBodyInst!: THREE.InstancedMesh;
  private carDetailInst!: THREE.InstancedMesh;
  private truckBodyInst!: THREE.InstancedMesh;
  private truckDetailInst!: THREE.InstancedMesh;

  // Settings & Auto Throttling
  public density: TrafficDensity = 'medium';
  private fpsThrottleOffset = 0;
  private lowFpsAccumulator = 0;
  private goodFpsAccumulator = 0;
  private spawnCooldown = 0;

  // Scratch objects
  private dummyObj = new THREE.Object3D();

  // Color Palettes
  private static readonly TAXI_YELLOW = new THREE.Color(0xf59e0b);
  private static readonly CAR_COLORS: THREE.Color[] = [
    new THREE.Color(0x2563eb), // Royal Blue
    new THREE.Color(0xdc2626), // Carmine Red
    new THREE.Color(0xe2e8f0), // Pearl Silver
    new THREE.Color(0x334155), // Dark Slate
    new THREE.Color(0x059669), // Emerald Green
    new THREE.Color(0x7c3aed), // Violet
    new THREE.Color(0x0891b2), // Cyan Teal
    new THREE.Color(0xd97706), // Amber Ochre
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

    RoadGraph.initialize();

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

    this.buildVehicleMeshes();
    this.seedInitialTraffic(new THREE.Vector3(0, 0, 0));
  }

  // Build low-poly instanced vehicle meshes
  private buildVehicleMeshes(): void {
    // 1. YELLOW TAXI
    const taxiBodyParts: THREE.BufferGeometry[] = [];
    const taxiLower = new THREE.BoxGeometry(1.68, 0.44, 3.8);
    taxiLower.translate(0, 0.42, 0);
    taxiBodyParts.push(taxiLower);

    const taxiCabin = new THREE.BoxGeometry(1.42, 0.46, 1.85);
    taxiCabin.translate(0, 0.84, -0.15);
    taxiBodyParts.push(taxiCabin);

    const taxiHoodSlant = new THREE.BoxGeometry(1.5, 0.22, 0.95);
    taxiHoodSlant.rotateX(-0.16);
    taxiHoodSlant.translate(0, 0.58, 1.15);
    taxiBodyParts.push(taxiHoodSlant);

    const taxiTrunk = new THREE.BoxGeometry(1.48, 0.2, 0.85);
    taxiTrunk.translate(0, 0.56, -1.35);
    taxiBodyParts.push(taxiTrunk);

    const taxiBodyGeo = BufferGeometryUtils.mergeGeometries(taxiBodyParts);

    // Taxi details: black glass, wheels, bumpers, roof sign
    const taxiDetailParts: THREE.BufferGeometry[] = [];
    const taxiWindshield = new THREE.BoxGeometry(1.44, 0.4, 0.08);
    taxiWindshield.rotateX(0.38);
    taxiWindshield.translate(0, 0.82, 0.8);
    taxiDetailParts.push(taxiWindshield);

    const taxiRearGlass = new THREE.BoxGeometry(1.44, 0.38, 0.08);
    taxiRearGlass.rotateX(-0.35);
    taxiRearGlass.translate(0, 0.82, -1.05);
    taxiDetailParts.push(taxiRearGlass);

    const taxiRoofSign = new THREE.BoxGeometry(0.55, 0.16, 0.22);
    taxiRoofSign.translate(0, 1.15, -0.15);
    taxiDetailParts.push(taxiRoofSign);

    const taxiBumpF = new THREE.BoxGeometry(1.66, 0.16, 0.18);
    taxiBumpF.translate(0, 0.24, 1.95);
    taxiDetailParts.push(taxiBumpF);

    const taxiBumpR = new THREE.BoxGeometry(1.66, 0.16, 0.18);
    taxiBumpR.translate(0, 0.24, -1.95);
    taxiDetailParts.push(taxiBumpR);

    // Wheels
    const wheelPositions: [number, number, number][] = [
      [-0.82, 0.28, 1.15],
      [0.82, 0.28, 1.15],
      [-0.82, 0.28, -1.15],
      [0.82, 0.28, -1.15],
    ];
    wheelPositions.forEach(([wx, wy, wz]) => {
      const w = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 10);
      w.rotateZ(Math.PI / 2);
      w.translate(wx, wy, wz);
      taxiDetailParts.push(w);
    });

    // Headlights & Taillights
    const hlL = new THREE.BoxGeometry(0.24, 0.12, 0.08);
    hlL.translate(-0.55, 0.44, 1.92);
    taxiDetailParts.push(hlL);
    const hlR = new THREE.BoxGeometry(0.24, 0.12, 0.08);
    hlR.translate(0.55, 0.44, 1.92);
    taxiDetailParts.push(hlR);

    const tlL = new THREE.BoxGeometry(0.24, 0.12, 0.08);
    tlL.translate(-0.55, 0.44, -1.92);
    taxiDetailParts.push(tlL);
    const tlR = new THREE.BoxGeometry(0.24, 0.12, 0.08);
    tlR.translate(0.55, 0.44, -1.92);
    taxiDetailParts.push(tlR);

    const taxiDetailGeo = BufferGeometryUtils.mergeGeometries(taxiDetailParts);

    // 2. PRIVATE CAR
    const carBodyParts: THREE.BufferGeometry[] = [];
    const carLower = new THREE.BoxGeometry(1.72, 0.46, 4.1);
    carLower.translate(0, 0.44, 0);
    carBodyParts.push(carLower);

    const carCabin = new THREE.BoxGeometry(1.44, 0.48, 2.0);
    carCabin.translate(0, 0.88, -0.2);
    carBodyParts.push(carCabin);

    const carBodyGeo = BufferGeometryUtils.mergeGeometries(carBodyParts);

    const carDetailParts: THREE.BufferGeometry[] = [];
    const carGlassF = new THREE.BoxGeometry(1.46, 0.42, 0.08);
    carGlassF.rotateX(0.42);
    carGlassF.translate(0, 0.84, 0.85);
    carDetailParts.push(carGlassF);

    const carGlassR = new THREE.BoxGeometry(1.46, 0.4, 0.08);
    carGlassR.rotateX(-0.38);
    carGlassR.translate(0, 0.84, -1.22);
    carDetailParts.push(carGlassR);

    wheelPositions.forEach(([wx, wy, wz]) => {
      const w = new THREE.CylinderGeometry(0.3, 0.3, 0.24, 10);
      w.rotateZ(Math.PI / 2);
      w.translate(wx * 1.02, wy * 1.04, wz * 1.05);
      carDetailParts.push(w);
    });

    const carDetailGeo = BufferGeometryUtils.mergeGeometries(carDetailParts);

    // 3. SMALL TRUCK
    const truckBodyParts: THREE.BufferGeometry[] = [];
    const truckCab = new THREE.BoxGeometry(1.78, 0.95, 1.55);
    truckCab.translate(0, 0.85, 1.25);
    truckBodyParts.push(truckCab);

    const truckBed = new THREE.BoxGeometry(1.82, 0.52, 2.75);
    truckBed.translate(0, 0.65, -0.85);
    truckBodyParts.push(truckBed);

    const truckBodyGeo = BufferGeometryUtils.mergeGeometries(truckBodyParts);

    const truckDetailParts: THREE.BufferGeometry[] = [];
    const truckWindshield = new THREE.BoxGeometry(1.68, 0.44, 0.08);
    truckWindshield.rotateX(0.18);
    truckWindshield.translate(0, 1.05, 1.95);
    truckDetailParts.push(truckWindshield);

    const truckFrame = new THREE.BoxGeometry(1.2, 0.3, 4.4);
    truckFrame.translate(0, 0.28, 0.1);
    truckDetailParts.push(truckFrame);

    const truckWheels: [number, number, number][] = [
      [-0.88, 0.34, 1.3],
      [0.88, 0.34, 1.3],
      [-0.88, 0.34, -0.6],
      [0.88, 0.34, -0.6],
      [-0.88, 0.34, -1.5],
      [0.88, 0.34, -1.5],
    ];
    truckWheels.forEach(([wx, wy, wz]) => {
      const w = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 10);
      w.rotateZ(Math.PI / 2);
      w.translate(wx, wy, wz);
      truckDetailParts.push(w);
    });

    const truckDetailGeo = BufferGeometryUtils.mergeGeometries(truckDetailParts);

    // Materials
    const taxiBodyMat = new THREE.MeshStandardMaterial({
      color: TrafficSystem.TAXI_YELLOW,
      roughness: 0.35,
      metalness: 0.25,
    });
    const carBodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.32,
      metalness: 0.35,
    });
    const truckBodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.15,
    });
    const detailMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.65,
      metalness: 0.2,
    });

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

  // Populate initial active traffic so cars are already driving as soon as the game opens
  private seedInitialTraffic(focusPos: THREE.Vector3): void {
    const targetCount = this.getTargetVehicleCount();
    const segments = RoadGraph.getAllSegments();
    if (segments.length === 0 || targetCount === 0) return;

    for (let i = 0; i < targetCount; i++) {
      this.trySpawnVehicleNear(focusPos, true);
    }
  }

  public getTargetVehicleCount(): number {
    if (this.density === 'off') return 0;
    let base = 32;
    if (this.density === 'low') base = 16;
    else if (this.density === 'medium') base = 32;
    else if (this.density === 'high') base = 44;

    const target = Math.max(0, base - this.fpsThrottleOffset);
    return Math.min(this.maxVehiclePool, target);
  }

  // Main update loop called every frame from World.ts
  public update(
    dt: number,
    focusPos: THREE.Vector3,
    currentFps: number,
    playerCarPos?: THREE.Vector3,
    isPlayerDriving?: boolean
  ): void {
    const safeDt = Math.min(Math.max(0.001, dt), 0.05);

    // 1. Dynamic FPS Auto-Throttling (60 FPS target on mid-range phones)
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
      if (this.goodFpsAccumulator > 3.0) {
        this.fpsThrottleOffset = Math.max(0, this.fpsThrottleOffset - 1);
        this.goodFpsAccumulator = 0;
      }
    }

    const targetCount = this.getTargetVehicleCount();

    // 2. Despawn vehicles farther than 300m
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      const dist = Math.hypot(v.x - focusPos.x, v.z - focusPos.z);
      if (dist > 310 || (this.vehicles.length > targetCount && dist > 180 && !v.isTurning)) {
        this.vehicles.splice(i, 1);
      }
    }

    // 3. Spawn vehicles near drone (within ~300m)
    this.spawnCooldown -= safeDt;
    if (this.vehicles.length < targetCount && this.spawnCooldown <= 0) {
      this.trySpawnVehicleNear(focusPos, false);
      this.spawnCooldown = 0.15;
    }

    // 4. Update Vehicle Physics & Behavior (Delta-time continuous movement)
    for (let i = 0; i < this.vehicles.length; i++) {
      this.updateVehicle(this.vehicles[i], safeDt, playerCarPos, isPlayerDriving);
    }

    // 5. Update Instanced Meshes
    this.renderInstancedMeshes();
  }

  // Helper to detect any lead vehicle in front within the driving vector corridor
  private checkLeadVehicle(
    v: TrafficVehicle,
    forwardDirX: number,
    forwardDirZ: number,
    playerCarPos?: THREE.Vector3,
    isPlayerDriving?: boolean
  ): { gap: number; leadSpeed: number } {
    let closestGap = Infinity;
    let leadSpeed = 0;

    const latNormX = -forwardDirZ;
    const latNormZ = forwardDirX;

    // 1. Check all other traffic vehicles
    for (let i = 0; i < this.vehicles.length; i++) {
      const other = this.vehicles[i];
      if (other.id === v.id || !other.active) continue;

      const dx = other.x - v.x;
      const dz = other.z - v.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 28.0 * 28.0) continue;

      const fwd = dx * forwardDirX + dz * forwardDirZ;
      if (fwd <= 0.2 || fwd >= 24.0) continue;

      const lat = Math.abs(dx * latNormX + dz * latNormZ);

      // Same segment special-case: 1D distance ahead if traveling in same direction
      if (!v.isTurning && !other.isTurning && other.segmentId === v.segmentId) {
        if (other.forward === v.forward) {
          const distAhead = other.distanceAlongSegment - v.distanceAlongSegment;
          if (distAhead > 0 && distAhead < closestGap) {
            closestGap = distAhead;
            leadSpeed = other.speed;
          }
          continue;
        } else {
          // Oncoming opposite-direction traffic: separated by lane, skip unless lane breach
          if (lat > 1.2) continue;
        }
      }

      // Check relative heading to distinguish oncoming traffic from same-flow traffic
      const otherDirX = Math.sin(other.yaw);
      const otherDirZ = Math.cos(other.yaw);
      const headingDot = forwardDirX * otherDirX + forwardDirZ * otherDirZ;

      // Oncoming traffic passing in the opposite direction
      if (headingDot < -0.3 && lat > 1.4) continue;

      // Check if within vehicle travel lane corridor (wider tolerance during junction turns)
      const allowedLaneWidth = v.isTurning || other.isTurning ? 2.8 : 2.2;
      if (lat < allowedLaneWidth) {
        if (fwd < closestGap) {
          closestGap = fwd;
          leadSpeed = other.speed;
        }
      }
    }

    // 2. Check player's vehicle (if parked or being driven)
    if (playerCarPos) {
      const dx = playerCarPos.x - v.x;
      const dz = playerCarPos.z - v.z;
      const distSq = dx * dx + dz * dz;
      if (distSq <= 24.0 * 24.0) {
        const fwd = dx * forwardDirX + dz * forwardDirZ;
        const lat = Math.abs(dx * latNormX + dz * latNormZ);
        if (fwd > 0.3 && fwd < 20.0 && lat < 2.5) {
          if (fwd < closestGap) {
            closestGap = fwd;
            leadSpeed = 0; // Yield to player vehicle
          }
        }
      }
    }

    return { gap: closestGap, leadSpeed };
  }

  // Smoothly orient vehicle to align with 3D road surface height, pitch, roll, and driving vector
  private alignVehicleOrientation(
    v: TrafficVehicle,
    forwardDirX: number,
    forwardDirZ: number,
    dt: number
  ): void {
    // 1. Driving vector yaw alignment (smooth angle interpolation)
    const targetYaw = Math.atan2(forwardDirX, forwardDirZ);
    let diffYaw = targetYaw - v.yaw;
    while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
    while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
    v.yaw += diffYaw * Math.min(1.0, dt * 14.0);

    // 2. Pitch along the driving vector from road surface heights ahead & behind
    const probeDist = 1.6;
    const aheadX = v.x + forwardDirX * probeDist;
    const aheadZ = v.z + forwardDirZ * probeDist;
    const rearX = v.x - forwardDirX * probeDist;
    const rearZ = v.z - forwardDirZ * probeDist;

    const yAhead = this.roads.getSurfaceHeightAt(aheadX, aheadZ);
    const yRear = this.roads.getSurfaceHeightAt(rearX, rearZ);
    const targetPitch = THREE.MathUtils.clamp(
      -Math.atan2(yAhead - yRear, probeDist * 2.0),
      -0.45,
      0.45
    );
    v.pitch += (targetPitch - v.pitch) * Math.min(1.0, dt * 12.0);

    // 3. Roll across the road width (lateral banking)
    const latNormX = -forwardDirZ;
    const latNormZ = forwardDirX;
    const latDist = 0.8;
    const leftX = v.x - latNormX * latDist;
    const leftZ = v.z - latNormZ * latDist;
    const rightX = v.x + latNormX * latDist;
    const rightZ = v.z + latNormZ * latDist;

    const yLeft = this.roads.getSurfaceHeightAt(leftX, leftZ);
    const yRight = this.roads.getSurfaceHeightAt(rightX, rightZ);
    const targetRoll = THREE.MathUtils.clamp(
      Math.atan2(yRight - yLeft, latDist * 2.0),
      -0.35,
      0.35
    );
    v.roll += (targetRoll - v.roll) * Math.min(1.0, dt * 12.0);
  }

  // Update an individual vehicle using continuous delta-time based movement
  private updateVehicle(
    v: TrafficVehicle,
    dt: number,
    playerCarPos?: THREE.Vector3,
    isPlayerDriving?: boolean
  ): void {
    const seg = RoadGraph.getSegment(v.segmentId);
    if (!seg) {
      v.segmentId = RoadGraph.getAllSegments()[0]?.id || '';
      return;
    }

    // -------------------------------------------------------------
    // A. SMOOTH JUNCTION TURNING MODE (Cubic Bézier Transition Arc)
    // -------------------------------------------------------------
    if (v.isTurning) {
      const t = Math.min(1.0, Math.max(0.0, v.turnProgress));

      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;

      const p0 = v.turnP0;
      const p1 = v.turnP1;
      const p2 = v.turnP2;
      const p3 = v.turnP3;

      const px = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
      const pz = uuu * p0.z + 3 * uu * t * p1.z + 3 * u * tt * p2.z + ttt * p3.z;

      // Tangent derivative for exact forward heading & driving vector
      const dpx =
        3 * uu * (p1.x - p0.x) +
        6 * u * t * (p2.x - p1.x) +
        3 * tt * (p3.x - p2.x);
      const dpz =
        3 * uu * (p1.z - p0.z) +
        6 * u * t * (p2.z - p1.z) +
        3 * tt * (p3.z - p2.z);

      const tanLen = Math.hypot(dpx, dpz);
      const forwardDirX = tanLen > 0.001 ? dpx / tanLen : Math.sin(v.yaw);
      const forwardDirZ = tanLen > 0.001 ? dpz / tanLen : Math.cos(v.yaw);

      // Check lead vehicle to maintain safe distance even while turning
      const leadCheck = this.checkLeadVehicle(
        v,
        forwardDirX,
        forwardDirZ,
        playerCarPos,
        isPlayerDriving
      );

      // Cornering speed limit through junction
      let targetSpeed = 6.8;
      if (leadCheck.gap <= 5.5) {
        targetSpeed = 0;
      } else if (leadCheck.gap <= 10.0) {
        const ratio = (leadCheck.gap - 5.5) / 4.5;
        targetSpeed = Math.min(targetSpeed, Math.max(0, leadCheck.leadSpeed * 0.7) * ratio);
      } else if (leadCheck.gap <= 18.0) {
        targetSpeed = Math.min(targetSpeed, Math.max(2.5, leadCheck.leadSpeed * 0.9));
      }

      // Continuous delta-time speed integration
      if (v.speed < targetSpeed) {
        v.speed = Math.min(targetSpeed, v.speed + 4.2 * dt);
      } else {
        const decel = targetSpeed === 0 ? 11.0 : 6.5;
        v.speed = Math.max(0, v.speed - decel * dt);
      }

      // Continuous delta-time distance along turn arc
      v.turnDistanceTraveled += v.speed * dt;
      v.turnProgress = v.turnDistanceTraveled / Math.max(1.0, v.turnArcLength);

      v.x = px;
      v.z = pz;

      // Follow road surface height directly at vehicle coordinates
      v.y = this.roads.getSurfaceHeightAt(v.x, v.z);

      // Rotate to align with road height and driving vector at every junction
      this.alignVehicleOrientation(v, forwardDirX, forwardDirZ, dt);

      // Visual wheel rotation
      v.wheelRotation += (v.speed / 0.3) * dt;

      if (v.turnProgress >= 1.0) {
        // Smoothly exit junction turn and continue driving along target segment
        v.isTurning = false;
        v.segmentId = v.turnTargetSegmentId;
        v.forward = v.turnTargetForward;
        const targetSeg = RoadGraph.getSegment(v.segmentId);
        v.distanceAlongSegment = Math.min(2.0, (targetSeg?.length || 20) * 0.08);
        v.speed = Math.max(v.speed, 4.0);
      }
      return;
    }

    // -------------------------------------------------------------
    // B. STRAIGHT / ROAD SEGMENT DRIVING (Right-Hand Traffic)
    // -------------------------------------------------------------
    const laneOffset = seg.width * 0.25;
    const dirFactor = v.forward ? 1 : -1;
    const forwardDirX = seg.dirX * dirFactor;
    const forwardDirZ = seg.dirZ * dirFactor;
    const rightNormalX = seg.rightX * dirFactor;
    const rightNormalZ = seg.rightZ * dirFactor;

    let targetSpeed = seg.speedLimit;

    // Cornering slowdown when approaching end of segment / junction
    const distToEnd = seg.length - v.distanceAlongSegment;
    if (distToEnd < 10.0) {
      const cornerSpeed = Math.max(5.0, seg.speedLimit * 0.55);
      targetSpeed = Math.min(
        targetSpeed,
        THREE.MathUtils.lerp(cornerSpeed, seg.speedLimit, distToEnd / 10.0)
      );
    }

    // Lead vehicle anti-collision check to maintain safe following distance
    const leadCheck = this.checkLeadVehicle(
      v,
      forwardDirX,
      forwardDirZ,
      playerCarPos,
      isPlayerDriving
    );

    if (leadCheck.gap <= 5.5) {
      targetSpeed = 0; // Stop completely, maintain safe gap
    } else if (leadCheck.gap <= 10.0) {
      const ratio = (leadCheck.gap - 5.5) / 4.5;
      targetSpeed = Math.min(
        targetSpeed,
        Math.max(0, leadCheck.leadSpeed * 0.7) * ratio
      );
    } else if (leadCheck.gap <= 18.0) {
      targetSpeed = Math.min(
        targetSpeed,
        Math.max(2.5, leadCheck.leadSpeed * 0.9)
      );
    } else if (leadCheck.gap <= 24.0) {
      targetSpeed = Math.min(
        targetSpeed,
        Math.max(4.0, leadCheck.leadSpeed + 1.5)
      );
    }

    // Continuous delta-time acceleration & braking
    if (v.speed < targetSpeed) {
      const accel = v.type === 'truck' ? 3.5 : 4.8;
      v.speed = Math.min(targetSpeed, v.speed + accel * dt);
    } else {
      const decel = targetSpeed === 0 ? 11.5 : 6.5;
      v.speed = Math.max(0, v.speed - decel * dt);
    }

    // Advance distance along road using delta time
    v.distanceAlongSegment += v.speed * dt;

    // Check if reached end of segment / junction
    if (v.distanceAlongSegment >= seg.length) {
      this.handleReachSegmentEnd(v, seg);
      return;
    }

    // Compute current world position in right-hand lane
    const nodeA = RoadGraph.getNode(seg.nodeAId)!;
    const s = v.forward
      ? v.distanceAlongSegment
      : seg.length - v.distanceAlongSegment;

    const clampedS = Math.max(0, Math.min(seg.length, s));
    const centerLineX = nodeA.x + seg.dirX * clampedS;
    const centerLineZ = nodeA.z + seg.dirZ * clampedS;

    v.x = centerLineX + rightNormalX * laneOffset;
    v.z = centerLineZ + rightNormalZ * laneOffset;
    v.y = this.roads.getSurfaceHeightAt(v.x, v.z);

    // Rotate to align with road height and driving vector
    this.alignVehicleOrientation(v, forwardDirX, forwardDirZ, dt);

    // Rotate wheels proportionally to linear travel
    v.wheelRotation += (v.speed / 0.3) * dt;
  }

  // Handle junction turning decision or cul-de-sac turnaround
  private handleReachSegmentEnd(
    v: TrafficVehicle,
    currentSeg: RoadGraphSegment
  ): void {
    const endNodeId = v.forward ? currentSeg.nodeBId : currentSeg.nodeAId;
    const node = RoadGraph.getNode(endNodeId);
    if (!node) return;

    const currentDirFactor = v.forward ? 1 : -1;
    const inHeading = new THREE.Vector3(
      currentSeg.dirX * currentDirFactor,
      0,
      currentSeg.dirZ * currentDirFactor
    );

    // 1. CUL-DE-SAC / DEAD-END: Smooth 180° turnaround loop
    if (node.isCulDeSac || node.connections.length <= 1) {
      const radius = node.turningRadius || 8.0;
      const startPos = new THREE.Vector3(v.x, v.y, v.z);

      // Return position: opposite right-hand lane leaving the node
      const returnDirFactor = -currentDirFactor;
      const returnRightNormX = currentSeg.rightX * returnDirFactor;
      const returnRightNormZ = currentSeg.rightZ * returnDirFactor;
      const laneOffset = currentSeg.width * 0.25;

      const targetX =
        node.x + currentSeg.dirX * returnDirFactor * 1.5 + returnRightNormX * laneOffset;
      const targetZ =
        node.z + currentSeg.dirZ * returnDirFactor * 1.5 + returnRightNormZ * laneOffset;
      const targetY = this.roads.getSurfaceHeightAt(targetX, targetZ);
      const targetPos = new THREE.Vector3(targetX, targetY, targetZ);

      const loopOutHeading = new THREE.Vector3(
        currentSeg.dirX * returnDirFactor,
        0,
        currentSeg.dirZ * returnDirFactor
      );

      v.isTurning = true;
      v.turnProgress = 0;
      v.turnDistanceTraveled = 0;
      v.turnP0 = startPos;
      v.turnP1 = startPos.clone().addScaledVector(inHeading, radius * 0.9);
      v.turnP2 = targetPos.clone().addScaledVector(loopOutHeading, -radius * 0.9);
      v.turnP3 = targetPos;
      v.turnArcLength = Math.PI * radius;
      v.turnTargetSegmentId = currentSeg.id;
      v.turnTargetForward = !v.forward;
      return;
    }

    // 2. JUNCTION: Pick a random connected road (excluding the one just traveled)
    const availableSegIds = node.connections.filter((id) => id !== currentSeg.id);
    const nextSegId =
      availableSegIds.length > 0
        ? availableSegIds[Math.floor(Math.random() * availableSegIds.length)]
        : currentSeg.id;

    const nextSeg = RoadGraph.getSegment(nextSegId);
    if (!nextSeg) return;

    // Moving outward from endNode
    const nextForward = nextSeg.nodeAId === endNodeId;
    const nextDirFactor = nextForward ? 1 : -1;
    const outHeading = new THREE.Vector3(
      nextSeg.dirX * nextDirFactor,
      0,
      nextSeg.dirZ * nextDirFactor
    );

    const startPos = new THREE.Vector3(v.x, v.y, v.z);

    // Target position: right-hand lane of next segment just past junction
    const nextNodeStart = nextForward
      ? RoadGraph.getNode(nextSeg.nodeAId)!
      : RoadGraph.getNode(nextSeg.nodeBId)!;
    const nextRightNormX = nextSeg.rightX * nextDirFactor;
    const nextRightNormZ = nextSeg.rightZ * nextDirFactor;
    const nextLaneOffset = nextSeg.width * 0.25;

    const leadDistance = 2.0;
    const targetX =
      nextNodeStart.x + outHeading.x * leadDistance + nextRightNormX * nextLaneOffset;
    const targetZ =
      nextNodeStart.z + outHeading.z * leadDistance + nextRightNormZ * nextLaneOffset;
    const targetY = this.roads.getSurfaceHeightAt(targetX, targetZ);
    const targetPos = new THREE.Vector3(targetX, targetY, targetZ);

    const turnDist = startPos.distanceTo(targetPos);
    const tangentScale = Math.max(1.8, turnDist * 0.45);

    v.isTurning = true;
    v.turnProgress = 0;
    v.turnDistanceTraveled = 0;
    v.turnP0 = startPos;
    v.turnP1 = startPos.clone().addScaledVector(inHeading, tangentScale);
    v.turnP2 = targetPos.clone().addScaledVector(outHeading, -tangentScale);
    v.turnP3 = targetPos;
    v.turnArcLength = Math.max(2.5, turnDist * 1.15);
    v.turnTargetSegmentId = nextSegId;
    v.turnTargetForward = nextForward;
  }

  // Attempt to spawn a new vehicle on a valid road segment near the player/drone
  private trySpawnVehicleNear(focusPos: THREE.Vector3, isSeeding = false): void {
    const segments = RoadGraph.getAllSegments();
    if (segments.length === 0) return;

    // Filter segments within [30m, 290m] of focus position
    const candidateSegments = segments.filter((seg) => {
      const nodeA = RoadGraph.getNode(seg.nodeAId)!;
      const nodeB = RoadGraph.getNode(seg.nodeBId)!;
      const midX = (nodeA.x + nodeB.x) / 2;
      const midZ = (nodeA.z + nodeB.z) / 2;
      const dist = Math.hypot(midX - focusPos.x, midZ - focusPos.z);
      return isSeeding ? dist <= 280 : dist >= 35 && dist <= 280;
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
        if (Math.abs(other.distanceAlongSegment - distAlong) < 14.0) {
          return;
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

    const nodeA = RoadGraph.getNode(seg.nodeAId)!;
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
    const forwardDirX = seg.dirX * dirFactor;
    const forwardDirZ = seg.dirZ * dirFactor;
    const latNormX = -forwardDirZ;
    const latNormZ = forwardDirX;

    const probe = 1.6;
    const yAhead = this.roads.getSurfaceHeightAt(x + forwardDirX * probe, z + forwardDirZ * probe);
    const yRear = this.roads.getSurfaceHeightAt(x - forwardDirX * probe, z - forwardDirZ * probe);
    const yLeft = this.roads.getSurfaceHeightAt(x - latNormX * 0.8, z - latNormZ * 0.8);
    const yRight = this.roads.getSurfaceHeightAt(x + latNormX * 0.8, z + latNormZ * 0.8);

    const initialPitch = THREE.MathUtils.clamp(-Math.atan2(yAhead - yRear, probe * 2.0), -0.45, 0.45);
    const initialRoll = THREE.MathUtils.clamp(Math.atan2(yRight - yLeft, 1.6), -0.35, 0.35);

    const v: TrafficVehicle = {
      id: this.nextVehicleId++,
      type,
      color,
      active: true,
      segmentId: seg.id,
      forward,
      distanceAlongSegment: distAlong,
      speed: seg.speedLimit * (0.8 + Math.random() * 0.2), // Already moving at driving speed!
      targetSpeed: seg.speedLimit,
      x,
      y,
      z,
      yaw: Math.atan2(seg.dirX * dirFactor, seg.dirZ * dirFactor),
      pitch: initialPitch,
      roll: initialRoll,
      isTurning: false,
      turnProgress: 0,
      turnDistanceTraveled: 0,
      turnArcLength: 2.0,
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
      this.dummyObj.rotation.set(v.pitch, v.yaw, v.roll, 'YXZ');
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

  // Set Traffic Density
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

  public getActiveCount(): number {
    return this.vehicles.length;
  }

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
