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
//   categoria   -> agrupa el producto para la "🎒 Mochila" del perfil.
//                  Usá: 'insignia', 'marco', 'color', 'banner',
//                  'coleccionable' o 'consumible'.
//   clase       -> SOLO para categoria:'marco'. Es el sufijo de la
//                  clase CSS que dibuja el marco en 404.html
//                  (ej: clase 'plata' -> se le pinta la clase
//                  "avatar-plata" a la foto de perfil). Si agregás un
//                  marco nuevo, sumale también su CSS en 404.html
//                  (buscá "MARCOS DE PERFIL" en los estilos).
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
//     - 'membresia_vip'         -> insignia dorada "VIP" al lado del
//                                  nombre de usuario. Es SOLO una
//                                  etiqueta, no pone marco en la foto
//                                  (para el marco, la persona elige
//                                  uno de los productos categoria:'marco'
//                                  que tenga comprados, desde el panel
//                                  "🎨 Personalizar" de su perfil).
//     - categoria:'marco'       -> cualquier producto con esta
//                                  categoria (marco_perfil_dorado,
//                                  marco_plata, marco_fuego,
//                                  marco_hielo, marco_neon, ...)
//                                  aparece como opción elegible en la
//                                  sección "Marco de perfil" del panel
//                                  de personalización. La persona
//                                  puede tener varios marcos comprados
//                                  a la vez pero solo uno activo.
//     - 'color_personalizado'   -> desbloquea elegir un color propio
//                                  para el perfil (se elige en la
//                                  página de perfil, no acá)
//     - 'banner_personalizado'  -> desbloquea elegir colores propios O
//                                  poner una imagen/GIF (por link) para
//                                  el banner (se elige en la página de
//                                  perfil, no acá). Sin este producto,
//                                  el banner igual se ve, pero con un
//                                  degradé de colores al azar fijo.
//     - 'musica_perfil'         -> desbloquea poner un link de música
//                                  (YouTube o un archivo .mp3/.ogg/.wav)
//                                  que se reproduce de fondo al entrar al
//                                  perfil (se elige en la página de
//                                  perfil, no acá)
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
        tipo: 'unico',
        categoria: 'insignia'
    },
    {
        id: 'membresia_vip',
        nombre: 'VIP',
        descripcion: 'Una insignia dorada "VIP" bien visible al lado de tu nombre de usuario.',
        precio: 30000,
        emoji: '⭐',
        tipo: 'unico',
        categoria: 'insignia'
    },
    {
        id: 'color_personalizado',
        nombre: 'Color personalizado',
        descripcion: 'Elegí el color que más te guste para tu perfil (marco de foto y tu nombre de usuario).',
        precio: 6000,
        emoji: '🎨',
        tipo: 'unico',
        categoria: 'color'
    },
    {
        id: 'banner_personalizado',
        nombre: 'Banner personalizado',
        descripcion: 'Elegí colores propios para tu banner o poné el link de una imagen/GIF (por defecto todos tienen un banner de colores al azar).',
        precio: 9000,
        emoji: '🖼️✨',
        tipo: 'unico',
        categoria: 'banner'
    },

    // --- MARCOS DE PERFIL ---
    // Todos los productos con categoria:'marco' se pueden elegir (uno
    // a la vez) desde el panel "🎨 Personalizar" del perfil, en la
    // sección "Marco de perfil". El campo "clase" tiene que tener su
    // CSS correspondiente en 404.html (clase "avatar-<clase>").
    {
        id: 'marco_perfil_dorado',
        nombre: 'Marco dorado',
        descripcion: 'Un marquito dorado con brillo fijo para tu foto de perfil.',
        precio: 15000,
        emoji: '🖼️',
        tipo: 'unico',
        categoria: 'marco',
        clase: 'dorado'
    },
    {
        id: 'marco_plata',
        nombre: 'Marco plateado',
        descripcion: 'Un marco plateado con brillo suave para tu foto de perfil.',
        precio: 8000,
        emoji: '🥈',
        tipo: 'unico',
        categoria: 'marco',
        clase: 'plata'
    },
    {
        id: 'marco_fuego',
        nombre: 'Marco de fuego',
        descripcion: 'Un marco animado con brillo naranja/rojo pulsante, como si tu foto ardiera.',
        precio: 18000,
        emoji: '🔥',
        tipo: 'unico',
        categoria: 'marco',
        clase: 'fuego'
    },
    {
        id: 'marco_hielo',
        nombre: 'Marco de hielo',
        descripcion: 'Un marco animado con brillo celeste pulsante, bien fresco.',
        precio: 18000,
        emoji: '❄️',
        tipo: 'unico',
        categoria: 'marco',
        clase: 'hielo'
    },
    {
        id: 'marco_neon',
        nombre: 'Marco neón',
        descripcion: 'Un marco animado que cicla entre colores neón. El más llamativo de todos.',
        precio: 22000,
        emoji: '💜',
        tipo: 'unico',
        categoria: 'marco',
        clase: 'neon'
    },

    {
        id: 'musica_perfil',
        nombre: 'Música de perfil',
        descripcion: 'Poné el link de una canción (YouTube o un link directo a un .mp3/.ogg/.wav) para que suene de fondo cuando alguien entre a tu perfil.',
        precio: 12000,
        emoji: '🎵',
        tipo: 'unico',
        categoria: 'musica'
    },
    {
        id: 'sticker_sorpresa',
        nombre: 'Sticker sorpresa',
        descripcion: 'Un stickerpack digital al azar. Se van sumando y se muestran en tu perfil.',
        precio: 2500,
        emoji: '🎁',
        tipo: 'multiple',
        categoria: 'coleccionable'
    },
    {
        id: 'boost_suerte',
        nombre: 'Boost de suerte',
        descripcion: 'Un empujoncito de buena onda para tu próxima jugada (es cosmético, no cambia las probabilidades reales).',
        precio: 20,
        emoji: '🍀',
        tipo: 'multiple',
        categoria: 'consumible'
    }
];
