const suits = ["♠", "♥", "♦", "♣"];
const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

let deck = [];
let playerHand = [];
let gameState = "DEAL"; // Estados posibles: "DEAL" (Repartir), "DISCARD" (Elegir descartes), "END" (Fin de mano)

// Referencias al DOM (ajustalas si tus IDs son diferentes)
const cardsContainer = document.getElementById("player-cards") || document.getElementById("cards");
const actionBtn = document.getElementById("btn-deal") || document.getElementById("action-btn");
const messageEl = document.getElementById("message");

if (actionBtn) {
    actionBtn.addEventListener("click", handleAction);
}

// 1. Genera un mazo nuevo de 52 cartas desde cero
function buildDeck() {
    deck = [];
    for (let suit of suits) {
        for (let value of values) {
            deck.push({ suit, value });
        }
    }
}

// 2. Mezcla el mazo usando el algoritmo Fisher-Yates
function shuffleDeck() {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

// Maneja el flujo del botón principal
function handleAction() {
    if (gameState === "DEAL" || gameState === "END") {
        startHand();
    } else if (gameState === "DISCARD") {
        drawCards();
    }
}

// 3. Inicia una nueva mano LIMPIANDO todo rastro de la ronda anterior
function startHand() {
    // --- AQUÍ SE SOLUCIONA EL BUG DE LAS CARTAS REPETIDAS ---
    playerHand = []; // Vaciamos la mano por completo
    buildDeck();    // Creamos un mazo nuevo de 52 cartas
    shuffleDeck();  // Lo mezclamos bien
    // --------------------------------------------------------

    // Repartimos 5 cartas iniciales (ninguna retenida al inicio)
    for (let i = 0; i < 5; i++) {
        playerHand.push({
            ...deck.pop(),
            held: false 
        });
    }

    gameState = "DISCARD";
    actionBtn.innerText = "Cambiar Cartas";
    messageEl.innerText = "Seleccioná las cartas que quieras MANTENER y presiona 'Cambiar Cartas'.";
    
    updateUI();
}

// Selecciona o deselecciona una carta para mantenerla
function toggleHold(index) {
    if (gameState !== "DISCARD") return;
    
    playerHand[index].held = !playerHand[index].held;
    updateUI();
}

// Reemplaza las cartas que el jugador NO quiso mantener
function drawCards() {
    for (let i = 0; i < playerHand.length; i++) {
        if (!playerHand[i].held) {
            playerHand[i] = {
                ...deck.pop(),
                held: false
            };
        }
    }

    gameState = "END";
    actionBtn.innerText = "Jugar de Nuevo";
    
    // Evalúa la combinación final
    const finalResult = evaluateHand(playerHand);
    messageEl.innerText = `Mano final: ${finalResult}. ¿Jugamos otra?`;
    
    updateUI();
}

// Dibuja las cartas en pantalla
function updateUI() {
    if (!cardsContainer) return;
    cardsContainer.innerHTML = "";

    playerHand.forEach((card, index) => {
        const cardDiv = document.createElement("div");
        cardDiv.classList.add("card");
        
        // Color rojo para corazones y diamantes
        if (card.suit === "♥" || card.suit === "♦") {
            cardDiv.classList.add("red");
        }
        
        // Si está retenida, le añadimos la clase visual correspondiente
        if (card.held) {
            cardDiv.classList.add("held");
        }

        cardDiv.innerHTML = `
            <div class="card-value">${card.value}${card.suit}</div>
            ${card.held ? '<div class="held-tag">MANTENER</div>' : ''}
        `;

        // Evento para que el usuario pueda hacer clic en la carta
        cardDiv.addEventListener("click", () => toggleHold(index));
        
        cardsContainer.appendChild(cardDiv);
    });
}

// Evaluador integrado por si tu 'evaluator.js' no está listo o falla
function evaluateHand(hand) {
    // Si tenés el evaluador externo funcionando, lo priorizamos[cite: 1]
    if (typeof getHandRank === "function") {
        return getHandRank(hand).label;
    }
    
    // De lo contrario, un retorno básico para que el juego no se rompa
    return "Mano completada";
}