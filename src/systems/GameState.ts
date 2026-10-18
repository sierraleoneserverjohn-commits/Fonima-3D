import * as THREE from 'three';

export interface ColliderBox {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
  label?: string;
}

export interface InteractiveObject {
  id: string;
  title: string;
  subtitle: string;
  position: THREE.Vector3;
  radius: number;
  type:
    | 'gate'
    | 'door'
    | 'kiosk'
    | 'landmark'
    | 'well'
    | 'sign'
    | 'vehicle'
    | 'fuel'
    | 'market';
  isOpen?: boolean;
  mesh?: THREE.Object3D;
  colliderId?: string;
  onInteract: () => string;
}

export type GroundSurfaceType = 'asphalt' | 'concrete' | 'dirt' | 'grass';

export type PlayerAnimState = 'IDLE' | 'WALK' | 'RUN' | 'SPRINT' | 'JUMP';

export type CameraMode =
  | 'THIRD_PERSON'
  | 'FIRST_PERSON'
  | 'DRONE'
  | 'CINEMATIC';

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'heavy_rain'
  | 'mist';

export type RegionId =
  | 'FREETOWN'
  | 'HIGHWAY_WEST'
  | 'RURAL_CORRIDOR'
  | 'BO_APPROACH'
  | 'BO_CITY';

export type NavigationDestination = 'NONE' | 'BO' | 'FREETOWN';

export interface CameraSettings {
  mode: CameraMode;
  sensitivity: number; // 0.4 to 2.5
  distance: number; // 2.0 to 9.5m
  height: number; // 1.1 to 2.4m
  smoothing: number; // 0.2 to 1.0
  fov: number; // 45 to 80 deg
  droneSpeed: number; // 6 to 24 m/s
  cinematicShotIndex: number; // 0 = Auto Cycle, 1 = Orbit, 2 = Close-Up Face, 3 = Low-Angle Tracking, 4 = Wide City Pan
}

export type TrafficDensity = 'off' | 'low' | 'medium' | 'high';

export interface WorldSettings {
  dayDurationMinutes: number; // Default 30 minutes (configurable 15-30m)
  autoProgressTime: boolean;
  weather: WeatherCondition;
  trafficDensity: TrafficDensity;
}

export interface SavedProgressState {
  version: number;
  playerX: number;
  playerY: number;
  playerZ: number;
  playerHeading: number;
  vehicleX: number;
  vehicleY: number;
  vehicleZ: number;
  vehicleHeading: number;
  isDriving: boolean;
  currentRegion: RegionId;
  timeHours: number;
  weather: WeatherCondition;
  destination: NavigationDestination;
  hasVisitedBo: boolean;
}

export interface GameTelemetry {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  isGrounded: boolean;
  isSprinting: boolean;
  animState: PlayerAnimState;
  surfaceType: GroundSurfaceType;
  zoneName: string;
  regionId: RegionId;
  regionLabel: string;
  isDriving: boolean;
  vehicleSpeedKmh: number;
  vehiclePosition: { x: number; z: number };
  destination: NavigationDestination;
  distanceToDestinationMeters: number;
  activeStreamedChunks: number;
  nearbyInteractable: InteractiveObject | null;
  lastInteractionMessage: string | null;
  timeHours: number; // 0.0 to 24.0
  formattedClock: string; // e.g. "14:30"
  dayPhaseName: string; // Morning, Midday, Afternoon, Sunset, Evening, Night, Sunrise
  isNight: boolean;
  weather: WeatherCondition;
  cameraMode: CameraMode;
  audioEnabled: boolean;
  fps: number;
  trafficCount: number;
  trafficDensity: TrafficDensity;
}

export interface ControlInputState {
  moveX: number; // -1 to 1 (left/right or vehicle steering)
  moveY: number; // -1 to 1 (forward/backward or vehicle throttle/brake)
  droneVertical: number; // -1 (down) to +1 (up) in DRONE mode
  lookDeltaX: number;
  lookDeltaY: number;
  pinchZoomDelta: number;
  jumpRequested: boolean;
  sprintActive: boolean;
  interactRequested: boolean;
  vehicleThrottle: number; // 0 to 1 explicit gas pedal
  vehicleBrake: number; // 0 to 1 explicit brake/reverse pedal
  vehicleHandbrake: boolean; // explicit emergency / handbrake
  vehicleHornRequested: boolean;
}

const CAM_STORAGE_KEY = 'fonima_3d_camera_settings_v1';
const WORLD_STORAGE_KEY = 'fonima_3d_world_settings_v1';
const PROGRESS_STORAGE_KEY = 'sierra_leone_openworld_progress_v1';

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  mode: 'THIRD_PERSON',
  sensitivity: 1.0,
  distance: 4.4,
  height: 1.56,
  smoothing: 0.78,
  fov: 58,
  droneSpeed: 12.0,
  cinematicShotIndex: 0,
};

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  dayDurationMinutes: 30,
  autoProgressTime: true,
  weather: 'clear',
  trafficDensity: 'medium',
};

export const DEFAULT_PROGRESS_STATE: SavedProgressState = {
  version: 1,
  playerX: 0,
  playerY: 0,
  playerZ: -1.8,
  playerHeading: 0,
  vehicleX: 8.5,
  vehicleY: 0,
  vehicleZ: -1.6,
  vehicleHeading: -Math.PI / 2, // Facing East along Williams Street toward the Highway & Bo
  isDriving: false,
  currentRegion: 'FREETOWN',
  timeHours: 10.5,
  weather: 'clear',
  destination: 'BO',
  hasVisitedBo: false,
};

export function loadSavedCameraSettings(): CameraSettings {
  try {
    const raw = localStorage.getItem(CAM_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CAMERA_SETTINGS };
    return { ...DEFAULT_CAMERA_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CAMERA_SETTINGS };
  }
}

export function saveCameraSettings(settings: CameraSettings): void {
  try {
    localStorage.setItem(CAM_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSavedWorldSettings(): WorldSettings {
  try {
    const raw = localStorage.getItem(WORLD_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WORLD_SETTINGS };
    return { ...DEFAULT_WORLD_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_WORLD_SETTINGS };
  }
}

export function saveWorldSettings(settings: WorldSettings): void {
  try {
    localStorage.setItem(WORLD_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSavedProgressState(): SavedProgressState | null {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.playerX !== 'number' ||
      !Number.isFinite(parsed.playerX) ||
      typeof parsed?.vehicleX !== 'number' ||
      !Number.isFinite(parsed.vehicleX)
    ) {
      return null;
    }
    return { ...DEFAULT_PROGRESS_STATE, ...parsed };
  } catch {
    return null;
  }
}

export function saveProgressState(state: SavedProgressState): void {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}
