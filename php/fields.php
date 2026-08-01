<?php
// php/fields.php
//
// I "campi" sono ora entità indipendenti dai template: vivono in questo
// pool globale (data/fields.json) e i template si limitano a referenziarli
// tramite id (vedi templates.php -> fieldIds). In questo modo:
// - eliminare un template NON elimina i dati associati alle attività
// - più template possono condividere lo stesso campo (stessa etichetta,
//   stesso tipo, stesso valore per attività)

define('FIELDS_FILE', __DIR__ . '/../data/fields.json');

function loadFieldsData(): array {
    if (!file_exists(FIELDS_FILE)) {
        return ['fields' => []];
    }

    $fp = fopen(FIELDS_FILE, 'r');
    if (!$fp) {
        return ['fields' => []];
    }

    flock($fp, LOCK_SH);
    $content = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    $data = json_decode($content, true);
    return is_array($data) ? $data : ['fields' => []];
}

function saveFieldsData(array $data): bool {
    $fp = fopen(FIELDS_FILE, 'c+');
    if (!$fp) {
        return false;
    }

    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        return true;
    }

    fclose($fp);
    return false;
}

function getFields(): array {
    $data = loadFieldsData();
    return $data['fields'] ?? [];
}

function getField(string $id): ?array {
    foreach (getFields() as $f) {
        if (($f['id'] ?? '') === $id) {
            return $f;
        }
    }
    return null;
}

function saveField(array $fieldInput): array {
    $data = loadFieldsData();
    $fields = $data['fields'] ?? [];

    if (!isset($fieldInput['label']) || trim($fieldInput['label']) === '') {
        $fieldInput['label'] = 'Nuovo Campo';
    }
    if (!isset($fieldInput['type'])) {
        $fieldInput['type'] = 'text';
    }
    // Un campo che non è di tipo "select" non deve portarsi dietro opzioni
    // residue di una precedente configurazione.
    if ($fieldInput['type'] !== 'select') {
        unset($fieldInput['options']);
    }

    if (empty($fieldInput['id'])) {
        // Nuovo campo globale
        $fieldInput['id'] = 'fld_' . round(microtime(true) * 1000) . '_' . random_int(100, 999);
        $fields[] = $fieldInput;
        $saved = $fieldInput;
    } else {
        // Aggiorna un campo esistente: la modifica si propaga automaticamente
        // a tutti i template che lo referenziano, perché è lo stesso oggetto.
        $found = false;
        $saved = null;
        foreach ($fields as $index => $existing) {
            if ($existing['id'] === $fieldInput['id']) {
                $merged = array_merge($existing, $fieldInput);
                if (($merged['type'] ?? '') !== 'select') {
                    unset($merged['options']);
                }
                $fields[$index] = $merged;
                $saved = $merged;
                $found = true;
                break;
            }
        }
        if (!$found) {
            $fields[] = $fieldInput;
            $saved = $fieldInput;
        }
    }

    $data['fields'] = $fields;
    if (!saveFieldsData($data)) {
        throw new RuntimeException('Impossibile scrivere data/fields.json (verifica permessi cartella/file).');
    }
    return $saved;
}

// Usata solo dalla migrazione automatica dei vecchi template (che avevano
// i campi incorporati): crea il campo globale SOLO se non esiste già,
// preservando l'id originale per non rompere i valori già salvati nelle
// attività.
function ensureFieldExists(string $id, string $label, string $type, $options = null): void {
    $data = loadFieldsData();
    $fields = $data['fields'] ?? [];

    foreach ($fields as $f) {
        if (($f['id'] ?? '') === $id) {
            return; // già presente nel pool globale
        }
    }

    $newField = ['id' => $id, 'label' => $label, 'type' => $type ?: 'text'];
    if ($type === 'select' && $options !== null) {
        $newField['options'] = $options;
    }

    $fields[] = $newField;
    $data['fields'] = $fields;
    if (!saveFieldsData($data)) {
        throw new RuntimeException('Impossibile scrivere data/fields.json durante la migrazione automatica dei template.');
    }
}

// Elimina DEFINITIVAMENTE un campo dal pool globale. Non tocca templates.json
// né activities.json: quella pulizia è responsabilità del chiamante
// (vedi api.php: removeFieldFromAllTemplates / removeFieldValueFromAllActivities),
// così ogni file mantiene la responsabilità sui propri dati.
function deleteFieldDefinition(string $id): bool {
    $data = loadFieldsData();
    $fields = $data['fields'] ?? [];

    $filtered = array_values(array_filter($fields, function ($f) use ($id) {
        return ($f['id'] ?? '') !== $id;
    }));

    if (count($filtered) === count($fields)) {
        return false; // campo non trovato (non è un errore di scrittura)
    }

    $data['fields'] = $filtered;
    if (!saveFieldsData($data)) {
        throw new RuntimeException('Impossibile scrivere data/fields.json durante l\'eliminazione del campo.');
    }
    return true;
}
