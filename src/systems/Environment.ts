import * as THREE from 'three';
import { ColliderBox, InteractiveObject, WeatherCondition } from './GameState';
import { ProceduralTextures } from './ProceduralTextures';

interface PalmBaseTransform {
  x: number;
  y: number;
  z: number;
  scale: number;
  phase: number;
  frondIndexStart: number;
}

interface StreetLightNode {
  id: string;
  lampWorldPos: THREE.Vector3;
  groundPoolMesh: THREE.Mesh;
  haloMesh: THREE.Mesh;
}

export class EnvironmentSystem {
  public colliders: ColliderBox[] = [];
  public interactables: InteractiveObject[] = [];

  private terrainMat!: THREE.MeshStandardMaterial;
  private palmFrondInst!: THREE.InstancedMesh;
  private bushInst!: THREE.InstancedMesh;
  private grassTuftInst!: THREE.InstancedMesh;
  private shadeCanopyInst!: THREE.InstancedMesh;

  // Functional Street Light System & Dynamic Light Pool
  private streetBulbMat!: THREE.MeshStandardMaterial;
  private streetHaloMat!: THREE.MeshBasicMaterial;
  private groundPoolMat!: THREE.MeshBasicMaterial;
  private streetLightNodes: StreetLightNode[] = [];
  private activePointLightPool: THREE.PointLight[] = [];
  private readonly maxPooledLights = 4;

  private palmBases: PalmBaseTransform[] = [];
  private bushBases: { x: number; y: number; z: number; scale: number; phase: number }[] = [];
  private shadeTreeBases: { x: number; y: number; z: number; scale: number; phase: number }[] = [];
  private grassTuftBases: { x: number; y: number; z: number; scale: number; rotY: number }[] = [];

  private windTime: number = 0;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.buildTerrain(scene);
    this.buildTropicalTreesInstanced(scene);
    this.buildFunctionalStreetLights(scene);
    this.buildRoadsidePropsAndWires(scene);
    this.buildNeighborhoodSignboards(scene);
  }

  public static getTerrainHeight(x: number, z: number): number {
    // 1. Inside the original Freetown / Fonima region (X <= 75), preserve the EXACT terrain height formula
    if (x <= 75) {
      const gentleSlope = x * 0.0055 - z * 0.0075;
      const microUndulation = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 0.16;
      const distFromCenter = Math.hypot(x, z);
      // Open the East corridor (x > 30 and |z| < 90) so Williams St & Peninsula Rd flow smoothly onto the Bo Highway
      const inEastCorridor = x > 30 && Math.abs(z) < 90;
      const outerHill =
        !inEastCorridor && distFromCenter > 96
          ? Math.pow((distFromCenter - 96) * 0.075, 1.45)
          : 0;
      return gentleSlope + microUndulation + outerHill;
    }

    // 2. Smooth transition & Freetown-to-Bo Highway / Inland Basin Terrain (X > 75)
    const baseAt75 =
      75 * 0.0055 - z * 0.0075 + Math.sin(75 * 0.04) * Math.cos(z * 0.04) * 0.16;
    const dx = x - 75;
    const blend = Math.min(1, dx / 45);

    // Highway centerline Z(x) curves naturally through the Sierra Leone countryside and levels out at Z = 0 entering Bo City
    const hwyZ = EnvironmentSystem.getHighwayCenterZ(x);
    const distFromHwy = Math.abs(z - hwyZ);

    // Rolling countryside hills along the highway, flattening into the Bo City inland plateau (X >= 1050)
    const inBoBasin = x >= 1030 ? Math.min(1, (x - 1030) / 70) : 0;
    const ruralWave =
      (Math.sin(x * 0.009) * 2.1 + Math.cos(x * 0.021) * 0.85) *
      (1 - inBoBasin * 0.82);

    // Scenic side hills away from the road shoulder
    const shoulderFlat = Math.max(0, distFromHwy - 14);
    const sideHill =
      (1 - inBoBasin * 0.78) *
      Math.min(14, Math.pow(shoulderFlat * 0.032, 1.25)) *
      (0.65 + 0.35 * Math.sin(x * 0.015 + z * 0.02));

    const micro = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 0.14;
    const inlandHeight = 0.42 + ruralWave + sideHill + micro;

    return baseAt75 * (1 - blend) + inlandHeight * blend;
  }

  // Defines the continuous Freetown -> Countryside -> Bo Highway centerline Z coordinate for any X
  public static getHighwayCenterZ(x: number): number {
    if (x <= 95) return 0;
    if (x >= 1060) return 0;
    const t = (x - 95) / (1060 - 95); // 0 at Freetown East exit, 1 at Bo West Gate
    const envelope = Math.sin(t * Math.PI); // Smoothly 0 at both city ends
    return (
      envelope *
      (Math.sin(t * Math.PI * 3.0) * 26.0 + Math.sin(t * Math.PI * 6.0) * 9.0)
    );
  }

  // Analytical derivative dZ/dX of the highway centerline for road & traffic orientation
  public static getHighwaySlopeZ(x: number): number {
    if (x <= 95 || x >= 1060) return 0;
    const eps = 1.0;
    return (
      (EnvironmentSystem.getHighwayCenterZ(x + eps) -
        EnvironmentSystem.getHighwayCenterZ(x - eps)) /
      (2 * eps)
    );
  }

  private buildTerrain(scene: THREE.Scene): void {
    // Freetown terrain spans X in [-140, +100] and Z in [-140, +140] so it meets Streamed Chunk 1 (X in [100, 200]) cleanly with zero overlap!
    const widthX = 240;
    const depthZ = 280;
    const segX = 96;
    const segZ = 112;
    const geo = new THREE.PlaneGeometry(widthX, depthZ, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    geo.translate(-20, 0, 0); // Shifts X from [-120, +120] to [-140, +100]

    const pos = geo.attributes.position;
    const colors: number[] = [];

    const lateriteColor = new THREE.Color(0xb56539);
    const sandyBrownColor = new THREE.Color(0xc9885b);
    const muddyPatchColor = new THREE.Color(0x784426);
    const lushGrassColor = new THREE.Color(0x466e2f);

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const vy = EnvironmentSystem.getTerrainHeight(vx, vz);
      pos.setY(i, vy);

      const roadProximity = Math.min(
        Math.abs(vz),
        Math.abs(vz + 59),
        Math.abs(vx + 23.5),
        Math.abs(vx - 27.5)
      );

      const noise =
        Math.sin(vx * 0.12) * 0.5 +
        Math.cos(vz * 0.14) * 0.5 +
        Math.sin((vx + vz) * 0.07) * 0.35;

      const c = new THREE.Color();
      if (roadProximity < 6.5) {
        c.lerpColors(lateriteColor, muddyPatchColor, 0.35);
      } else if (roadProximity < 14) {
        c.lerpColors(lateriteColor, sandyBrownColor, 0.5 + noise * 0.25);
      } else if (noise > 0.18 || Math.hypot(vx, vz) > 68) {
        c.lerpColors(lushGrassColor, lateriteColor, 0.22);
      } else {
        c.lerpColors(sandyBrownColor, lushGrassColor, 0.42);
      }

      colors.push(c.r, c.g, c.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const microTex = ProceduralTextures.getTerrainMicroDetailTexture();
    this.terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: microTex,
      roughness: 0.94,
      metalness: 0.02,
    });

    const terrainMesh = new THREE.Mesh(geo, this.terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
  }

  private buildCurvedPalmTrunkGeometry(): THREE.BufferGeometry {
    const geo = new THREE.CylinderGeometry(0.13, 0.29, 7.2, 10, 10);
    geo.translate(0, 3.6, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = y / 7.2;
      const curveX = Math.sin(t * Math.PI * 0.85) * 0.32;
      const ringSwell = 1 + Math.sin(y * 9.0) * 0.04;
      pos.setX(i, pos.getX(i) * ringSwell + curveX);
      pos.setZ(i, pos.getZ(i) * ringSwell);
    }
    geo.computeVertexNormals();
    return geo;
  }

  private buildArchedPalmFrondGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BoxGeometry(0.76, 0.04, 3.8, 4, 1, 8);
    geo.translate(0, 0, 1.9);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const t = z / 3.8;
      const widthProfile = Math.sin(t * Math.PI) * 1.15;
      const archY = Math.sin(t * Math.PI * 0.75) * 0.65 - t * t * 1.15;
      const ribDrop = -Math.abs(x) * 0.22;
      pos.setX(i, x * widthProfile);
      pos.setY(i, pos.getY(i) + archY + ribDrop);
    }
    geo.translate(0, 7.05, 0);
    geo.computeVertexNormals();
    return geo;
  }

  private buildTropicalTreesInstanced(scene: THREE.Scene): void {
    // Audited palm positions outside all roads and house footprints
    const palmPositions: [number, number, number][] = [
      [-7.8, -7.2, 1.12],  // Front-west corner outside No. 22 Williams St
      [-6.5, -25.0, 1.05], // Back yard palm behind No. 22
      [7.8, -25.0, 1.15],  // Between No. 22 and No. 24 rear yards
      [23.2, -10.5, 1.08], // Roadside palm along East Fonima St
      [-29.5, -18.5, 0.98],
      [-45.0, -11.5, 1.12],
      [-62.0, 14.0, 1.04],
      [-20.0, 16.5, 1.18],
      [-9.0, 11.5, 1.05],
      [10.5, 22.0, 1.02],
      [52.0, 18.0, 1.15],
      [56.0, -16.0, 1.08],
      [52.0, -46.0, 1.2],
      [-34.0, -48.0, 1.05],
      [-52.0, 44.0, 1.1],
      [14.0, 50.0, 0.96],
      [66.0, 26.0, 1.12],
      [-72.0, -25.0, 1.05],
      [4.0, -66.0, 1.15],
      [74.0, -34.0, 1.0],
      [-18.0, 62.0, 1.1],
      [22.0, -48.0, 1.1],
    ];

    const barkTex = ProceduralTextures.getPalmBarkTexture();
    const trunkMat = new THREE.MeshStandardMaterial({
      map: barkTex,
      roughness: 0.92,
    });
    const frondMat = new THREE.MeshStandardMaterial({
      color: 0x366923,
      roughness: 0.72,
      side: THREE.DoubleSide,
    });

    const trunkGeo = this.buildCurvedPalmTrunkGeometry();
    const palmTrunkInst = new THREE.InstancedMesh(
      trunkGeo,
      trunkMat,
      palmPositions.length
    );
    palmTrunkInst.castShadow = true;
    palmTrunkInst.receiveShadow = true;

    const frondsPerPalm = 9;
    const frondGeo = this.buildArchedPalmFrondGeometry();

    this.palmFrondInst = new THREE.InstancedMesh(
      frondGeo,
      frondMat,
      palmPositions.length * frondsPerPalm
    );
    this.palmFrondInst.castShadow = true;

    let frondIdx = 0;

    palmPositions.forEach(([px, pz, scale], idx) => {
      const py = EnvironmentSystem.getTerrainHeight(px, pz) - 0.15;
      this.dummy.position.set(px, py, pz);
      this.dummy.rotation.set(0, idx * 1.3, 0);
      this.dummy.scale.set(scale, scale, scale);
      this.dummy.updateMatrix();
      palmTrunkInst.setMatrixAt(idx, this.dummy.matrix);

      this.palmBases.push({
        x: px,
        y: py,
        z: pz,
        scale,
        phase: idx * 0.85,
        frondIndexStart: frondIdx,
      });

      this.colliders.push({
        id: `palm_${idx}`,
        minX: px - 0.32,
        maxX: px + 0.32,
        minZ: pz - 0.32,
        maxZ: pz + 0.32,
        minY: py,
        maxY: py + 7 * scale,
      });

      for (let f = 0; f < frondsPerPalm; f++) {
        this.dummy.position.set(px, py, pz);
        this.dummy.rotation.set(
          (f % 2) * 0.14 - 0.06,
          (f * Math.PI * 2) / frondsPerPalm + idx * 0.5,
          0
        );
        this.dummy.scale.set(scale, scale, scale);
        this.dummy.updateMatrix();
        this.palmFrondInst.setMatrixAt(frondIdx++, this.dummy.matrix);
      }
    });

    scene.add(palmTrunkInst);
    scene.add(this.palmFrondInst);

    // 2. Multi-Layered Mango & Breadfruit Shade Trees
    const shadeTreePositions: [number, number, number][] = [
      [7.8, -26.5, 1.22],
      [23.2, -25.0, 1.18],
      [-29.0, -8.5, 1.12],
      [-10.5, 11.0, 1.2],
      [20.0, 13.0, 1.25],
      [-48.0, 18.0, 1.25],
      [54.0, -22.0, 1.3],
      [-54.0, -36.0, 1.18],
      [-8.0, 44.0, 1.25],
      [38.0, 42.0, 1.2],
      [-32.0, -65.5, 1.32],
      [12.0, -65.5, 1.28],
      [54.0, -65.5, 1.25],
      [58.0, 8.0, 1.15],
      [-66.0, 6.0, 1.25],
      [-46.0, 56.0, 1.3],
    ];

    const mangoTrunkGeo = new THREE.CylinderGeometry(0.26, 0.48, 4.0, 9);
    mangoTrunkGeo.translate(0, 1.8, 0);

    const subCrownsPerTree = 4;
    const crownOffsets: [number, number, number, number][] = [
      [0, 4.8, 0, 1.15],
      [-1.35, 4.1, 0.85, 0.88],
      [1.35, 4.2, -0.75, 0.92],
      [0.2, 4.0, -1.35, 0.85],
    ];

    const mangoCanopyGeo = new THREE.IcosahedronGeometry(2.2, 2);
    const cPos = mangoCanopyGeo.attributes.position;
    for (let i = 0; i < cPos.count; i++) {
      const vx = cPos.getX(i);
      const vy = cPos.getY(i);
      const vz = cPos.getZ(i);
      const bump = 1 + Math.sin(vx * 2.5) * Math.cos(vz * 2.5) * 0.12;
      cPos.setXYZ(i, vx * bump * 1.18, vy * bump * 0.82, vz * bump * 1.18);
    }
    mangoCanopyGeo.computeVertexNormals();

    const mangoCanopyMat = new THREE.MeshStandardMaterial({
      color: 0x2b5c20,
      roughness: 0.85,
    });

    const shadeTrunkInst = new THREE.InstancedMesh(
      mangoTrunkGeo,
      trunkMat,
      shadeTreePositions.length
    );
    this.shadeCanopyInst = new THREE.InstancedMesh(
      mangoCanopyGeo,
      mangoCanopyMat,
      shadeTreePositions.length * subCrownsPerTree
    );
    shadeTrunkInst.castShadow = true;
    this.shadeCanopyInst.castShadow = true;
    this.shadeCanopyInst.receiveShadow = true;

    let canopyIdx = 0;
    shadeTreePositions.forEach(([tx, tz, scale], idx) => {
      const ty = EnvironmentSystem.getTerrainHeight(tx, tz);
      this.shadeTreeBases.push({ x: tx, y: ty, z: tz, scale, phase: idx * 0.7 });

      this.dummy.position.set(tx, ty, tz);
      this.dummy.rotation.set(0, idx * 0.9, 0);
      this.dummy.scale.set(scale, scale, scale);
      this.dummy.updateMatrix();
      shadeTrunkInst.setMatrixAt(idx, this.dummy.matrix);

      for (let c = 0; c < subCrownsPerTree; c++) {
        const [ox, oy, oz, cs] = crownOffsets[c];
        this.dummy.position.set(
          tx + ox * scale,
          ty + oy * scale,
          tz + oz * scale
        );
        this.dummy.rotation.set(0, idx + c * 1.2, 0);
        this.dummy.scale.set(scale * cs, scale * cs, scale * cs);
        this.dummy.updateMatrix();
        this.shadeCanopyInst.setMatrixAt(canopyIdx++, this.dummy.matrix);
      }

      this.colliders.push({
        id: `shade_tree_${idx}`,
        minX: tx - 0.45 * scale,
        maxX: tx + 0.45 * scale,
        minZ: tz - 0.45 * scale,
        maxZ: tz + 0.45 * scale,
        minY: ty,
        maxY: ty + 6 * scale,
      });
    });

    scene.add(shadeTrunkInst);
    scene.add(this.shadeCanopyInst);

    // 3. Wind-Animated Tropical Shrubs (outside roads & compounds)
    const bushGeo = new THREE.IcosahedronGeometry(0.95, 1);
    bushGeo.scale(1.25, 0.78, 1.25);
    bushGeo.translate(0, 0.45, 0);
    const bushMat = new THREE.MeshStandardMaterial({
      color: 0x43752c,
      roughness: 0.86,
    });

    const bushCoords: [number, number, number][] = [
      [-7.8, -6.2, 1.1],
      [7.8, -6.5, 0.95],
      [-19.5, 7.5, 1.15],
      [11.5, 8.2, 1.05],
      [23.2, -7.5, 1.1],
      [-30.0, -7.2, 1.0],
      [50.0, 9.0, 1.2],
      [-19.5, -26.5, 1.1],
      [16.0, 28.0, 1.05],
      [-48.0, -24.0, 1.2],
      [35.0, 28.0, 0.95],
      [-12.0, 25.0, 1.1],
      [5.0, -25.5, 1.15],
      [-8.0, -25.5, 1.0],
      [23.0, -27.5, 1.2],
      [-30.0, 26.0, 1.1],
    ];

    this.bushInst = new THREE.InstancedMesh(
      bushGeo,
      bushMat,
      bushCoords.length
    );
    this.bushInst.castShadow = true;
    this.bushInst.receiveShadow = true;

    bushCoords.forEach(([bx, bz, s], i) => {
      const by = EnvironmentSystem.getTerrainHeight(bx, bz);
      this.bushBases.push({ x: bx, y: by, z: bz, scale: s, phase: i * 1.3 });
      this.dummy.position.set(bx, by, bz);
      this.dummy.rotation.set(0, i * 1.7, 0);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      this.bushInst.setMatrixAt(i, this.dummy.matrix);
    });

    scene.add(this.bushInst);

    // 4. Roadside Grass Tuft Clusters along road shoulders
    const tuftGeo = new THREE.ConeGeometry(0.26, 0.5, 5);
    tuftGeo.translate(0, 0.22, 0);
    const tuftMat = new THREE.MeshStandardMaterial({
      color: 0x4f7d32,
      roughness: 0.9,
    });

    const tuftCoords: [number, number, number][] = [];
    for (let i = 0; i < 48; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const gx = -65 + (i / 48) * 130;
      // Avoid cross-street intersections at X=-23.5 and X=27.5
      if (Math.abs(gx - -23.5) < 5 || Math.abs(gx - 27.5) < 5) continue;
      // Avoid compound gate entrances at X=0, X=-13.8, X=15.6, X=41.5
      if (
        Math.abs(gx) < 2.8 ||
        Math.abs(gx - -13.8) < 2.8 ||
        Math.abs(gx - 15.6) < 2.8 ||
        Math.abs(gx - 41.5) < 2.8
      )
        continue;
      const gz = side * (4.8 + (i % 3) * 0.4);
      tuftCoords.push([gx, gz, 0.65 + (i % 4) * 0.18]);
    }

    this.grassTuftInst = new THREE.InstancedMesh(
      tuftGeo,
      tuftMat,
      tuftCoords.length
    );
    tuftCoords.forEach(([gx, gz, gs], idx) => {
      const gy = EnvironmentSystem.getTerrainHeight(gx, gz);
      const rotY = idx * 1.1;
      this.grassTuftBases.push({ x: gx, y: gy, z: gz, scale: gs, rotY });
      this.dummy.position.set(gx, gy, gz);
      this.dummy.rotation.set(0, rotY, 0);
      this.dummy.scale.set(gs, gs, gs);
      this.dummy.updateMatrix();
      this.grassTuftInst.setMatrixAt(idx, this.dummy.matrix);
    });
    scene.add(this.grassTuftInst);
  }

  // Creates radial warm ground-light pool texture for street lights
  private createGroundLightPoolTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0.0, 'rgba(255, 198, 105, 0.72)');
    grad.addColorStop(0.45, 'rgba(255, 168, 72, 0.32)');
    grad.addColorStop(1.0, 'rgba(255, 150, 50, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Builds 14 realistic, functional street-light poles along Williams St, Fonima Drive, East Fonima St & Peninsula Rd
  private buildFunctionalStreetLights(scene: THREE.Scene): void {
    const poleMetalMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.45,
      metalness: 0.7,
    });
    const baseConcreteMat = new THREE.MeshStandardMaterial({
      color: 0x8d8983,
      roughness: 0.9,
    });
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.6,
    });

    this.streetBulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff7ed,
      emissive: new THREE.Color(0xffb347),
      emissiveIntensity: 0.0,
      roughness: 0.15,
    });

    this.streetHaloMat = new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });

    const poolTex = this.createGroundLightPoolTexture();
    this.groundPoolMat = new THREE.MeshBasicMaterial({
      map: poolTex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -7,
      polygonOffsetUnits: -7,
    });

    // Each placement: [x, z, armRotationY] where armRotationY points the lamp overhang out over the road surface
    // - armRotationY = 0 means arm extends along +Z (South over road)
    // - armRotationY = PI means arm extends along -Z (North over road)
    // - armRotationY = PI/2 means arm extends along +X (East over road)
    // - armRotationY = -PI/2 means arm extends along -X (West over road)
    const streetLightPlacements: [number, number, number][] = [
      // Williams Street (spaced ~22m apart along the roadside curb, outside road & gates)
      [-64.0, -4.6, 0],         // West Williams St (North curb facing road)
      [-42.0, 4.6, Math.PI],    // Mid-West Williams St (South curb facing road)
      [-18.5, -4.6, 0],         // Fonima Junction West (North curb facing road)
      [3.5, -4.6, 0],           // Right outside No. 22 Williams Street Gate!
      [21.5, 4.6, Math.PI],     // Outside No. 24 / No. 21 Williams Street
      [46.0, -4.6, 0],          // Outside No. 26 Williams Street
      [68.0, 4.6, Math.PI],     // East Williams Street

      // Fonima Drive (Cross Street along X = -23.5)
      [-27.2, -38.0, Math.PI / 2],
      [-19.8, -14.0, -Math.PI / 2],
      [-27.2, 18.0, Math.PI / 2],
      [-19.8, 42.0, -Math.PI / 2],

      // East Fonima Street (along X = +27.5)
      [31.2, -36.0, -Math.PI / 2],
      [31.2, 18.0, -Math.PI / 2],

      // Peninsula Road (Main Road along Z = -59.0)
      [-12.0, -53.8, Math.PI],
    ];

    const poleGeo = new THREE.CylinderGeometry(0.08, 0.13, 6.2, 10);
    poleGeo.translate(0, 3.1, 0);

    const plinthGeo = new THREE.CylinderGeometry(0.19, 0.22, 1.1, 10);
    plinthGeo.translate(0, 0.15, 0); // Sunk 0.4m below ground up to +0.7m above ground

    const poolGeo = new THREE.PlaneGeometry(13.5, 13.5, 8, 8);
    poolGeo.rotateX(-Math.PI / 2);

    streetLightPlacements.forEach(([px, pz, rotY], idx) => {
      const py = EnvironmentSystem.getTerrainHeight(px, pz);
      const group = new THREE.Group();
      group.position.set(px, py, pz);
      group.rotation.y = rotY;

      const plinth = new THREE.Mesh(plinthGeo, baseConcreteMat);
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      group.add(plinth);

      const pole = new THREE.Mesh(poleGeo, poleMetalMat);
      pole.castShadow = true;
      pole.receiveShadow = true;
      group.add(pole);

      // Overhanging mast arm extending +1.45m along local +Z over the road
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.055, 1.65, 8),
        poleMetalMat
      );
      arm.rotation.x = Math.PI / 2 - 0.22;
      arm.position.set(0, 6.05, 0.72);
      group.add(arm);

      // Cobra-head street lamp housing
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.1, 0.56),
        housingMat
      );
      housing.position.set(0, 6.22, 1.48);
      group.add(housing);

      // Glowing emissive LED lens on underside of housing
      const bulb = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.045, 0.44),
        this.streetBulbMat
      );
      bulb.position.set(0, 6.16, 1.48);
      group.add(bulb);

      // Soft warm glow halo around the lamp head (visible at night)
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 10, 10),
        this.streetHaloMat
      );
      halo.position.set(0, 6.1, 1.48);
      halo.visible = false;
      group.add(halo);

      scene.add(group);

      // Compute exact world coordinates of the overhanging lamp head
      const lampWorldX = px + Math.sin(rotY) * 1.48;
      const lampWorldZ = pz + Math.cos(rotY) * 1.48;
      const lampWorldY = py + 6.05;

      // Terrain-conforming warm road illumination pool underneath the lamp
      const thisPoolGeo = poolGeo.clone();
      const pAttr = thisPoolGeo.attributes.position;
      for (let i = 0; i < pAttr.count; i++) {
        const lx = pAttr.getX(i);
        const lz = pAttr.getZ(i);
        const wx = lampWorldX + lx;
        const wz = lampWorldZ + lz;
        pAttr.setY(i, EnvironmentSystem.getTerrainHeight(wx, wz) + 0.155);
      }
      const poolMesh = new THREE.Mesh(thisPoolGeo, this.groundPoolMat);
      poolMesh.position.set(lampWorldX, 0, lampWorldZ);
      poolMesh.renderOrder = 7;
      poolMesh.visible = false;
      scene.add(poolMesh);

      this.streetLightNodes.push({
        id: `street_light_${idx}`,
        lampWorldPos: new THREE.Vector3(lampWorldX, lampWorldY, lampWorldZ),
        groundPoolMesh: poolMesh,
        haloMesh: halo,
      });

      this.colliders.push({
        id: `streetlight_pole_${idx}`,
        minX: px - 0.22,
        maxX: px + 0.22,
        minZ: pz - 0.22,
        maxZ: pz + 0.22,
        minY: py - 0.5,
        maxY: py + 6.4,
      });
    });

    // Create pool of 8 real-time PointLights for nearby dynamic illumination on Android
    for (let i = 0; i < this.maxPooledLights; i++) {
      const pt = new THREE.PointLight(0xffa83b, 0.0, 26.0, 1.38);
      pt.castShadow = false;
      scene.add(pt);
      this.activePointLightPool.push(pt);
    }
  }

  // Updates street light activation (0 = DAY / OFF, 1 = NIGHT / ON) and assigns pooled dynamic lights to nearest poles across Freetown, Highway, and Bo
  public updateStreetLightsAndWetness(
    lightActivation: number,
    wetness: number,
    focusPos: THREE.Vector3,
    extraStreetLightPositions: THREE.Vector3[] = []
  ): void {
    this.terrainMat.roughness = 0.94 - wetness * 0.35;
    this.terrainMat.metalness = 0.02 + wetness * 0.16;

    const clampedAct = Number.isFinite(lightActivation)
      ? Math.max(0, Math.min(1, lightActivation))
      : 0;
    const isActive = clampedAct > 0.02;

    this.streetBulbMat.emissiveIntensity = clampedAct * 3.8;
    this.streetHaloMat.opacity = clampedAct * 0.38;
    this.groundPoolMat.opacity = clampedAct * (0.68 + wetness * 0.22);

    for (let i = 0; i < this.streetLightNodes.length; i++) {
      const node = this.streetLightNodes[i];
      node.groundPoolMesh.visible = isActive;
      node.haloMesh.visible = isActive;
    }

    if (!isActive) {
      for (let i = 0; i < this.activePointLightPool.length; i++) {
        this.activePointLightPool[i].intensity = 0;
      }
      return;
    }

    // Combine Freetown street light positions + currently streamed Highway & Bo City street light positions
    const allLampPositions: THREE.Vector3[] = [
      ...this.streetLightNodes.map((n) => n.lampWorldPos),
      ...extraStreetLightPositions,
    ];

    allLampPositions.sort(
      (a, b) => a.distanceToSquared(focusPos) - b.distanceToSquared(focusPos)
    );

    for (let i = 0; i < this.maxPooledLights; i++) {
      const pt = this.activePointLightPool[i];
      if (i < allLampPositions.length) {
        pt.position.copy(allLampPositions[i]);
        pt.intensity = clampedAct * 38.0; // High candela output so roads, player, and walls visibly glow!
      } else {
        pt.intensity = 0;
      }
    }
  }

  public updateWindAnimation(
    dt: number,
    weather: WeatherCondition = 'clear'
  ): void {
    const windMult =
      weather === 'heavy_rain' ? 2.4 : weather === 'rain' ? 1.65 : 1.0;
    this.windTime += dt * 1.5 * windMult;
    const frondsPerPalm = 9;

    for (let p = 0; p < this.palmBases.length; p++) {
      const base = this.palmBases[p];
      const sway = Math.sin(this.windTime + base.phase) * 0.042 * windMult;
      for (let f = 0; f < frondsPerPalm; f++) {
        this.dummy.position.set(base.x, base.y, base.z);
        this.dummy.rotation.set(
          (f % 2) * 0.14 - 0.06 + sway,
          (f * Math.PI * 2) / frondsPerPalm + p * 0.5,
          sway * 0.55
        );
        this.dummy.scale.set(base.scale, base.scale, base.scale);
        this.dummy.updateMatrix();
        this.palmFrondInst.setMatrixAt(
          base.frondIndexStart + f,
          this.dummy.matrix
        );
      }
    }
    this.palmFrondInst.instanceMatrix.needsUpdate = true;

    for (let b = 0; b < this.bushBases.length; b++) {
      const bb = this.bushBases[b];
      const bSway =
        Math.sin(this.windTime * 1.15 + bb.phase) * 0.032 * windMult;
      this.dummy.position.set(bb.x, bb.y, bb.z);
      this.dummy.rotation.set(bSway, b * 1.7, bSway * 0.5);
      this.dummy.scale.set(bb.scale, bb.scale, bb.scale);
      this.dummy.updateMatrix();
      this.bushInst.setMatrixAt(b, this.dummy.matrix);
    }
    this.bushInst.instanceMatrix.needsUpdate = true;

    for (let g = 0; g < this.grassTuftBases.length; g++) {
      const gb = this.grassTuftBases[g];
      const gSway = Math.sin(this.windTime * 1.8 + g * 0.5) * 0.06 * windMult;
      this.dummy.position.set(gb.x, gb.y, gb.z);
      this.dummy.rotation.set(gSway, gb.rotY, 0);
      this.dummy.scale.set(gb.scale, gb.scale, gb.scale);
      this.dummy.updateMatrix();
      this.grassTuftInst.setMatrixAt(g, this.dummy.matrix);
    }
    this.grassTuftInst.instanceMatrix.needsUpdate = true;
  }

  private buildRoadsidePropsAndWires(scene: THREE.Scene): void {
    // 1. Unfinished Concrete Foundation Ruins (Placed cleanly North of North Access Track at X = -36, Z = -42)
    const ruinX = -36.0;
    const ruinZ = -42.0;
    const ruinY = EnvironmentSystem.getTerrainHeight(ruinX, ruinZ);
    const blockMat = new THREE.MeshStandardMaterial({
      color: 0x8a847c,
      roughness: 0.94,
    });

    const foundationWallCoords: [number, number, number, number][] = [
      [0, -4.2, 9.0, 0.3],
      [0, 4.2, 9.0, 0.3],
      [-4.35, 0, 0.3, 8.4],
      [4.35, 0, 0.3, 8.4],
      [0, 0, 8.7, 0.25],
    ];
    foundationWallCoords.forEach(([ox, oz, w, d], i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), blockMat);
      m.position.set(ruinX + ox, ruinY + 0.25, ruinZ + oz);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      this.colliders.push({
        id: `ruin_foundation_${i}`,
        minX: ruinX + ox - w / 2,
        maxX: ruinX + ox + w / 2,
        minZ: ruinZ + oz - d / 2,
        maxZ: ruinZ + oz + d / 2,
        minY: ruinY - 0.5,
        maxY: ruinY + 0.95,
      });
    });

    // 2. Elevated Black Polyethylene Water Tank ("Milla Tank") behind No. 24
    const tankX = 20.5;
    const tankZ = -25.2;
    const tankY = EnvironmentSystem.getTerrainHeight(tankX, tankZ);
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.4, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x8d8983, roughness: 0.9 })
    );
    plinth.position.set(tankX, tankY + 0.6, tankZ);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    scene.add(plinth);

    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 2.1, 12),
      new THREE.MeshStandardMaterial({
        color: 0x1a1e24,
        roughness: 0.38,
        metalness: 0.15,
      })
    );
    tank.position.set(tankX, tankY + 2.85, tankZ);
    tank.castShadow = true;
    scene.add(tank);

    this.colliders.push({
      id: 'water_tank_plinth',
      minX: tankX - 1.15,
      maxX: tankX + 1.15,
      minZ: tankZ - 1.15,
      maxZ: tankZ + 1.15,
      minY: tankY - 0.5,
      maxY: tankY + 4.0,
    });

    // 3. Community Water Well near Fonima Drive South
    const wellX = -18.5;
    const wellZ = 14.5;
    const wellY = EnvironmentSystem.getTerrainHeight(wellX, wellZ);
    const wellGroup = new THREE.Group();
    const wellBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.2, 1.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x99948d, roughness: 0.92 })
    );
    wellBase.position.y = 0.2;
    wellBase.castShadow = true;
    wellBase.receiveShadow = true;
    wellGroup.add(wellBase);

    const pumpPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6),
      new THREE.MeshStandardMaterial({
        color: 0x455a64,
        metalness: 0.7,
        roughness: 0.3,
      })
    );
    pumpPipe.position.set(0, 1.1, 0);
    wellGroup.add(pumpPipe);

    wellGroup.position.set(wellX, wellY, wellZ);
    scene.add(wellGroup);

    this.colliders.push({
      id: 'community_well',
      minX: wellX - 1.15,
      maxX: wellX + 1.15,
      minZ: wellZ - 1.15,
      maxZ: wellZ + 1.15,
      minY: wellY - 0.5,
      maxY: wellY + 1.8,
    });

    this.interactables.push({
      id: 'interact_well',
      title: 'Fonima Community Water Well',
      subtitle: 'Concrete hand-pump well with yellow water jerrycans',
      position: new THREE.Vector3(wellX, wellY + 1.0, wellZ),
      radius: 3.2,
      type: 'well',
      onInteract: () =>
        'Fonima Community Well: Cool groundwater drawn from the Goderich hillside aquifer.',
    });
  }

  private buildNeighborhoodSignboards(scene: THREE.Scene): void {
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.65,
      roughness: 0.4,
    });

    const addRoadsideSign = (
      id: string,
      x: number,
      z: number,
      rotY: number,
      title: string,
      subtitle: string,
      bgColor: string,
      accentColor: string,
      description: string
    ) => {
      const y = EnvironmentSystem.getTerrainHeight(x, z);
      const group = new THREE.Group();
      group.position.set(x, y, z);
      group.rotation.y = rotY;

      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 2.6, 8),
        postMat
      );
      post.position.y = 1.05;
      post.castShadow = true;
      group.add(post);

      const signTex = ProceduralTextures.getSignboardTexture(
        title,
        subtitle,
        bgColor,
        '#ffffff',
        accentColor
      );
      const boardMat = new THREE.MeshStandardMaterial({
        map: signTex,
        roughness: 0.55,
        metalness: 0.2,
      });

      const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.45, 0.54, 0.06),
        boardMat
      );
      board.position.y = 2.15;
      board.castShadow = true;
      group.add(board);

      scene.add(group);

      this.interactables.push({
        id: `sign_${id}`,
        title: `${title} Signboard`,
        subtitle,
        position: new THREE.Vector3(x, y + 1.5, z),
        radius: 3.2,
        type: 'sign',
        onInteract: () => description,
      });
    };

    // 1. Williams Street Sign near No. 22 / Fonima Junction
    addRoadsideSign(
      'williams_st',
      -7.5,
      -4.8,
      0.15,
      'Williams Street',
      'Fonima · Goderich, Freetown',
      '#153e75',
      '#fbbf24',
      'Official Street Sign: Williams Street, Fonima — Residential neighborhood in Goderich, Western Area Urban, Freetown.'
    );

    // 2. No. 22 Williams Street Gate Pillar Address Sign
    addRoadsideSign(
      'no22_address',
      2.4,
      -7.8,
      0.0,
      'No. 22 Williams St',
      'Fonima Compound · Freetown',
      '#1e293b',
      '#f59e0b',
      'No. 22 Williams Street, Fonima: Primary residential compound featuring L-wing bungalow, veranda, and shaded courtyard.'
    );

    // 3. Delorny Preparatory School Signboard
    addRoadsideSign(
      'delorny_school',
      33.5,
      -36.5,
      -0.35,
      'Delorny Prep School',
      'Fonima · Nursery & Primary',
      '#1e3a8a',
      '#38bdf8',
      'Delorny Preparatory School Signboard: Educating children across Fonima and Goderich.'
    );

    // 4. Peninsula Road Directional Signboard
    addRoadsideSign(
      'peninsula_rd',
      -19.5,
      -53.5,
      0.05,
      'Peninsula Road',
      '← Lumley  |  York / Tokeh →',
      '#065f46',
      '#fbbf24',
      'Freetown Peninsula Highway: Connects Goderich & Fonima north toward Lumley Beach and south toward Tokeh.'
    );
  }

  public setNightAndWetness(
    streetLightActivation: boolean | number = 0,
    wetness: number = 0,
    focusPos?: THREE.Vector3
  ): void {
    const numAct =
      typeof streetLightActivation === 'boolean'
        ? streetLightActivation
          ? 1.0
          : 0.0
        : Number.isFinite(streetLightActivation)
          ? streetLightActivation
          : 0.0;
    this.updateStreetLightsAndWetness(
      numAct,
      Number.isFinite(wetness) ? wetness : 0,
      focusPos || new THREE.Vector3(0, 0, 0)
    );
  }
}
