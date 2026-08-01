<?php
// php/activities.php

define('ACTIVITIES_FILE', __DIR__ . '/../data/activities.json');

// BUG CRITICO RISOLTO: PHP non distingue un array vuoto da un oggetto
// vuoto. json_encode(array()) produce SEMPRE [], mai {}. Se 'fieldValues'
// (che deve restare una mappa fieldId -> valore) veniva serializzato come
// [] anche solo una volta (es. alla creazione dell'attività, quando è
// ancora vuoto), il frontend lo interpretava come un Array JS invece che
// un Oggetto. Da quel momento, scrivere fieldValues['xyz'] = valore
// continuava a funzionare in memoria (gli Array JS accettano proprietà
// con chiave stringa), ma JSON.stringify() di un Array ignora tutte le
// proprietà non numeriche: ogni autosave successivo inviava silenziosamente
// fieldValues: [], cancellando i valori inseriti dall'utente senza alcun
// errore visibile.
//
// Questa funzione forza fieldValues a restare sempre un vero oggetto JSON,
// anche da vuoto, sia quando l'attività viene scritta su disco sia quando
// viene restituita nella risposta dell'API.
function normalizeFieldValues(array $activity): array {
    if (!isset($activity['fieldValues']) || !is_array($activity['fieldValues']) || count($activity['fieldValues']) === 0) {
        $activity['fieldValues'] = new stdClass();
    }
    return $activity;
}

function loadActivitiesData(): array {
    if (!file_exists(ACTIVITIES_FILE)) {
        return ['activities' => []];
    }
    
    $fp = fopen(ACTIVITIES_FILE, 'r');
    if (!$fp) {
        return ['activities' => []];
    }
    
    flock($fp, LOCK_SH);
    $content = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    
    $data = json_decode($content, true);
    return is_array($data) ? $data : ['activities' => []];
}

function saveActivitiesData(array $data): bool {
    // Rete di sicurezza: qualunque sia il percorso di codice che ha portato
    // fin qui, garantiamo che ogni fieldValues venga scritto su disco come
    // vero oggetto JSON (mai [] quando vuoto).
    if (isset($data['activities']) && is_array($data['activities'])) {
        $data['activities'] = array_map('normalizeFieldValues', $data['activities']);
    }

    $fp = fopen(ACTIVITIES_FILE, 'c+');
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

function getActivities(): array {
    $data = loadActivitiesData();
    $activities = $data['activities'] ?? [];
    return array_map('normalizeFieldValues', $activities);
}

function getActivity(string $id): ?array {
    $activities = getActivities();
    foreach ($activities as $act) {
        if (($act['id'] ?? '') === $id) {
            return $act;
        }
    }
    return null;
}

function saveActivity(array $activityInput): array {
    $data = loadActivitiesData();
    $activities = $data['activities'] ?? [];
    
    $now = date('Y-m-d\TH:i:s\Z');
    
    if (empty($activityInput['id'])) {
        // Create new activity
        $activityInput['id'] = 'act_' . round(microtime(true) * 1000);
        $activityInput['createdAt'] = $now;
        $activityInput['updatedAt'] = $now;
        if (!isset($activityInput['title']) || trim($activityInput['title']) === '') {
            $activityInput['title'] = 'Nuova Attività';
        }
        if (!isset($activityInput['status'])) {
            $activityInput['status'] = 'in_progress';
        }
        if (!isset($activityInput['notepad'])) {
            $activityInput['notepad'] = '<p></p>';
        }
        if (!isset($activityInput['notepadPages']) || !is_array($activityInput['notepadPages']) || count($activityInput['notepadPages']) === 0) {
            $activityInput['notepadPages'] = [
                ['id' => 'p1', 'title' => 'Pagina 1', 'content' => $activityInput['notepad']]
            ];
        }
        if (!isset($activityInput['activePageIndex'])) {
            $activityInput['activePageIndex'] = 0;
        }
        if (!isset($activityInput['templateId'])) {
            $activityInput['templateId'] = null;
        }
        if (!isset($activityInput['fieldValues']) || !is_array($activityInput['fieldValues'])) {
            $activityInput['fieldValues'] = [];
        }
        if (!isset($activityInput['files'])) {
            $activityInput['files'] = [];
        }
        
        $activityInput = normalizeFieldValues($activityInput);
        array_unshift($activities, $activityInput);
        $savedActivity = $activityInput;
    } else {
        // Update existing activity
        $found = false;
        $savedActivity = null;
        foreach ($activities as $index => $existing) {
            if ($existing['id'] === $activityInput['id']) {
                $activityInput['createdAt'] = $existing['createdAt'] ?? $now;
                $activityInput['updatedAt'] = $now;
                if (!isset($activityInput['fieldValues']) && isset($existing['fieldValues'])) {
                    $activityInput['fieldValues'] = $existing['fieldValues'];
                }
                $activities[$index] = normalizeFieldValues(array_merge($existing, $activityInput));
                $savedActivity = $activities[$index];
                $found = true;
                break;
            }
        }
        
        if (!$found) {
            $activityInput['createdAt'] = $now;
            $activityInput['updatedAt'] = $now;
            $activityInput = normalizeFieldValues($activityInput);
            array_unshift($activities, $activityInput);
            $savedActivity = $activityInput;
        }
    }
    
    $data['activities'] = $activities;
    if (!saveActivitiesData($data)) {
        throw new RuntimeException('Impossibile scrivere data/activities.json (verifica permessi cartella/file).');
    }
    
    return $savedActivity;
}

function deleteActivity(string $id): bool {
    $data = loadActivitiesData();
    $activities = $data['activities'] ?? [];
    
    $filtered = array_filter($activities, function($act) use ($id) {
        return ($act['id'] ?? '') !== $id;
    });
    
    if (count($filtered) === count($activities)) {
        return false; // Non trovata (non è un errore di scrittura)
    }
    
    $data['activities'] = array_values($filtered);
    if (!saveActivitiesData($data)) {
        throw new RuntimeException('Impossibile scrivere data/activities.json durante l\'eliminazione dell\'attività.');
    }
    return true;
}

// Rimuove il valore associato a un campo da TUTTE le attività. Usata solo
// quando l'utente elimina DEFINITIVAMENTE un campo dal pool globale
// (azione distruttiva, richiede conferma esplicita lato frontend).
function removeFieldValueFromAllActivities(string $fieldId): int {
    $data = loadActivitiesData();
    $activities = $data['activities'] ?? [];
    $modifiedCount = 0;

    foreach ($activities as &$act) {
        if (isset($act['fieldValues']) && is_array($act['fieldValues']) && array_key_exists($fieldId, $act['fieldValues'])) {
            unset($act['fieldValues'][$fieldId]);
            $modifiedCount++;
        }
    }
    unset($act);

    $data['activities'] = $activities;
    if (!saveActivitiesData($data)) {
        throw new RuntimeException('Impossibile scrivere data/activities.json durante la pulizia dei valori del campo eliminato.');
    }
    return $modifiedCount;
}

// Rimuove il riferimento a una categoria (categoryId) da tutte le attività
// che la usano. Chiamata quando una categoria viene eliminata dal pool
// globale: le attività restano, semplicemente tornano "senza categoria".
function removeCategoryFromAllActivities(string $categoryId): int {
    $data = loadActivitiesData();
    $activities = $data['activities'] ?? [];
    $modifiedCount = 0;

    foreach ($activities as &$act) {
        if (($act['categoryId'] ?? null) === $categoryId) {
            $act['categoryId'] = null;
            $modifiedCount++;
        }
    }
    unset($act);

    $data['activities'] = $activities;
    if (!saveActivitiesData($data)) {
        throw new RuntimeException('Impossibile scrivere data/activities.json durante la pulizia dei riferimenti alla categoria eliminata.');
    }
    return $modifiedCount;
}
