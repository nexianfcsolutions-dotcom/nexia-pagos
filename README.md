# NEXIA · función de pagos

Pequeño servicio (Netlify Functions) que hace de "caja" de la tienda de NEXIA:

1. `POST /api/crear-pago`: recibe el pedido del configurador, **recalcula el precio en el servidor** (`lib/pricing.mjs`), guarda el pedido y crea un pago de Stripe con ese importe fijo. Devuelve la dirección de pago.
2. `POST /api/webhook-stripe`: Stripe avisa aquí cuando el cliente ha pagado. Entonces se envían dos correos al vendedor: (1) venta cobrada con la factura en PDF, (2) pedido con todas las especificaciones y los archivos del cliente. El cliente recibe de Stripe el recibo con la factura.

El pedido no llega a NEXIA hasta que el pago está hecho.

## Variables de entorno (Netlify > Project configuration > Environment variables)
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
`npm install && npm test` (usa Stripe, almacén y correo simulados). Para comparar además con el configurador: `CONFIG_HTML=ruta/Configurar.dc.html npm test`.

## Si cambian los precios
Hay que cambiarlos en `lib/pricing.mjs` y en el configurador de la web (misma tabla), y volver a lanzar las pruebas.
