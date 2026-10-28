// Vista 3D del almacén (Three.js r147, sin módulos para que funcione también abriendo el archivo con doble clic).
// No simula nada por su cuenta: dibuja en 3D el mismo estado `dia` que anima el plano 2D de app.js
// (personas, hojas, cajas y camiones), con el plano apaisado PLANOS.ancho como base.
// Escala: 40 px del plano = 1 m; el centro del plano (480, 280) es el origen.
const Vista3D = (() => {
  const ok = typeof THREE !== 'undefined' && typeof THREE.OrbitControls === 'function' && (() => {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  })();
  if (!ok) return { ok: false };

  const A = PLANOS.ancho, M = 40;
  const X = (x) => (x - 480) / M, Z = (y) => (y - 280) / M;
  const contenedor = $('escena3d');
  let renderer, escena, camara, controles, sol, cielo, listo = false, visible = true, temaActual = '';
  let ancho = 0, alto = 0;

  /* --- Utilidades --- */
  const mats = new Map();
  const mat = (color, extra = {}) => {
    const k = color + JSON.stringify(extra);
    if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color, ...extra }));
    return mats.get(k);
  };
  function caja(w, h, d, material, x = 0, y = 0, z = 0, sombra = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = sombra; m.receiveShadow = true;
    return m;
  }
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  // Textos como texturas de canvas (etiquetas sobre las personas, globos, carteles)
  const texturas = new Map();
  function texturaTexto(texto, { fondo = null, color = '#fff', tam = 40, peso = 600, pad = 14 } = {}) {
    const k = [texto, fondo, color, tam, peso].join('|');
    if (texturas.has(k)) return texturas.get(k);
    const c = document.createElement('canvas'), g = c.getContext('2d');
    const fuente = `${peso} ${tam}px Barlow, sans-serif`;
    g.font = fuente;
    const w = Math.ceil(g.measureText(texto).width + pad * 2), h = Math.ceil(tam * 1.5);
    c.width = w; c.height = h;
    g.font = fuente; g.textBaseline = 'middle'; g.textAlign = 'center';
    if (fondo) { g.fillStyle = fondo; g.beginPath(); g.roundRect(0, 0, w, h, h / 2); g.fill(); }
    g.fillStyle = color; g.fillText(texto, w / 2, h / 2 + 1);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    const r = { tex, aspecto: w / h };
    texturas.set(k, r);
    return r;
  }
  function spriteTexto(texto, opciones, altoM) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    s.userData.altoM = altoM;
    ponerTexto(s, texto, opciones);
    return s;
  }
  function ponerTexto(s, texto, opciones) {
    const clave = texto + JSON.stringify(opciones);
    if (s.userData.clave === clave) return;
    s.userData.clave = clave;
    const { tex, aspecto } = texturaTexto(texto, opciones);
    s.material.map = tex; s.material.needsUpdate = true;
    s.scale.set(s.userData.altoM * aspecto, s.userData.altoM, 1);
  }

  /* --- Piso: concreto con juntas, pasillos pintados y nombres de cada zona --- */
  let texPiso, texPatio;
  function pintarPiso() {
    const c = texPiso.image, g = c.getContext('2d'), e = c.width / 716;
    g.setTransform(e, 0, 0, e, 0, 0);
    g.fillStyle = C.suelo; g.fillRect(0, 0, 716, 560);
    g.strokeStyle = C.linea; g.lineWidth = 1.5; g.beginPath();
    for (let x = 120; x < 716; x += 120) { g.moveTo(x, 0); g.lineTo(x, 560); }
    for (let y = 120; y < 560; y += 120) { g.moveTo(0, y); g.lineTo(716, y); }
    g.stroke();
    g.globalAlpha = 0.55; g.strokeStyle = C.fondo; g.lineWidth = 26; g.lineCap = 'round';
    g.beginPath(); A.red.forEach(([x1, y1, x2, y2]) => { g.moveTo(x1, y1); g.lineTo(x2, y2); }); g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = C['tinta-2']; g.font = '600 15px Barlow, sans-serif';
    [['Estantería', 290, 78], ['Mesas de empaque', 290, 470], ['Ventas', 26, 190], ['Comedor y vestuario', 26, 540], ['Pedidos pendientes', 26, 404]]
      .forEach(([t, x, y]) => g.fillText(t, x, y));
    texPiso.needsUpdate = true;
  }
  function pintarPatio() {
    const c = texPatio.image, g = c.getContext('2d'), e = c.width / 1120;
    g.setTransform(e, 0, 0, e, 0, 0);
    const oscuro = esOscuro();
    g.fillStyle = oscuro ? '#1d1f22' : '#6c7176'; g.fillRect(0, 0, 1120, 720);
    g.strokeStyle = oscuro ? '#55585c' : '#e8e8e2'; g.lineWidth = 3; g.setLineDash([18, 12]);
    g.beginPath();
    for (const y of [185, 335]) { g.moveTo(10, y + 80); g.lineTo(260, y + 80); }   // separación de bahías
    g.stroke(); g.setLineDash([]);
    g.fillStyle = oscuro ? '#7c8085' : '#f2f2ec'; g.font = '700 22px Barlow, sans-serif';
    A.anden.bahias.forEach((b, k) => g.fillText(`RUTA ${k + 1}`, 330, b.camion[1] + 80 + 8));
    texPatio.needsUpdate = true;
  }

  /* --- Persona: piernas, torso con chaleco, brazos, cabeza y pelo --- */
  function crearPersona({ ropa, piel, pelo, chaleco }) {
    const g = new THREE.Group(), cuerpo = new THREE.Group();
    g.add(cuerpo);
    const mRopa = mat(ropa), mPiel = mat(piel), mPelo = mat(pelo), mPant = mat('#2f3640'), mZap = mat('#1b1b1b');
    const pierna = (z) => {
      const p = new THREE.Group(); p.position.set(0, 0.86, z);
      p.add(caja(0.15, 0.8, 0.15, mPant, 0, -0.4, 0));
      p.add(caja(0.24, 0.08, 0.15, mZap, 0.04, -0.82, 0));
      cuerpo.add(p); return p;
    };
    const brazo = (z) => {
      const b = new THREE.Group(); b.position.set(0, 1.42, z);
      b.add(caja(0.11, 0.5, 0.11, mRopa, 0, -0.24, 0));
      b.add(caja(0.1, 0.1, 0.1, mPiel, 0, -0.53, 0));
      cuerpo.add(b); return b;
    };
    const piernas = [pierna(-0.1), pierna(0.1)], brazos = [brazo(-0.27), brazo(0.27)];
    cuerpo.add(caja(0.28, 0.6, 0.44, mRopa, 0, 1.17, 0));
    if (chaleco) {                                          // cinta reflectiva del chaleco
      const mCinta = mat('#fff1c2', { emissive: '#3a3420' });
      cuerpo.add(caja(0.29, 0.05, 0.45, mCinta, 0, 1.06, 0, false));
      cuerpo.add(caja(0.29, 0.05, 0.45, mCinta, 0, 1.28, 0, false));
    }
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mPiel);
    cabeza.position.set(0, 1.62, 0); cabeza.castShadow = true;
    const peinado = new THREE.Mesh(new THREE.SphereGeometry(0.152, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mPelo);
    peinado.position.set(-0.025, 1.635, 0); peinado.rotation.z = 0.35; peinado.castShadow = true;
    cuerpo.add(cabeza, peinado);
    // Lo que lleva en las manos
    const cajaMano = caja(0.4, 0.32, 0.4, mat(C.carton || '#c19463'), 0.38, 1.05, 0);
    const hoja = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.21), new THREE.MeshBasicMaterial({ color: '#fbfaf6', side: THREE.DoubleSide }));
    hoja.position.set(0.3, 1.0, 0.24); hoja.rotation.x = -1.1;
    const auricular = caja(0.08, 0.2, 0.06, mat('#1b1b1b'), 0.02, 1.6, -0.16, false);
    auricular.visible = false;
    cuerpo.add(cajaMano, hoja, auricular);
    g.userData = { cuerpo, piernas, brazos, cajaMano, hoja, auricular };
    return g;
  }
  // Pose de cada cuadro: caminar, cargar, recoger, empacar, sentarse, comer o hablar por teléfono
  function posar(g, o) {
    const { cuerpo, piernas, brazos, cajaMano, hoja, auricular } = g.userData;
    auricular.visible = !!o.habla;
    const s = o.camina ? Math.sin(o.paso) : 0;
    cuerpo.position.y = o.sentado ? -0.42 : (o.camina ? Math.abs(s) * 0.04 : 0);
    piernas[0].rotation.z = o.sentado ? Math.PI / 2 : s * 0.55;
    piernas[1].rotation.z = o.sentado ? Math.PI / 2 : -s * 0.55;
    let b0 = -s * 0.45, b1 = s * 0.45;
    if (o.carga === 'caja') { b0 = b1 = 1.2; }
    else if (o.accion === 'recoger') { b0 = 1.9 + 0.5 * Math.sin(o.t); b1 = 1.9 + 0.5 * Math.sin(o.t + Math.PI); }
    else if (o.accion === 'empacar') { b0 = 1.15 + 0.25 * Math.sin(o.t * 1.6); b1 = 1.15 + 0.25 * Math.sin(o.t * 1.6 + Math.PI); }
    else if (o.telefono) { b0 = 1.25 + 0.15 * Math.sin(o.t); b1 = 1.25; }
    else if (o.come) { b0 = 0.9; b1 = 0.9 + 1.1 * Math.max(0, Math.sin(o.t)); }
    else if (o.carga === 'hoja') b1 = 0.9;
    brazos[0].rotation.z = b0; brazos[1].rotation.z = b1;
    cajaMano.visible = o.carga === 'caja';
    hoja.visible = o.carga === 'hoja';
  }

  /* --- Escena fija --- */
  const personas3 = [], mesas3 = [], camiones3 = [], hojas3 = new Map(), humo3 = [], pila3 = [];
  let vendedores3 = [], burbujas3 = [], letreroMas, anillo, ruta3, recogida3 = [], mesasDe = -1;
  const SLOT = (i) => { const c = i % 5, r = Math.floor(i / 5) % 4; return [X(244) + 0.07, [2.1, 1.75, 1.4, 1.05][r], Z(240 + c * 34)]; };
  const BANDEJA = [X(244) + 0.2, 0.84, Z(300)];
  const IMPRESORA = [X(216), 1.08, Z(112)];

  function muro(x1, y1, x2, y2, alto = 1.1) {
    const l = Math.hypot(x2 - x1, y2 - y1) / M, m = caja(x1 === x2 ? 0.12 : l, alto, x1 === x2 ? l : 0.12, mat(C.fondo));
    m.position.set(X((x1 + x2) / 2), alto / 2, Z((y1 + y2) / 2));
    m.userData.muro = true;
    return m;
  }
  function sala(r, huecos = []) {
    const { x, y, w, h } = r, g = new THREE.Group();
    const lados = [[x, y, x + w, y], [x, y + h, x + w, y + h], [x, y, x, y + h], [x + w, y, x + w, y + h]];
    lados.forEach(([x1, y1, x2, y2], i) => {
      const hueco = huecos.find((hh) => hh[0] === i);
      if (!hueco) { g.add(muro(x1, y1, x2, y2)); return; }
      const [, a, b] = hueco;                               // hueco de puerta entre a y b (px a lo largo del muro)
      if (y1 === y2) { g.add(muro(x1, y1, a, y2)); g.add(muro(b, y1, x2, y2)); }
      else { g.add(muro(x1, y1, x2, a)); g.add(muro(x1, b, x2, y2)); }
    });
    return g;
  }
  function silla(x, z, ang) {
    const g = new THREE.Group(), m = mat('#5b5f5c');
    g.add(caja(0.42, 0.05, 0.42, m, 0, 0.45, 0), caja(0.05, 0.45, 0.42, m, -0.2, 0.7, 0));
    [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(([a, b]) => g.add(caja(0.04, 0.45, 0.04, m, a, 0.22, b)));
    g.position.set(x, 0, z); g.rotation.y = -ang;
    return g;
  }

  function construir() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    contenedor.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Almacén en 3D: arrastra para girar, rueda o dos dedos para acercar');

    escena = new THREE.Scene();
    camara = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
    camara.position.set(-2, 17, 16);
    controles = new THREE.OrbitControls(camara, renderer.domElement);
    controles.target.set(0, 0, 0.5);
    Object.assign(controles, { enableDamping: true, dampingFactor: 0.08, minDistance: 3, maxDistance: 45, maxPolarAngle: 1.42, screenSpacePanning: false });
    controles.addEventListener('start', () => { tween = null; });

    cielo = new THREE.HemisphereLight('#ffffff', '#8a8f86', 0.62);
    sol = new THREE.DirectionalLight('#fff6e8', 0.75);
    sol.position.set(-10, 22, 12);
    sol.castShadow = true;
    Object.assign(sol.shadow.camera, { left: -20, right: 20, top: 14, bottom: -14, near: 1, far: 60 });
    sol.shadow.mapSize.set(pantallaChica.matches ? 1024 : 2048, pantallaChica.matches ? 1024 : 2048);
    sol.shadow.bias = -0.0005;
    sol.shadow.camera.updateProjectionMatrix();
    escena.add(cielo, sol);

    const c1 = document.createElement('canvas'); c1.width = 1432; c1.height = 1120;
    texPiso = new THREE.CanvasTexture(c1); texPiso.anisotropy = 8;
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(716 / M, 560 / M), new THREE.MeshLambertMaterial({ map: texPiso }));
    piso.rotation.x = -Math.PI / 2; piso.position.set(X(358), 0, Z(280)); piso.receiveShadow = true;
    const c2 = document.createElement('canvas'); c2.width = 1120; c2.height = 720;
    texPatio = new THREE.CanvasTexture(c2); texPatio.anisotropy = 8;
    const patio = new THREE.Mesh(new THREE.PlaneGeometry(1120 / M, 720 / M), new THREE.MeshLambertMaterial({ map: texPatio }));
    patio.rotation.x = -Math.PI / 2; patio.position.set(X(716 + 560), -0.01, Z(280)); patio.receiveShadow = true;
    escena.add(piso, patio);

    // Salas con muros bajos (cortados para ver adentro)
    const o = A.oficina, t = A.tablero, cm = A.comedor;
    escena.add(sala(o), sala({ x: t.x, y: t.y, w: t.w, h: t.h }, [[3, 222, 398]]), sala(cm, [[3, 482, 502]]));

    // Oficina de ventas: escritorio, monitores, teléfonos, impresora y dos vendedores sentados
    const [ex, ey, ew, eh] = o.escritorio;
    const mMadera = mat('#b48a5a'), mOscuro = mat('#2a2d30');
    escena.add(caja(ew / M, 0.05, eh / M, mMadera, X(ex + ew / 2), 0.75, Z(ey + eh / 2)));
    [[ex + 4, ey + 2], [ex + ew - 4, ey + 2], [ex + 4, ey + eh - 2], [ex + ew - 4, ey + eh - 2]]
      .forEach(([x, y]) => escena.add(caja(0.05, 0.73, 0.05, mOscuro, X(x), 0.37, Z(y))));
    const [ix, iy, iw, ih] = o.impresora;
    escena.add(caja(iw / M, 0.75, ih / M, mat('#8d9196'), X(ix + iw / 2), 0.375, Z(iy + ih / 2)));
    escena.add(caja(0.62, 0.3, 0.46, mat('#4a4e52'), X(ix + iw / 2), 0.9, Z(iy + ih / 2)));
    vendedores3 = o.vendedores.map(([vx, vy], i) => {
      escena.add(caja(0.5, 0.34, 0.05, mOscuro, X(vx), 0.95, Z(ey + 4)));   // monitor
      escena.add(caja(0.18, 0.06, 0.22, mOscuro, X(vx) + 0.45, 0.8, Z(ey + 10)));   // teléfono
      escena.add(silla(X(vx), Z(vy), -Math.PI / 2));
      const v = crearPersona({ ropa: '#2d5c88', piel: PIEL[(i + 3) % PIEL.length], pelo: PELO[(i + 2) % PELO.length] });
      v.position.set(X(vx), 0, Z(vy)); v.rotation.y = Math.PI / 2;
      escena.add(v);
      const globo = spriteTexto(' ', { fondo: '#141617' }, 0.38);
      globo.position.set(X(vx), 2.05, Z(vy)); globo.visible = false;
      escena.add(globo);
      return { v, globo };
    });

    // Tablero de pedidos pendientes (de corcho) y bandeja de hojas por recoger
    escena.add(caja(0.08, 2.0, (398 - 222) / M, mat('#b98d5d'), X(244), 1.4, Z(310)));
    escena.add(caja(0.1, 0.06, (398 - 222) / M + 0.1, mOscuro, X(244), 2.42, Z(310)));
    escena.add(caja(0.35, 0.04, 0.7, mat('#9aa0a6'), BANDEJA[0], 0.8, BANDEJA[2]));
    const { tex: texCartel, aspecto } = texturaTexto('Pedidos pendientes', { fondo: '#141617', tam: 40 });
    const cartel = new THREE.Mesh(new THREE.PlaneGeometry(0.3 * aspecto, 0.3), new THREE.MeshBasicMaterial({ map: texCartel, transparent: true }));
    cartel.position.set(X(244) + 0.07, 2.7, Z(310)); cartel.rotation.y = Math.PI / 2; escena.add(cartel);
    letreroMas = spriteTexto(' ', { fondo: C.rojo, tam: 34 }, 0.32);
    letreroMas.position.set(X(250), 2.38, Z(250)); letreroMas.visible = false; escena.add(letreroMas);

    // Comedor: mesa, sillas y platos
    const [mx, my, mw, mh] = cm.mesa;
    escena.add(caja(mw / M, 0.05, mh / M, mMadera, X(mx + mw / 2), 0.75, Z(my + mh / 2)));
    escena.add(caja(0.1, 0.72, 0.1, mOscuro, X(mx + mw / 2), 0.36, Z(my + mh / 2)));
    cm.asientos.forEach(([x, y, a]) => {
      escena.add(silla(X(x), Z(y), a));
      const plato = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.03, 16), mat('#f4f3ef'));
      plato.position.set(X(x + Math.cos(a) * 20), 0.79, Z(y + Math.sin(a) * 20)); escena.add(plato);
    });

    // Estantería: parantes, repisas y productos de colores (instanciados)
    const e = A.estantes, mAcero = mat('#5f7d99'), mRepisa = mat('#8f9aa3');
    const cajas = [];
    e.filas.forEach((y) => {
      const zc = Z(y + e.alto / 2), prof = e.alto / M;
      for (let i = 0; i <= 6; i++) {
        const x = X(e.x + (e.w * i) / 6);
        escena.add(caja(0.07, 2.1, 0.07, mAcero, x, 1.05, zc - prof / 2 + 0.03), caja(0.07, 2.1, 0.07, mAcero, x, 1.05, zc + prof / 2 - 0.03));
      }
      [0.12, 0.8, 1.48].forEach((h) => {
        escena.add(caja(e.w / M, 0.04, prof, mRepisa, X(e.x + e.w / 2), h, zc));
        for (let x = e.x + 6; x < e.x + e.w - 12; x += 13) cajas.push([X(x + 5), h, zc]);
      });
    });
    const rp = S.crearRng(31), inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.4, 0.4), new THREE.MeshLambertMaterial(), cajas.length);
    const mtx = new THREE.Matrix4(), col = new THREE.Color();
    let n = 0;
    cajas.forEach(([x, h, z]) => {
      if (rp() < 0.12) return;                              // hueco en la repisa
      const alto = 0.18 + rp() * 0.3;
      mtx.compose(new THREE.Vector3(x, h + 0.02 + alto / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, alto / 0.4, 1));
      inst.setMatrixAt(n, mtx); inst.setColorAt(n, col.set(PRODUCTOS[Math.floor(rp() * PRODUCTOS.length)])); n++;
    });
    inst.count = n; inst.castShadow = true; inst.receiveShadow = true;
    escena.add(inst);
    // Tres productos que saltan del estante a los brazos (uno por persona que recoge)
    for (let i = 0; i < 18; i++) { const m = caja(0.18, 0.18, 0.18, mat(PRODUCTOS[i % PRODUCTOS.length])); m.visible = false; recogida3.push(m); escena.add(m); }

    // Borde del andén con franjas de seguridad
    const cf = document.createElement('canvas'); cf.width = 64; cf.height = 64;
    const gf = cf.getContext('2d'); gf.fillStyle = '#1b1b1b'; gf.fillRect(0, 0, 64, 64);
    gf.strokeStyle = '#f2b705'; gf.lineWidth = 14;
    for (let i = -64; i < 128; i += 32) { gf.beginPath(); gf.moveTo(i, 0); gf.lineTo(i + 64, 64); gf.stroke(); }
    const texF = new THREE.CanvasTexture(cf); texF.wrapS = texF.wrapT = THREE.RepeatWrapping; texF.repeat.set(1, 30);
    const [fx, fy, fw, fh] = A.anden.franja;
    escena.add(caja(fw / M + 0.1, 0.14, fh / M, new THREE.MeshLambertMaterial({ map: texF }), X(fx + fw / 2), 0.07, Z(fy + fh / 2)));

    // Camiones baranda, uno por ruta
    A.anden.bahias.forEach((b, k) => {
      const g = crearCamion(k);
      escena.add(g); camiones3.push(g);
      for (let i = 0; i < 6; i++) {                         // cajas que esperan en el andén si su camión salió
        const m = caja(0.36, 0.3, 0.36, mat('#c19463'), X(b.pie[0]) - 0.15 - (i % 2) * 0.4, 0.15 + Math.floor(i / 2) * 0.3, Z(b.pie[1]) + 0.65);
        m.visible = false; pila3.push(m); escena.add(m);
      }
    });
    for (let i = 0; i < 50; i++) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: '#8a8f8c', transparent: true, opacity: 0, depthWrite: false }));
      h.visible = false; h.userData.vida = 0; humo3.push(h); escena.add(h);
    }

    // Foco: anillo bajo la persona elegida y su recorrido pendiente
    anillo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: '#2d5c88', transparent: true, opacity: 0.9 }));
    anillo.rotation.x = -Math.PI / 2; anillo.position.y = 0.02; anillo.visible = false;
    ruta3 = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: '#2d5c88', dashSize: 0.25, gapSize: 0.18 }));
    ruta3.visible = false; ruta3.frustumCulled = false;
    escena.add(anillo, ruta3);

    construirHud();
    aplicarTema();
    new ResizeObserver(redimensionar).observe(contenedor);
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(contenedor);
    eventosPuntero();
    redimensionar();
    listo = true;
  }

  function crearCamion(k) {
    const g = new THREE.Group(), mAzul = mat('#2d5c88'), mNegro = mat('#1b1b1b'), mBaranda = mat('#b48a5a'), mPiso = mat('#7a5a3a');
    g.add(caja(4.0, 0.14, 2.0, mPiso, 2.0, 0.95, 0));                       // plataforma
    g.add(caja(4.6, 0.25, 1.1, mNegro, 2.6, 0.72, 0));                      // chasis
    for (const z of [-0.97, 0.97]) {                                         // barandas laterales
      for (let i = 0; i < 3; i++) g.add(caja(4.0, 0.08, 0.06, mBaranda, 2.0, 1.12 + i * 0.2, z));
      for (let x = 0.05; x <= 4.0; x += 0.98) g.add(caja(0.08, 0.62, 0.08, mBaranda, x, 1.3, z));
    }
    g.add(caja(0.08, 0.62, 2.0, mBaranda, 3.98, 1.3, 0));                    // baranda delantera
    const compuerta = new THREE.Group();                                      // compuerta trasera con bisagra abajo
    compuerta.position.set(0, 1.02, 0);
    compuerta.add(caja(0.07, 0.6, 2.0, mBaranda, 0, 0.3, 0));
    g.add(compuerta);
    g.add(caja(1.6, 1.5, 1.95, mAzul, 4.95, 1.55, 0));                       // cabina
    g.add(caja(0.04, 0.6, 1.6, new THREE.MeshLambertMaterial({ color: '#cfe3f2', emissive: '#1d2a33' }), 5.76, 1.95, 0));   // parabrisas
    g.add(caja(0.1, 0.9, 0.1, mat('#8d9196'), 4.12, 2.3, -0.75));             // escape
    const ruedas = [];
    for (const x of [0.8, 3.0, 5.1]) for (const z of [-0.95, 0.95]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 14), mNegro);
      r.rotation.x = Math.PI / 2; r.position.set(x, 0.42, z); r.castShadow = true;
      g.add(r); ruedas.push(r);
    }
    const carga = [];
    for (let i = 0; i < CARGA_VIAJE; i++) {
      const m = caja(0.95, 0.6, 0.8, mat('#c19463'), 0.6 + (i % 3) * 1.25, 1.32, Math.floor(i / 3) ? 0.45 : -0.45);
      m.visible = false; g.add(m); carga.push(m);
    }
    const letrero = spriteTexto(' ', { fondo: '#141617', tam: 34 }, 0.36);
    letrero.position.set(4.9, 2.85, 0); g.add(letrero);
    g.userData = { compuerta, ruedas, carga, letrero, giro: 0, humoT: 0 };
    return g;
  }

  /* --- HUD: reloj, avisos y ficha encima del 3D --- */
  let hud = {};
  function construirHud() {
    const d = document.createElement('div');
    d.className = 'hud3d';
    d.innerHTML = `<div class="reloj3d"><b data-h="hora">08:00</b><span><span data-h="l1"></span><span data-h="l2"></span></span></div>
      <div class="avisos3d"><p data-h="a0"></p><p data-h="a1"></p></div>
      <div class="ficha3d" data-h="ficha" hidden></div>`;
    contenedor.append(d);
    d.querySelectorAll('[data-h]').forEach((el) => { hud[el.dataset.h] = el; });
  }
  const texto = (el, t) => { if (el.textContent !== t) el.textContent = t; };
  function pintarHud() {
    texto(hud.hora, reloj(dia.t));
    const h = Math.min(9, Math.floor(dia.t / 60));
    texto(hud.l1, dia.t >= 600 ? 'Horas extra: se despacha lo pendiente' : `Llegan ~${(S.LAMBDA[h] * (1 + estado.crec / 100)).toFixed(1)} pedidos por hora`);
    texto(hud.l2, `${dia.cola.length} pendiente${dia.cola.length === 1 ? '' : 's'} en el tablero`);
    [hud.a0, hud.a1].forEach((el, i) => {
      const a = dia.avisos[i];
      if (!a) { el.style.opacity = 0; return; }
      texto(el, a.texto);
      el.classList.toggle('malo', a.malo);
      const entra = Math.min(1, (2.6 - a.vida) / 0.3), sale = Math.min(1, a.vida / 0.5);
      el.style.opacity = Math.min(entra, sale);
      el.style.transform = `translateY(${reducirMovimiento ? 0 : -10 * (1 - suave(entra))}px)`;
    });
  }

  /* --- Cámara: libre (OrbitControls) y vistas rápidas con transición suave --- */
  // En el teléfono (pantalla vertical) la vista general mira desde un costado, con el lado largo hacia arriba
  const VISTAS = {
    general: { pos: [-2, 17, 16], obj: [0, 0, 0.5], vertical: { pos: [-14.5, 16.5, 1], obj: [1.5, 0, 0] } },
    ventas: { pos: [-2.2, 4.4, 1.2], obj: [-7.4, 1.0, -1.6] },
    estantes: { pos: [-5.3, 3.1, -1.375], obj: [2, 0.7, -1.375] },
    anden: { pos: [0.5, 7.5, 9], obj: [8, 0.5, -0.2], vertical: { pos: [-1.5, 11, 3], obj: [7.5, 0.5, -0.2] } },
  };
  const vista = (nombre) => { const v = VISTAS[nombre]; return v && ancho < alto && v.vertical ? v.vertical : v; };
  let tween = null, siguiendo = null, ultimoFoco = null;
  function irVista(nombre) {
    siguiendo = nombre === 'seguir' ? (dia.sel ?? 0) : null;
    if (siguiendo !== null) dia.sel = siguiendo;
    const v = vista(nombre) || null;
    const destino = v ? { pos: new THREE.Vector3(...v.pos), obj: new THREE.Vector3(...v.obj) } : destinoSeguir();
    if (reducirMovimiento) { camara.position.copy(destino.pos); controles.target.copy(destino.obj); tween = null; return; }
    tween = { t: 0, p0: camara.position.clone(), o0: controles.target.clone(), destino };
  }
  function destinoSeguir() {
    const g = personas3[siguiendo], obj = g ? g.position.clone().setY(0.9) : new THREE.Vector3();
    return { pos: obj.clone().add(new THREE.Vector3(-3.2, 3.6, 3.6)), obj };
  }
  function moverCamara(dt) {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 0.9);
      if (siguiendo !== null) tween.destino = destinoSeguir();
      const e = suave(tween.t);
      camara.position.lerpVectors(tween.p0, tween.destino.pos, e);
      controles.target.lerpVectors(tween.o0, tween.destino.obj, e);
      if (tween.t >= 1) tween = null;
    } else if (siguiendo !== null && personas3[siguiendo]) {
      // Sigue a la persona: corre cámara y centro juntos, así el usuario puede seguir girando alrededor
      const obj = personas3[siguiendo].position.clone().setY(0.9), d = obj.sub(controles.target).multiplyScalar(reducirMovimiento ? 1 : 1 - Math.exp(-dt * 6));
      controles.target.add(d); camara.position.add(d);
    }
    controles.target.x = Math.max(-13, Math.min(16, controles.target.x));
    controles.target.z = Math.max(-8, Math.min(8, controles.target.z));
    controles.update();
  }

  /* --- Selección: tocar o pasar el mouse sobre un despachador --- */
  function personaEnPantalla(e) {
    const r = renderer.domElement.getBoundingClientRect(), v = new THREE.Vector3();
    let elegida = null, dmin = 30;
    personas3.forEach((g, k) => {
      if (!g.visible) return;
      v.copy(g.position).setY(1.2).project(camara);
      const d = Math.hypot((v.x + 1) / 2 * r.width - (e.clientX - r.left), (1 - v.y) / 2 * r.height - (e.clientY - r.top));
      if (d < dmin) { dmin = d; elegida = k; }
    });
    return elegida;
  }
  function eventosPuntero() {
    const el = renderer.domElement;
    let inicio = null;
    el.addEventListener('pointerdown', (e) => { inicio = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', (e) => {
      if (!inicio || Math.hypot(e.clientX - inicio[0], e.clientY - inicio[1]) > 6) return;
      const k = personaEnPantalla(e);
      dia.sel = k === dia.sel ? null : k;
      if (siguiendo !== null && k !== null) siguiendo = k;   // al seguir, tocar a otro cambia a quién sigue
      pintarBotonSeguir();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      dia.hover = personaEnPantalla(e);
      el.style.cursor = dia.hover === null ? 'grab' : 'pointer';
    });
    el.addEventListener('pointerleave', () => { dia.hover = null; });
  }
  function pintarBotonSeguir() {
    const b = document.querySelector('#camaras [data-cam="seguir"]');
    if (b) b.textContent = `Seguir a D${(dia.sel ?? siguiendo ?? 0) + 1}`;
  }

  /* --- Tema y tamaño --- */
  function aplicarTema() {
    const clave = C.suelo + C.fondo;
    if (clave === temaActual) return;
    temaActual = clave;
    const oscuro = esOscuro();
    escena.background = new THREE.Color(cssVar('--marco') || C.suelo);
    escena.fog = new THREE.Fog(escena.background, 34, 70);
    escena.traverse((o) => { if (o.userData.muro) o.material = mat(oscuro ? '#2c2f32' : '#f1f0eb'); });
    pintarPiso(); pintarPatio();
  }
  function redimensionar() {
    const w = contenedor.clientWidth;
    if (!w) return;
    const h = Math.round(Math.max(360, w * (w < 700 ? 1.3 : 0.58)));
    if (w === ancho && h === alto) return;
    const primera = !ancho;
    ancho = w; alto = h;
    renderer.setSize(w, h);
    camara.aspect = w / h;
    camara.fov = w < 700 ? 55 : 42;
    camara.updateProjectionMatrix();
    if (primera) { const v = vista('general'); camara.position.set(...v.pos); controles.target.set(...v.obj); }
  }

  /* --- Cuadro a cuadro: copia el estado de `dia` a la escena --- */
  const v3 = new THREE.Vector3();
  function sincronizarPersonas() {
    while (personas3.length < dia.personas.length) {
      const k = personas3.length;
      const g = crearPersona({ ropa: '#ec7a1c', piel: PIEL[k % PIEL.length], pelo: PELO[k % PELO.length], chaleco: true });
      const et = spriteTexto(`D${k + 1}`, { fondo: '#2d5c88', tam: 36 }, 0.3);
      et.position.y = 2.05; g.add(et); g.userData.etiqueta = et;
      escena.add(g); personas3.push(g);
    }
    let r = 0;
    personas3.forEach((g, k) => {
      const per = dia.personas[k];
      g.visible = !!per;
      if (!per) return;
      const tr = per.trabajo, tramo = tr && tr.tramos[tr.fase];
      const sentado = !per.activo && !per.ruta.length && per.lugar.sentado;
      const libre = per.activo && !tr && !per.ruta.length;
      g.position.set(X(per.x), 0, Z(per.y));
      g.rotation.y = -(per.angVis + (libre ? 0.4 * Math.sin(dia.t * 0.2 + k * 1.7) : 0));
      const accion = tramo && (tramo.tipo === 'recoger' || tramo.tipo === 'empacar') ? tramo.tipo : null;
      posar(g, { camina: per.camina, paso: per.paso, carga: per.carga, accion, sentado, come: sentado, t: sentado ? dia.t * 0.7 + k : dia.t * 1.4 });
      ponerTexto(g.userData.etiqueta, `D${k + 1}`, { fondo: per.activo || tr ? '#2d5c88' : '#5b5f5c', tam: 36 });
      g.userData.etiqueta.visible = !sentado;
      // Productos que saltan del estante (a la altura de las repisas) a los brazos
      if (accion === 'recoger') {
        const f = Math.min(1, (dia.t - tramo.t0) / Math.max(1e-6, tramo.t1 - tramo.t0)), a = per.angVis;
        const s0 = new THREE.Vector3(X(per.x + Math.cos(a) * 30), 1.15, Z(per.y + Math.sin(a) * 30));
        const m0 = new THREE.Vector3(X(per.x + Math.cos(a) * 12), 1.05, Z(per.y + Math.sin(a) * 12));
        for (let i = 0; i < 3 && r < recogida3.length; i++) {
          const g2 = (f - (0.1 + i * 0.28)) / 0.22, m = recogida3[r++];
          m.visible = g2 > 0;
          if (g2 >= 1) m.position.copy(m0).add(new THREE.Vector3(0, i * 0.19, 0));
          else if (g2 > 0) { const q = suave(g2); m.position.lerpVectors(s0, m0, q); m.position.y += Math.sin(q * Math.PI) * 0.35; }
          m.material = mat(PRODUCTOS[(tr.id + i) % PRODUCTOS.length]);
        }
      }
    });
    for (; r < recogida3.length; r++) recogida3[r].visible = false;
    // Vendedores: el que tiene un aviso habla por teléfono y se mueve un poco
    vendedores3.forEach(({ v, globo }, i) => {
      const b = dia.burbujas.find((x) => x.v === i);
      posar(v, { sentado: true, telefono: true, habla: !!b, t: performance.now() / 300 + i });
      v.rotation.y = Math.PI / 2 + (b && !reducirMovimiento ? 0.15 * Math.sin(performance.now() / 120) : 0);
      globo.visible = !!b;
      if (b) {
        ponerTexto(globo, b.texto, { fondo: b.malo ? C.rojo : '#141617', tam: 34 });
        globo.material.opacity = Math.min(1, b.vida * 2);
      }
    });
  }

  function sincronizarMesas() {
    if (mesasDe !== dia.cap) {
      mesas3.forEach((m) => escena.remove(m.g)); mesas3.length = 0;
      for (let k = 0; k < dia.cap; k++) {
        const r = mesaRect(k), g = new THREE.Group(), w = r.w / M, d = r.h / M;
        g.add(caja(w, 0.06, d, mat('#d9d5cc'), 0, 0.9, 0));
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => g.add(caja(0.05, 0.88, 0.05, mat('#5b5f5c'), a * (w / 2 - 0.06), 0.44, b * (d / 2 - 0.06))));
        const et = spriteTexto(`D${k + 1}`, { fondo: null, color: '#5b5f5c', tam: 36 }, 0.22);
        et.position.set(-w / 2 + 0.2, 1.1, 0); g.add(et);
        // La caja que se arma: base, cuatro solapas con bisagra arriba, cinta y un visto al terminar
        const armado = new THREE.Group(); armado.position.y = 0.93; g.add(armado);
        armado.add(caja(0.42, 0.34, 0.42, mat('#c19463'), 0, 0.17, 0));
        const solapas = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dz]) => {
          const s = new THREE.Group(); s.position.set(dx * 0.21, 0.34, dz * 0.21);
          s.add(caja(dx ? 0.02 : 0.42, 0.2, dz ? 0.02 : 0.42, mat('#cfa673'), 0, 0.1, 0));
          s.userData = { dx, dz }; armado.add(s); return s;
        });
        const cinta = caja(0.06, 0.012, 0.44, mat('#efe9dc'), 0, 0.348, 0, false);
        const visto = spriteTexto('✓', { fondo: C.verde, tam: 40 }, 0.26);
        visto.position.set(0.3, 0.55, 0);
        armado.add(cinta, visto);
        g.position.set(X(r.x + r.w / 2), 0, Z(r.y + r.h / 2));
        escena.add(g);
        mesas3.push({ g, armado, solapas, cinta, visto });
      }
      mesasDe = dia.cap;
    }
    mesas3.forEach((m, k) => {
      const per = dia.personas[k], tr = per && per.trabajo, tramo = tr && tr.tramos[tr.fase];
      m.armado.visible = !!tramo && tramo.tipo === 'empacar';
      if (!m.armado.visible) return;
      const f = Math.min(1, (dia.t - tramo.t0) / Math.max(1e-6, tramo.t1 - tramo.t0)), cierre = Math.min(1, f / 0.55);
      // Abiertas: inclinadas hacia afuera; cerradas: tumbadas sobre la caja
      m.solapas.forEach((s) => {
        const ang = -0.5 + (Math.PI / 2 + 0.5) * suave(cierre);
        s.rotation.set(s.userData.dz * -ang, 0, s.userData.dx * ang);
      });
      m.cinta.visible = f > 0.6;
      m.cinta.scale.z = Math.max(0.01, Math.min(1, (f - 0.6) / 0.25));
      m.visto.visible = f > 0.9;
    });
  }

  function sincronizarHojas(dt) {
    const k = reducirMovimiento ? 1 : 1 - Math.exp(-dt * 7);
    for (const [id, m] of hojas3) {
      if (dia.pedidos.has(id)) continue;
      escena.remove(m); hojas3.delete(id);
      m.traverse((o) => { o.geometry.dispose(); o.material.dispose(); });
    }
    let enBandeja = 0;
    for (const [id, p] of dia.pedidos) {
      let m = hojas3.get(id);
      if (!m) {
        m = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), new THREE.MeshBasicMaterial({ color: '#fbfaf6', side: THREE.DoubleSide, transparent: true }));
        const barra = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.035), new THREE.MeshBasicMaterial({ color: C.seguridad, side: THREE.DoubleSide }));
        barra.position.set(0, -0.18, 0.001); m.add(barra);
        [-0.06, -0.02, 0.02, 0.06].forEach((y) => { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.012), new THREE.MeshBasicMaterial({ color: '#9a9a96', side: THREE.DoubleSide })); l.position.set(-0.01, y, 0.001); m.add(l); });
        m.userData.barra = barra;
        m.position.set(...IMPRESORA);
        escena.add(m); hojas3.set(id, m);
      }
      const destino = new THREE.Vector3(), rot = new THREE.Euler(0, Math.PI / 2, 0);
      if (p.nace > 0) destino.set(IMPRESORA[0], IMPRESORA[1] + 0.25 * (1 - p.nace / 0.45), IMPRESORA[2]);
      else if (p.estado === 'cola') destino.set(...SLOT(Math.min(19, dia.cola.indexOf(id))));
      else if (p.estado === 'asignado') { destino.set(BANDEJA[0], BANDEJA[1] + 0.03 + 0.01 * enBandeja++, BANDEJA[2]); rot.set(-Math.PI / 2, 0, 0); }
      else if (p.estado === 'tomando') {
        const per = dia.personas[p.est], tramo = per.trabajo && per.trabajo.tramos[1];
        const f = tramo ? suave(Math.min(1, (dia.t - tramo.t0) / Math.max(1e-6, tramo.t1 - tramo.t0))) : 1;
        destino.set(X(per.x + Math.cos(per.angVis) * 12), 1.0, Z(per.y + Math.sin(per.angVis) * 12));
        destino.lerpVectors(new THREE.Vector3(BANDEJA[0], BANDEJA[1] + 0.03, BANDEJA[2]), destino, f);
        m.position.copy(destino); m.rotation.set(-Math.PI / 2 + f * 0.5, 0, 0); m.scale.setScalar(1 - 0.3 * f);
        continue;
      } else if (p.estado === 'cancelado') {
        m.position.y = Math.max(0.05, m.position.y - dt * 0.8); m.rotation.z += dt * 6; m.scale.setScalar(Math.max(0.2, p.alfa));
        m.material.opacity = Math.max(0, p.alfa);
        m.material.color.set(C.rojo);
        continue;
      }
      // Vuela con un arco hacia su lugar
      const d = m.position.distanceTo(destino);
      m.position.lerp(destino, k);
      if (d > 0.3 && !reducirMovimiento) m.position.y += Math.min(0.08, d * 0.02);
      m.quaternion.slerp(new THREE.Quaternion().setFromEuler(rot), k);   // gira de a poco hasta quedar plana en su lugar
      m.scale.setScalar(p.nace > 0 ? 0.6 : 1);
      const espera = Math.min(1, (dia.t - p.llegada) / estado.T);
      m.userData.barra.visible = p.estado === 'cola' && !(p.nace > 0);
      m.userData.barra.scale.x = Math.max(0.01, espera);
      m.userData.barra.position.x = -0.105 * (1 - espera);
      m.userData.barra.material.color.set(espera >= 1 ? C.rojo : C.seguridad);
      m.material.color.set(p.perdio ? '#f6c9c5' : '#fbfaf6');
      if (p.sacude > 0 && !reducirMovimiento) m.position.z += Math.sin(p.sacude * 60) * 0.03 * p.sacude;
    }
    const fuera = dia.cola.length - 20;
    letreroMas.visible = fuera > 0;
    if (fuera > 0) ponerTexto(letreroMas, `+${fuera} más`, { fondo: C.rojo, tam: 34 });
  }

  function sincronizarCamiones(dt) {
    dia.flota.forEach((c, k) => {
      const g = camiones3[k], u = g.userData, b = A.anden.bahias[k];
      const lejos = (c.d / M) * 3.2;                        // en 3D el camión se aleja más por el patio
      const x = X(b.camion[0]) + lejos;
      u.giro += (x - g.position.x) / 0.42;
      g.position.set(x, 0, Z(b.camion[1]));
      u.ruedas.forEach((r) => { r.rotation.y = -u.giro; });
      u.compuerta.rotation.z = (Math.PI / 2) * c.puerta;
      const n = c.fase === 'volviendo' ? 0 : Math.min(c.carga, CARGA_VIAJE);
      u.carga.forEach((m, i) => { m.visible = i < n; m.scale.setScalar(i === n - 1 ? 1 + 0.35 * c.pop : 1); });
      ponerTexto(u.letrero, c.fase === 'anden' ? `Ruta ${k + 1} · ${n} de ${CARGA_VIAJE}` : `Ruta ${k + 1} · en camino`, { fondo: '#141617', tam: 34 });
      const enPiso = c.carga - (c.fase === 'volviendo' ? 0 : n);
      for (let i = 0; i < 6; i++) pila3[k * 6 + i].visible = i < enPiso;
      // Humo del escape al arrancar
      u.humoT -= dt;
      if (c.fase === 'saliendo' && u.humoT <= 0 && !reducirMovimiento) {
        u.humoT = 0.05;
        const h = humo3.find((q) => q.userData.vida <= 0);
        if (h) {
          h.position.set(x + 4.12, 2.8, g.position.z - 0.75);
          h.userData = { vida: 1.1, v: new THREE.Vector3(-0.6 + Math.random() * 0.3, 0.8, (Math.random() - 0.5) * 0.4) };
          h.visible = true;
        }
      }
    });
    humo3.forEach((h) => {
      if (h.userData.vida <= 0) { h.visible = false; return; }
      h.userData.vida -= dt;
      h.position.addScaledVector(h.userData.v, dt);
      h.scale.setScalar(1 + (1.1 - h.userData.vida) * 2.5);
      h.material.opacity = Math.max(0, h.userData.vida / 1.1) * 0.4;
    });
  }

  function sincronizarFoco() {
    const foco = dia.hover ?? dia.sel;
    const g = foco !== null ? personas3[foco] : null, per = foco !== null ? dia.personas[foco] : null;
    anillo.visible = ruta3.visible = !!(g && per);
    if (!anillo.visible) { hud.ficha.hidden = true; ultimoFoco = null; return; }
    anillo.position.set(g.position.x, 0.02, g.position.z);
    const pts = rutaPendiente(per).map(([x, y]) => new THREE.Vector3(X(x), 0.04, Z(y)));
    if (pts.length > 1) { ruta3.geometry.setFromPoints(pts); ruta3.computeLineDistances(); ruta3.visible = true; } else ruta3.visible = false;
    // Ficha HTML junto a la persona
    const lineas = [`D${foco + 1} · ${per.activo || per.trabajo ? 'en turno' : 'fuera de turno'}`, ...queHace(per),
      `Despachó ${per.despachados} pedido${per.despachados === 1 ? '' : 's'} hoy`];
    const html = lineas.map((l, i) => (i ? `<span>${l}</span>` : `<b>${l}</b>`)).join('');
    if (hud.ficha.innerHTML !== html) hud.ficha.innerHTML = html;
    hud.ficha.hidden = false;
    v3.copy(g.position).setY(2.2).project(camara);
    const x = ((v3.x + 1) / 2) * ancho, y = ((1 - v3.y) / 2) * alto;
    const fw = hud.ficha.offsetWidth, fh = hud.ficha.offsetHeight;
    hud.ficha.style.left = `${Math.max(6, Math.min(ancho - fw - 6, x + 16))}px`;
    hud.ficha.style.top = `${Math.max(6, Math.min(alto - fh - 6, y - fh - 8))}px`;
    ultimoFoco = foco;
  }

  function iluminar() {
    // Después de las 18:00 baja la luz (horas extra)
    const noche = dia.t > S.CIERRE ? Math.min(1, (dia.t - S.CIERRE) / 20) : 0;
    sol.intensity = 0.75 - 0.5 * noche;
    cielo.intensity = 0.62 - 0.3 * noche;
    cielo.color.setRGB(1 - 0.35 * noche, 1 - 0.25 * noche, 1);
  }

  function cuadro(dt) {
    if (!listo) construir();
    if (!visible || !ancho) return;
    aplicarTema();
    sincronizarPersonas();
    sincronizarMesas();
    sincronizarHojas(dt);
    sincronizarCamiones(dt);
    sincronizarFoco();
    iluminar();
    moverCamara(dt);
    pintarHud();
    renderer.render(escena, camara);
  }

  return { ok: true, cuadro, irVista, pintarBotonSeguir, activar: () => { if (!listo) construir(); redimensionar(); } };
})();
