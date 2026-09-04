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
    stackCount: 0
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
    yFloor: BOX.wall + 0.02
  };

  /* ----------------------------- renderer / scene ------------------------ */
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0906);
  scene.fog = new THREE.FogExp2(0x0d0906, 0.055);

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
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
  // floor of the box
  baseGroup.add(wallPiece(bw, wt, bd, 0, wt / 2, 0, boxWoodMatDark));
  // front / back walls
  baseGroup.add(wallPiece(bw, wallH, wt, 0, wallH / 2, -bd / 2 + wt / 2, boxWoodMat));
  baseGroup.add(wallPiece(bw, wallH, wt, 0, wallH / 2, bd / 2 - wt / 2, boxWoodMat));
  // left / right walls
  baseGroup.add(wallPiece(wt, wallH, bd - wt * 2, -bw / 2 + wt / 2, wallH / 2, 0, boxWoodMat));
  baseGroup.add(wallPiece(wt, wallH, bd - wt * 2, bw / 2 - wt / 2, wallH / 2, 0, boxWoodMat));

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

  function randomTransform(index) {
    const margin = 0.05;
    return {
      x: THREE.MathUtils.randFloat(INTERIOR.xMin + margin, INTERIOR.xMax - margin),
      z: THREE.MathUtils.randFloat(INTERIOR.zMin + margin, INTERIOR.zMax - margin),
      y: INTERIOR.yFloor + index * 0.0065 + Math.random() * 0.002,
      // spin around the vertical axis, like a photo casually tossed onto a surface
      rotY: THREE.MathUtils.randFloat(-Math.PI, Math.PI),
      // tiny natural tilt so it doesn't look perfectly flat/aligned
      rotX: THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-2.5, 2.5)),
      rotZ: THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-2.5, 2.5)),
      scale: THREE.MathUtils.randFloat(0.88, 1.12)
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

      const geo = new THREE.BoxGeometry(w, h, 0.012);
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
      group.userData.lifted = false;

      boxGroup.add(group);
      const record = { group, mesh, imgSrc, transform, borderStyle };
      state.memories.push(record);
      if (onReady) onReady(record);
    };
    img.src = imgSrc;
  }

  function addMemoryFromDataURL(dataURL, storedTransform, borderStyle, save) {
    const index = state.stackCount++;
    const transform = storedTransform || randomTransform(index);
    const style = borderStyle || (Math.random() > 0.55 ? 'polaroid' : 'plain');
    createMemoryObject(dataURL, transform, style, (record) => {
      if (save) {
        idbAddMemory({
          id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
          imageData: dataURL,
          transform,
          borderStyle: style,
          createdAt: Date.now()
        }).then(id => { record.id = id; });
      }
    });
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
      target.x = THREE.MathUtils.clamp(target.x, INTERIOR.xMin, INTERIOR.xMax);
      target.z = THREE.MathUtils.clamp(target.z, INTERIOR.zMin, INTERIOR.zMax);
      state.dragging.group.position.x = target.x;
      state.dragging.group.position.z = target.z;
      state.dragging.group.position.y = state.dragging.group.userData.baseY + 0.05;
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
      rec.group.position.y = rec.group.userData.baseY;
      rec.transform.x = rec.group.position.x;
      rec.transform.z = rec.group.position.z;
      playPaperDrop();
      if (rec.id) idbUpdateTransform(rec.id, rec.transform);
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
  const viewerDelete = document.getElementById('viewer-delete');
  let activeViewerRecord = null;

  function openMemoryViewer(rec) {
    state.viewerOpen = true;
    activeViewerRecord = rec;
    viewerImage.src = rec.imgSrc;
    rec.mesh.visible = false;
    viewerOverlay.classList.remove('hidden');
    requestAnimationFrame(() => viewerOverlay.classList.add('open'));
    playPaperPickup();
  }

  function closeMemoryViewer() {
    viewerOverlay.classList.remove('open');
    playPaperDrop();
    setTimeout(() => {
      viewerOverlay.classList.add('hidden');
      if (activeViewerRecord) activeViewerRecord.mesh.visible = true;
      activeViewerRecord = null;
      state.viewerOpen = false;
    }, 420);
  }

  viewerOverlay.addEventListener('click', (e) => {
    if (e.target === viewerClose || e.target === viewerDelete) return;
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
    if (rec.id) idbDeleteMemory(rec.id);
  }

  function deleteActiveMemory() {
    if (!activeViewerRecord) return;
    const rec = activeViewerRecord;
    activeViewerRecord = null;
    removeMemoryRecord(rec);
    viewerOverlay.classList.remove('open');
    setTimeout(() => {
      viewerOverlay.classList.add('hidden');
      state.viewerOpen = false;
    }, 420);
  }

  viewerDelete.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activeViewerRecord) return;
    if (window.confirm("Remove this memory? This can't be undone.")) {
      deleteActiveMemory();
    }
  });

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
        addMemoryFromDataURL(resized, null, null, true);
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
  function playPaperPickup() { playBuffer({ duration: 0.22, filterFreq: 2200, filterType: 'highpass', gain: 0.08 }); }
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

  /* ----------------------------- IndexedDB persistence ------------------------ */
  const DB_NAME = 'memoryBoxDB';
  const STORE = 'memories';
  let dbPromise = null;

  function getDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function idbAddMemory(record) {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = () => resolve(record.id);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { return null; }
  }

  async function idbUpdateTransform(id, transform) {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const rec = getReq.result;
        if (rec) { rec.transform = transform; store.put(rec); }
      };
    } catch (e) { /* ignore */ }
  }

  async function idbDeleteMemory(id) {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
    } catch (e) { /* ignore */ }
  }

  async function idbLoadAll() {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return []; }
  }

  async function loadPersistedMemories() {
    const records = await idbLoadAll();
    records.sort((a, b) => a.createdAt - b.createdAt);
    records.forEach((rec, i) => {
      state.stackCount = Math.max(state.stackCount, i + 1);
      createMemoryObject(rec.imageData, rec.transform, rec.borderStyle, (created) => {
        created.id = rec.id;
      });
    });
  }

  /* ----------------------------- hover lift animation loop --------------------- */
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    state.memories.forEach(rec => {
      const targetY = rec.group.userData.baseY + (rec.group.userData.lifted ? 0.045 : 0);
      rec.group.position.y += (targetY - rec.group.position.y) * Math.min(1, dt * 10);
      const targetScale = rec.group.userData.baseScale * (rec.group.userData.lifted ? 1.04 : 1);
      const s = rec.group.scale.x + (targetScale - rec.group.scale.x) * Math.min(1, dt * 10);
      rec.group.scale.setScalar(s);
    });

    // gentle light flicker for coziness
    const t = performance.now() * 0.0006;
    keyLight.intensity = 2.15 + Math.sin(t * 1.7) * 0.06;

    controls.update();
    renderer.render(scene, camera);
  }

  /* ----------------------------- boot ------------------------------------------ */
  async function boot() {
    await loadPersistedMemories();
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
