/* =========================================================================
   MEMORY BOX — a small cozy 3D scene built with Three.js
   Structure: Scene/Camera setup -> textures -> room -> box -> memories ->
   interaction (drag/click) -> viewer overlay -> audio -> IndexedDB -> boot
   ========================================================================= */

(() => {
  'use strict';

  /* ----------------------------- basic state ----------------------------- */
  const state = {
    boxOpen: false,
    isAnimatingBox: false,
    memories: [],          // array of {group, mesh, data}
    hovered: null,
    dragging: null,
    dragOffset: new THREE.Vector3(),
    pointerDownPos: null,
    pointerDownTime: 0,
    pointerMoved: false,
    muted: localStorage.getItem('memoryBoxMuted') === 'true',
    viewerOpen: false,
    stackCount: 0,
    overTrash: false
  };

  const BOX = {
    width: 3.3,
    depth: 2.05,
    height: 0.85,
    wall: 0.09,
    lidHeight: 0.09
  };

  const INTERIOR = {
    xMin: -BOX.width / 2 + BOX.wall + 0.12,
    xMax: BOX.width / 2 - BOX.wall - 0.12,
    zMin: -BOX.depth / 2 + BOX.wall + 0.10,
    zMax: BOX.depth / 2 - BOX.wall - 0.14,
    // the interior floor mesh itself sits at BOX.wall + 0.001 — this stays
    // just a hair above that (not exactly equal) to avoid literal coplanar
    // z-fighting, while reading as flush/flat rather than floating
    yFloor: BOX.wall + 0.0015
  };

  /* ----------------------------- renderer / scene ------------------------ */
  const canvas = document.getElementById('scene');
  // logarithmic depth buffer: standard z-buffers lose precision fast at the
  // far end of a wide near/far range, which was causing visible z-fighting
  // (flickering/interleaved boundaries) between closely stacked memories —
  // this fixes that without needing a bigger visual gap between cards
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0906);
  scene.fog = new THREE.FogExp2(0x0d0906, 0.055);

  // near/far kept as tight as the scene allows (camera never gets closer
  // than 2.6 or needs to render past the fog) for the best depth precision
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 40);
  // steep, bird's-eye-ish framing — like kneeling over the box looking down into it
  const CAM_START = new THREE.Vector3(0.15, 7.6, 3.7);
  const CAM_OPEN = new THREE.Vector3(0.1, 5.3, 2.35);
  camera.position.copy(CAM_START);
  camera.lookAt(0, 0.3, 0);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.35, 0);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.6;
  controls.maxDistance = 8.5;
  controls.minPolarAngle = THREE.MathUtils.degToRad(10);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(42);
  controls.minAzimuthAngle = THREE.MathUtils.degToRad(-35);
  controls.maxAzimuthAngle = THREE.MathUtils.degToRad(35);
  controls.update();

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ----------------------------- lighting --------------------------------- */
  const hemi = new THREE.HemisphereLight(0x5b4a3a, 0x1a120a, 0.55);
  scene.add(hemi);

  const keyLight = new THREE.SpotLight(0xffd9a8, 2.2, 14, Math.PI / 5.2, 0.6, 1.4);
  keyLight.position.set(2.1, 4.6, 2.4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0015;
  keyLight.shadow.radius = 6;
  scene.add(keyLight);
  scene.add(keyLight.target);
  keyLight.target.position.set(0, 0.3, 0);

  const fillLight = new THREE.PointLight(0xff9d5c, 0.5, 10, 2);
  fillLight.position.set(-2.4, 1.6, -1.6);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xffb87a, 0.35, 8, 2);
  rimLight.position.set(-1, 2.2, 2.6);
  scene.add(rimLight);

  /* ----------------------------- procedural textures ---------------------- */
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function woodTexture({ base = '#5a3822', dark = '#331f10', light = '#7a5030', planks = 6, vertical = false } = {}) {
    const c = makeCanvas(512, 512);
    const ctx = c.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);

    // plank seams
    ctx.strokeStyle = 'rgba(15,8,4,0.5)';
    ctx.lineWidth = 2;
    for (let i = 1; i < planks; i++) {
      const pos = (512 / planks) * i;
      ctx.beginPath();
      if (vertical) { ctx.moveTo(pos, 0); ctx.lineTo(pos, 512); }
      else { ctx.moveTo(0, pos); ctx.lineTo(512, pos); }
      ctx.stroke();
    }

    // grain lines
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const len = 30 + Math.random() * 90;
      const grad = ctx.createLinearGradient(x, y, x + (vertical ? 0 : len), y + (vertical ? len : 0));
      const c1 = Math.random() > 0.5 ? dark : light;
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, c1);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.12 + Math.random() * 0.15;
      ctx.lineWidth = 0.6 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      if (vertical) ctx.lineTo(x + (Math.random() * 6 - 3), y + len);
      else ctx.lineTo(x + len, y + (Math.random() * 6 - 3));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // subtle knots
    for (let i = 0; i < 4; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const r = 6 + Math.random() * 10;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      grad.addColorStop(0, 'rgba(15,8,4,0.55)');
      grad.addColorStop(1, 'rgba(15,8,4,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
    }

    // faint noise for imperfection
    const imgData = ctx.getImageData(0, 0, 512, 512);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 14;
      imgData.data[i] += n; imgData.data[i + 1] += n; imgData.data[i + 2] += n;
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function floorTexture() {
    const c = makeCanvas(1024, 1024);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2a170d';
    ctx.fillRect(0, 0, 1024, 1024);
    const plankW = 1024 / 8;
    for (let col = 0; col < 8; col++) {
      const shade = 14 + Math.random() * 20;
      ctx.fillStyle = `rgb(${42 + shade * 0.4}, ${25 + shade * 0.25}, ${15 + shade * 0.15})`;
      ctx.fillRect(col * plankW, 0, plankW - 3, 1024);
      // horizontal board breaks
      let y = Math.random() * 120;
      while (y < 1024) {
        ctx.fillStyle = 'rgba(20,10,4,0.35)';
        ctx.fillRect(col * plankW, y, plankW - 3, 2);
        y += 140 + Math.random() * 160;
      }
      // grain streaks
      for (let i = 0; i < 40; i++) {
        const x = col * plankW + Math.random() * (plankW - 3);
        const yy = Math.random() * 1024;
        const len = 60 + Math.random() * 200;
        ctx.strokeStyle = `rgba(20,10,4,${0.05 + Math.random() * 0.12})`;
        ctx.lineWidth = 0.5 + Math.random();
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x + (Math.random() * 4 - 2), yy + len);
        ctx.stroke();
      }
    }
    // light sheen streak (soft diagonal highlight)
    const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
    grad.addColorStop(0.35, 'rgba(255,220,170,0)');
    grad.addColorStop(0.5, 'rgba(255,220,170,0.10)');
    grad.addColorStop(0.65, 'rgba(255,220,170,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function paperTexture(hue = '#efe6d3') {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hue;
    ctx.fillRect(0, 0, 256, 256);
    const imgData = ctx.getImageData(0, 0, 256, 256);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 10;
      imgData.data[i] += n; imgData.data[i + 1] += n; imgData.data[i + 2] += n;
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ----------------------------- room ------------------------------------- */
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.42, metalness: 0.06 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // faint back wall so the room doesn't feel like a void, kept simple/blurred by fog
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x241811, roughness: 0.95 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), wallMat);
  wall.position.set(0, 5, -7);
  scene.add(wall);

  /* ----------------------------- the memory box ---------------------------- */
  const boxGroup = new THREE.Group();
  scene.add(boxGroup);

  const boxWoodMat = new THREE.MeshStandardMaterial({
    map: woodTexture({ base: '#92693d', dark: '#604020', light: '#b9915a', planks: 5 }),
    roughness: 0.5, metalness: 0.06
  });
  const boxWoodMatDark = new THREE.MeshStandardMaterial({
    map: woodTexture({ base: '#75512c', dark: '#4a2f17', light: '#9c764c', planks: 5 }),
    roughness: 0.58, metalness: 0.05
  });
  // a lighter, slightly worn tone for top-edge trim — implies decades of handling
  const boxTrimMat = new THREE.MeshStandardMaterial({
    map: woodTexture({ base: '#b18a60', dark: '#7a5936', light: '#cea879', planks: 3 }),
    roughness: 0.42, metalness: 0.05
  });

  // outer shell (base) — built as walls so the interior is a real cavity
  const baseGroup = new THREE.Group();
  boxGroup.add(baseGroup);

  function wallPiece(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  const bw = BOX.width, bd = BOX.depth, bh = BOX.height, wt = BOX.wall;
  // top-rim trim thickness — walls are built trimT shorter (below) so the
  // trim strips sit flush on top of them instead of embedded inside them;
  // embedding caused the trim's side faces to exactly coincide with the
  // wall's own side faces (z-fighting), which flickered as the camera moved
  // during the open/close animation
  const trimT = 0.016;
  const wallH = bh - trimT;
  // the floor block spans the box's full footprint, so walls must start
  // ABOVE it (not at y=0) — otherwise each wall's bottom "wt" of height sits
  // embedded inside the floor block's own volume (same full-footprint
  // overlap bug as the trim/wall one above), which is what caused the
  // flicker at the bottom front/back/side edges when viewed from an angle
  const sideWallH = wallH - wt;
  const sideWallY = wt + sideWallH / 2;
  // floor of the box
  baseGroup.add(wallPiece(bw, wt, bd, 0, wt / 2, 0, boxWoodMatDark));
  // front / back walls
  baseGroup.add(wallPiece(bw, sideWallH, wt, 0, sideWallY, -bd / 2 + wt / 2, boxWoodMat));
  baseGroup.add(wallPiece(bw, sideWallH, wt, 0, sideWallY, bd / 2 - wt / 2, boxWoodMat));
  // left / right walls
  baseGroup.add(wallPiece(wt, sideWallH, bd - wt * 2, -bw / 2 + wt / 2, sideWallY, 0, boxWoodMat));
  baseGroup.add(wallPiece(wt, sideWallH, bd - wt * 2, bw / 2 - wt / 2, sideWallY, 0, boxWoodMat));

  // interior floor tint (slightly lighter cavity floor visible through opening)
  const interiorFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(bw - wt * 2, bd - wt * 2),
    new THREE.MeshStandardMaterial({ map: woodTexture({ base: '#7c5936', dark: '#513a22', light: '#a17f52', planks: 3 }), roughness: 0.75 })
  );
  interiorFloor.rotation.x = -Math.PI / 2;
  interiorFloor.position.y = wt + 0.001;
  interiorFloor.receiveShadow = true;
  baseGroup.add(interiorFloor);

  // lid, hinged at the true outer back edge (matches the hinge hardware
  // position below) — the lid mesh spans forward from the pivot with no
  // backward overhang, so it doesn't sweep through the back wall/trim
  // geometry while rotating open, which was causing visible clipping
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, bh, -bd / 2);
  boxGroup.add(lidPivot);

  const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(bw, BOX.lidHeight, bd), boxWoodMat);
  lidMesh.position.set(0, BOX.lidHeight / 2, bd / 2);
  lidMesh.castShadow = true;
  lidMesh.receiveShadow = true;
  lidPivot.add(lidMesh);

  // worn top-rim trim — a slightly lighter cap along the top edge of each wall
  // (four thin strips, matching each wall's own footprint) so hands-worn
  // highlighting reads without sealing the opening the memories sit inside
  const trimY = bh - trimT / 2;
  baseGroup.add(wallPiece(bw, trimT, wt, 0, trimY, -bd / 2 + wt / 2, boxTrimMat));
  baseGroup.add(wallPiece(bw, trimT, wt, 0, trimY, bd / 2 - wt / 2, boxTrimMat));
  baseGroup.add(wallPiece(wt, trimT, bd - wt * 2, -bw / 2 + wt / 2, trimY, 0, boxTrimMat));
  baseGroup.add(wallPiece(wt, trimT, bd - wt * 2, bw / 2 - wt / 2, trimY, 0, boxTrimMat));

  // aged brass / antique gold hardware — darker, less reflective than polished gold
  const brassMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3c, roughness: 0.55, metalness: 0.55 });
  const brassDarkMat = new THREE.MeshStandardMaterial({ color: 0x5f4726, roughness: 0.65, metalness: 0.45 });

  // front latch: a small escutcheon backplate with a raised clasp and a tiny pin,
  // like an old jewelry-box catch rather than a modern hasp
  const latchGroup = new THREE.Group();
  const latchPlate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.012), brassDarkMat);
  latchPlate.position.set(0, 0, 0);
  latchGroup.add(latchPlate);
  const latchClasp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), brassMat);
  latchClasp.rotation.x = Math.PI / 2;
  latchClasp.position.set(0, 0, 0.014);
  latchGroup.add(latchClasp);
  const latchPin = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), brassMat);
  latchPin.position.set(0, -0.02, 0.02);
  latchGroup.add(latchPin);
  latchGroup.position.set(0, bh - 0.02, bd / 2 + 0.008);
  latchGroup.traverse(o => { if (o.isMesh) o.castShadow = true; });
  boxGroup.add(latchGroup);

  // hinges on the back edge
  [-bw / 2 + 0.32, bw / 2 - 0.32].forEach(x => {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 12), brassMat);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(x, bh, -bd / 2 - 0.006);
    hinge.castShadow = true;
    boxGroup.add(hinge);
    const hingePlate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.012), brassDarkMat);
    hingePlate.position.set(x, bh - 0.05, -bd / 2 - 0.004);
    hingePlate.castShadow = true;
    boxGroup.add(hingePlate);
  });

  // subtle brass corner accents on the top rim — small, understated, not shiny
  const cornerPositions = [
    [-bw / 2 + wt * 0.6, bd / 2 - wt * 0.6],
    [bw / 2 - wt * 0.6, bd / 2 - wt * 0.6],
    [-bw / 2 + wt * 0.6, -bd / 2 + wt * 0.6],
    [bw / 2 - wt * 0.6, -bd / 2 + wt * 0.6]
  ];
  cornerPositions.forEach(([cx, cz]) => {
    const corner = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.014, 0.09), brassMat);
    corner.position.set(cx, bh - trimT - 0.006, cz);
    corner.castShadow = true;
    boxGroup.add(corner);
  });

  // soft grounded shadow hugging the box's actual rectangular footprint —
  // tightly fitted and lightly feathered so it reads as a contact shadow,
  // not a distinct circular/oval platform underneath the box
  const shadowTex = (() => {
    const w = 512, h = Math.round(512 * (bd / bw));
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.filter = 'blur(10px)';
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    const pad = 22;
    roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 14);
    ctx.fill();
    return new THREE.CanvasTexture(c);
  })();
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(bw * 1.08, bd * 1.1),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.003;
  scene.add(contactShadow);

  // warm window light — a few soft, raking rectangular patches (like sun
  // through window panes/blinds) laid over the floor as an additive decal,
  // rather than literal window geometry that would need to sit somewhere
  // in the camera's view and risk looking like a stray floating frame.
  // Coplanar with the floor, so it reads correctly from every angle the
  // camera is allowed to orbit to.
  // draws one warm, soft-edged "windowpane" of light. x/y/w/h are in the
  // same pixels-per-world-unit scale for every canvas that calls this, so
  // a pane always ends up the same absolute size regardless of which
  // surface (floor or lid) its texture gets mapped onto
  function drawWindowPane(ctx, x, y, w, h, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(THREE.MathUtils.degToRad(rot));
    const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    grad.addColorStop(0, 'rgba(255,170,60,1)');
    grad.addColorStop(0.55, 'rgba(255,110,30,0.85)');
    grad.addColorStop(1, 'rgba(235,70,15,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // warm window light — a few soft, raking rectangular patches (like sun
  // through window panes/blinds) laid over the floor and the lid as
  // additive decals, rather than literal window geometry that would need
  // to sit somewhere in the camera's view and risk looking like a stray
  // floating frame. Coplanar with the surfaces they light, so they read
  // correctly from every angle the camera is allowed to orbit to.
  const WINDOW_LIGHT_PX_PER_UNIT = 150;

  const windowLightTex = (() => {
    const size = 1024;
    const c = makeCanvas(size, size);
    const ctx = c.getContext('2d');
    ctx.filter = 'blur(18px)';
    [
      { x: 300, y: 260, w: 300, h: 340, rot: -14 },
      { x: 620, y: 200, w: 260, h: 320, rot: -14 },
      { x: 220, y: 620, w: 280, h: 300, rot: -14 },
      { x: 560, y: 600, w: 300, h: 300, rot: -14 }
    ].forEach(p => drawWindowPane(ctx, p.x, p.y, p.w, p.h, p.rot));
    return new THREE.CanvasTexture(c);
  })();
  windowLightTex.wrapS = windowLightTex.wrapT = THREE.ClampToEdgeWrapping;
  const WINDOW_LIGHT_WORLD_SCALE = 1024 / WINDOW_LIGHT_PX_PER_UNIT;

  const windowLight = new THREE.Mesh(
    new THREE.PlaneGeometry(WINDOW_LIGHT_WORLD_SCALE, WINDOW_LIGHT_WORLD_SCALE),
    new THREE.MeshBasicMaterial({
      map: windowLightTex,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  windowLight.rotation.x = -Math.PI / 2;
  // offset toward the key light's forward direction so the warm patches
  // read as light spilling past the box, not centered directly under it
  windowLight.position.set(1.1, 0.002, 1.1);
  scene.add(windowLight);

  // a dedicated texture for the lid, drawn at the SAME pixels-per-world-unit
  // scale as the floor's — rather than cropping the floor's texture, which
  // needs the crop window to land exactly on a pane with no easy way to
  // guarantee that — so this always shows one clean, correctly-scaled pane
  // regardless of the floor pattern's own layout. Parented to the lid so it
  // rides along with the opening animation, and faded out once open (see
  // animate()) since the lid then tilts to face a different direction
  // where the pattern would no longer make sense.
  const lidW = bw * 0.95, lidD = bd * 0.95;
  const lidWindowLightTex = (() => {
    const pw = Math.round(lidW * WINDOW_LIGHT_PX_PER_UNIT);
    const ph = Math.round(lidD * WINDOW_LIGHT_PX_PER_UNIT);
    const c = makeCanvas(pw, ph);
    const ctx = c.getContext('2d');
    ctx.filter = 'blur(18px)';
    drawWindowPane(ctx, pw * 0.38, ph * 0.5, pw * 0.62, ph * 1.3, -14);
    return new THREE.CanvasTexture(c);
  })();
  const lidWindowLight = new THREE.Mesh(
    new THREE.PlaneGeometry(lidW, lidD),
    new THREE.MeshBasicMaterial({
      map: lidWindowLightTex,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  lidWindowLight.rotation.x = -Math.PI / 2;
  lidWindowLight.position.y = BOX.lidHeight / 2 + 0.001;
  lidMesh.add(lidWindowLight);

  boxGroup.position.set(0, 0, 0);

  /* ----------------------------- interaction helpers ----------------------- */
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const dragPoint = new THREE.Vector3();

  function setPointerFromEvent(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /* ----------------------------- memory objects ----------------------------- */
  const MEM_BASE_SIZE = 0.62; // longest edge in world units
  const MEM_THICKNESS = 0.004; // real photos are thin; a chunkier card reads as a floating block
  const MEM_HALF_THICKNESS = MEM_THICKNESS / 2;
  const STACK_GAP = 0.003; // small clearance between stacked cards so they never touch exactly

  // axis-aligned half-extents of a card's footprint once spun by rotY —
  // used both to keep cards from poking through the walls regardless of
  // rotation, and to detect when two cards' footprints overlap for stacking
  function cardHalfExtents(w, h, rotY, scale) {
    const hw = (w / 2) * scale, hh = (h / 2) * scale;
    const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
    return { ex: hw * c + hh * s, ez: hw * s + hh * c };
  }

  function footprintsOverlap(ax, az, aex, aez, bx, bz, bex, bez) {
    return Math.abs(ax - bx) < (aex + bex) && Math.abs(az - bz) < (aez + bez);
  }

  // half of a (possibly tilted) card's total vertical extent, measured from
  // its own center. rotY doesn't matter here — spinning around the vertical
  // axis never changes how tall a flat plane is — but rotX/rotZ tilt does:
  // a tilted card's far corner droops down (and the opposite corner lifts
  // up) by roughly half-width*sin(rotZ) + half-height*sin(rotX), which for a
  // large, noticeably-tilted card is far bigger than the card's own
  // thickness and was enough to poke its low corner through the floor
  function cardVerticalHalfSpan(w, h, rotX, rotZ, scale) {
    const hw = (w / 2) * scale, hh = (h / 2) * scale;
    const tiltDrop = hw * Math.abs(Math.sin(rotZ)) * Math.cos(rotX) + hh * Math.abs(Math.sin(rotX));
    return MEM_HALF_THICKNESS * scale + tiltDrop;
  }

  // clearance used BETWEEN stacked cards — deliberately much smaller than a
  // card's full tilt-aware vertical span. That full span is needed against
  // the floor (a large, always-visible hard surface), but using it between
  // every pair of stacked cards too meant a handful of ordinarily-tilted
  // photos could add far more height per layer than a real thin photo pile
  // ever would, making stacks look like they were floating. Capping the
  // tilt contribution here keeps piles low and flat while still leaving a
  // little give so a modestly tilted card doesn't dig into the one below it.
  const STACK_TILT_CAP = 0.003;
  function cardStackClearance(w, h, rotX, rotZ, scale) {
    const hw = (w / 2) * scale, hh = (h / 2) * scale;
    const tiltDrop = hw * Math.abs(Math.sin(rotZ)) * Math.cos(rotX) + hh * Math.abs(Math.sin(rotX));
    return MEM_HALF_THICKNESS * scale + Math.min(tiltDrop, STACK_TILT_CAP);
  }

  // a card rests on the floor unless its footprint overlaps another card, in
  // which case it lands just above the highest card it overlaps — keeps
  // memories from clipping through each other (or the floor) while still
  // letting them overlap and pile up naturally. Always lands exactly where
  // it's placed/dropped — x/z are never adjusted — relying on the small
  // per-layer clearance above to keep even a deep pile visually flat rather
  // than needing to redistribute cards sideways once a pile gets tall.
  function landingSpot(x, z, ex, ez, vSpanFloor, stackClearance, excludeRecord) {
    let y = INTERIOR.yFloor + vSpanFloor;
    for (const rec of state.memories) {
      if (rec === excludeRecord) continue;
      const g = rec.group;
      if (footprintsOverlap(x, z, ex, ez, g.position.x, g.position.z, g.userData.halfExtentX, g.userData.halfExtentZ)) {
        const otherTop = g.userData.baseY + g.userData.stackClearance;
        const candidate = otherTop + STACK_GAP + stackClearance;
        if (candidate > y) y = candidate;
      }
    }
    return y;
  }

  function buildMemoryTexture(img, borderStyle) {
    const maxDim = 900;
    let iw = img.width, ih = img.height;
    const scaleDown = Math.min(1, maxDim / Math.max(iw, ih));
    iw = Math.round(iw * scaleDown); ih = Math.round(ih * scaleDown);

    const border = borderStyle === 'polaroid' ? Math.round(Math.max(iw, ih) * 0.06) : Math.round(Math.max(iw, ih) * 0.035);
    const bottomExtra = borderStyle === 'polaroid' ? Math.round(Math.max(iw, ih) * 0.16) : border;

    const cw = iw + border * 2;
    const ch = ih + border + bottomExtra;
    const c = makeCanvas(cw, ch);
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#f7f2e6';
    ctx.fillRect(0, 0, cw, ch);
    // faint paper grain
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
      ctx.fillRect(Math.random() * cw, Math.random() * ch, 1, 1);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = Math.max(4, border * 0.3);
    ctx.drawImage(img, border, border, iw, ih);
    ctx.restore();

    // thin inset line like a printed photo edge
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(border, border, iw, ih);

    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return { tex, aspect: cw / ch };
  }

  // golden-angle step: an irrational fraction of a full turn, so stepping by
  // it per upload spreads spins evenly around the circle without ever
  // clustering — plain per-card uniform random can look "samey" for a small
  // batch purely by chance, since a handful of independent draws don't
  // reliably cover the full circle
  const GOLDEN_ANGLE = 2.399963229728653;

  function randomTransform(index) {
    const margin = 0.05;
    const baseSpin = index * GOLDEN_ANGLE;
    const spinJitter = THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-35, 35));
    const rotY = THREE.MathUtils.euclideanModulo(baseSpin + spinJitter + Math.PI, Math.PI * 2) - Math.PI;
    return {
      x: THREE.MathUtils.randFloat(INTERIOR.xMin + margin, INTERIOR.xMax - margin),
      z: THREE.MathUtils.randFloat(INTERIOR.zMin + margin, INTERIOR.zMax - margin),
      // y is recomputed in createMemoryObject once the card's real footprint
      // and any overlaps are known — this is just a placeholder
      y: INTERIOR.yFloor,
      // spin around the vertical axis, like a photo casually tossed onto a surface
      rotY: rotY,
      // natural tilt so cards don't all lie perfectly flat/aligned
      rotX: THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-7, 7)),
      rotZ: THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-7, 7)),
      scale: THREE.MathUtils.randFloat(0.85, 1.15)
    };
  }

  // older saved memories (from before memories lay flat) only have {rotX, rotZ}
  // where rotZ was a big in-plane spin meant for a standing card. Reinterpret
  // that as the new lying-flat spin so existing boxes still look natural.
  function normalizeTransform(t) {
    if (t && t.rotY === undefined) {
      return {
        x: t.x, y: t.y, z: t.z,
        rotY: t.rotZ || 0,
        rotX: 0,
        rotZ: 0,
        scale: t.scale
      };
    }
    return t;
  }

  function createMemoryObject(imgSrc, rawTransform, borderStyle, onReady) {
    const transform = normalizeTransform(rawTransform);
    const img = new Image();
    img.onload = () => {
      const { tex, aspect } = buildMemoryTexture(img, borderStyle);
      const backTex = paperTexture('#e9ddc4');

      let w = MEM_BASE_SIZE, h = MEM_BASE_SIZE;
      if (aspect >= 1) h = w / aspect; else w = h * aspect;

      // clamp into the interior accounting for this card's actual rotated
      // footprint (not just its center point), so it can never poke through
      // a wall regardless of size/aspect/rotation; then land it on the floor
      // or on top of whatever it overlaps, so cards can pile up without
      // clipping through each other
      const { ex, ez } = cardHalfExtents(w, h, transform.rotY, transform.scale);
      const vSpan = cardVerticalHalfSpan(w, h, transform.rotX, transform.rotZ, transform.scale);
      const stackClearance = cardStackClearance(w, h, transform.rotX, transform.rotZ, transform.scale);
      transform.x = THREE.MathUtils.clamp(transform.x, INTERIOR.xMin + ex, INTERIOR.xMax - ex);
      transform.z = THREE.MathUtils.clamp(transform.z, INTERIOR.zMin + ez, INTERIOR.zMax - ez);
      transform.y = landingSpot(transform.x, transform.z, ex, ez, vSpan, stackClearance, undefined);

      const geo = new THREE.BoxGeometry(w, h, MEM_THICKNESS);
      const frontMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.9 });
      const edgeMat = new THREE.MeshStandardMaterial({ color: 0xe9ddc4, roughness: 0.9 });
      // BoxGeometry material order: px, nx, py, ny, pz, nz
      const mats = [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat];
      const mesh = new THREE.Mesh(geo, mats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // lay the card flat: its printed face (local +Z) is rotated to face up (+Y)
      mesh.rotation.x = -Math.PI / 2;

      const group = new THREE.Group();
      group.add(mesh);
      group.position.set(transform.x, transform.y, transform.z);
      // group.rotation.y spins the flat card on the spot; x/z add a hair of
      // natural tilt. Order matters so the flat lay-down always dominates.
      group.rotation.order = 'YXZ';
      group.rotation.set(transform.rotX, transform.rotY, transform.rotZ);
      group.scale.setScalar(transform.scale);
      group.userData.baseY = transform.y;
      group.userData.baseScale = transform.scale;
      group.userData.halfExtentX = ex;
      group.userData.halfExtentZ = ez;
      group.userData.verticalHalfSpan = vSpan;
      group.userData.stackClearance = stackClearance;
      group.userData.lifted = false;

      boxGroup.add(group);
      const record = { group, mesh, imgSrc, transform, borderStyle };
      state.memories.push(record);
      if (onReady) onReady(record);
    };
    img.src = imgSrc;
  }

  function addMemoryFromDataURL(dataURL, storedTransform, borderStyle) {
    const index = state.stackCount++;
    const transform = storedTransform || randomTransform(index);
    const style = borderStyle || (Math.random() > 0.55 ? 'polaroid' : 'plain');
    createMemoryObject(dataURL, transform, style);
  }

  /* ----------------------------- box open/close animation ------------------ */
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function animateValue(duration, onUpdate, onDone) {
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      onUpdate(easeInOutCubic(t));
      if (t < 1) requestAnimationFrame(step);
      else if (onDone) onDone();
    }
    requestAnimationFrame(step);
  }

  function openBox() {
    if (state.boxOpen || state.isAnimatingBox) return;
    state.isAnimatingBox = true;
    playLidOpenCreak();
    hideGuide();

    const camFrom = camera.position.clone();
    const targetFrom = controls.target.clone();
    const targetTo = new THREE.Vector3(0, 0.42, 0.05);

    animateValue(1250, (t) => {
      lidPivot.rotation.x = -t * (Math.PI * 0.62);
      camera.position.lerpVectors(camFrom, CAM_OPEN, t);
      controls.target.lerpVectors(targetFrom, targetTo, t);
      controls.update();
    }, () => {
      state.isAnimatingBox = false;
      state.boxOpen = true;
      maybeShowGuide('add');
    });
  }

  function closeBox() {
    if (!state.boxOpen || state.isAnimatingBox) return;
    state.isAnimatingBox = true;
    state.__closeSoundPlayed = false;

    const camFrom = camera.position.clone();
    const targetFrom = controls.target.clone();

    animateValue(1000, (t) => {
      if (t > 0.75 && !state.__closeSoundPlayed) {
        state.__closeSoundPlayed = true;
        playLidCloseCreak();
      }
      lidPivot.rotation.x = -(1 - t) * (Math.PI * 0.62);
      camera.position.lerpVectors(camFrom, CAM_START, t);
      controls.target.lerpVectors(targetFrom, new THREE.Vector3(0, 0.35, 0), t);
      controls.update();
    }, () => {
      state.isAnimatingBox = false;
      state.boxOpen = false;
    });
  }

  /* ----------------------------- pointer interaction ------------------------ */
  const dom = renderer.domElement;

  // trash target: shown only while actively dragging a memory, so a plain
  // click-to-view never flashes it. Hit-testing uses screen-space rect,
  // not raycasting, since it's a 2D UI element layered over the 3D scene.
  const trashZone = document.getElementById('trash-zone');
  const trashLabel = document.getElementById('trash-label');
  const TRASH_HIT_PAD = 14;

  function isPointOverTrash(x, y) {
    const r = trashZone.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    return x >= r.left - TRASH_HIT_PAD && x <= r.right + TRASH_HIT_PAD &&
           y >= r.top - TRASH_HIT_PAD && y <= r.bottom + TRASH_HIT_PAD;
  }

  function getIntersectableMemoryMeshes() {
    return state.memories.map(m => m.mesh);
  }

  function findRecordByMesh(mesh) {
    return state.memories.find(m => m.mesh === mesh || m.group === mesh.parent);
  }

  function onPointerDown(e) {
    if (state.viewerOpen || state.isAnimatingBox) return;
    setPointerFromEvent(e);
    state.pointerDownPos = { x: e.clientX, y: e.clientY };
    state.pointerDownTime = performance.now();
    state.pointerMoved = false;

    raycaster.setFromCamera(pointerNDC, camera);

    if (!state.boxOpen) {
      // closed: clicking the lid (or the box body it's resting on) opens it
      const hitsLid = raycaster.intersectObject(lidMesh, true);
      const hitsBase = raycaster.intersectObjects(baseGroup.children, true);
      if (hitsLid.length || hitsBase.length) {
        openBox();
      }
      return;
    }

    // open: clicking the lid closes it again. Checked before memories so a
    // memory can never be mistaken for the lid, and the lid (now tipped back)
    // never overlaps the memories lying flat in the box.
    const hitsLidOpen = raycaster.intersectObject(lidMesh, true);
    if (hitsLidOpen.length) {
      closeBox();
      return;
    }

    const hits = raycaster.intersectObjects(getIntersectableMemoryMeshes(), true);
    if (hits.length) {
      const rec = findRecordByMesh(hits[0].object);
      if (rec) {
        state.dragging = rec;
        dragPlane.set(new THREE.Vector3(0, 1, 0), -rec.group.position.y);
        raycaster.ray.intersectPlane(dragPlane, dragPoint);
        state.dragOffset.copy(rec.group.position).sub(dragPoint);
        rec.group.userData.lifted = true;
        dom.classList.add('dragging');
        dom.setPointerCapture && e.pointerId != null && dom.setPointerCapture(e.pointerId);
        controls.enabled = false;
      }
    }
  }

  function onPointerMove(e) {
    if (state.viewerOpen || state.isAnimatingBox) return;
    if (state.pointerDownPos) {
      const dx = e.clientX - state.pointerDownPos.x;
      const dy = e.clientY - state.pointerDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > 6) state.pointerMoved = true;
    }
    setPointerFromEvent(e);

    if (state.dragging) {
      raycaster.setFromCamera(pointerNDC, camera);
      raycaster.ray.intersectPlane(dragPlane, dragPoint);
      const target = dragPoint.clone().add(state.dragOffset);
      const dragUD = state.dragging.group.userData;
      target.x = THREE.MathUtils.clamp(target.x, INTERIOR.xMin + dragUD.halfExtentX, INTERIOR.xMax - dragUD.halfExtentX);
      target.z = THREE.MathUtils.clamp(target.z, INTERIOR.zMin + dragUD.halfExtentZ, INTERIOR.zMax - dragUD.halfExtentZ);
      state.dragging.group.position.x = target.x;
      state.dragging.group.position.z = target.z;
      // hover height must track whatever is currently underneath the cursor,
      // not the card's old resting height — otherwise dragging a card over a
      // tall stack lets it visibly sink into that stack mid-drag, only
      // correcting itself once dropped
      const hoverY = landingSpot(target.x, target.z, dragUD.halfExtentX, dragUD.halfExtentZ, dragUD.verticalHalfSpan, dragUD.stackClearance, state.dragging);
      state.dragging.group.position.y = hoverY + 0.05;

      if (state.pointerMoved) {
        trashZone.classList.add('show');
        trashLabel.classList.add('show');
        const overTrash = isPointOverTrash(e.clientX, e.clientY);
        if (overTrash !== state.overTrash) {
          state.overTrash = overTrash;
          trashZone.classList.toggle('active', overTrash);
        }
        state.dragging.group.userData.overTrash = overTrash;
      }
      return;
    }

    if (!state.boxOpen) return;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(getIntersectableMemoryMeshes(), true);
    const rec = hits.length ? findRecordByMesh(hits[0].object) : null;

    if (rec !== state.hovered) {
      if (state.hovered && state.hovered !== state.dragging) {
        state.hovered.group.userData.lifted = false;
      }
      state.hovered = rec;
      if (rec) rec.group.userData.lifted = true;
      dom.classList.toggle('hovering', !!rec);
    }
  }

  function onPointerUp(e) {
    controls.enabled = true;
    dom.classList.remove('dragging');

    if (state.dragging) {
      const rec = state.dragging;
      const droppedOnTrash = state.pointerMoved && state.overTrash;
      trashZone.classList.remove('show', 'active');
      trashLabel.classList.remove('show');
      state.overTrash = false;
      rec.group.userData.overTrash = false;

      if (droppedOnTrash) {
        state.dragging = null;
        removeMemoryRecord(rec);
        playPaperDrop();
        return;
      }

      const ud = rec.group.userData;
      const newY = landingSpot(rec.group.position.x, rec.group.position.z, ud.halfExtentX, ud.halfExtentZ, ud.verticalHalfSpan, ud.stackClearance, rec);
      ud.baseY = newY;
      rec.group.position.y = newY;
      rec.transform.x = rec.group.position.x;
      rec.transform.y = newY;
      rec.transform.z = rec.group.position.z;
      const wasClick = !state.pointerMoved && (performance.now() - state.pointerDownTime) < 350;
      state.dragging = null;
      if (wasClick) openMemoryViewer(rec);
      return;
    }

    state.pointerDownPos = null;
  }

  dom.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', onPointerUp);

  /* ----------------------------- memory viewer ------------------------------ */
  const viewerOverlay = document.getElementById('viewer-overlay');
  const viewerImage = document.getElementById('viewer-image');
  const viewerClose = document.getElementById('viewer-close');
  let activeViewerRecord = null;

  function openMemoryViewer(rec) {
    state.viewerOpen = true;
    activeViewerRecord = rec;
    viewerImage.src = rec.imgSrc;
    rec.mesh.visible = false;
    viewerOverlay.classList.remove('hidden');
    requestAnimationFrame(() => viewerOverlay.classList.add('open'));
  }

  function closeMemoryViewer() {
    viewerOverlay.classList.remove('open');
    setTimeout(() => {
      viewerOverlay.classList.add('hidden');
      if (activeViewerRecord) activeViewerRecord.mesh.visible = true;
      activeViewerRecord = null;
      state.viewerOpen = false;
    }, 420);
  }

  viewerOverlay.addEventListener('click', (e) => {
    if (e.target === viewerClose) return;
    closeMemoryViewer();
  });
  viewerClose.addEventListener('click', (e) => { e.stopPropagation(); closeMemoryViewer(); });

  /* ----------------------------- delete a memory ----------------------------- */
  function removeMemoryRecord(rec) {
    boxGroup.remove(rec.group);
    rec.mesh.geometry.dispose();
    const mats = Array.isArray(rec.mesh.material) ? rec.mesh.material : [rec.mesh.material];
    mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    const idx = state.memories.indexOf(rec);
    if (idx !== -1) state.memories.splice(idx, 1);
    if (state.hovered === rec) state.hovered = null;
    if (state.dragging === rec) state.dragging = null;
  }

  /* ----------------------------- add memory (upload) ------------------------ */
  const fileInput = document.getElementById('file-input');
  const addBtn = document.getElementById('add-btn');
  const dragHint = document.getElementById('drag-hint');

  addBtn.addEventListener('click', () => {
    if (!state.boxOpen) openBox();
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []);
    files.forEach((file, i) => setTimeout(() => handleFile(file), i * 180));
    fileInput.value = '';
  });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      resizeDataURL(reader.result, 1100).then(resized => {
        addMemoryFromDataURL(resized, null, null);
        hideGuide();
      });
    };
    reader.readAsDataURL(file);
  }

  function resizeDataURL(dataURL, maxDim) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (Math.max(width, height) > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const c = makeCanvas(width, height);
        c.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL('image/jpeg', 0.88));
      };
      img.src = dataURL;
    });
  }

  // drag-and-drop files onto the page
  ['dragenter', 'dragover'].forEach(evt => {
    window.addEventListener(evt, (e) => {
      e.preventDefault();
      dragHint.classList.remove('hidden');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    window.addEventListener(evt, (e) => {
      e.preventDefault();
      if (evt === 'drop') {
        const files = Array.from(e.dataTransfer.files || []);
        if (!state.boxOpen) openBox();
        files.forEach((file, i) => setTimeout(() => handleFile(file), i * 180 + 400));
      }
      dragHint.classList.add('hidden');
    });
  });

  /* ----------------------------- guidance / first run ------------------------ */
  const guideEl = document.getElementById('guide-text');
  const footerHint = document.getElementById('footer-hint');
  let guideTimer = null;

  function showGuide(text, duration = 3400) {
    clearTimeout(guideTimer);
    guideEl.textContent = text;
    guideEl.classList.add('show');
    guideTimer = setTimeout(hideGuide, duration);
  }
  function hideGuide() {
    guideEl.classList.remove('show');
  }
  function maybeShowGuide(step) {
    const seen = localStorage.getItem('memoryBoxVisited') === 'true';
    if (seen) return;
    if (step === 'intro') showGuide('Some memories are meant to be kept.', 3600);
    if (step === 'open') setTimeout(() => showGuide('Open the box.', 3200), 3800);
    if (step === 'add') {
      showGuide('Add something worth remembering.', 4200);
      localStorage.setItem('memoryBoxVisited', 'true');
    }
  }

  /* ----------------------------- audio (synthesized, no assets) -------------- */
  let audioCtx = null;
  function ctx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function noiseBuffer(duration) {
    const c = ctx();
    const buffer = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  function playBuffer({ duration, filterFreq, filterType = 'bandpass', gain = 0.25, pitchFrom, pitchTo }) {
    if (state.muted) return;
    try {
      const c = ctx();
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(duration);
      const filter = c.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = filterFreq;
      if (pitchFrom && pitchTo) {
        filter.frequency.setValueAtTime(pitchFrom, c.currentTime);
        filter.frequency.linearRampToValueAtTime(pitchTo, c.currentTime + duration);
      }
      const g = c.createGain();
      g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      src.connect(filter).connect(g).connect(c.destination);
      src.start();
    } catch (e) { /* audio unsupported, ignore */ }
  }
  // soft, low, narrow-band "wood" creaks — very quiet and short by design,
  // low cutoff frequencies only (no metallic high end), like a small hinge
  // gently moving on an old wooden box rather than a dramatic cinematic creak
  function playLidOpenCreak() {
    playBuffer({ duration: 0.34, filterFreq: 280, pitchFrom: 220, pitchTo: 330, filterType: 'bandpass', gain: 0.02 });
    playBuffer({ duration: 0.16, filterFreq: 130, filterType: 'lowpass', gain: 0.015 });
  }
  function playLidCloseCreak() {
    playBuffer({ duration: 0.26, filterFreq: 260, pitchFrom: 310, pitchTo: 220, filterType: 'bandpass', gain: 0.018 });
    playBuffer({ duration: 0.14, filterFreq: 120, filterType: 'lowpass', gain: 0.02 });
  }
  function playPaperDrop() { playBuffer({ duration: 0.18, filterFreq: 1600, filterType: 'highpass', gain: 0.09 }); }

  const soundBtn = document.getElementById('sound-btn');
  const soundIcon = document.getElementById('sound-icon');
  function refreshSoundIcon() { soundIcon.textContent = state.muted ? '✕' : '♪'; }
  refreshSoundIcon();
  soundBtn.addEventListener('click', () => {
    state.muted = !state.muted;
    localStorage.setItem('memoryBoxMuted', String(state.muted));
    refreshSoundIcon();
  });

  /* ----------------------------- share via Firebase (Firestore) --------------- */
  // Boxes are never persisted locally — each visit starts empty unless the URL
  // carries a ?box=<id> from a link generated by "Share Box", in which case
  // that box's memories are fetched from Firestore. A generated link is an
  // immutable snapshot: sharing again always creates a fresh box id rather
  // than mutating one that may already be out in the world.
  const FIREBASE_READY = typeof firebase !== 'undefined' && !!(firebase.apps && firebase.apps.length);
  const db = FIREBASE_READY ? firebase.firestore() : null;
  const MAX_MEMORY_DOC_BYTES = 880000; // stay safely under Firestore's ~1MiB document cap
  const sharedBoxId = new URLSearchParams(window.location.search).get('box');

  function dataURLApproxBytes(dataURL) {
    const base64 = dataURL.slice(dataURL.indexOf(',') + 1);
    return Math.ceil(base64.length * 0.75);
  }

  // re-compress a memory's image if needed so it fits in one Firestore document
  function shrinkDataURLForSharing(dataURL) {
    if (dataURLApproxBytes(dataURL) <= MAX_MEMORY_DOC_BYTES) return Promise.resolve(dataURL);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let quality = 0.7, scale = 0.85, attempts = 0, out = dataURL;
        (function tryShrink() {
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = makeCanvas(w, h);
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          out = c.toDataURL('image/jpeg', quality);
          attempts++;
          if (dataURLApproxBytes(out) > MAX_MEMORY_DOC_BYTES && attempts < 6) {
            quality = Math.max(0.4, quality - 0.1);
            scale = Math.max(0.4, scale - 0.12);
            tryShrink();
          } else {
            resolve(out);
          }
        })();
      };
      img.src = dataURL;
    });
  }

  async function loadSharedBox(boxId) {
    if (!FIREBASE_READY) return;
    try {
      const snap = await db.collection('boxes').doc(boxId).collection('memories').orderBy('order').get();
      snap.forEach((doc) => {
        const data = doc.data();
        state.stackCount++;
        createMemoryObject(data.imageData, data.transform, data.borderStyle);
      });
    } catch (err) {
      // shared box missing/unreachable — falls back to an empty box
    }
  }

  const shareBtn = document.getElementById('share-btn');
  const shareOverlay = document.getElementById('share-overlay');
  const shareStatus = document.getElementById('share-status');
  const shareLinkRow = document.getElementById('share-link-row');
  const shareLinkInput = document.getElementById('share-link-input');
  const shareCopyBtn = document.getElementById('share-copy-btn');
  const shareClose = document.getElementById('share-close');

  function openShareOverlay() {
    shareLinkRow.classList.add('hidden');
    shareCopyBtn.textContent = 'Copy';
    shareOverlay.classList.remove('hidden');
  }
  function closeShareOverlay() { shareOverlay.classList.add('hidden'); }

  async function generateShareLink() {
    if (!FIREBASE_READY) {
      openShareOverlay();
      shareStatus.textContent = "Sharing isn't set up yet for this site.";
      return;
    }
    if (!state.memories.length) {
      openShareOverlay();
      shareStatus.textContent = 'Add a memory before sharing the box.';
      return;
    }

    openShareOverlay();
    shareStatus.textContent = 'Gathering the memories…';

    try {
      const boxRef = db.collection('boxes').doc();
      await boxRef.set({ createdAt: firebase.firestore.FieldValue.serverTimestamp() });

      const memories = state.memories.slice();
      for (let i = 0; i < memories.length; i++) {
        shareStatus.textContent = `Packing memory ${i + 1} of ${memories.length}…`;
        const rec = memories[i];
        const safeImage = await shrinkDataURLForSharing(rec.imgSrc);
        await boxRef.collection('memories').add({
          imageData: safeImage,
          transform: rec.transform,
          borderStyle: rec.borderStyle,
          order: i
        });
      }

      const shareUrl = `${location.origin}${location.pathname}?box=${boxRef.id}`;
      shareStatus.textContent = 'Your box is ready to share:';
      shareLinkInput.value = shareUrl;
      shareLinkRow.classList.remove('hidden');
    } catch (err) {
      shareStatus.textContent = "Couldn't create the link — please try again.";
    }
  }

  shareBtn.addEventListener('click', generateShareLink);
  shareClose.addEventListener('click', closeShareOverlay);
  shareOverlay.addEventListener('click', (e) => { if (e.target === shareOverlay) closeShareOverlay(); });
  shareCopyBtn.addEventListener('click', () => {
    shareLinkInput.select();
    if (navigator.clipboard) navigator.clipboard.writeText(shareLinkInput.value).catch(() => {});
    shareCopyBtn.textContent = 'Copied!';
    setTimeout(() => { shareCopyBtn.textContent = 'Copy'; }, 1500);
  });

  /* ----------------------------- hover lift animation loop --------------------- */
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    state.memories.forEach(rec => {
      const targetY = rec.group.userData.baseY + (rec.group.userData.lifted ? 0.045 : 0);
      rec.group.position.y += (targetY - rec.group.position.y) * Math.min(1, dt * 10);
      const scaleFactor = rec.group.userData.overTrash ? 0.55 : (rec.group.userData.lifted ? 1.04 : 1);
      const targetScale = rec.group.userData.baseScale * scaleFactor;
      const s = rec.group.scale.x + (targetScale - rec.group.scale.x) * Math.min(1, dt * 10);
      rec.group.scale.setScalar(s);
    });

    // gentle light flicker for coziness
    const t = performance.now() * 0.0006;
    keyLight.intensity = 2.15 + Math.sin(t * 1.7) * 0.06;

    // warm window light drifts and breathes slowly, like sun moving through
    // shifting clouds or leaves rather than a static decal
    windowLight.position.x = 1.1 + Math.sin(t * 0.35) * 0.18;
    windowLight.position.z = 1.1 + Math.cos(t * 0.27) * 0.15;
    windowLight.material.opacity = 0.42 + Math.sin(t * 0.5) * 0.1;
    const lidLightTarget = state.boxOpen || state.isAnimatingBox ? 0 : 0.4 + Math.sin(t * 0.5) * 0.1;
    lidWindowLight.material.opacity += (lidLightTarget - lidWindowLight.material.opacity) * Math.min(1, dt * 4);

    controls.update();
    renderer.render(scene, camera);
  }

  /* ----------------------------- boot ------------------------------------------ */
  async function boot() {
    if (sharedBoxId) {
      const loadingText = document.getElementById('loading-text');
      if (loadingText) loadingText.textContent = 'gathering the memories…';
      await loadSharedBox(sharedBoxId);
    }
    animate();

    const loadingScreen = document.getElementById('loading-screen');
    setTimeout(() => {
      loadingScreen.classList.add('fade-out');
      setTimeout(() => loadingScreen.remove(), 1000);
      maybeShowGuide('intro');
      maybeShowGuide('open');
    }, 500);

    setTimeout(() => footerHint.classList.add('fade'), 9000);
  }

  boot();
})();
