type PreactIsoUrlPatternMatch<Re extends string> = Re extends ''
  ? { params: {} }
  : Re extends '*'
    ? { params: {}; rest: string }
    : Re extends `:${infer key}/${infer rest}`
      ? key extends `${infer keyOpt}?`
        ? { params: { [k in keyOpt]?: string } } & PreactIsoUrlPatternMatch<rest>
        : { params: { [k in key]: string } } & PreactIsoUrlPatternMatch<rest>
      : Re extends `:${infer key}`
        ? key extends `${infer keyOpt}?`
          ? { params: { [k in keyOpt]?: string } }
          : { params: { [k in key]: string } }
        : Re extends `/${infer _}/${infer rest}` | `${infer _}/${infer rest}`
          ? PreactIsoUrlPatternMatch<rest>
          : { params: {} };

export type RouteStaticProps<T extends string> = {
  /** Route pattern as defined in 'src/routes/routes.js'. e.g. '/user/:id' */
  path: T;
} & {
  /** Route ID as defined in 'src/routes/routes.js' */
  routeId: string;
  /** Set to true if the current route was set as the default route on preact-iso router. This is as defined in 'src/routes/routes.js' */
  default?: boolean;
};

export type PageComponentBaseProps<T extends string> = RouteStaticProps<T> & {
  /** URL from preact-iso useLocation() hook. It is part of the URI without origin and URI fragment. e.g '/user/123?tab=subscription' */
  url: string;
  /** params from preact-iso useRoute() hook. e.g { id: '123' } */
  params: PreactIsoUrlPatternMatch<T>['params'];
  /** query from preact-iso useRoute() hook. e.g { tab: 'subscription' } */
  query: Record<string, string>;
};

export type PageComponentProps<T extends string> = PageComponentBaseProps<T> & {
  /** Page title as defined in 'src/routes/routes.js' */
  title: string;
  /** Same getPrefetchUrls function defined in 'src/routes/routes.js' */
  getPrefetchUrls?: (
    param: PageComponentBaseProps<T>,
  ) => { [key: string]: string } | Promise<{ [key: string]: string }>;
  /**
   * URLs that were already requested to be prefetched by the inline bootstrapping
   * JS using the getPrefetchUrls function.
   */
  prefetchUrlsPromise?: Promise<{ [key: string]: string }>;
};

export type Route<T extends string> = RouteStaticProps<T> & {
  /**
   * Title can have placeholders for URL pattern params that begins with a colon `:`
   * (e.g. `Order Summary (:orderId)`).
   * Or use a JS function, but it cannot be re-used in a non-JS backend.
   */
  title: string | ((props: object) => string);
  Component: (props: PageComponentProps<T>) => import('preact/jsx-runtime').JSX.Element | null;
  /**
   * Static preload links that will be inlined into HTML head tag.
   *
   * preload has higher priority than specifying a getPrefetchUrls function, however this is less
   * flexible as you can only specify static links for preload.
   */
  preload?: {
    as: string;
    href: string;
  }[];
  /**
   * Function that gets inlined into HTML head tag, that allows you to preload fetch() calls,
   * and can use browser globals like localStorage etc. prefetching logic only adds a link
   * rel=preload tag, and doesn't actually do the fetch() calls. You need to do the actual
   * fetch() calls later yourself in your code.
   *
   * The function needs to finally return a map from a string key to the final URL to be
   * preloaded. You can later use the key for mapping from a stable name to dynamic URL.
   * e.g. { 'search': '/api/search/123?q=dynamic-query' }
   * This is useful when doing the actual fetch() calls later in your code.
   *
   * Due to the nature of inlining of code into head tag, JS closures (references to any
   * variables outside of the function) are not allowed, with exception of browser globals.
   * Async code is supported, but try not to use async, as that will delay the prefetching.
   * Also keep this function as short a possible, as it not going to be minified.
   *
   * Even though "prefetching" uses link rel="preload" tags, they have lower priority
   * than server rendered preload tags as they are being created from browser JS.
   */
  getPrefetchUrls?: PageComponentProps<T>['getPrefetchUrls'];
};

export type PageComponent<T extends string> = Route<T>['Component'];
