// ============================================================
// evaluator.js — mazo y evaluador de manos de Texas Hold'em
//
// NOTA: el archivo anterior era código de otro mini-juego (un
// video-poker de 5 cartas manejado por DOM) que no tenía nada que
// ver con el Texas Hold'em multijugador de poker.js, y no exportaba
// ninguna de las funciones que poker.js necesita. Como el import
//   import { crearMazo, mezclarMazo, mejorMano, compararManos } from './evaluator.js'
// fallaba, el módulo completo de poker.js explotaba al cargarse y
// la página de /fun/poker se quedaba en blanco (no "abría").
// Este archivo reemplaza eso por un evaluador real de Hold'em.
// ============================================================

const PALOS = ['♠', '♥', '♦', '♣'];
const SIMBOLOS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const VALOR_DE = Object.fromEntries(SIMBOLOS.map((s, i) => [s, i + 2])); // 2..14 (A alto)

const NOMBRES_MANO = {
    9: 'Escalera real',
    8: 'Escalera de color',
    7: 'Póker',
    6: 'Full house',
    5: 'Color',
    4: 'Escalera',
    3: 'Trío',
    2: 'Doble par',
    1: 'Par',
    0: 'Carta alta'
};

/** Crea un mazo francés de 52 cartas: [{ simbolo, palo }, ...] */
export function crearMazo() {
    const mazo = [];
    for (const palo of PALOS) {
        for (const simbolo of SIMBOLOS) {
            mazo.push({ simbolo, palo });
        }
    }
    return mazo;
}

/** Devuelve una copia mezclada del mazo (Fisher-Yates). No muta el original. */
export function mezclarMazo(mazoOriginal) {
    const mazo = [...mazoOriginal];
    for (let i = mazo.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mazo[i], mazo[j]] = [mazo[j], mazo[i]];
    }
    return mazo;
}

// --- utilidades internas ---

function combinacionesDe5(cartas) {
    // Genera todas las combinaciones de 5 cartas posibles entre las 7
    // disponibles (2 de mano + 5 comunitarias).
    const resultado = [];
    const combo = [];
    function backtrack(inicio) {
        if (combo.length === 5) { resultado.push([...combo]); return; }
        for (let i = inicio; i < cartas.length; i++) {
            combo.push(cartas[i]);
            backtrack(i + 1);
            combo.pop();
        }
    }
    backtrack(0);
    return resultado;
}

/** Evalúa exactamente 5 cartas y devuelve { rank, desempate, nombre }. */
function evaluar5(cartas) {
    const valores = cartas.map(c => VALOR_DE[c.simbolo]).sort((a, b) => b - a);
    const esColor = cartas.every(c => c.palo === cartas[0].palo);

    const conteoPorValor = {};
    for (const v of valores) conteoPorValor[v] = (conteoPorValor[v] || 0) + 1;
    const grupos = Object.entries(conteoPorValor)
        .map(([v, c]) => ({ v: parseInt(v, 10), c }))
        .sort((a, b) => b.c - a.c || b.v - a.v);

    const valoresUnicos = [...new Set(valores)];
    let esEscalera = false;
    let altaEscalera = 0;
    if (valoresUnicos.length === 5) {
        if (valoresUnicos[0] - valoresUnicos[4] === 4) {
            esEscalera = true;
            altaEscalera = valoresUnicos[0];
        } else if (valoresUnicos.join(',') === '14,5,4,3,2') {
            // Escalera "rueda": A-2-3-4-5, la carta alta es el 5
            esEscalera = true;
            altaEscalera = 5;
        }
    }

    let rank, desempate;

    if (esEscalera && esColor) {
        rank = altaEscalera === 14 ? 9 : 8; // escalera real vs. escalera de color
        desempate = [altaEscalera];
    } else if (grupos[0].c === 4) {
        rank = 7; // póker
        desempate = [grupos[0].v, grupos[1].v];
    } else if (grupos[0].c === 3 && grupos[1] && grupos[1].c >= 2) {
        rank = 6; // full house
        desempate = [grupos[0].v, grupos[1].v];
    } else if (esColor) {
        rank = 5;
        desempate = valores;
    } else if (esEscalera) {
        rank = 4;
        desempate = [altaEscalera];
    } else if (grupos[0].c === 3) {
        rank = 3; // trío
        desempate = [grupos[0].v, ...grupos.slice(1).map(g => g.v)];
    } else if (grupos[0].c === 2 && grupos[1] && grupos[1].c === 2) {
        rank = 2; // doble par
        const pares = [grupos[0].v, grupos[1].v].sort((a, b) => b - a);
        desempate = [...pares, grupos[2].v];
    } else if (grupos[0].c === 2) {
        rank = 1; // par
        desempate = [grupos[0].v, ...grupos.slice(1).map(g => g.v)];
    } else {
        rank = 0; // carta alta
        desempate = valores;
    }

    return { rank, desempate, nombre: NOMBRES_MANO[rank] };
}

/**
 * Recibe entre 5 y 7 cartas (típicamente 2 de mano + hasta 5 comunitarias)
 * y devuelve la mejor combinación de 5: { rank, desempate, nombre }.
 */
export function mejorMano(cartas) {
    if (cartas.length <= 5) return evaluar5(cartas);

    let mejor = null;
    for (const combo of combinacionesDe5(cartas)) {
        const ev = evaluar5(combo);
        if (!mejor || compararManos(ev, mejor) > 0) mejor = ev;
    }
    return mejor;
}

/**
 * Compara dos evaluaciones (como las que devuelve mejorMano).
 * Devuelve > 0 si a le gana a b, < 0 si b le gana a a, 0 si empatan.
 */
export function compararManos(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const largo = Math.max(a.desempate.length, b.desempate.length);
    for (let i = 0; i < largo; i++) {
        const av = a.desempate[i] || 0;
        const bv = b.desempate[i] || 0;
        if (av !== bv) return av - bv;
    }
    return 0;
}
