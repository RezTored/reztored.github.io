// Proyecto/fun/minas/minas.js
//
// Juego de "Minas" (5x5): elegís cuántas minas poner en el tablero
// (1 a 24) y vas destapando casillas de a una. Cada casilla segura que
// destapás te sube el multiplicador de tu apuesta; podés "Retirar" en
// cualquier momento y cobrar apuesta × multiplicador acumulado. Si
// destapás una mina, perdés toda la apuesta.
//
// Cuantas más minas elegís, más arriesgado es cada click (hay menos
// casillas seguras) pero el multiplicador sube mucho más rápido por
// cada una que aciertes.

import { db, auth } from '../../reztored-auth.js';
import { doc, runTransaction, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const TOTAL_CASILLAS = 25; // grilla 5x5
const VENTAJA_CASA = 0.97; // igual que en los otros juegos: un ligero margen a favor de la casa

let balance = 0;
let apuestaActual = 0;
let minasActuales = 0;
let posicionesMinas = new Set();
let casillasReveladas = 0;
let juegoActivo = false;

// --- Elementos del DOM ---
const messageEl = document.getElementById('message');
const balanceEl = document.getElementById('petocoins-balance');
const betInput = document.getElementById('bet-amount');
const minesInput = document.getElementById('mines-amount');
const btnMax = document.getElementById('btn-max');
const btnJugar = document.getElementById('btn-jugar');
const btnRetirar = document.getElementById('btn-retirar');
const gridEl = document.getElementById('grid-minas');

const statMultEl = document.getElementById('stat-mult');
const statGananciaEl = document.getElementById('stat-ganancia');
const statSiguienteEl = document.getElementById('stat-siguiente');

const petocoinTag = '<img src="petocoin.png" class="petocoin-icon" alt="Petocoin">';

// --- 1. ESCUCHAR INICIO DE SESIÓN Y CARGAR SALDO ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            balance = await obtenerSaldoFirebase();
            updateBalanceUI();
            messageEl.innerHTML = 'Elegí tu apuesta y la cantidad de minas, y arrancá.';
        } catch (error) {
            messageEl.innerHTML = `⚠️ Error al cargar saldo: ${error.message}`;
        }
    } else {
        messageEl.innerHTML = '⚠️ Debes iniciar sesión para jugar.';
    }
});

// --- 2. FUNCIONES DE FIREBASE (mismo patrón que blackjack.js) ---

async function obtenerSaldoFirebase() {
    const user = auth.currentUser;
    if (!user) throw new Error('Debes iniciar sesión.');
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error('Perfil no encontrado.');
    return userSnap.data().coins || 0;
}

async function cobrarApuestaFirebase(apuesta) {
    const user = auth.currentUser;
    if (!user) throw new Error('Debes iniciar sesión.');
    const userRef = doc(db, 'users', user.uid);

    return await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error('Perfil no encontrado.');

        const saldoActual = userSnap.data().coins || 0;
        if (saldoActual < apuesta) {
            throw new Error(`Saldo insuficiente. Tenés ${saldoActual} PetoCoins.`);
        }

        const nuevoSaldo = saldoActual - apuesta;
        tx.update(userRef, { coins: nuevoSaldo });
        return nuevoSaldo;
    });
}

async function pagarPremioFirebase(apuesta, multiplicador) {
    const user = auth.currentUser;
    if (!user) throw new Error('Debes iniciar sesión.');
    const userRef = doc(db, 'users', user.uid);

    return await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error('Perfil no encontrado.');

        const saldoActual = userSnap.data().coins || 0;
        const ganancia = Math.floor(apuesta * multiplicador);

        const nuevoSaldo = saldoActual + ganancia;
        tx.update(userRef, { coins: nuevoSaldo });
        return { nuevoSaldo, ganancia };
    });
}

// --- 3. MATEMÁTICA DEL MULTIPLICADOR ---
//
// Multiplicador "justo" de destapar "reveladas" casillas seguras sin
// pisar ninguna mina, sobre un total de TOTAL_CASILLAS con "minas"
// minas: es 1 dividido la probabilidad de que esas "reveladas"
// casillas hayan sido todas seguras. Se le aplica VENTAJA_CASA como
// margen de la casa (igual filosofía que el x2/x3 de blackjack).
function calcularMultiplicador(reveladas, minas) {
    let mult = 1;
    for (let i = 0; i < reveladas; i++) {
        mult *= (TOTAL_CASILLAS - i) / (TOTAL_CASILLAS - minas - i);
    }
    return mult * VENTAJA_CASA;
}

// --- 4. ARMADO DE LA GRILLA (una sola vez) ---
const casillasEls = [];
for (let i = 0; i < TOTAL_CASILLAS; i++) {
    const casilla = document.createElement('div');
    casilla.className = 'casilla deshabilitada';
    casilla.dataset.index = String(i);
    casilla.addEventListener('click', () => destaparCasilla(i));
    gridEl.appendChild(casilla);
    casillasEls.push(casilla);
}

function resetGrid() {
    casillasEls.forEach((el) => {
        el.className = 'casilla';
        el.innerHTML = '';
    });
}

function bloquearGrid() {
    casillasEls.forEach((el) => el.classList.add('deshabilitada'));
}

// --- 5. GENERAR MINAS AL AZAR ---
function generarPosicionesMinas(cantidadMinas) {
    const posiciones = Array.from({ length: TOTAL_CASILLAS }, (_, i) => i);
    for (let i = posiciones.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [posiciones[i], posiciones[j]] = [posiciones[j], posiciones[i]];
    }
    return new Set(posiciones.slice(0, cantidadMinas));
}

// --- 6. UI ---
function updateBalanceUI() {
    if (balanceEl) balanceEl.innerText = balance;
}

function setMaxBet() {
    if (balance > 0) betInput.value = balance;
}

function actualizarStats() {
    const multActual = casillasReveladas > 0 ? calcularMultiplicador(casillasReveladas, minasActuales) : 1;
    const gananciaActual = Math.floor(apuestaActual * multActual);
    const casillasSegurasRestantes = (TOTAL_CASILLAS - minasActuales) - casillasReveladas;
    const multSiguiente = casillasSegurasRestantes > 0
        ? calcularMultiplicador(casillasReveladas + 1, minasActuales)
        : multActual;

    statMultEl.textContent = `x${multActual.toFixed(2)}`;
    statGananciaEl.innerHTML = `${juegoActivo || casillasReveladas > 0 ? gananciaActual : 0} <img src="petocoin.png" class="petocoin-icon-small" alt="Petocoin">`;
    statSiguienteEl.textContent = casillasSegurasRestantes > 0 ? `x${multSiguiente.toFixed(2)}` : '—';
}

// --- 7. FLUJO DEL JUEGO ---

btnJugar.addEventListener('click', iniciarRonda);
btnRetirar.addEventListener('click', retirarGanancias);
btnMax.addEventListener('click', setMaxBet);

async function iniciarRonda() {
    if (juegoActivo) return;

    const apuesta = parseInt(betInput.value);
    const minas = parseInt(minesInput.value);

    if (isNaN(apuesta) || apuesta <= 0) {
        messageEl.innerHTML = '⚠️ ¡Ingresá una apuesta válida!';
        return;
    }
    if (isNaN(minas) || minas < 1 || minas > TOTAL_CASILLAS - 1) {
        messageEl.innerHTML = `⚠️ Elegí entre 1 y ${TOTAL_CASILLAS - 1} minas.`;
        return;
    }

    btnJugar.disabled = true;
    betInput.disabled = true;
    minesInput.disabled = true;
    btnMax.disabled = true;
    messageEl.innerHTML = `${petocoinTag} Procesando apuesta en Firebase...`;

    try {
        balance = await cobrarApuestaFirebase(apuesta);
        updateBalanceUI();
    } catch (error) {
        messageEl.innerHTML = `⚠️ ${error.message}`;
        btnJugar.disabled = false;
        betInput.disabled = false;
        minesInput.disabled = false;
        btnMax.disabled = false;
        return;
    }

    // Arranca la ronda
    apuestaActual = apuesta;
    minasActuales = minas;
    posicionesMinas = generarPosicionesMinas(minas);
    casillasReveladas = 0;
    juegoActivo = true;

    resetGrid();
    btnRetirar.disabled = true;
    messageEl.innerHTML = '¡Elegí una casilla! 💎';
    actualizarStats();
}

function destaparCasilla(index) {
    if (!juegoActivo) return;
    const casilla = casillasEls[index];
    if (casilla.classList.contains('revelada')) return;

    if (posicionesMinas.has(index)) {
        // 💥 Pisó una mina: pierde toda la apuesta (ya estaba descontada).
        casilla.classList.add('revelada', 'mina', 'explotada');
        casilla.innerHTML = '💣';
        finalizarRonda(false);
        return;
    }

    // Casilla segura
    casillasReveladas++;
    casilla.classList.add('revelada', 'gema');
    casilla.innerHTML = '💎';
    btnRetirar.disabled = false;
    actualizarStats();

    const totalSeguras = TOTAL_CASILLAS - minasActuales;
    if (casillasReveladas >= totalSeguras) {
        // Destapó todas las casillas seguras: se retira automáticamente con el máximo.
        messageEl.innerHTML = '🎉 ¡Destapaste todas las casillas seguras!';
        retirarGanancias();
    }
}

async function retirarGanancias() {
    if (!juegoActivo || casillasReveladas === 0) return;

    juegoActivo = false;
    btnRetirar.disabled = true;
    bloquearGrid();

    const multiplicador = calcularMultiplicador(casillasReveladas, minasActuales);
    messageEl.innerHTML = `${petocoinTag} Procesando tu retiro en Firebase...`;

    try {
        const { nuevoSaldo, ganancia } = await pagarPremioFirebase(apuestaActual, multiplicador);
        balance = nuevoSaldo;
        updateBalanceUI();
        messageEl.innerHTML = `✅ ¡Te retiraste con x${multiplicador.toFixed(2)}! Ganaste ${ganancia} ${petocoinTag}.`;
    } catch (error) {
        messageEl.innerHTML = `⚠️ Error al procesar el pago: ${error.message}`;
    }

    revelarMinasRestantes();
    terminarRondaUI();
}

function finalizarRonda(gano) {
    juegoActivo = false;
    btnRetirar.disabled = true;
    bloquearGrid();

    if (!gano) {
        messageEl.innerHTML = `💥 ¡Pisaste una mina! Perdiste tu apuesta de ${apuestaActual} ${petocoinTag}.`;
    }

    revelarMinasRestantes();
    terminarRondaUI();
}

function revelarMinasRestantes() {
    posicionesMinas.forEach((i) => {
        const casilla = casillasEls[i];
        if (!casilla.classList.contains('revelada')) {
            casilla.classList.add('revelada', 'mina');
            casilla.innerHTML = '💣';
        }
    });
}

function terminarRondaUI() {
    btnJugar.disabled = false;
    betInput.disabled = false;
    minesInput.disabled = false;
    btnMax.disabled = false;
    actualizarStats();
}

actualizarStats();
