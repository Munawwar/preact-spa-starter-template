import { lazy } from 'preact-iso';

/**
 * This function is solely to please typescript
 * @template {string} T
 * @param {T} path
 * @param {Omit<import('@/Route').Route<T>, 'path'>} options
 * @returns {import('@/Route').Route<T>}
 */
const route = (path, options) => ({ path, ...options });

const routes = [
  route('/', {
    routeId: 'home',
    title: 'Home',
    Component: lazy(() => import('./Home')),
    // Less flexible but higher priority preloading
    // preload: [{
    //   as: 'fetch',
    //   href: '/api/test',
    // }],

    // More flexible but lower priority preloading
    // Read the jsdoc for more info
    // eslint-no-closure
    getPrefetchUrls: () => ({ '/api/test': '/api/test' }),
  }),
  route('/user/:id', {
    routeId: 'user',
    title: 'User',
    Component: lazy(() => import('./Home')),
  }),
  route('/error', {
    routeId: 'error',
    title: 'Error Test Page',
    // @ts-ignore
    Component: lazy(() => import('./ErrorTest')),
  }),
  route('', {
    routeId: '404',
    title: 'Page Not Found',
    default: true,
    Component: lazy(() => import('./PageNotFound')),
  }),
];

export default routes;
