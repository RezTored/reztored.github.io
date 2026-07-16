import { db, auth } from '../../reztored-auth.js';
import { doc, getDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =========================================================================
// CONFIGURACIÓN GLOBAL
// =========================================================================
export const CONFIG = {
    // Antes estaba en 0.015 (1.5%) y encima el símbolo del jackpot se
    // elegía con probabilidad uniforme entre los 7 símbolos (ignorando
    // el "peso" de cada uno) y el multiplicador se multiplicaba x5 sobre
    // el ya generoso premio p5. Eso hacía que, en promedio, la ruleta
    // pagara MUCHO más de lo que recibía (jackpot "fácil" y multiplicador
    // "demasiado" alto). Se baja la probabilidad y se pesa el sorteo del
    // símbolo igual que en un giro normal.
    PROBABILIDAD_JACKPOT: 0.005,

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
        // OJO: "parseFloat(x) || 0.6" está mal si el volumen guardado es 0
        // (mute), porque 0 es "falsy" en JS y siempre se pisaba con 0.6.
        // Por eso el volumen "se bugeaba": guardabas silencio, recargabas
        // la página, y volvía a sonar al 60%.
        volumenEfectos: leerVolumenGuardado()
    }
};

function leerVolumenGuardado() {
    const guardado = localStorage.getItem('volumenJuego');
    if (guardado === null) return 0.6;
    const valor = parseFloat(guardado);
    return Number.isNaN(valor) ? 0.6 : valor;
}

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
    if (Number.isNaN(valor)) return;
    CONFIG.AUDIO.volumenEfectos = valor;
    localStorage.setItem('volumenJuego', String(valor));
    if (bgMusic) bgMusic.volume = CONFIG.AUDIO.volumenMusica; // no toca la música, solo por claridad
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
    // p3 se redujo a la mitad respecto de antes porque ahora se pagan
    // TAMBIÉN las 3 columnas además de las 3 filas (ver más abajo el
    // bug de "3 en columna no pagaba"). Al duplicar la cantidad de
    // líneas que pueden ganar, había que ajustar el pago por línea
    // para que la ruleta no vuelva a pagar de más.
    { emoji: '🍒', peso: 25, p3: 1.5, p4: 5, p5: 10 },
    { emoji: '🍋', peso: 20, p3: 2, p4: 8, p5: 15 },
    { emoji: '⭐', peso: 18, p3: 3, p4: 12, p5: 25 },
    { emoji: '🍀', peso: 15, p3: 4, p4: 20, p5: 40 },
    { emoji: '🔔', peso: 10, p3: 6, p4: 30, p5: 60 },
    { emoji: '💎', peso: 8, p3: 10, p4: 60, p5: 120 },
    { emoji: '7️⃣', peso: 4, p3: 25, p4: 150, p5: 500 }
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
    // Antes elegía el símbolo del jackpot con probabilidad UNIFORME entre
    // los 7 símbolos, ignorando el "peso" de cada uno. Eso significaba que
    // el 7️⃣ (el más valioso, p5=500) salía como jackpot tan seguido como
    // la 🍒 (la más común). Ahora se sortea respetando los mismos pesos
    // que un giro normal, así el jackpot "grande" sigue siendo raro de
    // verdad.
    const elegido = obtenerSimboloAleatorio();
    return Array(9).fill(elegido);
}

function calcularMultiplicador(res) {
    let mult = 0;
    let tieneP5oCompleto = false;
    
    const getP3 = (e) => SIMBOLOS_DATA.find(s => s.emoji === e)?.p3 || 0;
    const getP5 = (e) => SIMBOLOS_DATA.find(s => s.emoji === e)?.p5 || 0;

    // Este era EL bug de "pierdo cuando no debería": el tablero es una
    // grilla de 3x3 y visualmente se pueden formar líneas ganadoras
    // tanto en fila como en columna, pero acá solo se pagaban las 3
    // filas. Si te salían 3 símbolos iguales en columna (como 3 limones
    // alineados verticalmente), el juego los mostraba pero no los
    // contaba como victoria y decía "Perdiste". Ahora se pagan las 3
    // filas Y las 3 columnas.

    // Filas
    if (res[0] === res[1] && res[1] === res[2]) mult += getP3(res[0]);
    if (res[3] === res[4] && res[4] === res[5]) mult += getP3(res[3]);
    if (res[6] === res[7] && res[7] === res[8]) mult += getP3(res[6]);

    // Columnas
    if (res[0] === res[3] && res[3] === res[6]) mult += getP3(res[0]);
    if (res[1] === res[4] && res[4] === res[7]) mult += getP3(res[1]);
    if (res[2] === res[5] && res[5] === res[8]) mult += getP3(res[2]);

    // Diagonales: era el mismo bug que el de las columnas. Si te salían
    // 3 iguales en diagonal (de arriba-izquierda a abajo-derecha, o de
    // arriba-derecha a abajo-izquierda) el tablero se veía como una
    // línea ganadora perfecta pero no se contaba, y el juego decía
    // "Perdiste" igual. Ahora se pagan también las 2 diagonales.
    // Si el símbolo del centro (res[4]) hace que las DOS diagonales
    // ganen a la vez (ej: O X O / X O X / O X O), cada diagonal suma
    // su propio pago acá abajo, así que automáticamente se cobra el
    // doble (como si fueran 2 líneas ganadas), sin ningún caso especial.
    if (res[0] === res[4] && res[4] === res[8]) mult += getP3(res[0]);
    if (res[2] === res[4] && res[4] === res[6]) mult += getP3(res[2]);

    if (res.every(s => s === res[0])) {
        // Antes era getP5(res[0]) * 5. Combinado con el jackpot fácil y
        // sin ponderar, esto hacía que el multiplicador promedio pagado
        // por la ruleta fuera más alto que lo apostado (la casa perdía
        // plata). Se deja un bonus más razonable.
        mult = getP5(res[0]) * 2;
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

    // Chequeo rápido (no transaccional) de saldo, solo para no reproducir
    // el sonido de giro ni sortear un resultado si de entrada no tenés
    // fichas suficientes. La validación real y definitiva sigue pasando
    // adentro de la transacción de más abajo.
    const preSnap = await getDoc(userRef);
    const saldoActual = preSnap.data()?.coins || 0;
    if (saldoActual < apuestaValida) {
        throw new Error("Saldo insuficiente");
    }

    // El resultado se calcula ANTES de entrar a la transacción. Antes se
    // generaba adentro del callback de runTransaction, pero Firestore
    // puede reintentar ese callback solas veces si hay contención (por
    // ejemplo, si en simultáneo te está entrando un like a otro post).
    // Eso hacía que se sorteara un tablero nuevo (¡y se reprodujera el
    // sonido de giro/resultado otra vez!) en cada reintento, generando
    // resultados inconsistentes con lo que el jugador veía/escuchaba.
    // Ahora se sortea una sola vez y la transacción solo valida y
    // descuenta/acredita saldo con ESE resultado fijo.
    reproducirSonidoEfecto(CONFIG.SONIDOS.giro);

    const forzarJackpot = Math.random() < CONFIG.PROBABILIDAD_JACKPOT;
    const res = forzarJackpot ? generarTableroJackpot() : generarTablero();
    const calculo = calcularMultiplicador(res);
    const ganancia = apuestaValida * calculo.mult;

    await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        const saldo = userSnap.data().coins || 0;

        // 2. Validar saldo suficiente
        if (saldo < apuestaValida) {
            throw new Error("Saldo insuficiente");
        }

        tx.update(userRef, { coins: saldo - apuestaValida + ganancia });
    });

    // Sonido de resultado
    const sonido = calculo.mult > 50 || calculo.tieneP5oCompleto
        ? CONFIG.SONIDOS.jackpot
        : (calculo.mult > 0 ? CONFIG.SONIDOS.premioComun : CONFIG.SONIDOS.perder);

    reproducirSonidoEfecto(sonido);

    const columnas = [
        [res[0], res[3], res[6]],
        [res[1], res[4], res[7]],
        [res[2], res[5], res[8]]
    ];

    return { resultado: res, columnas, ganancia, multiplicador: calculo.mult };
}
