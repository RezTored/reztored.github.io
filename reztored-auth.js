// ============================================================
// reztored-auth.js
// Módulo compartido de autenticación, perfiles, petoCoins y likes
// para RezTored Page. Lo importan todas las páginas del sitio
// (index.html, opinions/index.html, 404.html, etc.) para no
// repetir la misma lógica en cada una.
//
// ⚠️ NOTA: el archivo que subiste ("Reztored auth.js") era una
// versión vieja que le faltaban varias funciones que las páginas
// del sitio ya usaban en producción (esAdmin, obtenerPerfilPorUid,
// asegurarPerfilUsuario, otorgarAdmin, banearUsuario, eliminarOpinion).
// Las reconstruí acá abajo en base a cómo las llama cada página.
// Si tenías una versión distinta, avisame para ajustar diferencias.
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
    deleteDoc,
    onSnapshot,
    runTransaction,
    increment,
    arrayUnion,
    arrayRemove,
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
    deleteDoc,
    onSnapshot
};

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

// --- ADMINISTRADORES "DE FIERRO" ---
// UIDs que siempre son admin, pase lo que pase en Firestore (por si
// se rompe/borra el flag isAdmin). Está vacío porque no tengo tu UID:
// poné el tuyo acá (lo ves en la consola de Firebase Auth) si querés
// un admin que no se pueda sacar desde el panel.
export const SUPER_ADMIN_UIDS = [];

// --- ECONOMÍA DE PETOCOINS ---
export const COINS_REGISTRO = 1000; // con cuántas coins arranca una cuenta nueva
export const COINS_POR_LIKE = 10;   // cuántas coins gana el AUTOR cuando le likean un post

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
 * 5. Crea el perfil público en Firestore (colección "users"), con
 *    COINS_REGISTRO petoCoins de arranque.
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
    await setDoc(doc(db, 'users', userCredential.user.uid), {
        username: usernameFinal,
        bio: '',
        photoURL: photoURL,
        coins: COINS_REGISTRO,
        isAdmin: false,
        banned: false,
        createdAt: serverTimestamp()
    });

    return userCredential.user;
}

/**
 * Se llama en cada carga de página cuando hay sesión iniciada (por
 * ejemplo en onAuthStateChanged). Sirve para "autocurar" cuentas que
 * entraron por un camino que no pasa por registrarUsuario (login con
 * Google) y todavía no tienen documento en "users", o para cuentas
 * viejas a las que les falta el campo de coins.
 */
export async function asegurarPerfilUsuario(user) {
    if (!user) return;

    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
        // Armamos un username a partir del nombre/email de Google.
        let base = (user.displayName || (user.email || '').split('@')[0] || 'user')
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '')
            .slice(0, 20);
        if (base.length < 3 || RESERVED_USERNAMES.includes(base)) {
            base = 'user' + user.uid.slice(0, 8);
        }

        // Si el username ya existe (choque), le pegamos un sufijo del uid.
        let usernameFinal = base;
        if (!(await usernameDisponible(usernameFinal))) {
            usernameFinal = (base.slice(0, 12) + '_' + user.uid.slice(0, 6)).slice(0, 20);
        }

        const photoURL = user.photoURL || ("https://api.dicebear.com/7.x/bottts/svg?seed=" + encodeURIComponent(usernameFinal));

        await setDoc(doc(db, 'usernames', usernameFinal), { uid: user.uid }, { merge: true });

        await setDoc(ref, {
            username: usernameFinal,
            bio: '',
            photoURL: photoURL,
            coins: COINS_REGISTRO,
            isAdmin: false,
            banned: false,
            createdAt: serverTimestamp()
        }, { merge: true });

        if (!user.displayName) {
            await updateProfile(user, { displayName: usernameFinal, photoURL });
        }
    } else if (typeof snap.data().coins !== 'number') {
        // Cuenta vieja de antes del sistema de petoCoins: le damos el arranque.
        await setDoc(ref, { coins: COINS_REGISTRO }, { merge: true });
    }
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

/** Trae el perfil público de un usuario a partir de su UID. Devuelve null si no existe. */
export async function obtenerPerfilPorUid(uid) {
    if (!uid) return null;
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (!userSnap.exists()) return null;
    return { uid, ...userSnap.data() };
}

/**
 * ¿Es admin? Acepta un objeto de perfil (con .isAdmin / .uid) o
 * directamente un uid en string. Un uid en SUPER_ADMIN_UIDS siempre
 * cuenta como admin, aunque el flag de Firestore esté en false.
 */
export function esAdmin(perfilOUid) {
    if (!perfilOUid) return false;
    if (typeof perfilOUid === 'string') {
        return SUPER_ADMIN_UIDS.includes(perfilOUid);
    }
    return !!perfilOUid.isAdmin || SUPER_ADMIN_UIDS.includes(perfilOUid.uid);
}

/** Da o saca el flag de admin a un usuario, buscándolo por su username. */
export async function otorgarAdmin(username, valor) {
    const perfil = await obtenerPerfilPorUsername(username);
    if (!perfil) {
        throw new Error("No existe ningún usuario con ese nombre.");
    }
    await setDoc(doc(db, 'users', perfil.uid), { isAdmin: !!valor }, { merge: true });
}

/** Banea o desbanea a un usuario por su uid (un baneado no puede publicar). */
export async function banearUsuario(uid, valor) {
    if (!uid) throw new Error("Falta el uid del usuario.");
    await setDoc(doc(db, 'users', uid), { banned: !!valor }, { merge: true });
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

/** Borra una opinión del foro (solo lo debería poder llamar un admin). */
export async function eliminarOpinion(id) {
    if (!id) throw new Error("Falta el id de la opinión.");
    await deleteDoc(doc(db, 'opinions', id));
}

/**
 * Escucha en tiempo real el saldo de petoCoins de un usuario.
 * callback(coins) se llama cada vez que cambia. Devuelve una función
 * para dejar de escuchar (llamala al desloguearse / cambiar de página).
 */
export function suscribirCoins(uid, callback) {
    if (!uid) {
        callback(0);
        return () => {};
    }
    return onSnapshot(doc(db, 'users', uid), (snap) => {
        callback(snap.exists() ? (snap.data().coins || 0) : 0);
    });
}

/**
 * Le pone o le saca el like del usuario "uidQueDaLike" a la opinión
 * "opinionId" (toggle: si ya la tenía likeada, se la saca).
 *
 * - No se puede likear el propio post (evita farmear coins).
 * - Al likear por primera vez, el AUTOR del post gana COINS_POR_LIKE.
 * - Al sacar el like, se resta el like del contador pero NO se le
 *   quitan las coins ya ganadas al autor (para evitar líos de saldo
 *   negativo por el toggle constante).
 * - Todo corre en una transacción de Firestore para que el contador
 *   de likes y las coins del autor queden siempre sincronizados.
 */
export async function toggleLikeOpinion(opinionId, uidQueDaLike) {
    if (!uidQueDaLike) {
        throw new Error("Necesitás iniciar sesión para dar like.");
    }
    const opinionRef = doc(db, 'opinions', opinionId);

    await runTransaction(db, async (tx) => {
        const opinionSnap = await tx.get(opinionRef);
        if (!opinionSnap.exists()) {
            throw new Error("Esa opinión ya no existe.");
        }
        const data = opinionSnap.data();
        const likedBy = data.likedBy || [];

        if (likedBy.includes(uidQueDaLike)) {
            // Ya tenía el like puesto: lo sacamos.
            tx.update(opinionRef, {
                likedBy: arrayRemove(uidQueDaLike),
                likesCount: increment(-1)
            });
            return;
        }

        if (data.authorUid === uidQueDaLike) {
            throw new Error("No podés darle like a tu propio post.");
        }

        tx.update(opinionRef, {
            likedBy: arrayUnion(uidQueDaLike),
            likesCount: increment(1)
        });

        if (data.authorUid) {
            tx.update(doc(db, 'users', data.authorUid), {
                coins: increment(COINS_POR_LIKE)
            });
        }
    });
}

// Tope de una donación individual, solo como salvaguarda contra typos
// (no es una defensa real contra abuso — ver nota de seguridad al final del archivo).
export const MAX_DONACION = 100000;

/**
 * Dona "cantidad" de petoCoins de la cuenta logueada actual a la cuenta
 * "uidReceptor". Resta y suma en una sola transacción para que quede
 * siempre consistente (o se hacen las dos escrituras, o ninguna).
 */
export async function donarCoins(uidReceptor, cantidad) {
    const uidEmisor = auth.currentUser ? auth.currentUser.uid : null;
    if (!uidEmisor) throw new Error("Necesitás iniciar sesión para donar.");
    if (!uidReceptor) throw new Error("Falta el destinatario.");
    if (uidReceptor === uidEmisor) throw new Error("No podés donarte petoCoins a vos mismo.");

    const monto = Math.floor(Number(cantidad));
    if (!Number.isFinite(monto) || monto <= 0) {
        throw new Error("El monto tiene que ser un número entero positivo.");
    }
    if (monto > MAX_DONACION) {
        throw new Error(`No podés donar más de ${MAX_DONACION} petoCoins de una.`);
    }

    const emisorRef = doc(db, 'users', uidEmisor);
    const receptorRef = doc(db, 'users', uidReceptor);

    await runTransaction(db, async (tx) => {
        const emisorSnap = await tx.get(emisorRef);
        if (!emisorSnap.exists()) throw new Error("No se encontró tu perfil.");

        const saldoActual = emisorSnap.data().coins || 0;
        if (saldoActual < monto) {
            throw new Error("No tenés suficientes petoCoins para donar eso.");
        }

        tx.update(emisorRef, { coins: increment(-monto) });
        tx.update(receptorRef, { coins: increment(monto) });
    });
}

/**
 * SOLO ADMINS: fija (pisa, no suma) el saldo de petoCoins de la cuenta
 * logueada actual. No se puede usar para tocar el saldo de otra cuenta.
 * La aplicación real de "solo admin" la tiene que hacer también la regla
 * de Firestore (ver reglas de seguridad recomendadas), esto de acá es
 * nada más para que el botón no aparezca si no sos admin.
 */
export async function fijarMisCoins(cantidad) {
    const user = auth.currentUser;
    if (!user) throw new Error("Necesitás iniciar sesión.");

    const monto = Math.floor(Number(cantidad));
    if (!Number.isFinite(monto) || monto < 0) {
        throw new Error("El monto tiene que ser un número entero, 0 o positivo.");
    }

    await setDoc(doc(db, 'users', user.uid), { coins: monto }, { merge: true });
}

// ============================================================
// ⚠️ IMPORTANTE — REGLAS DE SEGURIDAD DE FIRESTORE
// ------------------------------------------------------------
// Todo lo de acá arriba (likes, donaciones, banear, dar admin,
// borrar opiniones) hace escrituras DIRECTAS desde el navegador a
// documentos que no son "los tuyos" (el post de otro, el perfil de
// otro). Firestore bloquea eso por defecto con
// "Missing or insufficient permissions" a menos que las Reglas de
// Seguridad del proyecto lo permitan explícitamente.
// Te paso el archivo de reglas recomendado aparte — sin pegarlo en
// Firebase Console (Firestore Database → Reglas), ni los likes, ni
// donar, ni banear/dar-admin ni borrar opiniones van a funcionar,
// aunque el código de acá esté perfecto.
// ============================================================
