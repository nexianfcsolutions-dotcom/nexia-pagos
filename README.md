# NEXIA · función de pagos

Pequeño servicio (Cloudflare Workers; también puede funcionar en Netlify Functions) que hace de "caja" de la tienda de NEXIA:

1. `POST /api/crear-pago`: recibe el pedido del configurador, **recalcula el precio en el servidor** (`lib/pricing.mjs`), guarda el pedido y crea un pago de Stripe con ese importe fijo. Devuelve la dirección de pago.
2. `POST /api/webhook-stripe`: Stripe avisa aquí cuando el cliente ha pagado. Entonces se envían dos correos al vendedor: (1) venta cobrada con la factura en PDF, (2) pedido con todas las especificaciones y los archivos del cliente. El cliente recibe de Stripe el recibo con la factura.

El pedido no llega a NEXIA hasta que el pago está hecho.

## Cloudflare Workers
- Entrada: `worker/index.mjs`; configuración: `wrangler.toml` (nombre `nexia-pagos`, almacén KV `PEDIDOS`, página de prueba en `public/`).
- Se despliega solo desde GitHub (Cloudflare > Workers & Pages > nexia-pagos > Settings > Builds).
- Probar en local: `npm run cf:dev` (las claves de prueba van en `.dev.vars`, que no se sube).
- Los secretos de abajo se ponen en Cloudflare > Workers & Pages > nexia-pagos > Settings > Variables and Secrets (tipo *Secret*).

## Variables de entorno
| Variable | Qué es |
|---|---|
| `STRIPE_SECRET_KEY` | Clave secreta de Stripe (`sk_test_…` en pruebas, `sk_live_…`/restringida en real) |
| `STRIPE_WEBHOOK_SECRET` | Secreto de firma del webhook (`whsec_…`) |
| `RESEND_API_KEY` | Clave de Resend para enviar los correos |
| `SELLER_EMAIL` | (opcional) Correo que recibe los pedidos. Por defecto nexianfcsolutions@gmail.com |
| `SITE_URL` | (opcional) Web a la que vuelve el cliente tras pagar. Por defecto https://nexianfc.com |
| `FROM_EMAIL` | (opcional) Remitente de un dominio verificado en Resend. Si se rellena, el cliente también recibe un correo con su pedido |

**Nunca** subir claves a este repositorio.

## Pruebas
`npm install && npm test` (usa Stripe, almacén y correo simulados). Si `nexia-web` está clonado al lado de este repo (o se indica con `WEB_DIR=ruta/a/nexia-web`), las pruebas además comprueban que:
- `lib/precios.cjs` es idéntico a `nexia-web/precios.js`,
- el configurador (`configurar.html`) y la calculadora (`precios.html`) calculan el mismo importe que el servidor,
- los precios escritos a mano en `precios.html` (tabla de lotes, extras, portales, diseño) coinciden con la tabla.

## Si cambian los precios
La única tabla de precios es **`nexia-web/precios.js`**. Para cambiar un precio:
1. Cámbialo en `nexia-web/precios.js`.
2. Aquí: `npm run sync-precios` (copia ese archivo a `lib/precios.cjs`).
3. `npm test`: si falla por textos de `precios.html`, actualiza esos textos en la web.
4. Publica las dos cosas: la web (nexia-web) y esta función (deploy en Netlify).
