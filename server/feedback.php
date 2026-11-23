<?php
// Segnalazioni dall'app myCimmena (PIANO.md, §11): riceve il modulo, controlla tutto, manda una mail a Dario
// con gli allegati e non conserva niente.
//
// Sta su IONOS in https://www.clubdelcimmena.it/mycimmena/feedback.php. La copia originale è nella repo
// myCimmena (server/); quella nella repo del sito si aggiorna con `node tools/copy-server.js`.
//
// Configurazione in config.php, accanto a questo file, NON versionato: lo scrive il deploy del sito dai Secrets
// (vedi config.example.php). Senza config.php risponde 503.
//
// Risposta: JSON { ok: true } oppure { ok: false, error: "messaggio per l'utente" }.

declare(strict_types=1);

const MAX_MESSAGE = 5000;
const MAX_EMAIL = 200;
const MAX_TECH = 3000;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = 14 * 1024 * 1024;
const DAILY_LIMIT = 5;
const TYPES = ['bug' => 'Bug', 'idea' => 'Idea', 'altro' => 'Altro'];
const IMAGE_TYPES = [IMAGETYPE_JPEG => ['image/jpeg', 'jpg'], IMAGETYPE_PNG => ['image/png', 'png'], IMAGETYPE_WEBP => ['image/webp', 'webp']];
// L'app gira su https://localhost (WebView di Capacitor); http://localhost:8080 è `npm run serve`.
const ALLOWED_ORIGINS = ['https://localhost', 'http://localhost', 'http://localhost:8080'];

function respond(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $status, string $message): void
{
    respond($status, ['ok' => false, 'error' => $message]);
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Max-Age: 86400');
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    fail(405, 'Usa il modulo dell’app per inviare una segnalazione.');
}

$configFile = __DIR__ . '/config.php';
$config = is_file($configFile) ? require $configFile : null;
if (!is_array($config) || !filter_var($config['to'] ?? '', FILTER_VALIDATE_EMAIL)) {
    fail(503, 'Le segnalazioni non sono disponibili in questo momento. Riprova più tardi.');
}

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_REQUEST_BYTES) {
    fail(413, 'La segnalazione è troppo grande: togli qualche immagine e riprova.');
}

// Campo trappola: invisibile nell'app, lo riempiono solo i bot. Si risponde "ok" senza mandare niente.
if (trim((string) ($_POST['website'] ?? '')) !== '') {
    respond(200, ['ok' => true]);
}

$type = (string) ($_POST['type'] ?? '');
if (!isset(TYPES[$type])) {
    fail(400, 'Scegli il tipo di segnalazione: bug, idea o altro.');
}
$message = trim(str_replace("\r\n", "\n", (string) ($_POST['message'] ?? '')));
if ($message === '') {
    fail(400, 'Scrivi qualcosa nella segnalazione.');
}
if (mb_strlen($message) > MAX_MESSAGE) {
    fail(400, 'Il testo supera i 5000 caratteri.');
}
$email = trim((string) ($_POST['email'] ?? ''));
if ($email !== '' && (mb_strlen($email) > MAX_EMAIL || !filter_var($email, FILTER_VALIDATE_EMAIL))) {
    fail(400, 'L’indirizzo email per la risposta non sembra valido.');
}
$tech = trim((string) ($_POST['tech'] ?? ''));
if (mb_strlen($tech) > MAX_TECH) {
    $tech = mb_substr($tech, 0, MAX_TECH);
}

// Immagini (campo images[]): al massimo 3, solo JPEG, PNG o WebP riconosciuti dal contenuto (non dal nome o dal tipo dichiarato).
$images = [];
$files = $_FILES['images'] ?? null;
if (is_array($files) && isset($files['tmp_name'])) {
    $count = is_array($files['tmp_name']) ? count($files['tmp_name']) : 1;
    if ($count > MAX_IMAGES) {
        fail(400, 'Puoi allegare al massimo 3 immagini.');
    }
    for ($i = 0; $i < $count; $i++) {
        $error = is_array($files['error']) ? $files['error'][$i] : $files['error'];
        $tmp = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
        $size = is_array($files['size']) ? $files['size'][$i] : $files['size'];
        if ($error === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        if ($error !== UPLOAD_ERR_OK || !is_uploaded_file($tmp)) {
            fail(400, 'Un’immagine non è arrivata intera: riprova.');
        }
        if ($size > MAX_IMAGE_BYTES) {
            fail(413, 'Un’immagine è troppo grande.');
        }
        $info = @getimagesize($tmp);
        if (!$info || !isset(IMAGE_TYPES[$info[2]])) {
            fail(400, 'Le immagini devono essere JPEG, PNG o WebP.');
        }
        [$mime, $extension] = IMAGE_TYPES[$info[2]];
        $images[] = ['data' => file_get_contents($tmp), 'mime' => $mime, 'name' => sprintf('immagine-%d.%s', $i + 1, $extension)];
    }
}

// Limite di 5 segnalazioni al giorno per indirizzo IP. Sul disco c'è solo l'impronta dell'IP (con un sale),
// mai l'indirizzo, e i file più vecchi di un giorno si cancellano.
$ip = (string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '');
$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir) && !@mkdir($dataDir, 0750, true) && !is_dir($dataDir)) {
    fail(500, 'Le segnalazioni non sono disponibili in questo momento. Riprova più tardi.');
}
$salt = (string) ($config['salt'] ?? hash('sha256', 'mycimmena|' . $config['to']));
$limitFile = $dataDir . '/limit-' . hash('sha256', $salt . '|' . $ip) . '.json';
$now = time();
$handle = fopen($limitFile, 'c+');
if (!$handle || !flock($handle, LOCK_EX)) {
    fail(500, 'Le segnalazioni non sono disponibili in questo momento. Riprova più tardi.');
}
$sent = json_decode((string) stream_get_contents($handle), true);
$sent = array_values(array_filter(is_array($sent) ? $sent : [], fn($time) => is_int($time) && $time > $now - 86400));
if (count($sent) >= DAILY_LIMIT) {
    flock($handle, LOCK_UN);
    fclose($handle);
    fail(429, 'Hai già inviato 5 segnalazioni oggi: riprova domani.');
}

// La mail: testo, informazioni tecniche e immagini allegate.
$boundary = 'mycimmena-' . bin2hex(random_bytes(12));
$preview = mb_substr(preg_replace('/\s+/u', ' ', $message), 0, 60);
$subject = '=?UTF-8?B?' . base64_encode(sprintf('[myCimmena] %s: %s', TYPES[$type], $preview)) . '?=';
$from = filter_var($config['from'] ?? '', FILTER_VALIDATE_EMAIL) ? $config['from'] : 'noreply@clubdelcimmena.it';
$headers = [
    'From: myCimmena <' . $from . '>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="' . $boundary . '"',
];
if ($email !== '') {
    $headers[] = 'Reply-To: ' . $email;
}
$body = sprintf(
    "Tipo: %s\nRisposta a: %s\nImmagini: %d\n\n%s\n\n-- Informazioni tecniche --\n%s\n",
    TYPES[$type],
    $email !== '' ? $email : '(nessun indirizzo)',
    count($images),
    $message,
    $tech !== '' ? $tech : '(non allegate)'
);
$mail = "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
    . chunk_split(base64_encode($body)) . "\r\n";
foreach ($images as $image) {
    $mail .= "--{$boundary}\r\nContent-Type: {$image['mime']}; name=\"{$image['name']}\"\r\n"
        . "Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"{$image['name']}\"\r\n\r\n"
        . chunk_split(base64_encode($image['data'])) . "\r\n";
}
$mail .= "--{$boundary}--\r\n";

// Per le prove in locale: con 'dry_run' la mail si scrive in data/ invece di partire.
if (!empty($config['dry_run'])) {
    $delivered = file_put_contents($dataDir . '/last-mail.eml', 'To: ' . $config['to'] . "\r\nSubject: {$subject}\r\n" . implode("\r\n", $headers) . "\r\n\r\n" . $mail) !== false;
} else {
    $delivered = mail($config['to'], $subject, $mail, implode("\r\n", $headers), '-f' . $from);
}
if (!$delivered) {
    flock($handle, LOCK_UN);
    fclose($handle);
    fail(502, 'La segnalazione non è partita. Riprova tra qualche minuto.');
}

$sent[] = $now;
ftruncate($handle, 0);
rewind($handle);
fwrite($handle, json_encode($sent));
flock($handle, LOCK_UN);
fclose($handle);

// Pulizia dei contatori vecchi, ogni tanto.
if (random_int(1, 20) === 1) {
    foreach (glob($dataDir . '/limit-*.json') ?: [] as $file) {
        if (filemtime($file) < $now - 86400) {
            @unlink($file);
        }
    }
}

respond(200, ['ok' => true]);
