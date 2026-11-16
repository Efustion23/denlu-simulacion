// Demostración interactiva: una cola M/M/c en vivo para la hora y la cantidad de despachadores elegidas.
// Los pedidos llegan como un proceso de Poisson con la λ real de esa hora (Denlu.ipynb) y cada despachador tarda
// un tiempo exponencial de media 44.5 min. Al lado, los valores teóricos de largo plazo (M/M/c).
const DemoCola = (() => {
  const lienzo = $('demoLienzo'), g = lienzo.getContext('2d');
  const MIN_POR_SEG = 4;                                     // 1 s real = 4 min simulados
  const VENTANA = 180;                                       // minutos que muestra la curva de la cola
  let hora = N.rho.indexOf(Math.max(...N.rho)), c = 3, corriendo = false, visible = false, ultimo = null;
  let sim, rng, semilla = 1, ancho = 0, alto = 0;

  const exp = (media) => -Math.log(1 - rng()) * media;
  function reiniciar() {
    rng = S.crearRng(7717 * semilla++ + hora * 31 + c);
    sim = { t: 0, prox: exp(60 / S.LAMBDA[hora]), cola: [], est: Array.from({ length: c }, () => null), salen: [],
      llegados: 0, iniciados: 0, esperaron: 0, espera: 0, max: 0, serie: [], minuto: -1 };
    pintarTeoria();
    pintarVivo();
  }
  function asignar() {
    sim.est.forEach((e, k) => {
      if (e || !sim.cola.length) return;
      const p = sim.cola.shift(), w = sim.t - p.llegada;
      sim.est[k] = { ...p, inicio: sim.t, dur: exp(S.MU_MIN) };
      sim.iniciados++; sim.espera += w;
      if (w > 1e-6) sim.esperaron++;
    });
  }
  // Avanza la simulación de eventos discretos hasta `hasta` (min)
  function avanzar(hasta) {
    for (;;) {
      let k = -1, fin = Infinity;
      sim.est.forEach((e, i) => { if (e && e.inicio + e.dur < fin) { fin = e.inicio + e.dur; k = i; } });
      const t1 = Math.min(sim.prox, fin);
      if (t1 > hasta) break;
      sim.t = t1;
      if (t1 === sim.prox) {
        sim.cola.push({ llegada: t1, x: -24, y: null });
        sim.llegados++;
        sim.prox = t1 + exp(60 / S.LAMBDA[hora]);
      } else {
        const e = sim.est[k];
        sim.salen.push({ x: e.x, y: e.y, vida: 1 });
        sim.est[k] = null;
      }
      asignar();
      sim.max = Math.max(sim.max, sim.cola.length);
    }
    sim.t = hasta;
    while (sim.minuto < Math.floor(hasta)) sim.serie.push(sim.cola.length), sim.minuto++;
    if (sim.serie.length > VENTANA) sim.serie.splice(0, sim.serie.length - VENTANA);
  }

  /* --- Panel teórico y contadores --- */
  function pintarTeoria() {
    const m = S.mmc(S.LAMBDA[hora], c), h = horaTexto(S.HORAS[hora]);
    $('demoC').textContent = c;
    $('demoTitulo').innerHTML = `${h} · llegan <strong>${numero(S.LAMBDA[hora], 2)}</strong> pedidos/h · ${c} despachador${c > 1 ? 'es' : ''} atienden <strong>${numero(c * S.MU_H, 2)}</strong>/h`;
    $('tRho').textContent = m.estable ? numero(m.rho, 3) : `${numero(m.rho, 2)} ≥ 1`;
    $('tPw').textContent = `${numero(100 * m.Pw, 0)} %`;
    $('tLq').textContent = m.estable ? numero(m.Lq, 2) : '∞';
    $('tWq').textContent = minutos(m.Wq);
    const v = $('demoVeredicto');
    v.className = `demo-veredicto ${!m.estable ? 'mal' : m.Wq > 30 ? 'mal' : m.Wq > S.WQ_MAX ? 'medio' : 'ok'}`;
    v.textContent = !m.estable
      ? `Llegan más pedidos de los que se pueden atender: la cola crece sin límite.`
      : m.Wq > 30
        ? `ρ = ${numero(m.rho, 2)}: el ${numero(100 * m.Pw, 0)} % de los pedidos tiene que esperar y, a la larga, la espera media sería de ${minutos(m.Wq)}. La cola se forma.`
        : m.Wq > S.WQ_MAX
          ? `Se forma cola con frecuencia: espera media de ${minutos(m.Wq)} a la larga.`
          : `La cola casi no se forma: espera media de ${minutos(m.Wq)}.`;
    document.querySelectorAll('#demoHoras button').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.i) === hora));
  }
  function pintarVivo() {
    $('sCola').textContent = sim.cola.length;
    $('sEsperaron').textContent = sim.iniciados ? `${numero((100 * sim.esperaron) / sim.iniciados, 0)} %` : '–';
    $('sEspera').textContent = sim.iniciados ? minutos(sim.espera / sim.iniciados) : '–';
    $('sMax').textContent = sim.max;
  }

  /* --- Dibujo --- */
  function medir() {
    const w = lienzo.parentElement.clientWidth;
    if (!w) return false;
    const h = w < 520 ? 300 : 260;
    if (w !== ancho || h !== alto) {
      ancho = w; alto = h;
      const dpr = window.devicePixelRatio || 1;
      lienzo.width = w * dpr; lienzo.height = h * dpr; lienzo.style.height = `${h}px`;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return true;
  }
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  function dibujar(dt) {
    const k = reducirMovimiento ? 1 : 1 - Math.exp(-dt * 10);
    const angosto = ancho < 520, xEst = ancho - (angosto ? 112 : 170), anchoEst = angosto ? 92 : 132;
    const altoCurva = 64, zona = alto - altoCurva - 16;
    g.clearRect(0, 0, ancho, alto);
    g.fillStyle = C.suelo; g.fillRect(0, 0, ancho, alto);

    // Despachadores (puestos) en columna, centrados en la zona superior
    const hEst = Math.min(34, (zona - 20) / c), y0 = 10 + (zona - 20 - hEst * c) / 2;
    sim.est.forEach((e, i) => {
      const y = y0 + i * hEst;
      rr(xEst, y + 2, anchoEst, hEst - 4, 6);
      g.fillStyle = e ? C.fondo : C.panel; g.fill();
      g.strokeStyle = e ? C.acero : C.control; g.lineWidth = e ? 1.6 : 1; g.stroke();
      g.fillStyle = e ? C.tinta : C['tinta-2']; g.font = `500 ${angosto ? 11 : 12}px Barlow, sans-serif`; g.textBaseline = 'middle';
      g.fillText(angosto ? `D${i + 1}` : `Despachador ${i + 1}`, xEst + 10, y + hEst / 2);
      if (e) {
        const tx = xEst + anchoEst - 18, ty = y + hEst / 2;
        e.x = e.x ?? tx; e.y = e.y ?? ty;
        e.x += (tx - e.x) * k; e.y += (ty - e.y) * k;
        const f = Math.min(1, (sim.t - e.inicio) / e.dur), r = Math.min(10, hEst / 2 - 4);
        g.strokeStyle = C.linea; g.lineWidth = 3; g.beginPath(); g.arc(tx, ty, r, 0, 2 * Math.PI); g.stroke();
        g.strokeStyle = C.acero; g.beginPath(); g.arc(tx, ty, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * f); g.stroke();
        caja(e.x - 6, e.y - 6, 12, null);
      }
    });

    // La cola: una fila hacia la izquierda desde los despachadores (y una segunda fila si no alcanza)
    const paso = angosto ? 20 : 24, porFila = Math.max(4, Math.floor((xEst - 50) / paso)), yCola = zona / 2;
    g.fillStyle = C.fondo; g.globalAlpha = 0.6; rr(24, yCola - 16, xEst - 34, 32, 8); g.fill(); g.globalAlpha = 1;
    g.fillStyle = C.seguridad; g.beginPath(); g.moveTo(6, yCola - 9); g.lineTo(18, yCola); g.lineTo(6, yCola + 9); g.fill();
    sim.cola.forEach((p, i) => {
      const fila = Math.floor(i / porFila), tx = xEst - 26 - (i % porFila) * paso, ty = yCola + (fila ? (fila % 2 ? 26 : -26) * Math.ceil(fila / 2) : 0);
      if (p.y === null) p.y = ty;
      p.x += (tx - p.x) * k; p.y += (ty - p.y) * k;
      if (i < porFila * 3) caja(p.x - 8, p.y - 8, 16, (sim.t - p.llegada) / 30);
    });
    if (sim.cola.length > porFila * 3) {
      g.fillStyle = C.rojo; g.font = '600 12px Barlow, sans-serif'; g.textBaseline = 'alphabetic';
      g.fillText(`+${sim.cola.length - porFila * 3}`, 26, yCola - 50);
    }
    // Pedidos que salen ya preparados
    sim.salen.forEach((s) => { s.x += dt * 160; s.vida -= dt * 1.4; g.globalAlpha = Math.max(0, s.vida); caja(s.x - 6, s.y - 6, 12, null); g.globalAlpha = 1; });
    sim.salen = sim.salen.filter((s) => s.vida > 0);
    g.fillStyle = C['tinta-2']; g.font = `500 ${angosto ? 11 : 12}px Barlow, sans-serif`; g.textBaseline = 'alphabetic';
    g.fillText(`En cola: ${sim.cola.length}`, 26, yCola - 22);
    g.textAlign = 'right'; g.fillText(`Ritmo de las ${S.HORAS[hora]}h · ${numero(sim.t / 60, 1)} h simuladas`, ancho - 8, 12); g.textAlign = 'left';

    // Curva: pedidos en cola en los últimos 180 min simulados
    const yb = alto - 10, maxY = Math.max(5, ...sim.serie);
    g.strokeStyle = C.linea; g.lineWidth = 1; g.beginPath(); g.moveTo(10, yb + 0.5); g.lineTo(ancho - 10, yb + 0.5); g.stroke();
    if (sim.serie.length > 1) {
      g.beginPath();
      sim.serie.forEach((q, i) => {
        const x = 10 + ((ancho - 20) * i) / (VENTANA - 1), y = yb - (altoCurva - 8) * (q / maxY);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.strokeStyle = C['carton-borde']; g.lineWidth = 2; g.stroke();
      g.lineTo(10 + ((ancho - 20) * (sim.serie.length - 1)) / (VENTANA - 1), yb); g.lineTo(10, yb); g.closePath();
      g.fillStyle = C.carton; g.globalAlpha = 0.3; g.fill(); g.globalAlpha = 1;
    }
    g.fillStyle = C['tinta-2']; g.font = '500 11px Barlow, sans-serif';
    g.fillText(`Pedidos en cola, últimos ${VENTANA} min (máx. ${maxY})`, 12, yb - altoCurva + 4);
  }
  // Un pedido: caja de cartón; la barra de abajo muestra cuánto lleva esperando (roja desde 30 min)
  function caja(x, y, l, espera) {
    rr(x, y, l, l, 3); g.fillStyle = C.carton; g.fill(); g.strokeStyle = C['carton-borde']; g.lineWidth = 1; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + l / 2 - 1.5, y + 1, 3, l - 2);
    if (espera !== null) {
      const f = Math.min(1, espera);
      g.fillStyle = C.linea; g.fillRect(x, y + l + 2, l, 3);
      g.fillStyle = f >= 1 ? C.rojo : C.seguridad; g.fillRect(x, y + l + 2, l * f, 3);
    }
  }

  function cuadroDemo(ms) {
    const dt = ultimo === null ? 0 : Math.min(0.1, (ms - ultimo) / 1000);
    ultimo = ms;
    if (visible && medir()) {
      if (corriendo) { avanzar(sim.t + dt * MIN_POR_SEG); pintarVivo(); }
      dibujar(dt);
    }
    requestAnimationFrame(cuadroDemo);
  }

  /* --- Controles --- */
  $('demoHoras').innerHTML = S.HORAS.map((h, i) => `<button type="button" data-i="${i}" class="${N.rho[i] > N.rhoObjetivo ? 'critica' : ''}">${h}h</button>`).join('');
  $('demoHoras').addEventListener('click', (e) => { if (e.target.dataset.i !== undefined) { hora = Number(e.target.dataset.i); reiniciar(); } });
  $('demoMenos').addEventListener('click', () => { if (c > 1) { c--; reiniciar(); } });
  $('demoMas').addEventListener('click', () => { if (c < 8) { c++; reiniciar(); } });
  $('demoReiniciar').addEventListener('click', reiniciar);
  const ponerPlay = (si) => { corriendo = si; $('demoPlay').textContent = si ? 'Pausar' : 'Reproducir'; };
  $('demoPlay').addEventListener('click', () => ponerPlay(!corriendo));
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(lienzo);

  reiniciar();
  ponerPlay(false);
  requestAnimationFrame(cuadroDemo);
  // Al llegar a la sección arranca sola (salvo con movimiento reducido)
  return { ver: () => { if (!reducirMovimiento) ponerPlay(true); } };
})();
