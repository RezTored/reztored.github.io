// ============================================================
// productos.js — LOS PRODUCTOS DE LA TIENDA
//
// Este es el ÚNICO archivo que necesitás tocar para personalizar
// la tienda: agregar productos nuevos, cambiar precios, cambiar
// nombres/emojis, o borrar productos. No hace falta tocar ningún
// otro archivo del proyecto.
//
// Cada producto es un bloque entre { } con estos datos:
//
//   id          -> un identificador único, sin espacios ni tildes
//                  (ej: 'titulo_vip'). No repitas el mismo id en
//                  dos productos.
//   nombre      -> el nombre que se ve en la tienda.
//   descripcion -> una frase corta explicando qué es/para qué sirve.
//   precio      -> cuánto cuesta, en petoCoins (un número, sin comas
//                  ni puntos, ej: 500).
//   emoji       -> un emoji que se usa como "imagen" del producto.
//   tipo        -> 'unico'    = la persona lo puede comprar 1 sola
//                                vez (por ejemplo un título o insignia).
//                  'multiple' = la persona lo puede comprar las
//                                veces que quiera (por ejemplo algo
//                                consumible).
//
// -----------------------------------------------------------------
// CÓMO AGREGAR UN PRODUCTO NUEVO:
//   1. Copiá un bloque { ... } entero (incluida la coma final).
//   2. Pegalo antes del "];" que cierra la lista, más abajo.
//   3. Cambiale el id, nombre, descripcion, precio y emoji.
//
// CÓMO BORRAR UN PRODUCTO:
//   Borrá su bloque { ... } completo (con la coma final incluida).
//
// CÓMO CAMBIAR UN PRECIO O UN NOMBRE:
//   Editá directamente el valor de "precio" o "nombre" de ese
//   producto. No hace falta tocar nada más.
//
// -----------------------------------------------------------------
// ⚠️ IDs "ESPECIALES":
//   Los siguientes ids están conectados a efectos visuales reales en
//   la página de perfil (404.html), no son solo decorativos:
//     - 'titulo_vip'            -> muestra la insignia "👑 Título VIP"
//     - 'marco_perfil_dorado'   -> le pone un marco dorado a la foto
//     - 'membresia_vip'         -> insignia "⭐ VIP" + marco animado
//     - 'color_personalizado'   -> desbloquea elegir un color propio
//                                  para el perfil (se elige en la
//                                  página de perfil, no acá)
//     - 'banner_personalizado'  -> desbloquea elegir colores propios O
//                                  poner una imagen/GIF (por link) para
//                                  el banner (se elige en la página de
//                                  perfil, no acá). Sin este producto,
//                                  el banner igual se ve, pero con un
//                                  degradé de colores al azar fijo.
//     - 'sticker_sorpresa'      -> se muestra un contador en el perfil
//   Podés cambiarles nombre/descripcion/precio/emoji libremente, pero
//   si les cambiás el "id" hay que actualizar también 404.html para
//   que el efecto los siga reconociendo.
// -----------------------------------------------------------------

export const PRODUCTOS = [
    {
        id: 'titulo_vip',
        nombre: 'Título VIP',
        descripcion: 'Un título especial para destacarte en el foro. Se muestra como insignia en tu perfil.',
        precio: 10000,
        emoji: '👑',
        tipo: 'unico'
    },
    {
        id: 'marco_perfil_dorado',
        nombre: 'Marco de perfil dorado',
        descripcion: 'Un marquito dorado con brillo para tu foto de perfil.',
        precio: 15000,
        emoji: '🖼️',
        tipo: 'unico'
    },
    {
        id: 'color_personalizado',
        nombre: 'Color personalizado',
        descripcion: 'Elegí el color que más te guste para tu perfil (marco de foto y tu nombre de usuario).',
        precio: 6000,
        emoji: '🎨',
        tipo: 'unico'
    },
    {
        id: 'banner_personalizado',
        nombre: 'Banner personalizado',
        descripcion: 'Elegí colores propios para tu banner o poné el link de una imagen/GIF (por defecto todos tienen un banner de colores al azar).',
        precio: 9000,
        emoji: '🖼️✨',
        tipo: 'unico'
    },
    {
        id: 'membresia_vip',
        nombre: 'Membresía VIP',
        descripcion: 'La insignia más top: marco dorado animado y etiqueta "⭐ VIP" bien visible en tu perfil.',
        precio: 30000,
        emoji: '⭐',
        tipo: 'unico'
    },
    {
        id: 'sticker_sorpresa',
        nombre: 'Sticker sorpresa',
        descripcion: 'Un stickerpack digital al azar. Se van sumando y se muestran en tu perfil.',
        precio: 2500,
        emoji: '🎁',
        tipo: 'multiple'
    },
    {
        id: 'boost_suerte',
        nombre: 'Boost de suerte',
        descripcion: 'Un empujoncito de buena onda para tu próxima jugada (es cosmético, no cambia las probabilidades reales).',
        precio: 20,
        emoji: '🍀',
        tipo: 'multiple'
    }
];
