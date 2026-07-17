// ============================================================
// nivel-widget.js
// Insignia flotante de "Nivel" que se muestra arriba de la página,
// debajo del banner/header, pegada a la derecha. Se importa en TODAS
// las páginas del sitio con un solo <script type="module" src="/nivel-widget.js"></script>
// y se encarga sola de crear su propio HTML, posicionarse debajo del
// <header> de cada página, y actualizarse en tiempo real con el nivel
// y la experiencia (XP) del usuario logueado.
//
// No hace falta tocar el HTML de cada página aparte del <script> que
// la importa: este archivo crea su propio elemento con JS.
// ============================================================

import { auth, onAuthStateChanged, suscribirNivel } from '/reztored-auth.js';

function crearWidget() {
    const existente = document.getElementById('nivel-widget');
    if (existente) return existente;

    const el = document.createElement('div');
    el.id = 'nivel-widget';
    el.className = 'hidden fixed z-40 flex-col gap-1.5 bg-gray-900/90 backdrop-blur-md border border-gray-800 rounded-xl px-3 py-2 shadow-2xl select-none';
    el.style.right = '1rem';
    el.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Nivel</span>
            <span id="nivel-widget-numero" class="text-sm font-extrabold text-white leading-none">1</span>
        </div>
        <div class="w-32 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div id="nivel-widget-barra" class="h-full bg-indigo-500 transition-all duration-500" style="width:0%"></div>
        </div>
        <span id="nivel-widget-xp" class="text-[10px] text-gray-400">0 / 100 XP</span>
    `;
    document.body.appendChild(el);
    return el;
}

// Posiciona el widget justo debajo del <header> de la página actual
// (todas las páginas del sitio usan un <header> fijo arriba de todo).
function posicionarWidget(el) {
    const header = document.querySelector('header');
    const headerAlto = header ? header.getBoundingClientRect().height : 88;
    el.style.top = (headerAlto + 12) + 'px';
}

function mostrarWidget(el) {
    el.classList.remove('hidden');
    el.classList.add('flex');
}

function ocultarWidget(el) {
    el.classList.add('hidden');
    el.classList.remove('flex');
}

function iniciar() {
    const el = crearWidget();
    posicionarWidget(el);
    window.addEventListener('resize', () => posicionarWidget(el));

    const numeroEl = document.getElementById('nivel-widget-numero');
    const barraEl = document.getElementById('nivel-widget-barra');
    const xpEl = document.getElementById('nivel-widget-xp');

    let dejarDeEscucharNivel = null;

    onAuthStateChanged(auth, (user) => {
        if (dejarDeEscucharNivel) {
            dejarDeEscucharNivel();
            dejarDeEscucharNivel = null;
        }

        if (!user) {
            ocultarWidget(el);
            return;
        }

        mostrarWidget(el);
        // Vuelve a acomodarse por si el header cambió de alto al mostrar
        // el estado de sesión iniciada (avatar, badge de admin, etc.).
        requestAnimationFrame(() => posicionarWidget(el));

        dejarDeEscucharNivel = suscribirNivel(user.uid, ({ nivel, xpEnNivel, xpNecesaria }) => {
            numeroEl.textContent = nivel;
            const porcentaje = xpNecesaria > 0 ? Math.min(100, Math.round((xpEnNivel / xpNecesaria) * 100)) : 0;
            barraEl.style.width = porcentaje + '%';
            xpEl.textContent = `${xpEnNivel} / ${xpNecesaria} XP`;
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
} else {
    iniciar();
}
