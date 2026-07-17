import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDJG28Tq0xhyJPmBirRGY8-yBRZllQPl0M",
  authDomain: "reztored-page.firebaseapp.com",
  projectId: "reztored-page",
  storageBucket: "reztored-page.firebasestorage.app",
  messagingSenderId: "744944684653",
  appId: "1:744944684653:web:0b8cfbf7a6c21dfae13964"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let modoLogin = true;

// --- REFERENCIAS DEL DOM (MODAL Y AUTH) ---
const authModal = document.getElementById('auth-modal');
const btnLoginMenu = document.getElementById('btn-login-menu');
const closeModal = document.getElementById('close-modal');
const authForm = document.getElementById('auth-form');
const modalTitle = document.getElementById('modal-title');
const btnSubmitAuth = document.getElementById('btn-submit-auth');
const btnToggleAuth = document.getElementById('btn-toggle-auth');
const toggleText = document.getElementById('toggle-text');
const authMessage = document.getElementById('auth-message');
const btnGoogle = document.getElementById('btn-google');

const usernameContainer = document.getElementById('username-container');
const authUsernameInput = document.getElementById('auth-username');

// --- REFERENCIAS DEL DOM (USUARIO LOGUEADO) ---
const userLoggedInDiv = document.getElementById('user-logged-in');
const userProfileLink = document.getElementById('user-profile-link');
const userAvatarMenu = document.getElementById('user-avatar-menu');
const btnLogout = document.getElementById('btn-logout');

// --- EVENTOS DEL MODAL DE AUTENTICACIÓN ---
btnLoginMenu.addEventListener('click', () => {
  authModal.classList.add('active'); // Agrega la clase que fuerza el display flex
});

closeModal.addEventListener('click', () => {
  authModal.classList.remove('active'); // Quita la clase para ocultarlo
  authMessage.classList.add('hidden');
  authForm.reset();
});

// Intercambiar entre iniciar sesión y registrarse
btnToggleAuth.addEventListener('click', (e) => {
  e.preventDefault();
  modoLogin = !modoLogin;
  
  if (modoLogin) {
    modalTitle.textContent = "Iniciar Sesión";
    btnSubmitAuth.textContent = "Ingresar";
    toggleText.textContent = "¿No tenés cuenta?";
    btnToggleAuth.textContent = "Registrate";
    usernameContainer.classList.add('hidden');
    authUsernameInput.removeAttribute('required');
  } else {
    modalTitle.textContent = "Crear Cuenta";
    btnSubmitAuth.textContent = "Registrarse";
    toggleText.textContent = "¿Ya tenés cuenta?";
    btnToggleAuth.textContent = "Inicia Sesión";
    usernameContainer.classList.remove('hidden');
    authUsernameInput.setAttribute('required', 'true');
  }
});

// Formulario de login/registro clásico
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  let username = authUsernameInput.value.trim();

  // Validación estricta a un máximo de 12 caracteres
  if (username.length > 12) {
    username = username.substring(0, 12);
  }

  authMessage.classList.remove('hidden');
  authMessage.className = "text-sm text-center text-gray-300";
  authMessage.textContent = "Procesando...";

  try {
    if (modoLogin) {
      await signInWithEmailAndPassword(auth, email, password);
      mostrarMensaje("¡Sesión iniciada con éxito!", "text-green-400");
      setTimeout(() => {
        authModal.classList.remove('active');
      }, 1500);
    } else {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      await updateProfile(userCredential.user, {
        displayName: username,
        photoURL: "https://api.dicebear.com/7.x/bottts/svg?seed=" + username
      });

      mostrarMensaje("¡Cuenta creada con éxito!", "text-green-400");
      setTimeout(() => {
        authModal.classList.remove('active');
        actualizarMenuUsuario(auth.currentUser);
      }, 1500);
    }
    authForm.reset();
  } catch (error) {
    let mensajeError = "Ocurrió un error.";
    if (error.code === 'auth/weak-password') mensajeError = "La contraseña debe tener mínimo 6 caracteres.";
    if (error.code === 'auth/email-already-in-use') mensajeError = "Ese correo ya está registrado.";
    if (error.code === 'auth/invalid-credential') mensajeError = "Correo o contraseña incorrectos.";
    mostrarMensaje(mensajeError, "text-red-400");
  }
});

// Login con Google
btnGoogle.addEventListener('click', async () => {
  authMessage.classList.remove('hidden');
  authMessage.className = "text-sm text-center text-gray-300";
  authMessage.textContent = "Abriendo ventana de Google...";

  try {
    await signInWithPopup(auth, googleProvider);
    mostrarMensaje("¡Sesión iniciada con Google!", "text-green-400");
    setTimeout(() => {
      authModal.classList.remove('active');
    }, 1500);
  } catch (error) {
    console.error(error);
    mostrarMensaje("No se pudo iniciar sesión con Google.", "text-red-400");
  }
});

// Cerrar sesión
btnLogout.addEventListener('click', () => {
  signOut(auth);
});

// --- FUNCIONES AUXILIARES ---

// Actualizar la barra de navegación según el estado de la sesión
function actualizarMenuUsuario(user) {
  if (user) {
    btnLoginMenu.classList.add('hidden');
    userLoggedInDiv.classList.remove('hidden');
    
    let name = user.displayName || user.email.split('@')[0];
    if (name.length > 12) name = name.substring(0, 12);

    userProfileLink.textContent = name;
    userProfileLink.href = `perfil.html?id=${user.uid}`;

    if (user.photoURL) {
      userAvatarMenu.src = user.photoURL;
      userAvatarMenu.classList.remove('hidden');
    } else {
      userAvatarMenu.classList.add('hidden');
    }
  } else {
    btnLoginMenu.classList.remove('hidden');
    userLoggedInDiv.classList.add('hidden');
    userProfileLink.textContent = "Mi Perfil";
    userProfileLink.href = "#";
    userAvatarMenu.classList.add('hidden');
  }
}

// Escuchador de estado de sesión
onAuthStateChanged(auth, (user) => {
  actualizarMenuUsuario(user);
});

// Mostrar mensajes de feedback en el modal
function mostrarMensaje(texto, claseColor) {
  authMessage.textContent = texto;
  authMessage.className = `text-sm text-center ${claseColor} mt-2`;
}

// --- DESPLAZAMIENTO SUAVE HACIA ARRIBA ---
const logoInicio = document.getElementById('logo-inicio');
const linkInicio = document.getElementById('link-inicio');

const desplazarArriba = (e) => {
  e.preventDefault();
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
};

if (logoInicio) logoInicio.addEventListener('click', desplazarArriba);
if (linkInicio) linkInicio.addEventListener('click', desplazarArriba);