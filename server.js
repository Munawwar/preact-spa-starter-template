/* eslint import-x/extensions: ["error", { "js": "always" }] */
import fs from 'node:fs'
import pathModule from 'node:path'
import { fileURLToPath } from 'node:url'
import { publicURLPath } from './paths.js'
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
// eslint-disable-next-line import-x/extensions
// @ts-ignore
// eslint-disable-next-line import-x/extensions
import { exec as preactIsoUrlPatternMatch } from 'preact-iso/router'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
// import fastifyCompress from '@fastify/compress'

const __dirname = pathModule.dirname(fileURLToPath(import.meta.url))
const rootDir = __dirname;

// Constants
const isProduction = process.env.NODE_ENV === 'production';
const HTTP2 = process.env.HTTP2 === 'true' || !isProduction;
const PORT = parseInt(process.env.PORT || '', 10) || 5173;
const HMR_PORT = 5174;

const devKeyPath = pathModule.resolve(rootDir, 'certs/local.key');
const devCertPath = pathModule.resolve(rootDir, 'certs/local.crt');
const host = HTTP2 ? 'my-app.test' : 'localhost';

if (HTTP2 && !fs.existsSync(devKeyPath)) {
  const devcert = (await import('@expo/devcert')).default;
  const { key, cert } = await devcert.certificateFor(host);
  fs.mkdirSync(pathModule.resolve(rootDir, 'certs/'), { recursive: true });
  fs.writeFileSync(devKeyPath, key.toString('utf-8'), 'utf8');
  fs.writeFileSync(devCertPath, cert.toString('utf-8'), 'utf8');
}

/** @type {(...args: any[]) => any} */
let fastifyHandler;
const server = HTTP2
  ? http2.createSecureServer(
    {
      key: fs.readFileSync(devKeyPath, 'utf8'),
      cert: fs.readFileSync(devCertPath, 'utf8'),
    },
    (...args) => fastifyHandler(...args)
  )
  : http.createServer((...args) => fastifyHandler(...args));
// On dev, when using HTTP2, we need to create a separate HTTPS+HTTP1 server for HMR to work
const hmrServer = !isProduction ? (
  HTTP2
    ? https.createServer({
      key: fs.readFileSync(devKeyPath, 'utf8'),
      cert: fs.readFileSync(devCertPath, 'utf8'),
    }, (...args) => fastifyHandler(...args))
    : server
) : undefined;

const fastify = Fastify({
  ...(HTTP2 ? {
    http2: true,
    https: {
      key: fs.readFileSync(devKeyPath, 'utf8'),
      cert: fs.readFileSync(devCertPath, 'utf8'),
      allowHTTP1: true // Fallback to HTTP/1 if client doesn't support HTTP/2
    },
  } : {}),
  // @ts-ignore
  serverFactory(handler) {
    fastifyHandler = handler;
    return server;
  }
});

/** @type {import('vite').ViteDevServer} */
let vite
/**
 * @typedef {Omit<
 *   import('@/Route').Route<string>, 'Component' | 'getPrefetchUrls'
 * > & { Component: string, getPrefetchUrls?: string }} ManifestRoute
 */

/** @type {ManifestRoute[]} */
let clientSideManagedRoutes;
/** @type {ManifestRoute|null} */
let defaultRoute = null;
/**
 * @typedef {Object} ViteManifestEntry
 * @property {string} file - The output filename
 * @property {string} [src] - The source filename
 * @property {boolean} [isEntry] - Whether this is an entry point
 * @property {string[]} [imports] - Array of chunk names this file imports
 * @property {string[]} [dynamicImports] - Array of dynamic imports
 * @property {string[]} [css] - Array of CSS files this chunk uses
 * @property {string[]} [assets] - Array of asset files
 * @property {string} [integrity] - Integrity hash
 */
/** @type {Record<string, ViteManifestEntry>} */
let viteProdManifest;
// On local, use vite's middlewares
if (!isProduction) {
  const { createServer } = await import('vite')
  vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: {
        server: hmrServer,
        host,
        port: HMR_PORT,
        protocol: HTTP2 ? 'wss' : 'ws',
        clientPort: HMR_PORT,
      }
    },
    appType: 'custom',
    base: '/',
    clearScreen: false,
  })
  await fastify.register(import('@fastify/middie'))
  await fastify.use(vite.middlewares)
} else {
  // Fastify compression middleware is buggy. The JSON.stringify() in the inline JS from
  // getInlinePrefetchCode() function below is causing the compression middleware to fail.
  // await fastify.register(fastifyCompress)
  await fastify.register(fastifyStatic, {
    root: pathModule.resolve(rootDir, 'dist'),
    prefix: publicURLPath,
    maxAge: '1w',
    index: false,
  })
  clientSideManagedRoutes = JSON.parse(fs.readFileSync(pathModule.resolve(rootDir, 'dist/routes.json'), 'utf-8'))
  viteProdManifest = JSON.parse(fs.readFileSync(pathModule.resolve(rootDir, 'dist/.vite/manifest.json'), 'utf-8'))
  defaultRoute = clientSideManagedRoutes.find((route) => route.default) || null;
}

/**
 * @param {string} getPrefetchUrlsFuncCode 
 * @param {Parameters<NonNullable<import('@/Route').PageComponentProps<string>['getPrefetchUrls']>>[0]} route
 */
function getInlinePrefetchCode(getPrefetchUrlsFuncCode, route) {
  const param = JSON.stringify(route)
  return `<script>(window.prefetchUrlsPromise = Promise.resolve((${getPrefetchUrlsFuncCode})(${param}))).then(m=>Object.entries(m).forEach(([,u])=>{
    let d=document.createElement('link')
    d.rel='preload'
    d.as='fetch'
    d.crossOrigin='anonymous'
    d.href=u
    document.head.appendChild(d)
  }))</script>`
}

// eslint-disable-next-line prefer-arrow-callback
fastify.get('/api/test', async function getTestData() {
  return { test: 'test' };
})

fastify.all('*', async (req, reply) => {
  try {
    const url = req.url; // this doesn't contain the origin, but does contain query params. e.g. /api/test?foo=bar
    let template
    let html;
    if (!isProduction) {
      // Always read fresh template in development
      template = fs.readFileSync(pathModule.resolve(rootDir, 'index.html'), 'utf-8')
      // @ts-ignore
      template = await vite.transformIndexHtml(url, template)
      html = template.replace('<!-- ssr-head-placeholder -->', '')
    } else {
      template = fs.readFileSync(pathModule.resolve(rootDir, 'dist/index.html'), 'utf-8')
      const origin = `${req.protocol}://${req.host}`;
      const { pathname } = new URL(url, origin);
      let params = {};
      const found = /** @type {ManifestRoute} */ (
        clientSideManagedRoutes.find((route) => {
          params = {};
          return preactIsoUrlPatternMatch(pathname, route.path, { params })
        })
        || defaultRoute
      );
      // for requests like /favicon.ico don't spend time rendering 404 page
      if (found === defaultRoute && (
        defaultRoute === null
        || (url.split('/').pop() || '').includes('.')
      )) {
        reply.code(404).send('Not Found');
        return;
      }
      const {
        title,
        Component: entryFileName,
        preload,
        getPrefetchUrls: getPrefetchUrlsFuncCode,
        default: isDefault,
        routeId,
        path,
      } = found;
      const manifestEntry = viteProdManifest[entryFileName];
      const preloadJS = (manifestEntry?.imports || [])
        .concat(manifestEntry?.file)
        .filter(file => file && !file.endsWith('.html')) // why are .html files in manifest imports list?
        .map((file) => `${publicURLPath}/${file}`);
      const preloadCSS = (manifestEntry?.css || [])
        .map((file) => `${publicURLPath}/${file}`);
      html = template.replace('<!-- ssr-head-placeholder -->', [
        title ? `<title>${title}</title>` : '',
        ...preloadJS.map((js) => `  <link rel="modulepreload" crossorigin href="${js}">`),
        getPrefetchUrlsFuncCode ? getInlinePrefetchCode(getPrefetchUrlsFuncCode, {
          url,
          path,
          params,
          query: /** @type {Record<string, string>} */ (req.query),
          default: isDefault,
          routeId,
        }) : '',
      ].join('\n'))
      const endTags = [
        ...preloadCSS.map((css) => `  <link rel="stylesheet" crossorigin href="${css}">`),
        ...(preload ? preload.map(({ as, href }) => `  <link rel="preload" as="${as}" crossorigin href="${href}">`) : []),
      ].join('\n');
      html = html.replace('</head>', `${endTags}\n</head>`);
    }

    reply.code(200).header('Content-Type', 'text/html').send(html)
  } catch (e) {
    // @ts-ignore
    vite?.ssrFixStacktrace(e)
    // @ts-ignore
    console.log(e?.stack)
    // @ts-ignore
    reply.code(500).send(e?.stack)
  }
})

if (hmrServer) {
  hmrServer.listen(HMR_PORT, host, () => {
    console.log(`HMR server listening on ${HTTP2 ? 'https' : 'http'}://${host}:${HMR_PORT}`);
  });
}

fastify.listen({ port: PORT, host }, (err) => {
  if (err) throw err
  console.log(`Server listening on ${HTTP2 ? 'https' : 'http'}://${host}:${PORT}`)
})