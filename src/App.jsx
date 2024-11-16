import { LocationProvider, ErrorBoundary, Router, useLocation, useRoute } from 'preact-iso';
import { useEffect, useLayoutEffect } from 'preact/hooks';
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

  /** @type {Promise<{ [key: string]: string }>|undefined} */
  let prefetchUrlsPromise;
  if (window.prefetchUrlsPromise) {
    prefetchUrlsPromise = window.prefetchUrlsPromise;
    // @ts-ignore
    delete window.prefetchUrlsPromise;
  } else if (getPrefetchUrls) {
    prefetchUrlsPromise = Promise.resolve(
      getPrefetchUrls({
        url,
        path: props.path,
        params,
        query,
        default: route.default,
        routeId: route.routeId,
      }),
    );
  }

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

function App() {
  return (
    <LocationProvider>
      <RedirectionManager />
      <ErrorBoundary>
        <Router>
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

export default App;
