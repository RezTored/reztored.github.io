import { db, auth } from '../reztored-auth.js';
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Lista de símbolos de la suerte
const SIMBOLOS = ['🍒', '🍋', '💎', '🔔', '⭐', '🍀', '7️⃣'];

export async function girarRuleta(apuesta) {
    const user = auth.currentUser;
    if (!user) throw new Error("Debes iniciar sesión para jugar.");

    const userRef = doc(db, 'users', user.uid);
    
    // Elegimos 3 al azar
    const resultado = [
        SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)],
        SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)],
        SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)]
    ];
    
    // El premio es si los 3 son el '7️⃣'
    const esPremio = (resultado[0] === '7️⃣' && resultado[1] === '7️⃣' && resultado[2] === '7️⃣');
    const ganancia = esPremio ? (apuesta * 2) : 0;

    try {
        await runTransaction(db, async (tx) => {
            const userSnap = await tx.get(userRef);
            const saldo = userSnap.data().coins || 0;
            if (saldo < apuesta) throw "No tenés suficientes PetoCoins.";
            tx.update(userRef, { coins: saldo - apuesta + ganancia });
        });
        return { resultado, ganancia, gano: esPremio };
    } catch (e) {
        throw e;
    }
}