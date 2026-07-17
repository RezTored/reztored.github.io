// ============================================================
// cloudinary-upload.js
// Sube archivos (ya comprimidos con image-utils.js) a Cloudinary
// usando un "unsigned upload preset": el navegador sube DIRECTO a
// Cloudinary, sin pasar por ningún servidor propio ni exponer
// ninguna clave secreta. Por eso funciona en un sitio 100% estático
// como este.
//
// ⚠️ CONFIGURACIÓN NECESARIA (una sola vez, es gratis y Cloudinary
// no pide tarjeta para el plan free):
//
// 1. Creá una cuenta en https://cloudinary.com/users/register/free
//
// 2. En el Dashboard, copiá tu "Cloud name" y pegalo abajo en
//    CLOUD_NAME.
//
// 3. Andá a Settings (⚙️) -> Upload -> Upload presets -> Add upload
//    preset, y creá DOS presets así:
//
//    Preset para AVATARES:
//      - Signing Mode: Unsigned
//      - Folder: reztored/avatars
//      - Allowed formats: jpg, png, webp, gif
//      - Max file size: 2 MB (ya llega comprimido por image-utils.js,
//        esto es solo un límite de seguridad extra)
//      - Guardalo y copiá el nombre del preset en AVATAR_PRESET.
//
//    Preset para BANNERS (igual, pero):
//      - Folder: reztored/banners
//      - Max file size: 8 MB (los GIFs no se recomprimen)
//      - Copiá el nombre en BANNER_PRESET.
//
// 4. Pegá tu Cloud name y los nombres de los presets acá abajo.
//
// NOTA sobre seguridad: al ser "unsigned", CUALQUIERA que inspeccione
// el sitio puede en teoría subir archivos a esta carpeta (no hay
// forma de restringirlo por usuario sin un backend). Esto NO permite
// que nadie cambie el avatar de otra persona: eso sigue protegido
// por las reglas de Firestore (solo el dueño de la cuenta puede
// escribir su propio campo photoURL). El único riesgo es que alguien
// suba archivos de más y gaste cuota gratuita; si eso pasara, se
// puede borrar todo desde el Media Library de Cloudinary o rotar el
// nombre del preset.
// ============================================================

const CLOUD_NAME = 'TU_CLOUD_NAME';        // <-- reemplazar
const AVATAR_PRESET = 'reztored_avatares'; // <-- reemplazar si le pusiste otro nombre
const BANNER_PRESET = 'reztored_banners';  // <-- reemplazar si le pusiste otro nombre

async function subirACloudinary(blob, preset, publicId) {
    if (CLOUD_NAME === 'TU_CLOUD_NAME') {
        throw new Error("Falta configurar Cloudinary: completá CLOUD_NAME y los presets en cloudinary-upload.js.");
    }

    const formData = new FormData();
    formData.append('file', blob);
    formData.append('upload_preset', preset);
    if (publicId) formData.append('public_id', publicId);

    const respuesta = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error((datos && datos.error && datos.error.message) || "No se pudo subir el archivo a Cloudinary.");
    }

    return datos.secure_url;
}

/**
 * Sube la foto de avatar (Blob ya recortado/comprimido por
 * comprimirImagenCuadrada en image-utils.js) a Cloudinary.
 * Devuelve la URL pública del archivo subido.
 *
 * El public_id incluye el uid y una marca de tiempo: es solo para
 * poder identificar de quién es cada archivo si algún día hace
 * falta ordenar/limpiar el Media Library a mano. Los uploads
 * "unsigned" de Cloudinary nunca pueden pisar un archivo existente
 * por seguridad, así que cada foto nueva queda como un archivo
 * aparte (el link viejo deja de usarse en el perfil, pero el
 * archivo en sí sigue existiendo en Cloudinary).
 */
export async function subirAvatarACloudinary(uid, blob) {
    const publicId = `avatar_${uid}_${Date.now()}`;
    return subirACloudinary(blob, AVATAR_PRESET, publicId);
}

/**
 * Sube el banner de perfil (imagen o GIF, Blob preparado por
 * prepararImagenBanner en image-utils.js) a Cloudinary.
 * Devuelve la URL pública del archivo subido.
 */
export async function subirBannerACloudinary(uid, blob) {
    const publicId = `banner_${uid}_${Date.now()}`;
    return subirACloudinary(blob, BANNER_PRESET, publicId);
}
