// ============================================================
// musica-fondo.js — reproductor de música de fondo reutilizable
// para los juegos de FUN (truco, poker, blackjack, etc).
//
// Uso en cada index.html del juego:
//   <script type="module">
//     import { activarMusicaFondo } from '../../musica-fondo.js';
//     activarMusicaFondo('musica.mp3');
//   </script>
//
// 'musica.mp3' tiene que ser un archivo de audio (mp3/ogg) puesto
// en la MISMA carpeta que el index.html del juego. Si el archivo
// todavía no existe, el botón simplemente no suena hasta que lo
// agregues — no rompe nada.
//
// Muestra un botoncito flotante (🔇/🔊) en la esquina inferior
// derecha para que cada usuario prenda o apague la música. La
// preferencia se recuerda entre juegos con localStorage, y el
// audio arranca solo si el usuario ya lo había activado antes
// (los navegadores no dejan reproducir sonido sin que haya un
// gesto del usuario primero).
// ============================================================

const KEY_PREFERENCIA = 'reztored-musica';

export function activarMusicaFondo(rutaArchivo, { volumen = 0.35 } = {}) {
    const audio = document.createElement('audio');
    audio.src = rutaArchivo;
    audio.loop = true;
    audio.preload = 'none';
    audio.volume = volumen;
    document.body.appendChild(audio);

    const btn = document.createElement('button');
    btn.id = 'btn-musica-fondo';
    btn.type = 'button';
    btn.title = 'Música de fondo';
    btn.setAttribute('aria-label', 'Activar o silenciar la música de fondo');
    btn.style.cssText = `
        position: fixed; bottom: 16px; right: 16px; z-index: 9999;
        width: 48px; height: 48px; border-radius: 999px;
        background: rgba(17,24,39,.92); border: 1px solid rgba(255,255,255,.15);
        color: #fff; font-size: 20px; cursor: pointer; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 14px rgba(0,0,0,.4);
        transition: border-color .2s ease, transform .15s ease;
        font-family: system-ui, sans-serif;
    `;
    btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.08)');
    btn.addEventListener('mouseleave', () => btn.style.transform = 'none');
    document.body.appendChild(btn);

    let activa = localStorage.getItem(KEY_PREFERENCIA) === 'on';

    function pintarBoton() {
        btn.textContent = activa ? '🔊' : '🔇';
        btn.style.borderColor = activa ? '#6366f1' : 'rgba(255,255,255,.15)';
    }
    pintarBoton();

    function reproducir() {
        audio.play().catch(() => {
            // el navegador bloqueó el autoplay (sin gesto del usuario todavía):
            // dejamos el botón apagado hasta que el usuario haga click.
            activa = false;
            pintarBoton();
        });
    }

    if (activa) reproducir();

    btn.addEventListener('click', () => {
        activa = !activa;
        localStorage.setItem(KEY_PREFERENCIA, activa ? 'on' : 'off');
        if (activa) reproducir(); else audio.pause();
        pintarBoton();
    });

    // pausar si el usuario cambia de pestaña, retomar si vuelve y la tenía activa
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) audio.pause();
        else if (activa) reproducir();
    });

    return { audio, btn };
}
