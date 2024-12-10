import { defineConfig } from 'vite';
import path, { dirname } from 'path';
import fs from 'fs';
import preact from '@preact/preset-vite';
// @ts-ignore
import hash from 'string-hash';
// eslint-disable-next-line import/no-unresolved
import sassDts from 'vite-plugin-sass-dts';
import pluginDevSSL from '@vitejs/plugin-basic-ssl';
import { visualizer } from 'rollup-plugin-visualizer';
import { fileURLToPath } from 'url';
import { publicURLPath } from './paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production'

// https://vitejs.dev/config/
export default defineConfig({
  base: isProduction ? publicURLPath : '/',
  plugins: [preact()].concat(
    // @ts-ignore
    isProduction ? [] : sassDts(),
    isProduction ? [] : pluginDevSSL({
      /** name of certification */
      name: 'localhost',
      /** custom trust domains */
      domains: ['localhost'],
      /** custom certification directory */
      certDir: './certs/'
    }),
    {
      name: 'post-build-cmd',
      async closeBundle() {
        const routeDir = path.resolve(__dirname, './src/routes');
        let routesFile = fs.readFileSync(path.resolve(routeDir, 'routes.js'), 'utf-8');
        routesFile = routesFile.replace(/lazy\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*(.+)\s*\)\s*\)\s*(,?)/g, '$1$2');
        // console.log(routesFile)
        const fileName = path.resolve(__dirname, 'routes-temp.js')
        fs.writeFileSync(fileName, routesFile, 'utf-8');
        const routes = (await import(fileName)).default;
        fs.unlinkSync(fileName);
        const routeInfo = routes.map((route) => {
          let func = route.getPrefetchUrls?.toString?.();
          if (func) {
            if (func.startsWith('getPrefetchUrls')) {
              func = `function ${func}`;
            } else if (func.startsWith('async getPrefetchUrls')) {
              func = `async function ${func.slice(6)}`;
            }
          }
          return {
            routeId: route.routeId,
            path: route.path,
            title: typeof route.title === 'string' ? route.title : null,
            Component: path.relative(__dirname, path.resolve(routeDir, `${route.Component}.jsx`)),
            default: route.default,
            preload: route.preload,
            getPrefetchUrls: func,
          };
        });
        // console.log(routeInfo);
        fs.writeFileSync(
          path.resolve(__dirname, 'dist/routes.json'),
          JSON.stringify(routeInfo, null, 2),
          'utf-8'
        );
      },
    },
  ),
  build: {
    sourcemap: true,
    manifest: true,
    ssrManifest: true,
    rollupOptions: {
      plugins: isProduction
        ? [visualizer({ filename: 'bundle-analysis.html' })]
        : [],
    },
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, '/src'),
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  css: {
    modules: {
      generateScopedName(name, filename) {
        return `${(filename.match(/([^/\\]+?)(?:\.module).css(?:.*)$/) || ['', '_'])[1]
          }-${name}-${hash(path.relative(__dirname, filename))
            .toString(36)
            .slice(0, 4)}`;
      },
    },
  },
  test: {
    globals: true,
    browser: {
      enabled: true,
      provider: 'playwright',
      name: 'chromium',
      ui: false,
      headless: true,
    },
    setupFiles: './tests/setup.js',
  },
});
