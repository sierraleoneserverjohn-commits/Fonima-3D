import * as THREE from 'three';
import { GroundSurfaceType, WeatherCondition } from './GameState';

interface SpatialEmitter {
  id: string;
  type: 'bird' | 'dog' | 'okada' | 'compound_voices' | 'crickets';
  position: THREE.Vector3;
  cooldown: number;
  minInterval: number;
  maxInterval: number;
  maxDistance: number;
  nightOnly?: boolean;
  dayOnly?: boolean;
}

// 3D Spatial, Weather & Day/Night Environmental Web Audio System for Freetown
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private isEnabled: boolean = false;
  private windGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private roofRainGain: GainNode | null = null;
  private insectGain: GainNode | null = null;
  private emitters: SpatialEmitter[] = [];

  constructor() {
    this.emitters = [
      {
        id: 'bird_mango_no22',
        type: 'bird',
        position: new THREE.Vector3(8, 6, -24),
        cooldown: 1.5,
        minInterval: 3.5,
        maxInterval: 8.0,
        maxDistance: 45,
        dayOnly: true,
      },
      {
        id: 'bird_palm_west',
        type: 'bird',
        position: new THREE.Vector3(-22, 7, 16),
        cooldown: 3.2,
        minInterval: 4.0,
        maxInterval: 9.0,
        maxDistance: 45,
        dayOnly: true,
      },
      {
        id: 'dog_compound_south',
        type: 'dog',
        position: new THREE.Vector3(18, 1.5, 24),
        cooldown: 6.5,
        minInterval: 10.0,
        maxInterval: 20.0,
        maxDistance: 68,
      },
      {
        id: 'okada_peninsula_rd',
        type: 'okada',
        position: new THREE.Vector3(-15, 2.0, -56),
        cooldown: 4.8,
        minInterval: 9.0,
        maxInterval: 18.0,
        maxDistance: 85,
      },
      {
        id: 'kiosk_activity',
        type: 'compound_voices',
        position: new THREE.Vector3(-9, 1.6, 5.5),
        cooldown: 2.8,
        minInterval: 6.0,
        maxInterval: 13.0,
        maxDistance: 36,
        dayOnly: true,
      },
      {
        id: 'night_cricket_grove',
        type: 'crickets',
        position: new THREE.Vector3(-8, 1.5, -18),
        cooldown: 1.2,
        minInterval: 2.5,
        maxInterval: 5.5,
        maxDistance: 55,
        nightOnly: true,
      },
      // Highway & Bo City spatial audio emitters
      {
        id: 'mile91_market_voices',
        type: 'compound_voices',
        position: new THREE.Vector3(465, 1.8, 0),
        cooldown: 2.5,
        minInterval: 5.5,
        maxInterval: 11.0,
        maxDistance: 55,
        dayOnly: true,
      },
      {
        id: 'sewa_river_birds',
        type: 'bird',
        position: new THREE.Vector3(670, 5.0, 0),
        cooldown: 2.0,
        minInterval: 3.5,
        maxInterval: 7.5,
        maxDistance: 60,
        dayOnly: true,
      },
      {
        id: 'bo_clocktower_traffic',
        type: 'okada',
        position: new THREE.Vector3(1150, 2.0, 0),
        cooldown: 3.0,
        minInterval: 6.0,
        maxInterval: 13.0,
        maxDistance: 75,
      },
      {
        id: 'bo_big_market_chatter',
        type: 'compound_voices',
        position: new THREE.Vector3(1182, 2.0, -18),
        cooldown: 2.2,
        minInterval: 5.0,
        maxInterval: 10.0,
        maxDistance: 65,
        dayOnly: true,
      },
      {
        id: 'bo_night_crickets',
        type: 'crickets',
        position: new THREE.Vector3(1210, 1.5, 25),
        cooldown: 1.4,
        minInterval: 2.5,
        maxInterval: 5.5,
        maxDistance: 65,
        nightOnly: true,
      },
    ];
  }

  public playCarHorn(): void {
    if (!this.isEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(415, now);
    osc2.frequency.setValueAtTime(520, now);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);
  }

  public toggleAudio(): boolean {
    if (!this.ctx) {
      this.initAudio();
      this.isEnabled = true;
      return true;
    }

    this.isEnabled = !this.isEnabled;
    if (this.isEnabled) {
      this.ctx.resume();
    } else if (this.ctx) {
      this.windGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      this.rainGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      this.roofRainGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      this.insectGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
    return this.isEnabled;
  }

  public enable(): boolean {
    if (!this.ctx) {
      this.initAudio();
    }
    this.isEnabled = true;
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return true;
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }

  public pauseAudio(): void {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  public resumeAudio(): void {
    if (this.isEnabled && this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private initAudio(): void {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AudioCtx();

    // Shared 2-second pink noise buffer for wind, rainfall, and corrugated zinc roof patter
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(
      1,
      bufferSize,
      this.ctx.sampleRate
    );
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    // 1. Warm tropical breeze layer
    const windNoise = this.ctx.createBufferSource();
    windNoise.buffer = noiseBuffer;
    windNoise.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 340;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.025;
    windNoise.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);
    windNoise.start(0);

    // 2. Tropical rainfall & wet-road wash layer
    const rainNoise = this.ctx.createBufferSource();
    rainNoise.buffer = noiseBuffer;
    rainNoise.loop = true;
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1150;
    rainFilter.Q.value = 0.7;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0.0;
    rainNoise.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.ctx.destination);
    rainNoise.start(0);

    // 3. Freetown Corrugated Zinc Roof Rain Patter resonance layer
    const roofNoise = this.ctx.createBufferSource();
    roofNoise.buffer = noiseBuffer;
    roofNoise.loop = true;
    const roofFilter = this.ctx.createBiquadFilter();
    roofFilter.type = 'peaking';
    roofFilter.frequency.value = 2450;
    roofFilter.gain.value = 8;
    this.roofRainGain = this.ctx.createGain();
    this.roofRainGain.gain.value = 0.0;
    roofNoise.connect(roofFilter);
    roofFilter.connect(this.roofRainGain);
    this.roofRainGain.connect(this.ctx.destination);
    roofNoise.start(0);

    // 4. Nighttime cricket / insect chorus oscillator
    const insectOsc = this.ctx.createOscillator();
    insectOsc.type = 'sine';
    insectOsc.frequency.value = 4200;
    this.insectGain = this.ctx.createGain();
    this.insectGain.gain.value = 0.006;
    insectOsc.connect(this.insectGain);
    this.insectGain.connect(this.ctx.destination);
    insectOsc.start(0);
  }

  public playSurfaceFootstep(
    surface: GroundSurfaceType,
    speed: number,
    isWet: boolean = false
  ): void {
    if (!this.isEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const isRunning = speed > 4.8;
    const volBoost = Math.min(1.3, 0.65 + speed * 0.09);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (surface === 'asphalt' || surface === 'concrete') {
      osc.type = 'triangle';
      const startFreq = isWet ? 220 : surface === 'concrete' ? 165 : 142;
      osc.frequency.setValueAtTime(
        isRunning ? startFreq * 1.15 : startFreq,
        now
      );
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.055);
      gain.gain.setValueAtTime(0.095 * volBoost, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.065);
    } else if (surface === 'dirt') {
      osc.type = 'sawtooth';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = isWet ? 420 : 280;
      osc.frequency.setValueAtTime(isRunning ? 105 : 88, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.075);
      gain.gain.setValueAtTime(0.085 * volBoost, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.085);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(78, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.09);
      gain.gain.setValueAtTime(0.06 * volBoost, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  }

  public playJump(): void {
    if (!this.isEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(235, now + 0.11);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playInteract(isMetallic: boolean = true): void {
    if (!this.isEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isMetallic ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(isMetallic ? 280 : 410, now);
    osc.frequency.exponentialRampToValueAtTime(
      isMetallic ? 155 : 560,
      now + 0.18
    );
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public updateSpatialWorld(
    dt: number,
    playerPos: THREE.Vector3,
    cameraYaw: number,
    isNight: boolean,
    weather: WeatherCondition
  ): void {
    if (!this.isEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Modulate ambient layers according to Weather & Day/Night state
    const isHeavyRain = weather === 'heavy_rain';
    const isRain = weather === 'rain' || isHeavyRain;

    const targetRainVol = isHeavyRain ? 0.16 : isRain ? 0.09 : 0.0;
    const targetRoofVol = isHeavyRain ? 0.08 : isRain ? 0.045 : 0.0;
    const targetInsectVol = isNight && !isHeavyRain ? 0.024 : 0.005;
    const targetWindVol = isHeavyRain ? 0.055 : isRain ? 0.038 : 0.024;

    this.rainGain?.gain.setTargetAtTime(targetRainVol, now, 0.35);
    this.roofRainGain?.gain.setTargetAtTime(targetRoofVol, now, 0.35);
    this.insectGain?.gain.setTargetAtTime(targetInsectVol, now, 0.5);
    this.windGain?.gain.setTargetAtTime(targetWindVol, now, 0.35);

    for (let i = 0; i < this.emitters.length; i++) {
      const em = this.emitters[i];
      if (em.dayOnly && isNight) continue;
      if (em.nightOnly && !isNight) continue;
      if (em.type === 'bird' && isHeavyRain) continue;

      em.cooldown -= dt;
      if (em.cooldown <= 0) {
        em.cooldown =
          em.minInterval + Math.random() * (em.maxInterval - em.minInterval);

        const dist = playerPos.distanceTo(em.position);
        if (dist < em.maxDistance) {
          const dx = em.position.x - playerPos.x;
          const dz = em.position.z - playerPos.z;
          const worldAngle = Math.atan2(dx, -dz);
          const relAngle = worldAngle - cameraYaw;
          const pan = Math.max(-0.95, Math.min(0.95, Math.sin(relAngle)));
          const attenuation = Math.pow(1 - dist / em.maxDistance, 1.6);

          this.triggerSpatialSound(em.type, pan, attenuation);
        }
      }
    }
  }

  private triggerSpatialSound(
    type: SpatialEmitter['type'],
    pan: number,
    attenuation: number
  ): void {
    if (!this.ctx || attenuation <= 0.02) return;
    const now = this.ctx.currentTime;

    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, now);
    panner.connect(this.ctx.destination);

    if (type === 'bird') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const baseF = 1750 + Math.random() * 550;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseF, now);
      osc.frequency.exponentialRampToValueAtTime(baseF * 1.25, now + 0.07);
      osc.frequency.exponentialRampToValueAtTime(baseF * 0.92, now + 0.16);

      gain.gain.setValueAtTime(0.028 * attenuation, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.18);
      osc.connect(gain);
      gain.connect(panner);
      osc.start(now);
      osc.stop(now + 0.19);
    } else if (type === 'crickets') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(3850, now);
      osc.frequency.setValueAtTime(4100, now + 0.05);
      gain.gain.setValueAtTime(0.022 * attenuation, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.14);
      osc.connect(gain);
      gain.connect(panner);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'dog') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.exponentialRampToValueAtTime(310, now + 0.04);
      osc.frequency.exponentialRampToValueAtTime(145, now + 0.16);

      gain.gain.setValueAtTime(0.032 * attenuation, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.18);
      osc.connect(gain);
      gain.connect(panner);
      osc.start(now);
      osc.stop(now + 0.19);
    } else if (type === 'okada') {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(82, now);
      osc.frequency.linearRampToValueAtTime(118, now + 0.6);
      osc.frequency.linearRampToValueAtTime(74, now + 1.3);

      filter.type = 'lowpass';
      filter.frequency.value = 260;

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.025 * attenuation, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.35);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      osc.start(now);
      osc.stop(now + 1.4);
    } else if (type === 'compound_voices') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(195 + Math.random() * 45, now);
      osc.frequency.linearRampToValueAtTime(175, now + 0.25);

      gain.gain.setValueAtTime(0.016 * attenuation, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.28);
      osc.connect(gain);
      gain.connect(panner);
      osc.start(now);
      osc.stop(now + 0.29);
    }
  }
}
