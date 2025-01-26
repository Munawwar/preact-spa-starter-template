import { LocationProvider, ErrorBoundary, Router, useLocation, useRoute } from 'preact-iso';
// @ts-ignore
import { exec as preactIsoUrlPatternMatch } from 'preact-iso/router';
import { useEffect, useLayoutEffect, useMemo } from 'preact/hooks';
import Layout from './components/layout/AppLayout';
import routes from './routes/routes';
import redirects from './routes/redirects';

/**
 * @template {string} T
 * @param {object} props
 * @param {T} props.path
 * @param {import('@/Route').Route<T>} props.route
 * @param {boolean} [props.default]
 */
const RouteComponent = (props) => {
  const { route } = props;
  const { Component, getPrefetchUrls } = route;
  const { params, query } = useRoute();
  const { url } = useLocation();

  // a useMemo is needed here as preact-iso lazy() will re-render
  // Component twice for some reason.
  /** @type {Promise<{ [key: string]: string }>|undefined} */
  const prefetchUrlsPromise = useMemo(() => {
    if (window.prefetchUrlsPromise) {
      const temp = window.prefetchUrlsPromise;
      // @ts-ignore
      delete window.prefetchUrlsPromise;
      return temp;
    }
    if (getPrefetchUrls) {
      return Promise.resolve(getPrefetchUrls({
        url,
        path: props.path,
        params,
        query,
        default: route.default,
        routeId: route.routeId,
      }));
    }
    return undefined;
  }, []);

  const title =
    typeof route.title === 'function'
      ? route.title(props)
      : route.title.replace(/:([^\b]+)/g, (m, name) => params?.[name] ?? m);
  useEffect(() => {
    document.title = ['My App', title].join(' | ');
  }, []);

  return (
    <Layout>
      <Component
        // route metadata
        routeId={route.routeId}
        title={title}
        path={route.path}
        default={route.default}
        getPrefetchUrls={getPrefetchUrls}
        prefetchUrlsPromise={prefetchUrlsPromise}
        // preact router props
        url={url}
        params={params}
        query={query}
      />
    </Layout>
  );
};

// FIXME: Redirects needs to be handled both by server (first page load) and client (subsequent navigation)
function RedirectionManager() {
  const { path, route } = useLocation();
  useLayoutEffect(() => {
    const match = redirects.find((entry) => entry.path === path);
    if (match) {
      route(match.to);
    }
  }, [path]);
  return null;
}

/**
 * @param {string} urlPath 
 */
function onLoadStart(urlPath) {
  const route = routes.find(({ path: pattern }) => preactIsoUrlPatternMatch(urlPath, pattern, { params: {} }));
  (route?.preload ?? []).forEach(({ as, href }) => {
    // Remove existing preload links with same href
    try {
      document.head
        .querySelectorAll(`link[rel="preload"][href="${href}"]`)
        .forEach(link => link.remove());
    } catch (err) {
      // ignore any errors that could happen with invalid URL characters?
    }
    // Add new preload tag
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = as;
    link.crossOrigin = "anonymous";
    link.href = href;
    document.head.appendChild(link);
  });
}

function App() {
  return (
    <LocationProvider>
      <RedirectionManager />
      <ErrorBoundary>
        <Router onLoadStart={onLoadStart}>
          {routes.map((route) => (
            <RouteComponent
              key={route.path}
              // @ts-ignore
              path={route.path}
              // @ts-ignore
              route={route}
              default={route.default}
            />
          ))}
        </Router>
      </ErrorBoundary>
    </LocationProvider>
  );
}

if (import.meta.env.PROD) {
  window.addEventListener('DOMContentLoaded', () => {
    import('./routes/instant-page-preact-iso');
  });
}

export default App;
