// app.js
import {
    auth,
    onAuthStateChanged,
    obtenerPerfilPorUid,
    actualizarPerfil,
    esAdmin,
    banearUsuario,
    // Importa lo necesario de tu archivo central
} from './reztored-auth.js';

// --- ELEMENTOS DEL DOM ---
const userNameEl = document.getElementById('userName');
const userBioEl = document.getElementById('userBio');
const userAvatarEl = document.getElementById('userAvatar');
const editProfileBtn = document.getElementById('editProfileBtn');
const adminBtn = document.getElementById('adminBtn');

// Modales
const editModal = document.getElementById('editModal');
const adminModal = document.getElementById('adminModal');

// --- LÓGICA DE LA PÁGINA ---

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 1. Cargamos el perfil del usuario actual
        const perfil = await obtenerPerfilPorUid(user.uid);
        renderPerfil(perfil);

        // 2. Mostrar botones de edición si es el dueño
        editProfileBtn.classList.remove('hidden');

        // 3. Verificar si es Admin
        if (esAdmin(perfil || user.uid)) {
            adminBtn.classList.remove('hidden');
        }

        // Event listeners para abrir modales
        editProfileBtn.addEventListener('click', () => editModal.style.display = 'flex');
        adminBtn.addEventListener('click', () => adminModal.style.display = 'flex');
    }
});

function renderPerfil(perfil) {
    if (!perfil) return;
    userNameEl.textContent = perfil.username || "Usuario";
    userBioEl.textContent = perfil.bio || "Este usuario no tiene biografía.";
    if (perfil.photoURL) userAvatarEl.src = perfil.photoURL;
    
    // Aquí podrías agregar más lógica para las medallas, rango, coins, etc.
    document.getElementById('userCoins').textContent = perfil.coins || 0;
}

// --- LOGICA DEL MODAL DE EDICIÓN ---
document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const bio = document.getElementById('editBioInput').value;
    const photoURL = document.getElementById('editAvatarInput').value;
    
    try {
        await actualizarPerfil(auth.currentUser.uid, { bio, photoURL });
        alert("Perfil actualizado correctamente");
        editModal.style.display = 'none';
        window.location.reload();
    } catch (error) {
        alert("Error al actualizar: " + error.message);
    }
});

document.getElementById('closeEditModal').addEventListener('click', () => editModal.style.display = 'none');

// --- LÓGICA DEL PANEL ADMIN ---
document.getElementById('btnSearchUser').addEventListener('click', async () => {
    const uid = document.getElementById('searchUserUid').value;
    const area = document.getElementById('adminUserArea');
    const error = document.getElementById('adminSearchError');

    try {
        const perfil = await obtenerPerfilPorUid(uid);
        if (perfil) {
            document.getElementById('adminSearchedUserName').textContent = `Usuario: ${perfil.username}`;
            document.getElementById('adminCoinsInput').value = perfil.coins;
            area.classList.remove('hidden');
            error.classList.add('hidden');
        } else {
            error.classList.remove('hidden');
        }
    } catch (e) {
        error.classList.remove('hidden');
    }
});

document.getElementById('closeAdminModal').addEventListener('click', () => adminModal.style.display = 'none');