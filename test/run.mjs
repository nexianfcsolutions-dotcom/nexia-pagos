import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import P from '../lib/precios.cjs';
import assert from 'node:assert/strict';
import { calcular } from '../lib/pricing.mjs';
import { crearPagoHandler, webhookHandler, resendSender } from '../lib/handlers.mjs';

// ---- 1) misma tabla y mismo precio que la web (nexia-web) ----
// WEB_DIR = carpeta de nexia-web. Por defecto ../nexia-web si existe al lado de este repo.
const WEB = process.env.WEB_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'nexia-web');
if (fs.existsSync(path.join(WEB, 'precios.js'))) {
  const leer = (f) => fs.readFileSync(path.join(WEB, f), 'utf8');
  // a) precios.cjs es una copia exacta de nexia-web/precios.js
  assert.equal(fs.readFileSync(new URL('../lib/precios.cjs', import.meta.url), 'utf8'), leer('precios.js'),
    'lib/precios.cjs no es igual a nexia-web/precios.js: ejecuta `npm run sync-precios`');
  // b) las páginas cargan precios.js y su lógica da el mismo importe que el servidor
  class DCLogic { constructor() { this.state = {}; } setState(o) { this.state = Object.assign({}, this.state, o); } }
  const componente = (f) => {
    const html = leer(f);
    assert.ok(html.includes('<script src="./precios.js"></script>'), f + ' no carga precios.js');
    const m = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
    const C = new Function('DCLogic', 'window', m[1] + ';return Component')(DCLogic, { NEXIA_PRECIOS: P });
    return { c: new C(), html };
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const cfg = componente('configurar.html').c;
  let n = 0;
  for (let i = 0; i < 4000; i++) {
    const ans = {
      formato: pick(['tarjeta', 'tarjeta', 'placa', 'soporte', 'otro']), path: pick(['propio', 'portal']), pnivel: pick(['basico', 'completo']),
      material: pick(['pvc', 'acrilico']), chip: pick(['estandar', 'pro', 'super']), caras: pick(['1', '2']), diseno: pick(['propio', 'nexia', 'ayuda']),
      ndis: pick(['1', '1', '1', '2', '3']), cant: pick(['1', '5', '10', '25', '50', 'otra']), cantN: String(1 + Math.floor(Math.random() * 70))
    };
    const w = cfg.qPrice(ans), s = calcular(ans, { primeraCompra: true });   // la web muestra el precio de primera compra
    // Mientras el servidor de pagos no esté desplegado con placa/soporte, la web no los cobra online (PAGO_ONLINE): se compara solo el importe.
    const sinCobro = ans.formato === 'placa' || ans.formato === 'soporte';
    if (!sinCobro) assert.equal(!!s.ok, !!w.canPay, 'canPay distinto: ' + JSON.stringify(ans));
    if (s.ok) { assert.equal(s.neto, w.netNum, 'neto distinto: ' + JSON.stringify(ans)); assert.equal(s.total, w.totalIva, 'total distinto'); n++; }
  }
  console.log('configurador: mismo precio que el servidor en 4000 pedidos aleatorios (' + n + ' de pago fijo)');

  const pre = componente('precios.html');
  let m2 = 0;
  for (let i = 0; i < 4000; i++) {
    const a = {
      fmt: pick(['tarjeta', 'placa', 'soporte']), portal: pick(['propio', 'basico', 'completo']), mat: pick(['pvc', 'acrilico']),
      chip: pick(['estandar', 'pro', 'super']), caras: pick(['1', '2']), dis: pick(['nexia', 'propio']),
      cant: pick(['1', '5', '10', '25', '50', 'otra']), cantN: String(1 + Math.floor(Math.random() * 70))
    };
    const w = pre.c.pCalc(a);
    const s = calcular({ formato: a.fmt, path: a.portal === 'propio' ? 'propio' : 'portal', pnivel: a.portal, material: a.mat, chip: a.chip,
      caras: a.caras, diseno: a.dis, ndis: '1', cant: a.cant, cantN: a.cantN }, { primeraCompra: true });
    if (s.ok) { assert.equal(w.total, s.neto, 'calculadora distinta: ' + JSON.stringify(a)); m2++; }
    else if (a.portal !== 'completo') assert.ok(w.custom, 'la calculadora da precio y el servidor no: ' + JSON.stringify(a));
  }
  console.log('calculadora de precios.html: mismo precio que el servidor (' + m2 + ' casos)');

  // c) los precios escritos a mano en precios.html coinciden con la tabla
  const texto = pre.html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const f = P.fmt;
  const esperados = [
    'Desde ' + f(P.total(1, 'tarjeta')),
    'Portal básico ' + f(P.portalBasico) + ' por portal', 'Portal avanzado ' + f(P.portalCompleto) + ' por portal',
    'Acrílico (+' + f(P.acrilico) + ' por tarjeta)', '+' + f(P.chip.pro) + ' por tarjeta', '+' + f(P.chip.super) + ' por tarjeta',
    '2 caras (+' + f(P.caras2) + ' por tarjeta)', 'Son ' + f(P.diseno) + ' por cada diseño'
  ];
  if (P.promoDiseno.activa) esperados.push('En tu primera compra de ' + P.promoDiseno.minUnidades + ' o más tarjetas, el diseño es gratis');
  const abajo = (x) => Math.floor(x * 100 + 1e-9) / 100;
  for (const [n] of P.lotes.tarjeta) {
    const lote = P.total(n, 'tarjeta'), conDis = P.r2(lote + P.diseno);
    esperados.push((n === 1 ? '1 tarjeta' : 'Lote de ' + n) + ' ' + f(lote) + ' ' + f(P.porUnidad(n, 'tarjeta')) + ' / tarjeta ' + f(conDis) + ' ' + f(abajo(conDis / n)) + ' / tarjeta');
  }
  // configurador: precios de portal escritos en las opciones
  const cfgHtml = leer('configurar.html');
  for (const e of ['<b>Portal básico</b><em>+' + f(P.portalBasico) + '</em>', '<b>Portal avanzado</b><em>Desde +' + f(P.portalCompleto) + '</em>'])
    assert.ok(cfgHtml.includes(e), 'configurar.html no muestra ' + e);
  const faltan = esperados.filter((e) => !texto.includes(e));
  assert.deepEqual(faltan, [], 'precios.html tiene textos con precios que no coinciden con precios.js (o se han reescrito): ' + faltan.join(' | '));
  console.log('textos de precios.html coinciden con la tabla (' + esperados.length + ' comprobaciones)');
} else console.log('(se salta la comparación con la web: no se encuentra nexia-web; define WEB_DIR)');

// ---- 2) casos fijos ----
const ok = (a) => { const r = calcular(a); assert.ok(r.ok); return r; };
const base = { formato: 'tarjeta', path: 'propio', material: 'pvc', chip: 'estandar', caras: '1', diseno: 'propio', ndis: '1' };
assert.equal(ok({ ...base, cant: '1' }).neto, 4.99);
assert.equal(ok({ ...base, cant: '5' }).neto, 19.99);
assert.equal(ok({ ...base, cant: '10' }).neto, 29.99);
assert.equal(ok({ ...base, cant: '50' }).neto, 134.99);
assert.equal(ok({ ...base, cant: '10', chip: 'pro' }).neto, 31.99);
assert.equal(ok({ ...base, cant: 'otra', cantN: '34' }).neto, 93.96);
assert.equal(ok({ ...base, cant: '10', diseno: 'nexia' }).neto, 44.98);                              // sin promo
assert.equal(calcular({ ...base, cant: '10', diseno: 'nexia' }, { primeraCompra: true }).neto, 29.99);  // promo: diseño gratis
assert.equal(calcular({ ...base, cant: '2', diseno: 'nexia' }, { primeraCompra: true }).neto, 9.48);
assert.equal(calcular({ ...base, cant: '1', diseno: 'nexia' }, { primeraCompra: true }).neto, 19.98);   // 1 unidad: sin promo
assert.ok(calcular({ ...base, cant: '10', diseno: 'nexia' }, { primeraCompra: true }).lineas.some((l) => l.includes('promo primera compra')));
assert.equal(calcular({ ...base, cant: '10', diseno: 'propio' }, { primeraCompra: true }).neto, 29.99);
assert.equal(ok({ ...base, cant: '10', path: 'portal', pnivel: 'basico' }).neto, 49.98);
assert.equal(ok({ ...base, cant: '10' }).total, 36.29);
assert.equal(calcular({ ...base, cant: 'otra', cantN: '51' }).ok, false);
assert.equal(calcular({ ...base, cant: '5', diseno: 'ayuda' }).ok, false);
assert.equal(calcular({ ...base, cant: '5', path: 'portal', pnivel: 'completo' }).ok, false);
assert.equal(calcular({ ...base, cant: '5', ndis: '2' }).ok, false);
assert.equal(calcular({ ...base, cant: '-3' }).ok, false);
assert.equal(calcular({ ...base, cant: 'otra', cantN: '2.5' }).ok, true); // parseInt -> 2
assert.equal(ok({ ...base, formato: 'placa', cant: '10' }).neto, 29.99);       // placa = como tarjeta
assert.equal(ok({ ...base, formato: 'soporte', cant: '5' }).neto, 39.99);
assert.equal(ok({ ...base, formato: 'soporte', cant: '1' }).neto, 9.99);
assert.equal(ok({ ...base, formato: 'soporte', cant: '10', chip: 'pro', material: 'acrilico', diseno: 'nexia' }).neto, 81.98);  // 59,99 + 14,99 + 10 x 0,70
assert.equal(calcular({ ...base, formato: 'otro', cant: '5' }).ok, false);
assert.equal(calcular({}).ok, false);
console.log('casos fijos de precio OK');

// ---- 3) flujo completo con Stripe, almacén y correo simulados ----
class Store {
  constructor() { this.m = new Map(); }
  async set(k, v) { this.m.set(k, v); }
  async setJSON(k, v) { this.m.set(k, JSON.stringify(v)); }
  async get(k, o) { const v = this.m.get(k); if (v === undefined) return null; return o && o.type === 'json' ? JSON.parse(v) : v; }
  async delete(k) { this.m.delete(k); }
}
const store = new Store();
let created = null;
const stripe = {
  taxRates: { list: async () => ({ data: [] }), create: async (p) => ({ id: 'txr_1', ...p }) },
  checkout: { sessions: { create: async (p) => { created = p; return { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }; } } },
  webhooks: { constructEventAsync: async (raw, sig, sec) => { if (sig !== 'ok' || sec !== 'whsec_x') throw new Error('bad'); return JSON.parse(raw); } },
  invoices: { retrieve: async () => ({ number: 'NEXIA-0001', hosted_invoice_url: 'https://invoice.stripe.com/i/x', invoice_pdf: null }) }
};
let rn = 0; const randomInt = (n) => (rn++ * 7) % n;
const env = { SELLER_EMAIL: 'v@x.es', STRIPE_WEBHOOK_SECRET: 'whsec_x' };
const crear = crearPagoHandler({ stripe, store, env, randomInt });

const fd = new FormData();
fd.append('ans', JSON.stringify({ ...base, cant: '10', chip: 'pro', negocio: 'Bar Pepe', nombre: 'Ana', dato: 'ana@x.es', netoFalso: 1 }));
fd.append('resumen', 'NUEVO PEDIDO\nFormato: Tarjeta\n<script>x</script>');
fd.append('archivo', new Blob(['logo-bytes'], { type: 'image/png' }), 'logo.png');
fd.append('volver', 'https://evil.example/robar');
let r = await crear(new Request('https://x/api/crear-pago', { method: 'POST', body: fd }));
let j = await r.json();
assert.equal(r.status, 200); assert.ok(j.url.startsWith('https://checkout.stripe.com'));
assert.equal(created.line_items[0].price_data.unit_amount, 3199, 'importe calculado en servidor');
assert.equal(created.customer_email, 'ana@x.es');
assert.ok(created.success_url.startsWith('https://nexianfc.com/configurar.html?pago=ok&pedido=NX-'), 'no acepta retornos de otros dominios: ' + created.success_url);
assert.equal(created.automatic_tax, undefined); assert.deepEqual(created.line_items[0].tax_rates, ['txr_1']); assert.equal(created.line_items[0].price_data.tax_behavior, undefined);
assert.ok(created.invoice_creation.invoice_data.description.includes('10 tarjetas'));
const oid = j.pedido;
console.log('crear-pago OK ·', oid, '· 31,99 € sin IVA ->', j.total, 'con IVA');

// vuelve de nuestra propia web
const fd2 = new FormData(); fd2.append('ans', JSON.stringify({ ...base, cant: '1' })); fd2.append('volver', 'https://nexianfc.com/configurar.html?x=1');
await crear(new Request('https://x', { method: 'POST', body: fd2 }));
assert.equal(created.success_url.split('?')[0], 'https://nexianfc.com/configurar.html');

// pedidos que no se pagan online
for (const ans of [{ ...base, cant: 'otra', cantN: '60' }, { ...base, cant: '5', diseno: 'ayuda' }]) {
  const f = new FormData(); f.append('ans', JSON.stringify(ans));
  const rr = await crear(new Request('https://x', { method: 'POST', body: f }));
  assert.equal(rr.status, 422);
}
// archivos demasiado grandes
const fb = new FormData(); fb.append('ans', JSON.stringify({ ...base, cant: '5' })); fb.append('archivo', new Blob([new Uint8Array(4.2 * 1024 * 1024)]), 'grande.bin');
assert.equal((await crear(new Request('https://x', { method: 'POST', body: fb }))).status, 413);
console.log('rechazos OK (presupuesto, archivos grandes, retorno de otro dominio ignorado)');

// webhook
const mails = [];
const enviar = async (m) => { mails.push(m); };
const hook = webhookHandler({ stripe, store, env, enviar, esperar: async () => {} });
const ev = (extra = {}) => JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', livemode: false, payment_status: 'paid', metadata: { oid }, client_reference_id: oid, amount_total: 3871, amount_subtotal: 3199, invoice: 'in_1', payment_intent: 'pi_1', customer_details: { name: 'Ana', email: 'ana@x.es', phone: '+34600000000', address: { line1: 'C/ Mayor 1', city: 'Albacete', postal_code: '02001', country: 'ES' } }, ...extra } } });
let h = await hook(new Request('https://x', { method: 'POST', headers: { 'stripe-signature': 'mala' }, body: ev() }));
assert.equal(h.status, 400); assert.equal(mails.length, 0);
h = await hook(new Request('https://x', { method: 'POST', headers: { 'stripe-signature': 'ok' }, body: ev({ payment_status: 'unpaid' }) }));
assert.equal(h.status, 200); assert.equal(mails.length, 0);
h = await hook(new Request('https://x', { method: 'POST', headers: { 'stripe-signature': 'ok' }, body: ev() }));
assert.equal(h.status, 200); assert.equal(mails.length, 2);
assert.ok(mails[0].subject.startsWith('Venta cobrada [PRUEBA] · ' + oid));
assert.ok(mails[0].text.includes('NEXIA-0001') && mails[0].text.includes('Albacete'));
assert.ok(!mails[0].text.includes('ATENCIÓN'));
assert.ok(mails[1].subject.startsWith('Pedido pagado [PRUEBA]') && mails[1].text.includes('Formato: Tarjeta'));
assert.equal(mails[1].attachments.length, 1); assert.equal(mails[1].attachments[0].filename, 'logo.png');
assert.ok(mails[1].html.includes('&lt;script&gt;'), 'el HTML se escapa');
assert.equal(await store.get('archivo:' + oid + ':0'), null, 'archivos borrados tras enviarlos');
// repetición del aviso: no duplica correos
h = await hook(new Request('https://x', { method: 'POST', headers: { 'stripe-signature': 'ok' }, body: ev() }));
assert.equal(mails.length, 2);
console.log('webhook OK: firma, solo pagados, 2 correos, sin duplicados, adjuntos');

// promo de primera compra: el servidor la aplica solo si ese correo o teléfono no ha pagado antes
const importe = async (ans) => { const x = new FormData(); x.append('ans', JSON.stringify(ans)); await crear(new Request('https://x', { method: 'POST', body: x })); return created.line_items[0].price_data.unit_amount; };
const conDis = { ...base, cant: '10', diseno: 'nexia' };
assert.equal(await importe({ ...conDis, dato: 'nuevo@x.es' }), 2999, 'cliente nuevo: diseño gratis');
assert.equal(await importe({ ...conDis, dato: 'ANA@x.es ' }), 4498, 'ana ya ha pagado: sin promo');
assert.equal(await importe({ ...conDis, dato: '600 000 000' }), 4498, 'su teléfono (de Stripe) también cuenta');
assert.equal(await importe({ ...conDis, dato: '611222333' }), 2999);
console.log('promo primera compra OK');

// IVA_TAX_RATE_ID: no se consulta la lista de tipos de IVA; y un fallo de Stripe devuelve su código en el error
{
  let listados = 0, sesion = null;
  const st2 = { ...stripe, taxRates: { list: async () => { listados++; return { data: [] }; }, create: async () => ({ id: 'txr_nuevo' }) },
    checkout: { sessions: { create: async (p) => { sesion = p; return { id: 'cs_2', url: 'https://checkout.stripe.com/x' }; } } } };
  const cr = crearPagoHandler({ stripe: st2, store: new Store(), env: { IVA_TAX_RATE_ID: 'txr_fijo' }, randomInt });
  const fx = new FormData(); fx.append('ans', JSON.stringify({ ...base, cant: '1' }));
  assert.equal((await cr(new Request('https://x', { method: 'POST', body: fx }))).status, 200);
  assert.equal(listados, 0); assert.deepEqual(sesion.line_items[0].tax_rates, ['txr_fijo']);
  const err = Object.assign(new Error('The provided key does not have the required permissions'), { type: 'StripePermissionError', statusCode: 403 });
  const st3 = { ...st2, checkout: { sessions: { create: async () => { throw err; } } } };
  const fy = new FormData(); fy.append('ans', JSON.stringify({ ...base, cant: '1' }));
  const ry = await crearPagoHandler({ stripe: st3, store: new Store(), env: { IVA_TAX_RATE_ID: 'txr_fijo' }, randomInt })(new Request('https://x', { method: 'POST', body: fy }));
  const jy = await ry.json();
  assert.equal(ry.status, 502); assert.ok(jy.error.includes('(StripePermissionError/403)'), jy.error); assert.ok(!jy.error.includes('provided key'));
  console.log('IVA fijo y código de error de Stripe OK');
}

// importe distinto al esperado -> aviso
const f3 = new FormData(); f3.append('ans', JSON.stringify({ ...base, cant: '5' }));
const j3 = await (await crear(new Request('https://x', { method: 'POST', body: f3 }))).json();
mails.length = 0;
await hook(new Request('https://x', { method: 'POST', headers: { 'stripe-signature': 'ok' }, body: JSON.stringify({ type: 'checkout.session.completed', data: { object: { livemode: false, payment_status: 'paid', metadata: { oid: j3.pedido }, amount_total: 100, customer_details: {} } } }) }));
assert.ok(mails[0].text.startsWith('ATENCIÓN'));
console.log('aviso de importe distinto OK');

// Resend: formato de la petición
let sent;
await resendSender({ RESEND_API_KEY: 'k' }, async (u, o) => { sent = { u, o }; return { ok: true, text: async () => '' }; })({ to: 'v@x.es', subject: 's', text: 't', html: 'h', attachments: [{ filename: 'a.pdf', content: 'QQ==' }] });
const body = JSON.parse(sent.o.body);
assert.equal(sent.u, 'https://api.resend.com/emails'); assert.equal(body.from, 'NEXIA Pedidos <onboarding@resend.dev>'); assert.deepEqual(body.to, ['v@x.es']);
console.log('Resend OK');

// Cloudflare: el adaptador de KV se comporta como el almacén de Netlify
const { almacenKV } = await import('../worker/index.mjs').catch(() => ({}));
if (almacenKV) {
  const m = new Map(); const ttl = {};
  const kv = { put: async (k, v, o) => { m.set(k, v); if (o) ttl[k] = o.expirationTtl; }, delete: async (k) => { m.delete(k); },
    get: async (k, o) => { if (!m.has(k)) return null; const v = m.get(k); return o.type === 'json' ? JSON.parse(v) : v; } };
  const st = almacenKV(kv);
  await st.setJSON('a', { x: 1 }); assert.deepEqual(await st.get('a', { type: 'json' }), { x: 1 });
  await st.set('archivo:1', new Uint8Array([1, 2])); assert.ok(ttl['archivo:1'] > 0, 'los archivos caducan');
  await st.delete('a'); assert.equal(await st.get('a', { type: 'json' }), null);
  console.log('almacén Cloudflare KV OK');
}
console.log('\nTODO CORRECTO');
