import * as THREE from 'three';
import { ColliderBox, InteractiveObject } from './GameState';
import { EnvironmentSystem } from './Environment';
import { ProceduralTextures } from './ProceduralTextures';

export interface HouseBlueprint {
  id: string;
  label: string;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  height: number;
  wallColorHex: string;
  exposeBlocks?: boolean;
  trimColor: number;
  roofStyle: 'hipped' | 'gabled' | 'mono';
  roofColorHex: string;
  rustIntensity?: number;
  hasVeranda: boolean;
  verandaSide: 'south' | 'north';
  wingExtension?: {
    offsetX: number;
    offsetZ: number;
    width: number;
    depth: number;
  };
  compound?: {
    padWidth: number;
    padDepth: number;
    wallHeight: number;
    wallColorHex: string;
    gateSide: 'south' | 'north';
    gateColor: number;
    isFeaturedNo22?: boolean;
  };
}

export class BuildingsSystem {
  public colliders: ColliderBox[] = [];
  public interactables: InteractiveObject[] = [];
  private windowGlassMat!: THREE.MeshStandardMaterial;
  private porchLightBulbMat!: THREE.MeshStandardMaterial;
  private no22PorchLight!: THREE.PointLight;

  constructor(scene: THREE.Scene) {
    this.windowGlassMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: new THREE.Color(0xffb74d),
      emissiveIntensity: 0.0,
      roughness: 0.22,
      metalness: 0.65,
    });
    this.porchLightBulbMat = new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: new THREE.Color(0xffb74d),
      emissiveIntensity: 0.0,
      roughness: 0.2,
    });

    const blueprints = this.getFonimaBlueprints();
    blueprints.forEach((bp) => this.buildProperty(scene, bp));
    this.buildRoadsideStructuresAndClutter(scene);
  }

  public setNightLighting(nightFactor: number | boolean = 0): void {
    const f =
      typeof nightFactor === 'boolean'
        ? nightFactor
          ? 1.0
          : 0.0
        : Number.isFinite(nightFactor)
          ? Math.max(0, Math.min(1, nightFactor))
          : 0.0;
    this.windowGlassMat.emissiveIntensity = f * 0.9;
    this.porchLightBulbMat.emissiveIntensity = f * 2.5;
    if (this.no22PorchLight) {
      this.no22PorchLight.intensity = f * 16.0;
    }
  }

  // Audited non-overlapping building & compound footprints matching the Goodrich / Fonima satellite layout:
  // Road corridors to respect:
  // - Williams Street: Z in [-4.5, +4.5]
  // - Peninsula Road: Z in [-64.0, -54.0]
  // - Fonima Drive: X in [-27.0, -20.0]
  // - East Fonima Street: X in [+24.0, +31.0]
  // - North Access Track: Z in [-33.5, -28.5]
  // - South Access Track: Z in [+30.5, +35.5]
  private getFonimaBlueprints(): HouseBlueprint[] {
    return [
      // 1. PRIMARY FEATURED COMPOUND: No. 22 Williams Street, Fonima
      // Footprint: X in [-7.2, +7.2], Z in [-23.6, -8.4]
      {
        id: 'no_22_williams',
        label: 'No. 22 Williams Street, Fonima',
        centerX: 0.0,
        centerZ: -16.0,
        width: 10.6,
        depth: 7.6,
        height: 3.5,
        wallColorHex: '#ecdcc2',
        trimColor: 0xfaf8f5,
        roofStyle: 'hipped',
        roofColorHex: '#d4b475',
        rustIntensity: 0.12,
        hasVeranda: true,
        verandaSide: 'south',
        wingExtension: {
          offsetX: 2.8,
          offsetZ: 2.8,
          width: 4.6,
          depth: 3.4,
        },
        compound: {
          padWidth: 14.4,
          padDepth: 15.2,
          wallHeight: 2.0,
          wallColorHex: '#bfb8ac',
          gateSide: 'south',
          gateColor: 0x2c353d,
          isFeaturedNo22: true,
        },
      },

      // 2. No. 22B Rear Annex Bungalow (North of North Access Track)
      // Footprint: X in [-5.2, +3.2], Z in [-45.4, -38.6]
      {
        id: 'no_22_rear_annex',
        label: 'No. 22B Rear Compound Bungalow',
        centerX: -1.0,
        centerZ: -42.0,
        width: 8.4,
        depth: 6.8,
        height: 3.3,
        wallColorHex: '#e6d2b5',
        trimColor: 0xffffff,
        roofStyle: 'hipped',
        roofColorHex: '#c8a668',
        rustIntensity: 0.25,
        hasVeranda: true,
        verandaSide: 'south',
      },

      // 3. No. 24 Williams Street (Immediately East of No. 22, West of East Fonima Street)
      // Footprint: X in [+8.8, +22.4], Z in [-23.4, -9.0]
      {
        id: 'no_24_williams',
        label: 'No. 24 Williams Street',
        centerX: 15.6,
        centerZ: -16.2,
        width: 10.4,
        depth: 7.4,
        height: 3.4,
        wallColorHex: '#e8d8c0',
        trimColor: 0x6e472b,
        roofStyle: 'hipped',
        roofColorHex: '#6e4c36',
        rustIntensity: 0.35,
        hasVeranda: true,
        verandaSide: 'south',
        compound: {
          padWidth: 13.6,
          padDepth: 14.4,
          wallHeight: 1.9,
          wallColorHex: '#b8b2a6',
          gateSide: 'south',
          gateColor: 0x3b281e,
        },
      },

      // 4. No. 26 Williams Street (East of East Fonima Street X=27.5)
      // Footprint: X in [+33.7, +49.3], Z in [-24.0, -9.0]
      {
        id: 'no_26_east_corner',
        label: 'No. 26 Williams Street (Courtyard Residence)',
        centerX: 41.5,
        centerZ: -16.5,
        width: 11.8,
        depth: 8.8,
        height: 3.8,
        wallColorHex: '#f0e6d2',
        trimColor: 0xffffff,
        roofStyle: 'hipped',
        roofColorHex: '#9c8669',
        rustIntensity: 0.18,
        hasVeranda: true,
        verandaSide: 'south',
        compound: {
          padWidth: 15.6,
          padDepth: 15.0,
          wallHeight: 2.0,
          wallColorHex: '#b8b2a6',
          gateSide: 'south',
          gateColor: 0x3b281e,
        },
      },

      // 5. No. 20 Williams Street (West of No. 22, East of Fonima Drive X=-23.5)
      // Footprint: X in [-19.2, -8.4], Z in [-22.6, -8.8]
      {
        id: 'no_20_williams',
        label: 'No. 20 Williams Street',
        centerX: -13.8,
        centerZ: -15.7,
        width: 8.2,
        depth: 7.2,
        height: 3.3,
        wallColorHex: '#d9c2a3',
        trimColor: 0xf5f2eb,
        roofStyle: 'gabled',
        roofColorHex: '#7d3a24',
        rustIntensity: 0.55,
        hasVeranda: true,
        verandaSide: 'south',
        compound: {
          padWidth: 10.8,
          padDepth: 13.8,
          wallHeight: 1.85,
          wallColorHex: '#9e988e',
          gateSide: 'south',
          gateColor: 0x4a2f20,
        },
      },

      // 6. No. 18 Williams Street (West of Fonima Drive X=-23.5)
      // Footprint: X in [-42.0, -31.0], Z in [-20.5, -11.5]
      {
        id: 'no_18_williams',
        label: 'No. 18 Williams Street',
        centerX: -36.5,
        centerZ: -16.0,
        width: 10.6,
        depth: 8.2,
        height: 3.5,
        wallColorHex: '#e3cfb4',
        trimColor: 0xffffff,
        roofStyle: 'hipped',
        roofColorHex: '#694532',
        rustIntensity: 0.42,
        hasVeranda: true,
        verandaSide: 'south',
      },

      // 7. No. 14 Williams Street Compound (Further West on Williams St)
      // Footprint: X in [-61.5, -47.5], Z in [-21.0, -11.5]
      {
        id: 'no_14_williams_long',
        label: 'No. 14 Williams Street Compound',
        centerX: -54.5,
        centerZ: -16.2,
        width: 13.6,
        depth: 8.2,
        height: 3.6,
        wallColorHex: '#f2efe9',
        trimColor: 0x5c4938,
        roofStyle: 'hipped',
        roofColorHex: '#6b4938',
        rustIntensity: 0.3,
        hasVeranda: true,
        verandaSide: 'south',
      },

      // 8. No. 21 Williams Street (South side of Williams St, directly across from No. 22)
      // Footprint: X in [-7.5, +8.5], Z in [+8.5, +23.5]
      {
        id: 'no_21_williams_south',
        label: 'No. 21 Williams Street',
        centerX: 0.5,
        centerZ: 16.0,
        width: 12.0,
        depth: 8.0,
        height: 3.4,
        wallColorHex: '#e8d4bc',
        trimColor: 0xffffff,
        roofStyle: 'gabled',
        roofColorHex: '#7a3b26',
        rustIntensity: 0.55,
        hasVeranda: true,
        verandaSide: 'north',
        compound: {
          padWidth: 16.0,
          padDepth: 15.0,
          wallHeight: 1.9,
          wallColorHex: '#b5afa4',
          gateSide: 'north',
          gateColor: 0x264653,
        },
      },

      // 9. No. 15 Williams Street (South-West Two-Storey Red-Roofed Residence)
      // Footprint: X in [-43.0, -31.0], Z in [+10.5, +21.5]
      {
        id: 'no_15_red_roof',
        label: 'No. 15 Williams Street (Red Roof Residence)',
        centerX: -37.0,
        centerZ: 16.0,
        width: 11.2,
        depth: 8.8,
        height: 5.2,
        wallColorHex: '#f5efe6',
        trimColor: 0x8c3b2b,
        roofStyle: 'hipped',
        roofColorHex: '#a83829',
        rustIntensity: 0.15,
        hasVeranda: true,
        verandaSide: 'north',
      },

      // 10. Delorny Preparatory School (East of East Fonima St, South of Peninsula Rd)
      // Footprint: X in [+34.5, +49.5], Z in [-47.5, -37.5]
      {
        id: 'delorny_prep_school',
        label: 'Delorny Preparatory School',
        centerX: 42.0,
        centerZ: -42.5,
        width: 14.2,
        depth: 8.8,
        height: 5.6,
        wallColorHex: '#e8d5c4',
        trimColor: 0x2b4c7e,
        roofStyle: 'hipped',
        roofColorHex: '#cfd6de',
        rustIntensity: 0.08,
        hasVeranda: true,
        verandaSide: 'south',
      },

      // 11. Fonima Central Residence (North of North Access Track, East of No. 22B)
      // Footprint: X in [+7.5, +19.5], Z in [-47.0, -37.5]
      {
        id: 'fonima_mid_north',
        label: 'Fonima Central Residence',
        centerX: 13.5,
        centerZ: -42.2,
        width: 11.4,
        depth: 8.4,
        height: 4.6,
        wallColorHex: '#f4f1ea',
        trimColor: 0x4a5568,
        roofStyle: 'hipped',
        roofColorHex: '#7d4430',
        rustIntensity: 0.4,
        hasVeranda: true,
        verandaSide: 'south',
      },

      // 12. East Fonima Sandcrete Bungalow (South side of Williams St, East of East Fonima St)
      // Footprint: X in [+35.0, +46.0], Z in [+11.0, +21.0]
      {
        id: 'sandcrete_house_east',
        label: 'East Fonima Sandcrete Bungalow',
        centerX: 40.5,
        centerZ: 16.0,
        width: 10.6,
        depth: 8.4,
        height: 3.5,
        wallColorHex: '#9e9a93',
        exposeBlocks: true,
        trimColor: 0xdcd8d0,
        roofStyle: 'hipped',
        roofColorHex: '#8f3929',
        rustIntensity: 0.45,
        hasVeranda: true,
        verandaSide: 'north',
      },
    ];
  }

  // Computes the maximum terrain height across all 4 corners of a footprint so slabs never sink underground
  private getMaxCornerTerrainHeight(
    cx: number,
    cz: number,
    w: number,
    d: number
  ): number {
    const hw = w / 2;
    const hd = d / 2;
    return Math.max(
      EnvironmentSystem.getTerrainHeight(cx, cz),
      EnvironmentSystem.getTerrainHeight(cx - hw, cz - hd),
      EnvironmentSystem.getTerrainHeight(cx + hw, cz - hd),
      EnvironmentSystem.getTerrainHeight(cx - hw, cz + hd),
      EnvironmentSystem.getTerrainHeight(cx + hw, cz + hd)
    );
  }

  private buildProperty(scene: THREE.Scene, bp: HouseBlueprint): void {
    const padW = bp.compound ? bp.compound.padWidth - 0.3 : bp.width + 1.4;
    const padD = bp.compound ? bp.compound.padDepth - 0.3 : bp.depth + 1.4;

    // Anchor property at the highest terrain point of its footprint so terrain never pokes through the slab,
    // and extend the foundation plinth 1.6m downward into the ground so it NEVER floats on any hillside slope!
    const topGroundY = this.getMaxCornerTerrainHeight(
      bp.centerX,
      bp.centerZ,
      padW,
      padD
    );
    const slabTopOffset = 0.22; // Courtyard / foundation top sits 22cm above the highest ground corner
    const foundationDepth = 1.8; // Extends 1.58m deep into the terrain so downhill corners never float!

    const propGroup = new THREE.Group();
    propGroup.position.set(bp.centerX, topGroundY, bp.centerZ);

    const concreteTex = ProceduralTextures.getConcreteSlabTexture();
    const slabMat = new THREE.MeshStandardMaterial({
      map: concreteTex,
      color: bp.compound?.isFeaturedNo22 ? 0xdad4ca : 0xb8b2a8,
      roughness: 0.88,
    });

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(padW, foundationDepth, padD),
      slabMat
    );
    slab.position.y = slabTopOffset - foundationDepth / 2;
    slab.receiveShadow = true;
    slab.castShadow = true;
    propGroup.add(slab);

    const wallTex = ProceduralTextures.getWallPlasterTexture(
      bp.wallColorHex,
      Boolean(bp.exposeBlocks)
    );
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.88,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: bp.trimColor,
      roughness: 0.72,
    });

    // Main house walls sit flush on top of the foundation slab (`y = slabTopOffset`)
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(bp.width, bp.height, bp.depth),
      wallMat
    );
    body.position.y = slabTopOffset + bp.height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    propGroup.add(body);

    // Optional L-wing extension (e.g., No. 22 Williams Street's projecting front wing)
    if (bp.wingExtension) {
      const ext = bp.wingExtension;
      const wingH = bp.height - 0.15;
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(ext.width, wingH, ext.depth),
        wallMat
      );
      wing.position.set(ext.offsetX, slabTopOffset + wingH / 2, ext.offsetZ);
      wing.castShadow = true;
      wing.receiveShadow = true;
      propGroup.add(wing);

      this.colliders.push({
        id: `house_wing_${bp.id}`,
        minX: bp.centerX + ext.offsetX - ext.width / 2 - 0.15,
        maxX: bp.centerX + ext.offsetX + ext.width / 2 + 0.15,
        minZ: bp.centerZ + ext.offsetZ - ext.depth / 2 - 0.15,
        maxZ: bp.centerZ + ext.offsetZ + ext.depth / 2 + 0.15,
        minY: topGroundY - 2.0,
        maxY: topGroundY + bp.height + 2.0,
      });
    }

    // Main building solid collision box
    const halfW = bp.width / 2 + 0.2;
    const halfD = bp.depth / 2 + 0.2;
    this.colliders.push({
      id: `house_${bp.id}`,
      label: bp.label,
      minX: bp.centerX - halfW,
      maxX: bp.centerX + halfW,
      minZ: bp.centerZ - halfD,
      maxZ: bp.centerZ + halfD,
      minY: topGroundY - 2.0,
      maxY: topGroundY + bp.height + 2.5,
    });

    this.addWindowsAndDoors(propGroup, bp, trimMat, slabTopOffset);

    if (bp.hasVeranda) {
      this.addVeranda(propGroup, bp, trimMat, slabMat, slabTopOffset);
    }

    // Clean, non-skewed rectangular hipped & gabled roofs
    this.addRoof(propGroup, bp, slabTopOffset);

    scene.add(propGroup);

    if (bp.compound) {
      this.buildCompoundWallsAndGate(scene, bp, topGroundY, slabTopOffset);
    }

    if (bp.id === 'delorny_prep_school') {
      this.interactables.push({
        id: 'interact_school',
        title: 'Delorny Preparatory School',
        subtitle: 'Fonima neighborhood school landmark near Peninsula Road',
        position: new THREE.Vector3(
          bp.centerX,
          topGroundY + 1.5,
          bp.centerZ + bp.depth / 2 + 2.0
        ),
        radius: 4.5,
        type: 'landmark',
        onInteract: () =>
          'Delorny Preparatory School: Local Freetown preparatory school serving families in Fonima and Goodrich.',
      });
    }
  }

  private addWindowsAndDoors(
    group: THREE.Group,
    bp: HouseBlueprint,
    trimMat: THREE.Material,
    slabTopOffset: number
  ): void {
    const glassMat = this.windowGlassMat;
    const ironBarMat = new THREE.MeshStandardMaterial({
      color: 0xd8dee6,
      roughness: 0.5,
      metalness: 0.7,
    });
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x4d2c18,
      roughness: 0.68,
    });

    const dirSign = bp.verandaSide === 'south' ? 1 : -1;
    // Place windows and doors cleanly outside the wall surface (+0.04m offset) to eliminate Z-fighting
    const frontZ = (bp.depth / 2 + 0.04) * dirSign;
    const backZ = -(bp.depth / 2 + 0.04) * dirSign;

    // Front wooden panel door (placed inside the veranda section)
    const doorX = bp.wingExtension ? -bp.width * 0.18 : -0.8;
    const doorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.22, 2.15, 0.08),
      trimMat
    );
    doorFrame.position.set(doorX, slabTopOffset + 1.08, frontZ);
    group.add(doorFrame);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 2.02, 0.12),
      doorMat
    );
    door.position.set(doorX, slabTopOffset + 1.04, frontZ);
    group.add(door);

    // Front & back louvered windows with burglar bars
    const winXPositions = bp.wingExtension
      ? [-bp.width * 0.36]
      : [-bp.width * 0.34, bp.width * 0.12, bp.width * 0.34];
    const stories =
      bp.height > 4.5
        ? [slabTopOffset + 1.55, slabTopOffset + 3.85]
        : [slabTopOffset + 1.55];

    stories.forEach((wy) => {
      winXPositions.forEach((wx) => {
        const winFrame = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 1.2, 0.08),
          trimMat
        );
        winFrame.position.set(wx, wy, frontZ);
        group.add(winFrame);

        const winGlass = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 1.0, 0.11),
          glassMat
        );
        winGlass.position.set(wx, wy, frontZ);
        group.add(winGlass);

        [-0.24, 0, 0.24].forEach((barY) => {
          const bar = new THREE.Mesh(
            new THREE.BoxGeometry(1.22, 0.03, 0.14),
            ironBarMat
          );
          bar.position.set(wx, wy + barY, frontZ);
          group.add(bar);
        });

        // Back wall windows
        const backFrame = winFrame.clone();
        backFrame.position.set(wx, wy, backZ);
        group.add(backFrame);

        const backGlass = winGlass.clone();
        backGlass.position.set(wx, wy, backZ);
        group.add(backGlass);
      });
    });

    // If the house has a front wing extension, add a front window on the wing face too
    if (bp.wingExtension) {
      const ext = bp.wingExtension;
      const wingFrontZ = ext.offsetZ + (ext.depth / 2 + 0.04) * dirSign;
      const wy = slabTopOffset + 1.5;
      const wFrame = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.2, 0.08),
        trimMat
      );
      wFrame.position.set(ext.offsetX, wy, wingFrontZ);
      group.add(wFrame);

      const wGlass = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.0, 0.11),
        glassMat
      );
      wGlass.position.set(ext.offsetX, wy, wingFrontZ);
      group.add(wGlass);
    }
  }

  private addVeranda(
    group: THREE.Group,
    bp: HouseBlueprint,
    trimMat: THREE.Material,
    slabMat: THREE.Material,
    slabTopOffset: number
  ): void {
    const porchDepth = 1.9;
    const sign = bp.verandaSide === 'south' ? 1 : -1;
    const porchZ = (bp.depth / 2 + porchDepth / 2) * sign;

    const porchWidth = bp.wingExtension ? bp.width * 0.48 : bp.width * 0.72;
    const porchOffsetX = bp.wingExtension ? -bp.width * 0.22 : 0;

    // Raised veranda step deck anchored into foundation
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(porchWidth, 0.65, porchDepth),
      slabMat
    );
    deck.position.set(porchOffsetX, slabTopOffset - 0.18, porchZ);
    deck.receiveShadow = true;
    group.add(deck);

    // Concrete columns supporting the veranda overhang
    const colOffsets = [-porchWidth * 0.44, 0, porchWidth * 0.44];
    const colH = bp.height - 0.18;
    const colGeo = new THREE.CylinderGeometry(0.12, 0.14, colH, 8);
    colOffsets.forEach((cx) => {
      const col = new THREE.Mesh(colGeo, trimMat);
      col.position.set(
        porchOffsetX + cx,
        slabTopOffset + colH / 2,
        porchZ + porchDepth * 0.4 * sign
      );
      col.castShadow = true;
      group.add(col);
    });

    // Low parapet balustrade wall
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(porchWidth * 0.36, 0.82, 0.15),
      trimMat
    );
    rail.position.set(
      porchOffsetX - porchWidth * 0.28,
      slabTopOffset + 0.41,
      porchZ + porchDepth * 0.4 * sign
    );
    group.add(rail);

    // Veranda roof fascia canopy
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(porchWidth + 0.25, 0.22, porchDepth + 0.3),
      trimMat
    );
    canopy.position.set(
      porchOffsetX,
      slabTopOffset + bp.height - 0.11,
      porchZ
    );
    canopy.castShadow = true;
    group.add(canopy);

    // Ceiling veranda security bulb
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      this.porchLightBulbMat
    );
    bulb.position.set(
      porchOffsetX,
      slabTopOffset + bp.height - 0.25,
      porchZ
    );
    group.add(bulb);

    if (bp.id === 'no_22_williams') {
      this.no22PorchLight = new THREE.PointLight(0xffb74d, 0.0, 18, 1.5);
      this.no22PorchLight.position.set(
        porchOffsetX,
        slabTopOffset + bp.height - 0.45,
        porchZ
      );
      group.add(this.no22PorchLight);
    }
  }

  // Builds a true architectural rectangular hipped roof BufferGeometry (zero diagonal skew!)
  private createRectangularHippedRoofGeometry(
    spanX: number,
    spanZ: number,
    ridgeHeight: number
  ): THREE.BufferGeometry {
    const hx = spanX / 2;
    const hz = spanZ / 2;
    // Ridge runs along the longer axis
    const ridgeHalfX = spanX >= spanZ ? Math.max(0.4, hx - hz * 0.85) : 0;
    const ridgeHalfZ = spanZ > spanX ? Math.max(0.4, hz - hx * 0.85) : 0;

    // Base corners (y = 0)
    const bl = [-hx, 0, hz];  // Front-Left (+Z)
    const br = [hx, 0, hz];   // Front-Right (+Z)
    const tr = [hx, 0, -hz];  // Back-Right (-Z)
    const tl = [-hx, 0, -hz]; // Back-Left (-Z)

    // Ridge endpoints (y = ridgeHeight)
    const rl = [-ridgeHalfX, ridgeHeight, ridgeHalfZ];
    const rr = [ridgeHalfX, ridgeHeight, -ridgeHalfZ];

    const positions: number[] = [];
    const uvs: number[] = [];

    const pushTriangle = (
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
      // Front slope (+Z): quad (bl, br, rr, rl)
      pushTriangle(bl, br, rr, [0, 0], [1, 0], [0.8, 1]);
      pushTriangle(bl, rr, rl, [0, 0], [0.8, 1], [0.2, 1]);
      // Back slope (-Z): quad (tr, tl, rl, rr)
      pushTriangle(tr, tl, rl, [0, 0], [1, 0], [0.8, 1]);
      pushTriangle(tr, rl, rr, [0, 0], [0.8, 1], [0.2, 1]);
      // Left hip (-X): triangle (tl, bl, rl)
      pushTriangle(tl, bl, rl, [0, 0], [1, 0], [0.5, 1]);
      // Right hip (+X): triangle (br, tr, rr)
      pushTriangle(br, tr, rr, [0, 0], [1, 0], [0.5, 1]);
    } else {
      const rFront = [0, ridgeHeight, ridgeHalfZ];
      const rBack = [0, ridgeHeight, -ridgeHalfZ];
      // Left slope (-X)
      pushTriangle(tl, bl, rFront, [0, 0], [1, 0], [0.8, 1]);
      pushTriangle(tl, rFront, rBack, [0, 0], [0.8, 1], [0.2, 1]);
      // Right slope (+X)
      pushTriangle(br, tr, rBack, [0, 0], [1, 0], [0.8, 1]);
      pushTriangle(br, rBack, rFront, [0, 0], [0.8, 1], [0.2, 1]);
      // Front hip (+Z)
      pushTriangle(bl, br, rFront, [0, 0], [1, 0], [0.5, 1]);
      // Back hip (-Z)
      pushTriangle(tr, tl, rBack, [0, 0], [1, 0], [0.5, 1]);
    }

    // Bottom soffit closure quad so looking up from ground never shows hollow roof interior
    pushTriangle(bl, tl, tr, [0, 0], [0, 1], [1, 1]);
    pushTriangle(bl, tr, br, [0, 0], [1, 1], [1, 0]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
  }

  // Builds a true architectural gabled roof BufferGeometry with pitched slopes and triangular gable ends
  private createRectangularGabledRoofGeometry(
    spanX: number,
    spanZ: number,
    ridgeHeight: number
  ): THREE.BufferGeometry {
    const hx = spanX / 2;
    const hz = spanZ / 2;

    const bl = [-hx, 0, hz];
    const br = [hx, 0, hz];
    const tr = [hx, 0, -hz];
    const tl = [-hx, 0, -hz];
    const rl = [-hx, ridgeHeight, 0];
    const rr = [hx, ridgeHeight, 0];

    const positions: number[] = [];
    const uvs: number[] = [];

    const pushTriangle = (
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

    // Front pitched slope (+Z)
    pushTriangle(bl, br, rr, [0, 0], [1, 0], [1, 1]);
    pushTriangle(bl, rr, rl, [0, 0], [1, 1], [0, 1]);

    // Back pitched slope (-Z)
    pushTriangle(tr, tl, rl, [0, 0], [1, 0], [1, 1]);
    pushTriangle(tr, rl, rr, [0, 0], [1, 1], [0, 1]);

    // Left gable triangle (-X)
    pushTriangle(tl, bl, rl, [0, 0], [1, 0], [0.5, 1]);

    // Right gable triangle (+X)
    pushTriangle(br, tr, rr, [0, 0], [1, 0], [0.5, 1]);

    // Soffit underside closure
    pushTriangle(bl, tl, tr, [0, 0], [0, 1], [1, 1]);
    pushTriangle(bl, tr, br, [0, 0], [1, 1], [1, 0]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
  }

  private addRoof(
    group: THREE.Group,
    bp: HouseBlueprint,
    slabTopOffset: number
  ): void {
    const roofTex = ProceduralTextures.getCorrugatedRoofTexture(
      bp.roofColorHex,
      bp.rustIntensity ?? 0.25
    );
    const roofMat = new THREE.MeshStandardMaterial({
      map: roofTex,
      roughness: 0.56,
      metalness: 0.32,
      flatShading: true,
    });

    const roofY = slabTopOffset + bp.height;
    const overhang = 0.75;

    if (bp.roofStyle === 'hipped') {
      const mainRoofGeo = this.createRectangularHippedRoofGeometry(
        bp.width + overhang,
        bp.depth + overhang,
        1.85
      );
      const mainRoof = new THREE.Mesh(mainRoofGeo, roofMat);
      mainRoof.position.y = roofY - 0.04;
      mainRoof.castShadow = true;
      mainRoof.receiveShadow = true;
      group.add(mainRoof);

      if (bp.wingExtension) {
        const ext = bp.wingExtension;
        const wingRoofGeo = this.createRectangularHippedRoofGeometry(
          ext.width + overhang * 0.85,
          ext.depth + overhang * 0.85,
          1.35
        );
        const wingRoof = new THREE.Mesh(wingRoofGeo, roofMat);
        wingRoof.position.set(ext.offsetX, roofY - 0.18, ext.offsetZ);
        wingRoof.castShadow = true;
        wingRoof.receiveShadow = true;
        group.add(wingRoof);
      }
    } else if (bp.roofStyle === 'gabled') {
      const gableGeo = this.createRectangularGabledRoofGeometry(
        bp.width + overhang,
        bp.depth + overhang,
        1.65
      );
      const gableRoof = new THREE.Mesh(gableGeo, roofMat);
      gableRoof.position.y = roofY - 0.04;
      gableRoof.castShadow = true;
      gableRoof.receiveShadow = true;
      group.add(gableRoof);
    } else {
      const mono = new THREE.Mesh(
        new THREE.BoxGeometry(
          bp.width + overhang,
          0.22,
          bp.depth + overhang
        ),
        roofMat
      );
      mono.position.y = roofY + 0.15;
      mono.rotation.x = 0.08;
      mono.castShadow = true;
      group.add(mono);
    }
  }

  private buildCompoundWallsAndGate(
    scene: THREE.Scene,
    bp: HouseBlueprint,
    topGroundY: number,
    slabTopOffset: number
  ): void {
    const comp = bp.compound!;
    const wallTex = ProceduralTextures.getWallPlasterTexture(
      comp.wallColorHex,
      true
    );
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.92,
    });
    const pillarCapMat = new THREE.MeshStandardMaterial({
      color: 0xe6e2da,
      roughness: 0.8,
    });

    const halfW = comp.padWidth / 2;
    const halfD = comp.padDepth / 2;
    const wallH = comp.wallHeight;
    const wallT = 0.28;
    const wallRootY = topGroundY + slabTopOffset;
    const undergroundSink = 1.2; // Sinks 1.2m into terrain so walls never float on slopes

    const addWallSegment = (
      idSuffix: string,
      wx: number,
      wz: number,
      wLen: number,
      wDepth: number
    ) => {
      const totalH = wallH + undergroundSink;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(wLen, totalH, wDepth),
        wallMat
      );
      mesh.position.set(wx, wallRootY + wallH - totalH / 2, wz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(wLen + 0.06, 0.08, wDepth + 0.06),
        pillarCapMat
      );
      cap.position.set(wx, wallRootY + wallH + 0.04, wz);
      scene.add(cap);

      this.colliders.push({
        id: `wall_${bp.id}_${idSuffix}`,
        minX: wx - wLen / 2 - 0.12,
        maxX: wx + wLen / 2 + 0.12,
        minZ: wz - wDepth / 2 - 0.12,
        maxZ: wz + wDepth / 2 + 0.12,
        minY: wallRootY - 2.0,
        maxY: wallRootY + wallH + 0.5,
      });
    };

    // West & East perimeter walls
    addWallSegment('west', bp.centerX - halfW, bp.centerZ, wallT, comp.padDepth);
    addWallSegment('east', bp.centerX + halfW, bp.centerZ, wallT, comp.padDepth);

    const backZ =
      comp.gateSide === 'south' ? bp.centerZ - halfD : bp.centerZ + halfD;
    addWallSegment('back', bp.centerX, backZ, comp.padWidth, wallT);

    // Front wall with 3.6m entrance opening for double metal gate
    const frontZ =
      comp.gateSide === 'south' ? bp.centerZ + halfD : bp.centerZ - halfD;
    const gateWidth = 3.6;
    const sideSegmentWidth = (comp.padWidth - gateWidth) / 2;

    addWallSegment(
      'front_left',
      bp.centerX - gateWidth / 2 - sideSegmentWidth / 2,
      frontZ,
      sideSegmentWidth,
      wallT
    );
    addWallSegment(
      'front_right',
      bp.centerX + gateWidth / 2 + sideSegmentWidth / 2,
      frontZ,
      sideSegmentWidth,
      wallT
    );

    // Gate Concrete Pillars (sunk into ground so they never float)
    const pillarTotalH = wallH + 0.32 + undergroundSink;
    [-gateWidth / 2, gateWidth / 2].forEach((pxOffset) => {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, pillarTotalH, 0.5),
        wallMat
      );
      pillar.position.set(
        bp.centerX + pxOffset,
        wallRootY + wallH + 0.32 - pillarTotalH / 2,
        frontZ
      );
      pillar.castShadow = true;
      scene.add(pillar);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.12, 0.62),
        pillarCapMat
      );
      cap.position.set(
        bp.centerX + pxOffset,
        wallRootY + wallH + 0.38,
        frontZ
      );
      scene.add(cap);
    });

    // Concrete Driveway Ramp connecting the compound gate smoothly to Williams Street
    const bridgeZ =
      comp.gateSide === 'south' ? frontZ + 1.2 : frontZ - 1.2;
    const bridgeY = EnvironmentSystem.getTerrainHeight(bp.centerX, bridgeZ);
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(gateWidth + 0.4, 0.9, 2.4),
      pillarCapMat
    );
    bridge.position.set(bp.centerX, bridgeY - 0.32, bridgeZ);
    bridge.receiveShadow = true;
    scene.add(bridge);

    // Interactive Metal Double Gate
    const gateMat = new THREE.MeshStandardMaterial({
      color: comp.gateColor,
      roughness: 0.45,
      metalness: 0.65,
    });

    const gatePivotGroup = new THREE.Group();
    gatePivotGroup.position.set(
      bp.centerX - gateWidth / 2 + 0.2,
      wallRootY,
      frontZ
    );

    const gateLeaf = new THREE.Mesh(
      new THREE.BoxGeometry(gateWidth - 0.4, wallH - 0.15, 0.12),
      gateMat
    );
    gateLeaf.position.set((gateWidth - 0.4) / 2, (wallH - 0.15) / 2 + 0.08, 0);
    gateLeaf.castShadow = true;
    gatePivotGroup.add(gateLeaf);
    scene.add(gatePivotGroup);

    const gateColliderId = `gate_col_${bp.id}`;
    const gateCollider: ColliderBox = {
      id: gateColliderId,
      minX: bp.centerX - gateWidth / 2,
      maxX: bp.centerX + gateWidth / 2,
      minZ: frontZ - 0.3,
      maxZ: frontZ + 0.3,
      minY: wallRootY - 1.0,
      maxY: wallRootY + wallH,
    };

    const startsOpen = Boolean(comp.isFeaturedNo22);
    if (startsOpen) {
      gatePivotGroup.rotation.y = -Math.PI * 0.58;
      gateCollider.minY = -999;
      gateCollider.maxY = -998;
    }

    this.colliders.push(gateCollider);

    const interactableObj: InteractiveObject = {
      id: `interact_gate_${bp.id}`,
      title: comp.isFeaturedNo22
        ? 'No. 22 Williams Street Gate'
        : `${bp.label} Gate`,
      subtitle: comp.isFeaturedNo22
        ? 'Primary Fonima residential compound · Tap Interact to open/close gate'
        : 'Residential compound metal gate',
      position: new THREE.Vector3(bp.centerX, wallRootY + 1.2, frontZ),
      radius: 3.8,
      type: 'gate',
      isOpen: startsOpen,
      mesh: gatePivotGroup,
      colliderId: gateColliderId,
      onInteract: () => {
        interactableObj.isOpen = !interactableObj.isOpen;
        if (interactableObj.isOpen) {
          gatePivotGroup.rotation.y = -Math.PI * 0.58;
          gateCollider.minY = -999;
          gateCollider.maxY = -998;
          return `Opened ${interactableObj.title} — Compound courtyard accessible.`;
        } else {
          gatePivotGroup.rotation.y = 0;
          gateCollider.minY = wallRootY - 1.0;
          gateCollider.maxY = wallRootY + wallH;
          return `Closed ${interactableObj.title}.`;
        }
      },
    };

    this.interactables.push(interactableObj);

    if (comp.isFeaturedNo22) {
      const porchZ = bp.centerZ + bp.depth / 2 + 1.4;
      this.interactables.push({
        id: 'interact_no22_veranda',
        title: 'No. 22 Williams Street Veranda',
        subtitle: 'Fonima / Goodrich, Freetown · Home Benchmark Point',
        position: new THREE.Vector3(bp.centerX - 1.5, wallRootY + 1.2, porchZ),
        radius: 3.6,
        type: 'landmark',
        onInteract: () =>
          'No. 22 Williams Street, Fonima: L-wing bungalow with golden-tan corrugated metal roof, shaded veranda, and walled courtyard.',
      });
    }
  }

  private buildRoadsideStructuresAndClutter(scene: THREE.Scene): void {
    // 1. Williams Street Provision Kiosk (Placed cleanly at X = -15.5, Z = +7.5 on South side of Williams St, away from Fonima Drive X=-23.5 and No. 21 X=0.5)
    const kioskX = -15.5;
    const kioskZ = 7.5;
    const ky = this.getMaxCornerTerrainHeight(kioskX, kioskZ, 3.2, 2.6);

    const kioskGroup = new THREE.Group();
    kioskGroup.position.set(kioskX, ky, kioskZ);

    // Sunk concrete plinth so kiosk never floats
    const kioskPlinth = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 1.0, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x8d8983, roughness: 0.9 })
    );
    kioskPlinth.position.y = -0.38;
    kioskPlinth.receiveShadow = true;
    kioskGroup.add(kioskPlinth);

    const kioskBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 2.2, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.78 })
    );
    kioskBody.position.y = 1.22;
    kioskBody.castShadow = true;
    kioskBody.receiveShadow = true;
    kioskGroup.add(kioskBody);

    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.12, 0.65),
      new THREE.MeshStandardMaterial({ color: 0x8c583a, roughness: 0.85 })
    );
    counter.position.set(0, 1.25, -1.25);
    kioskGroup.add(counter);

    const roofTex = ProceduralTextures.getCorrugatedRoofTexture('#7c3f2c', 0.5);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(3.3, 0.14, 2.9),
      new THREE.MeshStandardMaterial({
        map: roofTex,
        roughness: 0.6,
        metalness: 0.35,
      })
    );
    roof.position.set(0, 2.42, -0.15);
    roof.rotation.x = -0.12;
    roof.castShadow = true;
    kioskGroup.add(roof);

    const kioskSignTex = ProceduralTextures.getSignboardTexture(
      'Fonima Mini-Mart',
      'Provisions · Cold Water · Top-Up',
      '#b91c1c',
      '#ffffff',
      '#fde047'
    );
    const kioskSign = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.46, 0.05),
      new THREE.MeshStandardMaterial({ map: kioskSignTex, roughness: 0.5 })
    );
    kioskSign.position.set(0, 2.1, -1.14);
    kioskGroup.add(kioskSign);

    const benchMat = new THREE.MeshStandardMaterial({
      color: 0x6e472b,
      roughness: 0.9,
    });
    const benchSeat = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.48, 0.42),
      benchMat
    );
    benchSeat.position.set(2.2, 0.24, -0.5);
    benchSeat.castShadow = true;
    kioskGroup.add(benchSeat);

    scene.add(kioskGroup);

    this.colliders.push({
      id: 'kiosk_williams_st',
      minX: kioskX - 1.5,
      maxX: kioskX + 1.5,
      minZ: kioskZ - 1.3,
      maxZ: kioskZ + 1.3,
      minY: ky - 1.0,
      maxY: ky + 2.6,
    });

    this.interactables.push({
      id: 'interact_kiosk',
      title: 'Williams Street Provision Kiosk',
      subtitle: 'Roadside shop & wooden bench near Fonima Junction',
      position: new THREE.Vector3(kioskX, ky + 1.2, kioskZ - 1.3),
      radius: 3.4,
      type: 'kiosk',
      onInteract: () =>
        'Williams Street Provision Kiosk: Neighbourhood stall stocking bread, cold water sachets, and mobile top-up.',
    });
  }
}
