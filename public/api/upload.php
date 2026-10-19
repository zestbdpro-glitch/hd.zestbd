<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

runApi(function (): array {
    requireMethod('POST');
    requireAdmin();
    requireCsrf();
    rateLimit('upload', 60, 3600);
    $file = $_FILES['file'] ?? null;
    if (!$file || !is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) throw new HttpError(422, 'Upload failed. Check the file size and try again.');
    $video = ($_POST['kind'] ?? '') === 'video';
    $maximum = ($video ? 30 : 8) * 1024 * 1024;
    if (($file['size'] ?? 0) < 1 || $file['size'] > $maximum) throw new HttpError(422, $video ? 'Videos must be smaller than 30 MB.' : 'Images must be smaller than 8 MB.');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    if ($video) {
        $head = file_get_contents($file['tmp_name'], false, null, 0, 16);
        if (!in_array($mime, ['video/mp4', 'application/mp4'], true) || substr($head ?: '', 4, 4) !== 'ftyp') throw new HttpError(422, 'Use an MP4 product video.');
    }
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!$video && !isset($extensions[$mime])) throw new HttpError(422, 'Use a JPEG, PNG, or WebP image.');
    $size = $video ? [1280, 720] : @getimagesize($file['tmp_name']);
    if (!$video && (!$size || $size[0] < 64 || $size[1] < 64 || $size[0] > 10000 || $size[1] > 10000 || $size[0] * $size[1] > 24000000)) throw new HttpError(422, 'Image dimensions must be at least 64 pixels and at most 24 megapixels.');
    $directory = DECOR_PUBLIC_ROOT . '/uploads';
    if (!is_dir($directory) && !mkdir($directory, 0755, true)) throw new HttpError(503, 'The uploads folder is not writable.');
    $filename = bin2hex(random_bytes(16)) . '.' . ($video ? 'mp4' : $extensions[$mime]);
    if (!move_uploaded_file($file['tmp_name'], $directory . '/' . $filename)) throw new HttpError(503, 'The image could not be saved.');
    return ['path' => './uploads/' . $filename, 'width' => $size[0], 'height' => $size[1]];
});
