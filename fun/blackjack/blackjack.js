// Proyecto/fun/blackjack/blackjack.js

import { db, auth } from '../../reztored-auth.js';
import { doc, runTransaction, getDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const suits = ["♠", "♥", "♦", "♣"];
const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

let deck = [];
let dealerHand = [];
let playerHand = [];
let gameOver = false;

// Variables de apuestas (Se sincronizan con Firebase)
let balance = 0;
let currentBet = 0;

// Elementos del DOM
const dealerCardsEl = document.getElementById("dealer-cards");
const playerCardsEl = document.getElementById("player-cards");
const dealerScoreEl = document.getElementById("dealer-score");
const playerScoreEl = document.getElementById("player-score");
const messageEl = document.getElementById("message");

const btnDeal = document.getElementById("btn-deal");
const btnHit = document.getElementById("btn-hit");
const btnStand = document.getElementById("btn-stand");

// Elementos de Apuestas
const balanceEl = document.getElementById("petocoins-balance");
const betInput = document.getElementById("bet-amount");
const btnMax = document.getElementById("btn-max");

const petocoinTag = '<img src="petocoin.png" class="petocoin-icon" alt="Petocoin">';

// --- 1. ESCUCHAR INICIO DE SESIÓN Y CARGAR SALDO ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            balance = await obtenerSaldoFirebase();
            updateBalanceUI();
            messageEl.innerHTML = "¡Sesión iniciada! Ajustá tu apuesta y jugá.";
        } catch (error) {
            messageEl.innerHTML = `⚠️ Error al cargar saldo: ${error.message}`;
        }
    } else {
        messageEl.innerHTML = "⚠️ Debes iniciar sesión para jugar.";
    }
});

// Event Listeners
btnDeal.addEventListener("click", startGame);
btnHit.addEventListener("click", hit);
btnStand.addEventListener("click", stand);
btnMax.addEventListener("click", setMaxBet);

function updateBalanceUI() {
    if (balanceEl) balanceEl.innerText = balance;
}

function setMaxBet() {
    if (balance > 0) {
        betInput.value = balance;
    }
}

// --- 2. FUNCIONES DE BASE DE DATOS (FIREBASE) ---

async function obtenerSaldoFirebase() {
    const user = auth.currentUser;
    if (!user) throw new Error("Debes iniciar sesión.");
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error("Perfil no encontrado.");
    return userSnap.data().coins || 0;
}

// Transacción para cobrar la apuesta al inicio
async function cobrarApuestaFirebase(apuesta) {
    const user = auth.currentUser;
    if (!user) throw new Error("Debes iniciar sesión.");
    const userRef = doc(db, 'users', user.uid);

    return await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error("Perfil no encontrado.");
        
        const saldoActual = userSnap.data().coins || 0;
        if (saldoActual < apuesta) {
            throw new Error(`Saldo insuficiente. Tenés ${saldoActual} PetoCoins.`);
        }

        // Restamos la apuesta
        const nuevoSaldo = saldoActual - apuesta;
        tx.update(userRef, { coins: nuevoSaldo });
        return nuevoSaldo;
    });
}

// Transacción para pagar el premio al final
async function pagarPremioFirebase(apuesta, multiplicador) {
    const user = auth.currentUser;
    if (!user) throw new Error("Debes iniciar sesión.");
    const userRef = doc(db, 'users', user.uid);

    return await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error("Perfil no encontrado.");
        
        const saldoActual = userSnap.data().coins || 0;
        const ganancia = Math.floor(apuesta * multiplicador);
        // XP de nivel: solo cuenta si fue una victoria real (mult > 1),
        // un empate (mult === 1) devuelve la apuesta pero no suma XP.
        const gananciaNeta = multiplicador > 1 ? (ganancia - apuesta) : 0;

        // Sumamos la ganancia (la apuesta inicial ya se había descontado)
        const nuevoSaldo = saldoActual + ganancia;
        tx.update(userRef, { coins: nuevoSaldo, xpJuegos: increment(gananciaNeta) });
        return nuevoSaldo;
    });
}

// --- 3. LÓGICA DEL JUEGO ---

function buildDeck() {
    deck = [];
    for (let suit of suits) {
        for (let value of values) {
            deck.push({ suit, value });
        }
    }
    // Barajar
    for (let i = deck.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

async function startGame() {
    const bet = parseInt(betInput.value);

    // Validaciones locales rápidas
    if (isNaN(bet) || bet <= 0) {
        messageEl.innerHTML = "⚠️ ¡Por favor, ingresá una apuesta válida!";
        return;
    }
    
    // Bloquear controles inmediatamente para evitar doble clics
    btnDeal.disabled = true;
    betInput.disabled = true;
    btnMax.disabled = true;
    messageEl.innerHTML = `${petocoinTag} Procesando apuesta en Firebase...`;

    try {
        // Descontar la apuesta de Firebase usando la transacción
        balance = await cobrarApuestaFirebase(bet);
        currentBet = bet;
        updateBalanceUI();
    } catch (error) {
        messageEl.innerHTML = `⚠️ ${error.message}`;
        btnDeal.disabled = false;
        betInput.disabled = false;
        btnMax.disabled = false;
        return;
    }

    // Si la transacción fue exitosa, arranca la mano
    gameOver = false;
    dealerHand = [];
    playerHand = [];
    buildDeck();

    playerHand.push(deck.pop());
    dealerHand.push(deck.pop());
    playerHand.push(deck.pop());
    dealerHand.push(deck.pop());

    btnHit.disabled = false;
    btnStand.disabled = false;
    messageEl.innerHTML = "¡Tu turno!";

    updateUI();
}

function hit() {
    if (gameOver) return;
    
    playerHand.push(deck.pop());
    updateUI();

    if (calculateScore(playerHand) > 21) {
        endGame("¡Te pasaste de 21! El Crupier gana. Perdiste tu apuesta 💸.");
    }
}

function stand() {
    if (gameOver) return;
    
    btnHit.disabled = true;
    btnStand.disabled = true;
    messageEl.innerHTML = "Turno del Crupier...";

    updateUI(true);
    setTimeout(dealerDrawTurn, 1000);
}

function dealerDrawTurn() {
    let dealerScore = calculateScore(dealerHand);

    if (dealerScore < 17) {
        dealerHand.push(deck.pop());
        updateUI(true);
        setTimeout(dealerDrawTurn, 1000); // 1x1 con delay de 1 seg
    } else {
        evaluateGameResult();
    }
}

// Verifica si la mano es exactamente "JA" (Jota y As con exactamente 2 cartas)
function hasJA(hand) {
    if (hand.length !== 2) return false;
    const valuesInHand = [hand[0].value, hand[1].value];
    return valuesInHand.includes("J") && valuesInHand.includes("A");
}

async function evaluateGameResult() {
    let playerScore = calculateScore(playerHand);
    let dealerScore = calculateScore(dealerHand);
    
    let playerHasJA = hasJA(playerHand);
    let dealerHasJA = hasJA(dealerHand);

    let mult = 0; // Multiplicador de pago final
    let endMsg = "";

    if (dealerScore > 21) {
        if (playerHasJA) {
            mult = 3;
            endMsg = `¡El Crupier se pasó! ¡Ganaste con JA! Cobrás x3 (+${currentBet * 3} ${petocoinTag}).`;
        } else {
            mult = 2;
            endMsg = `¡El Crupier se pasó! Ganaste. Cobrás x2 (+${currentBet * 2} ${petocoinTag}).`;
        }
    } else if (playerScore > dealerScore) {
        if (playerHasJA) {
            mult = 3;
            endMsg = `¡Ganaste con JA! Cobrás x3 (+${currentBet * 3} ${petocoinTag}) 🃏🔥.`;
        } else {
            mult = 2;
            endMsg = `¡Ganaste! Cobrás x2 (+${currentBet * 2} ${petocoinTag}) 🎉.`;
        }
    } else if (playerScore < dealerScore) {
        mult = 0;
        endMsg = "El Crupier gana. Perdiste tu apuesta 💸.";
    } else {
        // Empate en puntaje, pero JA le gana a un 21 normal
        if (playerHasJA && !dealerHasJA) {
            mult = 3;
            endMsg = `¡Tu JA supera al 21 del Crupier! Cobrás x3 (+${currentBet * 3} ${petocoinTag})`;
        } else if (!playerHasJA && dealerHasJA) {
            mult = 0;
            endMsg = `El Crupier tiene un JA. Perdiste tu apuesta 💸.`;
        } else {
            mult = 1;
            endMsg = `Empate. Recuperás tus Petocoins ${petocoinTag}.`;
        }
    }

    // Procesar pago si corresponde
    if (mult > 0) {
        messageEl.innerHTML = `${petocoinTag} Procesando tus ganancias en Firebase...`;
        try {
            balance = await pagarPremioFirebase(currentBet, mult);
            updateBalanceUI();
        } catch (error) {
            endMsg += ` \n⚠️ Error al procesar pago: ${error.message}`;
        }
    }

    endGame(endMsg);
}

function calculateScore(hand) {
    let score = 0;
    let aces = 0;

    for (let card of hand) {
        if (card.value === "A") {
            aces += 1;
            score += 11;
        } else if (["J", "Q", "K"].includes(card.value)) {
            score += 10;
        } else {
            score += parseInt(card.value);
        }
    }

    while (score > 21 && aces > 0) {
        score -= 10;
        aces -= 1;
    }

    return score;
}

function updateUI(showDealerCard = false) {
    playerCardsEl.innerHTML = "";
    for (let card of playerHand) {
        playerCardsEl.appendChild(createCardElement(card));
    }
    playerScoreEl.innerText = calculateScore(playerHand);

    dealerCardsEl.innerHTML = "";
    if (!showDealerCard && !gameOver) {
        dealerCardsEl.appendChild(createCardElement(dealerHand[0]));
        let hiddenCard = document.createElement("div");
        hiddenCard.classList.add("card");
        hiddenCard.style.backgroundColor = "#555";
        dealerCardsEl.appendChild(hiddenCard);
        dealerScoreEl.innerText = "?";
    } else {
        for (let card of dealerHand) {
            dealerCardsEl.appendChild(createCardElement(card));
        }
        dealerScoreEl.innerText = calculateScore(dealerHand);
    }
}

function createCardElement(card) {
    let cardDiv = document.createElement("div");
    cardDiv.classList.add("card");
    if (card.suit === "♥" || card.suit === "♦") {
        cardDiv.classList.add("red");
    }
    cardDiv.innerText = `${card.value} ${card.suit}`;
    return cardDiv;
}

function endGame(message) {
    gameOver = true;
    messageEl.innerHTML = message;
    
    // Desbloquear controles para la próxima partida
    btnDeal.disabled = false;
    btnHit.disabled = true;
    btnStand.disabled = true;
    betInput.disabled = false;
    btnMax.disabled = false;

    updateUI(true);
}