<?php
// php/templates.php

require_once __DIR__ . '/fields.php';

define('TEMPLATES_FILE', __DIR__ . '/../data/templates.json');

function loadTemplatesData(): array {
    if (!file_exists(TEMPLATES_FILE)) {
        return ['templates' => []];
    }
    
    $fp = fopen(TEMPLATES_FILE, 'r');
    if (!$fp) {
        return ['templates' => []];
    }
    
    flock($fp, LOCK_SH);
    $content = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    
    $data = json_decode($content, true);
    return is_array($data) ? $data : ['templates' => []];
}

function saveTemplatesData(array $data): bool {
    $fp = fopen(TEMPLATES_FILE, 'c+');
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

function getTemplates(): array {
    $data = loadTemplatesData();
    $templates = $data['templates'] ?? [];
    $migrated = false;

    foreach ($templates as &$tpl) {
        if (!isset($tpl['fieldIds']) && isset($tpl['fields']) && is_array($tpl['fields'])) {
            $ids = [];
            foreach ($tpl['fields'] as $f) {
                $fid = $f['id'] ?? ('fld_' . round(microtime(true) * 1000) . '_' . random_int(100, 999));
                ensureFieldExists($fid, $f['label'] ?? 'Campo', $f['type'] ?? 'text', $f['options'] ?? null);
                $ids[] = $fid;
            }
            $tpl['fieldIds'] = $ids;
            unset($tpl['fields']);
            $migrated = true;
        }
        if (!isset($tpl['fieldIds'])) {
            $tpl['fieldIds'] = [];
        }
    }
    unset($tpl);

    if ($migrated) {
        $data['templates'] = $templates;
        if (!saveTemplatesData($data)) {
            throw new RuntimeException('Impossibile scrivere data/templates.json durante la migrazione automatica.');
        }
    }

    return $templates;
}

function getTemplate(string $id): ?array {
    $templates = getTemplates();
    foreach ($templates as $tpl) {
        if (($tpl['id'] ?? '') === $id) {
            return $tpl;
        }
    }
    return null;
}

function saveTemplate(array $templateInput): array {
    $data = loadTemplatesData();
    $templates = $data['templates'] ?? [];

    if (!isset($templateInput['fieldIds']) || !is_array($templateInput['fieldIds'])) {
        $templateInput['fieldIds'] = [];
    }
    // Rimuove eventuali duplicati mantenendo l'ordine
    $templateInput['fieldIds'] = array_values(array_unique($templateInput['fieldIds']));
    // Il vecchio formato con campi incorporati non è più supportato in scrittura
    unset($templateInput['fields']);

    if (empty($templateInput['id'])) {
        $templateInput['id'] = 'tpl_' . round(microtime(true) * 1000);
        if (!isset($templateInput['name']) || trim($templateInput['name']) === '') {
            $templateInput['name'] = 'Nuovo Template';
        }
        $templates[] = $templateInput;
        $savedTemplate = $templateInput;
    } else {
        $found = false;
        $savedTemplate = null;
        foreach ($templates as $index => $existing) {
            if ($existing['id'] === $templateInput['id']) {
                $templates[$index] = array_merge($existing, $templateInput);
                $savedTemplate = $templates[$index];
                $found = true;
                break;
            }
        }
        if (!$found) {
            $templates[] = $templateInput;
            $savedTemplate = $templateInput;
        }
    }
    
    $data['templates'] = $templates;
    if (!saveTemplatesData($data)) {
        throw new RuntimeException('Impossibile scrivere data/templates.json (verifica permessi cartella/file).');
    }
    
    return $savedTemplate;
}

function deleteTemplate(string $id): bool {
    $data = loadTemplatesData();
    $templates = $data['templates'] ?? [];
    
    $filtered = array_filter($templates, function($tpl) use ($id) {
        return ($tpl['id'] ?? '') !== $id;
    });
    
    if (count($filtered) === count($templates)) {
        return false; // non trovato (non è un errore di scrittura)
    }
    
    $data['templates'] = array_values($filtered);
    if (!saveTemplatesData($data)) {
        throw new RuntimeException('Impossibile scrivere data/templates.json durante l\'eliminazione del template.');
    }
    return true;
}

// Rimuove il riferimento a un campo (fieldId) da tutti i template che lo
// usano. Chiamata quando un campo viene eliminato DEFINITIVAMENTE dal pool
// globale. Non elimina il template stesso, solo il collegamento a quel campo.
function removeFieldFromAllTemplates(string $fieldId): int {
    $data = loadTemplatesData();
    $templates = $data['templates'] ?? [];
    $modifiedCount = 0;

    foreach ($templates as &$tpl) {
        if (isset($tpl['fieldIds']) && is_array($tpl['fieldIds']) && in_array($fieldId, $tpl['fieldIds'], true)) {
            $tpl['fieldIds'] = array_values(array_filter($tpl['fieldIds'], function ($fid) use ($fieldId) {
                return $fid !== $fieldId;
            }));
            $modifiedCount++;
        }
    }
    unset($tpl);

    $data['templates'] = $templates;
    if (!saveTemplatesData($data)) {
        throw new RuntimeException('Impossibile scrivere data/templates.json durante la pulizia dei riferimenti al campo eliminato.');
    }
    return $modifiedCount;
}
