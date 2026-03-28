// ╔══════════════════════════════════════════════╗
// ║         CONFIGURACIÓN — EDITA AQUÍ          ║
// ╚══════════════════════════════════════════════╝

const firebaseConfig = {
  apiKey:            "AIzaSyB4kL_LpZkmcWOFdDRoAv75fjOLCagryYs",
  authDomain:        "el-concordato-galactico.firebaseapp.com",
  projectId:         "el-concordato-galactico",
  storageBucket:     "el-concordato-galactico.firebasestorage.app",
  messagingSenderId: "345614287049",
  appId:             "1:345614287049:web:20f7d5486b0c5d94bd0d18"
};

const CLOUDINARY_CLOUD_NAME = "deb1ct129";
const CLOUDINARY_PRESET     = "mapa-fotos";
const ANCHO_MAPA = 8192;
const ALTO_MAPA  = 8192;
const ARCHIVO_MAPA = 'mapa-base.png';
const CAPAS_EXTRA = [];

// ╔══════════════════════════════════════════════╗
// ║       A PARTIR DE AQUÍ NO TOQUES NADA       ║
// ╚══════════════════════════════════════════════╝

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, updateDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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
const estadoCapas  = { marcas: true, nombres: true };

const capasControl = document.createElement('div');
capasControl.id = 'capas-control';

function crearBtnCapa(label, key, capa) {
  const btn = document.createElement('button');
  btn.className = 'btn-capa activo';
  btn.textContent = label;
  btn.addEventListener('click', () => {
    estadoCapas[key] = !estadoCapas[key];
    if (estadoCapas[key]) { mapa.addLayer(capa); btn.classList.replace('inactivo','activo'); }
    else                  { mapa.removeLayer(capa); btn.classList.replace('activo','inactivo'); }
  });
  return btn;
}

capasControl.appendChild(crearBtnCapa('📌 Marcas',  'marcas',  grupoPins));
capasControl.appendChild(crearBtnCapa('🏷️ Nombres', 'nombres', grupoNombres));

CAPAS_EXTRA.forEach((c, i) => {
  const capa = L.imageOverlay(c.archivo, bounds);
  const key  = `extra_${i}`;
  estadoCapas[key] = false;
  const btn = crearBtnCapa(c.nombre, key, capa);
  btn.classList.replace('activo','inactivo');
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
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (err) { console.error('Error login:', err); alert('No se pudo iniciar sesión.'); }
};
window.logoutGoogle = async function() { await signOut(auth); };

// ══════════════════════════════
//  REFERENCIAS DE CAPAS POR ID
//  (necesarias para actualizar el tooltip sin recargar)
// ══════════════════════════════

const tooltipsPorId = {};  // id → tooltip Leaflet
const markersPorId  = {};  // id → marker Leaflet
const datosPorId    = {};  // id → objeto marca (para actualizar referencias)

// ══════════════════════════════
//  CARGAR Y ESCUCHAR MARCAS
// ══════════════════════════════

onSnapshot(pinsCol, (snapshot) => {
  snapshot.docChanges().forEach(change => {
    const datos = { ...change.doc.data(), id: change.doc.id };

    if (change.type === 'added') {
      datosPorId[datos.id] = datos;
      añadirMarcaAlMapa(datos);
    }

    if (change.type === 'modified') {
      // Actualizar datos locales
      Object.assign(datosPorId[datos.id], datos);

      // Actualizar etiqueta del mapa en tiempo real
      if (tooltipsPorId[datos.id]) {
        tooltipsPorId[datos.id].setContent(datos.nombre);
      }
      // Actualizar el handler de clic del marcador
      if (markersPorId[datos.id]) {
        markersPorId[datos.id].off('click');
        markersPorId[datos.id].on('click', () => abrirPanel(datosPorId[datos.id]));
      }
    }

    if (change.type === 'removed') {
      if (markersPorId[datos.id])  { grupoPins.removeLayer(markersPorId[datos.id]); delete markersPorId[datos.id]; }
      if (tooltipsPorId[datos.id]) { grupoNombres.removeLayer(tooltipsPorId[datos.id]); delete tooltipsPorId[datos.id]; }
      delete datosPorId[datos.id];
    }
  });
});

function añadirMarcaAlMapa(marca) {
  const icono = L.divIcon({
    className: '',
    html: `<div style="
      background:#e94560; width:16px; height:16px;
      border-radius:50% 50% 50% 0; transform:rotate(-45deg);
      border:2px solid #fff; box-shadow:0 2px 7px rgba(0,0,0,0.55);
    "></div>`,
    iconSize: [16, 16], iconAnchor: [8, 16],
  });

  const marker = L.marker([marca.lat, marca.lng], { icon: icono });
  marker.on('click', () => abrirPanel(datosPorId[marca.id]));
  grupoPins.addLayer(marker);
  markersPorId[marca.id] = marker;

  const etiqueta = L.tooltip({ permanent: true, direction: 'top', offset: [0, -18] })
    .setContent(marca.nombre)
    .setLatLng([marca.lat, marca.lng]);
  grupoNombres.addLayer(etiqueta);
  tooltipsPorId[marca.id] = etiqueta;
}

// ══════════════════════════════
//  MODO AÑADIR MARCA
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
//  EDITOR DE TEXTO ENRIQUECIDO
// ══════════════════════════════

window.formatText = function(cmd) {
  document.execCommand(cmd, false, null);
  actualizarBotonesFormato();
};

window.formatSize = function(selectEl) {
  const val = selectEl.value;
  if (!val) return;
  document.execCommand('fontSize', false, val);
  setTimeout(() => { selectEl.value = ''; }, 100);
};

function actualizarBotonesFormato() {
  const comandos = { bold: 'bold', italic: 'italic', underline: 'underline' };
  document.querySelectorAll('.editor-toolbar button').forEach(btn => {
    const onclick = btn.getAttribute('onclick') || '';
    for (const [cmd, label] of Object.entries(comandos)) {
      if (onclick.includes(`'${cmd}'`)) {
        const activo = document.queryCommandState(cmd);
        btn.classList.toggle('btn-formato-activo', activo);
      }
    }
  });
}

document.addEventListener('selectionchange', () => {
  // Solo actualizar si el foco está en algún editor
  const activo = document.activeElement;
  if (activo && activo.classList.contains('editor-content')) {
    actualizarBotonesFormato();
  }
});

// ══════════════════════════════
//  MODAL NUEVA MARCA
// ══════════════════════════════

window.abrirModal = function() {
  document.getElementById('modal').classList.remove('oculto');
  document.getElementById('input-nombre').value = '';
  document.getElementById('input-descripcion-editor').innerHTML = '';
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

async function subirFotoCloudinary(archivo, indice, total, barraId = 'progreso-barra', textoId = 'progreso-texto') {
  const formData = new FormData();
  formData.append('file', archivo);
  formData.append('upload_preset', CLOUDINARY_PRESET);

  document.getElementById(textoId).textContent = `Subiendo foto ${indice + 1} de ${total}...`;
  document.getElementById(barraId).style.width  = Math.round((indice / total) * 100) + '%';

  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const res  = await fetch(url, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Error Cloudinary: ${res.status}`);
  const data = await res.json();
  return data.secure_url;
}

// ══════════════════════════════
//  GUARDAR MARCA
// ══════════════════════════════

window.guardarPin = async function() {
  const nombre      = document.getElementById('input-nombre').value.trim();
  const descripcion = document.getElementById('input-descripcion-editor').innerHTML.trim();
  const archivos    = document.getElementById('input-fotos').files;
  const btnGuardar  = document.getElementById('btn-guardar');

  if (!nombre)        { alert('Escribe un nombre para el lugar.'); return; }
  if (!usuarioActual) { alert('Debes iniciar sesión.'); return; }

  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  try {
    const urlsFotos = [];
    if (archivos.length > 0) {
      document.getElementById('progreso-caja').classList.remove('oculto');
      for (let i = 0; i < archivos.length; i++) {
        urlsFotos.push(await subirFotoCloudinary(archivos[i], i, archivos.length));
      }
      document.getElementById('progreso-barra').style.width = '100%';
      document.getElementById('progreso-texto').textContent = 'Fotos subidas ✓';
    }

    await addDoc(pinsCol, {
      nombre, descripcion,
      lat: coordsNuevoPin.lat, lng: coordsNuevoPin.lng,
      fotos: urlsFotos,
      autor: usuarioActual.displayName || usuarioActual.email,
      creadoEn: new Date().toISOString(),
    });
    cerrarModal();
  } catch (err) {
    console.error('Error al guardar:', err);
    alert(err.code === 'permission-denied'
      ? 'No tienes permiso. Pide al administrador que añada tu UID a las reglas.'
      : 'Error al guardar. Abre la consola (F12) para ver el detalle.');
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = '💾 Guardar marca';
  }
};

// ══════════════════════════════
//  BORRAR MARCA
// ══════════════════════════════

window.borrarMarca = async function(id) {
  if (!confirm('¿Seguro que quieres borrarla?')) return;
  try {
    await deleteDoc(doc(db, 'pins', id));
    cerrarPanel();
    // El listener onSnapshot (removed) limpiará las capas automáticamente
  } catch (err) {
    console.error('Error al borrar:', err);
    alert(err.code === 'permission-denied'
      ? 'No tienes permiso para borrar esta marca.'
      : 'Error al borrar. Abre la consola (F12) para ver el detalle.');
  }
};

// ══════════════════════════════
//  PANEL LATERAL
// ══════════════════════════════

let marcaAbierta = null;

window.abrirPanel = function(marca) {
  marcaAbierta = marca;
  const contenido = document.getElementById('panel-contenido');

  // Soporte legacy: si la descripción es texto plano (sin etiquetas HTML), convertir saltos
  const desc = marca.descripcion || '';
  const descHTML = desc.startsWith('<') ? desc : desc.replace(/\n/g, '<br>');

  const fotosHTML = (marca.fotos || []).length > 0
    ? `<div class="fotos-grid">${marca.fotos.map(url =>
        `<img src="${url}" onclick="abrirLightbox('${url}')" />`).join('')}</div>`
    : '';

  const btnsAccion = usuarioActual
    ? `<div class="btns-accion">
        <button class="btn-editar" onclick="abrirModalEdicion()">✏️ Editar</button>
        <button class="btn-borrar" onclick="borrarMarca('${marca.id}')">🗑️ Borrar</button>
      </div>`
    : '';

  contenido.innerHTML = `
    <h2>${marca.nombre}</h2>
    <div class="descripcion">${descHTML || '<em>Sin descripción</em>'}</div>
    ${fotosHTML}
    ${marca.autor ? `<p class="autor">✍️ ${marca.autor}</p>` : ''}
    ${btnsAccion}
  `;

  document.getElementById('panel').classList.remove('oculto');
};

window.cerrarPanel = function() {
  document.getElementById('panel').classList.add('oculto');
  marcaAbierta = null;
};

// ══════════════════════════════
//  MODAL EDICIÓN
// ══════════════════════════════

let fotosExistentes = [];

window.abrirModalEdicion = function() {
  const marca = marcaAbierta;
  if (!marca) return;

  fotosExistentes = [...(marca.fotos || [])];

  document.getElementById('edit-nombre').value = marca.nombre;

  // Cargar HTML rico (o convertir texto plano legacy)
  const desc = marca.descripcion || '';
  document.getElementById('edit-descripcion-editor').innerHTML =
    desc.startsWith('<') ? desc : desc.replace(/\n/g, '<br>');

  document.getElementById('edit-fotos-nuevas').value = '';
  document.getElementById('edit-preview-nuevas').innerHTML = '';
  document.getElementById('edit-progreso-caja').classList.add('oculto');
  document.getElementById('edit-progreso-barra').style.width = '0%';

  renderizarFotosExistentes();
  document.getElementById('modal-edicion').classList.remove('oculto');
};

function renderizarFotosExistentes() {
  const container = document.getElementById('edit-fotos-existentes');
  if (fotosExistentes.length === 0) {
    container.innerHTML = '<p style="color:#555;font-size:0.82rem;margin-top:4px;">Sin fotos</p>';
    return;
  }
  container.innerHTML = fotosExistentes.map((url, i) => `
    <div class="foto-existente">
      <img src="${url}" />
      <button class="btn-quitar-foto" onclick="quitarFotoExistente(${i})">✕</button>
    </div>
  `).join('');
}

window.quitarFotoExistente = function(indice) {
  fotosExistentes.splice(indice, 1);
  renderizarFotosExistentes();
};

window.cerrarModalEdicion = function() {
  document.getElementById('modal-edicion').classList.add('oculto');
  fotosExistentes = [];
};

document.getElementById('edit-fotos-nuevas').addEventListener('change', function() {
  const preview = document.getElementById('edit-preview-nuevas');
  preview.innerHTML = '';
  Array.from(this.files).forEach(file => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    preview.appendChild(img);
  });
});

window.guardarEdicion = async function() {
  const nombre         = document.getElementById('edit-nombre').value.trim();
  const descripcion    = document.getElementById('edit-descripcion-editor').innerHTML.trim();
  const archivosNuevos = document.getElementById('edit-fotos-nuevas').files;
  const btnGuardar     = document.getElementById('btn-guardar-edicion');

  if (!nombre)        { alert('Escribe un nombre para el lugar.'); return; }
  if (!usuarioActual) { alert('Debes iniciar sesión.'); return; }

  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  try {
    const urlsFotosNuevas = [];
    if (archivosNuevos.length > 0) {
      document.getElementById('edit-progreso-caja').classList.remove('oculto');
      for (let i = 0; i < archivosNuevos.length; i++) {
        urlsFotosNuevas.push(await subirFotoCloudinary(
          archivosNuevos[i], i, archivosNuevos.length,
          'edit-progreso-barra', 'edit-progreso-texto'
        ));
      }
      document.getElementById('edit-progreso-barra').style.width = '100%';
      document.getElementById('edit-progreso-texto').textContent = 'Fotos subidas ✓';
    }

    const todasLasFotos = [...fotosExistentes, ...urlsFotosNuevas];

    await updateDoc(doc(db, 'pins', marcaAbierta.id), { nombre, descripcion, fotos: todasLasFotos });

    // Actualizar objeto local — el listener onSnapshot(modified) actualizará el tooltip
    marcaAbierta.nombre      = nombre;
    marcaAbierta.descripcion = descripcion;
    marcaAbierta.fotos       = todasLasFotos;

    cerrarModalEdicion();
    abrirPanel(marcaAbierta);

  } catch (err) {
    console.error('Error al editar:', err);
    alert(err.code === 'permission-denied'
      ? 'No tienes permiso para editar esta marca.'
      : 'Error al guardar. Abre la consola (F12) para ver el detalle.');
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = '💾 Guardar cambios';
  }
};

// ══════════════════════════════
//  RESIZE DEL PANEL
// ══════════════════════════════

(function iniciarResize() {
  const panel  = document.getElementById('panel');
  const handle = document.getElementById('panel-resize-handle');
  let arrastrando = false;

  handle.addEventListener('mousedown', (e) => {
    arrastrando = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!arrastrando) return;
    const rect     = panel.getBoundingClientRect();
    const newWidth = e.clientX - rect.left;
    if (newWidth >= 260 && newWidth <= 860) {
      panel.style.width = newWidth + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    if (!arrastrando) return;
    arrastrando = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
})();

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
