import * as THREE from 'three';

/* ═══════════════════════════════════════════
   3D LANDSCAPE SCENE
   Terrain · Water · Rain · Wind · Atmosphere
   ═══════════════════════════════════════════ */

/* ── Noise functions ── */
function hash2D(x, y) {
  let h = (x * 374761393 + y * 668265263 + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

function noise2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);
  const a = hash2D(ix, iy);
  const b = hash2D(ix + 1, iy);
  const c = hash2D(ix, iy + 1);
  const d = hash2D(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y, octaves = 5) {
  let value = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * freq, y * freq) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return value / max;
}

/* ── Water Vertex Shader ── */
const waterVert = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vElevation;

  void main() {
    vUv = uv;
    vec3 pos = position;

    float w1 = sin(pos.x * 0.12 + uTime * 0.55) * 0.7;
    float w2 = sin(pos.y * 0.10 + uTime * 0.38) * 0.45;
    float w3 = sin((pos.x + pos.y) * 0.07 + uTime * 0.72) * 0.35;
    float w4 = sin(pos.x * 0.25 - pos.y * 0.18 + uTime * 1.1) * 0.18;
    float w5 = cos(pos.x * 0.08 + pos.y * 0.14 + uTime * 0.9) * 0.25;

    pos.z = w1 + w2 + w3 + w4 + w5;
    vElevation = pos.z;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

/* ── Water Fragment Shader ── */
const waterFrag = `
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uHighlight;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  varying float vElevation;

  void main() {
    vec3 color = mix(uDeep, uMid, vUv.y * 0.6 + 0.2);

    float crest = smoothstep(0.3, 1.3, vElevation);
    color = mix(color, uHighlight, crest * 0.3);

    // Shimmer
    float shimmer = sin(vUv.x * 60.0 + uTime * 2.0) * sin(vUv.y * 40.0 + uTime * 1.5);
    color += uHighlight * max(shimmer, 0.0) * 0.06;

    // Edge fade
    float ef = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    ef *= smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);

    gl_FragColor = vec4(color, uOpacity * ef);
  }
`;

/* ── Rain Vertex Shader ── */
const rainVert = `
  attribute float aSpeed;
  attribute float aOpacity;
  uniform float uTime;
  uniform float uSize;
  varying float vOpacity;

  void main() {
    vOpacity = aOpacity;
    vec3 pos = position;

    // Fall & wind drift
    pos.y = mod(pos.y - uTime * aSpeed * 15.0, 70.0) - 5.0;
    pos.x += sin(uTime * 0.2 + position.z * 0.01) * 0.8;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = uSize * (200.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const rainFrag = `
  varying float vOpacity;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d) * vOpacity;
    gl_FragColor = vec4(0.6, 0.9, 0.25, a * 0.45);
  }
`;

/* ── Lightning flash shader ── */
const flashVert = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const flashFrag = `
  uniform float uFlash;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(0.78, 1.0, 0.0, uFlash * 0.10);
  }
`;

export default class LandscapeScene {
  constructor(container) {
    this.container = container;
    this.time = 0;
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    this.scrollProgress = 0;
    this.isMobile = window.innerWidth < 768;
    this.flashIntensity = 0;
    this.nextFlash = 4 + Math.random() * 8;

    this.init();
    this.createTerrain();
    this.createWater();
    this.createRain();
    this.createWind();
    this.createAtmosphere();
    this.createFlashPlane();
    this.addLights();
    this.setupEvents();
    this.animate();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050505, 0.006);

    this.camera = new THREE.PerspectiveCamera(
      55, window.innerWidth / window.innerHeight, 0.1, 600
    );
    this.camera.position.set(0, 20, 60);
    this.camera.lookAt(0, 5, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isMobile,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x050505);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;

    this.container.appendChild(this.renderer.domElement);
  }

  createTerrain() {
    const seg = this.isMobile ? 80 : 160;
    const geo = new THREE.PlaneGeometry(400, 400, seg, seg);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);

      let h = fbm(x * 0.006 + 3.7, y * 0.006 + 1.2, 6) * 28 - 8;
      h += fbm(x * 0.018, y * 0.018, 3) * 4;

      // Valley in middle for water
      const distFromCenter = Math.sqrt(x * x + y * y);
      const valleyFactor = Math.max(0, 1 - distFromCenter / 80);
      h -= valleyFactor * 8;

      pos.setZ(i, h);

      // ── Cartoon green palette ──
      const color = new THREE.Color();
      if (h < -3) {
        // underwater / deep ground — very dark green-black
        color.setHex(0x0a1a08);
      } else if (h < 1) {
        // shoreline — sandy dark olive
        color.setHex(0x2a3a18);
      } else if (h < 5) {
        // low grass — mid green
        color.setHex(0x286e18);
      } else if (h < 10) {
        // mid grass — bright cartoon green
        color.setHex(0x3ba825);
      } else if (h < 16) {
        // high grass / hill — rich green
        color.setHex(0x5cd63a);
      } else if (h < 22) {
        // mountain side — darker green
        color.setHex(0x2d7a10);
      } else {
        // peak — acid lime (matches #c8ff00 theme)
        color.setHex(0xc8ff00);
      }

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,    // flat faces = cartoon look
      roughness: 1.0,
      metalness: 0.0,
    });

    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.rotation.x = -Math.PI / 2;
    this.scene.add(this.terrain);
  }

  createWater() {
    const seg = this.isMobile ? 50 : 110;
    const geo = new THREE.PlaneGeometry(400, 400, seg, seg);

    this.waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x0a1a05) },
        uMid: { value: new THREE.Color(0x1a4510) },
        uHighlight: { value: new THREE.Color(0x86cc2a) },
        uOpacity: { value: 0.82 },
      },
      vertexShader: waterVert,
      fragmentShader: waterFrag,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -3;
    this.scene.add(this.water);
  }

  createRain() {
    const count = this.isMobile ? 2000 : 6000;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const opacities = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 250;
      positions[i * 3 + 1] = Math.random() * 70;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 250;
      speeds[i] = 0.5 + Math.random() * 1.2;
      opacities[i] = 0.15 + Math.random() * 0.55;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));

    this.rainMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: this.isMobile ? 2.0 : 2.5 },
      },
      vertexShader: rainVert,
      fragmentShader: rainFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.rain = new THREE.Points(geo, this.rainMat);
    this.scene.add(this.rain);
  }

  createWind() {
    const count = this.isMobile ? 80 : 250;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    this.windData = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = Math.random() * 35 + 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
      this.windData.push({
        speed: 0.15 + Math.random() * 0.45,
        amp: 0.5 + Math.random() * 2.0,
        phase: Math.random() * Math.PI * 2,
      });
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x5599aa,
      size: this.isMobile ? 0.2 : 0.18,
      transparent: true,
      opacity: 0.15,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.wind = new THREE.Points(geo, mat);
    this.scene.add(this.wind);
  }

  createAtmosphere() {
    const count = this.isMobile ? 40 : 120;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 1] = Math.random() * 50 + 3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x00ccff,
      size: 0.35,
      transparent: true,
      opacity: 0.1,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.atmosphere = new THREE.Points(geo, mat);
    this.scene.add(this.atmosphere);
  }

  createFlashPlane() {
    const geo = new THREE.PlaneGeometry(600, 600);
    this.flashMat = new THREE.ShaderMaterial({
      uniforms: { uFlash: { value: 0 } },
      vertexShader: flashVert,
      fragmentShader: flashFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.flashPlane = new THREE.Mesh(geo, this.flashMat);
    this.flashPlane.position.set(0, 40, -50);
    this.scene.add(this.flashPlane);
  }

  addLights() {
    const ambient = new THREE.AmbientLight(0x0d1a08, 4);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0x5ccc28, 2.0);
    dir.position.set(-40, 50, 25);
    this.scene.add(dir);

    this.accentLight = new THREE.PointLight(0xc8ff00, 5, 100);
    this.accentLight.position.set(0, 18, 15);
    this.scene.add(this.accentLight);

    const backLight = new THREE.PointLight(0x1a4400, 2.5, 150);
    backLight.position.set(50, 30, -40);
    this.scene.add(backLight);
  }

  setupEvents() {
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('mousemove', (e) => {
      this.mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.ty = -(e.clientY / window.innerHeight) * 2 + 1;
    });
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.isMobile = w < 768;
  }

  setScrollProgress(p) {
    this.scrollProgress = p;
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = 0.016;
    this.time += dt;

    // Smooth mouse
    this.mouse.x += (this.mouse.tx - this.mouse.x) * 0.04;
    this.mouse.y += (this.mouse.ty - this.mouse.y) * 0.04;

    // Water
    if (this.waterMat) {
      this.waterMat.uniforms.uTime.value = this.time;
    }

    // Rain
    if (this.rainMat) {
      this.rainMat.uniforms.uTime.value = this.time;
    }

    // Wind particles
    if (this.wind) {
      const pos = this.wind.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const d = this.windData[i];
        let x = pos.getX(i);
        let y = pos.getY(i);

        x += d.speed;
        y += Math.sin(this.time * 0.4 + d.phase) * 0.015 * d.amp;

        if (x > 100) {
          x = -100;
          y = Math.random() * 35 + 1;
          pos.setZ(i, (Math.random() - 0.5) * 200);
        }

        pos.setX(i, x);
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    // Atmosphere rotation
    if (this.atmosphere) {
      this.atmosphere.rotation.y += 0.00025;
    }

    // Lightning flash
    this.nextFlash -= dt;
    if (this.nextFlash <= 0) {
      this.flashIntensity = 1.0;
      this.nextFlash = 5 + Math.random() * 12;
    }
    this.flashIntensity *= 0.88;
    if (this.flashMat) {
      this.flashMat.uniforms.uFlash.value = this.flashIntensity;
    }

    // Camera follow scroll & mouse
    const p = this.scrollProgress;
    const baseY = 20 - p * 10;
    const baseZ = 60 - p * 25;
    const baseX = Math.sin(p * Math.PI * 0.4) * 8;

    this.camera.position.x = baseX + this.mouse.x * 3;
    this.camera.position.y = baseY + this.mouse.y * 1.5;
    this.camera.position.z = baseZ;
    this.camera.lookAt(
      this.mouse.x * 2,
      5 - p * 3 + this.mouse.y * 0.5,
      0
    );

    // Dynamic fog
    this.scene.fog.density = 0.005 + p * 0.005 + this.flashIntensity * 0.002;

    // Accent light pulse (lime)
    this.accentLight.intensity = 5 + Math.sin(this.time * 0.4) * 1.0 + this.flashIntensity * 10;

    this.renderer.render(this.scene, this.camera);
  }
}
