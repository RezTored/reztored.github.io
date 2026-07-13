(function() {
  const audio = document.getElementById('audioTrack');
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const progressBar = document.getElementById('progressBar');
  const currentTimeText = document.getElementById('currentTime');
  const durationText = document.getElementById('duration');
  const volumeSlider = document.getElementById('volumeSlider');
  const canvas = document.getElementById('visualizerCanvas');
  const ctx = canvas.getContext('2d');

  let animationFrameId;

  // Adaptar tamaño del canvas automáticamente
  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // --- 1. LÓGICA DE REPRODUCCIÓN ---
  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      audio.play();
      // Cambiar icono a Pausa (SVG)
      playIcon.innerHTML = `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
      drawVisualizer(); // Iniciar animación
    } else {
      audio.pause();
      // Cambiar icono a Play (SVG)
      playIcon.innerHTML = `<path d="M8 5v14l11-7z"/>`;
      cancelAnimationFrame(animationFrameId);
    }
  });

  // Actualizar Barra de Progreso
  audio.addEventListener('timeupdate', () => {
    if (!isNaN(audio.duration)) {
      const progressPercent = (audio.currentTime / audio.duration) * 100;
      progressBar.value = progressPercent;
      currentTimeText.innerText = formatTime(audio.currentTime);
    }
  });

  // Cargar Duración Total
  audio.addEventListener('loadedmetadata', () => {
    durationText.innerText = formatTime(audio.duration);
  });

  // Adelantar/retroceder con la barra de progreso
  progressBar.addEventListener('input', () => {
    const seekTime = (progressBar.value / 100) * audio.duration;
    audio.currentTime = seekTime;
  });

  // Control de Volumen
  volumeSlider.addEventListener('input', () => {
    audio.volume = volumeSlider.value / 100;
  });

  // Formatear Segundos a mm:ss
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // --- 2. EL VISUALIZADOR DE AUDIO PROCEDIMENTAL ---
  let analyserData = Array.from({ length: 40 }, () => Math.random() * 20);
  let noisePhase = 0;

  function drawVisualizer() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const barWidth = canvas.width / analyserData.length;
    noisePhase += 0.05;

    for (let i = 0; i < analyserData.length; i++) {
      let targetHeight = 5;
      if (!audio.paused) {
        // Generador de frecuencias procedurales (Senos y Cosenos dinámicos)
        targetHeight = Math.abs(
          Math.sin(i * 0.15 + noisePhase) * Math.cos(i * 0.05 - noisePhase * 0.5) * (canvas.height * 0.7)
        ) + (Math.random() * 8);
      }
      
      // Interpolación para suavizar los cambios de altura
      analyserData[i] += (targetHeight - analyserData[i]) * 0.2;

      const x = i * barWidth;
      const y = canvas.height - analyserData[i];

      // Degradado Neón (Cyan a Magenta)
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, '#ff007f');
      gradient.addColorStop(1, '#00f2fe');

      // Resplandor de Neón en el Canvas
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00f2fe';

      ctx.fillStyle = gradient;
      ctx.fillRect(x + 2, y, barWidth - 4, analyserData[i]);
    }

    // Desactivar sombra para no ralentizar el navegador
    ctx.shadowBlur = 0;

    if (!audio.paused) {
      animationFrameId = requestAnimationFrame(drawVisualizer);
    }
  }

  // Pintar estado inicial estático
  drawVisualizer();
})();
