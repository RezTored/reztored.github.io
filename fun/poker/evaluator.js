// ============================================================
// evaluator.js — evaluador de manos de Texas Hold'em (7 cartas -> mejor 5)
// Sin dependencias externas. Devuelve un puntaje comparable.
// ============================================================

const VALORES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const PALOS = ['♠', '♥', '♦', '♣'];

export function crearMazo() {
    const mazo = [];
    for (const p of PALOS) {
        for (let v = 0; v < VALORES.length; v++) {
            mazo.push({ valor: v + 2, simbolo: VALORES[v], palo: p, id: VALORES[v] + p });
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

// Nombres de categorías, de menor a mayor
const CATEGORIAS = [
    'Carta alta', 'Par', 'Doble par', 'Trío', 'Escalera',
    'Color', 'Full', 'Póker', 'Escalera de color', 'Escalera real'
];

function combinaciones5de7(cartas) {
    const resultado = [];
    const n = cartas.length;
    for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++)
            for (let c = b + 1; c < n; c++)
                for (let d = c + 1; d < n; d++)
                    for (let e = d + 1; e < n; e++)
                        resultado.push([cartas[a], cartas[b], cartas[c], cartas[d], cartas[e]]);
    return resultado;
}

function evaluar5(cartas) {
    const valores = cartas.map(c => c.valor).sort((a, b) => b - a);
    const palos = cartas.map(c => c.palo);
    const esColor = palos.every(p => p === palos[0]);

    const conteo = {};
    for (const v of valores) conteo[v] = (conteo[v] || 0) + 1;
    const grupos = Object.entries(conteo)
        .map(([v, cant]) => ({ v: parseInt(v), cant }))
        .sort((a, b) => (b.cant - a.cant) || (b.v - a.v));

    // Escalera (contempla A-2-3-4-5, la "escalera baja")
    let esEscalera = false;
    let altaEscalera = 0;
    const unicos = [...new Set(valores)];
    if (unicos.length === 5) {
        if (unicos[0] - unicos[4] === 4) { esEscalera = true; altaEscalera = unicos[0]; }
        else if (JSON.stringify(unicos) === JSON.stringify([14, 5, 4, 3, 2])) { esEscalera = true; altaEscalera = 5; }
    }

    const kickers = grupos.map(g => g.v);

    if (esEscalera && esColor && altaEscalera === 14) return { cat: 9, desempate: [altaEscalera] };
    if (esEscalera && esColor) return { cat: 8, desempate: [altaEscalera] };
    if (grupos[0].cant === 4) return { cat: 7, desempate: kickers };
    if (grupos[0].cant === 3 && grupos[1] && grupos[1].cant === 2) return { cat: 6, desempate: kickers };
    if (esColor) return { cat: 5, desempate: valores };
    if (esEscalera) return { cat: 4, desempate: [altaEscalera] };
    if (grupos[0].cant === 3) return { cat: 3, desempate: kickers };
    if (grupos[0].cant === 2 && grupos[1] && grupos[1].cant === 2) return { cat: 2, desempate: kickers };
    if (grupos[0].cant === 2) return { cat: 1, desempate: kickers };
    return { cat: 0, desempate: valores };
}

function compararDesempate(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] || 0, y = b[i] || 0;
        if (x !== y) return x - y;
    }
    return 0;
}

/**
 * Recibe un array de 5,6 o 7 cartas ({valor, simbolo, palo}) y devuelve
 * la mejor mano posible: { cat, desempate, nombre, mejores5 }
 */
export function mejorMano(cartas) {
    const combos = cartas.length <= 5 ? [cartas] : combinaciones5de7(cartas);
    let mejor = null;
    for (const combo of combos) {
        const ev = evaluar5(combo);
        if (!mejor || ev.cat > mejor.cat || (ev.cat === mejor.cat && compararDesempate(ev.desempate, mejor.desempate) > 0)) {
            mejor = { ...ev, mejores5: combo };
        }
    }
    return { ...mejor, nombre: CATEGORIAS[mejor.cat] };
}

/** Compara dos manos ya evaluadas (mejorMano). >0 si A gana, <0 si gana B, 0 empate. */
export function compararManos(a, b) {
    if (a.cat !== b.cat) return a.cat - b.cat;
    return compararDesempate(a.desempate, b.desempate);
}
