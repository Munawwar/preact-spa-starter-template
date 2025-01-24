import json
import os
from flask import Flask, send_from_directory, request, Response
from werkzeug.middleware.shared_data import SharedDataMiddleware

from preact_iso_url_pattern import preact_iso_url_pattern_match

app = Flask(__name__)

# Constants
is_production = os.environ.get('FLASK_ENV') == 'production'
PORT = int(os.environ.get('PORT', 5173))
public_url_path = '/public'


root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

with open(os.path.join(root, 'dist/routes.json'), 'r') as f:
    client_side_managed_routes = json.load(f)
    default_route = next((route for route in client_side_managed_routes if route.get('default')), None)

with open(os.path.join(root, 'dist/.vite/manifest.json'), 'r') as f:
    vite_prod_manifest = json.load(f)

# Serve static files
app.wsgi_app = SharedDataMiddleware(app.wsgi_app, {
    public_url_path: os.path.join(root, 'dist')
})

def get_inline_prefetch_code(get_prefetch_urls_func_code, route):
    param = json.dumps(route)
    return f'''<script>(window.prefetchUrlsPromise = Promise.resolve(({get_prefetch_urls_func_code})({param}))).then(m=>Object.entries(m).forEach(([,u])=>{{
        let d=document.createElement('link')
        d.rel='preload'
        d.as='fetch'
        d.crossOrigin='anonymous'
        d.href=u
        document.head.appendChild(d)
    }}))</script>'''

@app.route('/api/test')
def get_test_data():
    return {'test': 'test'}


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    try:
        with open(os.path.join(root, 'dist/index.html'), 'r') as f:
            template = f.read()

        origin = f"{request.scheme}://{request.host}"
        pathname = request.path
        params = {}

        found = next(
            (route for route in client_side_managed_routes if preact_iso_url_pattern_match(pathname, route['path'], {'params': params})),
            default_route
        )

        # Don't waste time rendering 404 page on stuff like /favicon.ico
        if found == default_route and (
            default_route is None or 
            ('.' in pathname.split('/')[-1])
        ):
            return 'Not Found', 404

        title = found.get('title', '')
        entry_file_name = found.get('Component', '')
        preload = found.get('preload', [])
        get_prefetch_urls_func_code = found.get('getPrefetchUrls')
        is_default = found.get('default')
        route_id = found.get('routeId')
        path = found.get('path')

        manifest_entry = vite_prod_manifest.get(entry_file_name, {})
        preload_js = [f"{public_url_path}/{file}" for file in 
                    (manifest_entry.get('imports', []) + [manifest_entry.get('file')])
                    if file and not file.endswith('.html')]
        preload_css = [f"{public_url_path}/{file}" for file in manifest_entry.get('css', [])]

        head_tags = '\n'.join([
            f"<title>{title}</title>" if title else '',
            *[f'<link rel="modulepreload" crossorigin href="{js}">' for js in preload_js],
            get_inline_prefetch_code(get_prefetch_urls_func_code, {
                'url': request.url,
                'path': path,
                'params': params,
                'query': dict(request.args),
                'default': is_default,
                'routeId': route_id
            }) if get_prefetch_urls_func_code else ''
        ])

        end_tags = '\n'.join([
            *[f'<link rel="stylesheet" crossorigin href="{css}">' for css in preload_css],
            *[f'<link rel="preload" as="{item["as"]}" crossorigin href="{item["href"]}">' for item in preload]
        ])

        html = template.replace('<!-- ssr-head-placeholder -->', head_tags)
        html = html.replace('</head>', f'{end_tags}\n</head>')

        if found == default_route:
            return Response(html, status=404, mimetype='text/html')

        return Response(html, mimetype='text/html')
    except Exception as e:
        return str(e), 500

if __name__ == '__main__':
    app.run(host='localhost', port=PORT, debug=not is_production)
