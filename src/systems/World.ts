import * as THREE from 'three';
import {
  ColliderBox,
  ControlInputState,
  DEFAULT_PROGRESS_STATE,
  GameTelemetry,
  GroundSurfaceType,
  InteractiveObject,
  NavigationDestination,
  loadSavedProgressState,
  saveProgressState,
} from './GameState';
import { LightingSystem } from './Lighting';
import { EnvironmentSystem } from './Environment';
import { RoadsSystem } from './Roads';
import { BuildingsSystem } from './Buildings';
import { PlayerSystem } from './Player';
import { CameraSystem } from './Camera';
import { AudioSystem } from './Audio';
import { VehicleSystem } from './Vehicle';
import { WorldStreamingSystem } from './WorldStreaming';
import { TrafficSystem } from './Traffic';

export class WorldSystem {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  public lighting: LightingSystem;
  public environment: EnvironmentSystem;
  public roads: RoadsSystem;
  public buildings: BuildingsSystem;
  public player: PlayerSystem;
  public vehicle: VehicleSystem;
  public worldStreaming: WorldStreamingSystem;
  public traffic: TrafficSystem;
  public cameraSystem: CameraSystem;
  public audio: AudioSystem;

  private freetownColliders: ColliderBox[] = [];
  private freetownInteractables: InteractiveObject[] = [];

  public destination: NavigationDestination = 'BO';
  public hasVisitedBo: boolean = false;
  private lastRegionId: string = 'FREETOWN';
  private saveTimer: number = 0;

  private lastInteractionMessage: string | null =
    'Walk to your 4x4 SUV on Williams Street and tap "Enter Car" to drive the highway journey to Bo City!';
  private messageClearTimer: number = 7.5;

  private frameCount: number = 0;
  private fpsAccumulator: number = 0;
  private currentFps: number = 60;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'default',
      depth: true,
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.lighting = new LightingSystem(this.scene);
    this.environment = new EnvironmentSystem(this.scene);
    this.roads = new RoadsSystem(
      this.scene,
      EnvironmentSystem.getTerrainHeight
    );
    this.buildings = new BuildingsSystem(this.scene);
    this.player = new PlayerSystem(this.scene);
    this.vehicle = new VehicleSystem(
      this.scene,
      8.5,
      -1.6,
      -Math.PI / 2,
      (x, z) => this.roads.getSurfaceHeightAt(x, z)
    );
    this.worldStreaming = new WorldStreamingSystem(this.scene);
    this.cameraSystem = new CameraSystem(
      window.innerWidth / window.innerHeight
    );
    this.audio = new AudioSystem();
    this.traffic = new TrafficSystem(this.scene, this.roads);

    this.freetownColliders = [
      ...this.environment.colliders,
      ...this.buildings.colliders,
    ];
    this.freetownInteractables = [
      ...this.environment.interactables,
      ...this.buildings.interactables,
    ];

    this.restoreSavedProgress();
    this.precompileAndWarmUp();
  }

  // Ensures all scene matrices, initial streamed chunks, and camera matrices
  // are synced before the first requestAnimationFrame tick runs
  public precompileAndWarmUp(): void {
    const activePos = this.vehicle.isPlayerDriving
      ? this.vehicle.position
      : this.player.position;

    // 1. Pre-build initial streamed chunks around the starting region (Freetown, Highway, or Bo City)
    this.worldStreaming.preloadInitialChunks(activePos.x);

    // 2. Sync initial lighting, wind matrices, and camera matrices
    this.lighting.update(0.016, activePos);
    this.environment.updateWindAnimation(0.016, this.lighting.settings.weather);
    this.environment.updateStreetLightsAndWetness(
      this.lighting.streetLightActivation,
      this.lighting.wetness,
      activePos,
      this.worldStreaming.activeStreetLightPositions
    );
    this.buildings.setNightLighting(this.lighting.streetLightActivation);
    this.vehicle.setNightMode(this.lighting.streetLightActivation);

    // 3. Snap camera immediately to the active target so frame 1 is properly framed
    this.cameraSystem.camera.position.set(
      activePos.x,
      activePos.y + 2.4,
      activePos.z + 4.4
    );
    this.cameraSystem.camera.lookAt(
      activePos.x,
      activePos.y + 1.5,
      activePos.z
    );
    this.cameraSystem.camera.updateMatrixWorld(true);
    this.scene.updateMatrixWorld(true);
  }

  public isContextLost(): boolean {
    try {
      const gl = this.renderer.getContext();
      return !gl || gl.isContextLost();
    } catch {
      return true;
    }
  }

  private restoreSavedProgress(): void {
    const saved = loadSavedProgressState();
    if (!saved) return;

    this.destination = saved.destination || 'BO';
    this.hasVisitedBo = Boolean(saved.hasVisitedBo);

    if (
      Number.isFinite(saved.timeHours) &&
      saved.timeHours >= 0 &&
      saved.timeHours <= 24
    ) {
      this.lighting.setTimeHours(saved.timeHours);
    }

    if (saved.weather) {
      this.lighting.updateWorldSettings({ weather: saved.weather });
    }

    // Restore vehicle position
    const vx = Math.max(-90, Math.min(1335, saved.vehicleX));
    const vz = Math.max(-90, Math.min(90, saved.vehicleZ));
    this.vehicle.position.set(vx, this.roads.getSurfaceHeightAt(vx, vz), vz);
    this.vehicle.heading = Number.isFinite(saved.vehicleHeading)
      ? saved.vehicleHeading
      : -Math.PI / 2;
    this.vehicle.alignToRoadSurface();

    // Restore player position & driving state
    const px = Math.max(-90, Math.min(1335, saved.playerX));
    const pz = Math.max(-90, Math.min(90, saved.playerZ));
    const py = EnvironmentSystem.getTerrainHeight(px, pz);
    this.player.position.set(px, py, pz);
    this.player.heading = Number.isFinite(saved.playerHeading)
      ? saved.playerHeading
      : 0;
    this.player.group.position.copy(this.player.position);
    this.player.group.rotation.y = this.player.heading;

    if (saved.isDriving) {
      this.enterVehicle();
    }

    const regionInfo = WorldStreamingSystem.getRegionForX(
      saved.isDriving ? vx : px
    );
    this.lastRegionId = regionInfo.id;
    if (regionInfo.id === 'BO_CITY') {
      this.lastInteractionMessage =
        'Restored session in Bo City ("Sweet Bo"). Explore Bojon Street, Bo Clocktower, or drive back toward Freetown!';
      this.messageClearTimer = 6.5;
    }
  }

  public saveCurrentProgress(): void {
    const activeX = this.vehicle.isPlayerDriving
      ? this.vehicle.position.x
      : this.player.position.x;
    const regionInfo = WorldStreamingSystem.getRegionForX(activeX);

    saveProgressState({
      ...DEFAULT_PROGRESS_STATE,
      playerX: Number(this.player.position.x.toFixed(2)),
      playerY: Number(this.player.position.y.toFixed(2)),
      playerZ: Number(this.player.position.z.toFixed(2)),
      playerHeading: Number(this.player.heading.toFixed(3)),
      vehicleX: Number(this.vehicle.position.x.toFixed(2)),
      vehicleY: Number(this.vehicle.position.y.toFixed(2)),
      vehicleZ: Number(this.vehicle.position.z.toFixed(2)),
      vehicleHeading: Number(this.vehicle.heading.toFixed(3)),
      isDriving: this.vehicle.isPlayerDriving,
      currentRegion: regionInfo.id,
      timeHours: Number(this.lighting.timeHours.toFixed(2)),
      weather: this.lighting.settings.weather,
      destination: this.destination,
      hasVisitedBo: this.hasVisitedBo,
    });
  }

  public setNavigationDestination(dest: NavigationDestination): void {
    this.destination = dest;
    this.saveCurrentProgress();
    if (dest === 'BO') {
      this.lastInteractionMessage =
        'Navigation set to BO CITY (Bo Clocktower). Head East (+X) along Williams Street onto the Freetown–Bo Highway.';
      this.messageClearTimer = 5.0;
    } else if (dest === 'FREETOWN') {
      this.lastInteractionMessage =
        'Navigation set to FREETOWN (No. 22 Williams St, Fonima). Head West (-X) along the Highway.';
      this.messageClearTimer = 5.0;
    } else {
      this.lastInteractionMessage = 'Navigation destination cleared.';
      this.messageClearTimer = 3.0;
    }
  }

  public enterVehicle(): void {
    if (this.vehicle.isPlayerDriving) return;
    this.vehicle.isPlayerDriving = true;
    this.player.group.visible = false;
    this.player.position.copy(this.vehicle.position);
    // Align third-person camera behind the SUV's driving direction
    this.cameraSystem.yaw = this.vehicle.heading;
    this.audio.playInteract(true);
    this.lastInteractionMessage =
      'Driving 4x4 SUV (SL-FT 4022). Steer with Left Joystick, accelerate with Gas/Up, or tap Exit Car anytime.';
    this.messageClearTimer = 5.5;
    this.saveCurrentProgress();
  }

  public exitVehicle(): void {
    if (!this.vehicle.isPlayerDriving) return;
    this.vehicle.isPlayerDriving = false;
    const exitPos = this.vehicle.getDriverExitPosition();
    this.player.position.copy(exitPos);
    this.player.velocity.set(0, 0, 0);
    this.player.heading = this.vehicle.heading;
    this.player.group.position.copy(exitPos);
    this.player.group.rotation.y = this.player.heading;
    this.player.group.visible = true;
    this.audio.playInteract(true);
    this.lastInteractionMessage =
      'Exited vehicle. You can now explore the area on foot.';
    this.messageClearTimer = 4.0;
    this.saveCurrentProgress();
  }

  public toggleVehicleEnterExit(): void {
    if (this.vehicle.isPlayerDriving) {
      this.exitVehicle();
    } else {
      const dist = this.player.position.distanceTo(this.vehicle.position);
      if (dist <= 6.0) {
        this.enterVehicle();
      } else {
        // Summon / walk to nearby parked SUV if player requests from UI
        this.lastInteractionMessage = `Walk closer to your 4x4 SUV (${Math.round(dist)}m away) to enter.`;
        this.messageClearTimer = 3.5;
      }
    }
  }

  public resetToWilliamsStreetFreetown(): void {
    if (this.vehicle.isPlayerDriving) {
      this.exitVehicle();
    }
    this.player.respawnAtWilliamsStreet();
    const vy = this.roads.getSurfaceHeightAt(8.5, -1.6);
    this.vehicle.position.set(8.5, vy, -1.6);
    this.vehicle.heading = -Math.PI / 2;
    this.vehicle.speed = 0;
    this.vehicle.alignToRoadSurface();
    this.cameraSystem.yaw = 0;
    this.saveCurrentProgress();
    this.lastInteractionMessage =
      'Returned to No. 22 Williams Street, Fonima (Freetown). Your 4x4 SUV is parked nearby.';
    this.messageClearTimer = 4.5;
  }

  public update(dt: number, input: ControlInputState): GameTelemetry {
    const safeDt = Math.min(dt, 0.05);

    // FPS tracking
    this.frameCount++;
    this.fpsAccumulator += dt;
    if (this.fpsAccumulator >= 0.5) {
      this.currentFps = Math.round(this.frameCount / this.fpsAccumulator);
      this.frameCount = 0;
      this.fpsAccumulator = 0;
    }

    // Apply camera look rotation
    if (input.lookDeltaX !== 0 || input.lookDeltaY !== 0) {
      this.cameraSystem.applyLookDelta(input.lookDeltaX, input.lookDeltaY);
      input.lookDeltaX = 0;
      input.lookDeltaY = 0;
    }

    if (input.vehicleHornRequested) {
      input.vehicleHornRequested = false;
      this.audio.playCarHorn();
    }

    // Combine Freetown colliders + currently streamed Highway/Bo colliders
    const activeColliders: ColliderBox[] = [
      ...this.freetownColliders,
      ...this.worldStreaming.activeColliders,
    ];
    if (!this.vehicle.isPlayerDriving) {
      activeColliders.push(this.vehicle.getParkedCollider());
    }

    const activeActorPos = this.vehicle.isPlayerDriving
      ? this.vehicle.position
      : this.player.position;

    const currentSurface: GroundSurfaceType = this.roads.getSurfaceTypeAt(
      activeActorPos.x,
      activeActorPos.z
    );

    const camMode = this.cameraSystem.settings.mode;
    const isWet = this.lighting.wetness > 0.35;

    // Update Vehicle or Foot Player
    if (this.vehicle.isPlayerDriving) {
      if (camMode !== 'DRONE') {
        this.vehicle.update(safeDt, input, currentSurface, activeColliders);
        // Smoothly follow vehicle heading with camera when driving forward
        if (Math.abs(this.vehicle.speed) > 1.2) {
          let angleDiff = this.vehicle.heading - this.cameraSystem.yaw;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          this.cameraSystem.yaw += angleDiff * Math.min(1, safeDt * 2.6);
        }
      }
      this.player.position.copy(this.vehicle.position);
      this.player.heading = this.vehicle.heading;
      this.player.currentSpeed = Math.abs(this.vehicle.speed);
      this.player.isGrounded = true;
      input.jumpRequested = false;
    } else {
      // Update parked vehicle physics
      const emptyInput: ControlInputState = {
        moveX: 0,
        moveY: 0,
        droneVertical: 0,
        lookDeltaX: 0,
        lookDeltaY: 0,
        pinchZoomDelta: 0,
        jumpRequested: false,
        sprintActive: false,
        interactRequested: false,
        vehicleThrottle: 0,
        vehicleBrake: 0,
        vehicleHornRequested: false,
      };
      this.vehicle.update(safeDt, emptyInput, currentSurface, activeColliders);

      if (camMode !== 'DRONE') {
        this.player.update(
          safeDt,
          input,
          this.cameraSystem.yaw,
          activeColliders,
          () => this.audio.playJump(),
          (speed) => this.audio.playSurfaceFootstep(currentSurface, speed, isWet)
        );
        input.jumpRequested = false;
      } else {
        this.player.update(
          safeDt,
          emptyInput,
          this.cameraSystem.yaw,
          activeColliders
        );
        input.jumpRequested = false;
      }
    }

    // Update active camera mode (follows either player on foot or 4x4 SUV when driving)
    const followPos = this.vehicle.isPlayerDriving
      ? this.vehicle.position
      : this.player.position;
    const followHeading = this.vehicle.isPlayerDriving
      ? this.vehicle.heading
      : this.player.heading;
    const followSpeed = this.vehicle.isPlayerDriving
      ? Math.abs(this.vehicle.speed)
      : this.player.currentSpeed;

    this.cameraSystem.update(
      safeDt,
      input,
      followPos,
      followHeading,
      followSpeed,
      this.player.isGrounded,
      this.player.isSprinting ||
        (this.vehicle.isPlayerDriving && Math.abs(this.vehicle.speed) > 16),
      activeColliders
    );

    const focusPos =
      camMode === 'DRONE' ? this.cameraSystem.dronePos : followPos;

    // Update 24-hour solar/lunar lighting & weather particles across Freetown, Highway & Bo
    this.lighting.update(safeDt, focusPos);

    // Update World Streaming (loads nearby 100m chunks, unloads distant chunks)
    this.worldStreaming.update(
      safeDt,
      focusPos,
      followPos,
      this.lighting.streetLightActivation,
      this.lighting.wetness
    );

    // Update Traffic System (Dynamic cars driving along roads with instanced rendering, right-hand rule, anti-collision, and 60 FPS auto-throttling)
    this.traffic.update(
      safeDt,
      focusPos,
      this.currentFps,
      this.vehicle.position,
      this.vehicle.isPlayerDriving
    );

    // Sync night lights, streetlights, house windows & wet road sheen
    this.environment.updateWindAnimation(safeDt, this.lighting.settings.weather);
    this.environment.updateStreetLightsAndWetness(
      this.lighting.streetLightActivation,
      this.lighting.wetness,
      focusPos,
      this.worldStreaming.activeStreetLightPositions
    );
    this.roads.setWetness(this.lighting.wetness);
    this.buildings.setNightLighting(this.lighting.streetLightActivation);
    this.vehicle.setNightMode(this.lighting.streetLightActivation);

    // Update 3D spatial environmental sound emitters
    this.audio.updateSpatialWorld(
      safeDt,
      focusPos,
      camMode === 'DRONE' ? this.cameraSystem.droneYaw : this.cameraSystem.yaw,
      this.lighting.isNight,
      this.lighting.settings.weather
    );

    // Region Transition Announcements & Auto-Save
    const regionInfo = WorldStreamingSystem.getRegionForX(followPos.x);
    if (regionInfo.id !== this.lastRegionId) {
      this.lastRegionId = regionInfo.id;
      if (regionInfo.id === 'HIGHWAY_WEST') {
        this.lastInteractionMessage =
          'Leaving Goodrich / Freetown — Entering the Freetown–Bo Highway heading East.';
      } else if (regionInfo.id === 'RURAL_CORRIDOR') {
        this.lastInteractionMessage =
          'Traveling through Rural Sierra Leone (Mile 91 & Sewa River Corridor).';
      } else if (regionInfo.id === 'BO_APPROACH') {
        this.lastInteractionMessage =
          'Approaching Bo City ("Sweet Bo"), Capital of Southern Province!';
      } else if (regionInfo.id === 'BO_CITY') {
        this.hasVisitedBo = true;
        this.lastInteractionMessage =
          'Arrived in Bo City! Explore Bojon Street, Bo Clocktower, Bo Big Market & Bo School.';
      } else if (regionInfo.id === 'FREETOWN') {
        this.lastInteractionMessage =
          'Welcome back to Goodrich / Fonima, Freetown.';
      }
      this.messageClearTimer = 5.5;
      this.saveCurrentProgress();
    }

    // Periodic progress auto-save every 4 seconds
    this.saveTimer += safeDt;
    if (this.saveTimer >= 4.0) {
      this.saveTimer = 0;
      this.saveCurrentProgress();
    }

    // Check nearby interactive objects (including the 4x4 SUV)
    const allInteractables: InteractiveObject[] = [
      this.vehicle.interactable,
      ...this.freetownInteractables,
      ...this.worldStreaming.activeInteractables,
    ];

    let closestInteractable: InteractiveObject | null = null;
    let minDist = Infinity;

    if (this.vehicle.isPlayerDriving) {
      // While driving, the primary interaction action is exiting the vehicle (or fueling at Mile 91)
      closestInteractable = this.vehicle.interactable;
      for (let i = 1; i < allInteractables.length; i++) {
        const item = allInteractables[i];
        if (item.type === 'fuel' || item.type === 'landmark') {
          const dist = followPos.distanceTo(item.position);
          if (dist <= item.radius + 2.5 && dist < minDist) {
            minDist = dist;
            closestInteractable = item;
          }
        }
      }
    } else {
      for (let i = 0; i < allInteractables.length; i++) {
        const item = allInteractables[i];
        const dist = this.player.position.distanceTo(item.position);
        if (dist <= item.radius && dist < minDist) {
          minDist = dist;
          closestInteractable = item;
        }
      }
    }

    if (input.interactRequested) {
      input.interactRequested = false;
      if (this.vehicle.isPlayerDriving) {
        if (
          closestInteractable &&
          closestInteractable.id !== this.vehicle.interactable.id
        ) {
          this.lastInteractionMessage = closestInteractable.onInteract();
          this.messageClearTimer = 5.5;
          this.audio.playInteract(false);
        } else {
          this.exitVehicle();
        }
      } else if (closestInteractable) {
        if (closestInteractable.id === this.vehicle.interactable.id) {
          this.enterVehicle();
        } else {
          this.lastInteractionMessage = closestInteractable.onInteract();
          this.messageClearTimer = 5.5;
          this.audio.playInteract(closestInteractable.type === 'gate');
        }
      } else {
        this.lastInteractionMessage =
          'Move closer to your 4x4 SUV, a compound gate, street sign, or market stall to interact.';
        this.messageClearTimer = 3.0;
      }
    }

    if (this.messageClearTimer > 0) {
      this.messageClearTimer -= safeDt;
      if (this.messageClearTimer <= 0) {
        this.lastInteractionMessage = null;
      }
    }

    if (!this.isContextLost()) {
      this.renderer.render(this.scene, this.cameraSystem.camera);
    }

    const zoneName = this.roads.getZoneName(focusPos.x, focusPos.z);

    // Compute distance to active navigation destination
    let distToDest = 0;
    if (this.destination === 'BO') {
      distToDest = Math.round(Math.hypot(1150 - followPos.x, 0 - followPos.z));
    } else if (this.destination === 'FREETOWN') {
      distToDest = Math.round(Math.hypot(0 - followPos.x, -1.8 - followPos.z));
    }

    return {
      x: focusPos.x,
      y: focusPos.y,
      z: focusPos.z,
      heading:
        camMode === 'DRONE'
          ? -this.cameraSystem.droneYaw
          : followHeading,
      speed: followSpeed,
      isGrounded: this.player.isGrounded,
      isSprinting: this.player.isSprinting,
      animState: this.player.animState,
      surfaceType: currentSurface,
      zoneName,
      regionId: regionInfo.id,
      regionLabel: regionInfo.label,
      isDriving: this.vehicle.isPlayerDriving,
      vehicleSpeedKmh: Math.round(Math.abs(this.vehicle.speed) * 3.6),
      vehiclePosition: {
        x: this.vehicle.position.x,
        z: this.vehicle.position.z,
      },
      destination: this.destination,
      distanceToDestinationMeters: distToDest,
      activeStreamedChunks: this.worldStreaming.getLoadedChunkCount(),
      nearbyInteractable: closestInteractable,
      lastInteractionMessage: this.lastInteractionMessage,
      timeHours: this.lighting.timeHours,
      formattedClock: this.lighting.getFormattedClock(),
      dayPhaseName: this.lighting.getDayPhaseName(),
      isNight: this.lighting.isNight,
      weather: this.lighting.settings.weather,
      cameraMode: camMode,
      audioEnabled: this.audio.getEnabled(),
      fps: this.currentFps,
      trafficCount: this.traffic.getActiveCount(),
      trafficDensity: this.traffic.density,
    };
  }

  public handleResize(width: number, height: number): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.cameraSystem.handleResize(width, height);
  }

  public dispose(): void {
    this.saveCurrentProgress();
    this.traffic.dispose();
    this.renderer.dispose();
  }
}
