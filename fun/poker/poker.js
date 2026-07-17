// ============================================================
// poker.js — motor de Texas Hold'em multijugador para RezTored
// Usa Firestore (capa gratis) como única "base de datos". No hay
// servidor propio: el navegador de quien crea la sala (host) es
// el único que puede leer el mazo, así que es el que reparte las
// cartas comunitarias. Cada jugador es el único que puede leer
// sus propias cartas de mano.
// ============================================================

import { db, auth } from '../../reztored-auth.js';
import {
    doc, collection, setDoc, getDoc, getDocs, deleteDoc,
    onSnapshot, runTransaction, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { crearMazo, mezclarMazo, mejorMano, compararManos } from './evaluator.js';

const CODIGO_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusión

function generarCodigo() {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODIGO_CHARS[Math.floor(Math.random() * CODIGO_CHARS.length)];
    return c;
}

function refSala(code) { return doc(db, 'pokerRooms', code); }
function refDeck(code) { return doc(db, 'pokerRooms', code, 'dealer', 'deck'); }
function refMano(code, uid) { return doc(db, 'pokerRooms', code, 'hands', uid); }
function refReveal(code, uid) { return doc(db, 'pokerRooms', code, 'reveals', uid); }

// --- utilidades de turno ---
function siguienteIndice(players, desde, statusValidos) {
    const n = players.length;
    for (let i = 1; i <= n; i++) {
        const idx = (desde + i) % n;
        if (statusValidos.includes(players[idx].status)) return idx;
    }
    return -1;
}

function jugadoresEnMano(players) {
    return players.filter(p => p.status === 'active' || p.status === 'allin');
}

// ============================================================
// CREAR / UNIRSE / SALIR
// ============================================================

export async function crearSala({ smallBlind = 10, bigBlind = 20, buyIn = 500 }) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');

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
        if (saldo < buyIn) throw new Error(`No tenés suficientes petoCoins. Tenés ${saldo}.`);

        tx.update(userRef, { coins: increment(-buyIn) });

        tx.set(refSala(code), {
            code,
            hostUid: user.uid,
            createdAt: serverTimestamp(),
            status: 'lobby',
            smallBlind, bigBlind,
            maxPlayers: 8,
            players: [{
                uid: user.uid,
                username: userSnap.data()?.username || user.displayName || 'jugador',
                photoURL: userSnap.data()?.photoURL || user.photoURL || '',
                tableChips: buyIn,
                buyIn,
                status: 'sitout',
                currentBet: 0,
                totalBetHand: 0,
                hasActed: false
            }],
            dealerIndex: 0,
            turnIndex: -1,
            phase: 'waiting',
            communityCards: [],
            pot: 0,
            currentBet: 0,
            minRaise: bigBlind,
            handNumber: 0,
            roundComplete: false,
            resultMessage: ''
        });
    });

    return code;
}

export async function unirseSala(code, buyIn = 500) {
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
        if (saldo < buyIn) throw new Error(`No tenés suficientes petoCoins. Tenés ${saldo}.`);

        tx.update(userRef, { coins: increment(-buyIn) });

        const nuevoJugador = {
            uid: user.uid,
            username: userSnap.data()?.username || user.displayName || 'jugador',
            photoURL: userSnap.data()?.photoURL || user.photoURL || '',
            tableChips: buyIn,
            buyIn,
            status: 'sitout',
            currentBet: 0,
            totalBetHand: 0,
            hasActed: false
        };

        tx.update(salaRef, { players: [...sala.players, nuevoJugador] });
    });

    return code;
}

/** Se va de la mesa y recupera sus fichas como petoCoins. Solo entre manos. */
export async function salirDeMesa(code) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const salaSnap = await tx.get(salaRef);
        if (!salaSnap.exists()) return;
        const sala = salaSnap.data();

        if (['preflop', 'flop', 'turn', 'river', 'showdown'].includes(sala.phase)) {
            throw new Error('No podés salir en medio de una mano. Esperá a que termine.');
        }

        const jugador = sala.players.find(p => p.uid === user.uid);
        if (!jugador) return;

        // XP de nivel: solo lo que ganó de más sobre lo que puso (buyIn).
        const gananciaNeta = Math.max(0, jugador.tableChips - (jugador.buyIn || 0));

        const userRef = doc(db, 'users', user.uid);
        tx.update(userRef, { coins: increment(jugador.tableChips), xpJuegos: increment(gananciaNeta) });

        const restantes = sala.players.filter(p => p.uid !== user.uid);
        if (restantes.length === 0) {
            tx.update(salaRef, { players: [], status: 'closed' });
        } else {
            const nuevoHost = sala.hostUid === user.uid ? restantes[0].uid : sala.hostUid;
            tx.update(salaRef, { players: restantes, hostUid: nuevoHost });
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

/** Trae mi propia mano (2 cartas) para esta sala. Null si no hay o no está dentro. */
export async function miMano(code) {
    const user = auth.currentUser;
    if (!user) return null;
    try {
        const snap = await getDoc(refMano(code, user.uid));
        return snap.exists() ? snap.data().cards : null;
    } catch {
        return null; // sin permiso -> no hay mano todavía
    }
}

// ============================================================
// INICIAR MANO (solo host)
// ============================================================

export async function iniciarMano(code) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');

    try {
        const revealsSnap = await getDocs(collection(db, 'pokerRooms', code, 'reveals'));
        await Promise.all(revealsSnap.docs.map(d => deleteDoc(d.ref)));
    } catch { /* no pasa nada */ }

    const mazo = mezclarMazo(crearMazo());

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const salaSnap = await tx.get(salaRef);
        if (!salaSnap.exists()) throw new Error('La sala no existe.');
        const sala = salaSnap.data();

        if (sala.hostUid !== user.uid) throw new Error('Solo quien creó la sala puede repartir.');

        const jugadores = sala.players.map(p => ({
            ...p,
            status: p.tableChips > 0 ? 'active' : 'sitout',
            currentBet: 0,
            totalBetHand: 0,
            hasActed: false
        }));

        const enJuego = jugadores.filter(p => p.status === 'active');
        if (enJuego.length < 2) throw new Error('Hacen falta al menos 2 jugadores con fichas.');

        let cursor = 0;
        for (const j of jugadores) {
            if (j.status !== 'active') continue;
            const cartas = [mazo[cursor], mazo[cursor + 1]];
            cursor += 2;
            tx.set(refMano(code, j.uid), { cards: cartas });
        }

        tx.set(refDeck(code), { cards: mazo, dealt: cursor });

        const n = jugadores.length;
        let dealerIndex = sala.dealerIndex ?? 0;
        if (jugadores[dealerIndex].status !== 'active') {
            dealerIndex = siguienteIndice(jugadores, dealerIndex, ['active']);
        }

        let sbIndex, bbIndex, primerTurno;
        if (enJuego.length === 2) {
            sbIndex = dealerIndex;
            bbIndex = siguienteIndice(jugadores, dealerIndex, ['active']);
            primerTurno = dealerIndex;
        } else {
            sbIndex = siguienteIndice(jugadores, dealerIndex, ['active']);
            bbIndex = siguienteIndice(jugadores, sbIndex, ['active']);
            primerTurno = siguienteIndice(jugadores, bbIndex, ['active']);
        }

        const postear = (idx, monto) => {
            const j = jugadores[idx];
            const pago = Math.min(monto, j.tableChips);
            j.tableChips -= pago;
            j.currentBet = pago;
            j.totalBetHand = pago;
            if (j.tableChips === 0) j.status = 'allin';
            return pago;
        };

        const pot = postear(sbIndex, sala.smallBlind) + postear(bbIndex, sala.bigBlind);

        tx.update(salaRef, {
            players: jugadores,
            status: 'playing',
            phase: 'preflop',
            communityCards: [],
            pot,
            currentBet: sala.bigBlind,
            minRaise: sala.bigBlind,
            dealerIndex,
            turnIndex: primerTurno,
            roundComplete: false,
            handNumber: increment(1),
            resultMessage: ''
        });
    });
}

// ============================================================
// ACCIONES DE JUEGO
// ============================================================

export async function accion(code, tipo, monto = 0) {
    const user = auth.currentUser;
    if (!user) throw new Error('Necesitás iniciar sesión.');

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const salaSnap = await tx.get(salaRef);
        if (!salaSnap.exists()) throw new Error('La sala no existe.');
        const sala = salaSnap.data();

        if (!['preflop', 'flop', 'turn', 'river'].includes(sala.phase)) {
            throw new Error('No se puede actuar en este momento.');
        }

        const players = sala.players.map(p => ({ ...p }));
        const idx = players.findIndex(p => p.uid === user.uid);
        if (idx < 0) throw new Error('No estás en esta mesa.');
        if (sala.turnIndex !== idx) throw new Error('Todavía no es tu turno.');

        const jugador = players[idx];
        if (jugador.status !== 'active') throw new Error('No podés actuar ahora.');

        let pot = sala.pot;
        let currentBet = sala.currentBet;
        let minRaise = sala.minRaise;

        if (tipo === 'fold') {
            jugador.status = 'folded';
            jugador.hasActed = true;
        } else if (tipo === 'check') {
            if (jugador.currentBet !== currentBet) throw new Error('No podés pasar, hay una apuesta para igualar.');
            jugador.hasActed = true;
        } else if (tipo === 'call') {
            const aCompletar = currentBet - jugador.currentBet;
            const pagar = Math.min(aCompletar, jugador.tableChips);
            jugador.tableChips -= pagar;
            jugador.currentBet += pagar;
            jugador.totalBetHand += pagar;
            pot += pagar;
            if (jugador.tableChips === 0) jugador.status = 'allin';
            jugador.hasActed = true;
        } else if (tipo === 'raise') {
            const objetivo = Math.floor(monto);
            const maxPosible = jugador.currentBet + jugador.tableChips;
            if (objetivo <= currentBet) throw new Error('La subida tiene que ser mayor a la apuesta actual.');
            const minObjetivo = currentBet + minRaise;
            if (objetivo < minObjetivo && objetivo < maxPosible) {
                throw new Error(`La subida mínima es a ${minObjetivo} (o all-in).`);
            }
            const aPagar = Math.min(objetivo, maxPosible) - jugador.currentBet;
            jugador.tableChips -= aPagar;
            jugador.totalBetHand += aPagar;
            pot += aPagar;
            const nuevoTotal = jugador.currentBet + aPagar;
            minRaise = Math.max(minRaise, nuevoTotal - currentBet);
            currentBet = nuevoTotal;
            jugador.currentBet = nuevoTotal;
            if (jugador.tableChips === 0) jugador.status = 'allin';

            players.forEach((p, i) => {
                if (i !== idx && p.status === 'active') p.hasActed = false;
            });
            jugador.hasActed = true;
        } else {
            throw new Error('Acción inválida.');
        }

        const enMano = jugadoresEnMano(players);
        let update = { players, pot, currentBet, minRaise };

        if (enMano.length <= 1) {
            const ganador = enMano[0];
            if (ganador) {
                const g = players.find(p => p.uid === ganador.uid);
                g.tableChips += pot;
                update.resultMessage = `${g.username} ganó ${pot} petoCoins (los demás se retiraron).`;
            }
            update.players = players;
            update.pot = 0;
            update.phase = 'hand_over';
            update.turnIndex = -1;
            update.roundComplete = false;
        } else {
            const puedenActuar = players.filter(p => p.status === 'active');
            const todosListos = puedenActuar.length === 0 ||
                puedenActuar.every(p => p.currentBet === currentBet && p.hasActed);

            if (todosListos) {
                update.roundComplete = true;
                update.turnIndex = -1;
            } else {
                update.turnIndex = siguienteIndice(players, idx, ['active']);
                update.roundComplete = false;
            }
        }

        tx.update(salaRef, update);
    });
}

// ============================================================
// AVANCE DE CALLES Y SHOWDOWN (solo lo ejecuta el host)
// ============================================================

export function escucharComoHost(code) {
    const user = auth.currentUser;
    if (!user) return () => {};

    let procesando = false;

    const unsubSala = onSnapshot(refSala(code), async (snap) => {
        if (!snap.exists()) return;
        const sala = snap.data();
        if (sala.hostUid !== user.uid) return;
        if (procesando) return;

        if (sala.roundComplete && ['preflop', 'flop', 'turn', 'river'].includes(sala.phase)) {
            procesando = true;
            try { await avanzarCalle(code); } catch (e) { console.error(e); }
            procesando = false;
        } else if (sala.phase === 'showdown') {
            procesando = true;
            try { await intentarResolverShowdown(code); } catch (e) { console.error(e); }
            procesando = false;
        }
    });

    const unsubReveals = onSnapshot(collection(db, 'pokerRooms', code, 'reveals'), async () => {
        const salaSnap = await getDoc(refSala(code));
        if (!salaSnap.exists()) return;
        const sala = salaSnap.data();
        if (sala.hostUid !== user.uid || sala.phase !== 'showdown' || procesando) return;
        procesando = true;
        try { await intentarResolverShowdown(code); } catch (e) { console.error(e); }
        procesando = false;
    });

    return () => { unsubSala(); unsubReveals(); };
}

async function avanzarCalle(code) {
    const user = auth.currentUser;

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const deckRef = refDeck(code);
        const salaSnap = await tx.get(salaRef);
        const deckSnap = await tx.get(deckRef);
        if (!salaSnap.exists() || !deckSnap.exists()) return;
        const sala = salaSnap.data();
        if (sala.hostUid !== user.uid || !sala.roundComplete) return;

        let players = sala.players.map(p => ({ ...p }));
        let community = [...sala.communityCards];
        let deck = deckSnap.data().cards;
        let dealt = deckSnap.data().dealt;
        let phase = sala.phase;

        const repartir = (cant) => {
            const cartas = deck.slice(dealt, dealt + cant);
            dealt += cant;
            community = [...community, ...cartas];
        };

        if (phase === 'preflop') { repartir(3); phase = 'flop'; }
        else if (phase === 'flop') { repartir(1); phase = 'turn'; }
        else if (phase === 'turn') { repartir(1); phase = 'river'; }
        else if (phase === 'river') { phase = 'showdown'; }

        players = players.map(p => {
            if (p.status === 'active') return { ...p, currentBet: 0, hasActed: false };
            if (p.status === 'allin') return { ...p, currentBet: 0 };
            return p;
        });

        const puedenActuar = players.filter(p => p.status === 'active');
        let turnIndex = -1;
        if (phase !== 'showdown' && puedenActuar.length >= 1 && jugadoresEnMano(players).length > 1) {
            turnIndex = siguienteIndice(players, sala.dealerIndex, ['active']);
        }

        const todosAllIn = puedenActuar.length === 0 && phase !== 'showdown';

        tx.update(salaRef, {
            players, communityCards: community, phase,
            currentBet: 0, minRaise: sala.bigBlind,
            roundComplete: todosAllIn,
            turnIndex
        });
        tx.update(deckRef, { dealt });
    });
}

async function intentarResolverShowdown(code) {
    const user = auth.currentUser;
    const salaSnap = await getDoc(refSala(code));
    if (!salaSnap.exists()) return;
    const sala = salaSnap.data();
    if (sala.hostUid !== user.uid || sala.phase !== 'showdown') return;

    const enMano = jugadoresEnMano(sala.players);
    const revealsSnap = await getDocs(collection(db, 'pokerRooms', code, 'reveals'));
    const revelados = new Map(revealsSnap.docs.map(d => [d.id, d.data().cards]));

    const faltan = enMano.filter(p => !revelados.has(p.uid));
    if (faltan.length > 0) return;

    await runTransaction(db, async (tx) => {
        const salaRef = refSala(code);
        const salaSnap2 = await tx.get(salaRef);
        if (!salaSnap2.exists()) return;
        const sala2 = salaSnap2.data();
        if (sala2.phase !== 'showdown') return;

        const players = sala2.players.map(p => ({ ...p }));
        const enManoFinal = jugadoresEnMano(players);

        const manos = new Map();
        for (const p of enManoFinal) {
            const cartas = revelados.get(p.uid);
            manos.set(p.uid, mejorMano([...cartas, ...sala2.communityCards]));
        }

        const restantes = players.filter(p => p.totalBetHand > 0).map(p => ({ ...p }));
        const pots = [];
        while (restantes.length > 0) {
            const minApuesta = Math.min(...restantes.map(p => p.totalBetHand));
            const monto = minApuesta * restantes.length;
            const elegibles = restantes.filter(p => p.status !== 'folded').map(p => p.uid);
            pots.push({ monto, elegibles });
            restantes.forEach(p => { p.totalBetHand -= minApuesta; });
            for (let i = restantes.length - 1; i >= 0; i--) {
                if (restantes[i].totalBetHand <= 0) restantes.splice(i, 1);
            }
        }

        const mensajes = [];
        for (const pot of pots) {
            if (pot.monto <= 0 || pot.elegibles.length === 0) continue;
            let mejores = [];
            let mejorEval = null;
            for (const uid of pot.elegibles) {
                const ev = manos.get(uid);
                if (!mejorEval || compararManos(ev, mejorEval) > 0) {
                    mejorEval = ev; mejores = [uid];
                } else if (compararManos(ev, mejorEval) === 0) {
                    mejores.push(uid);
                }
            }
            const parte = Math.floor(pot.monto / mejores.length);
            let resto = pot.monto - parte * mejores.length;
            mejores.forEach((uid, i) => {
                const jugador = players.find(p => p.uid === uid);
                jugador.tableChips += parte + (i === 0 ? resto : 0);
                const nombreMano = manos.get(uid).nombre;
                mensajes.push(`${jugador.username} ganó ${parte + (i === 0 ? resto : 0)} con ${nombreMano}`);
            });
        }

        tx.update(salaRef, {
            players,
            pot: 0,
            phase: 'hand_over',
            turnIndex: -1,
            roundComplete: false,
            resultMessage: mensajes.join(' · ')
        });
    });
}

/** Revela mi mano en el showdown (solo si sigo en la mano, no me retiré). */
export async function revelarMano(code) {
    const user = auth.currentUser;
    if (!user) return;
    const manoSnap = await getDoc(refMano(code, user.uid));
    if (!manoSnap.exists()) return;
    await setDoc(refReveal(code, user.uid), { cards: manoSnap.data().cards });
}
