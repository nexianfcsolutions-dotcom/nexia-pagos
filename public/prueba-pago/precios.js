// ÚNICA tabla de precios de NEXIA (todo SIN IVA). Mismo modelo que el Excel «NEXIA_Precios_y_reglas».
// La usan el configurador (configurar.html), la calculadora (precios.html) y el servidor de pagos (nexia-pagos/lib/precios.cjs, copia exacta).
// Si cambia un precio: cámbialo AQUÍ, copia el archivo a nexia-pagos (npm run sync-precios), revisa los textos fijos de precios.html y lanza npm test en nexia-pagos.
(function (root) {
  var P = {
    // Precio de cada lote (total del lote, chip estándar incluido), con precios psicológicos acabados en ,99.
    // Entre dos lotes se interpola el precio por unidad, así que cada unidad extra abarata un poco.
    // Placa de mesa = mismo precio que la tarjeta. Soporte de mostrador = el doble por unidad (redondeado a ,99).
    lotes: {
      tarjeta: [[1, 4.99], [5, 19.99], [10, 29.99], [25, 69.99], [50, 134.99]],
      placa: [[1, 4.99], [5, 19.99], [10, 29.99], [25, 69.99], [50, 134.99]],
      soporte: [[1, 9.99], [5, 39.99], [10, 59.99], [25, 139.99], [50, 269.99]]
    },
    // Suplemento por unidad sobre el chip estándar.
    chip: { estandar: 0, pro: 0.2, super: 0.5 },
    acrilico: 0.5,          // por unidad
    caras2: 1,              // por unidad
    diseno: 14.99,          // por diseño (una vez por pedido)
    portalBasico: 19.99,    // por portal
    portalCompleto: 49.99,  // mínimo: el portal avanzado se presupuesta
    maxUnidades: 50,        // más de esto se presupuesta aparte
    iva: 0.21,
    // PROMOCIÓN: en la primera compra, el diseño de NEXIA sale gratis si el pedido es de minUnidades o más.
    // El servidor de pagos comprueba que de verdad es la primera compra (por el correo o el teléfono del cliente).
    // Para quitarla: activa: false.
    promoDiseno: { activa: true, minUnidades: 2 }
  };
  P.r2 = function (n) { return Math.round(n * 100) / 100; };
  // Precio total (sin IVA) de n unidades del formato dado, sin extras.
  P.total = function (n, formato) {
    var t = P.lotes[formato] || P.lotes.tarjeta;
    if (n <= t[0][0]) return P.r2(t[0][1] * n / t[0][0]);
    for (var k = 1; k < t.length; k++) {
      if (n === t[k][0]) return t[k][1];
      if (n < t[k][0]) {
        var ua = t[k - 1][1] / t[k - 1][0], ub = t[k][1] / t[k][0];
        return P.r2(n * (ua + (ub - ua) * (n - t[k - 1][0]) / (t[k][0] - t[k - 1][0])));
      }
    }
    return P.r2(n * t[t.length - 1][1] / t[t.length - 1][0]);
  };
  // Precio por unidad para mostrar (redondeado hacia abajo al céntimo: 29,99 € / 10 -> 2,99 €).
  P.porUnidad = function (n, formato) { return Math.floor(P.total(n, formato) / n * 100 + 1e-9) / 100; };
  // ¿Entra este pedido en la promoción del diseño gratis? (falta comprobar que es la primera compra)
  P.promoAplica = function (n, diseno) { return !!P.promoDiseno.activa && diseno === 'nexia' && n >= P.promoDiseno.minUnidades; };
  // 12.5 -> "12,50 €", 12 -> "12 €"
  P.fmt = function (n) { return (Number.isInteger(P.r2(n)) ? String(P.r2(n)) : P.r2(n).toFixed(2)).replace('.', ',') + ' €'; };
  if (typeof module === 'object' && module.exports) module.exports = P;
  else root.NEXIA_PRECIOS = P;
})(typeof globalThis !== 'undefined' ? globalThis : this);
