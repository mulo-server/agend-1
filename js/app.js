/**
 * Main Application Logic & Controller (Agend-1 App)
 */

import {
  fetchActivities,
  saveActivityApi,
  deleteActivityApi,
  fetchTemplates,
  saveTemplateApi,
  deleteTemplateApi,
  fetchFields,
  saveFieldApi,
  deleteFieldApi,
  fetchCategories,
  saveCategoryApi,
  deleteCategoryApi
} from './data.js';

import {
  updateStatusLed,
  renderActivitiesList,
  renderNotepadTabs,
  renderTemplateSelectOptions,
  renderTemplateFields,
  renderFilesList,
  renderCategorySelectOptions,
  renderCategoryManagerList,
  hexToRgba,
  escapeHtml,
  setModalBusy,
  setButtonLoading,
  setModalStatus
} from './ui.js';

// Application State
const state = {
  activities: [],
  templates: [],
  fields: [],
  categories: [],
  currentActivity: null,
  activePageIndex: 0,
  searchQuery: '',
  statusFilter: 'all',
  categoryFilter: 'all',
  dataSearchQuery: '',
  fileSearchQuery: '',
  favoriteOnlyFilter: false,
  urgentOnlyFilter: false,
  autoSaveTimer: null,
  isDirty: false,
  pendingBrowseFileIndex: null,
  pendingPageEditIndex: null,
  // Flag "operazione di rete in corso" per ciascuna modale: finché sono
  // true, la modale corrispondente blocca chiusura e nuovi submit (vedi
  // setModalBusy in ui.js). Prevengono i salvataggi doppi/incoerenti che si
  // verificavano premendo Salva e poi chiudendo la modale in rapida sequenza.
  templateModalSaving: false,
  categoryModalBusy: false,
  pageEditModalSaving: false
};

// Riferimento alla riga attualmente trascinata nel builder dei campi template
// (usato dal drag & drop di riordino in loadTemplateToModalBuilder/addTemplateFieldRowToModalBuilder).
let draggedFieldRow = null;

// DOM Elements Initialization
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// Avvisa l'utente se prova a chiudere la pagina con modifiche non ancora
// salvate (il debounce dell'autosave è di 3s, quindi la finestra di rischio
// esiste davvero) e tenta comunque un salvataggio best-effort.
window.addEventListener('beforeunload', (e) => {
  if (state.isDirty) {
    flushPendingSave();
    e.preventDefault();
    e.returnValue = '';
  }
});

async function initApp() {
  updateStatusLed('saving', 'Caricamento dati...');
  try {
    state.templates = await fetchTemplates();
    state.fields = await fetchFields();
    state.categories = await fetchCategories();
    state.activities = await fetchActivities();

    if (state.activities.length > 0) {
      setCurrentActivity(state.activities[0].id);
    } else {
      createNewActivity();
    }

    renderUI();
    bindEvents();
    updateStatusLed('ready', 'Pronto');
  } catch (err) {
    console.error('Inizializzazione fallita:', err);
    updateStatusLed('offline', 'Errore caricamento dati');
  }
}

function bindEvents() {
  // Activity Search & Filter
  const searchInput = document.getElementById('searchActivityInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase();
      renderFilteredActivities();
    });
  }

  const filterSelect = document.getElementById('filterStatusSelect');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      state.statusFilter = e.target.value;
      renderFilteredActivities();
    });
  }

  const filterCategorySelect = document.getElementById('filterCategorySelect');
  if (filterCategorySelect) {
    filterCategorySelect.addEventListener('change', (e) => {
      state.categoryFilter = e.target.value;
      renderFilteredActivities();
    });
  }

  const toggleFavoriteFilter = document.getElementById('toggleFavoriteFilter');
  if (toggleFavoriteFilter) {
    toggleFavoriteFilter.addEventListener('click', () => {
      state.favoriteOnlyFilter = !state.favoriteOnlyFilter;
      toggleFavoriteFilter.classList.toggle('active', state.favoriteOnlyFilter);
      renderFilteredActivities();
    });
  }

  const toggleUrgentFilter = document.getElementById('toggleUrgentFilter');
  if (toggleUrgentFilter) {
    toggleUrgentFilter.addEventListener('click', () => {
      state.urgentOnlyFilter = !state.urgentOnlyFilter;
      toggleUrgentFilter.classList.toggle('active', state.urgentOnlyFilter);
      renderFilteredActivities();
    });
  }

  // Activity Actions
  document.getElementById('btnCreateActivity')?.addEventListener('click', () => {
    createNewActivity();
  });

  const activityTitleInput = document.getElementById('activityTitleInput');
  if (activityTitleInput) {
    activityTitleInput.addEventListener('input', (e) => {
      if (state.currentActivity) {
        state.currentActivity.title = e.target.value;
        renderFilteredActivities();
        triggerAutoSave();
      }
    });
    // Evita di perdere il titolo se l'utente lo svuota per errore
    activityTitleInput.addEventListener('blur', (e) => {
      if (state.currentActivity && e.target.value.trim() === '') {
        e.target.value = state.currentActivity.title = 'Senza Titolo';
        triggerAutoSave();
      }
    });
  }

  const actStatusSelect = document.getElementById('activityStatusSelect');
  if (actStatusSelect) {
    actStatusSelect.addEventListener('change', (e) => {
      if (state.currentActivity) {
        state.currentActivity.status = e.target.value;
        renderFilteredActivities();
        triggerAutoSave();
      }
    });
  }

  const actCategorySelect = document.getElementById('activityCategorySelect');
  if (actCategorySelect) {
    actCategorySelect.addEventListener('change', (e) => {
      if (state.currentActivity) {
        state.currentActivity.categoryId = e.target.value || null;
        renderFilteredActivities();
        triggerAutoSave();
      }
    });
  }

  // WYSIWYG Editor Setup
  const editor = document.getElementById('notepadEditor');
  if (editor) {
    editor.addEventListener('input', () => {
      if (state.currentActivity && state.currentActivity.notepadPages[state.activePageIndex]) {
        state.currentActivity.notepadPages[state.activePageIndex].content = editor.innerHTML;
        state.currentActivity.notepad = editor.innerHTML; // Default content fallback
        triggerAutoSave();
      }
    });
  }

  // WYSIWYG Toolbar Commands
  document.querySelectorAll('.tool-btn[data-command]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const command = btn.dataset.command;
      const value = btn.dataset.value || null;
      document.execCommand(command, false, value);
      editor.focus();
      triggerAutoSave();
    });
  });

  document.getElementById('textColorPicker')?.addEventListener('input', (e) => {
    document.execCommand('foreColor', false, e.target.value);
    editor.focus();
    triggerAutoSave();
  });

  document.getElementById('highlightColorPicker')?.addEventListener('input', (e) => {
    document.execCommand('hiliteColor', false, e.target.value);
    editor.focus();
    triggerAutoSave();
  });

  // Template Selection
  const tplSelect = document.getElementById('templateSelect');
  if (tplSelect) {
    tplSelect.addEventListener('change', (e) => {
      if (!state.currentActivity) return;
      state.currentActivity.templateId = e.target.value || null;
      if (!state.currentActivity.fieldValues) {
        state.currentActivity.fieldValues = {};
      }
      state.dataSearchQuery = '';
      renderCurrentTemplateFields();
      triggerAutoSave();
    });
  }

  // Ricerca Dati: filtra i campi compilati dell'attività quando non è applicato alcun template
  const dataSearchInput = document.getElementById('templateDataSearchInput');
  if (dataSearchInput) {
    dataSearchInput.addEventListener('input', (e) => {
      state.dataSearchQuery = e.target.value.toLowerCase();
      renderCurrentTemplateFields();
    });
  }

  // Ricerca File: filtra i campi file/percorsi dell'attività corrente per nome o percorso
  const searchFileInput = document.getElementById('searchFileInput');
  if (searchFileInput) {
    searchFileInput.addEventListener('input', (e) => {
      state.fileSearchQuery = e.target.value;
      renderFiles();
    });
  }

  // Files Add Button
  document.getElementById('btnAddFileField')?.addEventListener('click', () => {
    if (!state.currentActivity) return;
    if (!state.currentActivity.files) {
      state.currentActivity.files = [];
    }
    const newFileId = 'file_' + Date.now();
    state.currentActivity.files.push({
      id: newFileId,
      name: 'Documento ' + (state.currentActivity.files.length + 1),
      path: '',
      favorite: false,
      urgent: false
    });
    renderFiles();
    triggerAutoSave();
  });

  // Native File Picker Listener
  // NOTA IMPORTANTE: per motivi di sicurezza, NESSUN browser standard (Chrome,
  // Firefox, Safari, Edge) espone il percorso assoluto reale di un file
  // selezionato tramite <input type="file">. La proprietà "file.path" esiste
  // solo in ambienti non-browser come Electron o NW.js. In un'app web pura
  // come questa, il massimo che possiamo leggere in modo affidabile è il nome
  // del file: per questo NON generiamo più un percorso fittizio (es. "/home/
  // user/Documenti/..."), che avrebbe potuto sembrare corretto ma non lo era
  // quasi mai. Inseriamo solo il nome reale e lasciamo che l'utente completi
  // o incolli il percorso assoluto corretto nel campo di testo.
  const fileInput = document.getElementById('nativeFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0 && state.pendingBrowseFileIndex !== null) {
        const file = e.target.files[0];
        const realPath = file.path; // valorizzato solo in Electron/NW.js, mai nel browser
        if (state.currentActivity && state.currentActivity.files[state.pendingBrowseFileIndex]) {
          const fileEntry = state.currentActivity.files[state.pendingBrowseFileIndex];
          fileEntry.path = realPath || file.name;
          renderFiles();
          triggerAutoSave();
          if (!realPath) {
            // Portiamo il focus sul campo percorso della riga appena aggiornata,
            // selezionando il testo, cosi l'utente puo' subito digitare o
            // incollare il percorso assoluto corretto davanti al nome file.
            const pathInputs = document.querySelectorAll('.file-path-input');
            const targetInput = pathInputs[state.pendingBrowseFileIndex];
            if (targetInput) {
              targetInput.focus();
              targetInput.select();
            }
          }
        }
      }
      // Reset per permettere di selezionare di nuovo lo stesso file in futuro
      fileInput.value = '';
    });
  }

  // Template Manager Modal Handlers
  document.getElementById('btnOpenTemplateManager')?.addEventListener('click', openTemplateModal);
  document.getElementById('btnCloseTemplateModal')?.addEventListener('click', closeTemplateModal);
  document.getElementById('btnCancelTemplateModal')?.addEventListener('click', closeTemplateModal);

  // Category Manager Modal Handlers
  document.getElementById('btnOpenCategoryManager')?.addEventListener('click', openCategoryModal);
  document.getElementById('btnCloseCategoryModal')?.addEventListener('click', closeCategoryModal);
  document.getElementById('btnCloseCategoryModalFooter')?.addEventListener('click', closeCategoryModal);
  document.getElementById('btnAddCategory')?.addEventListener('click', addCategoryFromModal);

  // Page Edit Modal Handlers (nome + colore pagina notepad)
  document.getElementById('btnClosePageEditModal')?.addEventListener('click', closePageEditModal);
  document.getElementById('btnCancelPageEditModal')?.addEventListener('click', closePageEditModal);
  document.getElementById('btnSavePageEditModal')?.addEventListener('click', savePageEditModal);
  document.getElementById('btnPageEditNoColor')?.addEventListener('click', () => {
    const colorInput = document.getElementById('pageEditColorInput');
    if (colorInput) colorInput.value = '';
  });

  document.getElementById('modalTemplateSelector')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'new') {
      loadTemplateToModalBuilder({ name: '', fields: [] });
    } else {
      const selectedTpl = state.templates.find(t => t.id === val);
      if (selectedTpl) {
        loadTemplateToModalBuilder(selectedTpl);
      }
    }
  });

  document.getElementById('btnAddTemplateFieldRow')?.addEventListener('click', () => {
    addTemplateFieldRowToModalBuilder({ id: '', label: '', type: 'text' });
  });

  document.getElementById('btnSaveTemplate')?.addEventListener('click', saveModalTemplate);
  document.getElementById('btnDeleteTemplate')?.addEventListener('click', deleteModalTemplate);
}

// State Mutation & Controller Methods
function setCurrentActivity(activityId) {
  if (state.currentActivity && state.currentActivity.id === activityId) return;
  flushPendingSave();

  const found = state.activities.find(a => a.id === activityId);
  if (!found) return;

  state.currentActivity = found;
  state.activePageIndex = found.activePageIndex || 0;

  // Reset della ricerca file: è relativa all'attività corrente, non ha senso
  // mantenerla filtrata passando a un'altra attività.
  state.fileSearchQuery = '';
  const searchFileInput = document.getElementById('searchFileInput');
  if (searchFileInput) searchFileInput.value = '';

  // Difesa: se fieldValues arriva come Array (può capitare con dati storici
  // salvati prima del fix del bug PHP array-vuoto/oggetto-vuoto), lo
  // normalizziamo a Oggetto. Altrimenti ogni scrittura futura verrebbe persa
  // silenziosamente da JSON.stringify.
  if (!found.fieldValues || Array.isArray(found.fieldValues)) {
    found.fieldValues = {};
  }

  // Sanitize notepad pages structure
  if (!found.notepadPages || !Array.isArray(found.notepadPages) || found.notepadPages.length === 0) {
    found.notepadPages = [
      { id: 'p1', title: 'Pagina 1', content: found.notepad || '' }
    ];
    found.activePageIndex = 0;
  }
  if (state.activePageIndex >= found.notepadPages.length) {
    state.activePageIndex = 0;
  }

  renderUI();
}

async function createNewActivity() {
  flushPendingSave();

  const newAct = {
    title: 'Nuova Attività ' + (state.activities.length + 1),
    status: 'in_progress',
    categoryId: null,
    favorite: false,
    urgent: false,
    notepad: '<p></p>',
    notepadPages: [
      { id: 'p1', title: 'Pagina 1', content: '<p></p>', color: null }
    ],
    activePageIndex: 0,
    templateId: state.templates.length > 0 ? state.templates[0].id : null,
    fieldValues: {},
    files: []
  };

  updateStatusLed('saving', 'Creazione attività...');
  try {
    const saved = await saveActivityApi(newAct);
    state.activities.unshift(saved);
    setCurrentActivity(saved.id);
    updateStatusLed('ready', 'Attività creata');
  } catch (err) {
    alert('Errore creazione attività: ' + err.message);
    updateStatusLed('offline', 'Errore salvataggio');
  }
}

async function deleteActivity(activityId) {
  updateStatusLed('saving', 'Eliminazione...');
  try {
    await deleteActivityApi(activityId);
    state.activities = state.activities.filter(a => a.id !== activityId);

    if (state.activities.length > 0) {
      setCurrentActivity(state.activities[0].id);
    } else {
      createNewActivity();
    }
    updateStatusLed('ready', 'Attività eliminata');
  } catch (err) {
    alert('Impossibile eliminare: ' + err.message);
    updateStatusLed('offline', 'Errore eliminazione');
  }
}

function triggerAutoSave() {
  state.isDirty = true;
  updateStatusLed('saving', 'Modifiche rilevate...');

  // IMPORTANTE: catturiamo qui il riferimento all'attività che sta venendo
  // modificata ORA, non quella che sarà "corrente" tra 3 secondi.
  // Prima di questo fix, se l'utente cambiava attività entro i 3s di debounce,
  // il timer salvava l'attività nuova (sbagliata) e le modifiche a quella
  // precedente andavano perse senza alcun errore visibile.
  const activityBeingEdited = state.currentActivity;

  if (state.autoSaveTimer) {
    clearTimeout(state.autoSaveTimer);
  }

  // Debounce save 3 seconds
  state.autoSaveTimer = setTimeout(() => {
    state.autoSaveTimer = null;
    saveActivityNow(activityBeingEdited);
  }, 3000);
}

async function saveActivityNow(activity) {
  if (!activity) return;
  try {
    const saved = await saveActivityApi(activity);
    if (activity === state.currentActivity) {
      state.isDirty = false;
    }
    activity.updatedAt = saved.updatedAt;
    if (!activity.id && saved.id) activity.id = saved.id;
    renderFilteredActivities();
    updateStatusLed('ready', 'Salvataggio automatico completato');
  } catch (err) {
    console.error('AutoSave failed:', err);
    updateStatusLed('offline', 'Salvataggio fallito');
  }
}

// Forza il salvataggio immediato di eventuali modifiche in sospeso.
// Va chiamata PRIMA di cambiare/eliminare l'attività corrente o di
// chiudere la pagina, altrimenti il debounce di 3s rischia di perdere dati.
function flushPendingSave() {
  if (state.autoSaveTimer) {
    clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = null;
    if (state.isDirty && state.currentActivity) {
      saveActivityNow(state.currentActivity);
    }
  }
}

// Rendering Orchestrator
function renderUI() {
  renderFilteredActivities();
  renderNotepadSection();
  renderTemplateSection();
  renderFiles();
  renderCategoryFilterSelect();
}

function renderCategoryFilterSelect() {
  const filterSelect = document.getElementById('filterCategorySelect');
  if (!filterSelect) return;
  const currentValue = state.categoryFilter;
  filterSelect.innerHTML = '<option value="all">Tutte le categorie</option><option value="none">Senza categoria</option>';
  state.categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    filterSelect.appendChild(opt);
  });
  // Se la categoria selezionata come filtro è stata eliminata, torniamo a "Tutte"
  const stillValid = currentValue === 'all' || currentValue === 'none' || state.categories.some(c => c.id === currentValue);
  filterSelect.value = stillValid ? currentValue : 'all';
  if (!stillValid) state.categoryFilter = 'all';
}

function renderFilteredActivities() {
  let list = state.activities;

  if (state.statusFilter !== 'all') {
    list = list.filter(a => a.status === state.statusFilter);
  }

  if (state.categoryFilter !== 'all') {
    if (state.categoryFilter === 'none') {
      list = list.filter(a => !a.categoryId);
    } else {
      list = list.filter(a => a.categoryId === state.categoryFilter);
    }
  }

  if (state.searchQuery) {
    list = list.filter(a =>
      (a.title || '').toLowerCase().includes(state.searchQuery) ||
      (a.notepad || '').toLowerCase().includes(state.searchQuery)
    );
  }

  if (state.favoriteOnlyFilter) {
    list = list.filter(a => a.favorite);
  }
  if (state.urgentOnlyFilter) {
    list = list.filter(a => a.urgent);
  }

  // Ordinamento: preferite in cima, poi urgenti, infine per ultima modifica
  // (più recenti prima). Le priorità "umane" (cosa ho segnato come
  // importante) battono l'ordinamento puramente cronologico.
  list = [...list].sort((a, b) => {
    if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
    if (!!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });

  const categoriesById = new Map(state.categories.map(c => [c.id, c]));

  renderActivitiesList(
    list,
    state.currentActivity ? state.currentActivity.id : null,
    categoriesById,
    (id) => setCurrentActivity(id),
    (id) => deleteActivity(id),
    (id) => toggleActivityFlag(id, 'favorite'),
    (id) => toggleActivityFlag(id, 'urgent')
  );
}

// Attiva/disattiva Preferito o Urgente per un'attività, richiamabile
// direttamente dalla card in lista senza dover aprire l'attività.
// Se è l'attività correntemente aperta, la modifica rientra nel normale
// ciclo di autosalvataggio (assieme a eventuali altre modifiche in corso);
// altrimenti viene salvata subito, con rollback in caso di errore di rete.
async function toggleActivityFlag(activityId, flagName) {
  const act = state.activities.find(a => a.id === activityId);
  if (!act) return;

  const previousValue = !!act[flagName];
  act[flagName] = !previousValue;
  renderFilteredActivities();

  if (state.currentActivity && state.currentActivity.id === activityId) {
    triggerAutoSave();
    return;
  }

  updateStatusLed('saving', 'Aggiornamento...');
  try {
    const saved = await saveActivityApi(act);
    act.updatedAt = saved.updatedAt;
    renderFilteredActivities();
    updateStatusLed('ready', 'Aggiornato');
  } catch (err) {
    act[flagName] = previousValue;
    renderFilteredActivities();
    alert('Impossibile aggiornare l\'attività: ' + err.message);
    updateStatusLed('offline', 'Errore salvataggio');
  }
}

function renderNotepadSection() {
  const titleInput = document.getElementById('activityTitleInput');
  const actStatusSelect = document.getElementById('activityStatusSelect');
  const actCategorySelect = document.getElementById('activityCategorySelect');
  const editor = document.getElementById('notepadEditor');
  const editorContainer = editor ? editor.closest('.editor-container') : null;

  if (!state.currentActivity) {
    if (titleInput) {
      titleInput.value = '';
      titleInput.disabled = true;
      titleInput.placeholder = 'Nessuna attività';
    }
    if (editor) editor.innerHTML = '';
    if (actStatusSelect) actStatusSelect.disabled = true;
    if (actCategorySelect) actCategorySelect.disabled = true;
    return;
  }

  if (titleInput) {
    titleInput.disabled = false;
    // Non sovrascrivere mentre l'utente sta digitando (evita di spostare il cursore)
    if (document.activeElement !== titleInput) {
      titleInput.value = state.currentActivity.title || '';
    }
  }
  if (actStatusSelect) {
    actStatusSelect.disabled = false;
    actStatusSelect.value = state.currentActivity.status || 'in_progress';
  }
  if (actCategorySelect) {
    actCategorySelect.disabled = false;
    renderCategorySelectOptions(actCategorySelect, state.categories, state.currentActivity.categoryId, 'Nessuna categoria');
  }

  const pages = state.currentActivity.notepadPages || [];
  const activePage = pages[state.activePageIndex] || pages[0];

  renderNotepadTabs(
    pages,
    state.activePageIndex,
    // Select Tab
    (index) => {
      state.activePageIndex = index;
      state.currentActivity.activePageIndex = index;
      renderNotepadSection();
    },
    // Add Tab
    () => {
      const newPageNum = pages.length + 1;
      pages.push({
        id: 'p_' + Date.now(),
        title: 'Pagina ' + newPageNum,
        content: '<p></p>',
        color: null
      });
      state.activePageIndex = pages.length - 1;
      state.currentActivity.activePageIndex = state.activePageIndex;
      renderNotepadSection();
      triggerAutoSave();
    },
    // Delete Tab
    (index) => {
      if (pages.length <= 1) return;
      pages.splice(index, 1);
      if (state.activePageIndex >= pages.length) {
        state.activePageIndex = pages.length - 1;
      }
      state.currentActivity.activePageIndex = state.activePageIndex;
      renderNotepadSection();
      triggerAutoSave();
    },
    // Edit Page (nome + colore, tramite modale dedicata)
    (index) => openPageEditModal(index),
    // Reorder Pages (drag & drop tra le tab): manteniamo selezionata la
    // stessa pagina che era attiva prima dello spostamento, seguendo il suo
    // nuovo indice invece di restare ancorati a una posizione numerica fissa.
    (fromIndex, toIndex) => {
      if (fromIndex === toIndex) return;
      const moved = pages.splice(fromIndex, 1)[0];
      pages.splice(toIndex, 0, moved);
      const newIndex = pages.indexOf(activePage);
      state.activePageIndex = newIndex >= 0 ? newIndex : 0;
      state.currentActivity.activePageIndex = state.activePageIndex;
      renderNotepadSection();
      triggerAutoSave();
    }
  );

  if (editor && activePage) {
    editor.innerHTML = activePage.content || '';
  }

  // Tinta leggera dell'area di scrittura con il colore della pagina, se impostato
  if (editorContainer) {
    const tint = activePage && activePage.color ? hexToRgba(activePage.color, 0.08) : null;
    editorContainer.style.background = tint
      ? `linear-gradient(${tint}, ${tint}), #e7e5df`
      : '';
  }
}

function renderTemplateSection() {
  renderTemplateSelectOptions(state.templates, state.currentActivity ? state.currentActivity.templateId : null);
  renderCurrentTemplateFields();
}

function renderCurrentTemplateFields() {
  const dataSearchInput = document.getElementById('templateDataSearchInput');

  if (!state.currentActivity) {
    if (dataSearchInput) dataSearchInput.style.display = 'none';
    renderTemplateFields(null, null, null, 'Seleziona un\'attività per vedere i suoi campi.');
    return;
  }

  // Nessun template applicato -> modalità "Cerca Dati": mostra tutti i campi
  // (dell'intero pool globale) che risultano compilati per QUESTA attività,
  // con possibilità di filtrarli per nome o valore. Utile per ritrovare un
  // dato senza dover ricordare a quale template appartiene.
  if (!state.currentActivity.templateId) {
    if (dataSearchInput) {
      dataSearchInput.style.display = '';
      if (document.activeElement !== dataSearchInput) {
        dataSearchInput.value = state.dataSearchQuery || '';
      }
    }
    renderDataSearchFields();
    return;
  }

  if (dataSearchInput) dataSearchInput.style.display = 'none';

  const tpl = state.templates.find(t => t.id === state.currentActivity.templateId);
  if (!tpl) {
    renderTemplateFields(null, null, null);
    return;
  }

  // I template referenziano i campi tramite id (pool globale condiviso):
  // qui li risolviamo nelle definizioni reali per il rendering.
  const resolvedFields = (tpl.fieldIds || [])
    .map(fid => state.fields.find(f => f.id === fid))
    .filter(Boolean);
  const resolvedTemplate = { ...tpl, fields: resolvedFields };

  renderTemplateFields(
    resolvedTemplate,
    state.currentActivity.fieldValues || {},
    (fieldId, value) => {
      if (!state.currentActivity.fieldValues || Array.isArray(state.currentActivity.fieldValues)) {
        state.currentActivity.fieldValues = {};
      }
      state.currentActivity.fieldValues[fieldId] = value;
      triggerAutoSave();
    }
  );
}

function renderDataSearchFields() {
  const fieldValues = state.currentActivity.fieldValues || {};
  const query = (state.dataSearchQuery || '').trim().toLowerCase();

  // "Compilato" = ha un valore effettivo (esclude stringa vuota/undefined/null;
  // include invece 0 e false, che sono valori validi impostati dall'utente).
  const populatedFields = state.fields.filter(f => {
    const v = fieldValues[f.id];
    const hasValue = v !== undefined && v !== null && v !== '';
    if (!hasValue) return false;
    if (!query) return true;
    const labelMatch = (f.label || '').toLowerCase().includes(query);
    const valueMatch = String(v).toLowerCase().includes(query);
    return labelMatch || valueMatch;
  });

  const emptyMessage = query
    ? `Nessun campo compilato corrisponde a "${state.dataSearchQuery}".`
    : 'Nessun campo compilato per questa attività. Applica un template per iniziare a inserire dati.';

  const virtualTemplate = populatedFields.length > 0
    ? { id: '__search__', name: 'Cerca Dati', fields: populatedFields }
    : null;

  renderTemplateFields(
    virtualTemplate,
    fieldValues,
    (fieldId, value) => {
      if (!state.currentActivity.fieldValues || Array.isArray(state.currentActivity.fieldValues)) {
        state.currentActivity.fieldValues = {};
      }
      state.currentActivity.fieldValues[fieldId] = value;
      triggerAutoSave();
    },
    emptyMessage
  );
}

function renderFiles() {
  const allFiles = state.currentActivity ? (state.currentActivity.files || []) : [];
  const query = (state.fileSearchQuery || '').trim().toLowerCase();

  // La ricerca filtra per nome o percorso, ma le callback di renderFilesList
  // lavorano per indice posizionale: manteniamo una mappa verso l'indice
  // reale nell'array originale, altrimenti modifica/eliminazione/sfoglia
  // colpirebbero il file sbagliato non appena si applica un filtro.
  const indexMap = [];
  const filtered = allFiles.filter((f, idx) => {
    if (!query) {
      indexMap.push(idx);
      return true;
    }
    const match = (f.name || '').toLowerCase().includes(query) || (f.path || '').toLowerCase().includes(query);
    if (match) indexMap.push(idx);
    return match;
  });

  renderFilesList(
    filtered,
    // Update Name
    (filteredIdx, newName) => {
      const realIdx = indexMap[filteredIdx];
      if (state.currentActivity && state.currentActivity.files[realIdx]) {
        state.currentActivity.files[realIdx].name = newName;
        triggerAutoSave();
      }
    },
    // Update Path
    (filteredIdx, newPath) => {
      const realIdx = indexMap[filteredIdx];
      if (state.currentActivity && state.currentActivity.files[realIdx]) {
        state.currentActivity.files[realIdx].path = newPath;
        triggerAutoSave();
      }
    },
    // Delete File
    (filteredIdx) => {
      const realIdx = indexMap[filteredIdx];
      if (state.currentActivity && state.currentActivity.files) {
        state.currentActivity.files.splice(realIdx, 1);
        renderFiles();
        triggerAutoSave();
      }
    },
    // Browse File Trigger
    (filteredIdx) => {
      const realIdx = indexMap[filteredIdx];
      state.pendingBrowseFileIndex = realIdx;
      document.getElementById('nativeFileInput')?.click();
    },
    // Toggle Favorite
    (filteredIdx) => {
      const realIdx = indexMap[filteredIdx];
      if (state.currentActivity && state.currentActivity.files[realIdx]) {
        const file = state.currentActivity.files[realIdx];
        file.favorite = !file.favorite;
        renderFiles();
        triggerAutoSave();
      }
    },
    // Toggle Urgent
    (filteredIdx) => {
      const realIdx = indexMap[filteredIdx];
      if (state.currentActivity && state.currentActivity.files[realIdx]) {
        const file = state.currentActivity.files[realIdx];
        file.urgent = !file.urgent;
        renderFiles();
        triggerAutoSave();
      }
    }
  );

  // Messaggio dedicato quando la ricerca non produce risultati (diverso dal
  // messaggio "nessun file collegato" mostrato da renderFilesList a lista vuota)
  if (query && allFiles.length > 0 && filtered.length === 0) {
    const container = document.getElementById('filesContainer');
    if (container) {
      container.innerHTML = `<div style="color: var(--text-dim); padding: 10px;">Nessun file corrisponde a "${escapeHtml(state.fileSearchQuery)}".</div>`;
    }
  }
}


/* MODAL TEMPLATE EDITOR BUILDER */
function openTemplateModal() {
  const modal = document.getElementById('templateModal');
  const selector = document.getElementById('modalTemplateSelector');

  if (!modal || !selector) return;

  // Populate template selector options
  selector.innerHTML = '<option value="new">+ Crea Nuovo Template</option>';
  state.templates.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    selector.appendChild(opt);
  });

  // Default to current activity template or first available template
  if (state.currentActivity && state.currentActivity.templateId) {
    selector.value = state.currentActivity.templateId;
    const tpl = state.templates.find(t => t.id === state.currentActivity.templateId);
    if (tpl) loadTemplateToModalBuilder(tpl);
  } else {
    selector.value = 'new';
    loadTemplateToModalBuilder({ name: '', fields: [] });
  }

  // Reset dello stato di salvataggio residuo da un'apertura precedente,
  // altrimenti riaprendo la modale dopo un errore i bottoni resterebbero
  // etichettati "Salvataggio..." anche se nessuna richiesta è in corso.
  state.templateModalSaving = false;
  setModalBusy('templateModal', false);
  setModalStatus('templateModalStatus', '', 'info');
  const saveBtnReset = document.getElementById('btnSaveTemplate');
  if (saveBtnReset) setButtonLoading(saveBtnReset, false);
  const deleteBtnReset = document.getElementById('btnDeleteTemplate');
  if (deleteBtnReset) setButtonLoading(deleteBtnReset, false);

  modal.classList.add('active');
}

function closeTemplateModal() {
  // Se un salvataggio/eliminazione è in corso, i bottoni sono già disabilitati
  // da setModalBusy, ma questa guardia protegge anche eventuali chiusure
  // programmatiche (es. tasto Esc gestito altrove in futuro).
  if (state.templateModalSaving) return;
  const modal = document.getElementById('templateModal');
  if (modal) modal.classList.remove('active');
}

function loadTemplateToModalBuilder(template) {
  const nameInput = document.getElementById('modalTemplateNameInput');
  const builderContainer = document.getElementById('modalTemplateFieldsBuilder');
  if (nameInput) nameInput.value = template.name || '';
  if (!builderContainer) return;

  builderContainer.innerHTML = '';
  const fieldIds = template.fieldIds || [];
  fieldIds.forEach(fid => {
    const fieldDef = state.fields.find(f => f.id === fid);
    if (fieldDef) {
      addTemplateFieldRowToModalBuilder(fieldDef);
    }
  });
  refreshAllSourceSelectsAvailability();
}

function addTemplateFieldRowToModalBuilder(field) {
  const container = document.getElementById('modalTemplateFieldsBuilder');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'template-builder-row';
  // L'ordine dei campi nel template corrisponde all'ordine delle righe nel
  // DOM (saveModalTemplate legge le righe con querySelectorAll nell'ordine
  // in cui compaiono): riordinare le righe è quindi sufficiente per
  // riordinare i campi del template, senza bisogno di una struttura dati
  // separata. NOTA: il draggable="true" va messo solo sulla maniglia (vedi
  // sotto), non sull'intera riga, perché una riga con <select>/<input> al
  // suo interno può avere comportamenti di drag inconsistenti tra browser
  // se l'intero contenitore è marcato come sorgente di drag.

  const types = [
    { value: 'text', label: 'Testo (Stringa)' },
    { value: 'textarea', label: 'Testo Lungo (Textarea)' },
    { value: 'number', label: 'Numero' },
    { value: 'date', label: 'Data' },
    { value: 'datetime-local', label: 'Data e Ora' },
    { value: 'boolean', label: 'Booleano (Checkbox)' },
    { value: 'select', label: 'Selezione Singola (Dropdown)' },
    { value: 'url', label: 'URL / Link' }
  ];

  const isExisting = !!field.id;
  const safeLabel = escapeHtml(field.label || '');
  const safeOptions = escapeHtml(field.options ? field.options.join(', ') : '');

  const sourceOptionsHtml = () => {
    let html = `<option value="new">+ Nuovo Campo</option>`;
    if (state.fields.length > 0) {
      html += `<optgroup label="Campi Esistenti (dati condivisi)">`;
      html += state.fields.map(f =>
        `<option value="${f.id}">${escapeHtml(f.label)} — ${typeLabel(f.type)}</option>`
      ).join('');
      html += `</optgroup>`;
    }
    return html;
  };

  row.innerHTML = `
    <div class="builder-row-top">
      <span class="drag-handle-field" title="Trascina per riordinare il campo">⠿</span>
      <select class="input-select field-builder-source" title="Scegli se creare un campo nuovo o riutilizzare un campo esistente (dati condivisi tra template)">
        ${sourceOptionsHtml()}
      </select>
      <span class="field-shared-badge" style="display:${isExisting ? 'inline-flex' : 'none'};" title="Campo condiviso: le modifiche qui si applicano a tutti i template che lo usano">🔗 Condiviso</span>
      <button type="button" class="btn btn-sm btn-danger btn-delete-field-forever" style="display:${isExisting ? 'inline-flex' : 'none'};" title="Elimina definitivamente questo campo e i suoi dati da TUTTE le attività">🗑️ Elimina Dati</button>
      <button type="button" class="btn btn-sm btn-remove-row" title="Rimuovi solo da questo template (i dati restano disponibili per altri template)">✕</button>
    </div>
    <div class="builder-row-bottom">
      <input type="text" class="input-text field-builder-label" value="${safeLabel}" placeholder="Nome Etichetta (es. Cliente)">
      <select class="input-select field-builder-type">
        ${types.map(t => `<option value="${t.value}" ${t.value === (field.type || 'text') ? 'selected' : ''}>${t.label}</option>`).join('')}
      </select>
      <input type="text" class="input-text field-builder-options" value="${safeOptions}" placeholder="Opzioni (separate da virgola)" style="display: ${field.type === 'select' ? 'block' : 'none'};">
    </div>
  `;

  const sourceSelect = row.querySelector('.field-builder-source');
  const labelInput = row.querySelector('.field-builder-label');
  const typeSelect = row.querySelector('.field-builder-type');
  const optionsInput = row.querySelector('.field-builder-options');
  const sharedBadge = row.querySelector('.field-shared-badge');
  const deleteForeverBtn = row.querySelector('.btn-delete-field-forever');
  const dragHandle = row.querySelector('.drag-handle-field');

  sourceSelect.value = field.id || 'new';

  typeSelect.addEventListener('change', (e) => {
    optionsInput.style.display = e.target.value === 'select' ? 'block' : 'none';
  });

  sourceSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'new') {
      labelInput.value = '';
      typeSelect.value = 'text';
      optionsInput.value = '';
      optionsInput.style.display = 'none';
      sharedBadge.style.display = 'none';
      deleteForeverBtn.style.display = 'none';
    } else {
      const existingField = state.fields.find(f => f.id === val);
      if (existingField) {
        labelInput.value = existingField.label || '';
        typeSelect.value = existingField.type || 'text';
        optionsInput.value = existingField.options ? existingField.options.join(', ') : '';
        optionsInput.style.display = existingField.type === 'select' ? 'block' : 'none';
      }
      sharedBadge.style.display = 'inline-flex';
      deleteForeverBtn.style.display = 'inline-flex';
    }
    refreshAllSourceSelectsAvailability();
  });

  row.querySelector('.btn-remove-row').addEventListener('click', () => {
    row.remove();
    refreshAllSourceSelectsAvailability();
  });

  deleteForeverBtn.addEventListener('click', async () => {
    // Blocca doppio-click e sovrapposizioni con Salva/Elimina Template,
    // che condividono lo stesso stato "occupato" della modale.
    if (state.templateModalSaving) return;

    const fieldId = sourceSelect.value;
    if (!fieldId || fieldId === 'new') return;

    const fieldDef = state.fields.find(f => f.id === fieldId);
    const usage = getFieldUsageInfo(fieldId);
    const templateNames = usage.templatesUsing.map(t => t.name).join(', ') || 'nessun altro template';
    const confirmMsg =
      `Stai per eliminare DEFINITIVAMENTE il campo "${fieldDef ? fieldDef.label : fieldId}".\n\n` +
      `È usato in ${usage.templatesUsing.length} template (${templateNames}) e ha dati salvati in ${usage.activitiesUsing.length} attività.\n\n` +
      `Questa azione cancella il dato da TUTTE le attività e non può essere annullata.\n\n` +
      `Continuare?`;

    if (!confirm(confirmMsg)) return;

    state.templateModalSaving = true;
    setModalBusy('templateModal', true);
    setButtonLoading(deleteForeverBtn, true, 'Eliminazione...');
    setModalStatus('templateModalStatus', 'Eliminazione campo in corso...', 'info');
    updateStatusLed('saving', 'Eliminazione campo in corso...');

    try {
      await deleteFieldApi(fieldId);
      state.fields = state.fields.filter(f => f.id !== fieldId);
      state.templates.forEach(t => {
        if (Array.isArray(t.fieldIds)) {
          t.fieldIds = t.fieldIds.filter(fid => fid !== fieldId);
        }
      });
      state.activities.forEach(a => {
        if (a.fieldValues) delete a.fieldValues[fieldId];
      });
      row.remove();
      refreshAllSourceSelectsAvailability();
      renderTemplateSection();
      setModalStatus('templateModalStatus', 'Campo eliminato ✓', 'success');
      updateStatusLed('ready', 'Campo eliminato definitivamente');
    } catch (err) {
      setModalStatus('templateModalStatus', 'Impossibile eliminare il campo: ' + err.message, 'error');
      updateStatusLed('offline', 'Errore eliminazione campo');
    } finally {
      setButtonLoading(deleteForeverBtn, false);
      setModalBusy('templateModal', false);
      state.templateModalSaving = false;
    }
  });

  // Drag & drop per riordinare i campi del template.
  // Sorgente del drag: SOLO la maniglia ⠿ (draggable="true" qui, non sulla
  // riga), così select/input restano cliccabili e selezionabili normalmente.
  // Bersaglio del drop: l'intera riga (non serve che sia "draggable" per
  // poter ricevere un drop, basta gestire dragover/drop).
  dragHandle.draggable = true;

  dragHandle.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    // IMPORTANTE: senza almeno una chiamata a setData() alcuni browser
    // (Firefox in primis) non avviano affatto il drag, anche se dragstart
    // viene intercettato correttamente: per questo il riordino risultava
    // "non funzionante" pur avendo tutti gli altri handler a posto.
    e.dataTransfer.setData('text/plain', field.id || 'new');
    draggedFieldRow = row;
    row.classList.add('dragging');
  });
  dragHandle.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    container.querySelectorAll('.template-builder-row').forEach(r => r.classList.remove('drag-over'));
    draggedFieldRow = null;
  });
  row.addEventListener('dragover', (e) => {
    if (!draggedFieldRow || draggedFieldRow === row) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drag-over');
  });
  row.addEventListener('dragleave', () => {
    row.classList.remove('drag-over');
  });
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    row.classList.remove('drag-over');
    if (!draggedFieldRow || draggedFieldRow === row) return;
    const allRows = Array.from(container.children);
    const fromIdx = allRows.indexOf(draggedFieldRow);
    const toIdx = allRows.indexOf(row);
    if (fromIdx < toIdx) {
      container.insertBefore(draggedFieldRow, row.nextSibling);
    } else {
      container.insertBefore(draggedFieldRow, row);
    }
  });

  container.appendChild(row);
  refreshAllSourceSelectsAvailability();
}

// Disabilita nei vari dropdown "campo esistente" le opzioni già scelte in
// un'altra riga dello stesso template, per evitare di aggiungere due volte
// lo stesso campo condiviso al medesimo template.
function refreshAllSourceSelectsAvailability() {
  const container = document.getElementById('modalTemplateFieldsBuilder');
  if (!container) return;
  const selects = Array.from(container.querySelectorAll('.field-builder-source'));
  const chosenIds = selects.map(s => s.value).filter(v => v && v !== 'new');

  selects.forEach(sel => {
    Array.from(sel.options).forEach(opt => {
      if (opt.value === 'new') return;
      opt.disabled = chosenIds.includes(opt.value) && opt.value !== sel.value;
    });
  });
}

function typeLabel(type) {
  const map = {
    text: 'Testo', textarea: 'Testo Lungo', number: 'Numero', date: 'Data',
    'datetime-local': 'Data e Ora', boolean: 'Booleano', select: 'Selezione', url: 'URL'
  };
  return map[type] || type;
}

// Calcola, solo con i dati già in memoria (nessuna chiamata di rete), quanti
// template e quante attività userebbero/usano un dato campo condiviso.
function getFieldUsageInfo(fieldId) {
  const templatesUsing = state.templates.filter(t => Array.isArray(t.fieldIds) && t.fieldIds.includes(fieldId));
  const activitiesUsing = state.activities.filter(a => {
    if (!a.fieldValues || !Object.prototype.hasOwnProperty.call(a.fieldValues, fieldId)) return false;
    const v = a.fieldValues[fieldId];
    return v !== '' && v !== undefined && v !== null && v !== false;
  });
  return { templatesUsing, activitiesUsing };
}

async function saveModalTemplate() {
  // Blocco doppio-submit: se un salvataggio è già in corso, ignoriamo il click.
  if (state.templateModalSaving) return;

  const selector = document.getElementById('modalTemplateSelector');
  const nameInput = document.getElementById('modalTemplateNameInput');
  const builderContainer = document.getElementById('modalTemplateFieldsBuilder');
  const saveBtn = document.getElementById('btnSaveTemplate');

  const templateName = nameInput ? nameInput.value.trim() : '';
  if (!templateName) {
    setModalStatus('templateModalStatus', 'Inserisci un nome per il template.', 'error');
    nameInput?.focus();
    return;
  }

  // L'ordine delle righe nel DOM riflette l'ordine scelto dall'utente
  // (eventualmente tramite drag & drop): leggendole in questo ordine,
  // fieldIds mantiene automaticamente il riordino.
  const rows = builderContainer ? Array.from(builderContainer.querySelectorAll('.template-builder-row')) : [];

  state.templateModalSaving = true;
  setModalBusy('templateModal', true);
  setButtonLoading(saveBtn, true, 'Salvataggio...');
  setModalStatus('templateModalStatus', 'Salvataggio campi in corso...', 'info');
  updateStatusLed('saving', 'Salvataggio campi...');

  // Fase 1: salviamo/aggiorniamo ogni campo nel pool globale. Un campo
  // "nuovo" ottiene un id condivisibile; un campo "esistente" aggiorna la
  // sua definizione (l'aggiornamento si riflette su tutti i template che
  // lo referenziano, per scelta di design).
  //
  // Scelta di design condivisa: se un campo fallisce, NON annulliamo quelli
  // già salvati con successo (evitiamo un rollback lato client che non ha
  // comunque effetto su ciò che è già stato scritto sul server). Segnaliamo
  // chiaramente all'utente quali campi non sono stati salvati, e ci
  // fermiamo prima di salvare il template, così il template non referenzia
  // mai un fieldId incompleto o inconsistente.
  const fieldIds = [];
  const failedFields = [];
  for (const row of rows) {
    const source = row.querySelector('.field-builder-source').value;
    const label = row.querySelector('.field-builder-label').value.trim() || 'Campo';
    const type = row.querySelector('.field-builder-type').value;
    const optionsRaw = row.querySelector('.field-builder-options').value;

    const fieldPayload = {
      id: source === 'new' ? '' : source,
      label,
      type
    };
    if (type === 'select' && optionsRaw) {
      fieldPayload.options = optionsRaw.split(',').map(o => o.trim()).filter(o => o.length > 0);
    }

    try {
      const savedField = await saveFieldApi(fieldPayload);
      const idx = state.fields.findIndex(f => f.id === savedField.id);
      if (idx >= 0) {
        state.fields[idx] = savedField;
      } else {
        state.fields.push(savedField);
      }
      if (!fieldIds.includes(savedField.id)) {
        fieldIds.push(savedField.id);
      }
    } catch (err) {
      console.error('Errore salvataggio campo:', label, err);
      failedFields.push(label);
    }
  }

  if (failedFields.length > 0) {
    setModalStatus(
      'templateModalStatus',
      `Campi non salvati: ${failedFields.join(', ')}. Gli altri campi sono stati mantenuti: correggi e riprova (il template non è stato salvato).`,
      'error'
    );
    updateStatusLed('offline', 'Errore salvataggio campi');
    setButtonLoading(saveBtn, false);
    setModalBusy('templateModal', false);
    state.templateModalSaving = false;
    return; // Non salviamo il template con riferimenti incompleti/inconsistenti.
  }

  // Fase 2: salviamo il template con i soli riferimenti (fieldIds)
  const templateId = selector.value === 'new' ? '' : selector.value;
  const templatePayload = {
    id: templateId,
    name: templateName,
    fieldIds: fieldIds
  };

  setModalStatus('templateModalStatus', 'Salvataggio template...', 'info');
  updateStatusLed('saving', 'Salvataggio template...');

  try {
    const savedTpl = await saveTemplateApi(templatePayload);

    const existingIndex = state.templates.findIndex(t => t.id === savedTpl.id);
    if (existingIndex >= 0) {
      state.templates[existingIndex] = savedTpl;
    } else {
      state.templates.push(savedTpl);
    }

    // Auto select saved template for current activity if none selected
    if (state.currentActivity && !state.currentActivity.templateId) {
      state.currentActivity.templateId = savedTpl.id;
    }

    renderTemplateSection();
    setModalStatus('templateModalStatus', 'Template salvato ✓', 'success');
    updateStatusLed('ready', 'Template salvato');

    // Piccola pausa per lasciare visibile la conferma prima di chiudere,
    // invece di chiudere di scatto senza che l'utente possa leggerla.
    setTimeout(() => {
      closeTemplateModal();
    }, 450);
  } catch (err) {
    setModalStatus('templateModalStatus', 'Errore salvataggio template: ' + err.message, 'error');
    updateStatusLed('offline', 'Errore salvataggio template');
  } finally {
    setButtonLoading(saveBtn, false);
    setModalBusy('templateModal', false);
    state.templateModalSaving = false;
  }
}

async function deleteModalTemplate() {
  if (state.templateModalSaving) return;

  const selector = document.getElementById('modalTemplateSelector');
  const tplId = selector.value;
  if (!tplId || tplId === 'new') return;

  if (!confirm('Sei sicuro di voler eliminare questo template?')) return;

  const deleteBtn = document.getElementById('btnDeleteTemplate');

  state.templateModalSaving = true;
  setModalBusy('templateModal', true);
  setButtonLoading(deleteBtn, true, 'Eliminazione...');
  setModalStatus('templateModalStatus', 'Eliminazione template in corso...', 'info');
  updateStatusLed('saving', 'Eliminazione template...');

  try {
    await deleteTemplateApi(tplId);
    state.templates = state.templates.filter(t => t.id !== tplId);
    if (state.currentActivity && state.currentActivity.templateId === tplId) {
      state.currentActivity.templateId = null;
    }
    renderTemplateSection();
    setModalStatus('templateModalStatus', 'Template eliminato ✓', 'success');
    updateStatusLed('ready', 'Template eliminato');
    setTimeout(() => closeTemplateModal(), 450);
  } catch (err) {
    setModalStatus('templateModalStatus', 'Impossibile eliminare template: ' + err.message, 'error');
    updateStatusLed('offline', 'Errore eliminazione template');
  } finally {
    setButtonLoading(deleteBtn, false);
    setModalBusy('templateModal', false);
    state.templateModalSaving = false;
  }
}

/* MODALE MODIFICA PAGINA NOTEPAD (nome + colore) */
function openPageEditModal(index) {
  if (!state.currentActivity) return;
  const pages = state.currentActivity.notepadPages || [];
  const page = pages[index];
  if (!page) return;

  state.pendingPageEditIndex = index;
  state.pageEditModalSaving = false;
  setModalBusy('pageEditModal', false);
  setModalStatus('pageEditModalStatus', '', 'info');
  const saveBtnReset = document.getElementById('btnSavePageEditModal');
  if (saveBtnReset) setButtonLoading(saveBtnReset, false);

  const nameInput = document.getElementById('pageEditNameInput');
  const colorInput = document.getElementById('pageEditColorInput');
  if (nameInput) nameInput.value = page.title || ('Pagina ' + (index + 1));
  if (colorInput) {
    colorInput.value = page.color || '#2dd4bf';
    colorInput.dataset.cleared = page.color ? 'false' : 'true';
  }

  document.getElementById('pageEditModal')?.classList.add('active');
}

function closePageEditModal() {
  if (state.pageEditModalSaving) return;
  document.getElementById('pageEditModal')?.classList.remove('active');
  state.pendingPageEditIndex = null;
}

// A differenza delle altre modifiche del notepad (che passano dal debounce
// di 3s di triggerAutoSave), il salvataggio da questa modale è immediato:
// è un'azione esplicita dell'utente ("Salva"), quindi deve dare conferma
// reale e tempestiva invece di affidarsi silenziosamente all'autosave.
async function savePageEditModal() {
  if (state.pageEditModalSaving) return;

  if (state.pendingPageEditIndex === null || !state.currentActivity) {
    closePageEditModal();
    return;
  }
  const pages = state.currentActivity.notepadPages || [];
  const page = pages[state.pendingPageEditIndex];
  if (!page) {
    closePageEditModal();
    return;
  }

  const nameInput = document.getElementById('pageEditNameInput');
  const colorInput = document.getElementById('pageEditColorInput');
  const saveBtn = document.getElementById('btnSavePageEditModal');

  const previousTitle = page.title;
  const previousColor = page.color;

  const newTitle = nameInput && nameInput.value.trim() !== '' ? nameInput.value.trim() : page.title;
  page.title = newTitle;
  page.color = (colorInput && colorInput.dataset.cleared === 'true') ? null : (colorInput ? colorInput.value : page.color);

  renderNotepadSection();

  // Annulliamo un eventuale autosave differito in sospeso e salviamo subito
  // l'intera attività: evita sia il doppio invio ravvicinato sia i 3s di
  // attesa silenziosa dopo un'azione esplicita "Salva".
  if (state.autoSaveTimer) {
    clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = null;
  }

  state.pageEditModalSaving = true;
  setModalBusy('pageEditModal', true);
  setButtonLoading(saveBtn, true, 'Salvataggio...');
  setModalStatus('pageEditModalStatus', 'Salvataggio pagina in corso...', 'info');
  updateStatusLed('saving', 'Salvataggio pagina...');

  try {
    const saved = await saveActivityApi(state.currentActivity);
    state.currentActivity.updatedAt = saved.updatedAt;
    state.isDirty = false;
    renderFilteredActivities();
    setModalStatus('pageEditModalStatus', 'Pagina salvata ✓', 'success');
    updateStatusLed('ready', 'Pagina salvata');
    setTimeout(() => closePageEditModal(), 400);
  } catch (err) {
    // Rollback locale: senza conferma dal server non lasciamo l'interfaccia
    // a mostrare un titolo/colore che in realtà non è stato salvato.
    page.title = previousTitle;
    page.color = previousColor;
    renderNotepadSection();
    setModalStatus('pageEditModalStatus', 'Errore salvataggio pagina: ' + err.message, 'error');
    updateStatusLed('offline', 'Errore salvataggio pagina');
  } finally {
    setButtonLoading(saveBtn, false);
    setModalBusy('pageEditModal', false);
    state.pageEditModalSaving = false;
  }
}

// Il pulsante "Nessun Colore" marca l'input come azzerato: l'input
// type="color" non accetta un valore realmente vuoto, quindi teniamo
// traccia dell'intento tramite un data-attribute invece di fidarci del value.
document.addEventListener('DOMContentLoaded', () => {
  const colorInput = document.getElementById('pageEditColorInput');
  colorInput?.addEventListener('input', () => {
    colorInput.dataset.cleared = 'false';
  });
});

/* MODALE GESTIONE CATEGORIE */

// Ri-renderizza SOLO la lista categorie nella modale (senza toccare lo
// stato 'active'/status/focus della modale stessa). Usata dopo ogni
// creazione/modifica/eliminazione riuscita, al posto di riaprire l'intera
// modale da capo.
function refreshCategoryManagerList() {
  renderCategoryManagerList(
    state.categories,
    (id, changes) => updateCategory(id, changes),
    (id, name) => removeCategory(id, name)
  );
}

function openCategoryModal() {
  // Reset di eventuale stato "occupato" rimasto da un'apertura precedente
  // interrotta da un errore.
  state.categoryModalBusy = false;
  setModalBusy('categoryModal', false);
  setModalStatus('categoryModalStatus', '', 'info');
  const addBtnReset = document.getElementById('btnAddCategory');
  if (addBtnReset) setButtonLoading(addBtnReset, false);

  refreshCategoryManagerList();
  document.getElementById('categoryModal')?.classList.add('active');
}

function closeCategoryModal() {
  if (state.categoryModalBusy) return;
  document.getElementById('categoryModal')?.classList.remove('active');
  const nameInput = document.getElementById('newCategoryNameInput');
  if (nameInput) nameInput.value = '';
}

async function addCategoryFromModal() {
  if (state.categoryModalBusy) return;

  const nameInput = document.getElementById('newCategoryNameInput');
  const colorInput = document.getElementById('newCategoryColorInput');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    setModalStatus('categoryModalStatus', 'Inserisci un nome per la categoria.', 'error');
    nameInput?.focus();
    return;
  }
  const color = colorInput ? colorInput.value : '#2dd4bf';
  const addBtn = document.getElementById('btnAddCategory');

  state.categoryModalBusy = true;
  setModalBusy('categoryModal', true);
  setButtonLoading(addBtn, true, 'Aggiunta...');
  setModalStatus('categoryModalStatus', 'Creazione categoria in corso...', 'info');
  updateStatusLed('saving', 'Creazione categoria...');

  try {
    const saved = await saveCategoryApi({ name, color });
    state.categories.push(saved);
    if (nameInput) nameInput.value = '';
    refreshCategoryManagerList();
    renderCategoryFilterSelect();
    if (state.currentActivity) {
      renderCategorySelectOptions(
        document.getElementById('activityCategorySelect'),
        state.categories,
        state.currentActivity.categoryId,
        'Nessuna categoria'
      );
    }
    renderFilteredActivities();
    setModalStatus('categoryModalStatus', 'Categoria creata ✓', 'success');
    updateStatusLed('ready', 'Categoria creata');
  } catch (err) {
    setModalStatus('categoryModalStatus', 'Errore creazione categoria: ' + err.message, 'error');
    updateStatusLed('offline', 'Errore salvataggio categoria');
  } finally {
    setButtonLoading(addBtn, false);
    setModalBusy('categoryModal', false);
    state.categoryModalBusy = false;
  }
}

async function updateCategory(id, changes) {
  if (state.categoryModalBusy) return;

  const existing = state.categories.find(c => c.id === id);
  if (!existing) return;

  const payload = { id, name: existing.name, color: existing.color, ...changes };

  state.categoryModalBusy = true;
  setModalBusy('categoryModal', true);
  setModalStatus('categoryModalStatus', 'Aggiornamento categoria in corso...', 'info');
  updateStatusLed('saving', 'Aggiornamento categoria...');

  try {
    const saved = await saveCategoryApi(payload);
    const idx = state.categories.findIndex(c => c.id === id);
    if (idx >= 0) state.categories[idx] = saved;
    renderCategoryFilterSelect();
    refreshCategoryManagerList();
    renderFilteredActivities();
    if (state.currentActivity) {
      renderCategorySelectOptions(
        document.getElementById('activityCategorySelect'),
        state.categories,
        state.currentActivity.categoryId,
        'Nessuna categoria'
      );
    }
    setModalStatus('categoryModalStatus', 'Categoria aggiornata ✓', 'success');
    updateStatusLed('ready', 'Categoria aggiornata');
  } catch (err) {
    setModalStatus('categoryModalStatus', 'Errore aggiornamento categoria: ' + err.message, 'error');
    updateStatusLed('offline', 'Errore salvataggio categoria');
  } finally {
    setModalBusy('categoryModal', false);
    state.categoryModalBusy = false;
  }
}

async function removeCategory(id, name) {
  if (state.categoryModalBusy) return;

  const usageCount = state.activities.filter(a => a.categoryId === id).length;
  const confirmMsg = usageCount > 0
    ? `La categoria "${name}" è usata in ${usageCount} attività, che diventeranno "senza categoria". Continuare?`
    : `Eliminare la categoria "${name}"?`;
  if (!confirm(confirmMsg)) return;

  state.categoryModalBusy = true;
  setModalBusy('categoryModal', true);
  setModalStatus('categoryModalStatus', 'Eliminazione categoria in corso...', 'info');
  updateStatusLed('saving', 'Eliminazione categoria...');

  try {
    await deleteCategoryApi(id);
    state.categories = state.categories.filter(c => c.id !== id);
    state.activities.forEach(a => {
      if (a.categoryId === id) a.categoryId = null;
    });
    if (state.currentActivity && state.currentActivity.categoryId === id) {
      state.currentActivity.categoryId = null;
    }
    refreshCategoryManagerList();
    renderCategoryFilterSelect();
    renderFilteredActivities();
    if (state.currentActivity) {
      renderCategorySelectOptions(
        document.getElementById('activityCategorySelect'),
        state.categories,
        state.currentActivity.categoryId,
        'Nessuna categoria'
      );
    }
    setModalStatus('categoryModalStatus', 'Categoria eliminata ✓', 'success');
    updateStatusLed('ready', 'Categoria eliminata');
  } catch (err) {
    setModalStatus('categoryModalStatus', 'Impossibile eliminare la categoria: ' + err.message, 'error');
    updateStatusLed('offline', 'Errore eliminazione categoria');
  } finally {
    setModalBusy('categoryModal', false);
    state.categoryModalBusy = false;
  }
}
