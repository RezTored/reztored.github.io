import { auth, db } from '../../reztored-auth.js';
import { doc, getDoc, setDoc, runTransaction, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Jerarquía (Espada > Basto > Copa > Oro)
// As Espada(14), As Basto(13), 7 Espada(12), 7 Oro(11), 3(10), 2(9), 1C/1O(8)...
const CARTAS_ORDER = { '1S':14, '1B':13, '7S':12, '7O':11, '3':10, '2':9, '1C':8, '1O':8, '12':7, '11':6, '10':5, '7C':4, '7B':4, '6':3, '5':2, '4':1 };

// Funciones core siguiendo el patrón de poker.js
const refSala = (code) => doc(db, 'trucoRooms', code);
const refDeck = (code) => doc(db, 'trucoRooms', code, 'dealer', 'deck');
const refMano = (code, uid) => doc(db, 'trucoRooms', code, 'hands', uid);

// Lógica de repartir (Host Only)
export async function repartir(code) {
    const mazo = generarMazoMezclado();
    await runTransaction(db, async (tx) => {
        // 1. Escribir cartas en cada subcolección hands/
        // 2. Limpiar el centro de la mesa
        // 3. Resetear el turno al mano
    });
}

// Lógica de juego
async function ejecutarAccion(code, accion, valor = null) {
    await runTransaction(db, async (tx) => {
        const sala = await tx.get(refSala(code));
        // Validar: esTurno(sala, user.uid) && accionPermitida
        // Actualizar estado en doc principal (ej: 'envido', 'truco', 'quiero')
    });
}

// Listener principal (onSnapshot)
// Igual que en poker, renderiza UI según sala.phase y sala.turnIndex