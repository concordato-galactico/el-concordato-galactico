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
// — Capas de imagen (de abajo hacia arriba en el mapa) —
const EMPTY_TILE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const MapaTileLayer = L.GridLayer.extend({
  initialize(ruta, opts) {
    this._ruta = ruta;
    L.GridLayer.prototype.initialize.call(this, opts);
  },
  createTile(coords, done) {
    const img = document.createElement('img');
    const pz = coords.z + 5;
    const px = coords.x;
    const n  = Math.pow(2, pz);
    const py = coords.y + n;
    if (px < 0 || px >= n || py < 0 || py >= n) {
      img.src = EMPTY_TILE;
    } else {
      img.src = `${this._ruta}/${pz}/${px}/${py}.png`;
    }
    img.onload  = () => done(null, img);
    img.onerror = () => { img.src = EMPTY_TILE; done(null, img); };
    return img;
  }
});
function crearCapaTiles(ruta, zIndex) {
  return new MapaTileLayer(ruta, {
    tileSize: 256,
    minZoom: -4, maxZoom: 3,
    zIndex, bounds, noWrap: true,
    keepBuffer: 0,
    updateWhenIdle: true,
    updateWhenZooming: false
  });
}
const capaFisico     = crearCapaTiles('Mapas/mapa-fisico',   100); // off por defecto
const capaBase       = crearCapaTiles('Mapas/mapa-base',     101).addTo(mapa);
const capaNodos      = crearCapaTiles('Mapas/mapa-nodos',    102); // off por defecto
const capaEmblemas   = crearCapaTiles('Mapas/mapa-emblemas', 103).addTo(mapa);
const capaNombresImg = crearCapaTiles('Mapas/mapa-nombres',  104).addTo(mapa);

const estadoImagenes = {
  fisico: false, politico: true, nodos: false, nombresImg: true, emblemas: true
};

// — Capas de marcas —
const grupoPins    = L.layerGroup().addTo(mapa);
const grupoNombres = L.layerGroup().addTo(mapa);
const estadoCapas  = { marcas: true, nombres: true };

// — Filtro por categoría —
const CATEGORIAS = ['Sistema', 'Planeta', 'Estrella', 'Agujero Negro', 'Puerto Espacial', 'Nave'];
const categoriasVisibles = new Set(CATEGORIAS);

function debeEstarVisible(datos) {
  return estadoCapas.marcas && categoriasVisibles.has(datos.categoria || 'Sistema');
}

function actualizarVisibilidadMarcas() {
  for (const id of Object.keys(markersPorId)) {
    const datos   = datosPorId[id];
    const visible = debeEstarVisible(datos);

    const marker = markersPorId[id];
    if (visible) { if (!grupoPins.hasLayer(marker))    grupoPins.addLayer(marker); }
    else          { grupoPins.removeLayer(marker); }

    const tooltip = tooltipsPorId[id];
    if (tooltip) {
      if (visible) { if (!grupoNombres.hasLayer(tooltip)) grupoNombres.addLayer(tooltip); }
      else          { grupoNombres.removeLayer(tooltip); }
    }
  }
}

// — Panel de control de capas —
const capasControl = document.createElement('div');
capasControl.id = 'capas-control';

// Helper: fila con botón toggle para imagen de fondo
function crearFilaImagen(emoji, label, estadoKey, capaOverlay, inicialActivo = true) {
  const fila = document.createElement('div');
  fila.className = 'capa-fila';

  const btn = document.createElement('button');
  btn.className = inicialActivo ? 'btn-capa activo' : 'btn-capa inactivo';
  btn.textContent = `${emoji} ${label}`;
  btn.addEventListener('click', () => {
    estadoImagenes[estadoKey] = !estadoImagenes[estadoKey];
    if (estadoImagenes[estadoKey]) {
      capaOverlay.addTo(mapa);
      btn.classList.replace('inactivo', 'activo');
    } else {
      mapa.removeLayer(capaOverlay);
      btn.classList.replace('activo', 'inactivo');
    }
  });

  fila.appendChild(btn);
  return fila;
}

capasControl.appendChild(crearFilaImagen('📛', 'Nombres',          'nombresImg', capaNombresImg, true));
capasControl.appendChild(crearFilaImagen('✨', 'Emblemas',         'emblemas',   capaEmblemas,   true));
capasControl.appendChild(crearFilaImagen('🔵', 'Nodos Espaciales', 'nodos',      capaNodos,      false));
capasControl.appendChild(crearFilaImagen('🗺️', 'Mapa Político',   'politico',   capaBase,       true));
capasControl.appendChild(crearFilaImagen('🌍', 'Mapa Físico',     'fisico',     capaFisico,     false));

// Separador
const capasHr = document.createElement('hr');
capasHr.className = 'capas-sep';
capasControl.appendChild(capasHr);

// — Fila Marcas con desplegable de categorías —
const filaMarcas = document.createElement('div');
filaMarcas.className = 'capa-fila capa-fila-marcas';

const btnMarcas = document.createElement('button');
btnMarcas.className = 'btn-capa activo';
btnMarcas.textContent = '📌 Marcas';
btnMarcas.addEventListener('click', () => {
  estadoCapas.marcas = !estadoCapas.marcas;
  btnMarcas.classList.toggle('activo',   estadoCapas.marcas);
  btnMarcas.classList.toggle('inactivo', !estadoCapas.marcas);
  actualizarVisibilidadMarcas();
});

const btnExpandirCats = document.createElement('button');
btnExpandirCats.className = 'btn-expandir-cats';
btnExpandirCats.textContent = '▾';
btnExpandirCats.title = 'Filtrar por categoría';

const dropdownCats = document.createElement('div');
dropdownCats.id = 'categorias-dropdown';
dropdownCats.className = 'oculto';

// — Estado del isolate —
let catAislada        = null;
let snapshotPreIsolate = null;

function sincronizarCheckboxes() {
  dropdownCats.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = categoriasVisibles.has(cb.dataset.cat);
  });
}

function entrarIsolate(cat) {
  snapshotPreIsolate = new Set(categoriasVisibles);
  catAislada = cat;
  categoriasVisibles.clear();
  categoriasVisibles.add(cat);
  sincronizarCheckboxes();
  dropdownCats.querySelectorAll('.btn-isolate').forEach(b => {
    b.classList.toggle('activo', b.dataset.cat === cat);
  });
  actualizarVisibilidadMarcas();
}

function salirIsolate() {
  if (snapshotPreIsolate === null) return;
  categoriasVisibles.clear();
  snapshotPreIsolate.forEach(c => categoriasVisibles.add(c));
  snapshotPreIsolate = null;
  catAislada = null;
  sincronizarCheckboxes();
  dropdownCats.querySelectorAll('.btn-isolate').forEach(b => b.classList.remove('activo'));
  actualizarVisibilidadMarcas();
}

CATEGORIAS.forEach(cat => {
  const fila = document.createElement('div');
  fila.className = 'cat-fila';

  const check = document.createElement('input');
  check.type        = 'checkbox';
  check.checked     = true;
  check.id          = `cat-chk-${CSS.escape(cat)}`;
  check.dataset.cat = cat;

  check.addEventListener('change', () => {
    if (catAislada !== null) {
      // Salir del isolate, restaurar snapshot, luego aplicar este cambio encima
      salirIsolate();
      if (check.checked) categoriasVisibles.add(cat);
      else               categoriasVisibles.delete(cat);
      sincronizarCheckboxes();
    } else {
      if (check.checked) categoriasVisibles.add(cat);
      else               categoriasVisibles.delete(cat);
    }
    actualizarVisibilidadMarcas();
  });

  const lbl = document.createElement('label');
  lbl.htmlFor     = check.id;
  lbl.textContent = cat;

  const btnIsolate = document.createElement('button');
  btnIsolate.className   = 'btn-isolate';
  btnIsolate.textContent = '◎';
  btnIsolate.title       = `Solo ${cat}`;
  btnIsolate.dataset.cat = cat;
  btnIsolate.addEventListener('click', () => {
    if (catAislada === cat) {
      salirIsolate(); // segunda pulsada = desactivar isolate
    } else {
      entrarIsolate(cat);
    }
  });

  fila.appendChild(check);
  fila.appendChild(lbl);
  fila.appendChild(btnIsolate);
  dropdownCats.appendChild(fila);
});

btnExpandirCats.addEventListener('click', () => {
  const abierto = !dropdownCats.classList.contains('oculto');
  dropdownCats.classList.toggle('oculto', abierto);
  btnExpandirCats.textContent = abierto ? '▾' : '▴';
});

filaMarcas.appendChild(btnMarcas);
filaMarcas.appendChild(btnExpandirCats);
capasControl.appendChild(filaMarcas);
capasControl.appendChild(dropdownCats);

// — Fila Etiquetas —
const filaEtiquetas = document.createElement('div');
filaEtiquetas.className = 'capa-fila';

const btnEtiquetas = document.createElement('button');
btnEtiquetas.className = 'btn-capa activo';
btnEtiquetas.textContent = '🏷️ Etiquetas';
btnEtiquetas.addEventListener('click', () => {
  estadoCapas.nombres = !estadoCapas.nombres;
  btnEtiquetas.classList.toggle('activo',   estadoCapas.nombres);
  btnEtiquetas.classList.toggle('inactivo', !estadoCapas.nombres);
  if (estadoCapas.nombres) {
    if (!mapa.hasLayer(grupoNombres)) mapa.addLayer(grupoNombres);
  } else {
    mapa.removeLayer(grupoNombres);
  }
});

filaEtiquetas.appendChild(btnEtiquetas);
capasControl.appendChild(filaEtiquetas);

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
      // Actualizar icono y handler de clic del marcador
      if (markersPorId[datos.id]) {
        markersPorId[datos.id].setIcon(iconoPorCategoria(datos.categoria));
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

function iconoPorCategoria(categoria) {
  const nombre = encodeURIComponent(categoria || 'Sistema');
  return L.icon({
    iconUrl:    `categorias/${nombre}.png`,
    iconSize:   [40, 40],
    iconAnchor: [20, 20],
    popupAnchor:[0, -20],
  });
}

function añadirMarcaAlMapa(marca) {
  const icono = iconoPorCategoria(marca.categoria);

  const marker = L.marker([marca.lat, marca.lng], { icon: icono });
  marker.on('click', () => abrirPanel(datosPorId[marca.id]));
  if (debeEstarVisible(marca)) grupoPins.addLayer(marker);
  markersPorId[marca.id] = marker;

  const etiqueta = L.tooltip({ permanent: true, direction: 'top', offset: [0, -14] })
    .setContent(marca.nombre)
    .setLatLng([marca.lat, marca.lng]);
  if (debeEstarVisible(marca)) grupoNombres.addLayer(etiqueta);
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

// ══════════════════════════════
//  EDITOR DE TEXTO ENRIQUECIDO
// ══════════════════════════════

// Editor activo antes de que el botón de toolbar robe el foco
let editorActivo = null;

document.addEventListener('focusin', (e) => {
  if (e.target && e.target.classList.contains('editor-content')) {
    editorActivo = e.target;
  }
});

function actualizarToolbar(editorEl) {
  const toolbar = editorEl.previousElementSibling;
  if (!toolbar || !toolbar.classList.contains('editor-toolbar')) return;

  ['bold', 'italic', 'underline'].forEach(cmd => {
    const btn = toolbar.querySelector(`button[onclick="formatText('${cmd}')"]`);
    if (btn) btn.classList.toggle('activo', document.queryCommandState(cmd));
  });
}

window.formatText = function(cmd) {
  // Devolver el foco al editor antes de ejecutar el comando
  if (editorActivo) editorActivo.focus();
  document.execCommand(cmd, false, null);
  // Esperar un tick para que el navegador procese el cambio
  setTimeout(() => {
    if (editorActivo) actualizarToolbar(editorActivo);
  }, 0);
};

window.formatSize = function(selectEl) {
  const val = selectEl.value;
  if (!val) return;
  if (editorActivo) editorActivo.focus();
  document.execCommand('fontSize', false, val);
};

// Actualizar toolbar al mover el cursor o cambiar la selección
document.addEventListener('selectionchange', () => {
  setTimeout(() => {
    if (editorActivo) actualizarToolbar(editorActivo);
  }, 0);
});

// ══════════════════════════════
//  IMÁGENES INLINE EN EDITOR
// ══════════════════════════════

let rangoGuardado   = null;
let editorCapturado = null;

function guardarRangoSeleccion() {
  const sel = window.getSelection();
  rangoGuardado   = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0).cloneRange() : null;
  editorCapturado = editorActivo;
}

function restaurarRangoSeleccion() {
  if (!rangoGuardado || !editorCapturado) return;
  editorCapturado.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(rangoGuardado);
}

window.insertarImagenEditor = function() {
  if (!editorActivo) { alert('Haz clic primero dentro del editor de texto.'); return; }
  guardarRangoSeleccion();

  const fileInput = document.createElement('input');
  fileInput.type  = 'file';
  fileInput.accept = 'image/*';

  fileInput.addEventListener('change', async function() {
    const file = fileInput.files[0];
    if (!file) return;

    const isEdit  = editorCapturado && editorCapturado.id === 'edit-descripcion-editor';
    const barraId = isEdit ? 'edit-progreso-barra' : 'progreso-barra';
    const textoId = isEdit ? 'edit-progreso-texto' : 'progreso-texto';
    const cajaEl  = document.getElementById(isEdit ? 'edit-progreso-caja' : 'progreso-caja');

    cajaEl.classList.remove('oculto');
    try {
      const url = await subirFotoCloudinary(file, 0, 1, barraId, textoId);
      document.getElementById(textoId).textContent = 'Imagen insertada ✓';
      insertarImgEnEditor(url);
    } catch (err) {
      console.error('Error subiendo imagen inline:', err);
      alert('Error al subir la imagen.');
    }
  });

  fileInput.click();
};

function crearControlesImg(size, align) {
  size  = size  || 100;
  align = align || 'center';
  const div = document.createElement('div');
  div.className = 'img-inline-controls';
  div.innerHTML = `
    <button type="button" class="iic-btn" onclick="imgInlineSize(this,-25)" title="Reducir (−25%)">−</button>
    <span class="img-size-label">${size}%</span>
    <button type="button" class="iic-btn" onclick="imgInlineSize(this,25)"  title="Ampliar (+25%)">+</button>
    <span class="iic-sep"></span>
    <button type="button" class="iic-btn${align==='left'  ?' activo':''}" onclick="imgInlineAlign(this,'left')"   title="Alinear izquierda">⬅</button>
    <button type="button" class="iic-btn${align==='center'?' activo':''}" onclick="imgInlineAlign(this,'center')" title="Centrar">⬌</button>
    <button type="button" class="iic-btn${align==='right' ?' activo':''}" onclick="imgInlineAlign(this,'right')"  title="Alinear derecha">➡</button>
    <span class="iic-sep"></span>
    <button type="button" class="iic-btn iic-del" onclick="this.closest('.img-inline').remove()" title="Eliminar imagen">✕</button>
  `;
  return div;
}

function insertarImgEnEditor(url) {
  restaurarRangoSeleccion();

  const wrapper = document.createElement('div');
  wrapper.className        = 'img-inline';
  wrapper.contentEditable  = 'false';
  wrapper.style.textAlign  = 'center';
  wrapper.dataset.size     = '100';
  wrapper.dataset.align    = 'center';
  wrapper.appendChild(crearControlesImg(100, 'center'));

  const img = document.createElement('img');
  img.src             = url;
  img.style.cssText   = 'width:100%;max-width:100%;border-radius:6px;display:block;margin:0 auto;';
  wrapper.appendChild(img);

  if (rangoGuardado) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(rangoGuardado);
    rangoGuardado.deleteContents();
    rangoGuardado.insertNode(wrapper);
    const range = document.createRange();
    range.setStartAfter(wrapper);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else if (editorCapturado) {
    editorCapturado.appendChild(wrapper);
  }
}

window.imgInlineSize = function(btn, delta) {
  const wrapper = btn.closest('.img-inline');
  let size = parseInt(wrapper.dataset.size || '100');
  size = Math.min(100, Math.max(10, size + delta));
  wrapper.dataset.size = size;
  wrapper.querySelector('img').style.width = size + '%';
  wrapper.querySelector('.img-size-label').textContent = size + '%';
};

window.imgInlineAlign = function(btn, align) {
  const wrapper = btn.closest('.img-inline');
  wrapper.dataset.align   = align;
  wrapper.style.textAlign = align;
  // Actualizar el margen de la imagen para que la alineación surta efecto
  const img = wrapper.querySelector('img');
  if (img) {
    if      (align === 'left')   { img.style.margin = '0 auto 0 0'; }
    else if (align === 'right')  { img.style.margin = '0 0 0 auto'; }
    else                         { img.style.margin = '0 auto'; }
  }
  wrapper.querySelectorAll('.iic-btn').forEach(b => {
    if (['⬅','⬌','➡'].includes(b.textContent.trim())) b.classList.remove('activo');
  });
  btn.classList.add('activo');
};

// Elimina los controles del HTML antes de guardar en Firestore
function limpiarEditorHTML(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('.img-inline-controls').forEach(el => el.remove());
  return tmp.innerHTML;
}

// Reinyecta los controles al cargar un editor en modo edición
function reinjectImgControls(editorEl) {
  editorEl.querySelectorAll('.img-inline').forEach(wrapper => {
    wrapper.querySelectorAll('.img-inline-controls').forEach(c => c.remove());
    const size  = parseInt(wrapper.dataset.size  || '100');
    const align = wrapper.dataset.align || 'center';
    wrapper.insertBefore(crearControlesImg(size, align), wrapper.firstChild);
    wrapper.contentEditable = 'false';
    // Sync image width in case it was saved with a specific width
    const img = wrapper.querySelector('img');
    if (img) {
      img.style.width  = size + '%';
      img.style.display = 'block';
      if      (align === 'left')  { img.style.margin = '0 auto 0 0'; }
      else if (align === 'right') { img.style.margin = '0 0 0 auto'; }
      else                        { img.style.margin = '0 auto'; }
    }
  });
}

// ══════════════════════════════
//  MODAL NUEVA MARCA
// ══════════════════════════════

window.abrirModal = function() {
  document.getElementById('modal').classList.remove('oculto');
  document.getElementById('input-nombre').value = '';
  document.getElementById('input-categoria').value = 'Sistema';
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
  const categoria   = document.getElementById('input-categoria').value;
  const descripcion = limpiarEditorHTML(document.getElementById('input-descripcion-editor').innerHTML.trim());
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
      nombre, categoria, descripcion,
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
        <button class="btn-mover" onclick="activarModoMover()">📍 Cambiar Posición</button>
        <button class="btn-borrar" onclick="borrarMarca('${marca.id}')">🗑️ Borrar</button>
      </div>`
    : '';

  contenido.innerHTML = `
    <h2>${marca.nombre}</h2>
    ${marca.categoria ? `<p class="categoria"><strong>Categoría:</strong> ${marca.categoria}</p>` : ''}
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
//  MODO CAMBIAR POSICIÓN
// ══════════════════════════════

let modoMover = false;
let marcaParaMover = null;

window.activarModoMover = function() {
  if (!marcaAbierta) return;
  marcaParaMover = marcaAbierta;
  modoMover = true;

  // Cerrar panel y mostrar instrucción
  document.getElementById('panel').classList.add('oculto');

  const instrEl = document.getElementById('instruccion');
  instrEl.innerHTML = `Haz clic en el mapa para mover <strong>${marcaParaMover.nombre}</strong> <button onclick="cancelarModoMover()">Cancelar</button>`;
  instrEl.classList.remove('oculto');
  mapa.getContainer().style.cursor = 'crosshair';
};

window.cancelarModoMover = function() {
  modoMover = false;
  marcaParaMover = null;
  document.getElementById('instruccion').classList.add('oculto');
  mapa.getContainer().style.cursor = '';
  if (marcaAbierta) abrirPanel(marcaAbierta);
};

mapa.on('click', function(e) {
  if (modoMover && marcaParaMover) {
    const { lat, lng } = e.latlng;
    const id = marcaParaMover.id;

    // Mover el marcador visualmente de inmediato
    if (markersPorId[id]) markersPorId[id].setLatLng([lat, lng]);
    if (tooltipsPorId[id]) tooltipsPorId[id].setLatLng([lat, lng]);

    // Actualizar datos locales
    datosPorId[id].lat = lat;
    datosPorId[id].lng = lng;
    marcaParaMover.lat = lat;
    marcaParaMover.lng = lng;

    // Guardar en Firestore
    updateDoc(doc(db, 'pins', id), { lat, lng }).catch(err => {
      console.error('Error al mover marca:', err);
      alert('No se pudo guardar la nueva posición.');
    });

    // Salir del modo y reabrir el panel
    modoMover = false;
    document.getElementById('instruccion').classList.add('oculto');
    mapa.getContainer().style.cursor = '';
    abrirPanel(datosPorId[id]);
    marcaParaMover = null;
    return;
  }

  if (!modoAñadirPin) return;
  coordsNuevoPin = e.latlng;
  cancelarModoPin();
  abrirModal();
});

let fotosExistentes = [];

window.abrirModalEdicion = function() {
  const marca = marcaAbierta;
  if (!marca) return;

  fotosExistentes = [...(marca.fotos || [])];

  document.getElementById('edit-nombre').value = marca.nombre;
  document.getElementById('edit-categoria').value = marca.categoria || 'Sistema';

  // Cargar HTML rico (o convertir texto plano legacy)
  const desc = marca.descripcion || '';
  document.getElementById('edit-descripcion-editor').innerHTML =
    desc.startsWith('<') ? desc : desc.replace(/\n/g, '<br>');
  reinjectImgControls(document.getElementById('edit-descripcion-editor'));

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
  const categoria      = document.getElementById('edit-categoria').value;
  const descripcion    = limpiarEditorHTML(document.getElementById('edit-descripcion-editor').innerHTML.trim());
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

    await updateDoc(doc(db, 'pins', marcaAbierta.id), { nombre, categoria, descripcion, fotos: todasLasFotos });

    marcaAbierta.nombre      = nombre;
    marcaAbierta.categoria   = categoria;
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
