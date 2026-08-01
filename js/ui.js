/**
 * UI Service Module - Handles DOM rendering, template forms, WYSIWYG editor and modals
 */

export function updateStatusLed(state, message = '') {
  const led = document.getElementById('statusLed');
  const text = document.getElementById('statusText');
  if (!led || !text) return;

  led.className = 'led-indicator';
  if (state === 'saving') {
    led.classList.add('saving');
    text.textContent = message || 'Salvataggio...';
  } else if (state === 'offline' || state === 'error') {
    led.classList.add('offline');
    text.textContent = message || 'Errore di connessione';
  } else {
    text.textContent = message || 'Pronto (Salvato)';
  }
}

// Notifica "toast": conferma visibile e temporanea per azioni discrete
// (click su un pulsante che salva/elimina qualcosa da una modale o dalla
// lista). Il solo indicatore LED nell'header è facile da non notare quando
// l'attenzione dell'utente è altrove (es. dentro una modale che si sta
// chiudendo nello stesso istante), quindi qui usiamo un elemento più
// prominente e transitorio, sganciato dallo stato di autosalvataggio.
export function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-message">${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  // Forza un reflow prima di aggiungere la classe "visible", altrimenti la
  // transizione CSS di ingresso non parte (l'elemento apparirebbe di scatto).
  requestAnimationFrame(() => toast.classList.add('visible'));

  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3200);
}

// --- Helper per il feedback di salvataggio nelle modali -------------------
//
// Pattern comune a tutte le modali (Template, Categorie, Modifica Pagina):
// 1) setModalBusy(modalId, true)  -> disabilita TUTTI i bottoni di header/
//    footer della modale e la rende "non interagibile" nel corpo, cosi'
//    l'utente non puo' chiudere la modale o rilanciare l'azione mentre una
//    richiesta e' in volo (causa reale dei "problemi di salvataggio in
//    rapida sequenza" segnalati).
// 2) setButtonLoading(btn, true, 'Salvataggio...') -> mostra uno spinner e
//    un testo sul bottone che ha avviato l'azione.
// 3) setModalStatus(statusElId, messaggio, tipo) -> mostra un messaggio di
//    stato testuale nel footer della modale (info/success/error), visibile
//    anche se l'utente non guarda il LED nell'header, lontano dalla modale.

// Disabilita/riabilita TUTTI i bottoni di header e footer di una modale, e
// applica la classe 'saving' alla .modal-card (usata in CSS per disabilitare
// il corpo della modale con pointer-events:none durante il salvataggio).
export function setModalBusy(modalId, busy) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const card = modal.querySelector('.modal-card');
  if (card) card.classList.toggle('saving', !!busy);
  modal.querySelectorAll('.modal-header .btn, .modal-footer .btn').forEach(btn => {
    btn.disabled = !!busy;
  });
}

// Mostra/rimuove uno spinner + testo su un bottone, preservando il
// contenuto originale per ripristinarlo al termine dell'operazione.
export function setButtonLoading(btn, loading, loadingLabel = 'Salvataggio...') {
  if (!btn) return;
  if (loading) {
    if (btn.dataset.originalHtml === undefined) {
      btn.dataset.originalHtml = btn.innerHTML;
    }
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span><span>${escapeHtml(loadingLabel)}</span>`;
  } else {
    btn.disabled = false;
    if (btn.dataset.originalHtml !== undefined) {
      btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
    }
  }
}

// Imposta (o pulisce, con message='') il testo di stato di una modale.
// type: 'info' | 'success' | 'error'
export function setModalStatus(elementId, message, type = 'info') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message || '';
  el.className = 'modal-status-text' + (message ? ` modal-status-${type}` : '');
}

export function renderActivitiesList(activities, currentActivityId, categoriesById, onSelect, onDelete, onToggleFavorite, onToggleUrgent) {
  const container = document.getElementById('activityList');
  const countBadge = document.getElementById('activityCount');
  if (!container) return;

  container.innerHTML = '';
  if (countBadge) countBadge.textContent = activities.length;

  if (activities.length === 0) {
    container.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 20px;">Nessuna attività trovata</div>';
    return;
  }

  activities.forEach(act => {
    const card = document.createElement('div');
    const isUrgent = !!act.urgent;
    const isFavorite = !!act.favorite;
    card.className = `activity-card ${act.id === currentActivityId ? 'active' : ''} ${isUrgent ? 'is-urgent' : ''}`;
    card.dataset.id = act.id;

    const category = act.categoryId ? categoriesById.get(act.categoryId) : null;
    // Un'attività urgente prende sempre la precedenza visiva sul colore della
    // categoria: il bordo rosso deve saltare all'occhio indipendentemente
    // da quale categoria sia stata assegnata.
    if (isUrgent) {
      card.style.borderLeftColor = 'var(--accent-red)';
    } else if (category && category.color) {
      card.style.borderLeftColor = category.color;
    }

    const formattedDate = act.updatedAt ? new Date(act.updatedAt).toLocaleDateString('it-IT', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    }) : '';

    const statusMap = {
      in_progress: 'In Corso',
      completed: 'Completata',
      pending: 'In Attesa'
    };

    const categoryDotHtml = category
      ? `<span class="category-dot" style="background-color: ${category.color};" title="${escapeHtml(category.name)}"></span>`
      : '';

    // Layout: l'header ospita il toggle preferito + titolo, e cestino/toggle
    // urgente (visibili in hover) per dare più spazio al nome dell'attività.
    // L'indicatore di stato e il badge urgente stanno sulla riga "Modificato".
    card.innerHTML = `
      <div class="activity-card-header">
        <span class="activity-card-title-row">
          <button class="icon-toggle-btn fav-toggle ${isFavorite ? 'active' : ''}" title="${isFavorite ? 'Rimuovi dai preferiti' : 'Segna come preferita'}">⭐</button>
          ${categoryDotHtml}
          <span class="activity-card-title">${escapeHtml(act.title || 'Senza Titolo')}</span>
        </span>
        <div class="activity-card-actions-header">
          <button class="icon-toggle-btn urgent-toggle ${isUrgent ? 'active' : ''}" title="${isUrgent ? 'Rimuovi urgenza' : 'Segna come urgente'}">🔥</button>
          <button class="btn btn-sm btn-danger btn-delete-act" data-id="${act.id}" title="Elimina attività">🗑️</button>
        </div>
      </div>
      <div class="activity-card-meta">
        <span>Modificato: ${formattedDate}</span>
        <span class="activity-card-meta-right">
          ${isUrgent ? '<span class="urgent-badge">🔥 Urgente</span>' : ''}
          <span class="status-tag ${act.status || 'in_progress'}">${statusMap[act.status] || 'In Corso'}</span>
        </span>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.fav-toggle')) {
        e.stopPropagation();
        onToggleFavorite(act.id);
        return;
      }
      if (e.target.closest('.urgent-toggle')) {
        e.stopPropagation();
        onToggleUrgent(act.id);
        return;
      }
      if (e.target.closest('.btn-delete-act')) {
        e.stopPropagation();
        if (confirm(`Sei sicuro di voler eliminare l'attività "${act.title}"?`)) {
          onDelete(act.id);
        }
        return;
      }
      onSelect(act.id);
    });

    container.appendChild(card);
  });
}

export function renderNotepadTabs(pages, activePageIndex, onSelectTab, onAddTab, onDeleteTab, onEditPage, onReorderPages) {
  const container = document.getElementById('notepadTabsContainer');
  if (!container) return;

  container.innerHTML = '';

  pages.forEach((page, index) => {
    const tab = document.createElement('div');
    tab.className = `notepad-tab ${index === activePageIndex ? 'active' : ''}`;
    tab.dataset.index = index;
    tab.draggable = true;

    tab.innerHTML = `
      <span class="tab-color-dot" style="${page.color ? `background-color: ${page.color};` : ''}" title="Doppio-click per modificare nome e colore"></span>
      <span class="tab-title" title="Doppio-click per modificare nome e colore">${escapeHtml(page.title || 'Pagina ' + (index + 1))}</span>
      ${pages.length > 1 ? `<span class="btn-delete-tab" title="Elimina pagina">×</span>` : ''}
    `;

    // Doppio click su pallino o titolo apre la modale di modifica pagina (nome + colore)
    const handleEdit = (e) => {
      e.stopPropagation();
      onEditPage(index);
    };
    tab.querySelector('.tab-title')?.addEventListener('dblclick', handleEdit);
    tab.querySelector('.tab-color-dot')?.addEventListener('dblclick', handleEdit);

    // Click on tab to switch page or delete with confirmation
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete-tab')) {
        e.stopPropagation();
        const titleStr = page.title || ('Pagina ' + (index + 1));
        if (confirm(`Sei sicuro di voler eliminare la pagina "${titleStr}"?`)) {
          onDeleteTab(index);
        }
        return;
      }
      onSelectTab(index);
    });

    // Drag & drop per riordinare le pagine del notepad
    tab.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      tab.classList.add('dragging');
    });
    tab.addEventListener('dragend', () => {
      tab.classList.remove('dragging');
      container.querySelectorAll('.notepad-tab').forEach(t => t.classList.remove('drag-over-tab'));
    });
    tab.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tab.classList.add('drag-over-tab');
    });
    tab.addEventListener('dragleave', () => {
      tab.classList.remove('drag-over-tab');
    });
    tab.addEventListener('drop', (e) => {
      e.preventDefault();
      tab.classList.remove('drag-over-tab');
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!isNaN(fromIndex) && fromIndex !== index && typeof onReorderPages === 'function') {
        onReorderPages(fromIndex, index);
      }
    });

    container.appendChild(tab);
  });

  // Add "+" tab button
  const addBtn = document.createElement('button');
  addBtn.className = 'btn-add-tab';
  addBtn.title = 'Aggiungi nuova pagina';
  addBtn.innerHTML = '+ Pagina';
  addBtn.addEventListener('click', onAddTab);
  container.appendChild(addBtn);
}

export function renderTemplateSelectOptions(templates, currentTemplateId) {
  const select = document.getElementById('templateSelect');
  if (!select) return;

  select.innerHTML = '<option value="">🔍 Cerca Dati</option>';
  templates.forEach(tpl => {
    const opt = document.createElement('option');
    opt.value = tpl.id;
    opt.textContent = tpl.name;
    if (tpl.id === currentTemplateId) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

export function renderTemplateFields(template, currentFieldValues, onChangeFieldValue, emptyMessage) {
  const container = document.getElementById('templateFieldsContainer');
  if (!container) return;

  container.innerHTML = '';

  if (!template || !template.fields || template.fields.length === 0) {
    const message = emptyMessage || 'Nessun campo personalizzato definito per il template selezionato.';
    container.innerHTML = `<div style="color: var(--text-dim); padding: 10px; grid-column: 1 / -1;">${escapeHtml(message)}</div>`;
    return;
  }

  template.fields.forEach(field => {
    const fieldGroup = document.createElement('div');
    fieldGroup.className = 'field-group';

    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = field.label || field.id;

    let input;
    const value = currentFieldValues ? currentFieldValues[field.id] : undefined;

    switch (field.type) {
      case 'textarea':
        input = document.createElement('textarea');
        input.className = 'input-textarea';
        input.rows = 2;
        input.value = value || '';
        input.addEventListener('input', (e) => onChangeFieldValue(field.id, e.target.value));
        break;

      case 'number':
        input = document.createElement('input');
        input.type = 'number';
        input.className = 'input-text';
        input.value = value !== undefined ? value : '';
        input.addEventListener('input', (e) => onChangeFieldValue(field.id, parseFloat(e.target.value) || 0));
        break;

      case 'date':
        input = document.createElement('input');
        input.type = 'date';
        input.className = 'input-text';
        input.value = value || '';
        input.addEventListener('change', (e) => onChangeFieldValue(field.id, e.target.value));
        break;

      case 'datetime-local':
        input = document.createElement('input');
        input.type = 'datetime-local';
        input.className = 'input-text';
        input.value = value || '';
        input.addEventListener('change', (e) => onChangeFieldValue(field.id, e.target.value));
        break;

      case 'boolean':
        const boolContainer = document.createElement('div');
        boolContainer.className = 'field-checkbox-container';
        input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'input-checkbox';
        input.checked = !!value;
        input.addEventListener('change', (e) => onChangeFieldValue(field.id, e.target.checked));
        
        const boolLabel = document.createElement('span');
        boolLabel.textContent = value ? 'Sì' : 'No';
        boolLabel.style.color = value ? 'var(--accent-green)' : 'var(--text-muted)';
        input.addEventListener('change', (e) => {
          boolLabel.textContent = e.target.checked ? 'Sì' : 'No';
          boolLabel.style.color = e.target.checked ? 'var(--accent-green)' : 'var(--text-muted)';
        });
        
        boolContainer.appendChild(input);
        boolContainer.appendChild(boolLabel);
        fieldGroup.appendChild(label);
        fieldGroup.appendChild(boolContainer);
        container.appendChild(fieldGroup);
        return;

      case 'select':
        input = document.createElement('select');
        input.className = 'input-select';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- Seleziona --';
        input.appendChild(defaultOpt);

        if (Array.isArray(field.options)) {
          field.options.forEach(optVal => {
            const opt = document.createElement('option');
            opt.value = optVal;
            opt.textContent = optVal;
            if (optVal === value) opt.selected = true;
            input.appendChild(opt);
          });
        }
        input.addEventListener('change', (e) => onChangeFieldValue(field.id, e.target.value));
        break;

      case 'url':
        input = document.createElement('input');
        input.type = 'url';
        input.className = 'input-text';
        input.placeholder = 'https://...';
        input.value = value || '';
        input.addEventListener('input', (e) => onChangeFieldValue(field.id, e.target.value));
        break;

      case 'text':
      default:
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'input-text';
        input.value = value || '';
        input.addEventListener('input', (e) => onChangeFieldValue(field.id, e.target.value));
        break;
    }

    fieldGroup.appendChild(label);
    fieldGroup.appendChild(input);
    container.appendChild(fieldGroup);
  });
}

export function renderFilesList(files, onUpdateFileName, onUpdateFilePath, onDeleteFile, onBrowseFile, onToggleFileFavorite, onToggleFileUrgent) {
  const container = document.getElementById('filesContainer');
  if (!container) return;

  container.innerHTML = '';

  if (!files || files.length === 0) {
    container.innerHTML = '<div style="color: var(--text-dim); padding: 10px;">Nessun campo file collegato. Clicca su "+ Aggiungi Campo File" per collegare documenti locali.</div>';
    return;
  }

  files.forEach((fileItem, index) => {
    const item = document.createElement('div');
    const isFavorite = !!fileItem.favorite;
    const isUrgent = !!fileItem.urgent;
    item.className = `file-item ${isFavorite ? 'is-favorite' : ''} ${isUrgent ? 'is-urgent' : ''}`;

    item.innerHTML = `
      <div class="file-item-header">
        <input type="text" class="input-text file-name-input" value="${escapeHtml(fileItem.name || 'File ' + (index+1))}" placeholder="Etichetta File (es. Contratto)">
        <button class="icon-toggle-btn fav-toggle-file ${isFavorite ? 'active' : ''}" title="${isFavorite ? 'Rimuovi dai preferiti' : 'Segna come preferito'}">⭐</button>
        <button class="icon-toggle-btn urgent-toggle-file ${isUrgent ? 'active' : ''}" title="${isUrgent ? 'Rimuovi urgenza' : 'Segna come urgente'}">🔥</button>
        <button class="btn btn-sm btn-danger btn-delete-file" title="Rimuovi file">🗑️</button>
      </div>
      <div class="file-path-row">
        <input type="text" class="input-text file-path-input" value="${escapeHtml(fileItem.path || '')}" placeholder="C:\\Percorso\\File.pdf">
        <button class="btn btn-sm btn-browse-file" title="Il browser permette di leggere solo il nome del file: completa qui il percorso assoluto">📂 Sfoglia</button>
      </div>
      <div style="display: flex; gap: 4px; justify-content: flex-end;">
        <button class="btn btn-sm btn-copy-path" title="Copia percorso assoluto negli appunti">📋 Copia Percorso</button>
      </div>
    `;

    // Event Listeners
    item.querySelector('.file-name-input').addEventListener('change', (e) => {
      onUpdateFileName(index, e.target.value);
    });

    item.querySelector('.file-path-input').addEventListener('change', (e) => {
      onUpdateFilePath(index, e.target.value);
    });

    item.querySelector('.fav-toggle-file').addEventListener('click', () => {
      onToggleFileFavorite(index);
    });

    item.querySelector('.urgent-toggle-file').addEventListener('click', () => {
      onToggleFileUrgent(index);
    });

    item.querySelector('.btn-delete-file').addEventListener('click', () => {
      onDeleteFile(index);
    });

    item.querySelector('.btn-browse-file').addEventListener('click', () => {
      onBrowseFile(index, (selectedPath) => {
        item.querySelector('.file-path-input').value = selectedPath;
        onUpdateFilePath(index, selectedPath);
      });
    });

    item.querySelector('.btn-copy-path').addEventListener('click', () => {
      const pathVal = item.querySelector('.file-path-input').value;
      if (pathVal) {
        navigator.clipboard.writeText(pathVal);
        showToast('Percorso copiato negli appunti', 'success');
      }
    });

    container.appendChild(item);
  });
}

export function renderCategorySelectOptions(selectEl, categories, currentCategoryId, placeholderLabel) {
  if (!selectEl) return;
  selectEl.innerHTML = `<option value="">${placeholderLabel}</option>`;
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    if (cat.id === currentCategoryId) opt.selected = true;
    selectEl.appendChild(opt);
  });
  if (!currentCategoryId) selectEl.value = '';
}

export function renderCategoryManagerList(categories, onUpdateCategory, onDeleteCategory) {
  const container = document.getElementById('categoryManagerList');
  if (!container) return;

  container.innerHTML = '';

  if (!categories || categories.length === 0) {
    container.innerHTML = '<div style="color: var(--text-dim); padding: 6px 0;">Nessuna categoria creata.</div>';
    return;
  }

  categories.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'category-manager-row';

    row.innerHTML = `
      <input type="color" class="color-picker-input cat-color-input" value="${cat.color || '#2dd4bf'}" title="Colore categoria">
      <input type="text" class="input-text field-builder-label cat-name-input" value="${escapeHtml(cat.name || '')}" placeholder="Nome categoria">
      <button type="button" class="btn btn-sm btn-danger cat-delete-btn" title="Elimina categoria">🗑️</button>
    `;

    const colorInput = row.querySelector('.cat-color-input');
    const nameInput = row.querySelector('.cat-name-input');

    colorInput.addEventListener('change', (e) => onUpdateCategory(cat.id, { color: e.target.value }));
    nameInput.addEventListener('change', (e) => {
      const val = e.target.value.trim() || cat.name;
      onUpdateCategory(cat.id, { name: val });
    });
    row.querySelector('.cat-delete-btn').addEventListener('click', () => onDeleteCategory(cat.id, cat.name));

    container.appendChild(row);
  });
}

// Converte un colore esadecimale in rgba, usato per tingere leggermente
// lo sfondo dell'editor con il colore associato alla pagina notepad.
export function hexToRgba(hex, alpha) {
  if (!hex) return null;
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean, 16);
  if (isNaN(bigint)) return null;
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
