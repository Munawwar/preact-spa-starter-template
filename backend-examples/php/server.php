<?php

require_once 'preact-iso-url-pattern.php';

$root = dirname(__DIR__, 2);
$port = getenv('PORT') ?: 5173;

$requestUri = $_SERVER['REQUEST_URI'];
$publicUrlPath = '/public';

function ends_with($haystack, $needle) {
    $length = strlen($needle);
    if ($length == 0) {
        return true;
    }
    return (substr($haystack, -$length) === $needle);
}

$clientSideManagedRoutes = json_decode(file_get_contents("$root/dist/routes.json"), true);
$defaultRoute = array_filter($clientSideManagedRoutes, function($route) {
    return isset($route['default']) && $route['default'];
});
$defaultRoute = !empty($defaultRoute) ? reset($defaultRoute) : null;
$viteProdManifest = json_decode(file_get_contents("$root/dist/.vite/manifest.json"), true);

function getInlinePrefetchCode($getPrefetchUrlsFuncCode, $route) {
    $param = json_encode((object)$route);
    return "<script>(window.prefetchUrlsPromise = Promise.resolve(({$getPrefetchUrlsFuncCode})({$param}))).then(m=>Object.entries(m).forEach(([,u])=>{
        let d=document.createElement('link')
        d.rel='preload'
        d.as='fetch'
        d.crossOrigin='anonymous'
        d.href=u
        document.head.appendChild(d)
    }))</script>";
}

if ($_SERVER['REQUEST_URI'] === '/api/test') {
    header('Content-Type: application/json');
    echo json_encode(['test' => 'test']);
    exit;
}

if (strpos($requestUri, $publicUrlPath) === 0) {
    $mimeTypeOverrides = [
        'js' => 'application/javascript',
        'css' => 'text/css',
        'svg' => 'image/svg+xml',
    ];
    $filePath = $root . '/dist' . substr($requestUri, strlen($publicUrlPath));
    if (file_exists($filePath)) {
        $extension = pathinfo($filePath, PATHINFO_EXTENSION);
        $mimeType = $mimeTypeOverrides[$extension] ?? mime_content_type($filePath);
        header("Content-Type: $mimeType");
        readfile($filePath);
        exit;
    }
}

$template = file_get_contents("$root/dist/index.html");

$params = ['params' => (object)[]];
$found = null;
foreach ($clientSideManagedRoutes as $route) {
    $params = ['params' => (object)[]];
    if (($params = preactIsoUrlPatternMatch($requestUri, $route['path'], $params))) {
        $found = $route;
        break;
    }
}
$found = $found ?? $defaultRoute;

// for requests like /favicon.ico don't spend time rendering 404 page
if ($found === $defaultRoute && (
    $defaultRoute === null ||
    strpos(explode('/', $requestUri)[count(explode('/', $requestUri)) - 1], '.') !== false
)) {
    http_response_code(404);
    echo 'Not Found';
    exit;
}

$title = $found['title'] ?? '';
$entryFileName = $found['Component'] ?? '';
$preload = $found['preload'] ?? [];
$getPrefetchUrlsFuncCode = $found['getPrefetchUrls'] ?? null;
$isDefault = $found['default'] ?? false;
$routeId = $found['routeId'] ?? '';
$path = $found['path'] ?? '';

$manifestEntry = $viteProdManifest[$entryFileName] ?? [];
$preloadJS = array_filter(
    array_merge($manifestEntry['imports'] ?? [], [$manifestEntry['file'] ?? null]),
    function($file) { return $file && !ends_with($file, '.html'); }
);
$preloadJS = array_map(function($file) use ($publicUrlPath) {
    return "$publicUrlPath/$file";
}, $preloadJS);

$preloadCSS = array_map(function($file) use ($publicUrlPath) {
    return "$publicUrlPath/$file";
}, $manifestEntry['css'] ?? []);

$headTags = [];
if ($title) {
    $headTags[] = "<title>$title</title>";
}
foreach ($preloadJS as $js) {
    $headTags[] = "<link rel=\"modulepreload\" crossorigin href=\"$js\">";
}
if ($getPrefetchUrlsFuncCode) {
    $headTags[] = getInlinePrefetchCode($getPrefetchUrlsFuncCode, [
        'url' => $_SERVER['REQUEST_URI'],
        'path' => $path,
        'params' => $params['params'],
        'query' => (object)$_GET,
        'default' => $isDefault,
        'routeId' => $routeId
    ]);
}

$endTags = [];
foreach ($preloadCSS as $css) {
    $endTags[] = "<link rel=\"stylesheet\" crossorigin href=\"$css\">";
}
foreach ($preload as $item) {
    $endTags[] = "<link rel=\"preload\" as=\"{$item['as']}\" crossorigin href=\"{$item['href']}\">";
}

$html = str_replace('<!-- ssr-head-placeholder -->', implode("\n", $headTags), $template);
$html = str_replace('</head>', implode("\n", $endTags) . "\n</head>", $html);

if ($found === $defaultRoute)
    http_response_code(404);
header('Content-Type: text/html');
echo $html;
