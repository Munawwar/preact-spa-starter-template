# preact-spa-template

Preact single-page app starter template. This template is tuned for "SPA" sites; sites that do not need server side rendering (SSR). If you need SSR, then take a look at [preact-mpa-template](https://github.com/Munawwar/preact-mpa-template).

Clone repo, use node.js 14+ and run following:

```
npm ci
npm run dev
```

## Features!

- [Preact](https://github.com/preactjs/preact) + Preact hooks = 4 KB
- [Vite](https://vitejs.dev) and all the goodies that comes with it
- [preact-iso](https://github.com/preactjs/preact-iso)
  - Code split by pages + lazy loaded
  - Manages browser history
  - Manage page title - so that it looks good on browser tab & browser back button history
  - 404 Screen
  - Error Screen
- [CSS Modules](https://github.com/css-modules/css-modules) - with eslint typo/unused css check and autocomplete (it is easy to remove this and use tailwind)
- ESLint and Prettier
- Type check via JSDocs and typescript checker (tsc)
- [Yorkie](https://www.npmjs.com/package/yorkie) git push linting hook
- [Vitest](https://vitest.dev/) + [Preact testing library](https://preactjs.com/guide/v10/preact-testing-library/) + [Playwright](https://playwright.dev/)

### About Routes

You can find routes mapping (url-to-component mapping) at src/routes/routes.js.

You will notice that <code>lazy(() =&gt; import('./file'))</code> is
used for lazy loading and bundling each page's JS into separate bundles
for production.

You can also manage page titles from routes.js. `title` must be a string (it can have placeholders from route pattern. e.g. `Orders | :orderId`) or a function that which receives route info and returns a string.

Route components receives following properties about current route:

- url: `url` without origin and URI fragment. e.g '/user/123?tab=subscription'
- path: route pattern. e.g. `/user/:id`
- params: path matches (as an object). e.g: `{ id: 'user1' }`
- title: the title text used to set head title tag
- query: query params (as an object). e.g: `{ search: 'john' }`
- routeId: the routeId used in route.js

Path redirects can be configured in src/routes/redirects.js

### Path aliases

`~` is short hand for src/ directory. So you don't have to do `import '../../../js-file-in-src-directory'`. You can just do `import '~/js-file-in-src-directory'`

Similarly for types, there is a shorthand alias `@` to the types/ directory. e.g. `import('@/Route').PageComponent`

## Where to go next?

- Check package.json - dependencies, scripts and eslint rules
- Check the implementation of src/App.jsx
- Read about [preact/compat](https://preactjs.com/guide/v10/switching-to-preact/)
- Add or remove stuff as you need. Check out other tools:
  - Whole list of preact related tools at [awesome-preact](https://github.com/preactjs/awesome-preact)
  - Icons
    - [Material Icons](https://github.com/material-icons/material-icons)
    - Remove SVG from JS with [preact-svg-icon](https://www.npmjs.com/package/preact-svg-icon)
  - CSS Libraries
    - [Open Props](https://open-props.style)
    - [Tailwind](https://tailwindcss.com)
    - [Fluid](https://fluid.tw/)
  - UI Libraries
    - [Material UI](https://github.com/mui/material-ui/tree/master/examples/material-preact)
    - [Preact Fluid](https://github.com/ajainvivek/preact-fluid)
  - State managers
    - [Preact Signals](https://preactjs.com/guide/v10/signals/)
    - [Tanstack Query with Preact Signals](https://www.npmjs.com/package/@preact-signals/query)
    - [nanostore](https://github.com/nanostores/nanostores)
    - [query with nanostore](https://github.com/nanostores/query)
