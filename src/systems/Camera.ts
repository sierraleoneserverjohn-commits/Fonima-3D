import * as THREE from 'three';
import {
  CameraSettings,
  ColliderBox,
  ControlInputState,
  loadSavedCameraSettings,
  saveCameraSettings,
} from './GameState';
import { EnvironmentSystem } from './Environment';

export class CameraSystem {
  public camera: THREE.PerspectiveCamera;
  public settings: CameraSettings;
  public yaw: number = 0;
  public pitch: number = 0.22;

  public dronePos: THREE.Vector3 = new THREE.Vector3(0, 26, 18);
  public droneYaw: number = 0;
  public dronePitch: number = -0.45;

  private currentPos: THREE.Vector3 = new THREE.Vector3(0, 3.2, 2.8);
  private currentLookAt: THREE.Vector3 = new THREE.Vector3(0, 1.5, -1.8);
  private smoothedSafeDist: number = 4.4;
  private cinematicTime: number = 0;

  private readonly minDistance: number = 1.25;

  constructor(aspect: number) {
    this.settings = loadSavedCameraSettings();
    this.smoothedSafeDist = this.settings.distance;
    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
      aspect,
      0.35,
      290
    );
  }

  public updateSettings(partial: Partial<CameraSettings>): CameraSettings {
    const prevMode = this.settings.mode;
    this.settings = { ...this.settings, ...partial };
    saveCameraSettings(this.settings);

    if (partial.fov !== undefined) {
      this.camera.fov = this.settings.fov;
      this.camera.updateProjectionMatrix();
    }

    if (prevMode !== 'DRONE' && this.settings.mode === 'DRONE') {
      this.dronePos.set(
        this.currentLookAt.x,
        Math.max(18, this.currentPos.y + 14),
        this.currentLookAt.z + 18
      );
      this.droneYaw = 0;
      this.dronePitch = -0.48;
    }

    return this.settings;
  }

  public applyLookDelta(deltaX: number, deltaY: number): void {
    const sens = this.settings.sensitivity;
    if (this.settings.mode === 'DRONE') {
      this.droneYaw -= deltaX * sens;
      this.dronePitch = Math.max(
        -1.35,
        Math.min(0.45, this.dronePitch - deltaY * sens)
      );
      return;
    }

    this.yaw -= deltaX * sens;
    this.pitch = Math.max(-0.25, Math.min(1.15, this.pitch + deltaY * sens));
  }

  public applyZoomDelta(deltaDistance: number): void {
    if (this.settings.mode === 'DRONE') {
      this.dronePos.y = Math.max(
        4,
        Math.min(85, this.dronePos.y + deltaDistance * 2.5)
      );
      return;
    }
    const nextDist = Math.max(
      1.6,
      Math.min(9.5, this.settings.distance + deltaDistance)
    );
    this.updateSettings({ distance: Number(nextDist.toFixed(2)) });
  }

  public update(
    dt: number,
    input: ControlInputState,
    playerPos: THREE.Vector3,
    playerHeading: number,
    playerSpeed: number,
    isGrounded: boolean,
    isSprinting: boolean,
    colliders: ColliderBox[]
  ): void {
    if (input.pinchZoomDelta !== 0) {
      this.applyZoomDelta(input.pinchZoomDelta);
      input.pinchZoomDelta = 0;
    }

    if (this.settings.mode === 'DRONE') {
      this.updateDroneCamera(dt, input);
      return;
    }

    if (this.settings.mode === 'CINEMATIC') {
      this.updateCinematicCamera(dt, playerPos, playerHeading, playerSpeed);
      return;
    }

    this.updateThirdPersonCamera(dt, playerPos, isSprinting, colliders);
  }

  private updateThirdPersonCamera(
    dt: number,
    playerPos: THREE.Vector3,
    isSprinting: boolean,
    colliders: ColliderBox[]
  ): void {
    // Rock-solid target pivot at player shoulder/head height (no camera shake or vertical bob)
    const targetPivot = new THREE.Vector3(
      playerPos.x,
      playerPos.y + this.settings.height,
      playerPos.z
    );

    const targetFov = isSprinting
      ? Math.min(80, this.settings.fov + 4)
      : this.settings.fov;
    if (Math.abs(this.camera.fov - targetFov) > 0.08) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }

    const idealDist = this.settings.distance;
    const horizDist = idealDist * Math.cos(this.pitch);
    const vertDist = idealDist * Math.sin(this.pitch);

    const idealCamPos = new THREE.Vector3(
      targetPivot.x + Math.sin(this.yaw) * horizDist,
      targetPivot.y + vertDist,
      targetPivot.z + Math.cos(this.yaw) * horizDist
    );

    const safeFraction = this.computeSafeCameraFraction(
      targetPivot,
      idealCamPos,
      colliders
    );
    const targetSafeDist = Math.max(this.minDistance, idealDist * safeFraction);

    // Smoothly pull in when obstructed by a building/wall, and smoothly relax back out when clear
    const distRate = targetSafeDist < this.smoothedSafeDist ? 18.0 : 8.0;
    this.smoothedSafeDist +=
      (targetSafeDist - this.smoothedSafeDist) * Math.min(1, dt * distRate);

    const adjHoriz = this.smoothedSafeDist * Math.cos(this.pitch);
    const adjVert = this.smoothedSafeDist * Math.sin(this.pitch);

    const desiredPos = new THREE.Vector3(
      targetPivot.x + Math.sin(this.yaw) * adjHoriz,
      targetPivot.y + adjVert,
      targetPivot.z + Math.cos(this.yaw) * adjHoriz
    );

    const terrainY = EnvironmentSystem.getTerrainHeight(
      desiredPos.x,
      desiredPos.z
    );
    if (desiredPos.y < terrainY + 0.5) {
      desiredPos.y = terrainY + 0.5;
    }

    const smoothRate = 10 + (1 - this.settings.smoothing * 0.5) * 14;
    const posLerp = Math.min(1, dt * smoothRate);
    this.currentPos.lerp(desiredPos, posLerp);
    this.currentLookAt.lerp(targetPivot, Math.min(1, dt * (smoothRate + 6)));

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  private updateDroneCamera(dt: number, input: ControlInputState): void {
    const speed =
      this.settings.droneSpeed * (input.sprintActive ? 1.85 : 1.0);

    const forwardX = -Math.sin(this.droneYaw);
    const forwardZ = -Math.cos(this.droneYaw);
    const rightX = Math.cos(this.droneYaw);
    const rightZ = -Math.sin(this.droneYaw);

    const moveForward = -input.moveY;
    const moveRight = input.moveX;

    this.dronePos.x +=
      (forwardX * moveForward + rightX * moveRight) * speed * dt;
    this.dronePos.z +=
      (forwardZ * moveForward + rightZ * moveRight) * speed * dt;
    this.dronePos.y += input.droneVertical * speed * 0.75 * dt;

    this.dronePos.x = Math.max(-96, Math.min(1345, this.dronePos.x));
    this.dronePos.z = Math.max(-96, Math.min(96, this.dronePos.z));
    const groundH = EnvironmentSystem.getTerrainHeight(
      this.dronePos.x,
      this.dronePos.z
    );
    this.dronePos.y = Math.max(groundH + 3.0, Math.min(85, this.dronePos.y));

    const smooth = Math.min(1, dt * 10);
    this.currentPos.lerp(this.dronePos, smooth);

    const lookDir = new THREE.Vector3(
      -Math.sin(this.droneYaw) * Math.cos(this.dronePitch),
      Math.sin(this.dronePitch),
      -Math.cos(this.droneYaw) * Math.cos(this.dronePitch)
    );
    const targetLook = new THREE.Vector3()
      .copy(this.currentPos)
      .add(lookDir.multiplyScalar(20));
    this.currentLookAt.lerp(targetLook, smooth);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  private updateCinematicCamera(
    dt: number,
    playerPos: THREE.Vector3,
    playerHeading: number,
    playerSpeed: number
  ): void {
    this.cinematicTime += dt;

    const activeShot =
      this.settings.cinematicShotIndex === 0
        ? (Math.floor(this.cinematicTime / 9.0) % 4) + 1
        : this.settings.cinematicShotIndex;

    const desiredPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();
    let desiredFov = 50;

    if (activeShot === 1) {
      const orbitAngle = playerHeading + Math.PI + this.cinematicTime * 0.32;
      const dist = 3.4;
      desiredPos.set(
        playerPos.x + Math.sin(orbitAngle) * dist,
        playerPos.y + 1.62 + Math.sin(this.cinematicTime * 0.6) * 0.25,
        playerPos.z + Math.cos(orbitAngle) * dist
      );
      desiredLook.set(playerPos.x, playerPos.y + 1.52, playerPos.z);
      desiredFov = 52;
    } else if (activeShot === 2) {
      const frontAngle =
        playerHeading + Math.PI + Math.sin(this.cinematicTime * 0.45) * 0.62;
      const dist = 1.45;
      desiredPos.set(
        playerPos.x + Math.sin(frontAngle) * dist,
        playerPos.y + 1.66,
        playerPos.z + Math.cos(frontAngle) * dist
      );
      desiredLook.set(playerPos.x, playerPos.y + 1.63, playerPos.z);
      desiredFov = 42;
    } else if (activeShot === 3) {
      const trackAngle = playerHeading + Math.PI * 0.72;
      const dist = 2.8 + (playerSpeed > 1 ? 0.5 : 0);
      desiredPos.set(
        playerPos.x + Math.sin(trackAngle) * dist,
        playerPos.y + 0.68,
        playerPos.z + Math.cos(trackAngle) * dist
      );
      desiredLook.set(playerPos.x, playerPos.y + 1.38, playerPos.z);
      desiredFov = 58;
    } else {
      const panAngle = this.cinematicTime * 0.16;
      const dist = 18.0;
      desiredPos.set(
        playerPos.x + Math.sin(panAngle) * dist,
        playerPos.y + 11.5,
        playerPos.z + Math.cos(panAngle) * dist
      );
      desiredLook.set(playerPos.x, playerPos.y + 1.6, playerPos.z - 4.0);
      desiredFov = 54;
    }

    const terrainY = EnvironmentSystem.getTerrainHeight(
      desiredPos.x,
      desiredPos.z
    );
    if (desiredPos.y < terrainY + 0.45) {
      desiredPos.y = terrainY + 0.45;
    }

    const cineSmooth = Math.min(1, dt * 4.5);
    this.currentPos.lerp(desiredPos, cineSmooth);
    this.currentLookAt.lerp(desiredLook, cineSmooth * 1.4);

    if (Math.abs(this.camera.fov - desiredFov) > 0.05) {
      this.camera.fov += (desiredFov - this.camera.fov) * cineSmooth;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  // Only raycast against large solid building and wall colliders (ignores thin streetlight/tree poles so camera never jumps)
  private computeSafeCameraFraction(
    origin: THREE.Vector3,
    target: THREE.Vector3,
    colliders: ColliderBox[]
  ): number {
    const steps = 16;
    const pad = 0.25;

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const px = origin.x + (target.x - origin.x) * t;
      const py = origin.y + (target.y - origin.y) * t;
      const pz = origin.z + (target.z - origin.z) * t;

      for (let i = 0; i < colliders.length; i++) {
        const b = colliders[i];
        // Ignore thin poles/trees (< 1.2m wide in both axes) so camera never snaps when walking past a pole
        if (b.maxX - b.minX < 1.2 && b.maxZ - b.minZ < 1.2) continue;

        if (
          px + pad > b.minX &&
          px - pad < b.maxX &&
          pz + pad > b.minZ &&
          pz - pad < b.maxZ &&
          py + pad > b.minY &&
          py - pad < b.maxY
        ) {
          return Math.max(0.28, (s - 1) / steps);
        }
      }
    }
    return 1.0;
  }

  public handleResize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
}
