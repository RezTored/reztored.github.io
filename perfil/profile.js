// profile.js
import { 
    auth, 
    db, 
    obtenerPerfilPorUid, 
    esAdmin, 
    actualizarColorPerfil, 
    actualizarBannerImagenPerfil, 
    actualizarMarcoPerfil 
} from './reztored-auth.js';

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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