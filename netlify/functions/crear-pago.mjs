import Stripe from 'stripe';
import { getStore } from '@netlify/blobs';
import { randomInt } from 'node:crypto';
import { crearPagoHandler } from '../../lib/handlers.mjs';

const leerEnv = () => Object.fromEntries(['STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'SELLER_EMAIL', 'SITE_URL', 'FROM_EMAIL'].map((k) => [k, Netlify.env.get(k)]));

export default async (req) => {
  const stripe = new Stripe(Netlify.env.get('STRIPE_SECRET_KEY'));
  const handler = crearPagoHandler({ stripe, store: getStore('pedidos'), env: leerEnv(), randomInt });
  return handler(req);
};

export const config = { path: '/api/crear-pago' };
