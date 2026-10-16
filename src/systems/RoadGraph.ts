import { EnvironmentSystem } from './Environment';

export interface RoadGraphNode {
  id: string;
  name: string;
  x: number;
  z: number;
  isCulDeSac?: boolean;
  turningRadius?: number;
  connections: string[]; // Segment IDs
}

export interface RoadGraphSegment {
  id: string;
  name: string;
  nodeAId: string;
  nodeBId: string;
  width: number;
  speedLimit: number; // m/s
  surface: 'asphalt' | 'laterite';
  hasCenterLine: boolean;
  hasEdgeLines: boolean;
  hasZebraCrossings?: boolean;
  length: number;
  dirX: number;
  dirZ: number;
  rightX: number;
  rightZ: number;
}

export class RoadGraph {
  public static readonly nodes: Map<string, RoadGraphNode> = new Map();
  public static readonly segments: Map<string, RoadGraphSegment> = new Map();
  public static readonly segmentList: RoadGraphSegment[] = [];
  public static readonly nodeList: RoadGraphNode[] = [];
  private static isInitialized = false;

  public static initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.nodes.clear();
    this.segments.clear();
    this.segmentList.length = 0;
    this.nodeList.length = 0;

    const addNode = (
      id: string,
      name: string,
      x: number,
      z: number,
      isCulDeSac = false,
      turningRadius = 8.0
    ): RoadGraphNode => {
      const existing = this.nodes.get(id);
      if (existing) {
        existing.name = name;
        existing.x = x;
        existing.z = z;
        existing.isCulDeSac = isCulDeSac;
        existing.turningRadius = turningRadius;
        return existing;
      }
      const node: RoadGraphNode = {
        id,
        name,
        x,
        z,
        isCulDeSac,
        turningRadius,
        connections: [],
      };
      this.nodes.set(id, node);
      this.nodeList.push(node);
      return node;
    };

    const addSegment = (
      id: string,
      name: string,
      nodeAId: string,
      nodeBId: string,
      width: number,
      speedLimit: number,
      surface: 'asphalt' | 'laterite' = 'asphalt',
      hasCenterLine = true,
      hasEdgeLines = true,
      hasZebraCrossings = false
    ): RoadGraphSegment | null => {
      const nodeA = this.nodes.get(nodeAId);
      const nodeB = this.nodes.get(nodeBId);
      if (!nodeA || !nodeB) {
        console.error(`Cannot connect missing nodes: ${nodeAId} -> ${nodeBId}`);
        return null;
      }

      const dx = nodeB.x - nodeA.x;
      const dz = nodeB.z - nodeA.z;
      const length = Math.hypot(dx, dz);
      if (length < 0.1) return null;

      const dirX = dx / length;
      const dirZ = dz / length;
      // 2D right-hand normal vector (perpendicular to travel heading)
      const rightX = dirZ;
      const rightZ = -dirX;

      const seg: RoadGraphSegment = {
        id,
        name,
        nodeAId,
        nodeBId,
        width,
        speedLimit,
        surface,
        hasCenterLine,
        hasEdgeLines,
        hasZebraCrossings,
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
      return seg;
    };

    // ==========================================
    // 1. FREETOWN / FONIMA / GOODRICH ROAD GRAPH
    // ==========================================
    // Williams Street (Z = 0)
    addNode('ft_williams_w', 'Williams St West Turnaround', -88, 0, true, 8.5);
    addNode('ft_jct_fonima_williams', 'Williams & Fonima Crossroad', -23.5, 0);
    addNode('ft_jct_east_williams', 'Williams & East Fonima Crossroad', 27.5, 0);
    addNode('ft_williams_e', 'Williams St East & Highway Gate', 95, 0);

    // Peninsula Road (Z = -59)
    addNode('ft_peninsula_w', 'Peninsula Rd West Turnaround', -88, -59, true, 9.0);
    addNode('ft_jct_fonima_peninsula', 'Peninsula & Fonima Jct', -23.5, -59);
    addNode('ft_jct_east_peninsula', 'Peninsula & East Fonima Jct', 27.5, -59);
    addNode('ft_peninsula_e', 'Peninsula Rd East Connector', 88, -59);

    // Fonima Drive (X = -23.5)
    addNode('ft_jct_fonima_north', 'Fonima & North Compound Lane', -23.5, -31);
    addNode('ft_jct_fonima_south', 'Fonima & South Compound Lane', -23.5, 33);
    addNode('ft_fonima_s', 'Fonima Drive South Turnaround', -23.5, 75, true, 8.0);

    // East Fonima Street (X = 27.5)
    addNode('ft_jct_east_north', 'East Fonima & North Compound Lane', 27.5, -31);
    addNode('ft_jct_east_south', 'East Fonima & South Compound Lane', 27.5, 33);
    addNode('ft_east_fonima_s', 'East Fonima South Turnaround', 27.5, 75, true, 8.0);

    // Compound Tracks (Dead-end loops)
    addNode('ft_north_track_w', 'North Compound West Turnaround', -72, -31, true, 7.5);
    addNode('ft_south_track_w', 'South Compound West Turnaround', -72, 33, true, 7.5);

    // Williams Street Segments
    addSegment('ft_seg_williams_w', 'Williams Street (West)', 'ft_williams_w', 'ft_jct_fonima_williams', 7.4, 10.0, 'asphalt', true, true, true);
    addSegment('ft_seg_williams_mid', 'Williams Street (Mid)', 'ft_jct_fonima_williams', 'ft_jct_east_williams', 7.4, 10.5, 'asphalt', true, true, true);
    addSegment('ft_seg_williams_e', 'Williams Street (East)', 'ft_jct_east_williams', 'ft_williams_e', 7.4, 12.0, 'asphalt', true, true, true);

    // Peninsula Road Segments
    addSegment('ft_seg_peninsula_w', 'Peninsula Road (West)', 'ft_peninsula_w', 'ft_jct_fonima_peninsula', 8.6, 13.0, 'asphalt', true, true, true);
    addSegment('ft_seg_peninsula_mid', 'Peninsula Road (Mid)', 'ft_jct_fonima_peninsula', 'ft_jct_east_peninsula', 8.6, 13.0, 'asphalt', true, true, true);
    addSegment('ft_seg_peninsula_e', 'Peninsula Road (East)', 'ft_jct_east_peninsula', 'ft_peninsula_e', 8.6, 13.0, 'asphalt', true, true, true);

    // Connector linking Peninsula Road East into Highway Gateway at Williams Street East
    addSegment('ft_seg_peninsula_hwy_link', 'Peninsula–Highway Link', 'ft_peninsula_e', 'ft_williams_e', 8.0, 11.0, 'asphalt', true, true, true);

    // Fonima Drive Segments (Cross street)
    addSegment('ft_seg_fonima_n', 'Fonima Drive (North)', 'ft_jct_fonima_peninsula', 'ft_jct_fonima_north', 6.2, 9.5, 'asphalt', true, true, false);
    addSegment('ft_seg_fonima_n_mid', 'Fonima Drive (North-Mid)', 'ft_jct_fonima_north', 'ft_jct_fonima_williams', 6.2, 9.5, 'asphalt', true, true, true);
    addSegment('ft_seg_fonima_s_mid', 'Fonima Drive (South-Mid)', 'ft_jct_fonima_williams', 'ft_jct_fonima_south', 6.2, 9.5, 'asphalt', true, true, true);
    addSegment('ft_seg_fonima_s', 'Fonima Drive (South)', 'ft_jct_fonima_south', 'ft_fonima_s', 6.2, 9.0, 'laterite', false, false, false);

    // East Fonima Street Segments
    addSegment('ft_seg_east_fonima_n', 'East Fonima Street (North)', 'ft_jct_east_peninsula', 'ft_jct_east_north', 6.2, 10.0, 'asphalt', true, true, false);
    addSegment('ft_seg_east_fonima_n_mid', 'East Fonima Street (North-Mid)', 'ft_jct_east_north', 'ft_jct_east_williams', 6.2, 10.0, 'asphalt', true, true, true);
    addSegment('ft_seg_east_fonima_s_mid', 'East Fonima Street (South-Mid)', 'ft_jct_east_williams', 'ft_jct_east_south', 6.2, 10.0, 'asphalt', true, true, true);
    addSegment('ft_seg_east_fonima_s', 'East Fonima Street (South)', 'ft_jct_east_south', 'ft_east_fonima_s', 6.2, 9.0, 'asphalt', true, true, false);

    // Compound Cross Tracks (Start & End at Real Nodes on Fonima & East Fonima Streets!)
    addSegment('ft_seg_north_track_w', 'North Compound West Lane', 'ft_north_track_w', 'ft_jct_fonima_north', 5.0, 7.5, 'laterite', false, false, false);
    addSegment('ft_seg_north_track_mid', 'North Compound Access Track', 'ft_jct_fonima_north', 'ft_jct_east_north', 5.0, 8.0, 'laterite', false, false, false);
    addSegment('ft_seg_south_track_w', 'South Compound West Lane', 'ft_south_track_w', 'ft_jct_fonima_south', 5.0, 7.5, 'laterite', false, false, false);
    addSegment('ft_seg_south_track_mid', 'South Compound Access Track', 'ft_jct_fonima_south', 'ft_jct_east_south', 5.0, 8.0, 'laterite', false, false, false);

    // ==========================================
    // 2. FREETOWN - BO HIGHWAY CORRIDOR
    // ==========================================
    const hwyXs = [95, 170, 240, 260, 340, 420, 500, 580, 642, 670, 698, 780, 860, 940, 1000, 1060];
    const hwyNodeIds: string[] = [];

    hwyXs.forEach((x, i) => {
      const z = x === 95 || x === 1060 ? 0 : EnvironmentSystem.getHighwayCenterZ(x);
      const id = i === 0 ? 'ft_williams_e' : i === hwyXs.length - 1 ? 'bo_gate' : `hwy_node_${x}`;
      if (i > 0 && i < hwyXs.length - 1) {
        let name = `Highway Mile marker (X=${x})`;
        if (x === 260) name = 'Songo Junction';
        else if (x === 500) name = 'Mile 91 Hub Junction';
        else if (x === 670) name = 'Sewa River Bridge';
        else if (x === 780) name = 'Taiama Village Junction';
        addNode(id, name, x, z);
      } else if (i === hwyXs.length - 1) {
        addNode('bo_gate', 'Bo City West Gateway', 1060, 0);
      }
      hwyNodeIds.push(id);
    });

    // Highway segments connecting nodes along the highway spine
    for (let i = 0; i < hwyNodeIds.length - 1; i++) {
      const nA = hwyNodeIds[i];
      const nB = hwyNodeIds[i + 1];
      const xA = hwyXs[i];
      const xB = hwyXs[i + 1];
      const isBridge = (xA >= 640 && xB <= 700);
      const width = isBridge ? 8.2 : 8.4;
      const speed = isBridge ? 12.0 : 15.5;
      addSegment(`hwy_seg_${xA}_${xB}`, `Bo Highway (${xA}m-${xB}m)`, nA, nB, width, speed, 'asphalt', true, true, false);
    }

    // Highway Side Spurs with proper turning circles (Songo Market, Mile 91 Fuel Stop, Taiama Village)
    // Songo Market Spur: starts at real node 'hwy_node_260'
    const songoZ = EnvironmentSystem.getHighwayCenterZ(260);
    addNode('hwy_songo_market', 'Songo Market Turnaround', 260, songoZ - 26, true, 8.5);
    addSegment('hwy_seg_songo_spur', 'Songo Market Access Road', 'hwy_node_260', 'hwy_songo_market', 6.0, 8.0, 'laterite', false, false, false);

    // Mile 91 Fuel Stop Spur: starts at real node 'hwy_node_500'
    const mile91Z = EnvironmentSystem.getHighwayCenterZ(500);
    addNode('hwy_mile91_fuel', 'Mile 91 NP Station Turnaround', 500, mile91Z + 26, true, 9.0);
    addSegment('hwy_seg_mile91_spur', 'Mile 91 Fuel Access Road', 'hwy_node_500', 'hwy_mile91_fuel', 7.0, 9.0, 'asphalt', true, true, false);

    // Taiama Village Spur: starts at real node 'hwy_node_780'
    const taiamaZ = EnvironmentSystem.getHighwayCenterZ(780);
    addNode('hwy_taiama_village', 'Taiama Village Turnaround', 780, taiamaZ - 26, true, 8.5);
    addSegment('hwy_seg_taiama_spur', 'Taiama Village Track', 'hwy_node_780', 'hwy_taiama_village', 6.0, 8.0, 'laterite', false, false, false);

    // ==========================================
    // 3. BO CITY CONNECTED STREET GRID
    // ==========================================
    // Bojon Street (Main E-W Arterial at Z = 0)
    addNode('bo_gate', 'Bo City West Gateway', 1060, 0);
    addNode('bo_jct_fenton', 'Bojon & Fenton Crossroad', 1150, 0);
    addNode('bo_jct_sewa', 'Bojon & Sewa Crossroad', 1250, 0);
    addNode('bo_clocktower', 'Bo Clocktower Roundabout', 1350, 0, true, 11.0);

    // Fenton Road (X = 1150) Crossings
    addNode('bo_jct_fenton_dambala', 'Fenton & Dambala Crossroad', 1150, -42);
    addNode('bo_jct_fenton_tikonko', 'Fenton & Tikonko Crossroad', 1150, 42);

    // Sewa Road (X = 1250) Crossings
    addNode('bo_jct_sewa_dambala', 'Sewa & Dambala Crossroad', 1250, -42);
    addNode('bo_jct_sewa_tikonko', 'Sewa & Tikonko Crossroad', 1250, 42);

    // Dambala Road Turnarounds (Z = -42)
    addNode('bo_dambala_w', 'Dambala Rd West Turnaround', 1090, -42, true, 8.0);
    addNode('bo_dambala_e', 'Dambala Rd East Turnaround', 1310, -42, true, 8.0);

    // Tikonko Road Turnarounds (Z = +42)
    addNode('bo_tikonko_w', 'Tikonko Rd West Turnaround', 1090, 42, true, 8.0);
    addNode('bo_tikonko_e', 'Tikonko Rd East Turnaround', 1310, 42, true, 8.0);

    // Bojon Street Segments
    addSegment('bo_seg_bojon_w', 'Bojon Street (West)', 'bo_gate', 'bo_jct_fenton', 9.4, 11.0, 'asphalt', true, true, true);
    addSegment('bo_seg_bojon_mid', 'Bojon Street (Commercial Strip)', 'bo_jct_fenton', 'bo_jct_sewa', 9.4, 11.0, 'asphalt', true, true, true);
    addSegment('bo_seg_bojon_e', 'Bojon Street (East to Clocktower)', 'bo_jct_sewa', 'bo_clocktower', 9.4, 10.0, 'asphalt', true, true, true);

    // Fenton Road Segments (N-S)
    addSegment('bo_seg_fenton_n', 'Fenton Road (North)', 'bo_jct_fenton_dambala', 'bo_jct_fenton', 7.6, 10.0, 'asphalt', true, true, true);
    addSegment('bo_seg_fenton_s', 'Fenton Road (South)', 'bo_jct_fenton', 'bo_jct_fenton_tikonko', 7.6, 10.0, 'asphalt', true, true, true);

    // Sewa Road Segments (N-S)
    addSegment('bo_seg_sewa_n', 'Sewa Road (North)', 'bo_jct_sewa_dambala', 'bo_jct_sewa', 7.6, 10.0, 'asphalt', true, true, true);
    addSegment('bo_seg_sewa_s', 'Sewa Road (South)', 'bo_jct_sewa', 'bo_jct_sewa_tikonko', 7.6, 10.0, 'asphalt', true, true, true);

    // Dambala Road Segments (E-W at Z = -42)
    addSegment('bo_seg_dambala_w', 'Dambala Road (West)', 'bo_dambala_w', 'bo_jct_fenton_dambala', 6.2, 9.0, 'laterite', false, false, false);
    addSegment('bo_seg_dambala_mid', 'Dambala Road (Mid)', 'bo_jct_fenton_dambala', 'bo_jct_sewa_dambala', 6.2, 9.5, 'laterite', false, false, false);
    addSegment('bo_seg_dambala_e', 'Dambala Road (East)', 'bo_jct_sewa_dambala', 'bo_dambala_e', 6.2, 9.0, 'laterite', false, false, false);

    // Tikonko Road Segments (E-W at Z = +42)
    addSegment('bo_seg_tikonko_w', 'Tikonko Road (West)', 'bo_tikonko_w', 'bo_jct_fenton_tikonko', 6.2, 9.0, 'laterite', false, false, false);
    addSegment('bo_seg_tikonko_mid', 'Tikonko Road (Mid)', 'bo_jct_fenton_tikonko', 'bo_jct_sewa_tikonko', 6.2, 9.5, 'laterite', false, false, false);
    addSegment('bo_seg_tikonko_e', 'Tikonko Road (East)', 'bo_jct_sewa_tikonko', 'bo_tikonko_e', 6.2, 9.0, 'laterite', false, false, false);
  }

  public static getNode(id: string): RoadGraphNode | undefined {
    this.initialize();
    return this.nodes.get(id);
  }

  public static getSegment(id: string): RoadGraphSegment | undefined {
    this.initialize();
    return this.segments.get(id);
  }

  public static getAllSegments(): RoadGraphSegment[] {
    this.initialize();
    return this.segmentList;
  }

  public static getAllNodes(): RoadGraphNode[] {
    this.initialize();
    return this.nodeList;
  }
}
