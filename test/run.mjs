import fs from 'node:fs';
import assert from 'node:assert/strict';
import { calcular } from '../lib/pricing.mjs';
import { crearPagoHandler, webhookHandler, resendSender } from '../lib/handlers.mjs';

// ---- 1) mismo precio que el configurador de la web ----
const SCR = process.env.CONFIG_HTML;
if (SCR && fs.existsSync(SCR)) {
  const html = fs.readFileSync(SCR, 'utf8');
  const m = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
  class DCLogic { constructor() { this.state = {}; } setState(o) { this.state = Object.assign({}, this.state, o); } }
  const C = new Function('DCLogic', m[1] + ';return Component')(DCLogic);
  const c = new C();
  let n = 0;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  for (let i = 0; i < 4000; i++) {
    const ans = {
      formato: pick(['tarjeta', 'tarjeta', 'placa', 'soporte', 'otro']), path: pick(['propio', 'portal']), pnivel: pick(['basico', 'completo']),
      material: pick(['pvc', 'acrilico']), chip: pick(['estandar', 'pro', 'super']), caras: pick(['1', '2']), diseno: pick(['propio', 'nexia', 'ayuda']),
      ndis: pick(['1', '1', '1', '2', '3']), cant: pick(['1', '5', '10', '25', '50', 'otra']), cantN: String(1 + Math.floor(Math.random() * 70))
    };
    const w = c.qPrice(ans), s = calcular(ans);
    assert.equal(!!s.ok, !!w.canPay, 'canPay distinto: ' + JSON.stringify(ans));
    if (s.ok) { assert.equal(s.neto, w.netNum, 'neto distinto: ' + JSON.stringify(ans)); assert.equal(s.total, w.totalIva, 'total distinto'); n++; }
  }
  console.log('precios iguales a la web en 4000 pedidos aleatorios (' + n + ' de pago fijo)');
} else console.log('(se salta la comparación con la web: define CONFIG_HTML)');

// ---- 2) casos fijos ----
const ok = (a) => { const r = calcular(a); assert.ok(r.ok); return r; };
const base = { formato: 'tarjeta', path: 'propio', material: 'pvc', chip: 'estandar', caras: '1', diseno: 'propio', ndis: '1' };
assert.equal(ok({ ...base, cant: '1' }).neto, 5);
assert.equal(ok({ ...base, cant: '10' }).neto, 30);
assert.equal(ok({ ...base, cant: '10', chip: 'pro' }).neto, 32);
assert.equal(ok({ ...base, cant: 'otra', cantN: '34' }).neto, 93.84);
assert.equal(ok({ ...base, cant: '10', diseno: 'nexia' }).neto, 45);
assert.equal(ok({ ...base, cant: '10', path: 'portal', pnivel: 'basico' }).neto, 50);
assert.equal(ok({ ...base, cant: '10' }).total, 36.3);
assert.equal(calcular({ ...base, cant: 'otra', cantN: '51' }).ok, false);
assert.equal(calcular({ ...base, cant: '5', diseno: 'ayuda' }).ok, false);
assert.equal(calcular({ ...base, cant: '5', path: 'portal', pnivel: 'completo' }).ok, false);
assert.equal(calcular({ ...base, cant: '5', ndis: '2' }).ok, false);
assert.equal(calcular({ ...base, cant: '-3' }).ok, false);
assert.equal(calcular({ ...base, cant: 'otra', cantN: '2.5' }).ok, true); // parseInt -> 2
assert.equal(ok({ ...base, formato: 'placa', cant: '10' }).neto, 30);          // placa = como tarjeta
assert.equal(ok({ ...base, formato: 'soporte', cant: '5' }).neto, 40);          // soporte = 2 x tramo de tarjeta (2 x 4 = 8 € cada uno)
assert.equal(ok({ ...base, formato: 'soporte', cant: '1' }).neto, 10);
assert.equal(ok({ ...base, formato: 'soporte', cant: '10', chip: 'pro', material: 'acrilico', diseno: 'nexia' }).neto, 60 + 15 + 7);
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
  webhooks: { constructEvent: (raw, sig, sec) => { if (sig !== 'ok' || sec !== 'whsec_x') throw new Error('bad'); return JSON.parse(raw); } },
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
assert.equal(created.line_items[0].price_data.unit_amount, 3200, 'importe calculado en servidor');
assert.equal(created.customer_email, 'ana@x.es');
assert.ok(created.success_url.startsWith('https://nexianfc.com/configurar.html?pago=ok&pedido=NX-'), 'no acepta retornos de otros dominios: ' + created.success_url);
assert.equal(created.automatic_tax, undefined); assert.deepEqual(created.line_items[0].tax_rates, ['txr_1']); assert.equal(created.line_items[0].price_data.tax_behavior, undefined);
assert.ok(created.invoice_creation.invoice_data.description.includes('10 tarjetas'));
const oid = j.pedido;
console.log('crear-pago OK ·', oid, '· 32,00 € sin IVA ->', j.total, 'con IVA');

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
const ev = (extra = {}) => JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', livemode: false, payment_status: 'paid', metadata: { oid }, client_reference_id: oid, amount_total: 3872, amount_subtotal: 3200, invoice: 'in_1', payment_intent: 'pi_1', customer_details: { name: 'Ana', email: 'ana@x.es', phone: '+34600000000', address: { line1: 'C/ Mayor 1', city: 'Albacete', postal_code: '02001', country: 'ES' } }, ...extra } } });
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
console.log('\nTODO CORRECTO');
