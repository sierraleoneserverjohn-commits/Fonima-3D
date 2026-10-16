import * as THREE from 'three';
import { GroundSurfaceType } from './GameState';
import { EnvironmentSystem } from './Environment';
import { ProceduralTextures } from './ProceduralTextures';
import { RoadGraph, RoadGraphNode, RoadGraphSegment } from './RoadGraph';

export class RoadsSystem {
  private asphaltMat!: THREE.MeshStandardMaterial;
  private asphaltJunctionMat!: THREE.MeshStandardMaterial;
  private lateriteMat!: THREE.MeshStandardMaterial;
  private lateriteShoulderMat!: THREE.MeshStandardMaterial;
  private centerLineMat!: THREE.MeshBasicMaterial;
  private edgeLineMat!: THREE.MeshBasicMaterial;
  private zebraMat!: THREE.MeshBasicMaterial;
  private curbConcreteMat!: THREE.MeshStandardMaterial;

  constructor(
    scene: THREE.Scene,
    getTerrainHeight: (x: number, z: number) => number
  ) {
    RoadGraph.initialize();
    this.initMaterials();
    this.buildConnectedRoadNetwork(scene, getTerrainHeight);
  }

  private initMaterials(): void {
    const asphaltTex = ProceduralTextures.getAsphaltRoadTexture();

    this.asphaltMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.82,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    this.asphaltJunctionMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.82,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    });

    this.lateriteMat = new THREE.MeshStandardMaterial({
      color: 0xaa5428,
      roughness: 0.94,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    this.lateriteShoulderMat = new THREE.MeshStandardMaterial({
      color: 0xb25b2f,
      roughness: 0.95,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.centerLineMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });

    this.edgeLineMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });

    this.zebraMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      polygonOffset: true,
      polygonOffsetFactor: -7,
      polygonOffsetUnits: -7,
    });

    this.curbConcreteMat = new THREE.MeshStandardMaterial({
      color: 0x8a867e,
      roughness: 0.88,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
  }

  private buildConnectedRoadNetwork(
    scene: THREE.Scene,
    getTerrainHeight: (x: number, z: number) => number
  ): void {
    const segments = RoadGraph.getAllSegments();
    const nodes = RoadGraph.getAllNodes();

    // 1. Build road ribbons for every edge in the graph
    segments.forEach((seg) => {
      this.buildSegmentRibbon(scene, seg, getTerrainHeight);
    });

    // 2. Build smooth junction patches where roads meet & dead-end turning circles
    nodes.forEach((node) => {
      if (node.connections.length >= 2) {
        this.buildJunctionPatch(scene, node, getTerrainHeight);
      } else if (node.isCulDeSac) {
        this.buildCulDeSac(scene, node, getTerrainHeight);
      }
    });
  }

  private buildSegmentRibbon(
    scene: THREE.Scene,
    seg: RoadGraphSegment,
    getTerrainHeight: (x: number, z: number) => number
  ): void {
    const nodeA = RoadGraph.getNode(seg.nodeAId)!;
    const nodeB = RoadGraph.getNode(seg.nodeBId)!;

    const length = seg.length;
    const steps = Math.max(12, Math.floor(length / 2.8));
    const angle = Math.atan2(seg.dirZ, seg.dirX);
    const midX = (nodeA.x + nodeB.x) / 2;
    const midZ = (nodeA.z + nodeB.z) / 2;

    // Helper: calculate elevation with bridge lift
    const getElev = (wx: number, wz: number, baseOffset: number): number => {
      let y = getTerrainHeight(wx, wz) + baseOffset;
      if (wx >= 642 && wx <= 698) {
        y += Math.sin(((wx - 642) / 56) * Math.PI) * 1.15;
      }
      return y;
    };

    // A. Underbed Laterite Dirt Shoulder
    const shoulderWidth = seg.width + 2.2;
    const shGeo = new THREE.PlaneGeometry(length, shoulderWidth, steps, 2);
    shGeo.rotateX(-Math.PI / 2);
    const shPos = shGeo.attributes.position;
    for (let i = 0; i < shPos.count; i++) {
      const lx = shPos.getX(i);
      const lz = shPos.getZ(i);
      const wx = midX + lx * Math.cos(angle) - lz * Math.sin(angle);
      const wz = midZ + lx * Math.sin(angle) + lz * Math.cos(angle);
      shPos.setY(i, getElev(wx, wz, 0.04));
    }
    shGeo.computeVertexNormals();
    const shMesh = new THREE.Mesh(shGeo, this.lateriteShoulderMat);
    shMesh.position.set(midX, 0, midZ);
    shMesh.rotation.y = -angle;
    shMesh.receiveShadow = true;
    shMesh.renderOrder = 2;
    scene.add(shMesh);

    // B. Asphalt Surface Ribbon
    const rdGeo = new THREE.PlaneGeometry(length, seg.width, steps, 4);
    rdGeo.rotateX(-Math.PI / 2);
    const rdPos = rdGeo.attributes.position;
    for (let i = 0; i < rdPos.count; i++) {
      const lx = rdPos.getX(i);
      const lz = rdPos.getZ(i);
      const wx = midX + lx * Math.cos(angle) - lz * Math.sin(angle);
      const wz = midZ + lx * Math.sin(angle) + lz * Math.cos(angle);
      const crown = Math.abs(lz) < seg.width * 0.28 ? 0.015 : 0.0;
      rdPos.setY(i, getElev(wx, wz, 0.08 + crown));
    }
    rdGeo.computeVertexNormals();
    const mat = seg.surface === 'asphalt' ? this.asphaltMat : this.lateriteMat;
    const rdMesh = new THREE.Mesh(rdGeo, mat);
    rdMesh.position.set(midX, 0, midZ);
    rdMesh.rotation.y = -angle;
    rdMesh.receiveShadow = true;
    rdMesh.renderOrder = 4;
    scene.add(rdMesh);

    // C. Center Yellow Dashed Line Markings (for 2-lane roads)
    if (seg.hasCenterLine && seg.width >= 6.8 && length > 6.0) {
      const dashLength = 3.6;
      const gapLength = 4.2;
      const totalDashPeriod = dashLength + gapLength;
      const startOffset = Math.max(3.0, (length % totalDashPeriod) / 2);

      for (let d = startOffset; d < length - 3.5; d += totalDashPeriod) {
        const t = d / length - 0.5;
        const lx = t * length;
        const wx = midX + lx * Math.cos(angle);
        const wz = midZ + lx * Math.sin(angle);
        const wy = getElev(wx, wz, 0.098);

        const dashGeo = new THREE.PlaneGeometry(dashLength, 0.16);
        dashGeo.rotateX(-Math.PI / 2);
        const dashMesh = new THREE.Mesh(dashGeo, this.centerLineMat);
        dashMesh.position.set(wx, wy, wz);
        dashMesh.rotation.y = -angle;
        dashMesh.renderOrder = 6;
        scene.add(dashMesh);
      }
    }

    // D. Solid White Edge Lines (continuous along road edges)
    if (seg.hasEdgeLines && seg.width >= 6.8 && length > 4.0) {
      const edgeOffset = seg.width * 0.46;
      [-edgeOffset, edgeOffset].forEach((sideZ) => {
        const edgeSteps = Math.max(8, Math.floor(length / 4.0));
        const edgeGeo = new THREE.PlaneGeometry(length - 2.0, 0.14, edgeSteps, 1);
        edgeGeo.rotateX(-Math.PI / 2);
        const ePos = edgeGeo.attributes.position;
        for (let i = 0; i < ePos.count; i++) {
          const lx = ePos.getX(i);
          const lz = sideZ;
          const wx = midX + lx * Math.cos(angle) - lz * Math.sin(angle);
          const wz = midZ + lx * Math.sin(angle) + lz * Math.cos(angle);
          ePos.setY(i, getElev(wx, wz, 0.094));
        }
        edgeGeo.computeVertexNormals();
        const edgeMesh = new THREE.Mesh(edgeGeo, this.edgeLineMat);
        edgeMesh.position.set(midX, 0, midZ);
        edgeMesh.rotation.y = -angle;
        edgeMesh.renderOrder = 5;
        scene.add(edgeMesh);
      });
    }

    // E. Zebra Crossings at Main Junction Approaches
    if (seg.hasZebraCrossings && length >= 14.0) {
      // Place crossing near nodeA and nodeB
      [4.2, length - 4.2].forEach((posAlong) => {
        const t = posAlong / length - 0.5;
        const lx = t * length;
        const cx = midX + lx * Math.cos(angle);
        const cz = midZ + lx * Math.sin(angle);

        // 6 white stripes across the road
        const numStripes = 6;
        const stripeWidth = 0.45;
        const stripeLength = 2.4;
        const totalSpan = seg.width * 0.72;
        const stripeStep = totalSpan / (numStripes - 1);

        for (let s = 0; s < numStripes; s++) {
          const lz = -totalSpan / 2 + s * stripeStep;
          const wx = cx - lz * Math.sin(angle);
          const wz = cz + lz * Math.cos(angle);
          const wy = getElev(wx, wz, 0.096);

          const stripeMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(stripeLength, stripeWidth),
            this.zebraMat
          );
          stripeMesh.rotation.x = -Math.PI / 2;
          stripeMesh.rotation.z = -angle;
          stripeMesh.position.set(wx, wy, wz);
          stripeMesh.renderOrder = 7;
          scene.add(stripeMesh);
        }
      });
    }
  }

  // Smooth junction patch where 2 or more roads meet so there are NO gaps and NO flickering
  private buildJunctionPatch(
    scene: THREE.Scene,
    node: RoadGraphNode,
    getTerrainHeight: (x: number, z: number) => number
  ): void {
    let maxWidth = 7.0;
    node.connections.forEach((segId) => {
      const seg = RoadGraph.getSegment(segId);
      if (seg && seg.width > maxWidth) {
        maxWidth = seg.width;
      }
    });

    const patchRadius = maxWidth * 0.75 + 1.2;
    const segmentsCount = 24;

    // Smooth circular asphalt patch sampling terrain elevation around its perimeter
    const patchGeo = new THREE.CircleGeometry(patchRadius, segmentsCount);
    patchGeo.rotateX(-Math.PI / 2);
    const pos = patchGeo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = node.x + lx;
      const wz = node.z + lz;
      let wy = getTerrainHeight(wx, wz) + 0.082;
      if (wx >= 642 && wx <= 698) {
        wy += Math.sin(((wx - 642) / 56) * Math.PI) * 1.15;
      }
      pos.setY(i, wy);
    }
    patchGeo.computeVertexNormals();

    const patchMesh = new THREE.Mesh(patchGeo, this.asphaltJunctionMat);
    patchMesh.position.set(node.x, 0, node.z);
    patchMesh.receiveShadow = true;
    patchMesh.renderOrder = 5;
    scene.add(patchMesh);

    // Laterite underbed for junction
    const underGeo = new THREE.CircleGeometry(patchRadius + 1.8, 20);
    underGeo.rotateX(-Math.PI / 2);
    const uPos = underGeo.attributes.position;
    for (let i = 0; i < uPos.count; i++) {
      const wx = node.x + uPos.getX(i);
      const wz = node.z + uPos.getZ(i);
      uPos.setY(i, getTerrainHeight(wx, wz) + 0.04);
    }
    underGeo.computeVertexNormals();
    const underMesh = new THREE.Mesh(underGeo, this.lateriteShoulderMat);
    underMesh.position.set(node.x, 0, node.z);
    underMesh.receiveShadow = true;
    underMesh.renderOrder = 2;
    scene.add(underMesh);
  }

  // Cul-de-sac turning circle for intentional dead-ends
  private buildCulDeSac(
    scene: THREE.Scene,
    node: RoadGraphNode,
    getTerrainHeight: (x: number, z: number) => number
  ): void {
    const radius = node.turningRadius || 8.0;
    const segmentsCount = 28;

    // Outer laterite bed
    const bedGeo = new THREE.CircleGeometry(radius + 1.8, segmentsCount);
    bedGeo.rotateX(-Math.PI / 2);
    const bPos = bedGeo.attributes.position;
    for (let i = 0; i < bPos.count; i++) {
      const wx = node.x + bPos.getX(i);
      const wz = node.z + bPos.getZ(i);
      bPos.setY(i, getTerrainHeight(wx, wz) + 0.04);
    }
    bedGeo.computeVertexNormals();
    const bedMesh = new THREE.Mesh(bedGeo, this.lateriteShoulderMat);
    bedMesh.position.set(node.x, 0, node.z);
    bedMesh.renderOrder = 2;
    scene.add(bedMesh);

    // Asphalt turning circle
    const turnGeo = new THREE.CircleGeometry(radius, segmentsCount);
    turnGeo.rotateX(-Math.PI / 2);
    const tPos = turnGeo.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
      const wx = node.x + tPos.getX(i);
      const wz = node.z + tPos.getZ(i);
      tPos.setY(i, getTerrainHeight(wx, wz) + 0.082);
    }
    turnGeo.computeVertexNormals();
    const turnMesh = new THREE.Mesh(turnGeo, this.asphaltMat);
    turnMesh.position.set(node.x, 0, node.z);
    turnMesh.receiveShadow = true;
    turnMesh.renderOrder = 4;
    scene.add(turnMesh);

    // Outer white perimeter ring
    const ringGeo = new THREE.RingGeometry(radius - 0.28, radius, segmentsCount);
    ringGeo.rotateX(-Math.PI / 2);
    const rPos = ringGeo.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const wx = node.x + rPos.getX(i);
      const wz = node.z + rPos.getZ(i);
      rPos.setY(i, getTerrainHeight(wx, wz) + 0.094);
    }
    ringGeo.computeVertexNormals();
    const ringMesh = new THREE.Mesh(ringGeo, this.edgeLineMat);
    ringMesh.position.set(node.x, 0, node.z);
    ringMesh.renderOrder = 5;
    scene.add(ringMesh);
  }

  public setWetness(wetness: number): void {
    const r = 0.82 - wetness * 0.54;
    const m = 0.05 + wetness * 0.32;
    this.asphaltMat.roughness = r;
    this.asphaltMat.metalness = m;
    this.asphaltJunctionMat.roughness = r;
    this.asphaltJunctionMat.metalness = m;
    this.lateriteMat.roughness = 0.94 - wetness * 0.45;
    this.lateriteShoulderMat.roughness = 0.95 - wetness * 0.45;
  }

  // Calculate distance from point (px, pz) to line segment (x1, z1) -> (x2, z2)
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

  // Get exact ground/road surface height at (x, z)
  public getSurfaceHeightAt(x: number, z: number): number {
    const baseH = EnvironmentSystem.getTerrainHeight(x, z);

    // 1. Inside No. 22 Williams Street Compound concrete slab
    if (Math.abs(x - 0) <= 7.0 && Math.abs(z - -16.0) <= 7.4) {
      return baseH + 0.22;
    }

    // 2. Check Sewa River Bridge Lift
    let bridgeLift = 0;
    if (x >= 642 && x <= 698) {
      const hwyZ = EnvironmentSystem.getHighwayCenterZ(x);
      if (Math.abs(z - hwyZ) < 6.5) {
        bridgeLift = Math.sin(((x - 642) / 56) * Math.PI) * 1.15;
      }
    }

    // 3. Find closest RoadGraph segment
    const segments = RoadGraph.getAllSegments();
    let bestOffset = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const nodeA = RoadGraph.getNode(seg.nodeAId);
      const nodeB = RoadGraph.getNode(seg.nodeBId);
      if (!nodeA || !nodeB) continue;

      const d = this.distToSegment(x, z, nodeA.x, nodeA.z, nodeB.x, nodeB.z);
      if (d <= seg.width * 0.5) {
        const crown = d < seg.width * 0.28 ? 0.015 : 0.0;
        bestOffset = Math.max(bestOffset, 0.08 + crown);
      } else if (d <= seg.width * 0.5 + 1.2) {
        bestOffset = Math.max(bestOffset, 0.04);
      }
    }

    // 4. Check junction patches and cul-de-sacs
    const nodes = RoadGraph.getAllNodes();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const distToNode = Math.hypot(x - n.x, z - n.z);
      const r = n.isCulDeSac ? (n.turningRadius || 8.0) : 6.5;
      if (distToNode <= r) {
        bestOffset = Math.max(bestOffset, 0.082);
      }
    }

    return baseH + bestOffset + bridgeLift;
  }

  // Get ground surface type for footstep sounds & tire friction
  public getSurfaceTypeAt(x: number, z: number): GroundSurfaceType {
    if (Math.hypot(x - 0, z - -16.0) < 7.5) {
      return 'concrete';
    }

    const segments = RoadGraph.getAllSegments();
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const nodeA = RoadGraph.getNode(seg.nodeAId);
      const nodeB = RoadGraph.getNode(seg.nodeBId);
      if (!nodeA || !nodeB) continue;

      const d = this.distToSegment(x, z, nodeA.x, nodeA.z, nodeB.x, nodeB.z);
      if (d <= seg.width * 0.52) {
        return seg.surface === 'asphalt' ? 'asphalt' : 'dirt';
      }
      if (d <= seg.width * 0.75) {
        return 'dirt';
      }
    }

    const nodes = RoadGraph.getAllNodes();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const dist = Math.hypot(x - n.x, z - n.z);
      if (dist <= 8.5) {
        return 'asphalt';
      }
    }

    const noise = (Math.sin(x * 0.11) + Math.cos(z * 0.13)) * 0.5;
    if (noise > 0.12 || Math.hypot(x, z) > 65) {
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
      if (Math.abs(x - 260) < 48) {
        return 'Songo Junction Settlement · Highway';
      }
      return 'Freetown–Bo Highway · Western Outskirts';
    }

    // 3. Mile 91 Trading & Fuel Stop (340 < X <= 620)
    if (x <= 620) {
      if (Math.abs(x - 500) < 55) {
        return 'Mile 91 Highway Hub · NP Fuel & Market Stalls';
      }
      return 'Moyamba–Tonkolili Countryside · Bo Highway';
    }

    // 4. Sewa River Bridge & Taiama Village (620 < X <= 900)
    if (x <= 900) {
      if (Math.abs(x - 670) < 42) {
        return 'Sewa River Bridge · Scenic Crossing';
      }
      if (Math.abs(x - 780) < 52) {
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
      return 'Bojon & Fenton Commercial Crossroad';
    }
    if (Math.hypot(x - 1250, z - 0) < 22) {
      return 'Bojon & Sewa Market Crossroad';
    }
    if (Math.hypot(x - 1350, z - 0) < 24) {
      return 'Bo Clocktower Roundabout · Bojon Street, Bo';
    }
    if (Math.abs(z) < 8) {
      return 'Bojon Street · Bo City Center';
    }
    if (Math.abs(x - 1150) < 8) {
      return 'Fenton Road · Bo Commercial Strip';
    }
    if (Math.abs(x - 1250) < 8) {
      return 'Sewa Road · Bo Central Market';
    }
    if (Math.abs(z - -42) < 10) {
      return 'Dambala Road Residential Quarter · Bo';
    }
    if (Math.abs(z - 42) < 10) {
      return 'Tikonko Road Neighborhood · Bo';
    }
    return 'Bo City · Southern Province, Sierra Leone';
  }
}
