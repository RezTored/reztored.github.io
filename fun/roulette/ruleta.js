import { db, auth } from '../../reztored-auth.js';
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =========================================================================
// CONFIGURACIÓN GLOBAL
// =========================================================================
export const CONFIG = {
    PROBABILIDAD_JACKPOT: 0.025,
    
    SONIDOS: {
        giro: "sonidos/slot.mp3",
        perder: "sonidos/lose.mp3",
        casiGano: "sonidos/decepcion-1.mp3",
        premioComun: "sonidos/win.mp3",
        premioMedio: "sonidos/winner.mp3",
        jackpot: "sonidos/jackpot.mp3"
    },
    
    AUDIO: {
        musicaFondo: "sonidos/standar.mp3",
        volumenMusica: 0.2,
        volumenEfectos: parseFloat(localStorage.getItem('volumenJuego')) || 0.6
    }
};

// =========================================================================
// GESTIÓN DE AUDIO
// =========================================================================
let bgMusic = null;
let activeEffect = null;

export function iniciarMusicaDeFondo() {
    if (bgMusic) return;
    try {
        bgMusic = new Audio(CONFIG.AUDIO.musicaFondo);
        bgMusic.loop = true;
        bgMusic.volume = CONFIG.AUDIO.volumenMusica;
        bgMusic.play().catch(err => console.log("Esperando interacción de usuario..."));
    } catch (e) { console.warn(e); }
}

export function ajustarVolumen(nuevoVolumen) {
    const valor = parseFloat(nuevoVolumen);
    CONFIG.AUDIO.volumenEfectos = valor;
    localStorage.setItem('volumenJuego', valor);
}

function reproducirSonidoEfecto(rutaArchivo) {
    if (!rutaArchivo) return;

    if (activeEffect) {
        activeEffect.pause();
        activeEffect.currentTime = 0;
        activeEffect = null;
    }

    try {
        const efecto = new Audio(rutaArchivo);
        efecto.volume = CONFIG.AUDIO.volumenEfectos;
        activeEffect = efecto;

        let estabaSonando = false;
        if (bgMusic && !bgMusic.paused) {
            bgMusic.pause();
            estabaSonando = true;
        }

        efecto.addEventListener('ended', () => {
            if (activeEffect === efecto) activeEffect = null;
            if (estabaSonando && bgMusic) bgMusic.play().catch(err => console.warn(err));
        });
        
        efecto.play();
    } catch (error) { console.warn(error); }
}

// =========================================================================
// LÓGICA DE JUEGO
// =========================================================================
const SIMBOLOS_DATA = [
    { emoji: '🍒', peso: 25, p3: 2, p4: 5, p5: 10 },
    { emoji: '🍋', peso: 20, p3: 3, p4: 8, p5: 15 },
    { emoji: '⭐', peso: 18, p3: 5, p4: 12, p5: 25 },
    { emoji: '🍀', peso: 15, p3: 8, p4: 20, p5: 40 },
    { emoji: '🔔', peso: 10, p3: 12, p4: 30, p5: 60 },
    { emoji: '💎', peso: 8, p3: 20, p4: 60, p5: 120 },
    { emoji: '7️⃣', peso: 4, p3: 50, p4: 150, p5: 500 }
];

function obtenerSimboloAleatorio() {
    const r = Math.random() * 100;
    let acumulado = 0;
    for (const s of SIMBOLOS_DATA) {
        acumulado += s.peso;
        if (r < acumulado) return s.emoji;
    }
    return '🍒';
}

function generarTablero() {
    return Array.from({ length: 9 }, () => obtenerSimboloAleatorio());
}

function generarTableroJackpot() {
    const simbolos = SIMBOLOS_DATA.map(s => s.emoji);
    const elegido = simbolos[Math.floor(Math.random() * simbolos.length)];
    return Array(9).fill(elegido);
}

function calcularMultiplicador(res) {
    let mult = 0;
    let tieneP5oCompleto = false;
    
    const getP3 = (e) => SIMBOLOS_DATA.find(s => s.emoji === e)?.p3 || 0;
    const getP5 = (e) => SIMBOLOS_DATA.find(s => s.emoji === e)?.p5 || 0;

    if (res[0] === res[1] && res[1] === res[2]) mult += getP3(res[0]);
    if (res[3] === res[4] && res[4] === res[5]) mult += getP3(res[3]);
    if (res[6] === res[7] && res[7] === res[8]) mult += getP3(res[6]);
    
    if (res.every(s => s === res[0])) {
        mult = getP5(res[0]) * 5;
        tieneP5oCompleto = true;
    }

    return { mult, tieneP5oCompleto };
}

// =========================================================================
// FUNCIÓN PRINCIPAL DE GIRO
// =========================================================================
export async function girarRuleta(apuesta) {
    const apuestaValida = parseInt(apuesta);

    // 1. Validar que la apuesta sea un número mayor a 0
    if (isNaN(apuestaValida) || apuestaValida <= 0) {
        throw new Error("La apuesta debe ser mayor a 0");
    }

    if (!auth.currentUser) throw new Error("Debes iniciar sesión.");
    
    const userRef = doc(db, 'users', auth.currentUser.uid);

    return await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        const saldo = userSnap.data().coins || 0;
        
        // 2. Validar saldo suficiente
        if (saldo < apuestaValida) {
            throw new Error("Saldo insuficiente");
        }

        // 3. Si pasamos las validaciones, reproducimos el sonido de giro
        reproducirSonidoEfecto(CONFIG.SONIDOS.giro);

        // Lógica de resultado
        const forzarJackpot = Math.random() < CONFIG.PROBABILIDAD_JACKPOT;
        let res = forzarJackpot ? generarTableroJackpot() : generarTablero();
        let calculo = calcularMultiplicador(res);
        
        const ganancia = apuestaValida * calculo.mult;
        tx.update(userRef, { coins: saldo - apuestaValida + ganancia });

        // Sonido de resultado
        let sonido = calculo.mult > 50 || calculo.tieneP5oCompleto 
            ? CONFIG.SONIDOS.jackpot 
            : (calculo.mult > 0 ? CONFIG.SONIDOS.premioComun : CONFIG.SONIDOS.perder);
        
        reproducirSonidoEfecto(sonido);

        const columnas = [
            [res[0], res[3], res[6]],
            [res[1], res[4], res[7]],
            [res[2], res[5], res[8]]
        ];

        return { resultado: res, columnas, ganancia, multiplicador: calculo.mult };
    });
}