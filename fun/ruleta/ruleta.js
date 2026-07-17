// Proyecto/fun/ruleta/ruleta.js
//
// Ruleta europea (0 al 36, un solo cero) con mesa de apuestas real:
// apuesta directa a número (paga 35 a 1), docenas y columnas (2 a 1),
// y las apuestas exteriores rojo/negro, par/impar, 1-18/19-36 (1 a 1).
// La rueda se dibuja y gira con SVG puro, sin librerías externas.

import { db, auth, xpPorGananciaApuesta, calcularActualizacionXP } from '../../reztored-auth.js';
import { doc, runTransaction, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Orden real de los números en una rueda de ruleta europea ---
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const TABLE_ROWS = [
    [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36], // fila de arriba -> columna 3
    [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35], // fila del medio -> columna 2
    [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]  // fila de abajo -> columna 1
];

function colorDe(n) {
    if (n === 0) return 'verde';
    return RED_NUMBERS.has(n) ? 'rojo' : 'negro';
}

// --- Estado del juego ---
let saldo = 0;
let fichaSeleccionada = 10;
let apuestas = {};        // clave -> monto acumulado
let historialClicks = []; // { key, valor } para poder deshacer
let girando = false;
let wheelDeg = 0;
let ballDeg = 0;

// --- Elementos del DOM ---
const balanceEl = document.getElementById('petocoins-balance');
const totalApostadoEl = document.getElementById('total-apostado');
const mensajeEl = document.getElementById('mensaje');
const chipSelectorEl = document.getElementById('chip-selector');
const mesaGridEl = document.getElementById('mesa-grid');
const mesaExterioresEl = document.getElementById('mesa-exteriores');
const mesaDocenasEl = document.getElementById('mesa-docenas');
const historialEl = document.getElementById('historial');
const btnGirar = document.getElementById('btn-girar');
const btnDeshacer = document.getElementById('btn-deshacer');
const btnBorrar = document.getElementById('btn-borrar');
const wheelGroupEl = document.getElementById('wheel-group');
const ballGroupEl = document.getElementById('ball-group');

// ============================================================
// 1. CONSTRUCCIÓN DE LA RUEDA (SVG)
// ============================================================

function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, rOuter, rInner, startAngle, endAngle) {
    const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
    const p2 = polarToCartesian(cx, cy, rOuter, endAngle);
    const p3 = polarToCartesian(cx, cy, rInner, endAngle);
    const p4 = polarToCartesian(cx, cy, rInner, startAngle);
    const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y} Z`;
}

const COLOR_HEX = { rojo: '#c0392b', negro: '#1c1c1c', verde: '#0b6623' };

function construirRueda() {
    const cx = 130, cy = 130;
    const rOuter = 124, rInner = 58;
    const anglePer = 360 / WHEEL_ORDER.length;
    const ns = 'http://www.w3.org/2000/svg';

    WHEEL_ORDER.forEach((numero, i) => {
        const start = i * anglePer;
        const end = (i + 1) * anglePer;
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', arcPath(cx, cy, rOuter, rInner, start, end));
        path.setAttribute('fill', COLOR_HEX[colorDe(numero)]);
        path.setAttribute('stroke', '#0c0c10');
        path.setAttribute('stroke-width', '1');
        wheelGroupEl.appendChild(path);

        const labelPos = polarToCartesian(cx, cy, 95, start + anglePer / 2);
        const text = document.createElementNS(ns, 'text');
        text.setAttribute('x', labelPos.x);
        text.setAttribute('y', labelPos.y);
        text.setAttribute('fill', '#fff');
        text.setAttribute('font-size', '9');
        text.setAttribute('font-weight', '700');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('transform', `rotate(${start + anglePer / 2}, ${labelPos.x}, ${labelPos.y})`);
        text.textContent = numero;
        wheelGroupEl.appendChild(text);
    });

    const hub = document.createElementNS(ns, 'circle');
    hub.setAttribute('cx', cx);
    hub.setAttribute('cy', cy);
    hub.setAttribute('r', rInner - 4);
    hub.setAttribute('class', 'wheel-center');
    wheelGroupEl.appendChild(hub);

    const ball = document.createElementNS(ns, 'circle');
    ball.setAttribute('cx', cx);
    ball.setAttribute('cy', cy - 112);
    ball.setAttribute('r', 5);
    ball.setAttribute('fill', '#fefefe');
    ball.setAttribute('stroke', '#999');
    ball.setAttribute('stroke-width', '0.5');
    ballGroupEl.appendChild(ball);
}

function siguienteAngulo(actual, vueltas, objetivoMod, direccion) {
    const actualMod = ((actual % 360) + 360) % 360;
    if (direccion === 1) {
        const delta = vueltas * 360 + ((objetivoMod - actualMod + 360) % 360);
        return actual + delta;
    }
    const delta = vueltas * 360 + ((actualMod - objetivoMod + 360) % 360);
    return actual - delta;
}

function girarRueda(numeroGanador) {
    const anglePer = 360 / WHEEL_ORDER.length;
    const indice = WHEEL_ORDER.indexOf(numeroGanador);
    const centro = (indice + 0.5) * anglePer;
    const objetivoWheel = (360 - centro) % 360;

    const vueltasWheel = 6 + Math.floor(Math.random() * 3);
    const vueltasBall = 8 + Math.floor(Math.random() * 3);

    wheelDeg = siguienteAngulo(wheelDeg, vueltasWheel, objetivoWheel, 1);
    ballDeg = siguienteAngulo(ballDeg, vueltasBall, 0, -1);

    wheelGroupEl.style.transform = `rotate(${wheelDeg}deg)`;
    ballGroupEl.style.transform = `rotate(${ballDeg}deg)`;
}

// ============================================================
// 2. CONSTRUCCIÓN DE LA MESA DE APUESTAS
// ============================================================

function crearCelda(clases, texto, key, contenedor, extraAttrs = {}) {
    const div = document.createElement('div');
    div.className = clases;
    div.dataset.key = key;
    div.innerHTML = `<span>${texto}</span>`;
    Object.entries(extraAttrs).forEach(([k, v]) => { div.style[k] = v; });
    contenedor.appendChild(div);
    return div;
}

function construirMesa() {
    // Cero: ocupa la primera columna, las 3 filas
    const cero = document.createElement('div');
    cero.className = 'celda verde';
    cero.dataset.key = 'num-0';
    cero.style.gridColumn = '1';
    cero.style.gridRow = '1 / span 3';
    cero.innerHTML = '<span>0</span>';
    mesaGridEl.appendChild(cero);

    TABLE_ROWS.forEach((fila, filaIdx) => {
        fila.forEach((numero, colIdx) => {
            const celda = document.createElement('div');
            celda.className = `celda ${colorDe(numero)}`;
            celda.dataset.key = `num-${numero}`;
            celda.style.gridColumn = String(colIdx + 2);
            celda.style.gridRow = String(filaIdx + 1);
            celda.innerHTML = `<span>${numero}</span>`;
            mesaGridEl.appendChild(celda);
        });

        // Apuesta de columna (2 a 1) al final de cada fila
        const colKey = filaIdx === 0 ? 'col-3' : filaIdx === 1 ? 'col-2' : 'col-1';
        const colCelda = document.createElement('div');
        colCelda.className = 'celda columna';
        colCelda.dataset.key = colKey;
        colCelda.style.gridColumn = '14';
        colCelda.style.gridRow = String(filaIdx + 1);
        colCelda.innerHTML = '<span>2 a 1</span>';
        mesaGridEl.appendChild(colCelda);
    });

    // Docenas
    crearCelda('celda-docena', '1ra docena (1-12)', 'doc-1', mesaDocenasEl);
    crearCelda('celda-docena', '2da docena (13-24)', 'doc-2', mesaDocenasEl);
    crearCelda('celda-docena', '3ra docena (25-36)', 'doc-3', mesaDocenasEl);

    // Apuestas exteriores
    crearCelda('celda-ext', '1-18', 'bajo', mesaExterioresEl);
    crearCelda('celda-ext', 'PAR', 'par', mesaExterioresEl);
    crearCelda('celda-ext rojo', 'ROJO', 'rojo', mesaExterioresEl);
    crearCelda('celda-ext negro', 'NEGRO', 'negro', mesaExterioresEl);
    crearCelda('celda-ext', 'IMPAR', 'impar', mesaExterioresEl);
    crearCelda('celda-ext', '19-36', 'alto', mesaExterioresEl);
}

// ============================================================
// 3. MANEJO DE APUESTAS
// ============================================================

function totalApostado() {
    return Object.values(apuestas).reduce((a, b) => a + b, 0);
}

function actualizarUI() {
    totalApostadoEl.textContent = totalApostado();

    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.dataset.key;
        let marca = el.querySelector('.ficha-marca');
        if (apuestas[key]) {
            if (!marca) {
                marca = document.createElement('span');
                marca.className = 'ficha-marca';
                el.appendChild(marca);
            }
            marca.textContent = apuestas[key];
        } else if (marca) {
            marca.remove();
        }
    });

    btnDeshacer.disabled = historialClicks.length === 0 || girando;
    btnBorrar.disabled = totalApostado() === 0 || girando;
    btnGirar.disabled = totalApostado() === 0 || girando;
}

function colocarApuesta(key) {
    if (girando) return;
    if (saldo < totalApostado() + fichaSeleccionada) {
        mensajeEl.textContent = '⚠️ No te alcanzan las petoCoins para esa ficha.';
        return;
    }
    apuestas[key] = (apuestas[key] || 0) + fichaSeleccionada;
    historialClicks.push({ key, valor: fichaSeleccionada });
    mensajeEl.textContent = '';
    actualizarUI();
}

function deshacer() {
    if (girando || historialClicks.length === 0) return;
    const ultima = historialClicks.pop();
    apuestas[ultima.key] -= ultima.valor;
    if (apuestas[ultima.key] <= 0) delete apuestas[ultima.key];
    actualizarUI();
}

function borrarApuestas() {
    if (girando) return;
    apuestas = {};
    historialClicks = [];
    actualizarUI();
}

[mesaGridEl, mesaExterioresEl, mesaDocenasEl].forEach(cont => {
    cont.addEventListener('click', (e) => {
        const celda = e.target.closest('[data-key]');
        if (celda) colocarApuesta(celda.dataset.key);
    });
});

chipSelectorEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('activa'));
    chip.classList.add('activa');
    fichaSeleccionada = parseInt(chip.dataset.valor, 10);
});

btnDeshacer.addEventListener('click', deshacer);
btnBorrar.addEventListener('click', borrarApuestas);

// ============================================================
// 4. CÁLCULO DE PREMIOS
// ============================================================

function calcularPremio(numeroGanador, colorGanador) {
    let premio = 0;
    for (const [key, monto] of Object.entries(apuestas)) {
        if (key.startsWith('num-')) {
            const n = parseInt(key.split('-')[1], 10);
            if (n === numeroGanador) premio += monto * 36;
            continue;
        }
        if (numeroGanador === 0) continue; // el 0 solo paga apuesta directa

        switch (key) {
            case 'rojo': if (colorGanador === 'rojo') premio += monto * 2; break;
            case 'negro': if (colorGanador === 'negro') premio += monto * 2; break;
            case 'par': if (numeroGanador % 2 === 0) premio += monto * 2; break;
            case 'impar': if (numeroGanador % 2 === 1) premio += monto * 2; break;
            case 'bajo': if (numeroGanador >= 1 && numeroGanador <= 18) premio += monto * 2; break;
            case 'alto': if (numeroGanador >= 19 && numeroGanador <= 36) premio += monto * 2; break;
            case 'doc-1': if (numeroGanador >= 1 && numeroGanador <= 12) premio += monto * 3; break;
            case 'doc-2': if (numeroGanador >= 13 && numeroGanador <= 24) premio += monto * 3; break;
            case 'doc-3': if (numeroGanador >= 25 && numeroGanador <= 36) premio += monto * 3; break;
            case 'col-1': if (numeroGanador % 3 === 1) premio += monto * 3; break;
            case 'col-2': if (numeroGanador % 3 === 2) premio += monto * 3; break;
            case 'col-3': if (numeroGanador % 3 === 0) premio += monto * 3; break;
        }
    }
    return premio;
}

function marcarCeldasGanadoras(numeroGanador, colorGanador) {
    const clavesGanadoras = new Set([`num-${numeroGanador}`]);
    if (numeroGanador !== 0) {
        clavesGanadoras.add(colorGanador);
        clavesGanadoras.add(numeroGanador % 2 === 0 ? 'par' : 'impar');
        clavesGanadoras.add(numeroGanador <= 18 ? 'bajo' : 'alto');
        clavesGanadoras.add(numeroGanador <= 12 ? 'doc-1' : numeroGanador <= 24 ? 'doc-2' : 'doc-3');
        clavesGanadoras.add(numeroGanador % 3 === 1 ? 'col-1' : numeroGanador % 3 === 2 ? 'col-2' : 'col-3');
    }
    document.querySelectorAll('[data-key]').forEach(el => {
        if (clavesGanadoras.has(el.dataset.key)) el.classList.add('ganadora');
    });
}

function limpiarCeldasGanadoras() {
    document.querySelectorAll('.ganadora').forEach(el => el.classList.remove('ganadora'));
}

function agregarHistorial(numero, color) {
    const item = document.createElement('div');
    item.className = `historial-item color-${color}`;
    item.textContent = numero;
    historialEl.insertBefore(item, historialEl.firstChild);
    while (historialEl.children.length > 15) {
        historialEl.removeChild(historialEl.lastChild);
    }
}

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 5. FIREBASE: SALDO, COBRO Y PAGO
// ============================================================

async function obtenerSaldoFirebase() {
    const user = auth.currentUser;
    if (!user) throw new Error('Debes iniciar sesión.');
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error('Perfil no encontrado.');
    return userSnap.data().coins || 0;
}

async function cobrarApuestaFirebase(monto) {
    const user = auth.currentUser;
    if (!user) throw new Error('Debes iniciar sesión.');
    const userRef = doc(db, 'users', user.uid);

    return await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error('Perfil no encontrado.');

        const saldoActual = userSnap.data().coins || 0;
        if (saldoActual < monto) {
            throw new Error(`Saldo insuficiente. Tenés ${saldoActual} PetoCoins.`);
        }

        const nuevoSaldo = saldoActual - monto;
        tx.update(userRef, { coins: nuevoSaldo });
        return nuevoSaldo;
    });
}

async function pagarPremioFirebase(cantidad, apostado = 0) {
    const user = auth.currentUser;
    if (!user) throw new Error('Debes iniciar sesión.');
    const userRef = doc(db, 'users', user.uid);

    return await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error('Perfil no encontrado.');

        const datos = userSnap.data();
        const saldoActual = datos.coins || 0;
        const nuevoSaldo = saldoActual + cantidad;

        // XP solo si la jugada dio ganancia neta (premio > lo apostado).
        const xpGanada = xpPorGananciaApuesta(cantidad - apostado);

        tx.update(userRef, {
            coins: nuevoSaldo,
            ...(xpGanada > 0 ? calcularActualizacionXP(datos, xpGanada) : {})
        });
        return nuevoSaldo;
    });
}

function actualizarBalanceUI() {
    balanceEl.textContent = saldo;
}

// ============================================================
// 6. GIRO PRINCIPAL
// ============================================================

async function girar() {
    if (girando) return;
    const total = totalApostado();
    if (total <= 0) {
        mensajeEl.textContent = 'Elegí al menos una apuesta antes de girar.';
        return;
    }

    limpiarCeldasGanadoras();
    girando = true;
    actualizarUI();
    mensajeEl.textContent = 'Cobrando apuesta...';

    try {
        saldo = await cobrarApuestaFirebase(total);
        actualizarBalanceUI();
    } catch (error) {
        mensajeEl.textContent = `⚠️ ${error.message}`;
        girando = false;
        actualizarUI();
        return;
    }

    const numeroGanador = WHEEL_ORDER[Math.floor(Math.random() * WHEEL_ORDER.length)];
    const colorGanador = colorDe(numeroGanador);

    mensajeEl.textContent = 'Girando la rueda...';
    girarRueda(numeroGanador);

    await esperar(4400);

    marcarCeldasGanadoras(numeroGanador, colorGanador);
    agregarHistorial(numeroGanador, colorGanador);

    const premio = calcularPremio(numeroGanador, colorGanador);
    const badge = `<span class="resultado-numero color-${colorGanador}">${numeroGanador}</span>`;

    if (premio > 0) {
        try {
            saldo = await pagarPremioFirebase(premio, total);
            actualizarBalanceUI();
            mensajeEl.innerHTML = `${badge} ¡Ganaste ${premio} petoCoins! 🎉`;
        } catch (error) {
            mensajeEl.innerHTML = `${badge} Hubo un error acreditando el premio: ${error.message}`;
        }
    } else {
        mensajeEl.innerHTML = `${badge} No hubo suerte esta vez.`;
    }

    apuestas = {};
    historialClicks = [];
    girando = false;
    actualizarUI();
}

btnGirar.addEventListener('click', girar);

// ============================================================
// 7. INICIALIZACIÓN
// ============================================================

construirRueda();
construirMesa();
actualizarUI();

auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            saldo = await obtenerSaldoFirebase();
            actualizarBalanceUI();
            mensajeEl.textContent = 'Elegí tu ficha, hacé tus apuestas y girá la rueda.';
        } catch (error) {
            mensajeEl.textContent = `⚠️ Error al cargar saldo: ${error.message}`;
        }
    } else {
        saldo = 0;
        actualizarBalanceUI();
        mensajeEl.textContent = '⚠️ Debes iniciar sesión para jugar.';
    }
});
