import Stripe from 'stripe';
import { getStore } from '@netlify/blobs';
import { randomInt } from 'node:crypto';
import { crearPagoHandler, respuestaError } from '../../lib/handlers.mjs';

// Acepta el nombre en mayúsculas o en minúsculas (Netlify distingue entre ambos).
const leer = (k) => Netlify.env.get(k) || Netlify.env.get(k.toLowerCase());
const leerEnv = () => Object.fromEntries(['STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'SELLER_EMAIL', 'SITE_URL', 'FROM_EMAIL', 'USAR_STRIPE_TAX'].map((k) => [k, leer(k)]));

export default async (req) => {
  try {
    if (req.method === 'OPTIONS') return respuestaError('', 204);
    const key = leer('STRIPE_SECRET_KEY');
    if (!key) { console.error('Falta STRIPE_SECRET_KEY'); return respuestaError('El pago online aún no está activado.', 503); }
    const handler = crearPagoHandler({ stripe: new Stripe(key), store: getStore('pedidos'), env: leerEnv(), randomInt });
    return await handler(req);
  } catch (e) {
    console.error('crear-pago', e && e.message);
    return respuestaError('No hemos podido preparar el pago. Inténtalo de nuevo en un momento.', 500);
  }
};

export const config = { path: '/api/crear-pago' };
