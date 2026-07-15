import { db, auth } from '../../reztored-auth.js';
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const SIMBOLOS = ['🍒', '🍋', '💎', '🔔', '⭐', '🍀', '7️⃣'];

export async function girarRuleta(apuesta) {
    // 1. Validación de entrada (Frena valores no numéricos, negativos o cero)
    const apuestaValida = parseInt(apuesta);
    if (isNaN(apuestaValida) || apuestaValida <= 0) {
        throw new Error("La apuesta debe ser mayor a 0.");
    }

    const user = auth.currentUser;
    if (!user) throw new Error("Debes iniciar sesión.");
    const userRef = doc(db, 'users', user.uid);

    // 2. Transacción atómica (Si algo falla aquí, no se descuenta nada)
    return await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error("Perfil no encontrado.");
        
        const saldo = userSnap.data().coins || 0;
        
        // 3. Validación CRÍTICA de saldo
        if (saldo < apuestaValida) {
            throw new Error(`Saldo insuficiente. Tenés ${saldo} PetoCoins.`);
        }
        
        const res = Array.from({length: 9}, () => SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)]);
        let mult = 0;

        // --- LÓGICA DE PATRONES ---
        if (res[0] === res[1] && res[1] === res[2]) mult += 2;
        if (res[3] === res[4] && res[4] === res[5]) mult += 3;
        if (res[6] === res[7] && res[7] === res[8]) mult += 2;
        if (res[0] === res[3] && res[3] === res[6]) mult += 2;
        if (res[1] === res[4] && res[4] === res[7]) mult += 3;
        if (res[2] === res[5] && res[5] === res[8]) mult += 2;
        if (res[0] === res[4] && res[4] === res[8]) mult += 1.5;
        if (res[2] === res[4] && res[6] === res[4]) mult += 1.5;
        if (res[0] === res[2] && res[2] === res[6] && res[6] === res[8] && res[4] !== res[0]) mult += 2.5;
        if (res[1] === res[3] && res[3] === res[5] && res[5] === res[7] && res[1] !== res[4]) mult += 2.5;
        if (res.every(s => s === res[0])) mult += 7;

        const ganancia = apuestaValida * mult;
        
        // 4. Actualización
        tx.update(userRef, { coins: saldo - apuestaValida + ganancia });

        return { resultado: res, ganancia, multiplicador: mult };
    });
}