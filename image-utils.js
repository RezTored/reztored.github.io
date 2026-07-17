// ============================================================
// image-utils.js
// Utilidad compartida para preparar imágenes EN EL NAVEGADOR antes
// de subirlas a Storage. La usa perfil.js para el avatar y el
// banner del perfil, y puede reusarse para cualquier otra foto.
//
// Por qué comprimir en el cliente y no en el servidor:
// - Ahorra espacio y costo de Storage (menos bytes guardados).
// - Ahorra ancho de banda: subís menos MB y el que ve el perfil
//   descarga menos MB.
// - No hace falta una Cloud Function (plan de pago) para redimensionar.
// ============================================================

const FORMATOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024; // 15 MB, límite del archivo ORIGINAL

/**
 * Recorta una imagen al cuadrado central, la redimensiona a
 * `tamano`x`tamano` px y la comprime. Devuelve un Blob listo para
 * subir a Storage.
 *
 * Intenta codificar en WebP (mejor compresión a igual calidad
 * visual); si el navegador no soporta la codificación WebP, cae
 * automáticamente a JPEG (soportado en todos lados).
 *
 * @param {File|Blob} archivo - imagen elegida por el usuario
 * @param {{tamano?: number, calidad?: number}} opciones
 * @returns {Promise<Blob>}
 */
export async function comprimirImagenCuadrada(archivo, { tamano = 512, calidad = 0.85 } = {}) {
    validarFormatoYPeso(archivo);

    const bitmap = await createImageBitmap(archivo);
    try {
        const lado = Math.min(bitmap.width, bitmap.height);
        const offsetX = (bitmap.width - lado) / 2;
        const offsetY = (bitmap.height - lado) / 2;
        return await recortarYCodificar(bitmap, offsetX, offsetY, lado, lado, tamano, tamano, calidad);
    } finally {
        bitmap.close();
    }
}

/**
 * Prepara la imagen del BANNER de perfil (formato rectangular ancho,
 * como el avatar pero recortando manteniendo la proporción del
 * banner en vez de un cuadrado).
 *
 * Caso especial GIF: un GIF animado NO se recomprime, porque el
 * <canvas> solo puede dibujar un frame y eso le mataría la
 * animación. En ese caso se sube el archivo tal cual, solo
 * validando que no sea demasiado pesado.
 *
 * @param {File|Blob} archivo
 * @param {{ancho?: number, alto?: number, calidad?: number, maxGifBytes?: number}} opciones
 * @returns {Promise<Blob>}
 */
export async function prepararImagenBanner(archivo, { ancho = 1200, alto = 450, calidad = 0.85, maxGifBytes = 8 * 1024 * 1024 } = {}) {
    validarFormatoYPeso(archivo, { maxOriginalBytes: archivo && archivo.type === 'image/gif' ? maxGifBytes : MAX_ORIGINAL_BYTES });

    // GIF animado: se sube sin tocar, para no perder la animación.
    if (archivo.type === 'image/gif') {
        return archivo;
    }

    const bitmap = await createImageBitmap(archivo);
    try {
        // Recorte central manteniendo la proporción del banner
        // (no cuadrado como el avatar).
        const proporcionDestino = ancho / alto;
        const proporcionOrigen = bitmap.width / bitmap.height;

        let recorteAncho, recorteAlto;
        if (proporcionOrigen > proporcionDestino) {
            recorteAlto = bitmap.height;
            recorteAncho = recorteAlto * proporcionDestino;
        } else {
            recorteAncho = bitmap.width;
            recorteAlto = recorteAncho / proporcionDestino;
        }
        const offsetX = (bitmap.width - recorteAncho) / 2;
        const offsetY = (bitmap.height - recorteAlto) / 2;

        return await recortarYCodificar(bitmap, offsetX, offsetY, recorteAncho, recorteAlto, ancho, alto, calidad);
    } finally {
        bitmap.close();
    }
}

function validarFormatoYPeso(archivo, { maxOriginalBytes = MAX_ORIGINAL_BYTES } = {}) {
    if (!archivo || !FORMATOS_ACEPTADOS.includes(archivo.type)) {
        throw new Error("Formato de imagen no soportado. Usá JPG, PNG, WEBP o GIF.");
    }
    if (archivo.size > maxOriginalBytes) {
        throw new Error(`La imagen es demasiado pesada (máximo ${(maxOriginalBytes / (1024 * 1024)).toFixed(0)}MB).`);
    }
}

function recortarYCodificar(bitmap, offsetX, offsetY, recorteAncho, recorteAlto, anchoDestino, altoDestino, calidad) {
    const canvas = document.createElement('canvas');
    canvas.width = anchoDestino;
    canvas.height = altoDestino;
    const ctx = canvas.getContext('2d');

    // Fondo blanco antes de dibujar: si la imagen original tiene
    // transparencia (PNG) y termina codificándose en JPEG (que no
    // soporta transparencia), evitamos que quede con fondo negro.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, anchoDestino, altoDestino);
    ctx.drawImage(bitmap, offsetX, offsetY, recorteAncho, recorteAlto, 0, 0, anchoDestino, altoDestino);

    return codificarConFallback(canvas, calidad);
}

function codificarConFallback(canvas, calidad) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blobWebp) => {
            // Si el navegador no sabe codificar WebP, algunos devuelven
            // null y otros silenciosamente devuelven PNG (pesado). En
            // ambos casos, si el tipo no es exactamente 'image/webp',
            // usamos JPEG a propósito para garantizar buena compresión.
            if (blobWebp && blobWebp.type === 'image/webp') {
                resolve(blobWebp);
                return;
            }
            canvas.toBlob((blobJpeg) => {
                if (blobJpeg) {
                    resolve(blobJpeg);
                } else {
                    reject(new Error("No se pudo comprimir la imagen."));
                }
            }, 'image/jpeg', calidad);
        }, 'image/webp', calidad);
    });
}

