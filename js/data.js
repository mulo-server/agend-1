/**
 * Data Service API - Client logic for communicating with php/api.php
 */

const API_BASE = 'php/api.php';

export async function fetchActivities() {
  try {
    const res = await fetch(`${API_BASE}?action=getActivities`);
    const json = await res.json();
    if (json.success) {
      return json.data || [];
    } else {
      console.error('Errore getActivities:', json.error);
      return [];
    }
  } catch (err) {
    console.error('Fetch error getActivities:', err);
    return [];
  }
}

export async function saveActivityApi(activityData) {
  try {
    const res = await fetch(`${API_BASE}?action=saveActivity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: activityData })
    });
    const json = await res.json();
    if (json.success) {
      return json.data;
    } else {
      throw new Error(json.error || 'Errore durante il salvataggio dell\'attività');
    }
  } catch (err) {
    console.error('Save activity error:', err);
    throw err;
  }
}

export async function deleteActivityApi(activityId) {
  try {
    const res = await fetch(`${API_BASE}?action=deleteActivity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activityId })
    });
    const json = await res.json();
    if (json.success) {
      return true;
    } else {
      throw new Error(json.error || 'Errore durante l\'eliminazione');
    }
  } catch (err) {
    console.error('Delete activity error:', err);
    throw err;
  }
}

export async function fetchTemplates() {
  try {
    const res = await fetch(`${API_BASE}?action=getTemplates`);
    const json = await res.json();
    if (json.success) {
      return json.data || [];
    } else {
      console.error('Errore getTemplates:', json.error);
      return [];
    }
  } catch (err) {
    console.error('Fetch error getTemplates:', err);
    return [];
  }
}

export async function saveTemplateApi(templateData) {
  try {
    const res = await fetch(`${API_BASE}?action=saveTemplate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: templateData })
    });
    const json = await res.json();
    if (json.success) {
      return json.data;
    } else {
      throw new Error(json.error || 'Errore durante il salvataggio del template');
    }
  } catch (err) {
    console.error('Save template error:', err);
    throw err;
  }
}

export async function deleteTemplateApi(templateId) {
  try {
    const res = await fetch(`${API_BASE}?action=deleteTemplate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: templateId })
    });
    const json = await res.json();
    if (json.success) {
      return true;
    } else {
      throw new Error(json.error || 'Errore durante l\'eliminazione del template');
    }
  } catch (err) {
    console.error('Delete template error:', err);
    throw err;
  }
}

export async function fetchCategories() {
  try {
    const res = await fetch(`${API_BASE}?action=getCategories`);
    const json = await res.json();
    if (json.success) {
      return json.data || [];
    } else {
      console.error('Errore getCategories:', json.error);
      return [];
    }
  } catch (err) {
    console.error('Fetch error getCategories:', err);
    return [];
  }
}

export async function saveCategoryApi(categoryData) {
  try {
    const res = await fetch(`${API_BASE}?action=saveCategory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: categoryData })
    });
    const json = await res.json();
    if (json.success) {
      return json.data;
    } else {
      throw new Error(json.error || 'Errore durante il salvataggio della categoria');
    }
  } catch (err) {
    console.error('Save category error:', err);
    throw err;
  }
}

export async function deleteCategoryApi(categoryId) {
  try {
    const res = await fetch(`${API_BASE}?action=deleteCategory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: categoryId })
    });
    const json = await res.json();
    if (json.success) {
      return json.data;
    } else {
      throw new Error(json.error || 'Errore durante l\'eliminazione della categoria');
    }
  } catch (err) {
    console.error('Delete category error:', err);
    throw err;
  }
}

export async function fetchFields() {
  try {
    const res = await fetch(`${API_BASE}?action=getFields`);
    const json = await res.json();
    if (json.success) {
      return json.data || [];
    } else {
      console.error('Errore getFields:', json.error);
      return [];
    }
  } catch (err) {
    console.error('Fetch error getFields:', err);
    return [];
  }
}

export async function saveFieldApi(fieldData) {
  try {
    const res = await fetch(`${API_BASE}?action=saveField`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: fieldData })
    });
    const json = await res.json();
    if (json.success) {
      return json.data;
    } else {
      throw new Error(json.error || 'Errore durante il salvataggio del campo');
    }
  } catch (err) {
    console.error('Save field error:', err);
    throw err;
  }
}

export async function deleteFieldApi(fieldId) {
  try {
    const res = await fetch(`${API_BASE}?action=deleteField`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: fieldId })
    });
    const json = await res.json();
    if (json.success) {
      return json.data;
    } else {
      throw new Error(json.error || 'Errore durante l\'eliminazione del campo');
    }
  } catch (err) {
    console.error('Delete field error:', err);
    throw err;
  }
}
