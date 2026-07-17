// ============================================================
// paquetes.js — LOS PAQUETES DE LA TIENDA DE PETOCOINS
//
// Este es el único archivo que hace falta tocar para personalizar
// esta tienda: agregar paquetes nuevos, cambiar precios/cantidades,
// o borrar paquetes. No hace falta tocar ningún otro archivo.
//
// Cada paquete es un bloque entre { } con estos datos:
//
//   id        -> identificador único, sin espacios (ej: 'pack_chico')
//   coins     -> cuántas petoCoins da el paquete
//   precio    -> precio en pesos argentinos (solo el número, sin
//                puntos ni el símbolo $. Ej: 1300)
//   etiqueta  -> (opcional) una frase corta tipo "MÁS POPULAR" o
//                "MEJOR PRECIO" que se resalta arriba del paquete.
//                Dejalo en '' si no querés ninguna en ese paquete.
//
// -----------------------------------------------------------------
// ⚠️ IMPORTANTE: esta tienda es solo informativa. El sitio no tiene
// pasarela de pago conectada (no hay Mercado Pago, Stripe, etc), así
// que el botón "Comprar" NO acredita coins solo: lleva a la página de
// Contacto para coordinar el pago y la carga manual de petoCoins.
// Si en algún momento conectás un pago de verdad, ahí sí se podría
// acreditar el saldo automáticamente desde una función de servidor
// (nunca directo desde el navegador, porque cualquiera podría
// regalarse coins gratis llamando a esa función a mano).
// -----------------------------------------------------------------

export const PAQUETES = [
    {
        id: 'pack_1',
        coins: 10000,
        precio: 1000,
        etiqueta: ''
    },
    {
        id: 'pack_2',
        coins: 20000,
        precio: 2000,
        etiqueta: ''
    },
    {
        id: 'pack_3',
        coins: 35460,
        precio: 3000,
        etiqueta: '+5.460 DE REGALO'
    },
    {
        id: 'pack_4',
        coins: 47460,
        precio: 4000,
        etiqueta: '+7.460 DE REGALO'
    },
    {
        id: 'pack_5',
        coins: 60000,
        precio: 5000,
        etiqueta: '+10.000 DE REGALO'
    }
];
