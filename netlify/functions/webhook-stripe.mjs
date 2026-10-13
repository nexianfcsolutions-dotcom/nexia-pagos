import Stripe from 'stripe';
import { getStore } from '@netlify/blobs';
import { webhookHandler, resendSender } from '../../lib/handlers.mjs';

const leerEnv = () => Object.fromEntries(['STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'SELLER_EMAIL', 'SITE_URL', 'FROM_EMAIL'].map((k) => [k, Netlify.env.get(k)]));

export default async (req) => {
  const stripe = new Stripe(Netlify.env.get('STRIPE_SECRET_KEY'));
  const handler = webhookHandler({
    stripe, store: getStore('pedidos'), env: leerEnv(),
    enviar: resendSender(leerEnv()),
    esperar: (ms) => new Promise((r) => setTimeout(r, ms))
  });
  return handler(req);
};

export const config = { path: '/api/webhook-stripe' };
