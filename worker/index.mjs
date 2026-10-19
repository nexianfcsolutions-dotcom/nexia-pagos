// Entrada del servicio de pagos (Cloudflare Workers): lee la configuración y monta
// las dependencias reales (Stripe, almacén de pedidos en Cloudflare KV, correo con Resend). Toda la lógica está en lib/handlers.mjs.
// Secretos (Cloudflare > Workers > nexia-pagos > Settings > Variables and Secrets): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY.
// Opcionales: SELLER_EMAIL, SITE_URL, FROM_EMAIL, USAR_STRIPE_TAX, IVA_TAX_RATE_ID. Almacén: KV con el nombre de enlace PEDIDOS (wrangler.toml).
import Stripe from 'stripe';
import { crearPagoHandler, webhookHandler, resendSender, respuestaError } from '../lib/handlers.mjs';

const CLAVES = ['STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'SELLER_EMAIL', 'SITE_URL', 'FROM_EMAIL', 'USAR_STRIPE_TAX', 'IVA_TAX_RATE_ID'];
const ARCHIVOS_TTL = 30 * 24 * 3600; // los archivos de pedidos que nunca se pagan se borran solos a los 30 días

// Adaptador del almacén (set, setJSON, get, delete) sobre Cloudflare KV.
export function almacenKV(kv) {
  return {
    set: (k, v) => kv.put(k, v, { expirationTtl: ARCHIVOS_TTL }),
    setJSON: (k, v) => kv.put(k, JSON.stringify(v)),
    get: (k, o) => kv.get(k, { type: (o && o.type) || 'text' }),
    delete: (k) => kv.delete(k)
  };
}

const randomInt = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;

export default {
  async fetch(req, env) {
    const ruta = new URL(req.url).pathname.replace(/\/$/, '');
    const conf = Object.fromEntries(CLAVES.map((k) => [k, env[k]]));
    try {
      if (ruta === '/api/crear-pago') {
        if (req.method === 'OPTIONS') return respuestaError('', 204);
        if (!env.STRIPE_SECRET_KEY) { console.error('Falta STRIPE_SECRET_KEY'); return respuestaError('El pago online aún no está activado.', 503); }
        const stripe = new Stripe(String(env.STRIPE_SECRET_KEY).trim(), { httpClient: Stripe.createFetchHttpClient() });
        return await crearPagoHandler({ stripe, store: almacenKV(env.PEDIDOS), env: conf, randomInt })(req);
      }
      if (ruta === '/api/webhook-stripe') {
        if (!env.STRIPE_SECRET_KEY || !conf.STRIPE_WEBHOOK_SECRET || !conf.RESEND_API_KEY) { console.error('Faltan variables de entorno'); return new Response('No configurado', { status: 503 }); }
        const stripe = new Stripe(String(env.STRIPE_SECRET_KEY).trim(), { httpClient: Stripe.createFetchHttpClient() });
        return await webhookHandler({
          stripe, store: almacenKV(env.PEDIDOS), env: conf, enviar: resendSender(conf),
          esperar: (ms) => new Promise((r) => setTimeout(r, ms))
        })(req);
      }
      return new Response('No encontrado', { status: 404 });
    } catch (e) {
      console.error(ruta, e && e.message);
      if (ruta === '/api/crear-pago') return respuestaError('No hemos podido preparar el pago. Inténtalo de nuevo en un momento.', 500);
      return new Response('Error', { status: 500 });
    }
  }
};
