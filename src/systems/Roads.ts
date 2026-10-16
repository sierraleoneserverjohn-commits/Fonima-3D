import * as THREE from 'three';
import { GroundSurfaceType } from './GameState';
import { EnvironmentSystem } from './Environment';
import { ProceduralTextures } from './ProceduralTextures';

export interface RoadSegmentDef {
  name: string;
  start: [number, number];
  end: [number, number];
  width: number;
  type: 'asphalt_primary' | 'asphalt_main' | 'laterite_lane' | 'footpath';
  hasDrainage?: boolean;
}

export class RoadsSystem {
  public roadSegments: RoadSegmentDef[] = [];
  private asphaltPrimaryMat!: THREE.MeshStandardMaterial;
  private asphaltMainMat!: THREE.MeshStandardMaterial;
  private asphaltCrossMat!: THREE.MeshStandardMaterial;
  private lateriteShoulderMat!: THREE.MeshStandardMaterial;
  private lateriteLaneMat!: THREE.MeshStandardMaterial;
  private gutterConcreteMat!: THREE.MeshStandardMaterial;

  constructor(
    scene: THREE.Scene,
    getTerrainHeight: (x: number, z: number) => number
  ) {
    // Carefully audited road layout for Goodrich / Fonima, Freetown:
    // Every road corridor is strictly separated from building and compound footprints.
    // - Williams Street runs East-West along Z = 0 (width 7.4m -> Z in [-3.7, +3.7])
    // - Peninsula Road runs East-West along Z = -59 (width 8.6m -> Z in [-63.3, -54.7])
    // - Fonima Drive runs North-South along X = -23.5 (width 6.0m -> X in [-26.5, -20.5])
    // - East Fonima Street runs North-South along X = +27.5 (width 6.0m -> X in [+24.5, +30.5])
    // - North Compound Access Track runs East-West along Z = -31.0 (between North & Mid compounds)
    // - South Compound Access Track runs East-West along Z = +33.0 (south of South row houses)
    this.roadSegments = [
      {
        name: 'Williams Street',
        start: [-95, 0],
        end: [95, 0],
        width: 7.4,
        type: 'asphalt_primary',
        hasDrainage: true,
      },
      {
        name: 'Peninsula Road (Main Road)',
        start: [-95, -59],
        end: [95, -59],
        width: 8.6,
        type: 'asphalt_main',
        hasDrainage: true,
      },
      {
        name: 'Fonima Drive (Cross Street)',
        start: [-23.5, -88],
        end: [-23.5, 88],
        width: 6.0,
        type: 'laterite_lane',
        hasDrainage: true,
      },
      {
        name: 'East Fonima Street',
        start: [27.5, -88],
        end: [27.5, 88],
        width: 6.0,
        type: 'asphalt_primary',
        hasDrainage: true,
      },
      {
        name: 'North Compound Access Track',
        start: [-82, -31],
        end: [82, -31],
        width: 4.2,
        type: 'footpath',
        hasDrainage: false,
      },
      {
        name: 'South Compound Access Track',
        start: [-82, 33],
        end: [82, 33],
        width: 4.2,
        type: 'footpath',
        hasDrainage: false,
      },
    ];

    this.buildRoads(scene, getTerrainHeight);
  }

  private buildRoads(
    scene: THREE.Scene,
    getTerrainHeight: (x: number, z: number) => number
  ): void {
    const asphaltTex = ProceduralTextures.getAsphaltRoadTexture();

    // Distinct depth bias per road tier so intersecting or layered roads NEVER Z-fight when rotating the camera
    this.lateriteShoulderMat = new THREE.MeshStandardMaterial({
      color: 0xb05f36,
      roughness: 0.95,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    this.gutterConcreteMat = new THREE.MeshStandardMaterial({
      color: 0x8d8982,
      roughness: 0.88,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const footpathMat = new THREE.MeshStandardMaterial({
      color: 0xbf754b,
      roughness: 0.97,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.lateriteLaneMat = new THREE.MeshStandardMaterial({
      color: 0xa85831,
      roughness: 0.94,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    this.asphaltCrossMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.84,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    this.asphaltPrimaryMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.84,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    });

    this.asphaltMainMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.84,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });

    this.roadSegments.forEach((seg, segIndex) => {
      const dx = seg.end[0] - seg.start[0];
      const dz = seg.end[1] - seg.start[1];
      const length = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx);
      const isNorthSouth = Math.abs(dz) > Math.abs(dx);

      const steps = Math.max(28, Math.floor(length / 3.0));
      const midX = (seg.start[0] + seg.end[0]) / 2;
      const midZ = (seg.start[1] + seg.end[1]) / 2;

      // Underlying laterite dirt shoulder bed (strictly below all road ribbons and curbs)
      if (seg.type === 'asphalt_primary' || seg.type === 'asphalt_main') {
        const shoulderWidth = seg.width + 2.0;
        const shGeo = new THREE.PlaneGeometry(length, shoulderWidth, steps, 4);
        shGeo.rotateX(-Math.PI / 2);
        const shPos = shGeo.attributes.position;
        for (let i = 0; i < shPos.count; i++) {
          const lx = shPos.getX(i);
          const lz = shPos.getZ(i);
          const wx = midX + lx * Math.cos(angle) - lz * Math.sin(angle);
          const wz = midZ + lx * Math.sin(angle) + lz * Math.cos(angle);
          // Offset North-South shoulder slightly below East-West shoulder so shoulders never Z-fight at intersections
          const shOffset = isNorthSouth ? 0.032 : 0.042;
          shPos.setY(i, getTerrainHeight(wx, wz) + shOffset);
        }
        shGeo.computeVertexNormals();
        const shMesh = new THREE.Mesh(shGeo, this.lateriteShoulderMat);
        shMesh.position.set(midX, 0, midZ);
        shMesh.rotation.y = -angle;
        shMesh.receiveShadow = true;
        shMesh.renderOrder = isNorthSouth ? 1 : 2;
        scene.add(shMesh);
      }

      // Main road surface ribbon following terrain height smoothly with guaranteed vertical separation per road
      const geom = new THREE.PlaneGeometry(length, seg.width, steps, 4);
      geom.rotateX(-Math.PI / 2);
      const posAttr = geom.attributes.position;

      // Every road segment gets a distinct vertical height offset above the terrain so intersections never share a plane
      let baseLayerOffset = 0.065;
      if (seg.type === 'asphalt_main') {
        baseLayerOffset = 0.135; // Peninsula Road highest
      } else if (seg.type === 'asphalt_primary') {
        baseLayerOffset = isNorthSouth ? 0.105 : 0.125; // Williams St (0.125m) cleanly above East Fonima St (0.105m)
      } else if (seg.type === 'laterite_lane') {
        baseLayerOffset = 0.088; // Fonima Drive cleanly between tracks and asphalt
      } else {
        baseLayerOffset = 0.068 + segIndex * 0.004; // Access tracks
      }

      for (let i = 0; i < posAttr.count; i++) {
        const lx = posAttr.getX(i);
        const lz = posAttr.getZ(i);
        const wx = midX + lx * Math.cos(angle) - lz * Math.sin(angle);
        const wz = midZ + lx * Math.sin(angle) + lz * Math.cos(angle);
        const h = getTerrainHeight(wx, wz);
        const crown = Math.abs(lz) < seg.width * 0.3 ? 0.018 : 0.0;
        posAttr.setY(i, h + baseLayerOffset + crown);
      }
      geom.computeVertexNormals();

      const mat =
        seg.type === 'asphalt_main'
          ? this.asphaltMainMat
          : seg.type === 'asphalt_primary'
          ? isNorthSouth
            ? this.asphaltCrossMat
            : this.asphaltPrimaryMat
          : seg.type === 'laterite_lane'
          ? this.lateriteLaneMat
          : footpathMat;

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(midX, 0, midZ);
      mesh.rotation.y = -angle;
      mesh.receiveShadow = true;
      mesh.renderOrder =
        seg.type === 'asphalt_main'
          ? 6
          : seg.type === 'asphalt_primary'
          ? isNorthSouth
            ? 4
            : 5
          : seg.type === 'laterite_lane'
          ? 3
          : 2;
      scene.add(mesh);

      // Terrain-hugging roadside concrete curbs (stop cleanly outside cross-road intersections to prevent Z-fighting)
      if (seg.hasDrainage && !isNorthSouth) {
        const curbOffset = seg.width / 2 + 0.35;
        [-curbOffset, curbOffset].forEach((sideZ) => {
          const curbGeo = new THREE.PlaneGeometry(length, 0.42, steps, 2);
          curbGeo.rotateX(-Math.PI / 2);
          const cPos = curbGeo.attributes.position;
          for (let i = 0; i < cPos.count; i++) {
            const lx = cPos.getX(i);
            const lz = cPos.getZ(i) + sideZ;
            const wx = midX + lx * Math.cos(angle) - lz * Math.sin(angle);
            const wz = midZ + lx * Math.sin(angle) + lz * Math.cos(angle);
            // Dip curb beneath cross-streets at X=-23.5 and X=+27.5 so curbs never poke through cross-street surfaces
            const nearCrossStreet =
              Math.abs(wx - -23.5) < 4.2 || Math.abs(wx - 27.5) < 4.2;
            const curbY = nearCrossStreet ? 0.02 : 0.068;
            cPos.setY(i, getTerrainHeight(wx, wz) + curbY);
          }
          curbGeo.computeVertexNormals();
          const curbMesh = new THREE.Mesh(curbGeo, this.gutterConcreteMat);
          curbMesh.position.set(midX, 0, midZ);
          curbMesh.rotation.y = -angle;
          curbMesh.receiveShadow = true;
          curbMesh.renderOrder = 2;
          scene.add(curbMesh);
        });
      }
    });
  }

  public setWetness(wetness: number): void {
    const r = 0.84 - wetness * 0.58;
    const m = 0.05 + wetness * 0.32;
    this.asphaltPrimaryMat.roughness = r;
    this.asphaltPrimaryMat.metalness = m;
    this.asphaltMainMat.roughness = r;
    this.asphaltMainMat.metalness = m;
    this.asphaltCrossMat.roughness = r;
    this.asphaltCrossMat.metalness = m;
    this.lateriteShoulderMat.roughness = 0.95 - wetness * 0.45;
    this.lateriteLaneMat.roughness = 0.94 - wetness * 0.48;
    this.gutterConcreteMat.roughness = 0.88 - wetness * 0.42;
  }

  private distToSegment(
    px: number,
    pz: number,
    x1: number,
    z1: number,
    x2: number,
    z2: number
  ): number {
    const l2 = (x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1);
    if (l2 === 0) return Math.hypot(px - x1, pz - z1);
    let t = ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), pz - (z1 + t * (z2 - z1)));
  }

  public getSurfaceHeightAt(x: number, z: number): number {
    let baseH = EnvironmentSystem.getTerrainHeight(x, z);

    // 1. Inside No. 22 Williams Street Compound concrete slab
    if (Math.abs(x - 0) <= 7.0 && Math.abs(z - -16.0) <= 7.4) {
      return baseH + 0.22;
    }

    // 2. Highway & Bo City road surface height (X > 95)
    if (x > 95) {
      if (x < 1060) {
        const hwyZ = EnvironmentSystem.getHighwayCenterZ(x);
        const dist = Math.abs(z - hwyZ);
        let bridgeLift = 0;
        if (x >= 642 && x <= 698 && dist < 6.0) {
          bridgeLift = Math.sin(((x - 642) / 56) * Math.PI) * 1.15;
        }
        if (dist <= 4.3) return baseH + 0.125 + bridgeLift;
        if (dist <= 5.8) return baseH + 0.055 + bridgeLift;
        return baseH;
      } else {
        // Bo City streets: Bojon St (Z=0), Fenton Rd (X=1150), Sewa Rd (X=1220), Dambala/Tikonko (Z=±38)
        if (Math.abs(z) <= 4.8) return baseH + 0.125;
        if (Math.abs(x - 1150) <= 3.8 || Math.abs(x - 1220) <= 3.8) {
          return baseH + 0.105;
        }
        if (Math.abs(z - -38) <= 3.1 || Math.abs(z - 38) <= 3.1) {
          return baseH + 0.085;
        }
        return baseH;
      }
    }

    // 3. Freetown / Fonima road segments (match exact vertex height offsets built in buildRoads)
    let bestOffset = 0;
    for (let i = 0; i < this.roadSegments.length; i++) {
      const seg = this.roadSegments[i];
      const d = this.distToSegment(
        x,
        z,
        seg.start[0],
        seg.start[1],
        seg.end[0],
        seg.end[1]
      );
      const isNorthSouth =
        Math.abs(seg.end[1] - seg.start[1]) >
        Math.abs(seg.end[0] - seg.start[0]);
      if (d <= seg.width * 0.5) {
        const crown = d < seg.width * 0.3 ? 0.018 : 0.0;
        let offset = 0.068;
        if (seg.type === 'asphalt_main') offset = 0.135;
        else if (seg.type === 'asphalt_primary')
          offset = isNorthSouth ? 0.105 : 0.125;
        else if (seg.type === 'laterite_lane') offset = 0.088;
        bestOffset = Math.max(bestOffset, offset + crown);
      } else if (
        (seg.type === 'asphalt_primary' || seg.type === 'asphalt_main') &&
        d <= seg.width * 0.5 + 1.0
      ) {
        bestOffset = Math.max(bestOffset, isNorthSouth ? 0.032 : 0.042);
      }
    }

    return baseH + bestOffset;
  }

  public getSurfaceTypeAt(x: number, z: number): GroundSurfaceType {
    if (Math.hypot(x - 0, z - -16.0) < 7.5) {
      return 'concrete';
    }

    // Highway & Bo City road surface detection (X > 92)
    if (x > 92) {
      if (x < 1060) {
        const hwyZ = (
          Math.sin(((x - 95) / (1060 - 95)) * Math.PI) *
          (Math.sin(((x - 95) / (1060 - 95)) * Math.PI * 3.0) * 26.0 +
            Math.sin(((x - 95) / (1060 - 95)) * Math.PI * 6.0) * 9.0)
        );
        const dist = Math.abs(z - hwyZ);
        if (dist <= 4.3) return 'asphalt';
        if (dist <= 7.0) return 'dirt';
        return 'grass';
      } else {
        // Inside Bo City (X >= 1060): Bojon Street (Z=0), Fenton Road (X=1150), Sewa Road (X=1220), Dambala Rd (Z=-38), Tikonko Rd (Z=+38)
        if (
          Math.abs(z) <= 5.0 ||
          Math.abs(x - 1150) <= 4.5 ||
          Math.abs(x - 1220) <= 4.5
        ) {
          return 'asphalt';
        }
        if (Math.abs(z - -38) <= 3.8 || Math.abs(z - 38) <= 3.8) {
          return 'dirt';
        }
        return 'dirt';
      }
    }

    for (let i = 0; i < this.roadSegments.length; i++) {
      const seg = this.roadSegments[i];
      const d = this.distToSegment(
        x,
        z,
        seg.start[0],
        seg.start[1],
        seg.end[0],
        seg.end[1]
      );
      if (d <= seg.width * 0.52) {
        if (seg.type === 'asphalt_primary' || seg.type === 'asphalt_main') {
          return 'asphalt';
        }
        return 'dirt';
      }
      if (d <= seg.width * 0.85) {
        return 'dirt';
      }
    }

    const noise = (Math.sin(x * 0.11) + Math.cos(z * 0.13)) * 0.5;
    if (noise > 0.12 || Math.hypot(x, z) > 62) {
      return 'grass';
    }
    return 'dirt';
  }

  public getZoneName(x: number, z: number): string {
    // 1. Freetown / Goodrich / Fonima (X <= 105)
    if (x <= 105) {
      if (Math.hypot(x - 0, z - -16.0) < 12.0) {
        return 'No. 22 Williams Street, Fonima';
      }
      if (Math.hypot(x - 42, z - -42) < 15.0) {
        return 'Delorny Preparatory School · Fonima';
      }
      if (x > 70 && Math.abs(z) < 15) {
        return 'Freetown East Tollgate · Bo Highway Junction';
      }
      if (Math.abs(z - -59) < 8) {
        return 'Peninsula Road (Main Road)';
      }
      if (Math.abs(z) < 7.0 && Math.abs(x) < 90) {
        return 'Williams Street · Goodrich / Fonima';
      }
      if (Math.abs(x - 27.5) < 6.5 && Math.abs(z) < 80) {
        return 'East Fonima Street';
      }
      if (Math.abs(x - -23.5) < 6.5 && Math.abs(z) < 80) {
        return 'Fonima Drive Junction';
      }
      return 'Goodrich / Fonima · Freetown';
    }

    // 2. Freetown Outskirts & Songo/Waterloo Corridor (105 < X <= 340)
    if (x <= 340) {
      if (Math.abs(x - 240) < 48) {
        return 'Songo Junction Settlement · Highway';
      }
      return 'Freetown–Bo Highway · Western Outskirts';
    }

    // 3. Mile 91 Trading & Fuel Stop (340 < X <= 620)
    if (x <= 620) {
      if (Math.abs(x - 480) < 55) {
        return 'Mile 91 Highway Hub · NP Fuel & Market Stalls';
      }
      return 'Moyamba–Tonkolili Countryside · Bo Highway';
    }

    // 4. Sewa River Bridge & Taiama Village (620 < X <= 900)
    if (x <= 900) {
      if (Math.abs(x - 670) < 42) {
        return 'Sewa River Bridge · Scenic Crossing';
      }
      if (Math.abs(x - 790) < 52) {
        return 'Taiama / Baiima Village · Mosque, Church & Farms';
      }
      return 'Southern Province Countryside · Bo Highway';
    }

    // 5. Bo Outskirts & Welcome Arch (900 < X < 1070)
    if (x < 1070) {
      return 'Bo City Outskirts · Welcome to Bo (Sweet Bo)';
    }

    // 6. Bo City Proper (X >= 1070)
    if (Math.hypot(x - 1150, z - 0) < 22) {
      return 'Bo Clocktower Roundabout · Bojon Street, Bo';
    }
    if (Math.hypot(x - 1185, z - -26) < 24) {
      return 'Bo Big Market · Central Commercial District';
    }
    if (Math.hypot(x - 1235, z - -28) < 26) {
      return 'Bo Government Secondary School (Bo School)';
    }
    if (Math.hypot(x - 1225, z - 26) < 24) {
      return 'Coronation Field & Bo Town Council';
    }
    if (Math.abs(z) < 8) {
      return 'Bojon Street · Bo City Center';
    }
    if (Math.abs(x - 1150) < 8) {
      return 'Fenton Road · Bo Commercial Strip';
    }
    if (Math.abs(z - -38) < 10) {
      return 'Dambala Road Residential Quarter · Bo';
    }
    if (Math.abs(z - 38) < 10) {
      return 'Tikonko Road Neighborhood · Bo';
    }
    return 'Bo City · Southern Province, Sierra Leone';
  }
}
