import * as THREE from 'three';
import {
  WeatherCondition,
  WorldSettings,
  loadSavedWorldSettings,
  saveWorldSettings,
} from './GameState';

export class LightingSystem {
  public settings: WorldSettings;
  public timeHours: number = 10.5; // Starts at 10:30 AM Freetown daylight
  public isNight: boolean = false;
  public streetLightActivation: number = 0.0; // 0 = OFF (Day), 1 = ON (Night), smooth transition at 18:00 & 06:00
  public wetness: number = 0;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private ambientLight: THREE.AmbientLight;
  private skyMesh: THREE.Mesh;
  private cloudGroups: THREE.Group[] = [];
  private cloudMat: THREE.MeshLambertMaterial;
  private rainPoints: THREE.Points;
  private rainCount = 900;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.settings = loadSavedWorldSettings();

    this.scene.fog = new THREE.FogExp2(0xd8e4f0, 0.0044);
    this.scene.background = new THREE.Color(0xc5dcf0);

    this.hemiLight = new THREE.HemisphereLight(0xe8f3ff, 0xba6b3d, 0.92);
    this.hemiLight.position.set(0, 55, 0);
    this.scene.add(this.hemiLight);

    this.ambientLight = new THREE.AmbientLight(0xfff5e8, 0.38);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfff6e5, 2.2);
    this.sunLight.position.set(42, 68, 34);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 8;
    this.sunLight.shadow.camera.far = 170;
    const d = 54;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    const skyGeo = new THREE.SphereGeometry(270, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x2f6ec9) },
        horizonColor: { value: new THREE.Color(0xe6edf5) },
        bottomColor: { value: new THREE.Color(0xc97b4b) },
        sunDir: { value: new THREE.Vector3(42, 68, 34).normalize() },
        sunGlowIntensity: { value: 0.45 },
        offset: { value: 12 },
        exponent: { value: 0.55 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDir;
        uniform float sunGlowIntensity;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          vec3 dir = normalize( vWorldPosition );
          float h = normalize( vWorldPosition + vec3(0.0, offset, 0.0) ).y;
          vec3 col = mix( horizonColor, topColor, max( pow( max( h, 0.0 ), exponent ), 0.0 ) );
          if (h < 0.0) {
            col = mix( horizonColor, bottomColor, min(1.0, -h * 3.0) );
          }
          float sunAmt = max( dot( dir, sunDir ), 0.0 );
          col += vec3(1.0, 0.92, 0.78) * pow( sunAmt, 36.0 ) * sunGlowIntensity;
          gl_FragColor = vec4( col, 1.0 );
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyMesh);

    this.cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.84,
    });
    this.createTropicalClouds();

    this.rainPoints = this.createRainSystem();
    this.scene.add(this.rainPoints);
  }

  private createTropicalClouds(): void {
    const puffGeo = new THREE.DodecahedronGeometry(1, 1);
    const cloudPositions = [
      [-70, 58, -85],
      [48, 62, -72],
      [95, 56, 22],
      [-88, 60, 42],
      [18, 66, 98],
      [-34, 64, -32],
      [62, 60, -18],
    ];

    cloudPositions.forEach(([cx, cy, cz]) => {
      const group = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const puff = new THREE.Mesh(puffGeo, this.cloudMat);
        puff.position.set((i - 1.5) * 6.5, (i % 2) * 2.2, (i % 3 - 1) * 3.5);
        const scale = 5.5 + (i % 2) * 3.2;
        puff.scale.set(scale * 1.65, scale * 0.62, scale * 1.15);
        group.add(puff);
      }
      group.position.set(cx, cy, cz);
      this.scene.add(group);
      this.cloudGroups.push(group);
    });
  }

  private createRainSystem(): THREE.Points {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 48;
      positions[i * 3 + 1] = Math.random() * 24;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 48;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xdbeafe,
      size: 0.16,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });

    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    return pts;
  }

  public updateWorldSettings(partial: Partial<WorldSettings>): WorldSettings {
    this.settings = { ...this.settings, ...partial };
    saveWorldSettings(this.settings);
    return this.settings;
  }

  public setTimeHours(hours: number): void {
    this.timeHours = ((hours % 24) + 24) % 24;
    this.computeStreetLightActivation();
  }

  public getFormattedClock(): string {
    const totalMinutes = Math.floor(this.timeHours * 60);
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  public getDayPhaseName(): string {
    const h = this.timeHours;
    if (h >= 5.5 && h < 7.0) return 'Sunrise';
    if (h >= 7.0 && h < 11.5) return 'Morning';
    if (h >= 11.5 && h < 15.0) return 'Midday';
    if (h >= 15.0 && h < 17.5) return 'Afternoon';
    if (h >= 17.5 && h < 19.0) return 'Sunset';
    if (h >= 19.0 && h < 21.0) return 'Evening';
    return 'Night';
  }

  // Smoothly computes street-light activation factor from the 24-hour clock:
  // - 06:30 to 17:45 -> 0.0 (Daytime OFF)
  // - 17:45 to 18:15 -> smoothly ramps 0.0 -> 1.0 (18:00 Dusk activation)
  // - 18:15 to 06:00 -> 1.0 (Nighttime ON)
  // - 06:00 to 06:30 -> smoothly ramps 1.0 -> 0.0 (Morning deactivation)
  private computeStreetLightActivation(): void {
    const h = this.timeHours;
    if (h >= 18.25 || h < 6.0) {
      this.streetLightActivation = 1.0;
      this.isNight = true;
    } else if (h >= 17.75 && h < 18.25) {
      this.streetLightActivation = (h - 17.75) / 0.5;
      this.isNight = h >= 18.0;
    } else if (h >= 6.0 && h < 6.5) {
      this.streetLightActivation = 1.0 - (h - 6.0) / 0.5;
      this.isNight = false;
    } else {
      this.streetLightActivation = 0.0;
      this.isNight = false;
    }
  }

  public update(dt: number, focusPos: THREE.Vector3): void {
    if (this.settings.autoProgressTime) {
      const cycleSeconds = Math.max(60, this.settings.dayDurationMinutes * 60);
      this.timeHours = (this.timeHours + (dt * 24) / cycleSeconds) % 24;
    }

    this.computeStreetLightActivation();

    const solarAngle = ((this.timeHours - 6.0) / 24.0) * Math.PI * 2;
    const sunElevation = Math.sin(solarAngle);
    const sunAzimuth = Math.cos(solarAngle);

    const weather: WeatherCondition = this.settings.weather;
    const isRainy = weather === 'rain' || weather === 'heavy_rain';
    const isCloudy = weather === 'cloudy' || isRainy || weather === 'mist';

    const targetWetness =
      weather === 'heavy_rain'
        ? 1.0
        : weather === 'rain'
        ? 0.78
        : weather === 'mist'
        ? 0.3
        : 0.0;
    this.wetness += (targetWetness - this.wetness) * Math.min(1, dt * 1.5);

    const skyMat = this.skyMesh.material as THREE.ShaderMaterial;
    const dayFactor = Math.max(0, Math.min(1, (sunElevation + 0.12) / 0.45));
    const sunsetFactor = Math.max(
      0,
      1 - Math.abs(sunElevation - 0.06) / 0.24
    );

    const topDay = new THREE.Color(isCloudy ? 0x5c7694 : 0x2f6ec9);
    const topSunset = new THREE.Color(isCloudy ? 0x475569 : 0x3b4d82);
    const topNight = new THREE.Color(0x060b16);

    const horizDay = new THREE.Color(isCloudy ? 0xcbd5e1 : 0xe6edf5);
    const horizSunset = new THREE.Color(isCloudy ? 0x94a3b8 : 0xf4a261);
    const horizNight = new THREE.Color(0x0d1629);

    const topCol = new THREE.Color()
      .lerpColors(topNight, topDay, dayFactor)
      .lerp(topSunset, sunsetFactor * 0.7);
    const horizCol = new THREE.Color()
      .lerpColors(horizNight, horizDay, dayFactor)
      .lerp(horizSunset, sunsetFactor * 0.85);

    skyMat.uniforms.topColor.value.copy(topCol);
    skyMat.uniforms.horizonColor.value.copy(horizCol);
    skyMat.uniforms.bottomColor.value.setHex(
      this.isNight ? 0x080d18 : 0xc97b4b
    );
    skyMat.uniforms.sunGlowIntensity.value = isCloudy
      ? 0.08
      : dayFactor * 0.45;

    let fogDensity = 0.0042;
    if (weather === 'heavy_rain') fogDensity = 0.0095;
    else if (weather === 'rain') fogDensity = 0.0075;
    else if (weather === 'mist') fogDensity = 0.0088;
    else if (weather === 'cloudy') fogDensity = 0.0055;

    const fogEdit = this.scene.fog as THREE.FogExp2;
    fogEdit.color.copy(horizCol);
    fogEdit.density = fogDensity;

    const weatherDim =
      weather === 'heavy_rain'
        ? 0.42
        : weather === 'rain'
        ? 0.58
        : weather === 'cloudy'
        ? 0.75
        : 1.0;

    if (sunElevation >= -0.05) {
      const sunCol = new THREE.Color(0xfff6e5).lerp(
        new THREE.Color(0xff9e5e),
        sunsetFactor
      );
      this.sunLight.color.copy(sunCol);
      this.sunLight.intensity =
        Math.max(0.18, sunElevation * 2.25) * weatherDim;
    } else {
      // Subtle cool moonlight so warm amber street lights stand out dramatically at night
      this.sunLight.color.setHex(0x4b6b9e);
      this.sunLight.intensity = 0.22 * weatherDim;
    }

    this.hemiLight.color.copy(topCol).lerp(new THREE.Color(0xffffff), 0.25);
    this.hemiLight.groundColor.setHex(this.isNight ? 0x161412 : 0xba6b3d);
    this.hemiLight.intensity = (0.24 + dayFactor * 0.68) * weatherDim;

    this.ambientLight.intensity = this.isNight ? 0.18 : 0.38;

    const lightX = sunAzimuth * 62;
    const lightY = Math.max(24, Math.abs(sunElevation) * 72);
    const lightZ = 28;
    const sunOffset = new THREE.Vector3(lightX, lightY, lightZ);
    skyMat.uniforms.sunDir.value.copy(sunOffset).normalize();

    this.sunLight.position.set(
      focusPos.x + sunOffset.x,
      focusPos.y + sunOffset.y,
      focusPos.z + sunOffset.z
    );
    this.sunLight.target.position.copy(focusPos);
    this.sunLight.target.updateMatrixWorld();

    // Keep the sky dome centered on the active focus position across Freetown, the Highway, and Bo City
    this.skyMesh.position.set(focusPos.x, 0, focusPos.z);

    this.cloudMat.color.setHex(
      this.isNight ? 0x1e293b : isRainy ? 0x64748b : 0xffffff
    );
    this.cloudMat.opacity = isCloudy ? 0.94 : 0.82;
    for (let i = 0; i < this.cloudGroups.length; i++) {
      const cg = this.cloudGroups[i];
      cg.position.x += dt * (isRainy ? 1.1 : 0.45);
      // Wrap clouds within a 260m window around the player's current X coordinate
      if (cg.position.x - focusPos.x > 130) cg.position.x -= 260;
      if (cg.position.x - focusPos.x < -130) cg.position.x += 260;
    }

    this.rainPoints.visible = isRainy;
    if (isRainy) {
      this.rainPoints.position.set(focusPos.x, focusPos.y, focusPos.z);
      const posAttr = this.rainPoints.geometry.attributes
        .position as THREE.BufferAttribute;
      const fallSpeed = weather === 'heavy_rain' ? 22.0 : 15.5;
      const mat = this.rainPoints.material as THREE.PointsMaterial;
      mat.size = weather === 'heavy_rain' ? 0.22 : 0.15;
      mat.opacity = weather === 'heavy_rain' ? 0.75 : 0.52;

      for (let i = 0; i < this.rainCount; i++) {
        let ry = posAttr.getY(i) - fallSpeed * dt;
        let rx = posAttr.getX(i) - dt * 1.8;
        if (ry < 0) {
          ry = 22 + Math.random() * 4;
          rx = (Math.random() - 0.5) * 48;
        }
        posAttr.setX(i, rx);
        posAttr.setY(i, ry);
      }
      posAttr.needsUpdate = true;
    }
  }
}
