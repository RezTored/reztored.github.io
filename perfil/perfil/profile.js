// profile.js
import { 
    auth, 
    db, 
    obtenerPerfilPorUid, 
    esAdmin, 
    actualizarColorPerfil, 
    actualizarMarcoPerfil,
    subirFotoPerfil,
    subirBannerPerfil
} from './reztored-auth.js';
import { comprimirImagenCuadrada, prepararImagenBanner } from '../image-utils.js';

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, updateDoc, onSnapshot, collection, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const profileId = urlParams.get('id');

let currentUserObj = null;

async function init() {
    if (!profileId) {
        document.getElementById('userName').textContent = "Perfil no encontrado";
        return;
    }
    await cargarPerfil();
    escucharSesion();
    escucharComentariosForo();
}

async function cargarPerfil() {
    try {
        const userData = await obtenerPerfilPorUid(profileId);

        if (userData) {
            // Llenar UI con datos de tu DB
            document.getElementById('userName').textContent = userData.username || 'Usuario';
            document.getElementById('userBio').textContent = userData.bio || 'Este usuario aún no ha escrito su biografía.';
            document.getElementById('userCoins').textContent = userData.coins || 0;
            document.getElementById('userBadge').textContent = userData.isAdmin ? '🛡️ Administrador' : 'Miembro';
            
            if (userData.photoURL) document.getElementById('userAvatar').src = userData.photoURL;
            if (userData.bannerImageURL) document.getElementById('userBanner').style.backgroundImage = `url('${userData.bannerImageURL}')`;
            if (userData.colorPerfil) document.documentElement.style.setProperty('--user-theme-color', userData.colorPerfil);

            // Rellenar inputs del modal
            document.getElementById('editNameInput').value = userData.username || '';
            document.getElementById('editBioInput').value = userData.bio || '';
            document.getElementById('editColorInput').value = userData.colorPerfil || '#8b5cf6';

            // El avatar y el banner ya no son inputs de texto: mostramos
            // lo que hay actualmente como vista previa en el modal.
            const previewImg = document.getElementById('avatarUploadPreview');
            if (previewImg) previewImg.src = userData.photoURL || document.getElementById('userAvatar').src;

            const bannerPreview = document.getElementById('bannerUploadPreview');
            if (bannerPreview && userData.bannerImageURL) {
                bannerPreview.style.backgroundImage = `url('${userData.bannerImageURL}')`;
            }
        }
    } catch (error) {
        console.error("Error al cargar perfil:", error);
    }
}

function escucharSesion() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserObj = user;
            // Mostrar botones de edición solo si es el dueño
            if (user.uid === profileId) {
                document.getElementById('editProfileBtn').classList.remove('hidden');
            }
            // Botón Admin
            if (esAdmin(user.uid)) {
                document.getElementById('adminBtn').classList.remove('hidden');
            }
        }
    });
}

// --- GUARDAR PERFIL (USANDO FUNCIONES DE TIENDA) ---

document.getElementById('saveProfileBtn').onclick = async () => {
    if (!currentUserObj || currentUserObj.uid !== profileId) return;

    try {
        // 1. Actualización básica (No requiere compra)
        // Nota: la foto de perfil (photoURL) ya NO se guarda acá; se
        // sube y se guarda al instante cuando el usuario elige el
        // archivo (ver escucharSubidaAvatar más abajo).
        await updateDoc(doc(db, "users", profileId), {
            username: document.getElementById('editNameInput').value,
            bio: document.getElementById('editBioInput').value
        });

        // 2. Personalizaciones de Tienda (Están protegidas por tus funciones en reztored-auth.js)
        // Si el usuario no compró el producto, esta función lanzará un error y el catch lo atrapará.
        // Nota: el banner de imagen ya NO se guarda acá; se sube y se
        // guarda al instante al elegir el archivo (ver escucharSubidaBanner).

        await actualizarColorPerfil(profileId, document.getElementById('editColorInput').value);

        alert("Perfil actualizado correctamente.");
        document.getElementById('editModal').style.display = 'none';
        location.reload();

    } catch (error) {
        // Aquí mostramos el error que viene de tu función (ej: "Necesitás comprar Banner...")
        alert("Error al guardar: " + error.message);
    }
};

// --- PANEL ADMIN ---

document.getElementById('adminSaveBtn').onclick = async () => {
    // Aquí puedes usar updateDoc directamente porque eres Admin
    const nuevasMonedas = parseInt(document.getElementById('adminCoinsInput').value) || 0;
    const esAdminSeleccionado = document.getElementById('adminRoleSelect').value === 'admin';

    await updateDoc(doc(db, "users", profileId), {
        coins: nuevasMonedas,
        isAdmin: esAdminSeleccionado
    });

    alert("Cambios de admin aplicados.");
    location.reload();
};

init();
escucharSubidaAvatar();
escucharSubidaBanner();

// --- SUBIDA DE FOTO DE AVATAR (comprimida en el navegador) ---

function escucharSubidaAvatar() {
    const input = document.getElementById('editAvatarInput');
    const preview = document.getElementById('avatarUploadPreview');
    const status = document.getElementById('avatarUploadStatus');
    if (!input) return;

    input.addEventListener('change', async () => {
        const archivo = input.files && input.files[0];
        if (!archivo) return;

        if (!currentUserObj || currentUserObj.uid !== profileId) {
            status.textContent = 'Iniciá sesión con esta cuenta para cambiar la foto.';
            status.className = 'avatar-upload-status error';
            input.value = '';
            return;
        }

        status.textContent = 'Comprimiendo y subiendo...';
        status.className = 'avatar-upload-status uploading';

        try {
            // Recorta a cuadrado, redimensiona a 512x512 y comprime
            // (WebP si el navegador soporta, si no JPEG) antes de subir.
            const blobComprimido = await comprimirImagenCuadrada(archivo, { tamano: 512, calidad: 0.85 });

            // Vista previa inmediata con el archivo ya comprimido.
            preview.src = URL.createObjectURL(blobComprimido);

            const nuevaURL = await subirFotoPerfil(profileId, blobComprimido);

            // Actualizamos también el avatar grande del perfil, sin
            // esperar a que se recargue la página.
            document.getElementById('userAvatar').src = nuevaURL;

            status.textContent = '¡Foto actualizada!';
            status.className = 'avatar-upload-status success';
        } catch (error) {
            status.textContent = 'Error: ' + error.message;
            status.className = 'avatar-upload-status error';
        } finally {
            input.value = '';
        }
    });
}

// --- SUBIDA DE BANNER (imagen o GIF) ---

function escucharSubidaBanner() {
    const input = document.getElementById('editBannerInput');
    const preview = document.getElementById('bannerUploadPreview');
    const status = document.getElementById('bannerUploadStatus');
    if (!input) return;

    input.addEventListener('change', async () => {
        const archivo = input.files && input.files[0];
        if (!archivo) return;

        if (!currentUserObj || currentUserObj.uid !== profileId) {
            status.textContent = 'Iniciá sesión con esta cuenta para cambiar el banner.';
            status.className = 'avatar-upload-status error';
            input.value = '';
            return;
        }

        status.textContent = archivo.type === 'image/gif' ? 'Subiendo GIF...' : 'Comprimiendo y subiendo...';
        status.className = 'avatar-upload-status uploading';

        try {
            // Si es GIF se sube tal cual (para no perder la animación);
            // si es una imagen estática se recorta 1200x450 y se comprime.
            const blobListo = await prepararImagenBanner(archivo, { ancho: 1200, alto: 450, calidad: 0.85 });

            preview.style.backgroundImage = `url('${URL.createObjectURL(blobListo)}')`;

            const nuevaURL = await subirBannerPerfil(profileId, blobListo);

            document.getElementById('userBanner').style.backgroundImage = `url('${nuevaURL}')`;

            status.textContent = '¡Banner actualizado!';
            status.className = 'avatar-upload-status success';
        } catch (error) {
            status.textContent = 'Error: ' + error.message;
            status.className = 'avatar-upload-status error';
        } finally {
            input.value = '';
        }
    });
}

// --- COMENTARIOS DEL FORO EN EL PERFIL ---

function escapeHTML(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
    return String(str).replace(/[&<>'"]/g, tag => map[tag] || tag);
}

function escucharComentariosForo() {
    const contenedor = document.getElementById('userForumComments');
    if (!contenedor) return;

    // Filtramos por authorUid; el orden lo hacemos en el cliente para
    // no depender de un índice compuesto en Firestore.
    const comentariosQuery = query(collection(db, 'opinions'), where('authorUid', '==', profileId));

    onSnapshot(comentariosQuery, (snapshot) => {
        if (snapshot.empty) {
            contenedor.innerHTML = '<p class="forum-comments-empty">Este usuario todavía no dejó comentarios en el foro.</p>';
            return;
        }

        const comentarios = snapshot.docs
            .map(d => d.data())
            .sort((a, b) => {
                const ta = a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : 0;
                const tb = b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : 0;
                return tb - ta;
            });

        contenedor.innerHTML = comentarios.map(data => {
            const texto = data.text || '';
            const fecha = (data.timestamp && data.timestamp.toDate) ? data.timestamp.toDate().toLocaleString() : 'Reciente';
            const likes = data.likesCount || 0;
            const dislikes = data.dislikesCount || 0;
            const petopes = data.petopeCount || 0;

            return `
                <div class="forum-comment-card">
                    <div class="forum-comment-date">${fecha}</div>
                    <div class="forum-comment-text">${escapeHTML(texto)}</div>
                    <div class="forum-comment-footer">
                        <span>👍 ${likes}</span>
                        <span>👎 ${dislikes}</span>
                        <span><img src="/petocoin.png" alt="petope" style="width:14px; vertical-align:-2px;"> ${petopes}</span>
                    </div>
                </div>
            `;
        }).join('');
    }, (error) => {
        console.error("Error al cargar comentarios del foro:", error);
        contenedor.innerHTML = '<p class="forum-comments-empty">No se pudieron cargar los comentarios del foro.</p>';
    });
}