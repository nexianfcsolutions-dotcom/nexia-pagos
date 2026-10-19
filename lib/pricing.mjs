// Precios de NEXIA, SIN IVA. Mismo modelo que el configurador de la web y que el Excel «NEXIA_Precios_y_reglas».
// Si cambia un precio, hay que cambiarlo AQUÍ y en el configurador (Configurar.dc.html) y en la calculadora (Precios.dc.html).
// Placa de mesa = mismo precio que la tarjeta. Soporte de mostrador = el doble por unidad (2 × el tramo de tarjeta). Extras iguales para los tres.
const NOMBRES = { tarjeta: ['tarjeta', 'tarjetas'], placa: ['placa', 'placas'], soporte: ['soporte', 'soportes'] };
const MULT = { tarjeta: 1, placa: 1, soporte: 2 };
const PTS = [[1, 5], [5, 4], [10, 3], [25, 2.8], [50, 2.7]];
const CHIP = { estandar: 0, pro: 0.2, super: 0.5 };
const ACRILICO = 0.5, CARAS2 = 1, DISENO = 15, PBASICO = 20;
const IVA = 0.21;
const r2 = (n) => Math.round(n * 100) / 100;

function unitOf(n) {
  if (n <= PTS[0][0]) return PTS[0][1];
  for (let k = 1; k < PTS.length; k++) {
    if (n <= PTS[k][0]) {
      const a = PTS[k - 1], b = PTS[k];
      return r2(a[1] + (b[1] - a[1]) * (n - a[0]) / (b[0] - a[0]));
    }
  }
  return PTS[PTS.length - 1][1];
}

export function cantidad(ans) {
  if (!ans.cant) return null;
  if (ans.cant === 'otra') { const n = parseInt(ans.cantN, 10); return n >= 1 ? n : null; }
  const n = Number(ans.cant);
  return Number.isFinite(n) ? n : null;
}

// Devuelve { ok:true, neto, iva, total, netoCent, ... } o { ok:false, motivo }.
export function calcular(ans) {
  ans = ans || {};
  const qty = cantidad(ans);
  if (!(ans.formato in NOMBRES)) return { ok: false, motivo: 'Este formato se presupuesta aparte.' };
  const nom = NOMBRES[ans.formato];
  if (!qty || !Number.isInteger(qty) || qty < 1) return { ok: false, motivo: 'Cantidad no válida.' };
  if (qty > 50) return { ok: false, motivo: 'Más de 50 unidades se presupuesta aparte.' };
  if (ans.ndis === '2' || ans.ndis === '3') return { ok: false, motivo: 'Con varios diseños el precio se cierra contigo.' };
  if (ans.diseno !== 'propio' && ans.diseno !== 'nexia') return { ok: false, motivo: 'El diseño aún no está decidido.' };
  const portal = ans.path === 'portal';
  if (ans.path !== 'portal' && ans.path !== 'propio') return { ok: false, motivo: 'Falta indicar qué hace la tarjeta.' };
  if (portal && ans.pnivel !== 'basico') return { ok: false, motivo: 'El portal completo se presupuesta contigo.' };
  if (ans.material !== 'pvc' && ans.material !== 'acrilico') return { ok: false, motivo: 'Falta el material.' };
  if (!(ans.chip in CHIP)) return { ok: false, motivo: 'Falta el chip.' };
  if (ans.caras !== '1' && ans.caras !== '2') return { ok: false, motivo: 'Faltan las caras con diseño.' };

  const unit = r2(unitOf(qty) * MULT[ans.formato]);
  const cards = r2(qty * unit);
  const dis = ans.diseno === 'nexia' ? DISENO : 0;
  const pf = portal ? PBASICO : 0;
  const base = r2(cards + dis + pf);
  const perUnit = r2(CHIP[ans.chip] + (ans.material === 'acrilico' ? ACRILICO : 0) + (ans.caras === '2' ? CARAS2 : 0));
  const total = r2(base + r2(qty * perUnit));
  const iva = r2(total * IVA);
  const lineas = [qty + ' ' + (qty === 1 ? nom[0] : nom[1]) + ' × ' + fmt(unit) + ' = ' + fmt(cards)];
  if (dis) lineas.push('Diseño de NEXIA: ' + fmt(dis));
  if (pf) lineas.push('Portal básico: ' + fmt(pf));
  if (CHIP[ans.chip] > 0) lineas.push((ans.chip === 'pro' ? 'Chip pro' : 'Super chip') + ' (+' + fmt(CHIP[ans.chip]) + ' × ' + qty + ')');
  if (ans.material === 'acrilico') lineas.push('Acrílico (+' + fmt(ACRILICO) + ' × ' + qty + ')');
  if (ans.caras === '2') lineas.push('2 caras (+' + fmt(CARAS2) + ' × ' + qty + ')');
  return {
    ok: true, qty, unit, neto: total, iva, total: r2(total + iva),
    netoCent: Math.round(total * 100), lineas,
    corto: qty + ' ' + (qty === 1 ? nom[0] : nom[1]) + ' de ' + (ans.material === 'acrilico' ? 'acrílico' : 'PVC') +
      (ans.caras === '2' ? ', 2 caras' : ', 1 cara') + (ans.chip === 'pro' ? ', chip pro' : (ans.chip === 'super' ? ', super chip' : '')) +
      (dis ? ', con diseño de NEXIA' : '') + (portal ? ' y portal básico' : '')
  };
}

export function fmt(n) {
  return (Number.isInteger(r2(n)) ? String(r2(n)) : r2(n).toFixed(2)).replace('.', ',') + ' €';
}
