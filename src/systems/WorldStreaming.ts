import * as THREE from 'three';
import { ColliderBox, InteractiveObject, RegionId } from './GameState';
import { EnvironmentSystem } from './Environment';
import { ProceduralTextures } from './ProceduralTextures';

interface StreamedChunk {
  index: number;
  xStart: number;
  xEnd: number;
  group: THREE.Group;
  colliders: ColliderBox[];
  interactables: InteractiveObject[];
  streetLightLampPositions: THREE.Vector3[];
  streetLightHalos: THREE.Mesh[];
  streetLightGroundPools: THREE.Mesh[];
}

export class WorldStreamingSystem {
  private scene: THREE.Scene;
  private chunks: Map<number, StreamedChunk> = new Map();
  private readonly chunkWidth = 100; // Each streamed section is 100m wide along X (Indices 1..13 -> X in [100, 1400])
  private readonly maxStreamIndex = 13;

  // Shared optimized materials across all streamed chunks (zero per-building or per-tree material allocations!)
  private asphaltMat: THREE.MeshStandardMaterial;
  private asphaltCrossMat: THREE.MeshStandardMaterial;
  private lateriteShoulderMat: THREE.MeshStandardMaterial;
  private dashLineMat: THREE.MeshBasicMaterial;
  private streetBulbMat: THREE.MeshStandardMaterial;
  private streetHaloMat: THREE.MeshBasicMaterial;
  private groundPoolMat: THREE.MeshBasicMaterial;
  private windowGlowMat: THREE.MeshStandardMaterial;
  private terrainMat: THREE.MeshStandardMaterial;
  private plinthMat: THREE.MeshStandardMaterial;
  private poleMat: THREE.MeshStandardMaterial;
  private treeTrunkMat: THREE.MeshStandardMaterial;
  private treeCanopyMat: THREE.MeshStandardMaterial;
  private wallMatCache: Map<string, THREE.MeshStandardMaterial> = new Map();
  private roofMatCache: Map<string, THREE.MeshStandardMaterial> = new Map();
  private signMatCache: Map<string, THREE.MeshStandardMaterial> = new Map();

  // Shared primitive geometries for trees & streetlights
  private treeTrunkGeo: THREE.CylinderGeometry;
  private treeCrownGeo: THREE.DodecahedronGeometry;
  private poleGeo: THREE.CylinderGeometry;
  private poleArmGeo: THREE.BoxGeometry;
  private poleBulbGeo: THREE.BoxGeometry;
  private poleHaloGeo: THREE.SphereGeometry;
  private groundPoolGeo: THREE.PlaneGeometry;

  // Lightweight distant skyline silhouette for Bo City & Highway Hills
  private distantBoSkylineGroup: THREE.Group;

  // Active aggregated colliders, interactables & street lights from currently loaded chunks
  public activeColliders: ColliderBox[] = [];
  public activeInteractables: InteractiveObject[] = [];
  public activeStreetLightPositions: THREE.Vector3[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const asphaltTex = ProceduralTextures.getAsphaltRoadTexture();
    this.asphaltMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.82,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    });

    this.asphaltCrossMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.82,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    this.lateriteShoulderMat = new THREE.MeshStandardMaterial({
      color: 0xb45d32,
      roughness: 0.94,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.dashLineMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });

    this.streetBulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff8e7,
      emissive: new THREE.Color(0xffb347),
      emissiveIntensity: 0.0,
      roughness: 0.15,
    });

    this.streetHaloMat = new THREE.MeshBasicMaterial({
      color: 0xffb84d,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });

    const poolTex = ProceduralTextures.getLightPoolGradientTexture();
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

    this.windowGlowMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: new THREE.Color(0xffb74d),
      emissiveIntensity: 0.0,
      roughness: 0.25,
      metalness: 0.6,
    });

    const microTex = ProceduralTextures.getTerrainMicroDetailTexture();
    this.terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: microTex,
      roughness: 0.94,
      metalness: 0.02,
    });

    this.plinthMat = new THREE.MeshStandardMaterial({
      color: 0x6e6a64,
      roughness: 0.92,
    });
    this.poleMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.65,
      roughness: 0.35,
    });
    this.treeTrunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c4632,
      roughness: 0.9,
    });
    this.treeCanopyMat = new THREE.MeshStandardMaterial({
      color: 0x2f6322,
      roughness: 0.78,
    });

    this.treeTrunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 4.8, 7);
    this.treeCrownGeo = new THREE.DodecahedronGeometry(2.3, 1);
    this.poleGeo = new THREE.CylinderGeometry(0.065, 0.095, 6.2, 8);
    this.poleArmGeo = new THREE.BoxGeometry(0.06, 0.06, 1.4);
    this.poleBulbGeo = new THREE.BoxGeometry(0.26, 0.05, 0.42);
    this.poleHaloGeo = new THREE.SphereGeometry(0.4, 8, 8);
    this.groundPoolGeo = new THREE.PlaneGeometry(11.0, 11.0);
    this.groundPoolGeo.rotateX(-Math.PI / 2);

    // Build Freetown-East Tollgate & Highway Connector Sign at X = 86 (always visible at edge of Freetown)
    this.buildFreetownHighwayGateway();

    // Build low-poly distant LOD horizon silhouette for Bo City & Kasewe Hills
    this.distantBoSkylineGroup = this.buildDistantHorizonLOD();
    this.scene.add(this.distantBoSkylineGroup);
  }

  public static getRegionForX(x: number): { id: RegionId; label: string } {
    if (x <= 115) {
      return { id: 'FREETOWN', label: 'Goodrich / Fonima · Freetown' };
    }
    if (x <= 360) {
      return {
        id: 'HIGHWAY_WEST',
        label: 'Freetown–Bo Highway · Songo Corridor',
      };
    }
    if (x <= 880) {
      return {
        id: 'RURAL_CORRIDOR',
        label: 'Rural Sierra Leone · Mile 91 & Sewa River',
      };
    }
    if (x < 1070) {
      return {
        id: 'BO_APPROACH',
        label: 'Bo Outskirts · Southern Province',
      };
    }
    return {
      id: 'BO_CITY',
      label: 'Bo City · Southern Province Capital',
    };
  }

  public getLoadedChunkCount(): number {
    return this.chunks.size;
  }

  // Synchronously pre-builds the immediate surrounding chunks so their geometry buffers & materials are bound before the first frame
  public preloadInitialChunks(focusX: number): void {
    const centerIdx = Math.floor(focusX / this.chunkWidth);
    const minIdx = Math.max(1, centerIdx - 1);
    const maxIdx = Math.min(this.maxStreamIndex, centerIdx + 1);

    let added = false;
    for (let idx = minIdx; idx <= maxIdx; idx++) {
      if (!this.chunks.has(idx)) {
        const chunk = this.createChunk(idx);
        this.chunks.set(idx, chunk);
        this.scene.add(chunk.group);
        added = true;
      }
    }
    if (added) {
      this.rebuildActiveLists();
    }
  }

  // Dynamically streams in chunks within [-200m, +200m] of focusPos.x and unloads distant chunks
  public update(
    _dt: number,
    focusPos: THREE.Vector3,
    _playerOrVehiclePos: THREE.Vector3,
    streetLightActivation: number,
    wetness: number
  ): void {
    // 1. Determine required chunk indices around focusPos.x
    const centerChunkIdx = Math.floor(focusPos.x / this.chunkWidth);
    const minIdx = Math.max(1, centerChunkIdx - 2);
    const maxIdx = Math.min(this.maxStreamIndex, centerChunkIdx + 2);

    let chunksChanged = false;

    // Unload chunks outside the streaming window and dispose their chunk-specific GPU geometries
    for (const [idx, chunk] of this.chunks.entries()) {
      if (idx < minIdx - 1 || idx > maxIdx + 1) {
        this.scene.remove(chunk.group);
        chunk.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            if (m.userData.disposeGeo && m.geometry) {
              m.geometry.dispose();
            }
          }
        });
        this.chunks.delete(idx);
        chunksChanged = true;
      }
    }

    // Stream in newly entered chunks seamlessly (max 1 chunk constructed per frame to prevent any frame hitch)
    for (let idx = minIdx; idx <= maxIdx; idx++) {
      if (!this.chunks.has(idx)) {
        const newChunk = this.createChunk(idx);
        this.chunks.set(idx, newChunk);
        this.scene.add(newChunk.group);
        chunksChanged = true;
        break; // Construct at most 1 chunk per frame for 60fps smoothness on Android
      }
    }

    if (chunksChanged) {
      this.rebuildActiveLists();
    }

    // 2. Update shared night & wet materials across all streamed chunks
    const act = Number.isFinite(streetLightActivation)
      ? Math.max(0, Math.min(1, streetLightActivation))
      : 0;
    const isNightLights = act > 0.02;

    this.streetBulbMat.emissiveIntensity = act * 3.6;
    this.streetHaloMat.opacity = act * 0.42;
    this.groundPoolMat.opacity = act * (0.62 + wetness * 0.24);
    this.windowGlowMat.emissiveIntensity = act * 0.95;

    const r = 0.82 - wetness * 0.54;
    const m = 0.06 + wetness * 0.3;
    this.asphaltMat.roughness = r;
    this.asphaltMat.metalness = m;
    this.asphaltCrossMat.roughness = r;
    this.asphaltCrossMat.metalness = m;
    this.terrainMat.roughness = 0.94 - wetness * 0.38;

    for (const chunk of this.chunks.values()) {
      for (let i = 0; i < chunk.streetLightHalos.length; i++) {
        chunk.streetLightHalos[i].visible = isNightLights;
      }
      for (let i = 0; i < chunk.streetLightGroundPools.length; i++) {
        chunk.streetLightGroundPools[i].visible = isNightLights;
      }
    }
  }

  private rebuildActiveLists(): void {
    this.activeColliders = [];
    this.activeInteractables = [];
    this.activeStreetLightPositions = [];

    for (const chunk of this.chunks.values()) {
      this.activeColliders.push(...chunk.colliders);
      this.activeInteractables.push(...chunk.interactables);
      this.activeStreetLightPositions.push(...chunk.streetLightLampPositions);
    }
  }

  private getWallMaterial(hex: string): THREE.MeshStandardMaterial {
    if (this.wallMatCache.has(hex)) return this.wallMatCache.get(hex)!;
    const tex = ProceduralTextures.getWallPlasterTexture(hex, false);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88 });
    this.wallMatCache.set(hex, mat);
    return mat;
  }

  private getRoofMaterial(hex: string): THREE.MeshStandardMaterial {
    if (this.roofMatCache.has(hex)) return this.roofMatCache.get(hex)!;
    const tex = ProceduralTextures.getCorrugatedRoofTexture(hex, 0.25);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.58,
      metalness: 0.32,
      flatShading: true,
    });
    this.roofMatCache.set(hex, mat);
    return mat;
  }

  private getSignMaterial(
    title: string,
    sub: string,
    bg: string = '#1e3a8a',
    fg: string = '#ffffff',
    acc: string = '#fbbf24'
  ): THREE.MeshStandardMaterial {
    const key = `${title}_${sub}_${bg}`;
    if (this.signMatCache.has(key)) return this.signMatCache.get(key)!;
    const tex = ProceduralTextures.getSignboardTexture(title, sub, bg, fg, acc);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 });
    this.signMatCache.set(key, mat);
    return mat;
  }

  // Gateway sign at X = 86 on Williams Street East showing the start of the Freetown-Bo Highway
  private buildFreetownHighwayGateway(): void {
    const x = 86;
    const z = -5.8;
    const y = EnvironmentSystem.getTerrainHeight(x, z);

    const group = new THREE.Group();
    group.position.set(x, y, z);

    [-1.2, 1.2].forEach((px) => {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8),
        this.poleMat
      );
      post.position.set(px, 1.4, 0);
      post.castShadow = true;
      group.add(post);
    });

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.78, 0.08),
      this.getSignMaterial(
        'BO HIGHWAY (EAST) →',
        'Songo · Mile 91 · Sewa Bridge · Bo City',
        '#065f46',
        '#ffffff',
        '#fbbf24'
      )
    );
    board.position.set(0, 2.55, 0);
    board.castShadow = true;
    group.add(board);

    this.scene.add(group);
  }

  private buildDistantHorizonLOD(): THREE.Group {
    const group = new THREE.Group();
    const hillMat = new THREE.MeshLambertMaterial({
      color: 0x3f6234,
    });

    // Kasewe / Moyamba distant hill silhouettes along the horizon
    const hills: [number, number, number, number][] = [
      [350, -105, 55, 18],
      [560, 110, 65, 22],
      [780, -115, 70, 24],
      [980, 105, 60, 16],
      [1260, -110, 75, 19],
    ];

    hills.forEach(([hx, hz, radius, height]) => {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(radius, height, 7),
        hillMat
      );
      cone.position.set(hx, height * 0.4, hz);
      cone.scale.set(1.6, 1.0, 0.85);
      group.add(cone);
    });

    return group;
  }

  // Creates a 100m-wide world chunk for index `idx` (X in [idx * 100, (idx + 1) * 100])
  // Exact 100.0m width prevents any coplanar terrain overlap or Z-fighting between adjacent chunks!
  private createChunk(idx: number): StreamedChunk {
    const xStart = idx * this.chunkWidth;
    const xEnd = xStart + this.chunkWidth;
    const xMid = (xStart + xEnd) / 2;

    const group = new THREE.Group();
    const colliders: ColliderBox[] = [];
    const interactables: InteractiveObject[] = [];
    const streetLightLampPositions: THREE.Vector3[] = [];
    const streetLightHalos: THREE.Mesh[] = [];
    const streetLightGroundPools: THREE.Mesh[] = [];

    // 1. Streamed Terrain Patch (exact 100m x 200m) seamlessly matching EnvironmentSystem.getTerrainHeight
    const terrainGeo = new THREE.PlaneGeometry(100, 200, 25, 36);
    terrainGeo.rotateX(-Math.PI / 2);
    const pos = terrainGeo.attributes.position;
    const colors: number[] = [];

    const lateriteCol = new THREE.Color(0xb85d31); // Rich Sierra Leone inland red-orange laterite soil
    const boEarthCol = new THREE.Color(0xc87446);
    const grassCol = new THREE.Color(0x416b2c);
    const riverBankCol = new THREE.Color(0x5c482e);

    for (let i = 0; i < pos.count; i++) {
      const wx = xMid + pos.getX(i);
      const wz = pos.getZ(i);
      let wy = EnvironmentSystem.getTerrainHeight(wx, wz);

      // Carve the Sewa River channel at Chunk 6 (X in [646, 694])
      const isSewaRiver = wx >= 646 && wx <= 694;
      if (isSewaRiver) {
        const riverFactor = Math.sin(((wx - 646) / 48) * Math.PI);
        wy -= riverFactor * 2.8;
      }

      pos.setY(i, wy);

      const hwyZ = EnvironmentSystem.getHighwayCenterZ(wx);
      const distRoad = Math.abs(wz - hwyZ);

      const c = new THREE.Color();
      if (isSewaRiver) {
        c.copy(riverBankCol);
      } else if (wx >= 1060) {
        // Bo City urban laterite & compound soil
        c.lerpColors(lateriteCol, boEarthCol, 0.55);
      } else if (distRoad < 9.5) {
        c.copy(lateriteCol);
      } else {
        const n = Math.sin(wx * 0.08) * Math.cos(wz * 0.08) * 0.5 + 0.5;
        c.lerpColors(grassCol, lateriteCol, n * 0.35);
      }
      colors.push(c.r, c.g, c.b);
    }

    terrainGeo.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3)
    );
    terrainGeo.computeVertexNormals();

    const terrainMesh = new THREE.Mesh(terrainGeo, this.terrainMat);
    terrainMesh.position.set(xMid, 0, 0);
    terrainMesh.receiveShadow = true;
    terrainMesh.userData.disposeGeo = true;
    group.add(terrainMesh);

    // 2. Build Highway Ribbon or Bo City Street Grid
    if (idx <= 10) {
      this.buildHighwayRibbonForChunk(group, xStart, xEnd, idx);
    } else {
      this.buildBoCityStreetsForChunk(group, xStart, xEnd, idx);
    }

    // 3. Populate Region-Specific Landmarks, Villages, Countryside, or Bo City Districts
    this.populateChunkFeatures(
      idx,
      group,
      colliders,
      interactables,
      streetLightLampPositions,
      streetLightHalos,
      streetLightGroundPools
    );

    return {
      index: idx,
      xStart,
      xEnd,
      group,
      colliders,
      interactables,
      streetLightLampPositions,
      streetLightHalos,
      streetLightGroundPools,
    };
  }

  private buildHighwayRibbonForChunk(
    group: THREE.Group,
    xStart: number,
    _xEnd: number,
    idx: number
  ): void {
    // Road surface is built from unified RoadGraph in RoadsSystem; chunk streaming manages roadside foliage & scenery
    this.addCountrysideFoliage(group, xStart, idx);
  }

  private buildBoCityStreetsForChunk(
    _group: THREE.Group,
    _xStart: number,
    _xEnd: number,
    _idx: number
  ): void {
    // Bo City streets are built from unified RoadGraph in RoadsSystem with junction patches and zebra crossings
  }

  private addCountrysideFoliage(
    group: THREE.Group,
    xStart: number,
    idx: number
  ): void {
    for (let i = 0; i < 8; i++) {
      const tx = xStart + 8 + ((i * 11.3 + idx * 7) % 84);
      // Avoid placing trees in the Sewa River water channel
      if (tx >= 642 && tx <= 698) continue;

      const hwyZ = EnvironmentSystem.getHighwayCenterZ(tx);
      const side = i % 2 === 0 ? 1 : -1;
      const dist = 15 + ((i * 5 + idx * 3) % 26);
      const tz = hwyZ + side * dist;
      const ty = EnvironmentSystem.getTerrainHeight(tx, tz);

      const treeGroup = new THREE.Group();
      treeGroup.position.set(tx, ty, tz);

      const trunk = new THREE.Mesh(this.treeTrunkGeo, this.treeTrunkMat);
      trunk.position.y = 2.2;
      trunk.castShadow = true;
      treeGroup.add(trunk);

      const crown = new THREE.Mesh(this.treeCrownGeo, this.treeCanopyMat);
      crown.position.y = 4.8;
      crown.scale.set(1.2, 0.85, 1.2);
      crown.castShadow = true;
      treeGroup.add(crown);

      group.add(treeGroup);
    }
  }

  private addStreetLightToChunk(
    group: THREE.Group,
    px: number,
    pz: number,
    rotY: number,
    streetLightLampPositions: THREE.Vector3[],
    streetLightHalos: THREE.Mesh[],
    streetLightGroundPools: THREE.Mesh[]
  ): void {
    const py = EnvironmentSystem.getTerrainHeight(px, pz);

    const poleGroup = new THREE.Group();
    poleGroup.position.set(px, py, pz);
    poleGroup.rotation.y = rotY;

    const pole = new THREE.Mesh(this.poleGeo, this.poleMat);
    pole.position.y = 3.0;
    pole.castShadow = true;
    poleGroup.add(pole);

    const arm = new THREE.Mesh(this.poleArmGeo, this.poleMat);
    arm.position.set(0, 6.0, 0.65);
    poleGroup.add(arm);

    const bulb = new THREE.Mesh(this.poleBulbGeo, this.streetBulbMat);
    bulb.position.set(0, 5.95, 1.25);
    poleGroup.add(bulb);

    const halo = new THREE.Mesh(this.poleHaloGeo, this.streetHaloMat);
    halo.position.set(0, 5.9, 1.25);
    halo.visible = false;
    poleGroup.add(halo);
    streetLightHalos.push(halo);

    group.add(poleGroup);

    const lampWorldX = px + Math.sin(rotY) * 1.25;
    const lampWorldZ = pz + Math.cos(rotY) * 1.25;
    const lampWorldY = py + 5.9;
    streetLightLampPositions.push(
      new THREE.Vector3(lampWorldX, lampWorldY, lampWorldZ)
    );

    const poolMesh = new THREE.Mesh(this.groundPoolGeo, this.groundPoolMat);
    poolMesh.position.set(
      lampWorldX,
      EnvironmentSystem.getTerrainHeight(lampWorldX, lampWorldZ) + 0.15,
      lampWorldZ
    );
    poolMesh.renderOrder = 7;
    poolMesh.visible = false;
    group.add(poolMesh);
    streetLightGroundPools.push(poolMesh);
  }

  // Water-tight rectangular hipped roof geometry (zero skew or triangular corner gaps)
  private createRectangularHippedRoofGeo(
    spanX: number,
    spanZ: number,
    ridgeHeight: number
  ): THREE.BufferGeometry {
    const hx = spanX / 2;
    const hz = spanZ / 2;
    const ridgeHalfX = spanX >= spanZ ? Math.max(0.4, hx - hz * 0.85) : 0;
    const ridgeHalfZ = spanZ > spanX ? Math.max(0.4, hz - hx * 0.85) : 0;

    const bl = [-hx, 0, hz];
    const br = [hx, 0, hz];
    const tr = [hx, 0, -hz];
    const tl = [-hx, 0, -hz];
    const rl = [-ridgeHalfX, ridgeHeight, ridgeHalfZ];
    const rr = [ridgeHalfX, ridgeHeight, -ridgeHalfZ];

    const positions: number[] = [];
    const uvs: number[] = [];
    const pushTri = (
      p1: number[],
      p2: number[],
      p3: number[],
      u1: [number, number],
      u2: [number, number],
      u3: [number, number]
    ) => {
      positions.push(...p1, ...p2, ...p3);
      uvs.push(...u1, ...u2, ...u3);
    };

    if (spanX >= spanZ) {
      pushTri(bl, br, rr, [0, 0], [1, 0], [0.8, 1]);
      pushTri(bl, rr, rl, [0, 0], [0.8, 1], [0.2, 1]);
      pushTri(tr, tl, rl, [0, 0], [1, 0], [0.8, 1]);
      pushTri(tr, rl, rr, [0, 0], [0.8, 1], [0.2, 1]);
      pushTri(tl, bl, rl, [0, 0], [1, 0], [0.5, 1]);
      pushTri(br, tr, rr, [0, 0], [1, 0], [0.5, 1]);
    } else {
      const rFront = [0, ridgeHeight, ridgeHalfZ];
      const rBack = [0, ridgeHeight, -ridgeHalfZ];
      pushTri(tl, bl, rFront, [0, 0], [1, 0], [0.8, 1]);
      pushTri(tl, rFront, rBack, [0, 0], [0.8, 1], [0.2, 1]);
      pushTri(br, tr, rBack, [0, 0], [1, 0], [0.8, 1]);
      pushTri(br, rBack, rFront, [0, 0], [0.8, 1], [0.2, 1]);
      pushTri(bl, br, rFront, [0, 0], [1, 0], [0.5, 1]);
      pushTri(tr, tl, rBack, [0, 0], [1, 0], [0.5, 1]);
    }
    pushTri(bl, tl, tr, [0, 0], [0, 1], [1, 1]);
    pushTri(bl, tr, br, [0, 0], [1, 1], [1, 0]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
  }

  private addBuildingToChunk(
    group: THREE.Group,
    colliders: ColliderBox[],
    id: string,
    cx: number,
    cz: number,
    w: number,
    d: number,
    h: number,
    wallHex: string,
    roofHex: string,
    signTitle?: string,
    signSub?: string
  ): void {
    const y00 = EnvironmentSystem.getTerrainHeight(cx - w / 2, cz - d / 2);
    const y10 = EnvironmentSystem.getTerrainHeight(cx + w / 2, cz - d / 2);
    const y01 = EnvironmentSystem.getTerrainHeight(cx - w / 2, cz + d / 2);
    const y11 = EnvironmentSystem.getTerrainHeight(cx + w / 2, cz + d / 2);
    const maxY = Math.max(y00, y10, y01, y11);
    const minY = Math.min(y00, y10, y01, y11);

    const bGroup = new THREE.Group();
    bGroup.position.set(cx, maxY, cz);

    // Deep concrete foundation plinth so building never floats
    const plinthH = maxY - minY + 1.2;
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.3, plinthH, d + 0.3),
      this.plinthMat
    );
    plinth.position.y = 0.25 - plinthH / 2;
    plinth.receiveShadow = true;
    plinth.userData.disposeGeo = true;
    bGroup.add(plinth);

    const wallMat = this.getWallMaterial(wallHex);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    body.position.y = 0.25 + h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.disposeGeo = true;
    bGroup.add(body);

    // Water-tight rectangular hipped roof (zero corner gaps!)
    const roofMat = this.getRoofMaterial(roofHex);
    const roofGeo = this.createRectangularHippedRoofGeo(w + 0.7, d + 0.7, 1.55);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 0.25 + h - 0.04;
    roof.castShadow = true;
    roof.userData.disposeGeo = true;
    bGroup.add(roof);

    // Glowing night windows on front face (offset +0.05m outside wall to prevent Z-fighting)
    const frontZ = cz > 0 ? -d / 2 - 0.05 : d / 2 + 0.05;
    [-w * 0.26, w * 0.26].forEach((wx) => {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.95, 0.06),
        this.windowGlowMat
      );
      win.position.set(wx, 0.25 + 1.5, frontZ);
      win.userData.disposeGeo = true;
      bGroup.add(win);
    });

    if (signTitle) {
      const signZ = cz > 0 ? -d / 2 - 0.07 : d / 2 + 0.07;
      const signMesh = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(w * 0.8, 3.4), 0.68, 0.08),
        this.getSignMaterial(signTitle, signSub || 'Bo · Sierra Leone')
      );
      signMesh.position.set(0, 0.25 + h - 0.48, signZ);
      signMesh.userData.disposeGeo = true;
      bGroup.add(signMesh);
    }

    group.add(bGroup);

    colliders.push({
      id,
      minX: cx - w / 2 - 0.2,
      maxX: cx + w / 2 + 0.2,
      minZ: cz - d / 2 - 0.2,
      maxZ: cz + d / 2 + 0.2,
      minY: minY - 1.0,
      maxY: maxY + h + 2.0,
    });
  }

  private populateChunkFeatures(
    idx: number,
    group: THREE.Group,
    colliders: ColliderBox[],
    interactables: InteractiveObject[],
    streetLightLampPositions: THREE.Vector3[],
    streetLightHalos: THREE.Mesh[],
    streetLightGroundPools: THREE.Mesh[]
  ): void {
    // CHUNK 2 (X: 200..300): Songo / Waterloo Junction Village
    if (idx === 2) {
      const hwyZ = EnvironmentSystem.getHighwayCenterZ(245);
      this.addBuildingToChunk(
        group,
        colliders,
        'songo_shop_1',
        235,
        hwyZ - 11.5,
        7.4,
        5.6,
        3.2,
        '#e2c799',
        '#8c3f27',
        'SONGO ROADSIDE BAKERY',
        'Fresh Bread · Cold Water · Ginger Beer'
      );
      this.addBuildingToChunk(
        group,
        colliders,
        'songo_house_2',
        254,
        hwyZ + 12.0,
        8.2,
        6.4,
        3.3,
        '#d4d8dc',
        '#475569'
      );
      this.addStreetLightToChunk(
        group,
        242,
        hwyZ - 5.2,
        0,
        streetLightLampPositions,
        streetLightHalos,
        streetLightGroundPools
      );

      const signY = EnvironmentSystem.getTerrainHeight(225, hwyZ - 6);
      interactables.push({
        id: 'interact_songo',
        title: 'Songo Highway Settlement',
        subtitle: 'Roadside Bakery & Cassava Stalls (Bo: 920m East)',
        position: new THREE.Vector3(235, signY + 1.5, hwyZ - 8.5),
        radius: 5.5,
        type: 'kiosk',
        onInteract: () =>
          'Songo Junction: Travelers heading upcountry toward Mile 91 and Bo stop here for warm bread and roasted corn.',
      });
    }

    // CHUNK 4 (X: 400..500): Mile 91 Highway Trading Center & NP Fuel Station
    if (idx === 4) {
      const hwyZ = EnvironmentSystem.getHighwayCenterZ(465);
      const canopyY = EnvironmentSystem.getTerrainHeight(460, hwyZ - 13);
      const stationGroup = new THREE.Group();
      stationGroup.position.set(460, canopyY, hwyZ - 13);

      const canopyMat = new THREE.MeshStandardMaterial({
        color: 0x15803d,
        roughness: 0.4,
      });
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(12.0, 0.55, 7.2),
        canopyMat
      );
      canopy.position.y = 4.2;
      canopy.castShadow = true;
      canopy.userData.disposeGeo = true;
      stationGroup.add(canopy);

      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        roughness: 0.5,
      });
      [-4.5, 4.5].forEach((px) => {
        const p = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 4.8, 0.45),
          pillarMat
        );
        p.position.set(px, 2.0, 0);
        p.userData.disposeGeo = true;
        stationGroup.add(p);
      });

      const pump = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.7, 0.65),
        canopyMat
      );
      pump.position.set(0, 0.85, 0);
      pump.userData.disposeGeo = true;
      stationGroup.add(pump);

      group.add(stationGroup);

      this.addBuildingToChunk(
        group,
        colliders,
        'mile91_minimart',
        460,
        hwyZ - 21.0,
        10.5,
        6.2,
        3.5,
        '#f8fafc',
        '#15803d',
        'NP MILE 91 SERVICE STATION',
        'Fuel · Lubricants · Upcountry Rest Stop'
      );

      this.addBuildingToChunk(
        group,
        colliders,
        'mile91_chop_bar',
        482,
        hwyZ + 12.5,
        8.6,
        6.0,
        3.3,
        '#f3d5b5',
        '#9a3412',
        'AUNTIE SALLAY CHOP BAR',
        'Cassava Leaves · Groundnut Soup · Jollof Rice'
      );

      this.addStreetLightToChunk(
        group,
        452,
        hwyZ - 5.2,
        0,
        streetLightLampPositions,
        streetLightHalos,
        streetLightGroundPools
      );
      this.addStreetLightToChunk(
        group,
        478,
        hwyZ + 5.2,
        Math.PI,
        streetLightLampPositions,
        streetLightHalos,
        streetLightGroundPools
      );

      interactables.push({
        id: 'interact_mile91_fuel',
        title: 'NP Service Station · Mile 91',
        subtitle: 'Highway Fuel & Rest Stop (Halfway to Bo City)',
        position: new THREE.Vector3(460, canopyY + 1.2, hwyZ - 11.5),
        radius: 6.5,
        type: 'fuel',
        onInteract: () =>
          'Mile 91 Highway Hub: Vehicle tank topped up and tires checked! Continue East across the Sewa River Bridge to reach Bo City.',
      });
    }

    // CHUNK 6 (X: 600..700): Scenic Sewa River Steel-Truss & Concrete Bridge (X: 642..698)
    if (idx === 6) {
      const hwyZ = EnvironmentSystem.getHighwayCenterZ(670);
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x1e4e5f,
        roughness: 0.18,
        metalness: 0.65,
      });
      const riverMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(52, 195),
        waterMat
      );
      riverMesh.rotation.x = -Math.PI / 2;
      riverMesh.position.set(670, -1.1, 0);
      riverMesh.userData.disposeGeo = true;
      group.add(riverMesh);

      const baseBridgeY = EnvironmentSystem.getTerrainHeight(642, hwyZ) + 0.8;

      [-4.7, 4.7].forEach((sideZ, sIdx) => {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(56, 1.25, 0.38),
          this.poleMat
        );
        rail.position.set(670, baseBridgeY + 0.85, hwyZ + sideZ);
        rail.castShadow = true;
        rail.userData.disposeGeo = true;
        group.add(rail);

        const topChord = new THREE.Mesh(
          new THREE.BoxGeometry(52, 0.45, 0.45),
          this.poleMat
        );
        topChord.position.set(670, baseBridgeY + 5.2, hwyZ + sideZ);
        topChord.userData.disposeGeo = true;
        group.add(topChord);

        colliders.push({
          id: `sewa_bridge_rail_${sIdx}`,
          minX: 642,
          maxX: 698,
          minZ: hwyZ + sideZ - 0.35,
          maxZ: hwyZ + sideZ + 0.35,
          minY: baseBridgeY - 2.0,
          maxY: baseBridgeY + 2.5,
        });
      });

      interactables.push({
        id: 'interact_sewa_bridge',
        title: 'Sewa River Bridge',
        subtitle: 'Major Sierra Leone River Crossing into Southern Province',
        position: new THREE.Vector3(670, baseBridgeY + 1.5, hwyZ),
        radius: 8.0,
        type: 'landmark',
        onInteract: () =>
          'Sewa River Bridge: Crossing the mighty Sewa River into Bo District, Southern Province.',
      });
    }

    // CHUNK 7 (X: 700..800): Taiama / Baiima Rural Community (Mosque, Church & Farms)
    if (idx === 7) {
      const hwyZ = EnvironmentSystem.getHighwayCenterZ(775);
      this.addBuildingToChunk(
        group,
        colliders,
        'taiama_mosque',
        762,
        hwyZ - 14.0,
        9.0,
        8.0,
        3.8,
        '#ecfdf5',
        '#059669',
        'TAIAMA CENTRAL MOSQUE',
        'Rural Community · Moyamba–Bo Corridor'
      );

      const domeY =
        EnvironmentSystem.getTerrainHeight(762, hwyZ - 14.0) + 5.2;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(2.1, 12, 10),
        this.getRoofMaterial('#059669')
      );
      dome.position.set(762, domeY, hwyZ - 14.0);
      dome.userData.disposeGeo = true;
      group.add(dome);

      this.addBuildingToChunk(
        group,
        colliders,
        'taiama_church',
        785,
        hwyZ + 14.5,
        10.0,
        6.8,
        3.8,
        '#fef3c7',
        '#1d4ed8',
        'ST. PAUL RURAL MISSION & SCHOOL',
        'Taiama Community'
      );

      this.addStreetLightToChunk(
        group,
        772,
        hwyZ - 5.2,
        0,
        streetLightLampPositions,
        streetLightHalos,
        streetLightGroundPools
      );
    }

    // CHUNK 10 (X: 1000..1100): BO CITY WEST GATE ("WELCOME TO BO — SWEET BO")
    if (idx === 10) {
      const archX = 1062;
      const archY = EnvironmentSystem.getTerrainHeight(archX, 0);
      const archGroup = new THREE.Group();
      archGroup.position.set(archX, archY, 0);

      const archMat = this.getWallMaterial('#f8fafc');
      const greenTrim = this.getRoofMaterial('#15803d');

      [-5.8, 5.8].forEach((pz, pIdx) => {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 6.4, 1.1),
          archMat
        );
        pillar.position.set(0, 3.0, pz);
        pillar.castShadow = true;
        pillar.userData.disposeGeo = true;
        archGroup.add(pillar);

        colliders.push({
          id: `bo_welcome_arch_${pIdx}`,
          minX: archX - 0.7,
          maxX: archX + 0.7,
          minZ: pz - 0.7,
          maxZ: pz + 0.7,
          minY: archY - 1.0,
          maxY: archY + 6.5,
        });
      });

      const crossBeam = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.35, 13.2),
        greenTrim
      );
      crossBeam.position.set(0, 6.2, 0);
      crossBeam.castShadow = true;
      crossBeam.userData.disposeGeo = true;
      archGroup.add(crossBeam);

      const welcomeMat = this.getSignMaterial(
        'WELCOME TO BO CITY',
        'Capital of Southern Province · "Sweet Bo"',
        '#065f46',
        '#ffffff',
        '#fbbf24'
      );
      const bannerWest = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 1.15, 9.6),
        welcomeMat
      );
      bannerWest.position.set(-0.66, 6.2, 0);
      bannerWest.userData.disposeGeo = true;
      archGroup.add(bannerWest);

      const bannerEast = bannerWest.clone();
      bannerEast.position.set(0.66, 6.2, 0);
      archGroup.add(bannerEast);

      group.add(archGroup);

      this.addBuildingToChunk(
        group,
        colliders,
        'bo_west_house_1',
        1032,
        -15.0,
        9.4,
        7.2,
        3.5,
        '#e8ccb0',
        '#9a3412'
      );
      this.addBuildingToChunk(
        group,
        colliders,
        'bo_west_house_2',
        1082,
        15.5,
        10.2,
        7.6,
        3.6,
        '#d9e2ec',
        '#1e3a8a',
        'NJALA UNIVERSITY BO CAMPUS INFO',
        'Bo West Corridor'
      );

      this.addStreetLightToChunk(
        group,
        1045,
        -5.4,
        0,
        streetLightLampPositions,
        streetLightHalos,
        streetLightGroundPools
      );
      this.addStreetLightToChunk(
        group,
        1085,
        5.4,
        Math.PI,
        streetLightLampPositions,
        streetLightHalos,
        streetLightGroundPools
      );

      interactables.push({
        id: 'interact_bo_welcome_arch',
        title: 'Welcome to Bo City Arch',
        subtitle: 'Western Gateway into Bo ("Sweet Bo") · Southern Province',
        position: new THREE.Vector3(archX, archY + 1.5, -5.5),
        radius: 7.0,
        type: 'landmark',
        onInteract: () =>
          'Welcome to Bo City! You have completed the highway journey from Freetown to Bo, Sierra Leone’s second largest city.',
      });
    }

    // CHUNK 11 (X: 1100..1200): BO CITY CENTER — BO CLOCKTOWER, BOJON STREET, FENTON ROAD & BO BIG MARKET
    if (idx === 11) {
      const ctX = 1150;
      const ctZ = 0;
      const ctY = EnvironmentSystem.getTerrainHeight(ctX, ctZ);
      const ctGroup = new THREE.Group();
      ctGroup.position.set(ctX, ctY, ctZ);

      const plinthMat = this.getWallMaterial('#e2e8f0');
      const accentMat = this.getRoofMaterial('#047857');

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(2.3, 2.6, 0.85, 16),
        accentMat
      );
      base.position.y = 0.42;
      base.userData.disposeGeo = true;
      ctGroup.add(base);

      const towerShaft = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 7.6, 1.55),
        plinthMat
      );
      towerShaft.position.y = 4.2;
      towerShaft.castShadow = true;
      towerShaft.userData.disposeGeo = true;
      ctGroup.add(towerShaft);

      const clockBox = new THREE.Mesh(
        new THREE.BoxGeometry(1.72, 1.25, 1.72),
        this.streetBulbMat
      );
      clockBox.position.set(0, 7.1, 0);
      clockBox.userData.disposeGeo = true;
      ctGroup.add(clockBox);

      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(1.35, 2.1, 4),
        accentMat
      );
      spire.rotation.y = Math.PI / 4;
      spire.position.y = 8.9;
      spire.userData.disposeGeo = true;
      ctGroup.add(spire);

      group.add(ctGroup);

      colliders.push({
        id: 'bo_clocktower_collider',
        minX: ctX - 2.3,
        maxX: ctX + 2.3,
        minZ: ctZ - 2.3,
        maxZ: ctZ + 2.3,
        minY: ctY - 1.0,
        maxY: ctY + 9.5,
      });

      interactables.push({
        id: 'interact_bo_clocktower',
        title: 'Bo Clocktower Roundabout',
        subtitle: 'Heart of Bo City · Bojon Street & Fenton Road Junction',
        position: new THREE.Vector3(ctX, ctY + 1.5, ctZ),
        radius: 6.5,
        type: 'landmark',
        onInteract: () =>
          'Bo Clocktower: Historic central landmark at the intersection of Bojon Street and Fenton Road in downtown Bo.',
      });

      this.addBuildingToChunk(
        group,
        colliders,
        'bo_comm_bank',
        1122,
        -15.5,
        12.4,
        8.5,
        6.4,
        '#f1f5f9',
        '#1e3a8a',
        'SIERRA LEONE COMMERCIAL BANK · BO',
        'Bojon Street Branch'
      );
      this.addBuildingToChunk(
        group,
        colliders,
        'bo_fenton_plaza',
        1124,
        15.5,
        13.0,
        8.2,
        6.2,
        '#f5ebe0',
        '#9a3412',
        'FENTON ROAD TRADING PLAZA',
        'Textiles · Electronics · Provisions'
      );
      this.addBuildingToChunk(
        group,
        colliders,
        'bo_pharmacy_hotel',
        1176,
        15.8,
        12.5,
        8.4,
        6.5,
        '#e0f2fe',
        '#0369a1',
        'SWEET BO HOTEL & PHARMACY',
        'Bojon Street · Downtown Bo'
      );

      this.addBuildingToChunk(
        group,
        colliders,
        'bo_big_market_hall',
        1182,
        -21.5,
        16.5,
        10.5,
        4.4,
        '#fef3c7',
        '#b45309',
        'BO CENTRAL BIG MARKET',
        'Fresh Produce · Country Cloth · Palm Oil · Gari'
      );

      const mktY = EnvironmentSystem.getTerrainHeight(1182, -14.5);
      interactables.push({
        id: 'interact_bo_market',
        title: 'Bo Central Big Market',
        subtitle: 'Bustling Southern Province Market along Bojon Street',
        position: new THREE.Vector3(1182, mktY + 1.5, -14.5),
        radius: 6.5,
        type: 'market',
        onInteract: () =>
          'Bo Central Market: Traders selling Mende country cloth, fresh cassava, Bo gari, palm oil, and household goods.',
      });

      this.addBuildingToChunk(
        group,
        colliders,
        'bo_dambala_res_1',
        1128,
        -50.0,
        10.4,
        7.8,
        3.6,
        '#eddcd2',
        '#7c2d12'
      );
      this.addBuildingToChunk(
        group,
        colliders,
        'bo_tikonko_res_1',
        1175,
        50.0,
        10.8,
        8.0,
        3.6,
        '#e2e8f0',
        '#334155'
      );

      [1115, 1142, 1165, 1192].forEach((lx, i) => {
        this.addStreetLightToChunk(
          group,
          lx,
          i % 2 === 0 ? -5.5 : 5.5,
          i % 2 === 0 ? 0 : Math.PI,
          streetLightLampPositions,
          streetLightHalos,
          streetLightGroundPools
        );
      });
    }

    // CHUNK 12 (X: 1200..1300): BO SCHOOL (Bo Government Secondary School), CORONATION FIELD & BO CENTRAL MOSQUE
    if (idx === 12) {
      this.addBuildingToChunk(
        group,
        colliders,
        'bo_government_school',
        1242,
        -22.0,
        18.0,
        9.2,
        4.8,
        '#fef9c3',
        '#15803d',
        'BO GOVERNMENT SECONDARY SCHOOL',
        '"Manners Maketh Man" · Est. 1906'
      );

      const schY = EnvironmentSystem.getTerrainHeight(1242, -15.0);
      interactables.push({
        id: 'interact_bo_school',
        title: 'Bo Government Secondary School (Bo School)',
        subtitle: 'Historic Campus in Bo City · Founded 1906',
        position: new THREE.Vector3(1242, schY + 1.5, -15.0),
        radius: 6.5,
        type: 'landmark',
        onInteract: () =>
          'Bo Government Secondary School ("Bo School"): One of West Africa’s most prestigious historic secondary schools, founded in 1906.',
      });

      this.addBuildingToChunk(
        group,
        colliders,
        'bo_town_council',
        1240,
        20.5,
        15.0,
        8.8,
        5.2,
        '#f1f5f9',
        '#0f766e',
        'BO CITY COUNCIL & CIVIC HALL',
        'Coronation Field Avenue · Bo'
      );

      this.addBuildingToChunk(
        group,
        colliders,
        'bo_central_mosque',
        1282,
        -18.0,
        12.0,
        10.0,
        4.6,
        '#ecfdf5',
        '#047857',
        'BO CENTRAL MASJID',
        'Bojon / Sewa Road'
      );

      [1215, 1248, 1280].forEach((lx, i) => {
        this.addStreetLightToChunk(
          group,
          lx,
          i % 2 === 0 ? -5.5 : 5.5,
          i % 2 === 0 ? 0 : Math.PI,
          streetLightLampPositions,
          streetLightHalos,
          streetLightGroundPools
        );
      });
    }
  }
}
