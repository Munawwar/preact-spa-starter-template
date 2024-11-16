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

export type PageComponentProps<T extends string> = {
  /** Route pattern as defined in 'src/routes/routes.js'. e.g. '/user/:id' */
  path: T;
} & {
  /** Route ID as defined in 'src/routes/routes.js' */
  routeId: string;
  /** Page title as defined in 'src/routes/routes.js' */
  title: string;
  /** Set to true if the current route was set as the default route on preact-iso router. This is as defined in 'src/routes/routes.js' */
  default?: boolean;
  /** URL from preact-iso useLocation() hook. It is part of the URI without origin and URI fragment. e.g '/user/123?tab=subscription' */
  url: string;
  /** params from preact-iso useRoute() hook. e.g { id: '123' } */
  params: PreactIsoUrlPatternMatch<T>['params'];
  /** query from preact-iso useRoute() hook. e.g { tab: 'subscription' } */
  query: Record<string, string>;
  /** Same getPrefetchUrls function defined in 'src/routes/routes.js' */
  getPrefetchUrls?: () => { [key: string]: string } | Promise<{ [key: string]: string }>;
  /**
   * URLs that were already requested to be prefetched by the inline bootstrapping
   * JS using the getPrefetchUrls function
   */
  prefetchUrlsPromise?: Promise<{ [key: string]: string }>;
};

export type Route<T extends string> = {
  routeId: string;
  title: string | ((props: object) => string);
  path: T;
  Component: (props: PageComponentProps<T>) => import('preact/jsx-runtime').JSX.Element | null;
  default?: boolean;
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
   * and can use browser globals like localStorage etc.
   *
   * Due to the nature of inlining of code into head tag, JS closures (references to any imports in this file)
   * are not allowed.
   * Async code is supported but try not to use anything async as that will delay the prefetching.
   * Also keep this function as short a possible, as it not going to be minified.
   *
   * Even though "prefetching" uses link rel="preload" tags, they have lower priority
   * than server rendered preload tags as they are being created from browser JS.
   */
  getPrefetchUrls?: PageComponentProps<T>['getPrefetchUrls'];
};

export type PageComponent<T extends string> = Route<T>['Component'];
