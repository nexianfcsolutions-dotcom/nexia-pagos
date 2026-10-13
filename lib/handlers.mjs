import { calcular, fmt } from './pricing.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const MAX_BYTES = 4 * 1024 * 1024; // Netlify admite ~4,5 MB de cuerpo binario por petición
const MAX_FILES = 8;
const RETORNOS_OK = /^https:\/\/(www\.)?nexianfc\.com(\/|$)|^http:\/\/localhost(:\d+)?(\/|$)/;

export function nuevoId(randomInt, now = new Date()) {
  const al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 5; i++) r += al[randomInt(al.length)];
  const p = (n) => String(n).padStart(2, '0');
  return 'NX-' + String(now.getFullYear()).slice(2) + p(now.getMonth() + 1) + p(now.getDate()) + '-' + r;
}

const limpia = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);

// ---------- 1) Crear el pago ----------
export function crearPagoHandler(deps) {
  const { stripe, store, env, randomInt } = deps;
  return async function (req) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    let ans, resumen = '', volver = '', files = [];
    try {
      const ct = req.headers.get('content-type') || '';
      if (ct.includes('multipart/form-data')) {
        const fd = await req.formData();
        ans = JSON.parse(String(fd.get('ans') || '{}'));
        resumen = String(fd.get('resumen') || '');
        volver = String(fd.get('volver') || '');
        files = fd.getAll('archivo').filter((f) => f && typeof f === 'object' && typeof f.arrayBuffer === 'function');
      } else {
        const b = await req.json();
        ans = b.ans; resumen = String(b.resumen || ''); volver = String(b.volver || '');
      }
    } catch (e) { return json({ error: 'Pedido no válido' }, 400); }

    const c = calcular(ans);                      // EL PRECIO SE CALCULA AQUÍ, nunca se fía de lo que manda el navegador
    if (!c.ok) return json({ error: c.motivo, presupuesto: true }, 422);
    if (files.length > MAX_FILES) return json({ error: 'Demasiados archivos.' }, 413);
    const bytes = files.reduce((t, f) => t + (f.size || 0), 0);
    if (bytes > MAX_BYTES) return json({ error: 'Los archivos pesan más de 4 MB.' }, 413);

    const oid = nuevoId(randomInt);
    const site = (env.SITE_URL || 'https://nexianfc.com').replace(/\/$/, '');
    let base = site + '/configurar.html';
    if (volver && RETORNOS_OK.test(volver)) base = volver.split('?')[0].split('#')[0];

    const dato = limpia(ans.dato, 120);
    const email = dato.indexOf('@') > 0 ? dato : undefined;
    const guardados = [];
    for (let i = 0; i < files.length; i++) {
      const key = 'archivo:' + oid + ':' + i;
      await store.set(key, await files[i].arrayBuffer());
      guardados.push({ key, name: limpia(files[i].name, 120) || ('archivo' + (i + 1)), type: files[i].type || 'application/octet-stream', size: files[i].size || 0 });
    }
    await store.setJSON(oid, {
      oid, estado: 'pendiente', creado: new Date().toISOString(),
      ans: { negocio: limpia(ans.negocio, 120), nombre: limpia(ans.nombre, 120), dato },
      resumen: limpia(resumen, 8000), calculo: c, files: guardados
    });

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        locale: 'es',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'eur', unit_amount: c.netoCent, tax_behavior: 'exclusive',
            product_data: { name: 'Pedido NEXIA ' + oid, description: c.corto.slice(0, 250) }
          }
        }],
        automatic_tax: { enabled: true },
        billing_address_collection: 'required',
        customer_creation: 'always',
        ...(email ? { customer_email: email } : {}),
        phone_number_collection: { enabled: true },
        tax_id_collection: { enabled: true },
        name_collection: { business: { enabled: true, optional: true } },
        invoice_creation: {
          enabled: true,
          invoice_data: {
            description: ('Pedido ' + oid + ': ' + c.corto).slice(0, 500),
            footer: 'NEXIA · nexianfc.com · nexianfcsolutions@gmail.com',
            metadata: { oid }
          }
        },
        client_reference_id: oid,
        metadata: { oid },
        payment_intent_data: { description: 'Pedido NEXIA ' + oid, metadata: { oid } },
        success_url: base + '?pago=ok&pedido=' + oid,
        cancel_url: base + '?pago=cancelado'
      });
    } catch (e) {
      console.error('stripe', e && e.message);
      return json({ error: 'No hemos podido preparar el pago. Inténtalo de nuevo en un momento.' }, 502);
    }
    await store.setJSON(oid, { ...(await store.get(oid, { type: 'json' })), sessionId: session.id });
    return json({ url: session.url, pedido: oid, total: c.total });
  };
}

// ---------- 2) Aviso de pago de Stripe: envía los correos ----------
export function webhookHandler(deps) {
  const { stripe, store, env, enviar, esperar } = deps;
  const SELLER = env.SELLER_EMAIL || 'nexianfcsolutions@gmail.com';
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pre = (s) => '<pre style="font:14px/1.5 Arial,sans-serif;white-space:pre-wrap">' + esc(s) + '</pre>';

  return async function (req) {
    const raw = await req.text();
    let event;
    try { event = stripe.webhooks.constructEvent(raw, req.headers.get('stripe-signature') || '', env.STRIPE_WEBHOOK_SECRET); }
    catch (e) { return new Response('Firma no válida', { status: 400 }); }
    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') return new Response('ok', { status: 200 });
    const s = event.data.object;
    if (s.payment_status !== 'paid') return new Response('ok', { status: 200 });
    const oid = (s.metadata && s.metadata.oid) || s.client_reference_id;
    if (!oid) return new Response('sin pedido', { status: 200 });
    const o = await store.get(oid, { type: 'json' });
    if (!o) { console.error('Pedido no encontrado', oid); return new Response('pedido desconocido', { status: 200 }); }

    const cd = s.customer_details || {};
    const a = cd.address || {};
    const dir = [a.line1, a.line2, a.postal_code, a.city, a.state, a.country].filter(Boolean).join(', ');
    const pagado = ((s.amount_total || 0) / 100);
    const esperado = o.calculo ? o.calculo.total : null;
    const aviso = (esperado != null && Math.abs(pagado - esperado) > 0.011)
      ? 'ATENCIÓN: el importe cobrado (' + fmt(pagado) + ') no coincide con el esperado (' + fmt(esperado) + '). Revísalo antes de fabricar.\n\n' : '';

    // factura (puede tardar unos segundos en estar lista)
    let factura = null, pdf = null;
    if (s.invoice) {
      for (let i = 0; i < 3 && !(factura && factura.invoice_pdf); i++) {
        try { factura = await stripe.invoices.retrieve(typeof s.invoice === 'string' ? s.invoice : s.invoice.id); } catch (e) { factura = null; }
        if (!(factura && factura.invoice_pdf)) await esperar(1500);
      }
      if (factura && factura.invoice_pdf) {
        try { const r = await fetch(factura.invoice_pdf); if (r.ok) pdf = Buffer.from(await r.arrayBuffer()).toString('base64'); } catch (e) { /* se manda el enlace */ }
      }
    }

    // correo 1: la venta y la factura
    if (!o.ventaEnviada) {
      const modo = s.livemode ? '' : ' [PRUEBA]';
      const texto = aviso + 'Venta cobrada' + modo + '\nPedido: ' + oid + '\nTotal cobrado (IVA incluido): ' + fmt(pagado) +
        (s.amount_subtotal != null ? '\nBase: ' + fmt(s.amount_subtotal / 100) : '') +
        '\n\nCliente: ' + (cd.name || o.ans.nombre || '') + (cd.email ? '\nCorreo: ' + cd.email : '') + (cd.phone ? '\nTeléfono: ' + cd.phone : '') +
        (dir ? '\nDirección de facturación: ' + dir : '') +
        ((cd.tax_ids && cd.tax_ids.length) ? '\nNIF/CIF: ' + cd.tax_ids.map((t) => t.value).join(', ') : '') +
        (factura && factura.number ? '\n\nFactura: ' + factura.number : '') +
        (factura && factura.hosted_invoice_url ? '\nVer factura: ' + factura.hosted_invoice_url : '') +
        '\nPago en Stripe: https://dashboard.stripe.com/' + (s.livemode ? '' : 'test/') + 'payments/' + (typeof s.payment_intent === 'string' ? s.payment_intent : '') +
        '\n\nEl cliente ha recibido su recibo de Stripe con la factura. El detalle del pedido llega en otro correo.';
      await enviar({
        to: SELLER, subject: 'Venta cobrada' + modo + ' · ' + oid + ' · ' + fmt(pagado), text: texto, html: pre(texto),
        replyTo: cd.email || undefined,
        attachments: pdf ? [{ filename: (factura.number || oid) + '.pdf', content: pdf }] : []
      });
      o.ventaEnviada = true; await store.setJSON(oid, o);
    }

    // correo 2: el pedido con todas sus especificaciones y los archivos del cliente
    if (!o.pedidoEnviado) {
      const adj = [];
      for (const f of (o.files || [])) {
        const buf = await store.get(f.key, { type: 'arrayBuffer' });
        if (buf) adj.push({ filename: f.name, content: Buffer.from(buf).toString('base64') });
      }
      const texto = 'PEDIDO PAGADO ' + oid + (s.livemode ? '' : ' [PRUEBA]') + '\nCliente: ' + (cd.name || o.ans.nombre || '') + (cd.email ? ' · ' + cd.email : '') + (cd.phone ? ' · ' + cd.phone : '') +
        '\nContacto indicado en el pedido: ' + (o.ans.dato || '') + '\n\nResumen del precio (sin IVA)\n- ' + ((o.calculo && o.calculo.lineas) || []).join('\n- ') +
        '\nTotal sin IVA: ' + fmt(o.calculo ? o.calculo.neto : 0) + ' · Total con IVA: ' + fmt(o.calculo ? o.calculo.total : 0) + '\n\n' + o.resumen;
      await enviar({
        to: SELLER, subject: 'Pedido pagado' + (s.livemode ? '' : ' [PRUEBA]') + ' · ' + oid + ' · ' + (o.ans.negocio || cd.name || ''), text: texto, html: pre(texto),
        replyTo: cd.email || undefined, attachments: adj
      });
      o.pedidoEnviado = true; o.estado = 'pagado'; o.pagado = new Date().toISOString();
      await store.setJSON(oid, o);
      for (const f of (o.files || [])) { try { await store.delete(f.key); } catch (e) { /* no pasa nada */ } }
    }

    // copia al cliente: solo si hay un remitente propio verificado (FROM_EMAIL); si no, el cliente tiene el recibo de Stripe
    if (env.FROM_EMAIL && cd.email && !o.clienteEnviado) {
      const t = 'Hola' + (cd.name ? ' ' + cd.name : '') + ',\n\nHemos recibido tu pago y tu pedido ' + oid + '. Te escribimos en breve para confirmar los detalles. Tu factura va en el recibo de Stripe.\n\nEstos son los datos de tu pedido:\n\n' + o.resumen + '\n\nNEXIA · nexianfc.com';
      await enviar({ to: cd.email, subject: 'Tu pedido NEXIA ' + oid, text: t, html: pre(t), replyTo: SELLER, attachments: pdf ? [{ filename: (factura.number || oid) + '.pdf', content: pdf }] : [] });
      o.clienteEnviado = true; await store.setJSON(oid, o);
    }
    return new Response('ok', { status: 200 });
  };
}

// ---------- envío con Resend ----------
export function resendSender(env, fetchFn = fetch) {
  return async function enviar({ to, subject, text, html, replyTo, attachments }) {
    const r = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.FROM_EMAIL ? ('NEXIA <' + env.FROM_EMAIL + '>') : 'NEXIA Pedidos <onboarding@resend.dev>',
        to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}),
        ...(attachments && attachments.length ? { attachments } : {})
      })
    });
    if (!r.ok) throw new Error('Resend ' + r.status + ' ' + (await r.text()).slice(0, 200));
  };
}
