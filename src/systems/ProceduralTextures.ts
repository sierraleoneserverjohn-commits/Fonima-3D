import * as THREE from 'three';

export class ProceduralTextures {
  private static cache: Map<string, THREE.CanvasTexture> = new Map();

  // High-resolution Spherical UV Facial & Cranial Skin Map tailored specifically to the user's reference photos:
  // - Warm rich West African brown skin (#5e3722) with subtle golden-warm highlights on forehead, cheekbones & nose bridge
  // - Two soft horizontal forehead expression creases visible in the reference selfies
  // - Arched dark eyebrows, deep-set almond eyes with dark brown irises & catchlights, epicanthic upper eyelid folds
  // - Broad nasal bridge & softly shaded nostrils
  // - Distinct fuller two-tone lips: darker contoured upper lip + warm rose-brown lower lip with center line
  // - Clean tapered hairline & faded temples
  public static getUserFaceAvatarTexture(): THREE.CanvasTexture {
    const key = 'user_face_avatar_uv_v3';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // 1. Base rich warm brown complexion
    ctx.fillStyle = '#5e3722';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle organic skin pore texture
    for (let i = 0; i < 3200; i++) {
      const px = Math.random() * 512;
      const py = Math.random() * 512;
      ctx.fillStyle =
        i % 2 === 0 ? 'rgba(255, 220, 190, 0.025)' : 'rgba(30, 14, 6, 0.03)';
      ctx.fillRect(px, py, 2, 2);
    }

    // In Three.js SphereGeometry (after rotating Y so UV.u = 0.5 faces -Z forward):
    // Center of face is at X = 256.
    // Forehead: Y = 150..205
    // Eyebrows: Y = 212..225
    // Eyes: Y = 232..252 (Left X = 206, Right X = 306)
    // Nose: Y = 240..305 (Center X = 256)
    // Lips: Y = 322..362 (Center X = 256)
    // Chin: Y = 380..430

    // 2. Warm studio skin highlights (forehead, cheekbones, nose bridge, chin)
    const addHighlight = (cx: number, cy: number, rx: number, ry: number, alpha: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rx, ry);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      grad.addColorStop(0, `rgba(168, 108, 72, ${alpha})`);
      grad.addColorStop(1, 'rgba(168, 108, 72, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // Forehead highlight
    addHighlight(256, 182, 58, 30, 0.36);
    // Left & Right cheekbone highlights (prominent in photo 1 & photo 2)
    addHighlight(195, 278, 38, 26, 0.34);
    addHighlight(317, 278, 38, 26, 0.34);
    // Nose bridge & tip highlight
    addHighlight(256, 268, 14, 34, 0.38);
    addHighlight(256, 296, 18, 14, 0.42);
    // Chin highlight
    addHighlight(256, 392, 30, 20, 0.25);

    // 3. Characteristic horizontal forehead lines (visible in the red-shirt selfie)
    ctx.strokeStyle = 'rgba(42, 20, 10, 0.28)';
    ctx.lineWidth = 2.0;
    [174, 186].forEach((fy) => {
      ctx.beginPath();
      ctx.moveTo(205, fy);
      ctx.quadraticCurveTo(256, fy - 5, 307, fy);
      ctx.stroke();
    });

    // 4. Natural Arched Eyebrows
    const drawEyebrow = (isLeft: boolean) => {
      const dir = isLeft ? -1 : 1;
      const startX = 256 + dir * 22;
      const peakX = 256 + dir * 52;
      const endX = 256 + dir * 78;
      ctx.strokeStyle = '#181210';
      ctx.lineWidth = 8.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, 222);
      ctx.quadraticCurveTo(peakX, 211, endX, 224);
      ctx.stroke();
    };
    drawEyebrow(true);
    drawEyebrow(false);

    // 5. Expressive Almond Eyes with Upper Lid Crease, Dark Brown Iris & Catchlight
    const drawEye = (cx: number) => {
      // Subtle under-eye & socket shading
      addHighlight(cx, 245, 26, 16, -0.2);

      // Upper eyelid fold crease
      ctx.strokeStyle = 'rgba(32, 14, 8, 0.65)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx - 21, 240);
      ctx.quadraticCurveTo(cx, 229, cx + 21, 241);
      ctx.stroke();

      // Sclera (almond shape)
      ctx.fillStyle = '#ede8df';
      ctx.beginPath();
      ctx.moveTo(cx - 19, 243);
      ctx.quadraticCurveTo(cx, 234, cx + 19, 243);
      ctx.quadraticCurveTo(cx, 251, cx - 19, 243);
      ctx.closePath();
      ctx.fill();

      // Rich dark brown iris
      ctx.fillStyle = '#24130b';
      ctx.beginPath();
      ctx.arc(cx, 242.5, 7.2, 0, Math.PI * 2);
      ctx.fill();

      // Black pupil
      ctx.fillStyle = '#090706';
      ctx.beginPath();
      ctx.arc(cx, 242.5, 3.6, 0, Math.PI * 2);
      ctx.fill();

      // Crisp white eye catchlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.beginPath();
      ctx.arc(cx - 2.2, 240.2, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Upper lash line
      ctx.strokeStyle = '#120c09';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(cx - 20, 243);
      ctx.quadraticCurveTo(cx, 233, cx + 20, 243);
      ctx.stroke();
    };
    drawEye(208);
    drawEye(304);

    // 6. Nose Shading, Alar Creases & Nostrils
    ctx.strokeStyle = 'rgba(38, 18, 9, 0.42)';
    ctx.lineWidth = 3.0;
    // Left & right nose wing creases
    ctx.beginPath();
    ctx.arc(231, 297, 11, Math.PI * 0.6, Math.PI * 1.45);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(281, 297, 11, -Math.PI * 0.45, Math.PI * 0.4);
    ctx.stroke();

    // Nostrils
    ctx.fillStyle = 'rgba(24, 10, 5, 0.72)';
    ctx.beginPath();
    ctx.ellipse(242, 303, 6.5, 3.6, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(270, 303, 6.5, 3.6, 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Subtle nasolabial smile contours (prominent in photo 1)
    ctx.strokeStyle = 'rgba(40, 18, 9, 0.32)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(222, 298);
    ctx.quadraticCurveTo(206, 322, 212, 344);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(290, 298);
    ctx.quadraticCurveTo(306, 322, 300, 344);
    ctx.stroke();

    // 7. Full Two-Tone Lips (Darker contoured upper lip + warm rose-brown lower lip)
    // Subtle mustache shadow above upper lip
    addHighlight(256, 322, 38, 10, -0.22);

    // Upper lip (Cupid's bow contour)
    ctx.fillStyle = '#3d2118';
    ctx.beginPath();
    ctx.moveTo(216, 338);
    ctx.quadraticCurveTo(238, 323, 256, 327);
    ctx.quadraticCurveTo(274, 323, 296, 338);
    ctx.quadraticCurveTo(256, 343, 216, 338);
    ctx.closePath();
    ctx.fill();

    // Full lower lip (Warm rose-taupe center gradient matching all 5 user photos)
    const lipGrad = ctx.createLinearGradient(256, 338, 256, 362);
    lipGrad.addColorStop(0, '#7c483d');
    lipGrad.addColorStop(0.55, '#8c5246');
    lipGrad.addColorStop(1, '#4d291e');
    ctx.fillStyle = lipGrad;
    ctx.beginPath();
    ctx.moveTo(217, 338);
    ctx.quadraticCurveTo(256, 342, 295, 338);
    ctx.quadraticCurveTo(286, 363, 256, 363);
    ctx.quadraticCurveTo(226, 363, 217, 338);
    ctx.closePath();
    ctx.fill();

    // Lip parting line
    ctx.strokeStyle = 'rgba(26, 11, 7, 0.78)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(216, 338);
    ctx.quadraticCurveTo(256, 342, 296, 338);
    ctx.stroke();

    // 8. Tapered Hairline & Faded Sideburns/Neckline on the UV wrap
    ctx.fillStyle = '#121010';
    // Top cranial cap above forehead (Y < 142)
    ctx.fillRect(0, 0, 512, 138);
    // Back of head hair wrap (X < 128 or X > 384 down to Y = 335)
    ctx.fillRect(0, 0, 124, 325);
    ctx.fillRect(388, 0, 124, 325);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set(key, tex);
    return tex;
  }

  // Street Signboard & Building Plaque Canvas Texture Generator
  public static getSignboardTexture(
    title: string,
    subtitle: string,
    bgColor: string = '#153e75',
    textColor: string = '#ffffff',
    accentColor: string = '#fbbf24'
  ): THREE.CanvasTexture {
    const key = `sign_${title}_${subtitle}_${bgColor}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;

    // Painted metal signboard background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 512, 192);

    // Outer weathered border
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 492, 172);

    // Subtle Sierra Leone green-white-blue corner stripe motif on official street signs
    ctx.fillStyle = '#1eb53a';
    ctx.fillRect(18, 18, 14, 156);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(32, 18, 14, 156);
    ctx.fillStyle = '#0072c6';
    ctx.fillRect(46, 18, 14, 156);

    // Primary Sign Heading
    ctx.fillStyle = textColor;
    ctx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title.toUpperCase(), 276, 78, 405);

    // Subtitle / Location Line
    ctx.fillStyle = accentColor;
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillText(subtitle.toUpperCase(), 276, 132, 405);

    // Slight metal weathering speckle
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = 'rgba(140, 70, 35, 0.12)';
      ctx.fillRect(Math.random() * 512, Math.random() * 192, 3, 3);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set(key, tex);
    return tex;
  }

  // Corrugated metal roofing texture with realistic ribs and optional weathering/rust streaks
  public static getCorrugatedRoofTexture(
    baseColorHex: string,
    rustIntensity: number = 0.25
  ): THREE.CanvasTexture {
    const key = `roof_${baseColorHex}_${rustIntensity}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = baseColorHex;
    ctx.fillRect(0, 0, 256, 256);

    const ribs = 32;
    const ribWidth = 256 / ribs;
    for (let i = 0; i < ribs; i++) {
      const x = i * ribWidth;
      const grad = ctx.createLinearGradient(x, 0, x + ribWidth, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.24)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.18)');
      grad.addColorStop(1, 'rgba(0,0,0,0.24)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, ribWidth, 256);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(0, 84, 256, 3);
    ctx.fillRect(0, 170, 256, 3);

    if (rustIntensity > 0) {
      for (let p = 0; p < 65 * rustIntensity; p++) {
        const rx = Math.random() * 256;
        const ry = Math.random() * 256;
        const rw = 8 + Math.random() * 28;
        const rh = 12 + Math.random() * 45;
        ctx.fillStyle =
          Math.random() > 0.35
            ? 'rgba(122, 46, 22, 0.24)'
            : 'rgba(68, 28, 15, 0.2)';
        ctx.fillRect(rx, ry, rw, rh);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);
    this.cache.set(key, tex);
    return tex;
  }

  // Weathered sandcrete masonry block & plaster wall texture with base laterite dust splash
  public static getWallPlasterTexture(
    baseHex: string,
    exposeBlocks: boolean = false
  ): THREE.CanvasTexture {
    const key = `wall_${baseHex}_${exposeBlocks}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 750; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      ctx.fillStyle =
        i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.055)';
      ctx.fillRect(x, y, 3, 3);
    }

    if (exposeBlocks) {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 2;
      const rows = 8;
      const rowH = 256 / rows;
      const colW = 64;
      for (let r = 0; r < rows; r++) {
        const y = r * rowH;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();

        const offset = (r % 2) * (colW / 2);
        for (let c = 0; c < 5; c++) {
          const x = c * colW + offset;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + rowH);
          ctx.stroke();
        }
      }
    }

    const splashGrad = ctx.createLinearGradient(0, 188, 0, 256);
    splashGrad.addColorStop(0, 'rgba(155, 78, 42, 0.0)');
    splashGrad.addColorStop(1, 'rgba(138, 64, 30, 0.48)');
    ctx.fillStyle = splashGrad;
    ctx.fillRect(0, 188, 256, 68);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    this.cache.set(key, tex);
    return tex;
  }

  // Worn asphalt & laterite-edged road surface texture
  public static getAsphaltRoadTexture(): THREE.CanvasTexture {
    const key = 'asphalt_road_v2';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#3d3b39';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 1800; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      ctx.fillStyle =
        i % 3 === 0
          ? 'rgba(255,255,255,0.065)'
          : i % 3 === 1
          ? 'rgba(0,0,0,0.14)'
          : 'rgba(170, 94, 52, 0.09)';
      ctx.fillRect(x, y, 2, 2);
    }

    ctx.strokeStyle = 'rgba(22, 20, 18, 0.35)';
    ctx.lineWidth = 1.2;
    for (let c = 0; c < 8; c++) {
      let cx = Math.random() * 256;
      let cy = 45 + Math.random() * 165;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let s = 0; s < 5; s++) {
        cx += (Math.random() - 0.5) * 22;
        cy += (Math.random() - 0.5) * 14;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(26, 25, 24, 0.26)';
    ctx.fillRect(0, 62, 256, 36);
    ctx.fillRect(0, 158, 256, 36);

    const topEdge = ctx.createLinearGradient(0, 0, 0, 48);
    topEdge.addColorStop(0, 'rgba(172, 94, 50, 0.92)');
    topEdge.addColorStop(1, 'rgba(172, 94, 50, 0.0)');
    ctx.fillStyle = topEdge;
    ctx.fillRect(0, 0, 256, 48);

    const botEdge = ctx.createLinearGradient(0, 208, 0, 256);
    botEdge.addColorStop(0, 'rgba(172, 94, 50, 0.0)');
    botEdge.addColorStop(1, 'rgba(172, 94, 50, 0.92)');
    ctx.fillStyle = botEdge;
    ctx.fillRect(0, 208, 256, 48);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(14, 1);
    this.cache.set(key, tex);
    return tex;
  }

  public static getTerrainMicroDetailTexture(): THREE.CanvasTexture {
    const key = 'terrain_micro_detail';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#e8e4dc';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 2400; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = Math.random();
      if (r < 0.45) {
        ctx.fillStyle = 'rgba(90, 48, 24, 0.14)';
        ctx.fillRect(x, y, 2, 2);
      } else if (r < 0.8) {
        ctx.fillStyle = 'rgba(255, 248, 235, 0.12)';
        ctx.fillRect(x, y, 2, 2);
      } else {
        ctx.fillStyle = 'rgba(68, 36, 18, 0.22)';
        ctx.beginPath();
        ctx.arc(x, y, 1.4 + Math.random() * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(38, 38);
    this.cache.set(key, tex);
    return tex;
  }

  public static getConcreteSlabTexture(): THREE.CanvasTexture {
    const key = 'concrete_slab';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#aba59c';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(55, 50, 45, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 124, 124);
    ctx.strokeRect(130, 2, 124, 124);
    ctx.strokeRect(2, 130, 124, 124);
    ctx.strokeRect(130, 130, 124, 124);

    for (let i = 0; i < 900; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      ctx.fillStyle =
        i % 2 === 0 ? 'rgba(0,0,0,0.06)' : 'rgba(165, 92, 50, 0.06)';
      ctx.fillRect(x, y, 2, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    this.cache.set(key, tex);
    return tex;
  }

  // Crimson Red Patterned Polo Shirt Texture matching the user's reference photos
  public static getUserRedPatternShirtTexture(): THREE.CanvasTexture {
    const key = 'user_red_pattern_shirt';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#c81e2b';
    ctx.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y += 2) {
      ctx.fillStyle = y % 4 === 0 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, y, 256, 1);
    }

    const spacing = 32;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const cx = col * spacing + (row % 2 === 0 ? 8 : 24);
        const cy = row * spacing + 16;

        ctx.fillStyle = 'rgba(248, 248, 252, 0.88)';
        ctx.beginPath();
        ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(30, 35, 50, 0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    this.cache.set(key, tex);
    return tex;
  }

  public static getLightPoolGradientTexture(): THREE.CanvasTexture {
    const key = 'light_pool_gradient_v1';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0.0, 'rgba(255, 198, 105, 0.72)');
    grad.addColorStop(0.45, 'rgba(255, 168, 72, 0.32)');
    grad.addColorStop(1.0, 'rgba(255, 150, 50, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set(key, tex);
    return tex;
  }

  public static getPalmBarkTexture(): THREE.CanvasTexture {
    const key = 'palm_bark';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#574234';
    ctx.fillRect(0, 0, 128, 256);

    for (let y = 0; y < 256; y += 8) {
      ctx.fillStyle = y % 16 === 0 ? 'rgba(32, 22, 15, 0.45)' : 'rgba(120, 95, 75, 0.25)';
      ctx.fillRect(0, y, 128, 3);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 3);
    this.cache.set(key, tex);
    return tex;
  }
}
