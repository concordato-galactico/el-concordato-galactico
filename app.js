// ╔══════════════════════════════════════════════╗
// ║         CONFIGURACIÓN — EDITA AQUÍ          ║
// ╚══════════════════════════════════════════════╝

// 1. Tu configuración de Firebase (del paso 2.4)
const firebaseConfig = {
  apiKey:            "AIzaSyB4kL_LpZkmcWOFdDRoAv75fjOLCagryYs",
  authDomain:        "el-concordato-galactico.firebaseapp.com",
  projectId:         "el-concordato-galactico",
  storageBucket:     "el-concordato-galactico.firebasestorage.app",
  messagingSenderId: "345614287049",
  appId:             "1:345614287049:web:20f7d5486b0c5d94bd0d18"
};

// 2. Tu Cloud Name de Cloudinary (del paso 3.2)
const CLOUDINARY_CLOUD_NAME = "deb1ct129";   // ej: dxk8abc12

// 3. Tu Upload Preset de Cloudinary (del paso 3.3)
const CLOUDINARY_PRESET = "mapa-fotos";       // el nombre que pusiste

// 4. Dimensiones de tu imagen del mapa en píxeles
const ANCHO_MAPA = 8192;
const ALTO_MAPA  = 8192;

// 5. Nombre del archivo del mapa
const ARCHIVO_MAPA = 'mapa-base.png';

// 6. Capas PNG extra (déjalo [] si no tienes)
const CAPAS_EXTRA = [
  // { nombre: '🌌 Sectores', archivo: 'capa-sectores.png' },
];

// ╔══════════════════════════════════════════════╗
// ║       A PARTIR DE AQUÍ NO TOQUES NADA       ║
// ╚══════════════════════════════════════════════╝

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// — Firebase —
const fbApp   = initializeApp(firebaseConfig);
const db      = getFirestore(fbApp);
const auth    = getAuth(fbApp);
const pinsCol = collection(db, 'pins');

// — Mapa —
const bounds = [[0, 0], [ALTO_MAPA, ANCHO_MAPA]];
const mapa = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -4, maxZoom: 3, zoomSnap: 0.25,
});
mapa.fitBounds(bounds);
L.imageOverlay(ARCHIVO_MAPA, bounds).addTo(mapa);

// — Capas —
const grupoPins    = L.layerGroup().addTo(mapa);
const grupoNombres = L.layerGroup().addTo(mapa);

const capasMenu = {
  '📌 Pins':     grupoPins,
  '🏷️ Nombres':  grupoNombres,
};

CAPAS_EXTRA.forEach(c => {
  capasMenu[c.nombre] = L.imageOverlay(c.archivo, bounds);
});

// — Botones de capas visibles directamente —
const capasControl = document.createElement('div');
capasControl.id = 'capas-control';

const estadoCapas = {
  pins:    true,
  nombres: true,
};

function crearBtnCapa(label, key, capa) {
  const btn = document.createElement('button');
  btn.className = 'btn-capa activo';
  btn.textContent = label;
  btn.addEventListener('click', () => {
    estadoCapas[key] = !estadoCapas[key];
    if (estadoCapas[key]) {
      mapa.addLayer(capa);
      btn.classList.remove('inactivo');
      btn.classList.add('activo');
    } else {
      mapa.removeLayer(capa);
      btn.classList.remove('activo');
      btn.classList.add('inactivo');
    }
  });
  return btn;
}

capasControl.appendChild(crearBtnCapa('📌 Pins',    'pins',    grupoPins));
capasControl.appendChild(crearBtnCapa('🏷️ Nombres', 'nombres', grupoNombres));

CAPAS_EXTRA.forEach((c, i) => {
  const key = `extra_${i}`;
  estadoCapas[key] = false;
  const btn = crearBtnCapa(c.nombre, key, capasMenu[c.nombre]);
  btn.classList.remove('activo');
  btn.classList.add('inactivo');
  capasControl.appendChild(btn);
});

document.body.appendChild(capasControl);

// ══════════════════════════════
//  AUTENTICACIÓN
// ══════════════════════════════

let usuarioActual = null;

onAuthStateChanged(auth, (usuario) => {
  usuarioActual = usuario;
  actualizarUI(usuario);
});

function actualizarUI(usuario) {
  const infoEl    = document.getElementById('info-usuario');
  const btnLogin  = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const btnAñadir = document.getElementById('btn-añadir');

  if (usuario) {
    infoEl.textContent = `👤 ${usuario.displayName || usuario.email}`;
    btnLogin.classList.add('oculto');
    btnLogout.classList.remove('oculto');
    btnAñadir.classList.remove('oculto');
  } else {
    infoEl.textContent = '👁️ Solo lectura';
    btnLogin.classList.remove('oculto');
    btnLogout.classList.add('oculto');
    btnAñadir.classList.add('oculto');
    cancelarModoPin();
  }
}

window.loginGoogle = async function() {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    console.error('Error login:', err);
    alert('No se pudo iniciar sesión. Inténtalo de nuevo.');
  }
};

window.logoutGoogle = async function() {
  await signOut(auth);
};

// ══════════════════════════════
//  CARGAR PINS
// ══════════════════════════════

onSnapshot(pinsCol, (snapshot) => {
  snapshot.docChanges().forEach(change => {
    if (change.type === 'added') añadirPinAlMapa(change.doc.data());
  });
});

function añadirPinAlMapa(pin) {
  const icono = L.divIcon({
    className: '',
    html: `<div style="
      background:#e94560; width:16px; height:16px;
      border-radius:50% 50% 50% 0; transform:rotate(-45deg);
      border:2px solid #fff; box-shadow:0 2px 7px rgba(0,0,0,0.55);
    "></div>`,
    iconSize: [16, 16], iconAnchor: [8, 16],
  });

  const marker = L.marker([pin.lat, pin.lng], { icon: icono });
  marker.on('click', () => abrirPanel(pin));
  grupoPins.addLayer(marker);

  const etiqueta = L.tooltip({
    permanent: true, direction: 'top', offset: [0, -18],
  }).setContent(pin.nombre).setLatLng([pin.lat, pin.lng]);
  grupoNombres.addLayer(etiqueta);
}

// ══════════════════════════════
//  MODO AÑADIR PIN
// ══════════════════════════════

let modoAñadirPin  = false;
let coordsNuevoPin = null;

window.activarModoPin = function() {
  if (!usuarioActual) { alert('Debes iniciar sesión.'); return; }
  modoAñadirPin = true;
  document.getElementById('btn-añadir').classList.add('oculto');
  document.getElementById('instruccion').classList.remove('oculto');
  mapa.getContainer().style.cursor = 'crosshair';
};

window.cancelarModoPin = function() {
  modoAñadirPin = false;
  if (usuarioActual) document.getElementById('btn-añadir').classList.remove('oculto');
  document.getElementById('instruccion').classList.add('oculto');
  mapa.getContainer().style.cursor = '';
};

mapa.on('click', function(e) {
  if (!modoAñadirPin) return;
  coordsNuevoPin = e.latlng;
  cancelarModoPin();
  abrirModal();
});

// ══════════════════════════════
//  MODAL
// ══════════════════════════════

window.abrirModal = function() {
  document.getElementById('modal').classList.remove('oculto');
  document.getElementById('input-nombre').value = '';
  document.getElementById('input-descripcion').value = '';
  document.getElementById('input-fotos').value = '';
  document.getElementById('preview-fotos').innerHTML = '';
  document.getElementById('progreso-caja').classList.add('oculto');
  document.getElementById('progreso-barra').style.width = '0%';
};

window.cerrarModal = function() {
  document.getElementById('modal').classList.add('oculto');
  coordsNuevoPin = null;
};

document.getElementById('input-fotos').addEventListener('change', function() {
  const preview = document.getElementById('preview-fotos');
  preview.innerHTML = '';
  Array.from(this.files).forEach(file => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    preview.appendChild(img);
  });
});

// ══════════════════════════════
//  SUBIR FOTO A CLOUDINARY
// ══════════════════════════════

async function subirFotoCloudinary(archivo, indice, total) {
  const formData = new FormData();
  formData.append('file', archivo);
  formData.append('upload_preset', CLOUDINARY_PRESET);

  document.getElementById('progreso-texto').textContent =
    `Subiendo foto ${indice + 1} de ${total}...`;
  document.getElementById('progreso-barra').style.width =
    Math.round((indice / total) * 100) + '%';

  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const res  = await fetch(url, { method: 'POST', body: formData });

  if (!res.ok) throw new Error(`Error Cloudinary: ${res.status}`);

  const data = await res.json();
  return data.secure_url;
}

// ══════════════════════════════
//  GUARDAR PIN
// ══════════════════════════════

window.guardarPin = async function() {
  const nombre      = document.getElementById('input-nombre').value.trim();
  const descripcion = document.getElementById('input-descripcion').value.trim();
  const archivos    = document.getElementById('input-fotos').files;
  const btnGuardar  = document.getElementById('btn-guardar');

  if (!nombre)         { alert('Escribe un nombre para el lugar.'); return; }
  if (!usuarioActual)  { alert('Debes iniciar sesión.'); return; }

  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  try {
    const urlsFotos = [];

    if (archivos.length > 0) {
      document.getElementById('progreso-caja').classList.remove('oculto');

      for (let i = 0; i < archivos.length; i++) {
        const url = await subirFotoCloudinary(archivos[i], i, archivos.length);
        urlsFotos.push(url);
      }

      document.getElementById('progreso-barra').style.width = '100%';
      document.getElementById('progreso-texto').textContent = 'Fotos subidas ✓';
    }

    await addDoc(pinsCol, {
      nombre,
      descripcion,
      lat:      coordsNuevoPin.lat,
      lng:      coordsNuevoPin.lng,
      fotos:    urlsFotos,
      autor:    usuarioActual.displayName || usuarioActual.email,
      creadoEn: new Date().toISOString(),
    });

    cerrarModal();

  } catch (err) {
    console.error('Error al guardar:', err);
    if (err.code === 'permission-denied') {
      alert('No tienes permiso. Pide al administrador que añada tu UID a las reglas.');
    } else {
      alert('Error al guardar. Abre la consola (F12) para ver el detalle.');
    }
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = '💾 Guardar pin';
  }
};

// ══════════════════════════════
//  PANEL LATERAL
// ══════════════════════════════

window.abrirPanel = function(pin) {
  const contenido = document.getElementById('panel-contenido');

  const fecha = pin.creadoEn
    ? new Date(pin.creadoEn).toLocaleDateString('es-ES',
        { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const fotosHTML = (pin.fotos || []).length > 0
    ? `<div class="fotos-grid">${
        pin.fotos.map(url =>
          `<img src="${url}" onclick="abrirLightbox('${url}')" />`
        ).join('')
      }</div>`
    : '';

  contenido.innerHTML = `
    <h2>${pin.nombre}</h2>
    ${pin.autor ? `<p class="autor">✍️ ${pin.autor}</p>` : ''}
    ${fecha     ? `<p class="fecha">📅 ${fecha}</p>`     : ''}
    <p class="descripcion">${pin.descripcion || '<em>Sin descripción</em>'}</p>
    ${fotosHTML}
  `;

  document.getElementById('panel').classList.remove('oculto');
};

window.cerrarPanel = function() {
  document.getElementById('panel').classList.add('oculto');
};

// ══════════════════════════════
//  LIGHTBOX
// ══════════════════════════════

window.abrirLightbox = function(url) {
  const lb = document.createElement('div');
  lb.id = 'lightbox';
  lb.innerHTML = `
    <button id="lightbox-cerrar" onclick="this.parentElement.remove()">✕</button>
    <img src="${url}" />
  `;
  lb.addEventListener('click', e => { if (e.target === lb) lb.remove(); });
  document.body.appendChild(lb);
};
