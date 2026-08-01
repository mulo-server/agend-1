<?php
// php/categories.php
//
// Le categorie sono un'entità globale indipendente (come i fields): ogni
// attività referenzia una categoria tramite "categoryId". Eliminare una
// categoria non elimina le attività, semplicemente rimuove il riferimento
// (vedi removeCategoryFromAllActivities in activities.php).

define('CATEGORIES_FILE', __DIR__ . '/../data/categories.json');

function loadCategoriesData(): array {
    if (!file_exists(CATEGORIES_FILE)) {
        return ['categories' => []];
    }

    $fp = fopen(CATEGORIES_FILE, 'r');
    if (!$fp) {
        return ['categories' => []];
    }

    flock($fp, LOCK_SH);
    $content = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    $data = json_decode($content, true);
    return is_array($data) ? $data : ['categories' => []];
}

function saveCategoriesData(array $data): bool {
    $fp = fopen(CATEGORIES_FILE, 'c+');
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

function getCategories(): array {
    $data = loadCategoriesData();
    return $data['categories'] ?? [];
}

function getCategory(string $id): ?array {
    foreach (getCategories() as $c) {
        if (($c['id'] ?? '') === $id) {
            return $c;
        }
    }
    return null;
}

function saveCategory(array $categoryInput): array {
    $data = loadCategoriesData();
    $categories = $data['categories'] ?? [];

    if (!isset($categoryInput['name']) || trim($categoryInput['name']) === '') {
        $categoryInput['name'] = 'Nuova Categoria';
    }
    if (!isset($categoryInput['color']) || trim($categoryInput['color']) === '') {
        $categoryInput['color'] = '#2dd4bf';
    }

    if (empty($categoryInput['id'])) {
        $categoryInput['id'] = 'cat_' . round(microtime(true) * 1000) . '_' . random_int(100, 999);
        $categories[] = $categoryInput;
        $saved = $categoryInput;
    } else {
        $found = false;
        $saved = null;
        foreach ($categories as $index => $existing) {
            if ($existing['id'] === $categoryInput['id']) {
                $categories[$index] = array_merge($existing, $categoryInput);
                $saved = $categories[$index];
                $found = true;
                break;
            }
        }
        if (!$found) {
            $categories[] = $categoryInput;
            $saved = $categoryInput;
        }
    }

    $data['categories'] = $categories;
    if (!saveCategoriesData($data)) {
        throw new RuntimeException('Impossibile scrivere data/categories.json (verifica permessi cartella/file).');
    }
    return $saved;
}

function deleteCategoryDefinition(string $id): bool {
    $data = loadCategoriesData();
    $categories = $data['categories'] ?? [];

    $filtered = array_values(array_filter($categories, function ($c) use ($id) {
        return ($c['id'] ?? '') !== $id;
    }));

    if (count($filtered) === count($categories)) {
        return false; // non trovata (non è un errore di scrittura)
    }

    $data['categories'] = $filtered;
    if (!saveCategoriesData($data)) {
        throw new RuntimeException('Impossibile scrivere data/categories.json durante l\'eliminazione della categoria.');
    }
    return true;
}
