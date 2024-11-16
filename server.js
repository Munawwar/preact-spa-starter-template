/* eslint import-x/extensions: ["error", { "js": "always" }] */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { publicURLPath } from './paths.js'
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
// eslint-disable-next-line import-x/extensions
import { exec as preactIsoUrlPatternMatch } from 'preact-iso/router'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCompress from '@fastify/compress'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = __dirname;

// Constants
const isProduction = process.env.NODE_ENV === 'production';
const HTTP2 = process.env.HTTP2 === 'true' || !isProduction;
const PORT = process.env.PORT || 5173;
const HMR_PORT = 5174;

const devKeyPath = path.resolve(rootDir, 'certs/local.key');
const devCertPath = path.resolve(rootDir, 'certs/local.crt');
const host = HTTP2 ? 'my-app.test' : 'localhost';

if (HTTP2 && !fs.existsSync(devKeyPath)) {
  const devcert = (await import('@expo/devcert')).default;
  const { key, cert } = await devcert.certificateFor(host);
  fs.mkdirSync(path.resolve(rootDir, 'certs/'), { recursive: true });
  fs.writeFileSync(devKeyPath, key, 'utf8');
  fs.writeFileSync(devCertPath, cert, 'utf8');
}

let fastifyHandler;
const server = HTTP2
  ? http2.createSecureServer({
    key: fs.readFileSync(devKeyPath, 'utf8'),
    cert: fs.readFileSync(devCertPath, 'utf8'),
  }, (...args) => fastifyHandler(...args))
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
  serverFactory(handler) {
    fastifyHandler = handler;
    return server;
  }
});

let vite
let clientSideManagedRoutes;
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
  await fastify.register(fastifyCompress)
  await fastify.register(fastifyStatic, {
    root: path.resolve(rootDir, 'dist'),
    prefix: publicURLPath,
    maxAge: '1w',
    index: false,
  })
  clientSideManagedRoutes = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'dist/routes.json'), 'utf-8'))
  viteProdManifest = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'dist/.vite/manifest.json'), 'utf-8'))
}

function getInlinePrefetchCode(getPrefetchUrlsFuncCode) {
  return `<script>(window.prefetchUrlsPromise = Promise.resolve((${getPrefetchUrlsFuncCode})())).then(m=>Object.entries(m).forEach(([,u])=>{
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
    const url = req.url;

    let template
    let html;
    if (!isProduction) {
      // Always read fresh template in development
      template = fs.readFileSync(path.resolve(rootDir, 'index.html'), 'utf-8')
      template = await vite.transformIndexHtml(url, template)
      html = template.replace('<!-- ssr-head-placeholder -->', '')
    } else {
      template = fs.readFileSync(path.resolve(rootDir, 'dist/index.html'), 'utf-8')
      const { pathname } = new URL(req.url, 'http://localhost:5173');
      // TODO: preload mode JS and add fetches
      const {
        title,
        Component: entryFileName,
        preload,
        getPrefetchUrls: getPrefetchUrlsFuncCode,
      } = clientSideManagedRoutes.find((route) => preactIsoUrlPatternMatch(pathname, route.path, { params: {} })) || {};
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
        getPrefetchUrlsFuncCode ? getInlinePrefetchCode(getPrefetchUrlsFuncCode) : '',
      ].join('\n'))
      const endTags = [
        ...preloadCSS.map((css) => `  <link rel="stylesheet" crossorigin href="${css}">`),
        ...(preload ? preload.map(({ as, href }) => `  <link rel="preload" as="${as}" crossorigin href="${href}">`) : []),
      ].join('\n');
      html = html.replace('</head>', `${endTags}\n</head>`);
    }

    reply.code(200).header('Content-Type', 'text/html').send(html)
  } catch (e) {
    vite?.ssrFixStacktrace(e)
    console.log(e.stack)
    reply.code(500).send(e.stack)
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