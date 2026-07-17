// profile.js
import { 
    auth, 
    db, 
    obtenerPerfilPorUid, 
    esAdmin, 
    actualizarColorPerfil, 
    actualizarBannerImagenPerfil, 
    actualizarMarcoPerfil,
    calcularNivel,
    colorNivel
} from './reztored-auth.js';

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

// --- SISTEMA DE NIVELES (estilo Steam) ---
// El nivel se calcula solo a partir del saldo de petoCoins (ver
// calcularNivel/colorNivel en reztored-auth.js), no hace falta guardar
// nada nuevo en Firestore.
function renderNivel(coins) {
    const info = calcularNivel(coins);
    const color = colorNivel(info.nivel);

    document.getElementById('userLevelNumber').textContent = info.nivel;
    document.getElementById('profileContainer').style.setProperty('--level-color', color);

    const fill = document.getElementById('levelProgressFill');
    if (fill) fill.style.width = `${Math.round(info.progreso * 100)}%`;

    const texto = document.getElementById('levelProgressText');
    if (texto) {
        texto.textContent = info.coinsNivelSiguiente > info.coinsNivelActual
            ? `🪙 ${info.coins.toLocaleString('es-AR')} / ${info.coinsNivelSiguiente.toLocaleString('es-AR')} petoCoins para el nivel ${info.nivel + 1}`
            : `🪙 ${info.coins.toLocaleString('es-AR')} petoCoins`;
    }
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
            renderNivel(userData.coins || 0);
            
            if (userData.photoURL) document.getElementById('userAvatar').src = userData.photoURL;
            if (userData.bannerImageURL) document.getElementById('userBanner').style.backgroundImage = `url('${userData.bannerImageURL}')`;
            if (userData.colorPerfil) document.documentElement.style.setProperty('--user-theme-color', userData.colorPerfil);

            // Rellenar inputs del modal
            document.getElementById('editNameInput').value = userData.username || '';
            document.getElementById('editBioInput').value = userData.bio || '';
            document.getElementById('editColorInput').value = userData.colorPerfil || '#8b5cf6';
            document.getElementById('editAvatarInput').value = userData.photoURL || '';
            document.getElementById('editBannerInput').value = userData.bannerImageURL || '';
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
        await updateDoc(doc(db, "users", profileId), {
            username: document.getElementById('editNameInput').value,
            bio: document.getElementById('editBioInput').value,
            photoURL: document.getElementById('editAvatarInput').value
        });

        // 2. Personalizaciones de Tienda (Están protegidas por tus funciones en reztored-auth.js)
        // Si el usuario no compró el producto, estas funciones lanzarán un error y el catch lo atrapará.
        
        await actualizarColorPerfil(profileId, document.getElementById('editColorInput').value);
        await actualizarBannerImagenPerfil(profileId, document.getElementById('editBannerInput').value);

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