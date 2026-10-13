import Stripe from 'stripe';
import { getStore } from '@netlify/blobs';
import { webhookHandler, resendSender } from '../../lib/handlers.mjs';

const leerEnv = () => Object.fromEntries(['STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'SELLER_EMAIL', 'SITE_URL', 'FROM_EMAIL'].map((k) => [k, Netlify.env.get(k)]));

export default async (req) => {
  try {
    const key = Netlify.env.get('STRIPE_SECRET_KEY');
    const env = leerEnv();
    if (!key || !env.STRIPE_WEBHOOK_SECRET || !env.RESEND_API_KEY) { console.error('Faltan variables de entorno'); return new Response('No configurado', { status: 503 }); }
    const handler = webhookHandler({
      stripe: new Stripe(key), store: getStore('pedidos'), env,
      enviar: resendSender(env),
      esperar: (ms) => new Promise((r) => setTimeout(r, ms))
    });
    return await handler(req);
  } catch (e) {
    console.error('webhook-stripe', e && e.message);
    return new Response('Error', { status: 500 });
  }
};

export const config = { path: '/api/webhook-stripe' };
