import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/* -----------------------------------------
   NOISE
----------------------------------------- */
(() => {
  const c = document.createElement('canvas'); c.width = c.height = 200;
  const x = c.getContext('2d'), d = x.createImageData(200, 200);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255;
    d.data[i] = d.data[i+1] = d.data[i+2] = v; d.data[i+3] = 20;
  }
  x.putImageData(d, 0, 0);
  const el = document.getElementById('noise');
  if (el) { el.style.cssText = 'background-image:url(' + c.toDataURL() + ');background-repeat:repeat;background-size:200px'; }
})();

/* -----------------------------------------
   SPACE CRYSTALS  (Three.js)
----------------------------------------- */
(() => {
  const cvs = document.getElementById('bgCanvas');
  if (!cvs) return;
  const renderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010510);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 0, 50);

  /* Stars */
  const starBuf = new Float32Array(6000 * 3);
  for (let i = 0; i < starBuf.length; i++) starBuf[i] = (Math.random() - 0.5) * 400;
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starBuf, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.12, sizeAttenuation: true, transparent: true, opacity: 0.6,
  })));

  /* Lights */
  scene.add(new THREE.AmbientLight(0x080818, 2.0));
  const pl1 = new THREE.PointLight(0xc8ff00, 3.0, 90);
  pl1.position.set(10, 10, 15); scene.add(pl1);
  const pl2 = new THREE.PointLight(0x00ffcc, 2.0, 70);
  pl2.position.set(-15, -5, 10); scene.add(pl2);
  const pl3 = new THREE.PointLight(0x8844ff, 1.5, 60);
  pl3.position.set(5, -15, 5); scene.add(pl3);

  /* ── Raycaster for interaction ── */
  const raycaster = new THREE.Raycaster();
  const pointer   = new THREE.Vector2(-9999, -9999);
  const clickPos  = new THREE.Vector2(-9999, -9999);

  /* Crystal factory */
  const crystals = [];
  const meshList = []; // flat list for raycasting

  function makeCrystal(geoFn, pos, color, rotSpd) {
    const geo = geoFn();
    const group = new THREE.Group();

    const faceMat = new THREE.MeshPhongMaterial({
      color, emissive: color, emissiveIntensity: 0.07,
      transparent: true, opacity: 0.055, side: THREE.DoubleSide, shininess: 80,
    });
    const faceMesh = new THREE.Mesh(geo, faceMat);
    group.add(faceMesh);
    meshList.push(faceMesh);

    const edges = new THREE.EdgesGeometry(geo);
    const edgeLineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    group.add(new THREE.LineSegments(edges, edgeLineMat));

    const haloGeo = new THREE.EdgesGeometry(geoFn());
    const haloLines = new THREE.LineSegments(haloGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.12 }));
    haloLines.scale.setScalar(1.06);
    group.add(haloLines);

    group.position.set(...pos);
    group.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);

    /* Store original Z for scroll animation */
    group.userData = {
      rx: (Math.random() - 0.5) * rotSpd,
      ry: (Math.random() - 0.5) * rotSpd,
      rz: (Math.random() - 0.5) * rotSpd * 0.4,
      origZ: pos[2],
      origX: pos[0],
      origY: pos[1],
      origScale: 1,
      baseColor: color,
      faceMat,
      edgeLineMat,
      hovered: false,
      clickBounce: 0,
      explodeV: new THREE.Vector3(),
    };

    scene.add(group);
    crystals.push(group);
    return group;
  }

  const C = 0xc8ff00, T = 0x66ffdd, W = 0xffffff, V = 0xaaddff;
  [
    [() => new THREE.IcosahedronGeometry(3.8, 0),  [-22,  8, -42], C, 0.009],
    [() => new THREE.OctahedronGeometry(2.8, 0),   [ 18,-13, -46], T, 0.011],
    [() => new THREE.IcosahedronGeometry(4.5, 0),  [  4, 21, -52], C, 0.006],
    [() => new THREE.TetrahedronGeometry(2.2, 0),  [-31,-16, -36], T, 0.013],
    [() => new THREE.IcosahedronGeometry(3.2, 0),  [ 34,  6, -44], C, 0.007],
    [() => new THREE.OctahedronGeometry(1.5, 0),   [-12,  6, -16], C, 0.016],
    [() => new THREE.IcosahedronGeometry(1.3, 0),  [ 14, -9, -19], T, 0.019],
    [() => new THREE.TetrahedronGeometry(1.9, 0),  [-25, 13, -23], C, 0.013],
    [() => new THREE.OctahedronGeometry(1.1, 0),   [ 21, 16, -20], V, 0.021],
    [() => new THREE.IcosahedronGeometry(1.7, 0),  [  8,-19, -15], C, 0.014],
    [() => new THREE.TetrahedronGeometry(1.4, 0),  [-18, -7, -21], T, 0.017],
    [() => new THREE.IcosahedronGeometry(1.2, 0),  [ 29, -6, -18], C, 0.020],
    [() => new THREE.OctahedronGeometry(0.55, 0),  [ -8, 14,  -7], C, 0.031],
    [() => new THREE.TetrahedronGeometry(0.45, 0), [  6, -5,  -4], W, 0.036],
    [() => new THREE.IcosahedronGeometry(0.65, 0), [-15,-11,  -9], C, 0.029],
    [() => new THREE.OctahedronGeometry(0.38, 0),  [ 10,  9,  -3], T, 0.042],
    [() => new THREE.TetrahedronGeometry(0.58, 0), [ 19,-13, -10], C, 0.033],
    [() => new THREE.IcosahedronGeometry(0.48, 0), [-21,  6,  -8], W, 0.039],
    [() => new THREE.OctahedronGeometry(0.70, 0),  [  4, 17, -11], C, 0.026],
    [() => new THREE.TetrahedronGeometry(0.32, 0), [ -5,-15,  -5], T, 0.044],
    [() => new THREE.IcosahedronGeometry(0.52, 0), [ 23, 11, -13], C, 0.028],
    [() => new THREE.OctahedronGeometry(0.42, 0),  [-31,  9, -29], V, 0.021],
    [() => new THREE.IcosahedronGeometry(0.75, 0), [ 16,-21, -16], C, 0.023],
    [() => new THREE.TetrahedronGeometry(0.47, 0), [-11, 19, -19], T, 0.027],
    [() => new THREE.OctahedronGeometry(0.57, 0),  [ 26, -9, -23], C, 0.025],
  ].forEach(([fn, pos, col, spd]) => makeCrystal(fn, pos, col, spd));

  /* ── Morphing shape ball ── */
  const morphGeos = [
    new THREE.IcosahedronGeometry(3.0, 0),
    new THREE.OctahedronGeometry(3.2, 0),
    new THREE.TetrahedronGeometry(3.6, 0),
    new THREE.IcosahedronGeometry(2.8, 1),
    new THREE.OctahedronGeometry(2.6, 1),
  ];
  const morphFaceMat = new THREE.MeshPhongMaterial({
    color: 0xc8ff00, emissive: 0xc8ff00, emissiveIntensity: 0.06,
    transparent: true, opacity: 0.04, side: THREE.DoubleSide,
  });
  const morphEdgeMat = new THREE.LineBasicMaterial({
    color: 0xc8ff00, transparent: true, opacity: 0.82,
  });
  let mIdx = 0;
  const morphGroup = new THREE.Group();
  let mMesh  = new THREE.Mesh(morphGeos[0], morphFaceMat.clone());
  let mEdges = new THREE.LineSegments(new THREE.EdgesGeometry(morphGeos[0]), morphEdgeMat.clone());
  morphGroup.add(mMesh); morphGroup.add(mEdges);
  morphGroup.position.set(12, -3, -6);
  scene.add(morphGroup);

  let mPosX = 12, mPosY = -3, mVX = 0.022, mVY = 0.013;
  let mBounceT = 0, mMorphT = 0, mMorphScale = 1, mMorphDir = 1;
  const M_INTERVAL = 3.2;

  let mx = 0, my = 0, camTx = 0, camTy = 0, pageScrollY = 0;

  /* ── Interactions: document-level so they fire over HTML content too ── */
  document.addEventListener('mousemove', e => {
    pointer.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  document.addEventListener('click', e => {
    /* Skip clicks on real UI elements */
    if (e.target.closest('a,button,input,textarea,select,.proj-card,.stack-it,.sphere-wrapper,.pill,.ham,.menu-ov')) return;
    clickPos.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    clickPos.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(clickPos, camera);
    const hits = raycaster.intersectObjects(meshList, false);
    if (hits.length) {
      const grp = hits[0].object.parent;
      if (grp && !grp.userData.zoomingOut && grp.userData.clickBounce !== undefined) {
        grp.userData.clickBounce = 1.0;
        grp.userData.rx = (Math.random() - 0.5) * 0.25;
        grp.userData.ry = (Math.random() - 0.5) * 0.25;
      }
    }
  });

  /* ── Section-change: 2-3 frontmost shapes zoom out and vanish ── */
  const zoomOuts = [];
  function triggerSectionZoomOut() {
    const candidates = crystals
      .filter(c => !c.userData.zoomingOut && c.position.z > c.userData.origZ + 4)
      .sort((a, b) => b.position.z - a.position.z);
    const picks = candidates.slice(0, Math.min(3, candidates.length));
    picks.forEach((c, i) => {
      setTimeout(() => {
        c.userData.zoomingOut = true;
        zoomOuts.push({ group: c, progress: 0 });
      }, i * 160);
    });
  }

  let lastSectionIdx = 0;
  window.addEventListener('scroll', () => {
    pageScrollY = window.scrollY;
    const pct = pageScrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const sIdx = Math.floor(pct * 5);
    if (sIdx !== lastSectionIdx) {
      if (sIdx > 0) triggerSectionZoomOut();
      lastSectionIdx = sIdx;
    }
  }, { passive: true });
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  const clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    const t = clock.getElapsedTime();

    /* ── Scroll-driven zoom: shapes surge toward camera ── */
    const scrollPct = pageScrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    // Fast rush: shapes move from their origZ toward camera (z=0 ~ screen fill)
    const zoomPush = scrollPct * 60; // how far forward they come

    /* ── Raycaster hover detection ── */
    raycaster.setFromCamera(pointer, camera);
    const hoveredMeshes = new Set(raycaster.intersectObjects(meshList, false).map(h => h.object.parent));

    crystals.forEach(c => {
      c.rotation.x += c.userData.rx;
      c.rotation.y += c.userData.ry;
      c.rotation.z += c.userData.rz;

      if (c.userData.zoomingOut) return; // handled by zoomOuts loop

      /* Scroll Z surge — shapes rush forward */
      const targetZ = c.userData.origZ + zoomPush;
      c.position.z += (targetZ - c.position.z) * 0.12;

      /* Scale up as they get closer for extra zoom feel */
      const depth = (c.position.z - c.userData.origZ) / 60;
      const baseScale = 1.0 + depth * depth * 2.5;

      /* Hover glow */
      const isHovered = hoveredMeshes.has(c);
      if (isHovered !== c.userData.hovered) {
        c.userData.hovered = isHovered;
        if (isHovered) {
          c.userData.faceMat.emissiveIntensity = 0.5;
          c.userData.faceMat.opacity = 0.22;
          c.userData.edgeLineMat.opacity = 1.0;
          document.body.style.cursor = 'pointer';
        } else {
          c.userData.faceMat.emissiveIntensity = 0.07;
          c.userData.faceMat.opacity = 0.055;
          c.userData.edgeLineMat.opacity = 0.9;
          document.body.style.cursor = 'crosshair';
        }
      }

      /* Click bounce scale */
      if (c.userData.clickBounce > 0) {
        c.userData.clickBounce *= 0.88;
        c.scale.setScalar(baseScale * (1.0 + c.userData.clickBounce * 1.4));
      } else {
        c.scale.setScalar(baseScale);
      }

      /* Fade out shapes that get very close (past camera) */
      const alpha = Math.max(0, Math.min(1, 1.0 - (c.position.z + 5) / 8));
      c.userData.faceMat.opacity = (isHovered ? 0.22 : 0.055) * alpha;
      c.userData.edgeLineMat.opacity = (isHovered ? 1.0 : 0.9) * alpha;
    });

    /* ── Section zoom-out: shapes blast toward viewer then reset ── */
    for (let i = zoomOuts.length - 1; i >= 0; i--) {
      const zo = zoomOuts[i];
      zo.progress = Math.min(1, zo.progress + 0.028);
      const p = zo.progress;
      const eased = p * p * (3 - 2 * p); // smoothstep
      zo.group.scale.setScalar(1 + eased * 22);
      zo.group.userData.faceMat.opacity   = 0.4 * (1 - eased);
      zo.group.userData.edgeLineMat.opacity = 1.0 * (1 - eased);
      if (p >= 1) {
        zo.group.position.set(zo.group.userData.origX, zo.group.userData.origY, zo.group.userData.origZ);
        zo.group.scale.setScalar(1);
        zo.group.userData.faceMat.opacity   = 0.055;
        zo.group.userData.edgeLineMat.opacity = 0.9;
        zo.group.userData.zoomingOut = false;
        zoomOuts.splice(i, 1);
      }
    }

    /* Morph ball rolling & shape-shifting */
    morphGroup.rotation.x += 0.009;
    morphGroup.rotation.y += 0.013;
    morphGroup.rotation.z += 0.004;
    if (t - mBounceT > 2.8) {
      mBounceT = t;
      mVX = (Math.random() - 0.5) * 0.055;
      mVY = (Math.random() - 0.5) * 0.038;
    }
    mPosX += mVX; mPosY += mVY;
    if (Math.abs(mPosX) > 24) mVX *= -1;
    if (Math.abs(mPosY) > 16) mVY *= -1;
    morphGroup.position.x = mPosX;
    morphGroup.position.y = mPosY;
    /* Shape morph cycle */
    if (t - mMorphT > M_INTERVAL) { mMorphT = t; mMorphDir = -1; }
    if (mMorphDir === -1) {
      mMorphScale = Math.max(0, mMorphScale - 0.06);
      if (mMorphScale === 0) {
        mMorphDir = 1;
        mIdx = (mIdx + 1) % morphGeos.length;
        morphGroup.remove(mMesh); morphGroup.remove(mEdges);
        mMesh  = new THREE.Mesh(morphGeos[mIdx], morphFaceMat.clone());
        mEdges = new THREE.LineSegments(new THREE.EdgesGeometry(morphGeos[mIdx]), morphEdgeMat.clone());
        morphGroup.add(mMesh); morphGroup.add(mEdges);
      }
    } else if (mMorphScale < 1) {
      mMorphScale = Math.min(1, mMorphScale + 0.05);
    }
    morphGroup.scale.setScalar(mMorphScale);

    camTx += (mx * 2.2 - camTx) * 0.035;
    camTy += (-my * 1.4 - camTy) * 0.035;
    camera.position.x += (camTx - camera.position.x) * 0.055;
    camera.position.y += (camTy - camera.position.y) * 0.055;
    camera.position.z = 50 - scrollPct * 18;
    pl1.intensity = 3.0 + Math.sin(t * 0.7) * 0.6;
    pl2.intensity = 2.0 + Math.sin(t * 1.1 + 1.2) * 0.5;
    pl3.intensity = 1.5 + Math.sin(t * 0.9 + 2.4) * 0.4;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  })();
})();

/* -----------------------------------------
   CURSOR  (removed custom dot+ring, using native crosshair)
----------------------------------------- */

/* -----------------------------------------
   PRELOADER
----------------------------------------- */
(() => {
  const pre    = document.getElementById('preloader');
  const num    = document.getElementById('preN');
  const bar    = document.getElementById('preBar');
  const status = document.getElementById('preStatus');
  if (!pre) return;
  const msgs = ['Initializing\u2026', 'Loading assets\u2026', 'Building scene\u2026', 'Almost ready\u2026'];
  let cur = 0;
  const iv = setInterval(() => { if (status) status.textContent = msgs[++cur] || msgs[msgs.length - 1]; }, 600);
  document.body.style.overflow = 'hidden';
  const count = { v: 0 };
  gsap.to(count, {
    v: 100, duration: 2.4, ease: 'power2.out',
    onUpdate() { if (num) num.textContent = Math.round(count.v); if (bar) bar.style.width = count.v + '%'; },
    onComplete() { clearInterval(iv); },
  });
  gsap.to(pre, {
    yPercent: -100, duration: 0.9, ease: 'power3.inOut', delay: 2.8,
    onComplete() { pre.style.display = 'none'; document.body.style.overflow = ''; boot(); },
  });
})();

/* -----------------------------------------
   SPLIT TEXT  (char-by-char)
----------------------------------------- */
function splitChars(el) {
  const txt = el.textContent;
  el.textContent = '';
  const chars = [];
  for (const ch of txt) {
    const s = document.createElement('span');
    s.className = 'char'; s.style.display = 'inline-block';
    s.textContent = ch === ' ' ? '\u00A0' : ch;
    el.appendChild(s); chars.push(s);
  }
  return chars;
}

/* -----------------------------------------
   BOOT  (runs after preloader exits)
----------------------------------------- */
function boot() {
  const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  window.addEventListener('scroll', () => {
    document.getElementById('hdr')?.classList.toggle('scrolled', scrollY > 70);
  }, { passive: true });

  /* Hero char split */
  document.querySelectorAll('[data-s]').forEach(line => {
    const em = line.querySelector('em');
    splitChars(em || line);
  });

  /* Hero entrance timeline */
  gsap.timeline()
    .from('#eyebrow',       { y: 18, opacity: 0, duration: 0.55, ease: 'power2.out' })
    .from('.hero-h1 .char', { y: 70, opacity: 0, duration: 0.7,  stagger: 0.025, ease: 'power3.out' }, '-=.25')
    .from('#heroP',         { y: 18, opacity: 0, duration: 0.55 }, '-=.25')
    .from('#heroCta',       { y: 18, opacity: 0, duration: 0.5  }, '-=.2')
    .from('#scrollInd',     { opacity: 0, duration: 0.7 },          '-=.2')
    .from('.cframe',        { opacity: 0, scale: 0.3, duration: 0.5, stagger: 0.06 }, '-=.5');

  /* Scroll reveals */
  document.querySelectorAll('.rv').forEach((el, i) => {
    gsap.to(el, {
      y: 0, opacity: 1, duration: 0.75, ease: 'power2.out',
      delay: (i % 4) * 0.07,
      scrollTrigger: { trigger: el, start: 'top 87%', toggleActions: 'play none none none' },
    });
  });

  /* Stat counters */
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = +el.dataset.count;
    const suf = el.querySelector('span')?.outerHTML || '';
    ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter() {
      const o = { v: 0 };
      gsap.to(o, { v: target, duration: 1.4, ease: 'power2.out',
        onUpdate() { el.innerHTML = Math.round(o.v) + suf; },
      });
    }});
  });

  /* Magnetic buttons */
  document.querySelectorAll('.magnetic').forEach(b => {
    b.addEventListener('mousemove', e => {
      const r = b.getBoundingClientRect();
      gsap.to(b, { x: (e.clientX - r.left - r.width  / 2) * 0.24,
                   y: (e.clientY - r.top  - r.height / 2) * 0.24,
                   duration: 0.3, ease: 'power2.out' });
    });
    b.addEventListener('mouseleave', () => gsap.to(b, { x: 0, y: 0, duration: 0.55, ease: 'elastic.out(1,.4)' }));
  });

  /* Smooth anchor scroll */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const t = document.querySelector(a.getAttribute('href'));
      if (t) lenis.scrollTo(t, { duration: 1.1 });
      if (menuIsOpen) closeMenu();
    });
  });

  /* Init interactive modules */
  initPillNav();
  initWordSphere();
  initSectionShapes();
}

/* -----------------------------------------
   MENU
----------------------------------------- */
let menuIsOpen = false;
const hamBtn = document.getElementById('ham');
const ov     = document.getElementById('menuOv');

function openMenu() {
  menuIsOpen = true; hamBtn?.classList.add('open'); ov?.classList.add('open');
  gsap.from('.menu-nav a', { y: 50, opacity: 0, duration: 0.55, stagger: 0.07, ease: 'power3.out', delay: 0.1 });
}
function closeMenu() {
  menuIsOpen = false; hamBtn?.classList.remove('open');
  gsap.to('.menu-nav a', { y: -28, opacity: 0, duration: 0.25, stagger: 0.04, ease: 'power2.in',
    onComplete() { ov?.classList.remove('open'); gsap.set('.menu-nav a', { y: 0, opacity: 0.25 }); },
  });
}
hamBtn?.addEventListener('click', () => menuIsOpen ? closeMenu() : openMenu());
document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuIsOpen) closeMenu(); });

/* -----------------------------------------
   PILL NAV
----------------------------------------- */
function initPillNav() {
  const items     = document.querySelectorAll('.pill-item');
  const indicator = document.getElementById('pillIndicator');
  const pill      = document.querySelector('.pill');
  if (!indicator || !pill || !items.length) return;

  let activeItem = null;

  function moveTo(el) {
    const pr = pill.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    indicator.style.transition = activeItem
      ? 'left 0.4s cubic-bezier(0.4,0,0.15,1), width 0.4s cubic-bezier(0.4,0,0.15,1), opacity 0.3s'
      : 'opacity 0.3s';
    indicator.style.left    = (er.left - pr.left) + 'px';
    indicator.style.width   = er.width + 'px';
    indicator.style.opacity = '1';
    items.forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    activeItem = el;
  }

  items.forEach(item => {
    item.addEventListener('mouseenter', () => moveTo(item));
  });
  pill.addEventListener('mouseleave', () => {
    indicator.style.opacity = '0';
    items.forEach(i => i.classList.remove('active'));
    activeItem = null;
  });

  /* Scroll-based section highlighting */
  const secIds = ['about', 'experience', 'work', 'stack', 'contact'];
  window.addEventListener('scroll', () => {
    const mid = window.scrollY + window.innerHeight * 0.45;
    for (let i = secIds.length - 1; i >= 0; i--) {
      const el = document.getElementById(secIds[i]);
      if (el && el.offsetTop <= mid) {
        const it = document.querySelector(`.pill-item[data-sec="${secIds[i]}"]`);
        if (it && it !== activeItem) moveTo(it);
        break;
      }
    }
  }, { passive: true });
}

/* -----------------------------------------
   WORD SPHERE
----------------------------------------- */
function initWordSphere() {
  const container = document.getElementById('wordSphere');
  const wrapper   = document.getElementById('sphereWrapper');
  if (!container || !wrapper) return;

  const skills = [
    'Flutter','Dart','React','Next.js','TypeScript','Node.js',
    'Python','Unity','C#','Blender','Three.js','GSAP',
    'Firebase','Supabase','PostgreSQL','Prisma','Tailwind','Git',
    'Figma','WebGL','GLSL','Scikit','Pandas','NumPy',
    'Riverpod','Hive','MongoDB','REST','Linux','Vercel',
    'Godot','Game AI','Shaders','GraphQL','Vite','WebRTC',
  ];

  const R = 210;
  const words = [];

  skills.forEach((skill, i) => {
    const phi   = Math.acos(-1 + (2 * i) / skills.length);
    const theta = Math.sqrt(skills.length * Math.PI) * phi;
    const ox = R * Math.cos(theta) * Math.sin(phi);
    const oy = R * Math.sin(theta) * Math.sin(phi);
    const oz = R * Math.cos(phi);
    const span = document.createElement('span');
    span.className = 'sphere-word';
    span.textContent = skill;
    span.style.cssText = 'left:50%;top:50%;opacity:0.5;';
    container.appendChild(span);
    words.push({ el: span, ox, oy, oz });
  });

  let rotY = 0, rotX = 0.3;
  let vY = 0.006, vX = 0.002;
  let tgtVY = vY, tgtVX = vX;
  let animId, lastChange = 0;
  let hovered = false;

  function frame(ts) {
    if (hovered) return;
    if (!lastChange || ts - lastChange > 4200) {
      lastChange = ts;
      tgtVY = (Math.random() - 0.5) * 0.016;
      tgtVX = (Math.random() - 0.5) * 0.010;
    }
    vY += (tgtVY - vY) * 0.016;
    vX += (tgtVX - vX) * 0.016;
    rotY += vY; rotX += vX;

    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

    words.forEach(w => {
      const nx  = w.ox * cosY - w.oz * sinY;
      const nz  = w.ox * sinY + w.oz * cosY;
      const ny  = w.oy * cosX - nz * sinX;
      const nz2 = w.oy * sinX + nz * cosX;
      const d = (nz2 + R) / (2 * R);         /* 0 = back, 1 = front */
      w.el.style.transform  = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
      w.el.style.opacity    = 0.2 + d * 0.85;
      w.el.style.fontSize   = (9 + d * 7) + 'px';
      w.el.style.color      = d > 0.6
        ? `rgba(200,255,0,${Math.min(1, (d - 0.6) * 2.5).toFixed(2)})`
        : `rgba(255,255,255,${(0.3 + d * 0.55).toFixed(2)})`;
      w.el.style.fontWeight = d > 0.75 ? '600' : '400';
    });
    animId = requestAnimationFrame(frame);
  }
  animId = requestAnimationFrame(frame);

  wrapper.addEventListener('mouseenter', () => {
    hovered = true;
    cancelAnimationFrame(animId);
    gsap.to('.sphere-word', {
      opacity: 0, scale: 0.5,
      duration: 0.32, stagger: { amount: 0.28, from: 'random' },
      ease: 'power2.in',
    });
  });

  wrapper.addEventListener('mouseleave', () => {
    hovered = false;
    gsap.to('.sphere-word', {
      opacity: 1, scale: 1,
      duration: 0.44, stagger: { amount: 0.28, from: 'random' },
      ease: 'power2.out', delay: 0.1,
    });
    setTimeout(() => { if (!hovered) animId = requestAnimationFrame(frame); }, 480);
  });
}

/* -----------------------------------------
   SECTION SHAPE SCROLL ANIMATIONS
   — Shape surges in from far back, "carrying" the section title with it.
   — Between sections a single background shape does a full-screen zoom.
----------------------------------------- */
function initSectionShapes() {
  /* ── Per-section: shape flies in from far, carries title text ── */
  const shapeDefs = [
    {
      id: 'about',
      shape: 'icosa',  // icosahedron-like polygon
      pts: '100,5 195,52 195,148 100,195 5,148 5,52',
      inner: '100,28 178,66 178,134 100,172 22,134 22,66',
      x: '68%', y: '-16%', w: 520, rot: 18,
      titleSel: '#about .h2',
    },
    {
      id: 'experience',
      shape: 'octa',
      pts: '100,0 200,100 100,200 0,100',
      inner: '100,30 170,100 100,170 30,100',
      x: '-10%', y: '8%', w: 420, rot: -14,
      titleSel: '#experience .h2',
    },
    {
      id: 'work',
      shape: 'icosa',
      pts: '100,3 197,52.5 197,147.5 100,197 3,147.5 3,52.5',
      inner: '100,28 172,66 172,134 100,172 28,134 28,66',
      x: '62%', y: '6%', w: 560, rot: 24,
      titleSel: '#work .proj-header-title h2',
    },
    {
      id: 'stack',
      shape: 'tetra',
      pts: '100,10 190,170 10,170',
      inner: '100,40 170,150 30,150',
      x: '3%', y: '-8%', w: 460, rot: -10,
      titleSel: '#stack .proj-header-title h2',
    },
  ];

  shapeDefs.forEach(def => {
    const sec = document.getElementById(def.id);
    if (!sec) return;

    /* ── Shape element ── */
    const div = document.createElement('div');
    div.className = 'sec-deco';
    div.style.cssText = `left:${def.x};top:${def.y};width:${def.w}px;height:${def.w}px;`;
    div.innerHTML = `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${def.pts}" stroke="rgba(200,255,0,0.22)" stroke-width="0.8" fill="rgba(200,255,0,0.02)"/>
      <polygon points="${def.inner}" stroke="rgba(200,255,0,0.10)" stroke-width="0.5"/>
    </svg>`;
    if (!sec.style.position || sec.style.position === 'static') sec.style.position = 'relative';
    sec.insertBefore(div, sec.firstChild);

    /* Initial state: shape is tiny and "far away" (scale 0.05), centered */
    gsap.set(div, { opacity: 0, rotate: def.rot, scale: 0.05, xPercent: -50, yPercent: -50,
      left: '50%', top: '50%', transformOrigin: 'center center' });

    /* ── Title chars — split for stagger ── */
    const titleEl = sec.querySelector(def.titleSel.replace(`#${def.id} `, ''));

    ScrollTrigger.create({
      trigger: sec,
      start: 'top 82%',
      end: 'bottom 15%',
      onEnter: () => {
        /* Shape surges from center-tiny → final position, large */
        gsap.timeline()
          .set(div, { opacity: 1, scale: 0.03, left: '50%', top: '50%', rotate: def.rot + 45 })
          .to(div, {
            scale: 1, rotate: def.rot * 0.3,
            left: def.x, top: def.y,
            duration: 0.65, ease: 'power4.out',
          })
          .to(div, { opacity: 0.85, duration: 0.25 }, '<');

        /* Title words fly in just after shape arrives */
        if (titleEl) {
          gsap.from(titleEl, {
            opacity: 0, scale: 0.4, z: -200, filter: 'blur(12px)',
            duration: 0.7, ease: 'power3.out', delay: 0.35,
            transformStyle: 'preserve-3d',
          });
        }
      },
      onLeave: () => {
        /* Shape zooms through screen toward viewer */
        gsap.to(div, {
          scale: 8, opacity: 0, rotate: def.rot * -0.5,
          duration: 0.55, ease: 'power3.in',
          onComplete: () => gsap.set(div, { scale: 0.03, opacity: 0, left: '50%', top: '50%', rotate: def.rot + 45 }),
        });
      },
      onEnterBack: () => {
        gsap.timeline()
          .set(div, { opacity: 1, scale: 0.03, left: '50%', top: '50%', rotate: def.rot + 45 })
          .to(div, {
            scale: 1, rotate: def.rot * 0.3,
            left: def.x, top: def.y,
            duration: 0.55, ease: 'power3.out',
          });
      },
      onLeaveBack: () => {
        gsap.to(div, {
          scale: 0.03, opacity: 0, duration: 0.45, ease: 'power2.in',
          onComplete: () => gsap.set(div, { scale: 0.03, opacity: 0, left: '50%', top: '50%', rotate: def.rot }),
        });
      },
    });
  });
}
