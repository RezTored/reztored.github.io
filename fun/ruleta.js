import { db, auth } from '../reztored-auth.js';
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const SIMBOLOS = ['🍒', '🍋', '💎', '🔔', '⭐', '🍀', '7️⃣'];

export async function girarRuleta(apuesta) {
    const user = auth.currentUser;
    if (!user) throw new Error("Debes iniciar sesión para jugar.");

    const userRef = doc(db, 'users', user.uid);
    
    // Generar 6 resultados al azar
    const resultado = Array.from({length: 6}, () => SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)]);
    
    // Contar cuántas veces aparece cada símbolo
    const counts = {};
    resultado.forEach(s => counts[s] = (counts[s] || 0) + 1);
    
    // Calcular multiplicador (mínimo 3 iguales para ganar)
    let multiplicador = 0;
    Object.values(counts).forEach(c => {
        if (c >= 3) multiplicador = (c - 2); // 3=x1, 4=x2, 5=x3, 6=x4
    });

    const ganancia = apuesta * multiplicador;

    try {
        await runTransaction(db, async (tx) => {
            const userSnap = await tx.get(userRef);
            const saldo = userSnap.data().coins || 0;
            if (saldo < apuesta) throw "No tenés suficientes PetoCoins.";
            tx.update(userRef, { coins: saldo - apuesta + ganancia });
        });
        return { resultado, ganancia, multiplicador };
    } catch (e) {
        throw e;
    }
}