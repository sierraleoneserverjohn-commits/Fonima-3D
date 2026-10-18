import * as THREE from 'three';
import {
  ColliderBox,
  ControlInputState,
  GroundSurfaceType,
  InteractiveObject,
} from './GameState';
import { EnvironmentSystem } from './Environment';
import { ProceduralTextures } from './ProceduralTextures';

export class VehicleSystem {
  public group: THREE.Group;
  public position: THREE.Vector3;
  public heading: number; // 0 = facing North (-Z), -PI/2 = facing East (+X toward Bo)
  public speed: number = 0; // m/s (positive = forward, negative = reverse)
  public steerAngle: number = 0; // radians
  public isPlayerDriving: boolean = false;

  private chassisGroup: THREE.Group;
  private frontAxleMesh!: THREE.Mesh;
  private rearAxleMesh!: THREE.Mesh;

  // 4-Wheel Direct Ground-Locked Hierarchy:
  // Each wheel assembly sits in vehicle group space and directly links its world-space position
  // to the road surface plane so tire bottoms touch the exact surface underneath each wheel.
  private frontLeftWheelRoot: THREE.Group;
  private frontRightWheelRoot: THREE.Group;
  private rearLeftWheelRoot: THREE.Group;
  private rearRightWheelRoot: THREE.Group;

  private frontLeftSteerPivot: THREE.Group;
  private frontRightSteerPivot: THREE.Group;
  private wheelSpinNodes: THREE.Group[] = [];

  private headlightBulbMat: THREE.MeshStandardMaterial;
  private taillightBulbMat: THREE.MeshStandardMaterial;
  private headlightGroundConeMat: THREE.MeshBasicMaterial;
  private headlightGroundConeMesh!: THREE.Mesh;

  private wheelSpinAngle: number = 0;

  // Exact Wheel & Chassis Geometry Constants
  private readonly wheelRadius = 0.42;
  private readonly wheelWidth = 0.28;
  private readonly halfTrackWidth = 0.92; // Wheel X offset: -0.92 (Left), +0.92 (Right)
  private readonly halfWheelBase = 1.35; // Wheel Z offset: -1.35 (Front), +1.35 (Rear)
  private readonly wheelBase = 2.7; // Total distance between front and rear axles

  // Believable SUV physics constants
  private readonly maxForwardSpeed = 24.5; // ~88 km/h highway cruising speed
  private readonly maxReverseSpeed = 7.5; // ~27 km/h reverse
  private readonly engineAccel = 11.5;
  private readonly serviceBrakeDecel = 19.5;
  private readonly engineDrag = 2.8;

  private getSurfaceHeight: (x: number, z: number) => number;
  public interactable: InteractiveObject;

  constructor(
    scene: THREE.Scene,
    initialX: number = 8.5,
    initialZ: number = -1.6,
    initialHeading: number = -Math.PI / 2,
    getSurfaceHeight?: (x: number, z: number) => number
  ) {
    this.getSurfaceHeight =
      getSurfaceHeight ||
      ((x: number, z: number) => EnvironmentSystem.getTerrainHeight(x, z) + 0.125);

    this.group = new THREE.Group();
    this.chassisGroup = new THREE.Group();
    this.group.add(this.chassisGroup);

    const initY = this.getSurfaceHeight(initialX, initialZ);
    this.position = new THREE.Vector3(initialX, initY, initialZ);
    this.heading = initialHeading;

    this.frontLeftWheelRoot = new THREE.Group();
    this.frontRightWheelRoot = new THREE.Group();
    this.rearLeftWheelRoot = new THREE.Group();
    this.rearRightWheelRoot = new THREE.Group();

    this.frontLeftSteerPivot = new THREE.Group();
    this.frontRightSteerPivot = new THREE.Group();

    this.headlightBulbMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xfff4d6),
      emissiveIntensity: 0.0,
      roughness: 0.15,
    });

    this.taillightBulbMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: new THREE.Color(0xff2222),
      emissiveIntensity: 0.25,
      roughness: 0.25,
    });

    const poolTex = ProceduralTextures.getLightPoolGradientTexture();
    this.headlightGroundConeMat = new THREE.MeshBasicMaterial({
      map: poolTex,
      color: 0xfff4d6,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
    });

    this.buildSierraLeoneSUVMesh();
    this.alignToRoadSurface();

    scene.add(this.group);

    this.interactable = {
      id: 'player_suv_vehicle',
      title: '4x4 Toyota Land Cruiser Prado (SL-FT 4022)',
      subtitle: 'Tap to Enter Vehicle & Drive to Bo City',
      position: new THREE.Vector3(
        this.position.x,
        this.position.y + 1.1,
        this.position.z
      ),
      radius: 4.0,
      type: 'vehicle',
      onInteract: () =>
        this.isPlayerDriving
          ? 'Parked & exited vehicle. You can now explore on foot.'
          : 'Entered 4x4 SUV (SL-FT 4022). Follow Williams St East to the Freetown–Bo Highway!',
    };
  }

  private buildSierraLeoneSUVMesh(): void {
    const bodyPaintMat = new THREE.MeshStandardMaterial({
      color: 0xd8d6d0,
      roughness: 0.28,
      metalness: 0.62,
    });
    const darkCladdingMat = new THREE.MeshStandardMaterial({
      color: 0x1e242b,
      roughness: 0.72,
      metalness: 0.2,
    });
    const underbodyFrameMat = new THREE.MeshStandardMaterial({
      color: 0x15181e,
      roughness: 0.85,
      metalness: 0.3,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.18,
      metalness: 0.88,
    });
    const cabinGlassMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.12,
      metalness: 0.85,
    });
    const tireRubberMat = new THREE.MeshStandardMaterial({
      color: 0x17191c,
      roughness: 0.88,
      metalness: 0.05,
    });

    // 1. Solid Steel Ladder Frame & Axles connecting the 4 wheels to the chassis
    const ladderFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.28, 0.22, 3.65),
      underbodyFrameMat
    );
    ladderFrame.position.set(0, 0.44, 0);
    this.chassisGroup.add(ladderFrame);

    const axleGeo = new THREE.CylinderGeometry(0.065, 0.065, 1.78, 8);
    axleGeo.rotateZ(Math.PI / 2);

    this.frontAxleMesh = new THREE.Mesh(axleGeo, underbodyFrameMat);
    this.frontAxleMesh.position.set(0, this.wheelRadius, -this.halfWheelBase);
    this.group.add(this.frontAxleMesh);

    this.rearAxleMesh = new THREE.Mesh(axleGeo, underbodyFrameMat);
    this.rearAxleMesh.position.set(0, this.wheelRadius, this.halfWheelBase);
    this.group.add(this.rearAxleMesh);

    // 2. Sculpted Lower Body & Recessed Wheel Wells so tires never intersect painted panels
    const centerBodyTub = new THREE.Mesh(
      new THREE.BoxGeometry(1.86, 0.68, 1.82),
      bodyPaintMat
    );
    centerBodyTub.position.set(0, 0.8, 0.0);
    centerBodyTub.castShadow = true;
    centerBodyTub.receiveShadow = true;
    this.chassisGroup.add(centerBodyTub);

    const upperBeltBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.86, 0.36, 4.32),
      bodyPaintMat
    );
    upperBeltBody.position.set(0, 0.98, 0.0);
    upperBeltBody.castShadow = true;
    upperBeltBody.receiveShadow = true;
    this.chassisGroup.add(upperBeltBody);

    [-this.halfWheelBase, this.halfWheelBase].forEach((axleZ) => {
      const wellInsert = new THREE.Mesh(
        new THREE.BoxGeometry(1.52, 0.42, 0.96),
        underbodyFrameMat
      );
      wellInsert.position.set(0, 0.66, axleZ);
      this.chassisGroup.add(wellInsert);

      [-0.93, 0.93].forEach((sideX) => {
        const flare = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.14, 0.94),
          darkCladdingMat
        );
        flare.position.set(sideX, 0.88, axleZ);
        this.chassisGroup.add(flare);
      });
    });

    const frontApron = new THREE.Mesh(
      new THREE.BoxGeometry(1.84, 0.46, 0.44),
      bodyPaintMat
    );
    frontApron.position.set(0, 0.75, -1.96);
    frontApron.castShadow = true;
    this.chassisGroup.add(frontApron);

    const rearApron = new THREE.Mesh(
      new THREE.BoxGeometry(1.84, 0.46, 0.44),
      bodyPaintMat
    );
    rearApron.position.set(0, 0.75, 1.96);
    rearApron.castShadow = true;
    this.chassisGroup.add(rearApron);

    const runningBoard = new THREE.Mesh(
      new THREE.BoxGeometry(1.96, 0.1, 1.72),
      darkCladdingMat
    );
    runningBoard.position.set(0, 0.42, 0.0);
    this.chassisGroup.add(runningBoard);

    const frontBumper = new THREE.Mesh(
      new THREE.BoxGeometry(1.94, 0.32, 0.34),
      darkCladdingMat
    );
    frontBumper.position.set(0, 0.54, -2.14);
    frontBumper.castShadow = true;
    this.chassisGroup.add(frontBumper);

    const rearBumper = new THREE.Mesh(
      new THREE.BoxGeometry(1.94, 0.32, 0.32),
      darkCladdingMat
    );
    rearBumper.position.set(0, 0.54, 2.14);
    rearBumper.castShadow = true;
    this.chassisGroup.add(rearBumper);

    // 3. Upper Cabin Greenhouse
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.68, 0.68, 2.65),
      bodyPaintMat
    );
    cabin.position.set(0, 1.46, 0.32);
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    this.chassisGroup.add(cabin);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(1.56, 0.58, 0.1),
      cabinGlassMat
    );
    windshield.position.set(0, 1.44, -0.98);
    windshield.rotation.x = 0.32;
    this.chassisGroup.add(windshield);

    const sideWindows = new THREE.Mesh(
      new THREE.BoxGeometry(1.72, 0.5, 2.38),
      cabinGlassMat
    );
    sideWindows.position.set(0, 1.48, 0.35);
    this.chassisGroup.add(sideWindows);

    const rearWindow = new THREE.Mesh(
      new THREE.BoxGeometry(1.52, 0.5, 0.08),
      cabinGlassMat
    );
    rearWindow.position.set(0, 1.48, 1.66);
    this.chassisGroup.add(rearWindow);

    [-0.92, 0.92].forEach((mx) => {
      const mirror = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.14, 0.12),
        darkCladdingMat
      );
      mirror.position.set(mx, 1.24, -0.78);
      this.chassisGroup.add(mirror);
    });

    const roofRack = new THREE.Mesh(
      new THREE.BoxGeometry(1.38, 0.08, 2.1),
      darkCladdingMat
    );
    roofRack.position.set(0, 1.84, 0.38);
    this.chassisGroup.add(roofRack);

    const spareTire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.24, 14),
      tireRubberMat
    );
    spareTire.rotation.x = Math.PI / 2;
    spareTire.position.set(0.22, 1.08, 2.26);
    spareTire.castShadow = true;
    this.chassisGroup.add(spareTire);

    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.32, 0.08),
      chromeMat
    );
    grille.position.set(0, 0.92, -2.18);
    this.chassisGroup.add(grille);

    const plateTex = ProceduralTextures.getSignboardTexture(
      'SL · FT 4022',
      'SIERRA LEONE',
      '#f8fafc',
      '#0f172a',
      '#15803d'
    );
    const plateMat = new THREE.MeshStandardMaterial({
      map: plateTex,
      roughness: 0.4,
    });
    const frontPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.14, 0.04),
      plateMat
    );
    frontPlate.position.set(0, 0.54, -2.33);
    this.chassisGroup.add(frontPlate);

    const rearPlate = frontPlate.clone();
    rearPlate.position.set(-0.42, 0.92, 2.21);
    this.chassisGroup.add(rearPlate);

    [-0.68, 0.68].forEach((hx) => {
      const headLamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.2, 0.08),
        this.headlightBulbMat
      );
      headLamp.position.set(hx, 0.94, -2.18);
      this.chassisGroup.add(headLamp);

      const tailLamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.36, 0.08),
        this.taillightBulbMat
      );
      tailLamp.position.set(hx * 1.12, 0.98, 2.18);
      this.chassisGroup.add(tailLamp);
    });

    const beamGeo = new THREE.PlaneGeometry(6.5, 16.0);
    beamGeo.rotateX(-Math.PI / 2);
    this.headlightGroundConeMesh = new THREE.Mesh(
      beamGeo,
      this.headlightGroundConeMat
    );
    this.headlightGroundConeMesh.position.set(0, 0.06, -9.8);
    this.headlightGroundConeMesh.renderOrder = 8;
    this.headlightGroundConeMesh.visible = false;
    this.chassisGroup.add(this.headlightGroundConeMesh);

    // 3b. Vehicle Ground Contact Shadow (grounding the 4 wheels and chassis to the road)
    const shadowTex = ProceduralTextures.getLightPoolGradientTexture();
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      color: 0x05070a,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const vehicleShadowGeo = new THREE.PlaneGeometry(2.35, 4.4);
    vehicleShadowGeo.rotateX(-Math.PI / 2);
    const contactShadowMesh = new THREE.Mesh(
      vehicleShadowGeo,
      contactShadowMat
    );
    contactShadowMesh.position.set(0, 0.02, 0);
    contactShadowMesh.renderOrder = 6;
    this.chassisGroup.add(contactShadowMesh);

    // 4. Articulated 4-Wheel Hierarchy with per-wheel vertical ground-contact root
    const wheelGeo = new THREE.CylinderGeometry(
      this.wheelRadius,
      this.wheelRadius,
      this.wheelWidth,
      18
    );
    wheelGeo.rotateZ(Math.PI / 2);

    const rimGeo = new THREE.CylinderGeometry(
      0.25,
      0.25,
      this.wheelWidth + 0.02,
      12
    );
    rimGeo.rotateZ(Math.PI / 2);

    const hubCapGeo = new THREE.BoxGeometry(this.wheelWidth + 0.03, 0.09, 0.42);
    const spokeGeo2 = new THREE.BoxGeometry(this.wheelWidth + 0.03, 0.42, 0.09);

    const createWheelSpinNode = (): THREE.Group => {
      const spinNode = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, tireRubberMat);
      tire.castShadow = true;
      tire.receiveShadow = true;
      spinNode.add(tire);

      const rim = new THREE.Mesh(rimGeo, chromeMat);
      spinNode.add(rim);

      const spokeA = new THREE.Mesh(hubCapGeo, darkCladdingMat);
      const spokeB = new THREE.Mesh(spokeGeo2, darkCladdingMat);
      spinNode.add(spokeA);
      spinNode.add(spokeB);

      this.wheelSpinNodes.push(spinNode);
      return spinNode;
    };

    // Front Left Wheel: Root -> SteerPivot (Y-axis steer) -> SpinNode (X-axis spin)
    this.frontLeftWheelRoot.position.set(
      -this.halfTrackWidth,
      this.wheelRadius,
      -this.halfWheelBase
    );
    this.frontLeftSteerPivot.add(createWheelSpinNode());
    this.frontLeftWheelRoot.add(this.frontLeftSteerPivot);
    this.group.add(this.frontLeftWheelRoot);

    // Front Right Wheel: Root -> SteerPivot (Y-axis steer) -> SpinNode (X-axis spin)
    this.frontRightWheelRoot.position.set(
      this.halfTrackWidth,
      this.wheelRadius,
      -this.halfWheelBase
    );
    this.frontRightSteerPivot.add(createWheelSpinNode());
    this.frontRightWheelRoot.add(this.frontRightSteerPivot);
    this.group.add(this.frontRightWheelRoot);

    // Rear Left Wheel: Root -> SpinNode (X-axis spin)
    this.rearLeftWheelRoot.position.set(
      -this.halfTrackWidth,
      this.wheelRadius,
      this.halfWheelBase
    );
    this.rearLeftWheelRoot.add(createWheelSpinNode());
    this.group.add(this.rearLeftWheelRoot);

    // Rear Right Wheel: Root -> SpinNode (X-axis spin)
    this.rearRightWheelRoot.position.set(
      this.halfTrackWidth,
      this.wheelRadius,
      this.halfWheelBase
    );
    this.rearRightWheelRoot.add(createWheelSpinNode());
    this.group.add(this.rearRightWheelRoot);
  }

  public setNightMode(nightActivation: number): void {
    const f = Number.isFinite(nightActivation)
      ? Math.max(0, Math.min(1, nightActivation))
      : 0;
    const lightsOn = this.isPlayerDriving ? Math.max(0.35, f) : f * 0.5;
    this.headlightBulbMat.emissiveIntensity = lightsOn * 3.2;
    this.taillightBulbMat.emissiveIntensity =
      0.35 + (this.isPlayerDriving ? 1.4 : 0) + f * 1.2;

    const showBeam = (this.isPlayerDriving || f > 0.2) && f > 0.05;
    if (this.headlightGroundConeMesh) {
      this.headlightGroundConeMesh.visible = showBeam;
      this.headlightGroundConeMat.opacity = showBeam
        ? (this.isPlayerDriving ? 0.72 : 0.35) * f
        : 0;
    }
  }

  public getParkedCollider(): ColliderBox {
    const pad = 1.35;
    return {
      id: 'parked_player_suv',
      minX: this.position.x - pad,
      maxX: this.position.x + pad,
      minZ: this.position.z - pad,
      maxZ: this.position.z + pad,
      minY: this.position.y - 0.5,
      maxY: this.position.y + 2.0,
    };
  }

  public update(
    dt: number,
    input: ControlInputState,
    surfaceType: GroundSurfaceType,
    colliders: ColliderBox[]
  ): void {
    this.interactable.position.set(
      this.position.x,
      this.position.y + 1.15,
      this.position.z
    );
    this.interactable.subtitle = this.isPlayerDriving
      ? 'Tap Exit Car to step out and walk'
      : 'Tap to Enter Vehicle & Drive (Freetown ↔ Bo Highway)';

    const effectiveDt = Math.min(Math.max(dt, 0.0001), 0.05);

    if (!this.isPlayerDriving) {
      if (Math.abs(this.speed) > 0.05) {
        this.speed *= Math.max(0, 1 - effectiveDt * 6.0);
        const forwardX = -Math.sin(this.heading);
        const forwardZ = -Math.cos(this.heading);
        this.position.x += forwardX * this.speed * effectiveDt;
        this.position.z += forwardZ * this.speed * effectiveDt;
      } else {
        this.speed = 0;
      }
      this.alignToRoadSurface();
      return;
    }

    // 1. Combine Joystick Y and dedicated Gas/Brake pedals
    const joyForward = Math.max(0, -input.moveY);
    const joyReverse = Math.max(0, input.moveY);
    const throttle = Math.min(1, Math.max(joyForward, input.vehicleThrottle));
    const brakeOrReverse = Math.min(1, Math.max(joyReverse, input.vehicleBrake));

    const surfaceSpeedMult =
      surfaceType === 'asphalt' || surfaceType === 'concrete'
        ? 1.0
        : surfaceType === 'dirt'
          ? 0.84
          : 0.7;

    const maxFwd =
      this.maxForwardSpeed *
      surfaceSpeedMult *
      (input.sprintActive ? 1.15 : 1.0);

    // 2. Longitudinal Acceleration, Braking & Reverse
    let accel = 0;
    if (input.vehicleHandbrake) {
      if (Math.abs(this.speed) > 0.1) {
        accel = -Math.sign(this.speed) * this.serviceBrakeDecel * 1.8;
      } else {
        this.speed = 0;
      }
      this.taillightBulbMat.emissiveIntensity = 4.0;
    } else if (throttle > 0.05) {
      if (this.speed < -0.2) {
        accel = this.serviceBrakeDecel * throttle;
      } else {
        accel = this.engineAccel * throttle * (1 - (this.speed / maxFwd) * 0.45);
      }
    } else if (brakeOrReverse > 0.05) {
      if (this.speed > 0.3) {
        accel = -this.serviceBrakeDecel * brakeOrReverse;
        this.taillightBulbMat.emissiveIntensity = 3.5;
      } else {
        accel = -this.engineAccel * 0.65 * brakeOrReverse;
      }
    } else {
      if (Math.abs(this.speed) > 0.08) {
        accel = -Math.sign(this.speed) * this.engineDrag;
      } else {
        this.speed = 0;
      }
    }

    this.speed += accel * effectiveDt;
    this.speed = Math.max(
      -this.maxReverseSpeed,
      Math.min(maxFwd, this.speed)
    );

    // 3. Speed-Sensitive Steering on Front Wheel Pivots
    const steerInput = -input.moveX;
    const speedFactor = Math.min(1, Math.abs(this.speed) / 20.0);
    const maxSteer = THREE.MathUtils.lerp(0.5, 0.22, speedFactor);
    const targetSteer = steerInput * maxSteer;
    this.steerAngle +=
      (targetSteer - this.steerAngle) * Math.min(1, effectiveDt * 10.0);

    this.frontLeftSteerPivot.rotation.y = this.steerAngle;
    this.frontRightSteerPivot.rotation.y = this.steerAngle;

    // 4. Bicycle-Model Heading & Position Integration
    if (Math.abs(this.speed) > 0.05) {
      const angularVel =
        (this.speed / this.wheelBase) * Math.tan(this.steerAngle);
      this.heading += angularVel * effectiveDt;

      while (this.heading > Math.PI) this.heading -= Math.PI * 2;
      while (this.heading < -Math.PI) this.heading += Math.PI * 2;

      const forwardX = -Math.sin(this.heading);
      const forwardZ = -Math.cos(this.heading);

      this.position.x += forwardX * this.speed * effectiveDt;
      this.position.z += forwardZ * this.speed * effectiveDt;

      this.resolveVehicleCollisions(colliders);
    }

    // Clamp to connected Sierra Leone world bounds
    this.position.x = Math.max(-92, Math.min(1340, this.position.x));
    this.position.z = Math.max(-92, Math.min(92, this.position.z));

    // Spin all 4 wheel spin nodes proportionally to linear distance traveled
    this.wheelSpinAngle -= (this.speed * effectiveDt) / this.wheelRadius;
    for (let i = 0; i < this.wheelSpinNodes.length; i++) {
      this.wheelSpinNodes[i].rotation.x = this.wheelSpinAngle;
    }

    // 5. Exact 4-Wheel Ground-Contact Alignment
    this.alignToRoadSurface();
  }

  // Samples the road/terrain surface height under each of the 4 wheels in world space,
  // aligns the vehicle position and chassis orientation (pitch and roll) cleanly to the road plane,
  // and directly links wheel and axle world-space positions to the road surface plane to fix floating or sinking wheels.
  public alignToRoadSurface(): void {
    const cosH = Math.cos(this.heading);
    const sinH = Math.sin(this.heading);

    // Helper to convert local vehicle (lx, lz) to world (wx, wz) based on heading around Y:
    const sampleWheelGround = (lx: number, lz: number): number => {
      const wx = this.position.x + lx * cosH + lz * sinH;
      const wz = this.position.z - lx * sinH + lz * cosH;
      return this.getSurfaceHeight(wx, wz);
    };

    const yFL = sampleWheelGround(-this.halfTrackWidth, -this.halfWheelBase);
    const yFR = sampleWheelGround(this.halfTrackWidth, -this.halfWheelBase);
    const yRL = sampleWheelGround(-this.halfTrackWidth, this.halfWheelBase);
    const yRR = sampleWheelGround(this.halfTrackWidth, this.halfWheelBase);

    const avgFrontY = 0.5 * (yFL + yFR);
    const avgRearY = 0.5 * (yRL + yRR);
    const avgLeftY = 0.5 * (yFL + yRL);
    const avgRightY = 0.5 * (yFR + yRR);

    // Exact center ground plane height from all 4 wheel contact points
    const planeCenterY = 0.25 * (yFL + yFR + yRL + yRR);
    this.position.y = planeCenterY;

    // Direct pitch and roll derived from road surface plane under the wheels
    const slopePitch = THREE.MathUtils.clamp(
      Math.atan2(avgFrontY - avgRearY, this.wheelBase),
      -0.45,
      0.45
    );
    const slopeRoll = THREE.MathUtils.clamp(
      Math.atan2(avgRightY - avgLeftY, this.halfTrackWidth * 2.0),
      -0.35,
      0.35
    );

    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;

    this.chassisGroup.position.set(0, 0, 0);
    this.chassisGroup.rotation.x = slopePitch;
    this.chassisGroup.rotation.z = slopeRoll;

    // Directly link each wheel's world-space position to the road surface plane:
    // In vehicle group space (where Y is world UP and group Y is this.position.y = planeCenterY),
    // setting local Y = (yGround - this.position.y) + this.wheelRadius guarantees that
    // the tire bottom world Y is identically yGround (road surface).
    // Eliminates all complex sub-stepping calculations while preventing any floating or sinking wheels.
    const wheelCenterFL = (yFL - this.position.y) + this.wheelRadius;
    const wheelCenterFR = (yFR - this.position.y) + this.wheelRadius;
    const wheelCenterRL = (yRL - this.position.y) + this.wheelRadius;
    const wheelCenterRR = (yRR - this.position.y) + this.wheelRadius;

    this.frontLeftWheelRoot.position.set(
      -this.halfTrackWidth,
      wheelCenterFL,
      -this.halfWheelBase
    );
    this.frontLeftWheelRoot.rotation.x = slopePitch;
    this.frontLeftWheelRoot.rotation.z = slopeRoll;

    this.frontRightWheelRoot.position.set(
      this.halfTrackWidth,
      wheelCenterFR,
      -this.halfWheelBase
    );
    this.frontRightWheelRoot.rotation.x = slopePitch;
    this.frontRightWheelRoot.rotation.z = slopeRoll;

    this.rearLeftWheelRoot.position.set(
      -this.halfTrackWidth,
      wheelCenterRL,
      this.halfWheelBase
    );
    this.rearLeftWheelRoot.rotation.x = slopePitch;
    this.rearLeftWheelRoot.rotation.z = slopeRoll;

    this.rearRightWheelRoot.position.set(
      this.halfTrackWidth,
      wheelCenterRR,
      this.halfWheelBase
    );
    this.rearRightWheelRoot.rotation.x = slopePitch;
    this.rearRightWheelRoot.rotation.z = slopeRoll;

    // Link axle transforms directly to the left and right wheel hubs
    const frontAxleCenterY = (wheelCenterFL + wheelCenterFR) * 0.5;
    const frontAxleRoll = Math.atan2(wheelCenterFR - wheelCenterFL, this.halfTrackWidth * 2.0);
    this.frontAxleMesh.position.set(0, frontAxleCenterY, -this.halfWheelBase);
    this.frontAxleMesh.rotation.x = slopePitch;
    this.frontAxleMesh.rotation.z = frontAxleRoll;

    const rearAxleCenterY = (wheelCenterRL + wheelCenterRR) * 0.5;
    const rearAxleRoll = Math.atan2(wheelCenterRR - wheelCenterRL, this.halfTrackWidth * 2.0);
    this.rearAxleMesh.position.set(0, rearAxleCenterY, this.halfWheelBase);
    this.rearAxleMesh.rotation.x = slopePitch;
    this.rearAxleMesh.rotation.z = rearAxleRoll;
  }

  private resolveVehicleCollisions(colliders: ColliderBox[]): void {
    const r = 1.35;
    const minY = this.position.y + 0.2;
    const maxY = this.position.y + 1.9;

    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (box.id === 'parked_player_suv') continue;
      if (maxY < box.minY || minY > box.maxY) continue;

      const closestX = Math.max(box.minX, Math.min(this.position.x, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(this.position.z, box.maxZ));

      const dx = this.position.x - closestX;
      const dz = this.position.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < r * r && distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        const overlap = r - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        this.position.x += nx * overlap;
        this.position.z += nz * overlap;
        this.speed *= 0.55;
      }
    }
  }

  public getDriverExitPosition(): THREE.Vector3 {
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);
    const exitX = this.position.x - rightX * 1.75;
    const exitZ = this.position.z - rightZ * 1.75;
    const exitY = this.getSurfaceHeight(exitX, exitZ);
    return new THREE.Vector3(exitX, exitY, exitZ);
  }
}
