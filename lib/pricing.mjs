// Precios de NEXIA, SIN IVA. La tabla está en precios.cjs, que es una COPIA EXACTA de nexia-web/precios.js
// (la misma que usan el configurador y la calculadora de la web). Si cambia un precio, se cambia en nexia-web/precios.js
// y se copia aquí con `npm run sync-precios`; `npm test` falla si las dos copias no son iguales.
import P from './precios.cjs';

const NOMBRES = { tarjeta: ['tarjeta', 'tarjetas'], placa: ['placa', 'placas'], soporte: ['soporte', 'soportes'] };
const CHIP = P.chip;
const ACRILICO = P.acrilico, CARAS2 = P.caras2, DISENO = P.diseno, PBASICO = P.portalBasico;
const IVA = P.iva;
const r2 = P.r2;

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
  if (qty > P.maxUnidades) return { ok: false, motivo: 'Más de ' + P.maxUnidades + ' unidades se presupuesta aparte.' };
  if (ans.ndis === '2' || ans.ndis === '3') return { ok: false, motivo: 'Con varios diseños el precio se cierra contigo.' };
  if (ans.diseno !== 'propio' && ans.diseno !== 'nexia') return { ok: false, motivo: 'El diseño aún no está decidido.' };
  const portal = ans.path === 'portal';
  if (ans.path !== 'portal' && ans.path !== 'propio') return { ok: false, motivo: 'Falta indicar qué hace la tarjeta.' };
  if (portal && ans.pnivel !== 'basico') return { ok: false, motivo: 'El portal completo se presupuesta contigo.' };
  if (ans.material !== 'pvc' && ans.material !== 'acrilico') return { ok: false, motivo: 'Falta el material.' };
  if (!(ans.chip in CHIP)) return { ok: false, motivo: 'Falta el chip.' };
  if (ans.caras !== '1' && ans.caras !== '2') return { ok: false, motivo: 'Faltan las caras con diseño.' };

  const unit = P.unidad(qty, ans.formato);
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

export const fmt = P.fmt;
