import * as THREE from 'three';
import { ColliderBox, ControlInputState, PlayerAnimState } from './GameState';
import { EnvironmentSystem } from './Environment';
import { ProceduralTextures } from './ProceduralTextures';

export interface BlendTreeNode2D {
  id: string;
  coordX: number;
  coordY: number;
  referenceSpeed: number;
  strideLength: number;
  leftStrideScale: number;
  rightStrideScale: number;
  lateralStepWidth: number;
  stepClearance: number;
  hipHeightOffset: number;
  verticalBobAmp: number;
  lateralSwayAmp: number;
  pelvisRollAmp: number;
  pelvisYawAmp: number;
  torsoLean: number;
  torsoBankAngle: number;
  spineTwistAmp: number;
  armSwingAmp: number;
  armCrossBodyAmp: number;
  elbowBaseBend: number;
  elbowDynamicBend: number;
  headYawLead: number;
}

export interface LocomotionBlendWeights {
  idle: number;
  walk: number;
  run: number;
  sprint: number;
  lateralX: number;
  forwardY: number;
}

function createDirectionalRow(
  stateName: 'IDLE' | 'WALK' | 'RUN' | 'SPRINT',
  coordY: number,
  base: Omit<
    BlendTreeNode2D,
    | 'id'
    | 'coordX'
    | 'coordY'
    | 'leftStrideScale'
    | 'rightStrideScale'
    | 'lateralStepWidth'
    | 'torsoBankAngle'
    | 'headYawLead'
  >,
  turnBankMax: number,
  turnLateralStep: number,
  turnHeadLead: number
): [BlendTreeNode2D, BlendTreeNode2D, BlendTreeNode2D] {
  const isIdle = stateName === 'IDLE';
  return [
    {
      ...base,
      id: `${stateName}_LEFT`,
      coordX: -1,
      coordY,
      leftStrideScale: isIdle ? 1.0 : 0.85,
      rightStrideScale: isIdle ? 1.0 : 1.12,
      lateralStepWidth: -turnLateralStep,
      torsoBankAngle: turnBankMax,
      headYawLead: turnHeadLead,
    },
    {
      ...base,
      id: `${stateName}_CENTER`,
      coordX: 0,
      coordY,
      leftStrideScale: 1.0,
      rightStrideScale: 1.0,
      lateralStepWidth: 0.0,
      torsoBankAngle: 0.0,
      headYawLead: 0.0,
    },
    {
      ...base,
      id: `${stateName}_RIGHT`,
      coordX: 1,
      coordY,
      leftStrideScale: isIdle ? 1.0 : 1.12,
      rightStrideScale: isIdle ? 1.0 : 0.85,
      lateralStepWidth: turnLateralStep,
      torsoBankAngle: -turnBankMax,
      headYawLead: -turnHeadLead,
    },
  ];
}

const BLEND_TREE_2D_GRID: [
  BlendTreeNode2D,
  BlendTreeNode2D,
  BlendTreeNode2D
][] = [
  createDirectionalRow(
    'IDLE',
    0.0,
    {
      referenceSpeed: 0.0,
      strideLength: 0.3,
      stepClearance: 0.0,
      hipHeightOffset: 0.0,
      verticalBobAmp: 0.0,
      lateralSwayAmp: 0.0,
      pelvisRollAmp: 0.0,
      pelvisYawAmp: 0.0,
      torsoLean: 0.01,
      spineTwistAmp: 0.0,
      armSwingAmp: 0.0,
      armCrossBodyAmp: 0.0,
      elbowBaseBend: 0.14,
      elbowDynamicBend: 0.0,
    },
    0.0,
    0.0,
    0.0
  ),
  createDirectionalRow(
    'WALK',
    0.38,
    {
      referenceSpeed: 3.4,
      strideLength: 0.76,
      stepClearance: 0.11,
      hipHeightOffset: -0.012,
      verticalBobAmp: 0.02,
      lateralSwayAmp: 0.032,
      pelvisRollAmp: 0.042,
      pelvisYawAmp: 0.068,
      torsoLean: 0.05,
      spineTwistAmp: 0.08,
      armSwingAmp: 0.34,
      armCrossBodyAmp: 0.04,
      elbowBaseBend: 0.24,
      elbowDynamicBend: 0.2,
    },
    0.09,
    0.03,
    0.18
  ),
  createDirectionalRow(
    'RUN',
    0.68,
    {
      referenceSpeed: 5.4,
      strideLength: 1.14,
      stepClearance: 0.21,
      hipHeightOffset: -0.028,
      verticalBobAmp: 0.038,
      lateralSwayAmp: 0.024,
      pelvisRollAmp: 0.052,
      pelvisYawAmp: 0.1,
      torsoLean: 0.125,
      spineTwistAmp: 0.12,
      armSwingAmp: 0.62,
      armCrossBodyAmp: 0.08,
      elbowBaseBend: 0.75,
      elbowDynamicBend: 0.3,
    },
    0.15,
    0.04,
    0.24
  ),
  createDirectionalRow(
    'SPRINT',
    1.0,
    {
      referenceSpeed: 7.7,
      strideLength: 1.48,
      stepClearance: 0.29,
      hipHeightOffset: -0.042,
      verticalBobAmp: 0.05,
      lateralSwayAmp: 0.018,
      pelvisRollAmp: 0.065,
      pelvisYawAmp: 0.135,
      torsoLean: 0.21,
      spineTwistAmp: 0.16,
      armSwingAmp: 0.88,
      armCrossBodyAmp: 0.12,
      elbowBaseBend: 1.0,
      elbowDynamicBend: 0.36,
    },
    0.2,
    0.05,
    0.28
  ),
];

export class PlayerSystem {
  public group: THREE.Group;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public heading: number = 0; // Radians, 0 = facing North (-Z)
  public isGrounded: boolean = true;
  public isSprinting: boolean = false;
  public currentSpeed: number = 0;
  public animState: PlayerAnimState = 'IDLE';

  public blendWeights: LocomotionBlendWeights = {
    idle: 1,
    walk: 0,
    run: 0,
    sprint: 0,
    lateralX: 0,
    forwardY: 0,
  };

  // Articulated anatomical hierarchy
  private bodyRoot: THREE.Group;
  private pelvisMesh!: THREE.Mesh;
  private torsoGroup!: THREE.Group;
  private headGroup!: THREE.Group;
  private eyelidLeft!: THREE.Mesh;
  private eyelidRight!: THREE.Mesh;

  private leftHipPivot!: THREE.Group;
  private leftKneePivot!: THREE.Group;
  private leftAnklePivot!: THREE.Group;

  private rightHipPivot!: THREE.Group;
  private rightKneePivot!: THREE.Group;
  private rightAnklePivot!: THREE.Group;

  private leftShoulderPivot!: THREE.Group;
  private leftElbowPivot!: THREE.Group;
  private rightShoulderPivot!: THREE.Group;
  private rightElbowPivot!: THREE.Group;

  private contactShadow: THREE.Mesh;

  // 2D Blend Tree & Stride-Synchronized Gait State
  private blendCoordX: number = 0;
  private blendCoordY: number = 0;
  private gaitPhase: number = 0; // [0, 2*PI): Left Stance is [0, PI), Right Stance is [PI, 2*PI)
  private prevFootstepHalf: number = 0;
  private locomotionWeight: number = 0;
  private airborneWeight: number = 0;
  private prevSpeed: number = 0;
  private forwardAccelLean: number = 0;
  private landingCompression: number = 0;
  private wasGrounded: boolean = true;
  private idleTime: number = 0;
  private blinkTimer: number = 2.5;

  // Exact limb segment lengths for 2-bone analytical leg IK
  private readonly thighLength = 0.42;
  private readonly calfLength = 0.38;
  private readonly hipBaseHeight = 0.86;
  private readonly ankleSoleHeight = 0.06;

  private readonly maxWalkSpeed = 3.4;
  private readonly maxRunSpeed = 5.4;
  private readonly maxSprintSpeed = 7.7;
  private readonly jumpVelocity = 5.9;
  private readonly gravity = 18.5;
  private readonly playerRadius = 0.4;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.bodyRoot = new THREE.Group();
    this.group.add(this.bodyRoot);

    // Spawn cleanly on Williams Street outside No. 22 Gate
    const startX = 0;
    const startZ = -1.8;
    const startY = EnvironmentSystem.getTerrainHeight(startX, startZ) + 0.06;
    this.position = new THREE.Vector3(startX, startY, startZ);
    this.velocity = new THREE.Vector3(0, 0, 0);

    const shadowGeo = new THREE.CircleGeometry(0.36, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
    });
    this.contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadow.position.y = 0.08;
    this.contactShadow.renderOrder = 8;
    this.group.add(this.contactShadow);

    this.buildDigitalCloneCharacter();

    this.group.position.copy(this.position);
    scene.add(this.group);
  }

  private buildDigitalCloneCharacter(): void {
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x5e3722,
      roughness: 0.54,
      metalness: 0.04,
    });

    const faceTex = ProceduralTextures.getUserFaceAvatarTexture();
    const faceMat = new THREE.MeshStandardMaterial({
      map: faceTex,
      roughness: 0.52,
      metalness: 0.04,
    });

    const lowerLipMat = new THREE.MeshStandardMaterial({
      color: 0x874e42,
      roughness: 0.44,
    });
    const upperLipMat = new THREE.MeshStandardMaterial({
      color: 0x422419,
      roughness: 0.52,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x121010,
      roughness: 0.95,
    });

    const redShirtTex = ProceduralTextures.getUserRedPatternShirtTexture();
    const shirtMat = new THREE.MeshStandardMaterial({
      map: redShirtTex,
      roughness: 0.78,
    });
    const redCollarMat = new THREE.MeshStandardMaterial({
      color: 0xb81926,
      roughness: 0.72,
    });
    const undershirtMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.85,
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: 0xd4be98,
      roughness: 0.82,
    });
    const sneakerMat = new THREE.MeshStandardMaterial({
      color: 0xf2efe9,
      roughness: 0.5,
    });
    const sneakerAccentMat = new THREE.MeshStandardMaterial({
      color: 0x1e2229,
      roughness: 0.7,
    });

    // 1. Pelvis / Waist (Hip center at Y = 0.88m)
    this.pelvisMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.155, 0.15, 0.18, 16),
      pantsMat
    );
    this.pelvisMesh.scale.set(1.12, 1, 0.78);
    this.pelvisMesh.position.y = 0.88;
    this.pelvisMesh.castShadow = true;
    this.bodyRoot.add(this.pelvisMesh);

    // 2. Articulated Torso & Polo Shirt
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 0.94, 0);

    const abdomen = new THREE.Mesh(
      new THREE.CylinderGeometry(0.175, 0.158, 0.28, 16),
      shirtMat
    );
    abdomen.scale.set(1.1, 1, 0.74);
    abdomen.position.y = 0.14;
    abdomen.castShadow = true;
    this.torsoGroup.add(abdomen);

    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.205, 0.175, 0.32, 16),
      shirtMat
    );
    chest.scale.set(1.16, 1, 0.76);
    chest.position.y = 0.41;
    chest.castShadow = true;
    this.torsoGroup.add(chest);

    [-0.22, 0.22].forEach((sx) => {
      const shoulderCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.088, 14, 12),
        shirtMat
      );
      shoulderCap.scale.set(1.05, 0.88, 0.92);
      shoulderCap.position.set(sx, 0.51, 0);
      shoulderCap.castShadow = true;
      this.torsoGroup.add(shoulderCap);
    });

    const collarRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.095, 0.022, 8, 16, Math.PI * 1.45),
      redCollarMat
    );
    collarRing.rotation.x = Math.PI / 2;
    collarRing.rotation.z = -Math.PI * 0.22;
    collarRing.position.set(0, 0.575, 0.01);
    this.torsoGroup.add(collarRing);

    const placket = new THREE.Mesh(
      new THREE.BoxGeometry(0.042, 0.14, 0.02),
      redCollarMat
    );
    placket.position.set(0, 0.48, -0.142);
    this.torsoGroup.add(placket);

    const innerNeckV = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.07, 0.02),
      undershirtMat
    );
    innerNeckV.position.set(0, 0.54, -0.138);
    this.torsoGroup.add(innerNeckV);

    this.bodyRoot.add(this.torsoGroup);

    // 3. Vertex-Sculpted & UV-Mapped 3D Head
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.58, 0);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.063, 0.075, 0.135, 14),
      skinMat
    );
    neck.position.y = 0.052;
    neck.castShadow = true;
    this.headGroup.add(neck);

    const headGeo = new THREE.SphereGeometry(0.122, 32, 28);
    headGeo.rotateY(Math.PI / 2);

    const hPos = headGeo.attributes.position;
    for (let i = 0; i < hPos.count; i++) {
      let vx = hPos.getX(i);
      let vy = hPos.getY(i);
      let vz = hPos.getZ(i);

      const ny = vy / 0.122;
      vy *= 1.15;

      if (ny < -0.15) {
        const jawTaper = Math.max(0.54, 1.0 + (ny + 0.15) * 0.52);
        vx *= jawTaper;
        if (vz < 0 && ny < -0.55) {
          vz -= 0.012 * (1.0 - Math.abs(vx) / 0.08);
        }
      }

      if (ny > -0.18 && ny < 0.18 && vz < -0.02) {
        const cheekBoost =
          Math.exp(-Math.pow((ny - 0.0) / 0.14, 2)) *
          Math.exp(-Math.pow((Math.abs(vx) - 0.068) / 0.035, 2));
        vx += (vx > 0 ? 1 : -1) * cheekBoost * 0.009;
        vz -= cheekBoost * 0.007;
      }

      if (ny > 0.14 && ny < 0.34 && vz < -0.06) {
        vz -= 0.005;
      }

      hPos.setXYZ(i, vx * 0.91, vy, vz * 0.98);
    }
    headGeo.computeVertexNormals();

    const sculptedHead = new THREE.Mesh(headGeo, faceMat);
    sculptedHead.position.set(0, 0.21, 0);
    sculptedHead.castShadow = true;
    sculptedHead.receiveShadow = true;
    this.headGroup.add(sculptedHead);

    const noseBridge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.024, 0.048, 12),
      skinMat
    );
    noseBridge.rotation.x = -0.32;
    noseBridge.position.set(0, 0.205, -0.114);
    this.headGroup.add(noseBridge);

    const noseTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.021, 12, 12),
      skinMat
    );
    noseTip.scale.set(1.22, 0.86, 0.96);
    noseTip.position.set(0, 0.185, -0.125);
    this.headGroup.add(noseTip);

    [-0.017, 0.017].forEach((nx) => {
      const nostrilWing = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 10, 10),
        skinMat
      );
      nostrilWing.scale.set(1.18, 0.78, 0.92);
      nostrilWing.position.set(nx, 0.182, -0.116);
      this.headGroup.add(nostrilWing);
    });

    const upperLip = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 12, 10),
      upperLipMat
    );
    upperLip.scale.set(1.42, 0.42, 0.72);
    upperLip.position.set(0, 0.155, -0.115);
    this.headGroup.add(upperLip);

    const lowerLip = new THREE.Mesh(
      new THREE.SphereGeometry(0.027, 12, 10),
      lowerLipMat
    );
    lowerLip.scale.set(1.36, 0.48, 0.78);
    lowerLip.position.set(0, 0.141, -0.114);
    this.headGroup.add(lowerLip);

    const lidGeo = new THREE.SphereGeometry(0.017, 8, 8);
    lidGeo.scale(1.3, 0.35, 0.7);
    this.eyelidLeft = new THREE.Mesh(lidGeo, skinMat);
    this.eyelidLeft.position.set(-0.04, 0.222, -0.112);
    this.eyelidLeft.visible = false;
    this.headGroup.add(this.eyelidLeft);

    this.eyelidRight = new THREE.Mesh(lidGeo, skinMat);
    this.eyelidRight.position.set(0.04, 0.222, -0.112);
    this.eyelidRight.visible = false;
    this.headGroup.add(this.eyelidRight);

    [-0.106, 0.106].forEach((earX, idx) => {
      const earGroup = new THREE.Group();
      earGroup.position.set(earX, 0.205, -0.004);
      earGroup.rotation.y = idx === 0 ? -0.22 : 0.22;

      const outerHelix = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 10, 10),
        skinMat
      );
      outerHelix.scale.set(0.36, 1.18, 0.74);
      earGroup.add(outerHelix);

      const lobe = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 8, 8),
        skinMat
      );
      lobe.position.set(0, -0.022, 0.002);
      earGroup.add(lobe);

      this.headGroup.add(earGroup);
    });

    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.118, 18, 16),
      hairMat
    );
    hairCap.scale.set(0.92, 1.04, 1.02);
    hairCap.position.set(0, 0.252, 0.014);
    hairCap.castShadow = true;
    this.headGroup.add(hairCap);

    for (let ring = 0; ring < 3; ring++) {
      const count = 8 + ring * 4;
      const radius = 0.028 + ring * 0.028;
      for (let c = 0; c < count; c++) {
        const angle = (c / count) * Math.PI * 2 + ring * 0.5;
        const cx = Math.cos(angle) * radius * 0.88;
        const cz = Math.sin(angle) * radius - 0.005;
        const cy = 0.352 - ring * 0.014 + (c % 2) * 0.005;
        const coil = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.026 - ring * 0.002, 1),
          hairMat
        );
        coil.scale.set(1.1, 0.82, 1.1);
        coil.position.set(cx, cy, cz);
        this.headGroup.add(coil);
      }
    }

    this.torsoGroup.add(this.headGroup);

    // 4. Anatomical Arms
    const buildArm = (isLeft: boolean) => {
      const sign = isLeft ? -1 : 1;
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(sign * 0.245, 0.51, 0);

      const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.06, 0.16, 12),
        shirtMat
      );
      sleeve.position.y = -0.065;
      sleeve.castShadow = true;
      shoulderPivot.add(sleeve);

      const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.054, 0.046, 0.27, 12),
        skinMat
      );
      upperArm.position.y = -0.14;
      upperArm.castShadow = true;
      shoulderPivot.add(upperArm);

      const elbowSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.046, 10, 10),
        skinMat
      );
      elbowSphere.position.y = -0.275;
      shoulderPivot.add(elbowSphere);

      const elbowPivot = new THREE.Group();
      elbowPivot.position.set(0, -0.275, 0);

      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.046, 0.036, 0.25, 12),
        skinMat
      );
      forearm.position.y = -0.125;
      forearm.castShadow = true;
      elbowPivot.add(forearm);

      const palm = new THREE.Mesh(
        new THREE.BoxGeometry(0.034, 0.082, 0.066),
        skinMat
      );
      palm.position.set(0, -0.278, -0.005);
      elbowPivot.add(palm);

      const thumb = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.01, 0.042, 6),
        skinMat
      );
      thumb.rotation.x = -0.5;
      thumb.position.set(sign * -0.015, -0.265, -0.038);
      elbowPivot.add(thumb);

      shoulderPivot.add(elbowPivot);
      this.torsoGroup.add(shoulderPivot);
      return { shoulderPivot, elbowPivot };
    };

    const leftArm = buildArm(true);
    this.leftShoulderPivot = leftArm.shoulderPivot;
    this.leftElbowPivot = leftArm.elbowPivot;

    const rightArm = buildArm(false);
    this.rightShoulderPivot = rightArm.shoulderPivot;
    this.rightElbowPivot = rightArm.elbowPivot;

    // 5. Anatomical Legs with Articulated Hip, Knee & Ankle Pivots
    const buildLeg = (isLeft: boolean) => {
      const sign = isLeft ? -1 : 1;
      const hipPivot = new THREE.Group();
      hipPivot.position.set(sign * 0.105, this.hipBaseHeight, 0);

      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.086, 0.068, this.thighLength, 12),
        pantsMat
      );
      thigh.position.y = -this.thighLength / 2;
      thigh.castShadow = true;
      hipPivot.add(thigh);

      const kneeJoint = new THREE.Mesh(
        new THREE.SphereGeometry(0.066, 10, 8),
        pantsMat
      );
      kneeJoint.position.y = -this.thighLength;
      hipPivot.add(kneeJoint);

      const kneePivot = new THREE.Group();
      kneePivot.position.set(0, -this.thighLength, 0);

      const calf = new THREE.Mesh(
        new THREE.CylinderGeometry(0.066, 0.052, 0.37, 12),
        pantsMat
      );
      calf.position.y = -0.185;
      calf.castShadow = true;
      kneePivot.add(calf);

      const anklePivot = new THREE.Group();
      anklePivot.position.set(0, -this.calfLength, 0);

      const sneakerUpper = new THREE.Mesh(
        new THREE.BoxGeometry(0.105, 0.065, 0.24),
        sneakerMat
      );
      sneakerUpper.position.set(0, -0.025, -0.045);
      sneakerUpper.castShadow = true;
      anklePivot.add(sneakerUpper);

      const sneakerTongue = new THREE.Mesh(
        new THREE.BoxGeometry(0.085, 0.035, 0.09),
        sneakerAccentMat
      );
      sneakerTongue.position.set(0, 0.01, -0.03);
      anklePivot.add(sneakerTongue);

      const sneakerSole = new THREE.Mesh(
        new THREE.BoxGeometry(0.112, 0.026, 0.255),
        sneakerAccentMat
      );
      sneakerSole.position.set(0, -0.047, -0.045);
      anklePivot.add(sneakerSole);

      kneePivot.add(anklePivot);
      hipPivot.add(kneePivot);
      this.bodyRoot.add(hipPivot);
      return { hipPivot, kneePivot, anklePivot };
    };

    const leftLeg = buildLeg(true);
    this.leftHipPivot = leftLeg.hipPivot;
    this.leftKneePivot = leftLeg.kneePivot;
    this.leftAnklePivot = leftLeg.anklePivot;

    const rightLeg = buildLeg(false);
    this.rightHipPivot = rightLeg.hipPivot;
    this.rightKneePivot = rightLeg.kneePivot;
    this.rightAnklePivot = rightLeg.anklePivot;
  }

  public respawnAtWilliamsStreet(): void {
    const sx = 0;
    const sz = -1.8;
    const sy = EnvironmentSystem.getTerrainHeight(sx, sz);
    this.position.set(sx, sy, sz);
    this.velocity.set(0, 0, 0);
    this.currentSpeed = 0;
    this.heading = 0;
    this.blendCoordX = 0;
    this.blendCoordY = 0;
    this.locomotionWeight = 0;
    this.group.position.copy(this.position);
    this.group.rotation.y = 0;
  }

  public update(
    dt: number,
    input: ControlInputState,
    cameraYaw: number,
    colliders: ColliderBox[],
    onJumpCallback?: () => void,
    onFootstepCallback?: (speed: number) => void
  ): void {
    const prevX = this.position.x;
    const prevZ = this.position.z;
    const prevHeading = this.heading;

    // 1. Read Joystick / Keyboard Input Vector (Strictly clamped to <= 1.0 so diagonal movement is never faster)
    const rawMag = Math.hypot(input.moveX, input.moveY);
    const moveMag = rawMag < 0.02 ? 0 : Math.min(1.0, rawMag);
    const normX = rawMag > 0.001 ? input.moveX / Math.max(1.0, rawMag) : 0;
    const normY = rawMag > 0.001 ? input.moveY / Math.max(1.0, rawMag) : 0;

    this.isSprinting = input.sprintActive && moveMag > 0.15;

    // 2. Determine Target Locomotion Speed (IDLE -> WALK -> RUN -> SPRINT)
    let targetSpeed = 0;
    if (moveMag > 0) {
      if (this.isSprinting) {
        targetSpeed = this.maxSprintSpeed * moveMag;
      } else if (moveMag > 0.6) {
        const runFactor = (moveMag - 0.6) / 0.4;
        targetSpeed =
          this.maxWalkSpeed + (this.maxRunSpeed - this.maxWalkSpeed) * runFactor;
      } else {
        targetSpeed = this.maxWalkSpeed * (moveMag / 0.6);
      }
    }

    // 3. Smooth Character Rotation & Responsive Acceleration / Immediate Stopping
    if (moveMag > 0) {
      // Pushing forward (normY < 0) moves along cameraYaw (inputAngle = 0)
      // Pushing right (normX > 0) moves 90 deg right of cameraYaw
      // Pushing backward (normY > 0) moves 180 deg from cameraYaw
      const inputAngle = Math.atan2(normX, -normY);
      const targetHeading = cameraYaw - inputAngle;

      let angleDiff = targetHeading - this.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      const turnRate = this.isGrounded ? 11.5 : 5.0;
      this.heading += angleDiff * Math.min(1, dt * turnRate);
      // Normalize heading to [-PI, PI]
      while (this.heading > Math.PI) this.heading -= Math.PI * 2;
      while (this.heading < -Math.PI) this.heading += Math.PI * 2;

      // Move in the desired world direction so the player responds immediately even while turning
      const moveDirX = -Math.sin(targetHeading);
      const moveDirZ = -Math.cos(targetHeading);
      const desiredVx = moveDirX * targetSpeed;
      const desiredVz = moveDirZ * targetSpeed;

      const accel = this.isGrounded ? 14.0 : 4.5;
      this.velocity.x += (desiredVx - this.velocity.x) * Math.min(1, dt * accel);
      this.velocity.z += (desiredVz - this.velocity.z) * Math.min(1, dt * accel);
    } else {
      // JOYSTICK RELEASED: Rapid, smooth braking to a complete stop (zero coasting or sliding!)
      const stopDecel = this.isGrounded ? 22.0 : 4.0;
      const decelFactor = Math.max(0, 1 - dt * stopDecel);
      this.velocity.x *= decelFactor;
      this.velocity.z *= decelFactor;

      if (Math.hypot(this.velocity.x, this.velocity.z) < 0.08) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }

    this.currentSpeed = Math.hypot(this.velocity.x, this.velocity.z);

    // 4. Compute 2D Blend Space Coordinates (blendCoordX in [-1, 1], blendCoordY in [0, 1])
    let rawBlendY = 0;
    if (this.currentSpeed <= this.maxWalkSpeed) {
      rawBlendY = (this.currentSpeed / this.maxWalkSpeed) * 0.38;
    } else if (this.currentSpeed <= this.maxRunSpeed) {
      rawBlendY =
        0.38 +
        ((this.currentSpeed - this.maxWalkSpeed) /
          (this.maxRunSpeed - this.maxWalkSpeed)) *
          (0.68 - 0.38);
    } else {
      rawBlendY =
        0.68 +
        Math.min(
          1,
          (this.currentSpeed - this.maxRunSpeed) /
            (this.maxSprintSpeed - this.maxRunSpeed)
        ) *
          (1.0 - 0.68);
    }

    let deltaHeading = this.heading - prevHeading;
    while (deltaHeading > Math.PI) deltaHeading -= Math.PI * 2;
    while (deltaHeading < -Math.PI) deltaHeading += Math.PI * 2;
    const angularTurnVel =
      this.currentSpeed > 0.15 ? deltaHeading / Math.max(0.008, dt) : 0;

    const rawBlendX = Math.max(-1, Math.min(1, -angularTurnVel * 0.22));

    const yRate = rawBlendY > this.blendCoordY ? 12.0 : 15.0;
    this.blendCoordY += (rawBlendY - this.blendCoordY) * Math.min(1, dt * yRate);
    if (this.currentSpeed === 0 && this.blendCoordY < 0.015) {
      this.blendCoordY = 0;
    }
    this.blendCoordX += (rawBlendX - this.blendCoordX) * Math.min(1, dt * 10.0);

    // Forward acceleration/braking pitch
    const rawAccel = (this.currentSpeed - this.prevSpeed) / Math.max(0.008, dt);
    this.prevSpeed = this.currentSpeed;
    const targetAccelPitch = Math.max(-0.09, Math.min(0.11, rawAccel * 0.009));
    this.forwardAccelLean +=
      (targetAccelPitch - this.forwardAccelLean) * Math.min(1, dt * 9);

    // 5. Jump & Gravity
    if (input.jumpRequested && this.isGrounded) {
      this.velocity.y = this.jumpVelocity;
      this.isGrounded = false;
      if (onJumpCallback) onJumpCallback();
    }

    this.velocity.y -= this.gravity * dt;

    // 6. Move & Resolve Horizontal Collisions (Circle-vs-AABB Push-Out prevents getting stuck or passing through walls)
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.resolveHorizontalCollisions(colliders);

    this.position.x = Math.max(-92, Math.min(1340, this.position.x));
    this.position.z = Math.max(-92, Math.min(92, this.position.z));

    const frameDisplacement = Math.hypot(
      this.position.x - prevX,
      this.position.z - prevZ
    );

    // 7. Vertical Terrain & Road Surface Alignment (including Sewa River Bridge deck at X in [642, 698])
    this.position.y += this.velocity.y * dt;
    let groundY =
      EnvironmentSystem.getTerrainHeight(this.position.x, this.position.z) +
      0.06;
    if (this.position.x >= 642 && this.position.x <= 698) {
      const hwyZ = EnvironmentSystem.getHighwayCenterZ(this.position.x);
      if (Math.abs(this.position.z - hwyZ) < 5.5) {
        groundY += Math.sin(((this.position.x - 642) / 56) * Math.PI) * 1.15;
      }
    }

    if (this.position.y <= groundY) {
      if (!this.wasGrounded) {
        this.landingCompression = Math.min(
          0.12,
          Math.abs(this.velocity.y) * 0.016
        );
        if (onFootstepCallback) onFootstepCallback(4.8);
      }
      this.position.y = groundY;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }
    this.wasGrounded = this.isGrounded;

    if (this.landingCompression > 0.001) {
      this.landingCompression *= Math.max(0, 1 - dt * 12);
    } else {
      this.landingCompression = 0;
    }

    const heightAboveGround = Math.max(0, this.position.y - groundY);
    this.contactShadow.position.y = -heightAboveGround + 0.08;
    const shadowScale = Math.max(0.45, 1 - heightAboveGround * 0.28);
    this.contactShadow.scale.set(shadowScale, shadowScale, 1);

    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;

    this.update2DBlendTreeAndIK(dt, frameDisplacement, onFootstepCallback);
  }

  // Circle-vs-AABB minimum-penetration push-out in the (X, Z) plane
  // Ensures smooth sliding along walls and guarantees the player can NEVER get trapped inside a collider
  private resolveHorizontalCollisions(colliders: ColliderBox[]): void {
    const r = this.playerRadius;
    const playerMinY = this.position.y + 0.15;
    const playerMaxY = this.position.y + 1.75;

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < colliders.length; i++) {
        const box = colliders[i];
        if (playerMaxY < box.minY || playerMinY > box.maxY) continue;

        // Closest point on the AABB to the player's circle center (position.x, position.z)
        const closestX = Math.max(box.minX, Math.min(this.position.x, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(this.position.z, box.maxZ));

        const dx = this.position.x - closestX;
        const dz = this.position.z - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < r * r) {
          if (distSq > 0.00001) {
            // Player circle overlaps the outside edge/corner of the AABB: push out along normal
            const dist = Math.sqrt(distSq);
            const overlap = r - dist;
            const nx = dx / dist;
            const nz = dz / dist;
            this.position.x += nx * overlap;
            this.position.z += nz * overlap;

            // Cancel velocity component into the wall normal so player slides smoothly
            const vn = this.velocity.x * nx + this.velocity.z * nz;
            if (vn < 0) {
              this.velocity.x -= vn * nx;
              this.velocity.z -= vn * nz;
            }
          } else {
            // Center is inside the AABB: push out along the nearest face
            const leftPen = this.position.x - box.minX + r;
            const rightPen = box.maxX - this.position.x + r;
            const backPen = this.position.z - box.minZ + r;
            const frontPen = box.maxZ - this.position.z + r;
            const minPen = Math.min(leftPen, rightPen, backPen, frontPen);

            if (minPen === leftPen) {
              this.position.x = box.minX - r;
              this.velocity.x = Math.min(0, this.velocity.x);
            } else if (minPen === rightPen) {
              this.position.x = box.maxX + r;
              this.velocity.x = Math.max(0, this.velocity.x);
            } else if (minPen === backPen) {
              this.position.z = box.minZ - r;
              this.velocity.z = Math.min(0, this.velocity.z);
            } else {
              this.position.z = box.maxZ + r;
              this.velocity.z = Math.max(0, this.velocity.z);
            }
          }
        }
      }
    }
  }

  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  private lerpNodePair(
    a: BlendTreeNode2D,
    b: BlendTreeNode2D,
    t: number
  ): BlendTreeNode2D {
    const l = (v0: number, v1: number) => v0 + (v1 - v0) * t;
    return {
      id: t < 0.5 ? a.id : b.id,
      coordX: l(a.coordX, b.coordX),
      coordY: l(a.coordY, b.coordY),
      referenceSpeed: l(a.referenceSpeed, b.referenceSpeed),
      strideLength: l(a.strideLength, b.strideLength),
      leftStrideScale: l(a.leftStrideScale, b.leftStrideScale),
      rightStrideScale: l(a.rightStrideScale, b.rightStrideScale),
      lateralStepWidth: l(a.lateralStepWidth, b.lateralStepWidth),
      stepClearance: l(a.stepClearance, b.stepClearance),
      hipHeightOffset: l(a.hipHeightOffset, b.hipHeightOffset),
      verticalBobAmp: l(a.verticalBobAmp, b.verticalBobAmp),
      lateralSwayAmp: l(a.lateralSwayAmp, b.lateralSwayAmp),
      pelvisRollAmp: l(a.pelvisRollAmp, b.pelvisRollAmp),
      pelvisYawAmp: l(a.pelvisYawAmp, b.pelvisYawAmp),
      torsoLean: l(a.torsoLean, b.torsoLean),
      torsoBankAngle: l(a.torsoBankAngle, b.torsoBankAngle),
      spineTwistAmp: l(a.spineTwistAmp, b.spineTwistAmp),
      armSwingAmp: l(a.armSwingAmp, b.armSwingAmp),
      armCrossBodyAmp: l(a.armCrossBodyAmp, b.armCrossBodyAmp),
      elbowBaseBend: l(a.elbowBaseBend, b.elbowBaseBend),
      elbowDynamicBend: l(a.elbowDynamicBend, b.elbowDynamicBend),
      headYawLead: l(a.headYawLead, b.headYawLead),
    };
  }

  private evaluateBlendTree2D(
    coordX: number,
    coordY: number
  ): BlendTreeNode2D {
    const clampedX = Math.max(-1, Math.min(1, coordX));
    const clampedY = Math.max(0, Math.min(1, coordY));

    const rowBlended: BlendTreeNode2D[] = BLEND_TREE_2D_GRID.map((row) => {
      if (clampedX < 0) {
        const tx = 1 + clampedX;
        return this.lerpNodePair(row[0], row[1], tx);
      } else {
        const tx = clampedX;
        return this.lerpNodePair(row[1], row[2], tx);
      }
    });

    let wIdle = 0;
    let wWalk = 0;
    let wRun = 0;
    let wSprint = 0;
    let result: BlendTreeNode2D;

    if (clampedY <= 0.38) {
      const ty = this.smoothstep(0.0, 0.38, clampedY);
      wIdle = 1 - ty;
      wWalk = ty;
      result = this.lerpNodePair(rowBlended[0], rowBlended[1], ty);
    } else if (clampedY <= 0.68) {
      const ty = this.smoothstep(0.38, 0.68, clampedY);
      wWalk = 1 - ty;
      wRun = ty;
      result = this.lerpNodePair(rowBlended[1], rowBlended[2], ty);
    } else {
      const ty = this.smoothstep(0.68, 1.0, clampedY);
      wRun = 1 - ty;
      wSprint = ty;
      result = this.lerpNodePair(rowBlended[2], rowBlended[3], ty);
    }

    this.blendWeights = {
      idle: Number(wIdle.toFixed(3)),
      walk: Number(wWalk.toFixed(3)),
      run: Number(wRun.toFixed(3)),
      sprint: Number(wSprint.toFixed(3)),
      lateralX: Number(clampedX.toFixed(3)),
      forwardY: Number(clampedY.toFixed(3)),
    };

    if (!this.isGrounded) {
      this.animState = 'JUMP';
    } else if (this.currentSpeed < 0.1 || wIdle >= 0.75) {
      this.animState = 'IDLE';
    } else if (wSprint >= 0.45) {
      this.animState = 'SPRINT';
    } else if (wRun >= 0.45) {
      this.animState = 'RUN';
    } else {
      this.animState = 'WALK';
    }

    return result;
  }

  // Analytical 2-Bone Leg IK in Local Character Space (100% immune to world heading sign flips)
  private solveLocalTwoBoneLegIK(
    targetDownDist: number,
    targetForwardZ: number
  ): { hipPitch: number; kneePitch: number } {
    const L1 = this.thighLength;
    const L2 = this.calfLength;
    const maxReach = (L1 + L2) * 0.994;
    const minReach = Math.abs(L1 - L2) + 0.04;

    const down = Math.max(0.2, targetDownDist);
    const fwd = -targetForwardZ; // Positive when foot is in front of hip (-Z)
    const d = Math.max(minReach, Math.min(maxReach, Math.hypot(down, fwd)));

    const aimAngle = Math.atan2(fwd, down);

    const cosAlpha =
      (L1 * L1 + d * d - L2 * L2) / Math.max(0.0001, 2 * L1 * d);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));

    const cosBeta =
      (L1 * L1 + L2 * L2 - d * d) / Math.max(0.0001, 2 * L1 * L2);
    const beta = Math.acos(Math.max(-1, Math.min(1, cosBeta)));

    const hipPitch = aimAngle + alpha;
    const kneePitch = -(Math.PI - beta);

    return { hipPitch, kneePitch };
  }

  // Computes Stride-Locked Local-Space Foot Trajectory:
  // - During Stance [0, PI): foot moves linearly from -S/2 to +S/2 at exact speed v, so ground slip is 0.0 m/s!
  // - During Swing [PI, 2*PI): foot lifts off the ground and arcs forward along a smooth cycloid from +S/2 to -S/2.
  private computeStrideLockedFootTrajectory(
    legPhase: number,
    legStrideLength: number,
    stepClearance: number,
    locoWeight: number
  ): { localZ: number; liftY: number; anklePitch: number } {
    if (locoWeight < 0.005) {
      return { localZ: 0, liftY: 0, anklePitch: 0 };
    }

    const halfS = legStrideLength * 0.46 * locoWeight;

    if (legPhase < Math.PI) {
      // STANCE PHASE [0, PI): Linear backward travel in local space matches forward world speed identically
      const u = legPhase / Math.PI; // 0 = front heel strike (-halfS), 1 = rear toe-off (+halfS)
      const localZ = -halfS + u * (halfS * 2);

      let anklePitch = 0;
      if (u < 0.18) {
        anklePitch = (1 - u / 0.18) * 0.16 * locoWeight;
      } else if (u > 0.72) {
        anklePitch = -((u - 0.72) / 0.28) * 0.3 * locoWeight;
      }

      const pushOffLift =
        u > 0.84
          ? Math.sin(((u - 0.84) / 0.16) * (Math.PI / 2)) * 0.03 * locoWeight
          : 0;

      return { localZ, liftY: pushOffLift, anklePitch };
    } else {
      // SWING PHASE [PI, 2*PI): Smooth cycloid forward swing from +halfS to -halfS
      const u = (legPhase - Math.PI) / Math.PI;
      const swingProgress = u - Math.sin(u * Math.PI * 2) / (Math.PI * 2);
      const localZ = halfS - swingProgress * (halfS * 2);

      const liftProfile =
        Math.sin(u * Math.PI) * (1.0 + 0.22 * Math.sin(u * Math.PI * 2));
      const liftY = Math.max(0, liftProfile) * stepClearance * locoWeight;

      const anklePitch =
        (-Math.sin(u * Math.PI) * 0.2 + (u > 0.68 ? (u - 0.68) * 0.45 : 0)) *
        locoWeight;

      return { localZ, liftY, anklePitch };
    }
  }

  private update2DBlendTreeAndIK(
    dt: number,
    frameDisplacement: number,
    onFootstepCallback?: (speed: number) => void
  ): void {
    this.idleTime += dt;

    // 1. Natural eye blink
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.eyelidLeft.visible = true;
      this.eyelidRight.visible = true;
      if (this.blinkTimer <= -0.13) {
        this.eyelidLeft.visible = false;
        this.eyelidRight.visible = false;
        this.blinkTimer = 2.6 + Math.random() * 3.2;
      }
    }

    // 2. Evaluate the 2D Blend Tree
    const node = this.evaluateBlendTree2D(this.blendCoordX, this.blendCoordY);

    const targetLocoWeight =
      this.currentSpeed < 0.05
        ? 0
        : this.smoothstep(0.02, 0.18, this.blendCoordY);
    const locoRate = targetLocoWeight > this.locomotionWeight ? 12.0 : 14.0;
    this.locomotionWeight +=
      (targetLocoWeight - this.locomotionWeight) * Math.min(1, dt * locoRate);
    if (this.currentSpeed === 0 && this.locomotionWeight < 0.01) {
      this.locomotionWeight = 0;
    }

    const targetAirWeight = this.isGrounded ? 0 : 1;
    this.airborneWeight +=
      (targetAirWeight - this.airborneWeight) * Math.min(1, dt * 14);

    // 3. Advance Gait Phase strictly by ground distance traveled
    if (this.isGrounded && frameDisplacement > 0.0001 && this.locomotionWeight > 0.02) {
      const fullCycleMeters = Math.max(0.55, node.strideLength * 2.0);
      const deltaPhase = (frameDisplacement / fullCycleMeters) * Math.PI * 2;
      this.gaitPhase = (this.gaitPhase + deltaPhase) % (Math.PI * 2);

      // Trigger gait-synced footstep audio on each half-cycle heel strike (0 and PI)
      const currentHalf = this.gaitPhase < Math.PI ? 0 : 1;
      if (currentHalf !== this.prevFootstepHalf && this.currentSpeed > 0.25) {
        this.prevFootstepHalf = currentHalf;
        if (onFootstepCallback) onFootstepCallback(this.currentSpeed);
      }
    }

    const leftPhase = this.gaitPhase;
    const rightPhase = (this.gaitPhase + Math.PI) % (Math.PI * 2);

    const sinGait = Math.sin(this.gaitPhase);
    const cosGait = Math.cos(this.gaitPhase);

    // 4. Body Weight Shifting over Active Stance Foot
    const stanceLateralShift =
      -sinGait * node.lateralSwayAmp * this.locomotionWeight;
    const turnLateralShift = node.lateralStepWidth * 0.4 * this.locomotionWeight;
    const totalLateralShift =
      (stanceLateralShift + turnLateralShift) * (1 - this.airborneWeight);

    const verticalBounce =
      -Math.cos(this.gaitPhase * 2) *
      node.verticalBobAmp *
      this.locomotionWeight;
    const totalPelvisYOffset =
      (node.hipHeightOffset * this.locomotionWeight +
        verticalBounce -
        this.landingCompression) *
      (1 - this.airborneWeight);

    this.bodyRoot.position.x = totalLateralShift;
    this.bodyRoot.position.y = totalPelvisYOffset;

    // 5. Pelvis 3-Axis Biomechanical Motion
    const pelvisRoll =
      sinGait * node.pelvisRollAmp * this.locomotionWeight;
    const pelvisYaw =
      cosGait * node.pelvisYawAmp * this.locomotionWeight;

    this.pelvisMesh.rotation.z = pelvisRoll;
    this.pelvisMesh.rotation.y = pelvisYaw;
    this.bodyRoot.rotation.z = node.torsoBankAngle * 0.45;

    // 6. Stride-Locked Foot Trajectories & 2-Bone Analytical Leg IK
    const leftFoot = this.computeStrideLockedFootTrajectory(
      leftPhase,
      node.strideLength * node.leftStrideScale,
      node.stepClearance,
      this.locomotionWeight
    );

    const rightFoot = this.computeStrideLockedFootTrajectory(
      rightPhase,
      node.strideLength * node.rightStrideScale,
      node.stepClearance,
      this.locomotionWeight
    );

    const baseDownDist = this.hipBaseHeight - this.ankleSoleHeight; // 0.80m
    const leftDownDist =
      baseDownDist + totalPelvisYOffset - leftFoot.liftY;
    const rightDownDist =
      baseDownDist + totalPelvisYOffset - rightFoot.liftY;

    const leftIK = this.solveLocalTwoBoneLegIK(leftDownDist, leftFoot.localZ);
    const rightIK = this.solveLocalTwoBoneLegIK(
      rightDownDist,
      rightFoot.localZ
    );

    const airW = this.airborneWeight;
    const gndW = 1 - airW;

    this.leftHipPivot.rotation.x = leftIK.hipPitch * gndW + 0.45 * airW;
    this.leftKneePivot.rotation.x = leftIK.kneePitch * gndW + -0.68 * airW;
    this.leftAnklePivot.rotation.x =
      (-(leftIK.hipPitch + leftIK.kneePitch) + leftFoot.anklePitch) * gndW +
      0.22 * airW;

    this.rightHipPivot.rotation.x = rightIK.hipPitch * gndW + -0.24 * airW;
    this.rightKneePivot.rotation.x = rightIK.kneePitch * gndW + -0.45 * airW;
    this.rightAnklePivot.rotation.x =
      (-(rightIK.hipPitch + rightIK.kneePitch) + rightFoot.anklePitch) * gndW +
      0.26 * airW;

    // Subtle hip roll counter-compensation so legs stay straight under hips
    const hipRollComp = -totalLateralShift * 0.75 - pelvisRoll * 0.45;
    this.leftHipPivot.rotation.z = hipRollComp * gndW;
    this.rightHipPivot.rotation.z = hipRollComp * gndW;
    this.leftAnklePivot.rotation.z = -hipRollComp * gndW;
    this.rightAnklePivot.rotation.z = -hipRollComp * gndW;

    // 7. Upper Body: Spine Twist, Forward Lean, Turn Bank & Calm Idle Breathing
    const breathWave =
      Math.sin(this.idleTime * 2.0) *
      0.012 *
      (1 - this.locomotionWeight * 0.6);
    const targetTorsoPitch =
      (node.torsoLean * this.locomotionWeight +
        this.forwardAccelLean +
        breathWave) *
        gndW +
      0.12 * airW;
    const targetTorsoYaw =
      -cosGait * node.spineTwistAmp * this.locomotionWeight * gndW;
    const targetTorsoRoll =
      (node.torsoBankAngle * 0.55 - pelvisRoll * 0.65) * gndW;

    this.torsoGroup.rotation.x = targetTorsoPitch;
    this.torsoGroup.rotation.y = targetTorsoYaw;
    this.torsoGroup.rotation.z = targetTorsoRoll;

    // 8. Contralateral Arm Swing & Dynamic Elbow Flexion
    // In our gait cycle: when sinGait > 0, Left Leg is in stance moving backward (+Z) and Right Leg is in swing moving forward (-Z).
    // Therefore Left Arm swings forward (+X pitch = +sinGait) and Right Arm swings backward (-X pitch = -sinGait).
    const armPhase = sinGait;
    const leftArmSwing =
      (armPhase * node.armSwingAmp * this.locomotionWeight + breathWave * 0.5) *
        gndW +
      -0.48 * airW;
    const rightArmSwing =
      (-armPhase * node.armSwingAmp * this.locomotionWeight -
        breathWave * 0.5) *
        gndW +
      0.32 * airW;

    this.leftShoulderPivot.rotation.x = leftArmSwing;
    this.rightShoulderPivot.rotation.x = rightArmSwing;

    this.leftShoulderPivot.rotation.z =
      0.04 +
      Math.max(0, armPhase) *
        node.armCrossBodyAmp *
        this.locomotionWeight *
        gndW;
    this.rightShoulderPivot.rotation.z =
      -0.04 -
      Math.max(0, -armPhase) *
        node.armCrossBodyAmp *
        this.locomotionWeight *
        gndW;

    const idleElbow = 0.14;
    const locoLeftElbow =
      node.elbowBaseBend + Math.max(0, armPhase) * node.elbowDynamicBend;
    const locoRightElbow =
      node.elbowBaseBend + Math.max(0, -armPhase) * node.elbowDynamicBend;

    this.leftElbowPivot.rotation.x =
      (idleElbow + (locoLeftElbow - idleElbow) * this.locomotionWeight) * gndW +
      0.62 * airW;
    this.rightElbowPivot.rotation.x =
      (idleElbow + (locoRightElbow - idleElbow) * this.locomotionWeight) *
        gndW +
      0.52 * airW;

    // 9. Head Stabilization & Gaze Lead
    const idleHeadLook =
      Math.sin(this.idleTime * 0.7) * 0.03 * (1 - this.locomotionWeight);
    this.headGroup.rotation.x = -targetTorsoPitch * 0.65;
    this.headGroup.rotation.y =
      -targetTorsoYaw * 0.8 +
      node.headYawLead * this.locomotionWeight +
      idleHeadLook;
    this.headGroup.rotation.z = -targetTorsoRoll * 0.5;
  }
}
