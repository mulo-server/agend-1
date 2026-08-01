<?php
// php/api.php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/activities.php';
require_once __DIR__ . '/templates.php';
require_once __DIR__ . '/fields.php';
require_once __DIR__ . '/categories.php';

// Garantisce che la cartella dei dati esista sempre: eviterebbe altrimenti
// che ogni scrittura fallisca semplicemente perché 'data/' non è mai stata
// creata (causa comune di "il dato sembra salvarsi ma sparisce al reload").
$dataDir = __DIR__ . '/../data';
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0775, true);
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';

// Handle JSON POST body if applicable
$inputRaw = file_get_contents('php://input');
$inputData = json_decode($inputRaw, true);
if (is_array($inputData)) {
    if (isset($inputData['action'])) {
        $action = $inputData['action'];
    }
}

function sendResponse(bool $success, $data = null, string $error = ''): void {
    echo json_encode([
        'success' => $success,
        'data' => $data,
        'error' => $error
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    switch ($action) {
        case 'getActivities':
            $activities = getActivities();
            sendResponse(true, $activities);
            break;

        case 'getActivity':
            $id = $_GET['id'] ?? $inputData['id'] ?? '';
            if (!$id) {
                sendResponse(false, null, 'Parametro id mancante');
            }
            $act = getActivity($id);
            if ($act) {
                sendResponse(true, $act);
            } else {
                sendResponse(false, null, 'Attività non trovata');
            }
            break;

        case 'saveActivity':
            $payload = $inputData['activity'] ?? $inputData ?? [];
            if (empty($payload)) {
                sendResponse(false, null, 'Dati attività non pervenuti');
            }
            $saved = saveActivity($payload);
            sendResponse(true, $saved);
            break;

        case 'deleteActivity':
            $id = $inputData['id'] ?? $_POST['id'] ?? $_GET['id'] ?? '';
            if (!$id) {
                sendResponse(false, null, 'Parametro id mancante');
            }
            $ok = deleteActivity($id);
            if ($ok) {
                sendResponse(true, ['id' => $id]);
            } else {
                sendResponse(false, null, 'Impossibile eliminare l\'attività');
            }
            break;

        case 'getTemplates':
            $templates = getTemplates();
            sendResponse(true, $templates);
            break;

        case 'getTemplate':
            $id = $_GET['id'] ?? $inputData['id'] ?? '';
            if (!$id) {
                sendResponse(false, null, 'Parametro id mancante');
            }
            $tpl = getTemplate($id);
            if ($tpl) {
                sendResponse(true, $tpl);
            } else {
                sendResponse(false, null, 'Template non trovato');
            }
            break;

        case 'saveTemplate':
            $payload = $inputData['template'] ?? $inputData ?? [];
            if (empty($payload)) {
                sendResponse(false, null, 'Dati template non pervenuti');
            }
            $saved = saveTemplate($payload);
            sendResponse(true, $saved);
            break;

        case 'deleteTemplate':
            $id = $inputData['id'] ?? $_POST['id'] ?? $_GET['id'] ?? '';
            if (!$id) {
                sendResponse(false, null, 'Parametro id mancante');
            }
            $ok = deleteTemplate($id);
            if ($ok) {
                sendResponse(true, ['id' => $id]);
            } else {
                sendResponse(false, null, 'Impossibile eliminare il template');
            }
            break;

        case 'getFields':
            $fields = getFields();
            sendResponse(true, $fields);
            break;

        case 'saveField':
            $payload = $inputData['field'] ?? $inputData ?? [];
            if (empty($payload)) {
                sendResponse(false, null, 'Dati campo non pervenuti');
            }
            $saved = saveField($payload);
            sendResponse(true, $saved);
            break;

        case 'deleteField':
            // Eliminazione DEFINITIVA di un campo dal pool globale: rimuove
            // anche il riferimento da tutti i template e il valore da tutte
            // le attività. Il frontend deve aver già mostrato all'utente
            // l'impatto (quanti template/attività) e ottenuto conferma esplicita.
            $id = $inputData['id'] ?? $_POST['id'] ?? $_GET['id'] ?? '';
            if (!$id) {
                sendResponse(false, null, 'Parametro id mancante');
            }
            $fieldRemoved = deleteFieldDefinition($id);
            if (!$fieldRemoved) {
                sendResponse(false, null, 'Campo non trovato');
            }
            $templatesUpdated = removeFieldFromAllTemplates($id);
            $activitiesUpdated = removeFieldValueFromAllActivities($id);
            sendResponse(true, [
                'id' => $id,
                'templatesUpdated' => $templatesUpdated,
                'activitiesUpdated' => $activitiesUpdated
            ]);
            break;

        case 'getCategories':
            $categories = getCategories();
            sendResponse(true, $categories);
            break;

        case 'saveCategory':
            $payload = $inputData['category'] ?? $inputData ?? [];
            if (empty($payload)) {
                sendResponse(false, null, 'Dati categoria non pervenuti');
            }
            $saved = saveCategory($payload);
            sendResponse(true, $saved);
            break;

        case 'deleteCategory':
            // Eliminazione DEFINITIVA di una categoria dal pool globale: rimuove
            // anche il riferimento da tutte le attività che la usavano.
            $id = $inputData['id'] ?? $_POST['id'] ?? $_GET['id'] ?? '';
            if (!$id) {
                sendResponse(false, null, 'Parametro id mancante');
            }
            $categoryRemoved = deleteCategoryDefinition($id);
            if (!$categoryRemoved) {
                sendResponse(false, null, 'Categoria non trovata');
            }
            $activitiesUpdated = removeCategoryFromAllActivities($id);
            sendResponse(true, [
                'id' => $id,
                'activitiesUpdated' => $activitiesUpdated
            ]);
            break;

        default:
            sendResponse(false, null, 'Azione non valida o non specificata: ' . htmlspecialchars($action));
            break;
    }
} catch (Throwable $e) {
    sendResponse(false, null, 'Errore del server: ' . $e->getMessage());
}
