// ============================================================
// truco.js — motor de Truco Argentino (2 jugadores) para RezTored
// Sigue el mismo patrón que poker.js: Firestore como única "base
// de datos", el host reparte las cartas (únicas escrituras a
// hands/{uid}, que solo el dueño puede leer). A diferencia del
// poker, las cartas jugadas se vuelven públicas apenas se juegan
// (se guardan directo en el documento de la sala), así que no
// hace falta una subcolección de "reveals" para el juego de cartas.
// Es una versión simplificada: envido único (sin real envido ni
// falta envido) y escalada de truco → retruco → vale cuatro.
// ============================================================

import { db, auth } from '../../reztored-auth.js';
import {
    doc, getDoc, setDoc, runTransaction, onSnapshot, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const CODIGO_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generarCodigo() {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODIGO_CHARS[Math.floor(Math.random() * CODIGO_CHARS.length)];
    return c;
}

function refSala(code) { return doc(db, 'trucoRooms', code); }
function refMano(code, uid) { return doc(db, 'trucoRooms', code, 'hands', uid); }

// ============================================================
// MAZO ESPAÑOL DE 40 CARTAS Y JERARQUÍA DEL TRUCO
// ============================================================

const NUMEROS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const PALOS = ['E', 'B', 'O', 'C']; // Espada, Basto, Oro, Copa
const NOMBRE_PALO = { E: 'Espada', B: 'Basto', O: 'Oro', C: 'Copa' };
const SIMBOLO_PALO = { E: '🗡️', B: '🌵', O: '🪙', C: '🏆' };

export function crearMazo() {
    const mazo = [];
    for (const p of PALOS) {
        for (const n of NUMEROS) {
            mazo.push({ numero: n, palo: p, id: `${n}${p}` });
        }
    }
    return mazo;
}

export function mezclarMazo(mazo) {
    const copia = [...mazo];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
}

/** Jerarquía de una carta para "piezas" (quién gana la mano de cartas). Más alto = mejor. */
export function jerarquiaTruco(carta) {
    const { numero: n, palo: p } = carta;
    if (n === 1 && p === 'E') return 14; // Ancho de espada
    if (n === 1 && p === 'B') return 13; // Ancho de basto
    if (n === 7 && p === 'E') return 12; // Siete de espada
    if (n === 7 && p === 'O') return 11; // Siete de oro
    if (n === 3) return 10;
    if (n === 2) return 9;
    if (n === 1) return 8; // 1 de oro / 1 de copa (falsos anchos)
    if (n === 12) return 7;
    if (n === 11) return 6;
    if (n === 10) return 5;
    if (n === 7) return 4; // 7 de basto / 7 de copa
    if (n === 6) return 3;
    if (n === 5) return 2;
    if (n === 4) return 1;
    return 0;
}

function valorEnvido(numero) { return numero >= 10 ? 0 : numero; }

/** Calcula el mejor valor de envido posible con 3 cartas. */
export function calcularEnvido(cartas) {
    const porPalo = {};
    for (const c of cartas) (porPalo[c.palo] ||= []).push(c);

    let mejor = 0;
    let huboPar = false;
    for (const palo in porPalo) {
        const grupo = porPalo[palo];
        if (grupo.length >= 2) {
            huboPar = true;
            const valores = grupo.map(c => valorEnvido(c.numero)).sort((a, b) => b - a);
            const suma = 20 + valores[0] + valores[1];
            if (suma > mejor) mejor = suma;
        }
    }
    if (!huboPar) mejor = Math.max(...cartas.map(c => valorEnvido(c.numero)));
    return mejor;
}

export function nombreCarta(carta) {
    const nombres = { 1: 'As', 10: 'Sota', 11: 'Caballo', 12: 'Rey' };
    return `${nombres[carta.numero] || carta.numero} de ${NOMBRE_PALO[carta.palo]}`;
}
export function simboloCarta(carta) { return SIMBOLO_PALO[carta.palo]; }

// ============================================================
// CREAR / UNIRSE / SALIR
// ============================================================

export async function crearSala({ apuesta = 50, puntosLimite = 15 }) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');

    apuesta = parseInt(apuesta);
    if (!Number.isInteger(apuesta) || apuesta <= 0) {
        throw new Error('La sala tiene que jugarse por una cantidad de petoCoins mayor a 0.');
    }

    let code;
    for (let intento = 0; intento < 5; intento++) {
        code = generarCodigo();
        const snap = await getDoc(refSala(code));
        if (!snap.exists()) break;
        code = null;
    }
    if (!code) throw new Error('No se pudo generar la sala, probá de nuevo.');

    await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await tx.get(userRef);
        const saldo = userSnap.exists() ? (userSnap.data().coins || 0) : 0;
        if (saldo < apuesta) throw new Error(`No tenés suficientes petoCoins. Tenés ${saldo}.`);

        tx.update(userRef, { coins: increment(-apuesta) });

        tx.set(refSala(code), {
            code,
            hostUid: user.uid,
            createdAt: serverTimestamp(),
            status: 'lobby',
            apuesta,
            puntosLimite,
            maxPlayers: 2,
            players: [{
                uid: user.uid,
                username: userSnap.data()?.username || user.displayName || 'jugador',
                photoURL: userSnap.data()?.photoURL || user.photoURL || '',
                score: 0,
                cartasJugadas: [],
                envidoValor: null
            }],
            manoIndex: 0,
            liderIndex: 0,
            turnIndex: -1,
            phase: 'waiting',
            rondaActual: 0,
            rondas: [],
            envido: { estado: 'ninguno', cantadoPor: null, jugadoEnEstaMano: false },
            truco: { estado: 'ninguno', valor: 1, cantadoPor: null, pendiente: false, propuesto: null },
            handNumber: 0,
            resultMessage: ''
        });
    });

    return code;
}

export async function unirseSala(code) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');
    code = (code || '').trim().toUpperCase();

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const salaSnap = await tx.get(salaRef);
        if (!salaSnap.exists()) throw new Error('No existe ninguna sala con ese código.');
        const sala = salaSnap.data();

        if (sala.players.some(p => p.uid === user.uid)) return; // ya está adentro
        if (sala.players.length >= sala.maxPlayers) throw new Error('La sala está llena.');

        const userRef = doc(db, 'users', user.uid);
        const userSnap = await tx.get(userRef);
        const saldo = userSnap.exists() ? (userSnap.data().coins || 0) : 0;
        if (saldo < sala.apuesta) throw new Error(`No tenés suficientes petoCoins. Tenés ${saldo}.`);

        tx.update(userRef, { coins: increment(-sala.apuesta) });

        const nuevoJugador = {
            uid: user.uid,
            username: userSnap.data()?.username || user.displayName || 'jugador',
            photoURL: userSnap.data()?.photoURL || user.photoURL || '',
            score: 0,
            cartasJugadas: [],
            envidoValor: null
        };

        tx.update(salaRef, { players: [...sala.players, nuevoJugador] });
    });

    return code;
}

/** Se va de la mesa antes de que arranque la partida y recupera su apuesta. */
export async function salirDeMesa(code) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const salaSnap = await tx.get(salaRef);
        if (!salaSnap.exists()) return;
        const sala = salaSnap.data();

        if (!['waiting', 'lobby', 'hand_over', 'game_over'].includes(sala.phase)) {
            throw new Error('No podés salir en medio de una mano. Esperá a que termine.');
        }

        const jugador = sala.players.find(p => p.uid === user.uid);
        if (!jugador) return;

        if (sala.phase !== 'game_over') {
            const userRef = doc(db, 'users', user.uid);
            tx.update(userRef, { coins: increment(sala.apuesta) });
        }

        const restantes = sala.players.filter(p => p.uid !== user.uid);
        if (restantes.length === 0) {
            tx.update(salaRef, { players: [], status: 'closed' });
        } else {
            const nuevoHost = sala.hostUid === user.uid ? restantes[0].uid : sala.hostUid;
            tx.update(salaRef, { players: restantes, hostUid: nuevoHost, status: 'closed' });
        }
    });
}

// ============================================================
// SUSCRIPCIÓN
// ============================================================

export function suscribirseASala(code, callback) {
    return onSnapshot(refSala(code), (snap) => {
        callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
}

/** Trae mi propia mano (3 cartas) para esta sala. Null si no hay o no está dentro. */
export async function miMano(code) {
    const user = auth.currentUser;
    if (!user) return null;
    try {
        const snap = await getDoc(refMano(code, user.uid));
        return snap.exists() ? snap.data().cards : null;
    } catch {
        return null;
    }
}

// ============================================================
// REPARTIR MANO (solo host)
// ============================================================

export async function repartirMano(code) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');

    const mazo = mezclarMazo(crearMazo());

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const salaSnap = await tx.get(salaRef);
        if (!salaSnap.exists()) throw new Error('La sala no existe.');
        const sala = salaSnap.data();

        if (sala.hostUid !== user.uid) throw new Error('Solo quien creó la sala puede repartir.');
        if (sala.players.length !== 2) throw new Error('Hacen falta 2 jugadores.');
        if (!['waiting', 'hand_over'].includes(sala.phase)) throw new Error('No se puede repartir ahora.');

        let cursor = 0;
        for (const j of sala.players) {
            const cartas = [mazo[cursor], mazo[cursor + 1], mazo[cursor + 2]];
            cursor += 3;
            tx.set(refMano(code, j.uid), { cards: cartas });
        }

        // el "mano" (quien lidera) alterna cada mano jugada
        const nuevoManoIndex = sala.handNumber === 0 ? 0 : (sala.manoIndex + 1) % 2;

        const players = sala.players.map(p => ({ ...p, cartasJugadas: [], envidoValor: null }));

        tx.update(salaRef, {
            players,
            status: 'playing',
            phase: 'jugando',
            manoIndex: nuevoManoIndex,
            liderIndex: nuevoManoIndex,
            turnIndex: nuevoManoIndex,
            rondaActual: 0,
            rondas: [],
            envido: { estado: 'ninguno', cantadoPor: null, jugadoEnEstaMano: false },
            truco: { estado: 'ninguno', valor: 1, cantadoPor: null, pendiente: false, propuesto: null },
            handNumber: increment(1),
            resultMessage: ''
        });
    });
}

// ============================================================
// JUGAR UNA CARTA
// ============================================================

export async function jugarCarta(code, cartaId) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');

    const manoSnap = await getDoc(refMano(code, user.uid));
    if (!manoSnap.exists()) throw new Error('No tenés cartas.');
    const misCartas = manoSnap.data().cards;
    const carta = misCartas.find(c => c.id === cartaId);
    if (!carta) throw new Error('Esa carta no está en tu mano.');

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const salaSnap = await tx.get(salaRef);
        if (!salaSnap.exists()) throw new Error('La sala no existe.');
        const sala = salaSnap.data();

        if (sala.phase !== 'jugando') throw new Error('No se puede jugar ahora.');
        if (sala.envido.estado !== 'ninguno' && sala.envido.estado !== 'resuelto') {
            throw new Error('Hay un envido pendiente de respuesta.');
        }
        if (sala.truco.pendiente) throw new Error('Hay un truco pendiente de respuesta.');

        const players = sala.players.map(p => ({ ...p }));
        const idx = players.findIndex(p => p.uid === user.uid);
        if (idx < 0) throw new Error('No estás en esta mesa.');
        if (sala.turnIndex !== idx) throw new Error('Todavía no es tu turno.');

        const rival = 1 - idx;
        if (players[idx].cartasJugadas.some(c => c.id === carta.id)) throw new Error('Ya jugaste esa carta.');
        if (players[idx].cartasJugadas.length !== sala.rondaActual) throw new Error('Ya jugaste en esta ronda.');

        players[idx].cartasJugadas = [...players[idx].cartasJugadas, carta];

        let update = { players };

        const ambosJugaron = players[idx].cartasJugadas.length === sala.rondaActual + 1 &&
            players[rival].cartasJugadas.length === sala.rondaActual + 1;

        if (!ambosJugaron) {
            update.turnIndex = rival;
        } else {
            // se completó la ronda de cartas: resolver quién la gana
            const cA = players[0].cartasJugadas[sala.rondaActual];
            const cB = players[1].cartasJugadas[sala.rondaActual];
            const rA = jerarquiaTruco(cA), rB = jerarquiaTruco(cB);

            let ganadorRonda = null; // uid o 'parda'
            if (rA > rB) ganadorRonda = players[0].uid;
            else if (rB > rA) ganadorRonda = players[1].uid;
            else ganadorRonda = 'parda';

            const rondas = [...sala.rondas, { ganador: ganadorRonda }];
            let liderIndex = sala.liderIndex;
            if (ganadorRonda !== 'parda') {
                liderIndex = players.findIndex(p => p.uid === ganadorRonda);
            }

            const conteo = { [players[0].uid]: 0, [players[1].uid]: 0 };
            rondas.forEach(r => { if (r.ganador !== 'parda') conteo[r.ganador]++; });

            let ganadorMano = null;
            if (conteo[players[0].uid] >= 2) ganadorMano = players[0].uid;
            else if (conteo[players[1].uid] >= 2) ganadorMano = players[1].uid;
            else if (rondas.length >= 3) {
                if (conteo[players[0].uid] > conteo[players[1].uid]) ganadorMano = players[0].uid;
                else if (conteo[players[1].uid] > conteo[players[0].uid]) ganadorMano = players[1].uid;
                else ganadorMano = players[sala.manoIndex].uid; // todo parda: gana el mano
            }

            if (ganadorMano) {
                const gIdx = players.findIndex(p => p.uid === ganadorMano);
                players[gIdx].score += sala.truco.valor;
                update.players = players;
                update.rondas = rondas;
                update.liderIndex = liderIndex;
                update.turnIndex = -1;

                if (players[gIdx].score >= sala.puntosLimite) {
                    update.phase = 'game_over';
                    update.status = 'finished';
                    update.resultMessage = `${players[gIdx].username} ganó la partida ${players[gIdx].score} a ${players[1 - gIdx].score}.`;
                } else {
                    update.phase = 'hand_over';
                    update.resultMessage = `${players[gIdx].username} se llevó la mano (+${sala.truco.valor}).`;
                }
            } else {
                update.rondas = rondas;
                update.liderIndex = liderIndex;
                update.rondaActual = sala.rondaActual + 1;
                update.turnIndex = liderIndex;
            }
        }

        tx.update(salaRef, update);
    });

    await pagarSiTerminoJuego(code);
}

// ============================================================
// ENVIDO
// ============================================================

export async function cantarEnvido(code) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const salaSnap = await tx.get(salaRef);
        if (!salaSnap.exists()) throw new Error('La sala no existe.');
        const sala = salaSnap.data();

        if (sala.phase !== 'jugando') throw new Error('No se puede cantar ahora.');
        if (sala.envido.jugadoEnEstaMano) throw new Error('El envido ya se cantó en esta mano.');
        if (sala.envido.estado !== 'ninguno') throw new Error('Ya hay un envido pendiente.');
        if (sala.truco.pendiente) throw new Error('Hay un truco pendiente de respuesta.');

        const totalJugadas = sala.players[0].cartasJugadas.length + sala.players[1].cartasJugadas.length;
        if (sala.rondaActual !== 0 || totalJugadas >= 2) {
            throw new Error('El envido solo se puede cantar en la primera ronda.');
        }

        const idx = sala.players.findIndex(p => p.uid === user.uid);
        if (idx < 0) throw new Error('No estás en esta mesa.');
        if (sala.turnIndex !== idx) throw new Error('Todavía no es tu turno.');

        tx.update(salaRef, {
            envido: { estado: 'cantado', cantadoPor: user.uid, jugadoEnEstaMano: true }
        });
    });
}

export async function responderEnvido(code, respuesta) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const salaSnap = await tx.get(salaRef);
        if (!salaSnap.exists()) throw new Error('La sala no existe.');
        const sala = salaSnap.data();

        if (sala.envido.estado !== 'cantado') throw new Error('No hay envido para responder.');
        if (sala.envido.cantadoPor === user.uid) throw new Error('No podés responderte a vos mismo.');

        const players = sala.players.map(p => ({ ...p }));
        const cantorIdx = players.findIndex(p => p.uid === sala.envido.cantadoPor);

        if (respuesta === 'no_quiero') {
            players[cantorIdx].score += 1;
            tx.update(salaRef, {
                players,
                envido: { estado: 'ninguno', cantadoPor: null, jugadoEnEstaMano: true }
            });
        } else if (respuesta === 'quiero') {
            tx.update(salaRef, { envido: { estado: 'esperando_valores', cantadoPor: sala.envido.cantadoPor, jugadoEnEstaMano: true } });
        } else {
            throw new Error('Respuesta inválida.');
        }
    });

    await pagarSiTerminoJuego(code);
}

/** Cada jugador declara su propio valor de envido (calculado de su mano). Resuelve cuando ambos lo hicieron. */
export async function declararValorEnvido(code) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');

    const manoSnap = await getDoc(refMano(code, user.uid));
    if (!manoSnap.exists()) throw new Error('No tenés cartas.');
    const valor = calcularEnvido(manoSnap.data().cards);

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const salaSnap = await tx.get(salaRef);
        if (!salaSnap.exists()) throw new Error('La sala no existe.');
        const sala = salaSnap.data();

        if (sala.envido.estado !== 'esperando_valores') throw new Error('No corresponde declarar ahora.');

        const players = sala.players.map(p => ({ ...p }));
        const idx = players.findIndex(p => p.uid === user.uid);
        if (idx < 0) throw new Error('No estás en esta mesa.');
        if (players[idx].envidoValor !== null) return; // ya declaró

        players[idx].envidoValor = valor;

        const rival = players[1 - idx];
        if (rival.envidoValor !== null) {
            // resolver: en empate gana el "mano"
            let ganadorIdx;
            if (players[idx].envidoValor > rival.envidoValor) ganadorIdx = idx;
            else if (rival.envidoValor > players[idx].envidoValor) ganadorIdx = 1 - idx;
            else ganadorIdx = sala.manoIndex;

            players[ganadorIdx].score += 2;
            tx.update(salaRef, {
                players: players.map(p => ({ ...p, envidoValor: null })),
                envido: { estado: 'ninguno', cantadoPor: null, jugadoEnEstaMano: true },
                resultMessage: `${players[ganadorIdx].username} ganó el envido (${Math.max(players[0].envidoValor ?? 0, players[1].envidoValor ?? 0)}).`
            });
        } else {
            tx.update(salaRef, { players });
        }
    });

    await pagarSiTerminoJuego(code);
}

// ============================================================
// TRUCO / RETRUCO / VALE CUATRO
// ============================================================

const SIGUIENTE_NIVEL = { ninguno: 'truco', truco: 'retruco', retruco: 'valecuatro' };
const VALOR_NIVEL = { truco: 2, retruco: 3, valecuatro: 4 };

export async function cantarTruco(code) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const salaSnap = await tx.get(salaRef);
        if (!salaSnap.exists()) throw new Error('La sala no existe.');
        const sala = salaSnap.data();

        if (sala.phase !== 'jugando') throw new Error('No se puede cantar ahora.');
        if (sala.truco.pendiente) throw new Error('Ya hay un canto pendiente.');
        if (sala.envido.estado !== 'ninguno' && sala.envido.estado !== 'resuelto') {
            throw new Error('Resolvé el envido primero.');
        }

        const siguiente = SIGUIENTE_NIVEL[sala.truco.estado];
        if (!siguiente) throw new Error('Ya se cantó vale cuatro, no hay más para subir.');

        const idx = sala.players.findIndex(p => p.uid === user.uid);
        if (idx < 0) throw new Error('No estás en esta mesa.');
        if (sala.truco.cantadoPor === user.uid && sala.truco.estado !== 'ninguno') {
            throw new Error('Le toca responder al rival.');
        }

        tx.update(salaRef, {
            truco: { ...sala.truco, pendiente: true, cantadoPor: user.uid, propuesto: siguiente }
        });
    });
}

export async function responderTruco(code, respuesta) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const salaSnap = await tx.get(salaRef);
        if (!salaSnap.exists()) throw new Error('La sala no existe.');
        const sala = salaSnap.data();

        if (!sala.truco.pendiente) throw new Error('No hay ningún canto pendiente.');
        if (sala.truco.cantadoPor === user.uid) throw new Error('No podés responderte a vos mismo.');

        const players = sala.players.map(p => ({ ...p }));
        const cantorIdx = players.findIndex(p => p.uid === sala.truco.cantadoPor);

        if (respuesta === 'no_quiero') {
            players[cantorIdx].score += sala.truco.valor; // vale lo último aceptado (mínimo 1)
            let update = {
                players,
                truco: { estado: 'ninguno', valor: 1, cantadoPor: null, pendiente: false, propuesto: null },
                phase: 'hand_over',
                turnIndex: -1,
                resultMessage: `${players[cantorIdx].username} se llevó la mano (+${sala.truco.valor}) porque el rival no quiso.`
            };
            if (players[cantorIdx].score >= sala.puntosLimite) {
                update.phase = 'game_over';
                update.status = 'finished';
                update.resultMessage = `${players[cantorIdx].username} ganó la partida ${players[cantorIdx].score} a ${players[1 - cantorIdx].score}.`;
            }
            tx.update(salaRef, update);
        } else if (respuesta === 'quiero') {
            tx.update(salaRef, {
                truco: {
                    estado: sala.truco.propuesto,
                    valor: VALOR_NIVEL[sala.truco.propuesto],
                    cantadoPor: sala.truco.cantadoPor,
                    pendiente: false,
                    propuesto: null
                }
            });
        } else {
            throw new Error('Respuesta inválida.');
        }
    });

    await pagarSiTerminoJuego(code);
}

// ============================================================
// PAGO AL GANAR LA PARTIDA
// ============================================================

async function pagarSiTerminoJuego(code) {
    const salaSnap = await getDoc(refSala(code));
    if (!salaSnap.exists()) return;
    const sala = salaSnap.data();
    if (sala.phase !== 'game_over' || sala.status === 'closed') return;

    const user = auth.currentUser;
    if (!user) return;

    const ganador = sala.players.reduce((a, b) => (a.score >= sala.puntosLimite ? a : b), sala.players[0]);
    // solo el ganador ejecuta el pago para evitar dobles pagos, y una sola vez (status pasa a 'closed')
    if (ganador.uid !== user.uid) return;

    try {
        await runTransaction(db, async (tx) => {
            const salaRef = refSala(code);
            const salaSnap2 = await tx.get(salaRef);
            if (!salaSnap2.exists()) return;
            const sala2 = salaSnap2.data();
            if (sala2.status === 'closed') return; // ya se pagó

            const userRef = doc(db, 'users', user.uid);
            tx.update(userRef, { coins: increment(sala2.apuesta * 2) });
            tx.update(salaRef, { status: 'closed' });
        });
    } catch { /* concurrencia: si ya se pagó, no pasa nada */ }
}