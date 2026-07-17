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
    serverTimestamp,
    collection,
    query,
    orderBy,
    limit,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { PRODUCTOS } from "./tienda/productos.js";

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
    'opinions', 'info', 'fun', 'perfil', 'profile', 'admin',
    'comprar-petocoins', 'tienda', 'contact',
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
export const SUPER_ADMIN_UIDS = ['iBvT6PulDBNJ48EuquY5wKNestg2'];

// --- ECONOMÍA DE PETOCOINS ---
export const COINS_REGISTRO = 1000; // con cuántas coins arranca una cuenta nueva
export const COINS_POR_LIKE = 10;   // cuántas coins gana el AUTOR cuando le likean un post

// --- PETOWORKS ---
// "Trabajos" (minijuegos de habilidad, no de apuesta) donde se pueden
// ganar petoCoins de verdad sin arriesgar el saldo. Tienen un tope
// compartido entre TODOS los trabajos: nadie puede ganar más de
// PETOWORKS_LIMITE_DIARIO petoCoins por día, sin importar en cuántos
// trabajos distintos jugó. El contador se guarda en el propio
// documento del usuario (campo "petoworksHoy") y se resetea solo
// cuando cambia la fecha.
export const PETOWORKS_LIMITE_DIARIO = 2000;

// --- SISTEMA DE NIVELES (estilo Steam) ---
// No hace falta guardar nada nuevo en Firestore: el nivel de una
// cuenta se calcula al vuelo a partir de sus petoCoins ACTUALES. Cada
// nivel pide más coins que el anterior (como en Steam, donde subir de
// nivel se pone cada vez más difícil).
//
// NIVEL_BASE controla qué tan rápido se sube: subí este número para
// que los niveles cuesten más, bajalo para que sean más fáciles de
// conseguir. La fórmula es: coins necesarias para el nivel N =
// NIVEL_BASE * N².
export const NIVEL_BASE = 120;

/** Cuántas petoCoins hacen falta (en total, no por separado) para llegar al nivel dado. */
export function coinsParaNivel(nivel) {
    if (nivel <= 0) return 0;
    return Math.round(NIVEL_BASE * nivel * nivel);
}

/**
 * Calcula el nivel de una cuenta a partir de su saldo de petoCoins.
 * Devuelve un objeto con todo lo que hace falta para pintar una
 * insignia de nivel + barra de progreso estilo Steam:
 *   - nivel: el nivel actual (número entero, arranca en 0)
 *   - coins: el saldo usado para el cálculo
 *   - coinsNivelActual / coinsNivelSiguiente: el "piso" y el "techo"
 *     de coins del nivel actual
 *   - coinsFaltantes: cuántas coins más hacen falta para el próximo nivel
 *   - progreso: de 0 a 1, cuánto se avanzó dentro del nivel actual
 */
export function calcularNivel(coins) {
    const saldo = Math.max(0, Math.floor(Number(coins) || 0));
    let nivel = 0;
    while (coinsParaNivel(nivel + 1) <= saldo) nivel++;

    const coinsNivelActual = coinsParaNivel(nivel);
    const coinsNivelSiguiente = coinsParaNivel(nivel + 1);
    const rango = coinsNivelSiguiente - coinsNivelActual;

    return {
        nivel,
        coins: saldo,
        coinsNivelActual,
        coinsNivelSiguiente,
        coinsFaltantes: Math.max(0, coinsNivelSiguiente - saldo),
        progreso: rango > 0 ? Math.min(1, (saldo - coinsNivelActual) / rango) : 1
    };
}

/** Color de la insignia de nivel, como las "bandas" de color de los niveles de Steam. */
export function colorNivel(nivel) {
    if (nivel >= 50) return '#b9f2ff'; // diamante
    if (nivel >= 30) return '#ffd700'; // oro
    if (nivel >= 15) return '#c0c0c0'; // plata
    if (nivel >= 5) return '#cd7f32';  // bronce
    return '#8b5cf6'; // violeta (nivel inicial, es el mismo tono por defecto del sitio)
}

/** Nombre del rango/insignia de la cuenta según su nivel (misma banda que colorNivel). */
export function rangoNivel(nivel) {
    if (nivel >= 50) return 'Diamante';
    if (nivel >= 30) return 'Oro';
    if (nivel >= 15) return 'Plata';
    if (nivel >= 5) return 'Bronce';
    return 'Novato';
}

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
 * Trae los "cantidad" usuarios con más petoCoins, ordenados de mayor a
 * menor. Se usa para el cuadro "🏆 Top Petocoins" del perfil. Si falla
 * la consulta (por ejemplo, permisos de Firestore) devuelve un array
 * vacío en vez de tirar el error para arriba, así el resto del perfil
 * se sigue viendo bien aunque el ranking no cargue.
 */
export async function obtenerTopPetocoins(cantidad = 5) {
    try {
        const q = query(collection(db, 'users'), orderBy('coins', 'desc'), limit(cantidad));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    } catch (error) {
        console.error('No se pudo cargar el top de petoCoins:', error);
        return [];
    }
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

// Redes sociales que se pueden mostrar en el perfil, debajo del "Top
// Petocoins". Cualquier clave que no esté en esta lista se ignora al
// guardar (así nadie puede meter campos raros en el documento).
export const REDES_PERMITIDAS = ['instagram', 'twitter', 'tiktok', 'youtube', 'twitch', 'discord', 'kick', 'otro'];

/**
 * Guarda las redes sociales del usuario logueado (solo puede editar
 * las propias). "redes" es un objeto como { instagram: 'https://...',
 * twitter: 'https://...' }. Cada valor tiene que ser una URL http(s)
 * válida o se descarta en silencio (así un campo vacío o mal escrito
 * no rompe el guardado de los demás). Pisa por completo el campo
 * "redes" anterior con las claves permitidas que hayan venido.
 */
export async function actualizarRedesPerfil(uid, redes) {
    const user = auth.currentUser;
    if (!user || user.uid !== uid) {
        throw new Error("Solo podés editar tus propias redes.");
    }

    const redesLimpias = {};
    for (const clave of REDES_PERMITIDAS) {
        const valor = (redes && redes[clave] ? String(redes[clave]) : '').trim();
        if (!valor) continue;
        try {
            const url = new URL(valor);
            if (url.protocol === 'https:' || url.protocol === 'http:') {
                redesLimpias[clave] = valor;
            }
        } catch {
            // No era una URL válida: se descarta esa red en particular.
        }
    }

    await setDoc(doc(db, 'users', uid), { redes: redesLimpias }, { merge: true });
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

/** Devuelve la fecha de hoy como "YYYY-MM-DD" (hora local del navegador). */
function fechaHoyPetoworks() {
    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return `${hoy.getFullYear()}-${mes}-${dia}`;
}

/** A partir de los datos crudos del documento de usuario, calcula cuánto ganó hoy en Petoworks y cuánto le queda. */
function calcularProgresoPetoworks(datosUsuario) {
    const pw = datosUsuario ? datosUsuario.petoworksHoy : null;
    const ganado = (pw && pw.fecha === fechaHoyPetoworks()) ? (pw.ganado || 0) : 0;
    return { ganado, restante: Math.max(0, PETOWORKS_LIMITE_DIARIO - ganado) };
}

/**
 * Trae cuánto ganó hoy el usuario en Petoworks y cuánto le queda de
 * margen hasta el tope diario. Se usa para pintar la barra de
 * progreso al entrar a /fun/petoworks o a cualquier trabajo.
 */
export async function obtenerProgresoPetoworks(uid) {
    if (!uid) return { ganado: 0, restante: PETOWORKS_LIMITE_DIARIO };
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return { ganado: 0, restante: PETOWORKS_LIMITE_DIARIO };
    return calcularProgresoPetoworks(snap.data());
}

/**
 * Escucha en tiempo real el progreso diario de Petoworks del usuario
 * ({ ganado, restante }). callback se llama cada vez que cambia (por
 * ejemplo, al cobrar en cualquier trabajo, incluso en otra pestaña).
 * Devuelve una función para dejar de escuchar.
 */
export function suscribirProgresoPetoworks(uid, callback) {
    if (!uid) {
        callback({ ganado: 0, restante: PETOWORKS_LIMITE_DIARIO });
        return () => {};
    }
    return onSnapshot(doc(db, 'users', uid), (snap) => {
        callback(snap.exists() ? calcularProgresoPetoworks(snap.data()) : { ganado: 0, restante: PETOWORKS_LIMITE_DIARIO });
    });
}

/**
 * Acredita petoCoins ganadas en un trabajo de Petoworks a la cuenta
 * logueada actual, respetando el tope diario COMPARTIDO entre todos
 * los trabajos (PETOWORKS_LIMITE_DIARIO). Si "cantidadCruda" supera lo
 * que le queda disponible por hoy, se le acredita solo lo que le
 * queda (nunca de más), y si ya no le queda nada tira un error claro.
 *
 * Todo corre en una transacción: lee el progreso de hoy, lo resetea
 * solo si cambió la fecha, suma el saldo y actualiza el contador
 * diario en un solo paso atómico.
 *
 * Devuelve { acreditado, nuevoSaldo, ganadoHoy, restante, limiteAlcanzado }.
 */
export async function ganarPetoworks(cantidadCruda) {
    const user = auth.currentUser;
    if (!user) throw new Error("Necesitás iniciar sesión para trabajar.");

    const monto = Math.floor(Number(cantidadCruda));
    if (!Number.isFinite(monto) || monto <= 0) {
        throw new Error("Monto inválido.");
    }

    const userRef = doc(db, 'users', user.uid);
    const hoy = fechaHoyPetoworks();

    return await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error("No se encontró tu perfil.");

        const datos = snap.data();
        const { ganado: ganadoHoy, restante } = calcularProgresoPetoworks(datos);

        if (restante <= 0) {
            throw new Error(`Ya alcanzaste el límite diario de ${PETOWORKS_LIMITE_DIARIO} petoCoins en Petoworks. Volvé mañana.`);
        }

        const acreditado = Math.min(monto, restante);
        const nuevoSaldo = (datos.coins || 0) + acreditado;
        const nuevoGanadoHoy = ganadoHoy + acreditado;

        tx.update(userRef, {
            coins: nuevoSaldo,
            petoworksHoy: { fecha: hoy, ganado: nuevoGanadoHoy },
            xpJuegos: increment(acreditado)
        });

        return {
            acreditado,
            nuevoSaldo,
            ganadoHoy: nuevoGanadoHoy,
            restante: PETOWORKS_LIMITE_DIARIO - nuevoGanadoHoy,
            limiteAlcanzado: nuevoGanadoHoy >= PETOWORKS_LIMITE_DIARIO
        };
    });
}

/**
 * Le pone o le saca un "like" simple a una opinión (reacción social,
 * NO otorga petoCoins). Es un toggle libre: se puede dar y sacar las
 * veces que quieras. Es excluyente con el dislike (si tenías dislike
 * puesto, se saca solo al dar like).
 */
export async function toggleLikeOpinion(opinionId, uidQueDaLike) {
    if (!uidQueDaLike) {
        throw new Error("Necesitás iniciar sesión para dar like.");
    }
    const opinionRef = doc(db, 'opinions', opinionId);

    // Lo traemos antes de la transacción (no hace falta que esté
    // sincronizado al segundo: es solo para el nombre que va a
    // aparecer en la notificación del autor).
    const likerSnapPrevio = await getDoc(doc(db, 'users', uidQueDaLike));
    const deUsername = likerSnapPrevio.exists() ? (likerSnapPrevio.data().username || 'alguien') : 'alguien';

    await runTransaction(db, async (tx) => {
        const opinionSnap = await tx.get(opinionRef);
        if (!opinionSnap.exists()) {
            throw new Error("Esa opinión ya no existe.");
        }
        const data = opinionSnap.data();
        const likedBy = data.likedBy || [];
        const dislikedBy = data.dislikedBy || [];

        if (likedBy.includes(uidQueDaLike)) {
            tx.update(opinionRef, {
                likedBy: arrayRemove(uidQueDaLike),
                likesCount: increment(-1)
            });
            return;
        }

        const updates = {
            likedBy: arrayUnion(uidQueDaLike),
            likesCount: increment(1)
        };
        if (dislikedBy.includes(uidQueDaLike)) {
            updates.dislikedBy = arrayRemove(uidQueDaLike);
            updates.dislikesCount = increment(-1);
        }
        tx.update(opinionRef, updates);

        // Notificamos al autor del post de que le dieron like (excepto
        // si se está likeando a sí mismo: no tiene sentido notificarse).
        if (data.authorUid && data.authorUid !== uidQueDaLike) {
            const notiRef = doc(collection(db, 'users', data.authorUid, 'notificaciones'));
            tx.set(notiRef, {
                tipo: 'like',
                deUid: uidQueDaLike,
                deUsername,
                opinionId,
                leida: false,
                timestamp: serverTimestamp()
            });
        }
    });
}

/**
 * Le pone o le saca un "dislike" simple a una opinión (reacción social,
 * NO otorga ni quita petoCoins). Toggle libre, excluyente con el like.
 */
export async function toggleDislikeOpinion(opinionId, uidQueDaDislike) {
    if (!uidQueDaDislike) {
        throw new Error("Necesitás iniciar sesión para dar dislike.");
    }
    const opinionRef = doc(db, 'opinions', opinionId);

    await runTransaction(db, async (tx) => {
        const opinionSnap = await tx.get(opinionRef);
        if (!opinionSnap.exists()) {
            throw new Error("Esa opinión ya no existe.");
        }
        const data = opinionSnap.data();
        const likedBy = data.likedBy || [];
        const dislikedBy = data.dislikedBy || [];

        if (dislikedBy.includes(uidQueDaDislike)) {
            tx.update(opinionRef, {
                dislikedBy: arrayRemove(uidQueDaDislike),
                dislikesCount: increment(-1)
            });
            return;
        }

        const updates = {
            dislikedBy: arrayUnion(uidQueDaDislike),
            dislikesCount: increment(1)
        };
        if (likedBy.includes(uidQueDaDislike)) {
            updates.likedBy = arrayRemove(uidQueDaDislike);
            updates.likesCount = increment(-1);
        }
        tx.update(opinionRef, updates);
    });
}

/**
 * Le da un "Petope" a una opinión: es el reconocimiento especial (ícono
 * de petoCoin) que le regala +COINS_POR_LIKE petoCoins al autor.
 *
 * A DIFERENCIA del like/dislike de arriba, el Petope es de UNA SOLA VÍA:
 * se puede dar, pero nunca sacar. Antes esto era un toggle (como el
 * like), y como sacar el "like" no le restaba las coins ya ganadas al
 * autor, cualquiera podía darle y sacarle el Petope a un post en loop
 * y generar petoCoins infinitas para el autor (o para sí mismo usando
 * una segunda cuenta). Ahora, una vez dado, queda dado para siempre.
 */
export async function darPetope(opinionId, uidQueDaPetope) {
    if (!uidQueDaPetope) {
        throw new Error("Necesitás iniciar sesión para dar Petope.");
    }
    const opinionRef = doc(db, 'opinions', opinionId);

    await runTransaction(db, async (tx) => {
        const opinionSnap = await tx.get(opinionRef);
        if (!opinionSnap.exists()) {
            throw new Error("Esa opinión ya no existe.");
        }
        const data = opinionSnap.data();
        const petopeBy = data.petopeBy || [];

        if (petopeBy.includes(uidQueDaPetope)) {
            throw new Error("Ya le diste tu Petope a esta opinión.");
        }
        if (data.authorUid === uidQueDaPetope) {
            throw new Error("No podés darle Petope a tu propio post.");
        }

        tx.update(opinionRef, {
            petopeBy: arrayUnion(uidQueDaPetope),
            petopeCount: increment(1)
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
 * Compra un producto de la TIENDA con petoCoins.
 *
 * "producto" es uno de los objetos que están en tienda/productos.js
 * (necesita al menos: id, precio, tipo).
 *
 * - tipo 'unico': el usuario solo lo puede comprar UNA vez. Si ya lo
 *   tiene en su inventario, tira error.
 * - tipo 'multiple': se puede comprar todas las veces que quiera; el
 *   inventario guarda cuántas unidades tiene.
 *
 * Todo corre en una transacción de Firestore para que el saldo de
 * petoCoins y el inventario queden siempre sincronizados, y para que
 * nadie pueda gastar más coins de las que tiene (ni comprar dos veces
 * algo "unico" haciendo doble clic rápido, etc.).
 *
 * El inventario se guarda en users/{uid}.inventario, como un mapa
 * { idDeProducto: cantidadComprada }.
 */
export async function comprarProducto(producto) {
    const user = auth.currentUser;
    if (!user) throw new Error("Necesitás iniciar sesión para comprar.");
    if (!producto || !producto.id || typeof producto.precio !== 'number' || producto.precio <= 0) {
        throw new Error("Producto inválido.");
    }

    const userRef = doc(db, 'users', user.uid);

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        const data = snap.exists() ? snap.data() : {};
        const saldo = data.coins || 0;
        const inventario = { ...(data.inventario || {}) };

        if (producto.tipo === 'unico' && inventario[producto.id]) {
            throw new Error("Ya tenés ese producto.");
        }
        if (saldo < producto.precio) {
            throw new Error(`No tenés suficientes petoCoins. Te faltan ${producto.precio - saldo}.`);
        }

        inventario[producto.id] = (inventario[producto.id] || 0) + 1;

        tx.update(userRef, {
            coins: saldo - producto.precio,
            inventario
        });
    });
}

// Formato válido para colores: #rrggbb (hex de 6 dígitos).
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Guarda el color personalizado de perfil del usuario logueado.
 * Solo funciona si el usuario ya compró el producto 'color_personalizado'
 * en la tienda (si no lo compró, tira error y no guarda nada).
 */
export async function actualizarColorPerfil(uid, color) {
    const user = auth.currentUser;
    if (!user || user.uid !== uid) {
        throw new Error("Solo podés personalizar tu propio perfil.");
    }
    const colorLimpio = (color || '').trim();
    if (!HEX_COLOR_REGEX.test(colorLimpio)) {
        throw new Error("Ese color no es válido.");
    }

    const snap = await getDoc(doc(db, 'users', uid));
    const inventario = snap.exists() ? (snap.data().inventario || {}) : {};
    if (!inventario['color_personalizado']) {
        throw new Error("Necesitás comprar 'Color personalizado' en la tienda primero.");
    }

    await setDoc(doc(db, 'users', uid), { colorPerfil: colorLimpio }, { merge: true });
}

/**
 * Guarda el banner de tipo "colores" (degradé de dos colores) del
 * usuario logueado. Solo funciona si ya compró 'banner_personalizado'.
 * Marca bannerType: 'color' para que el banner de imagen (si había
 * uno guardado antes) deje de usarse.
 */
export async function actualizarBannerColorPerfil(uid, color1, color2) {
    const user = auth.currentUser;
    if (!user || user.uid !== uid) {
        throw new Error("Solo podés personalizar tu propio perfil.");
    }
    const c1 = (color1 || '').trim();
    const c2 = (color2 || '').trim();
    if (!HEX_COLOR_REGEX.test(c1) || !HEX_COLOR_REGEX.test(c2)) {
        throw new Error("Los colores del banner no son válidos.");
    }

    const snap = await getDoc(doc(db, 'users', uid));
    const inventario = snap.exists() ? (snap.data().inventario || {}) : {};
    if (!inventario['banner_personalizado']) {
        throw new Error("Necesitás comprar 'Banner personalizado' en la tienda primero.");
    }

    await setDoc(doc(db, 'users', uid), {
        bannerType: 'color',
        bannerColor1: c1,
        bannerColor2: c2
    }, { merge: true });
}

/**
 * Guarda el banner de tipo "imagen o GIF" (un link) del usuario
 * logueado. Solo funciona si ya compró 'banner_personalizado'.
 * Marca bannerType: 'imagen' para que se use la imagen en vez de los
 * colores guardados (si había alguno).
 */
export async function actualizarBannerImagenPerfil(uid, url) {
    const user = auth.currentUser;
    if (!user || user.uid !== uid) {
        throw new Error("Solo podés personalizar tu propio perfil.");
    }
    const urlLimpia = (url || '').trim();

    let urlValida;
    try {
        urlValida = new URL(urlLimpia);
    } catch {
        throw new Error("Ese link no es una URL válida.");
    }
    if (urlValida.protocol !== 'https:' && urlValida.protocol !== 'http:') {
        throw new Error("El link tiene que empezar con http:// o https://");
    }

    const snap = await getDoc(doc(db, 'users', uid));
    const inventario = snap.exists() ? (snap.data().inventario || {}) : {};
    if (!inventario['banner_personalizado']) {
        throw new Error("Necesitás comprar 'Banner personalizado' en la tienda primero.");
    }

    await setDoc(doc(db, 'users', uid), {
        bannerType: 'imagen',
        bannerImageURL: urlLimpia
    }, { merge: true });
}

/**
 * Guarda cuál es el marco de perfil ACTIVO del usuario logueado
 * (el borde de la foto). "marcoId" tiene que ser el id de un
 * producto categoria:'marco' que el usuario ya haya comprado en la
 * tienda (está en su inventario), o el texto 'ninguno' para sacarse
 * cualquier marco puesto.
 *
 * El usuario puede tener comprados varios marcos a la vez (quedan
 * guardados en su inventario para siempre), pero solo uno puede estar
 * activo/puesto en su perfil.
 */
export async function actualizarMarcoPerfil(uid, marcoId) {
    const user = auth.currentUser;
    if (!user || user.uid !== uid) {
        throw new Error("Solo podés personalizar tu propio perfil.");
    }
    const idLimpio = (marcoId || 'ninguno').trim();

    if (idLimpio !== 'ninguno') {
        const producto = PRODUCTOS.find(p => p.id === idLimpio && p.categoria === 'marco');
        if (!producto) {
            throw new Error("Ese marco no existe.");
        }

        const snap = await getDoc(doc(db, 'users', uid));
        const inventario = snap.exists() ? (snap.data().inventario || {}) : {};
        if (!inventario[idLimpio]) {
            throw new Error("Necesitás comprar ese marco en la tienda primero.");
        }
    }

    await setDoc(doc(db, 'users', uid), { marcoActivo: idLimpio }, { merge: true });
}

/**
 * Guarda el link de música de fondo del perfil del usuario logueado.
 * Solo funciona si ya compró 'musica_perfil'. Acepta un link de
 * YouTube o un link directo a un archivo de audio (.mp3/.ogg/.wav).
 * Pasar un string vacío ('') saca la música del perfil.
 */
export async function actualizarMusicaPerfil(uid, url) {
    const user = auth.currentUser;
    if (!user || user.uid !== uid) {
        throw new Error("Solo podés personalizar tu propio perfil.");
    }
    const urlLimpia = (url || '').trim();

    if (urlLimpia) {
        let urlValida;
        try {
            urlValida = new URL(urlLimpia);
        } catch {
            throw new Error("Ese link no es una URL válida.");
        }
        if (urlValida.protocol !== 'https:' && urlValida.protocol !== 'http:') {
            throw new Error("El link tiene que empezar con http:// o https://");
        }

        const snap = await getDoc(doc(db, 'users', uid));
        const inventario = snap.exists() ? (snap.data().inventario || {}) : {};
        if (!inventario['musica_perfil']) {
            throw new Error("Necesitás comprar 'Música de perfil' en la tienda primero.");
        }
    }

    await setDoc(doc(db, 'users', uid), { musicaURL: urlLimpia }, { merge: true });
}

/**
 * Dona "cantidad" de petoCoins de la cuenta logueada actual a la cuenta
 * "uidReceptor". Resta y suma en una sola transacción para que quede
 * siempre consistente (o se hacen las dos escrituras, o ninguna), y le
 * deja al receptor una notificación avisándole quién y cuánto le donó.
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
    const emisorSnapPrevio = await getDoc(emisorRef);
    const deUsername = emisorSnapPrevio.exists() ? (emisorSnapPrevio.data().username || 'alguien') : 'alguien';
    const notiRef = doc(collection(db, 'users', uidReceptor, 'notificaciones'));

    await runTransaction(db, async (tx) => {
        const emisorSnap = await tx.get(emisorRef);
        if (!emisorSnap.exists()) throw new Error("No se encontró tu perfil.");

        const saldoActual = emisorSnap.data().coins || 0;
        if (saldoActual < monto) {
            throw new Error("No tenés suficientes petoCoins para donar eso.");
        }

        tx.update(emisorRef, { coins: increment(-monto) });
        tx.update(receptorRef, { coins: increment(monto) });
        tx.set(notiRef, {
            tipo: 'donacion',
            deUid: uidEmisor,
            deUsername,
            monto,
            leida: false,
            timestamp: serverTimestamp()
        });
    });
}

/**
 * Le regala un producto de la TIENDA a "uidReceptor", pagado con las
 * petoCoins de la cuenta logueada actual. El producto entra al
 * INVENTARIO DEL RECEPTOR (no al del que regala), y le queda una
 * notificación avisándole quién se lo regaló.
 *
 * Igual que comprarProducto: si es tipo 'unico' y el receptor ya lo
 * tiene, tira error (no tiene sentido regalarle algo que ya tiene).
 * Todo corre en una transacción para que el saldo del emisor, el
 * inventario del receptor y la notificación queden sincronizados.
 *
 * "mensaje" es opcional: un texto corto (se recorta a 200 caracteres)
 * que el que regala le puede dejar al receptor, y que aparece junto
 * con el regalo en su notificación.
 */
export async function regalarProducto(uidReceptor, producto, mensaje) {
    const uidEmisor = auth.currentUser ? auth.currentUser.uid : null;
    if (!uidEmisor) throw new Error("Necesitás iniciar sesión para regalar.");
    if (!uidReceptor) throw new Error("Falta el destinatario.");
    if (uidReceptor === uidEmisor) throw new Error("No podés regalarte algo a vos mismo, comprátelo en la tienda.");
    if (!producto || !producto.id || typeof producto.precio !== 'number' || producto.precio <= 0) {
        throw new Error("Producto inválido.");
    }
    const mensajeLimpio = typeof mensaje === 'string' ? mensaje.trim().slice(0, 200) : '';

    const emisorRef = doc(db, 'users', uidEmisor);
    const receptorRef = doc(db, 'users', uidReceptor);
    const emisorSnapPrevio = await getDoc(emisorRef);
    const deUsername = emisorSnapPrevio.exists() ? (emisorSnapPrevio.data().username || 'alguien') : 'alguien';
    const notiRef = doc(collection(db, 'users', uidReceptor, 'notificaciones'));

    await runTransaction(db, async (tx) => {
        const emisorSnap = await tx.get(emisorRef);
        const receptorSnap = await tx.get(receptorRef);
        if (!emisorSnap.exists()) throw new Error("No se encontró tu perfil.");
        if (!receptorSnap.exists()) throw new Error("No se encontró el perfil de esa persona.");

        const saldoEmisor = emisorSnap.data().coins || 0;
        if (saldoEmisor < producto.precio) {
            throw new Error(`No tenés suficientes petoCoins. Te faltan ${producto.precio - saldoEmisor}.`);
        }

        const inventarioReceptor = { ...(receptorSnap.data().inventario || {}) };
        if (producto.tipo === 'unico' && inventarioReceptor[producto.id]) {
            throw new Error("Esa persona ya tiene ese producto.");
        }
        inventarioReceptor[producto.id] = (inventarioReceptor[producto.id] || 0) + 1;

        tx.update(emisorRef, { coins: increment(-producto.precio) });
        tx.update(receptorRef, { inventario: inventarioReceptor });
        tx.set(notiRef, {
            tipo: 'regalo',
            deUid: uidEmisor,
            deUsername,
            productoId: producto.id,
            productoNombre: producto.nombre,
            productoEmoji: producto.emoji,
            ...(mensajeLimpio ? { mensaje: mensajeLimpio } : {}),
            leida: false,
            timestamp: serverTimestamp()
        });
    });
}

/**
 * Escucha en tiempo real las últimas notificaciones (donaciones y
 * regalos recibidos) del usuario logueado. callback(notificaciones) se
 * llama cada vez que hay una nueva o cambia el estado de "leída".
 * Devuelve una función para dejar de escuchar.
 */
export function suscribirNotificaciones(uid, callback) {
    if (!uid) {
        callback([]);
        return () => {};
    }
    const q = query(
        collection(db, 'users', uid, 'notificaciones'),
        orderBy('timestamp', 'desc'),
        limit(30)
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

/** Marca una notificación puntual como leída. */
export async function marcarNotificacionLeida(uid, notificacionId) {
    if (!uid || !notificacionId) return;
    await setDoc(doc(db, 'users', uid, 'notificaciones', notificacionId), { leida: true }, { merge: true });
}

/** Marca como leídas todas las notificaciones que todavía no lo estaban. */
export async function marcarTodasLasNotificacionesLeidas(uid, notificaciones) {
    if (!uid) return;
    const pendientes = (notificaciones || []).filter(n => !n.leida);
    await Promise.all(pendientes.map(n => marcarNotificacionLeida(uid, n.id)));
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
// Todo lo de acá arriba (likes, donaciones, regalos, banear, dar
// admin, borrar opiniones) hace escrituras DIRECTAS desde el
// navegador a documentos que no son "los tuyos" (el post de otro, el
// perfil de otro, la subcolección de notificaciones de otro).
// Firestore bloquea eso por defecto con
// "Missing or insufficient permissions" a menos que las Reglas de
// Seguridad del proyecto lo permitan explícitamente.
// Te paso el archivo de reglas recomendado aparte ("reglas actuales.txt")
// — sin pegarlo en Firebase Console (Firestore Database → Reglas), ni
// los likes, ni donar/regalar, ni banear/dar-admin, ni borrar
// opiniones/comentarios van a funcionar, aunque el código de acá esté
// perfecto. Para las notificaciones específicamente, la subcolección
// users/{uid}/notificaciones necesita permitir: que CUALQUIER usuario
// logueado pueda CREAR una notificación dentro de la subcolección de
// OTRO usuario (para poder avisarle que le donaron/regalaron/likearon
// algo — el like ahora también genera notificación), pero que solo el
// DUEÑO de esa subcolección la pueda LEER o marcar como leída. Y para
// que cada usuario pueda borrar SUS PROPIOS comentarios del foro (no
// solo un admin), la subcolección opinions/{opinionId}/comments
// necesita una regla de "delete" que permita al dueño del comentario
// (authorUid == su uid) además del admin.
// ============================================================