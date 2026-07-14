// ============================================================
// reztored-auth.js
// Módulo compartido de autenticación y perfiles para RezTored Page.
// Lo importan todas las páginas del sitio (index.html, opinions/index.html,
// 404.html, etc.) para no repetir la misma lógica en cada una.
// ============================================================
 
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
 
// --- CONFIGURACIÓN DE FIREBASE (la misma para todo el sitio) ---
const firebaseConfig = {
    apiKey: "AIzaSyDJG28Tq0xhyJPmBirRGY8-yBRZllQPl0M",
    authDomain: "reztored-page.firebaseapp.com",
    projectId: "reztored-page",
    storageBucket: "reztored-page.firebasestorage.app",
    messagingSenderId: "744944684653",
    appId: "1:744944684653:web:0b8cfbf7a6c21dfae13964"
};
 
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
 
// Re-exportamos las funciones de Firebase que cada página necesita,
// así solo hace falta un import por página.
export {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    signInWithPopup,
    updateProfile,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    getDocs
};

// ============================================================
// --- SISTEMA DE ADMINISTRADORES ---
// ============================================================
//
// ✏️ EDITAR ACÁ: poné tu propio UID de Firebase en esta lista para
// convertirte en "super admin" de arranque (los admins normales se
// dan/quitan desde la pestaña de Administrador en tu perfil, pero
// necesitás AL MENOS un admin inicial para poder entrar a esa pestaña).
//
// Cómo conseguir tu UID: iniciá sesión en el sitio, abrí la consola
// del navegador (F12) y escribí:  auth.currentUser.uid
// (tenés que estar en una página donde `auth` esté expuesto, o mirar
// en Firebase Console → Authentication → Users, columna "User UID")
//
// IMPORTANTE: esta lista también tiene que copiarse tal cual dentro
// de las Reglas de Seguridad de Firestore (ver firestore.rules), si
// no, es solo decorativo y no protege nada de verdad.
export const SUPER_ADMIN_UIDS = [
    "iBvT6PulDBNJ48EuquY5wKNestg2",
];

/** True si el uid es super admin "de fábrica" (lista de arriba). */
export function esSuperAdmin(uid) {
    return !!uid && SUPER_ADMIN_UIDS.includes(uid);
}

/**
 * True si el usuario es admin: o está en SUPER_ADMIN_UIDS, o tiene
 * isAdmin: true en su documento de Firestore (users/{uid}).
 * Recibe el objeto de perfil (el que devuelve obtenerPerfilPorUsername
 * o obtenerPerfilPorUid) o directamente un uid.
 */
export function esAdmin(perfilOUid) {
    if (!perfilOUid) return false;
    if (typeof perfilOUid === 'string') return esSuperAdmin(perfilOUid);
    return esSuperAdmin(perfilOUid.uid) || perfilOUid.isAdmin === true;
}

/** Trae el perfil público de un usuario a partir de su UID. */
export async function obtenerPerfilPorUid(uid) {
    if (!uid) return null;
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return null;
    return { uid, ...userSnap.data() };
}

/**
 * Le da (o le saca) admin a un usuario a partir de su username.
 * Solo funciona si quien está logueado ya es admin: las Reglas de
 * Seguridad de Firestore son las que realmente lo permiten o lo
 * rechazan (esto de acá es solo la llamada, no la autorización real).
 */
export async function otorgarAdmin(username, valor = true) {
    const usernameLimpio = (username || '').trim().toLowerCase();
    const usernameRef = doc(db, 'usernames', usernameLimpio);
    const usernameSnap = await getDoc(usernameRef);
    if (!usernameSnap.exists()) {
        throw new Error("No existe ningún usuario con ese nombre.");
    }
    const { uid } = usernameSnap.data();
    await updateDoc(doc(db, 'users', uid), { isAdmin: valor });
    return uid;
}

/**
 * Banea (o desbanea) a un usuario por su UID. Un usuario baneado
 * no puede publicar opiniones nuevas (ver reglas de Firestore).
 */
export async function banearUsuario(uid, valor = true) {
    if (!uid) throw new Error("Falta el UID del usuario.");
    await updateDoc(doc(db, 'users', uid), { banned: valor });
}

/**
 * Borra una opinión del foro por su ID de documento. Pensado para
 * el botón de "quitar" (la X) que ven los admins en /opinions.
 */
export async function eliminarOpinion(opinionId) {
    if (!opinionId) throw new Error("Falta el ID de la opinión.");
    await deleteDoc(doc(db, 'opinions', opinionId));
}

/**
 * Se fija si el usuario logueado (auth.currentUser) ya tiene perfil
 * en Firestore (users/{uid} + su username reservado). Si NO lo tiene
 * —típicamente porque entró con Google, que no pasa por
 * registrarUsuario()— le arma uno automáticamente a partir de su
 * nombre de Google, para que /su-username funcione, se lo pueda
 * banear, dar admin, etc. igual que a cualquier otro usuario.
 *
 * Se puede (y conviene) llamar esto en cada login, no solo en el de
 * Google: es un "self-heal", si el perfil ya existe no hace nada.
 */
export async function asegurarPerfilUsuario(user) {
    if (!user) return;

    const yaExiste = await getDoc(doc(db, 'users', user.uid));
    if (yaExiste.exists()) return; // ya tiene perfil, no hay nada que hacer

    // Armamos un username candidato a partir del nombre que ya tenga
    // (de Google) o del principio del email.
    const base = (user.displayName || user.email.split('@')[0] || 'usuario')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // saca tildes
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 16) || 'usuario';
    const baseValida = base.length >= 3 ? base : (base + '_usr');

    let candidato = baseValida;
    let intento = 0;
    // Probamos el nombre "limpio" y si está ocupado o es reservado,
    // le vamos pegando un número al final hasta encontrar uno libre.
    while (true) {
        const validacion = validarUsername(candidato);
        const libre = validacion.valido && await usernameDisponible(validacion.username);
        if (validacion.valido && libre) break;
        intento++;
        candidato = (baseValida.slice(0, 12) + intento).slice(0, 20);
        if (intento > 50) { candidato = 'usuario' + Date.now().toString().slice(-8); break; }
    }

    const usernameFinal = candidato;
    const photoURL = user.photoURL || "https://api.dicebear.com/7.x/bottts/svg?seed=" + encodeURIComponent(usernameFinal);

    await setDoc(doc(db, 'usernames', usernameFinal), { uid: user.uid });
    await setDoc(doc(db, 'users', user.uid), {
        username: usernameFinal,
        bio: '',
        photoURL: photoURL,
        isAdmin: false,
        banned: false,
        createdAt: serverTimestamp()
    });

    // Mantenemos el displayName de Firebase Auth en sync con el
    // username (así /su-perfil coincide con lo que ve en el menú).
    if (user.displayName !== usernameFinal) {
        await updateProfile(user, { displayName: usernameFinal, photoURL });
    }
}
 
// --- PALABRAS RESERVADAS ---
// Nombres de usuario que NO se pueden registrar porque chocan con
// rutas reales del sitio (carpetas) o son confusas/riesgosas.
// Agregá acá cualquier carpeta nueva que crees en el repo.
export const RESERVED_USERNAMES = [
    'opinions', 'info', 'contact', 'perfil', 'profile', 'admin',
    'login', 'signup', 'register', 'api', 'assets', 'css', 'js',
    'images', 'img', 'static', 'www', 'mail', 'null', 'undefined',
    '404', 'index', 'home', 'about', 'help', 'support', 'terms',
    'privacy', 'auth', 'settings', 'account', 'root', 'ftp'
];
 
// Formato permitido: 3 a 20 caracteres, minúsculas, números y guión bajo
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
 
/**
 * Valida el formato de un nombre de usuario y si está en la lista de reservados.
 * NO consulta Firestore (para eso está usernameDisponible).
 */
export function validarUsername(rawUsername) {
    const username = (rawUsername || '').trim().toLowerCase();
 
    if (!USERNAME_REGEX.test(username)) {
        return {
            valido: false,
            mensaje: "El usuario debe tener 3-20 caracteres: solo minúsculas, números y guión bajo (_), sin espacios."
        };
    }
    if (RESERVED_USERNAMES.includes(username)) {
        return {
            valido: false,
            mensaje: "Ese nombre de usuario no está disponible."
        };
    }
    return { valido: true, username };
}
 
/** Consulta Firestore para saber si un username ya está tomado. */
export async function usernameDisponible(username) {
    const ref = doc(db, 'usernames', username);
    const snap = await getDoc(ref);
    return !snap.exists();
}
 
/**
 * Registra un usuario nuevo:
 * 1. Valida formato y palabras reservadas.
 * 2. Verifica que el username esté libre.
 * 3. Crea la cuenta en Firebase Auth.
 * 4. Reserva el username en Firestore (colección "usernames").
 * 5. Crea el perfil público en Firestore (colección "users").
 */
export async function registrarUsuario({ email, password, username }) {
    const validacion = validarUsername(username);
    if (!validacion.valido) {
        throw new Error(validacion.mensaje);
    }
    const usernameFinal = validacion.username;
 
    const disponible = await usernameDisponible(usernameFinal);
    if (!disponible) {
        throw new Error("Ese nombre de usuario ya está en uso.");
    }
 
    const photoURL = "https://api.dicebear.com/7.x/bottts/svg?seed=" + encodeURIComponent(usernameFinal);
 
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
 
    await updateProfile(userCredential.user, {
        displayName: usernameFinal,
        photoURL: photoURL
    });
 
    // Reserva el username → apunta al uid del dueño.
    // (Las reglas de Firestore deben impedir que esto se pueda pisar después)
    await setDoc(doc(db, 'usernames', usernameFinal), {
        uid: userCredential.user.uid
    });
 
    // Perfil público, editable después por el dueño (bio, foto).
    // isAdmin y banned SOLO los puede tocar un admin (ver firestore.rules),
    // por eso se crean acá en false y no se tocan desde actualizarPerfil().
    await setDoc(doc(db, 'users', userCredential.user.uid), {
        username: usernameFinal,
        bio: '',
        photoURL: photoURL,
        isAdmin: false,
        banned: false,
        createdAt: serverTimestamp()
    });
 
    return userCredential.user;
}
 
/**
 * Trae el perfil público de un usuario a partir de su nombre de usuario.
 * Devuelve null si no existe. Se usa en 404.html para armar la página de perfil.
 */
export async function obtenerPerfilPorUsername(username) {
    const usernameLimpio = (username || '').trim().toLowerCase();
    if (!usernameLimpio) return null;
 
    const usernameRef = doc(db, 'usernames', usernameLimpio);
    const usernameSnap = await getDoc(usernameRef);
    if (!usernameSnap.exists()) return null;
 
    const { uid } = usernameSnap.data();
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return null;
 
    return { uid, ...userSnap.data() };
}
 
/**
 * Actualiza la bio y/o la foto de perfil (URL pegada) del usuario logueado.
 * Solo el dueño de la cuenta puede llamar esto sobre sí mismo (uid = auth.currentUser.uid).
 */
export async function actualizarPerfil(uid, { bio, photoURL }) {
    const datos = {};
    if (typeof bio === 'string') datos.bio = bio.slice(0, 280); // límite razonable
    if (typeof photoURL === 'string' && photoURL.trim()) datos.photoURL = photoURL.trim();
 
    await setDoc(doc(db, 'users', uid), datos, { merge: true });
 
    // Mantenemos sincronizado el photoURL de Firebase Auth también,
    // así se ve actualizado en los avatares del header/foro sin recargar todo.
    if (datos.photoURL && auth.currentUser && auth.currentUser.uid === uid) {
        await updateProfile(auth.currentUser, { photoURL: datos.photoURL });
    }
}
 