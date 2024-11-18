<?php
// Run program: php preact-iso-url-pattern.php

function preactIsoUrlPatternMatch($url, $route, $matches = null) {
    if ($matches === null) {
        $matches = ['params' => (object)[]];
    }
    $url = array_filter(explode('/', $url));
    $route = array_filter(explode('/', $route ?? ''));

    for ($i = 1; $i <= max(count($url), count($route)); $i++) {
        preg_match('/^(:?)(.*?)([+*?]?)$/', $route[$i] ?? '', $parts);
        $m = $parts[1] ?? '';
        $param = $parts[2] ?? '';
        $flag = $parts[3] ?? '';
        $val = $url[$i] ?? null;

        // segment match:
        if (!$m && $param === $val) continue;
        
        // /foo/* match
        if (!$m && $val && $flag == '*') {
            $matches['rest'] = '/' . implode('/', array_map('urldecode', array_slice($url, $i)));
            break;
        }

        // segment mismatch / missing required field:
        if (!$m || (!$val && $flag != '?' && $flag != '*')) {
            return null;
        }
        $rest = $flag == '+' || $flag == '*';

        // rest (+/*) match:
        if ($rest) {
            $val = implode('/', array_map('urldecode', array_slice($url, $i))) ?: null;
        }
        // normal/optional field:
        elseif ($val) {
            $val = urldecode($url[$i]);
        }

        $matches['params'][$param] = $val;
        if (!isset($matches[$param])) {
            $matches[$param] = $val;
        }

        if ($rest) break;
    }

    return $matches;
}
// Example usage:
// var_dump(preactIsoUrlPatternMatch("/foo/bar%20baz", "/foo/:param"));
// var_dump(preactIsoUrlPatternMatch("/foo/bar/baz", "/foo/*"));
// var_dump(preactIsoUrlPatternMatch("/foo", "/foo/:param?"));
// var_dump(preactIsoUrlPatternMatch("/foo/bar", "/bar/:param"));
// var_dump(preactIsoUrlPatternMatch('/users/test%40example.com/posts', '/users/:userId/posts'));
?>