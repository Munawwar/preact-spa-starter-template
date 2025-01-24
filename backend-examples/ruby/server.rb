require 'sinatra'
require 'json'
require_relative 'preact-iso-url-pattern'

set :port, ENV['PORT'] || 5173
root = File.expand_path('../..', __dir__)
distFolder = File.join(root, 'dist')
client_side_managed_routes = JSON.parse(File.read(File.join(distFolder, 'routes.json')))
default_route = client_side_managed_routes.find { |route| route['default'] }
vite_prod_manifest = JSON.parse(File.read(File.join(distFolder, '.vite', 'manifest.json')))

set :public_folder, distFolder
get '/public/*file' do
  send_file File.join(settings.public_folder, params[:file])
end

get '/api/test' do
  content_type :json
  { test: 'test' }.to_json
end

def get_inline_prefetch_code(get_prefetch_urls_func_code, route)
  param = route.to_json
  %(<script>(window.prefetchUrlsPromise = Promise.resolve((#{get_prefetch_urls_func_code})(#{param}))).then(m=>Object.entries(m).forEach(([,u])=>{
    let d=document.createElement('link')
    d.rel='preload'
    d.as='fetch'
    d.crossOrigin='anonymous'
    d.href=u
    document.head.appendChild(d)
  }))</script>)
end

get '/*' do
  template = File.read(File.join(root, 'dist', 'index.html'))

  params = { 'params' => {} }
  found = client_side_managed_routes.find do |route|
    preact_iso_url_pattern_match(request.path, route['path'], params)
  end
  found ||= default_route

  # for requests like /favicon.ico don't spend time rendering 404 page
  if found == default_route && (
    default_route.nil? ||
    request.path.split('/').last.include?('.')
  )
    halt 404, 'Not Found'
  end

  title = found['title']
  entry_file_name = found['Component']
  preload = found['preload']
  get_prefetch_urls_func_code = found['getPrefetchUrls']
  is_default = found['default']
  route_id = found['routeId']
  path = found['path']

  manifest_entry = vite_prod_manifest[entry_file_name] || {}

  preload_js = (manifest_entry['imports']&.dup || [])
    .concat([manifest_entry['file']])
    .compact
    .reject { |file| file.end_with?('.html') }
    .map { |file| "/public/#{file}" }

  preload_css = (manifest_entry['css']&.dup || [])
    .map { |file| "/public/#{file}" }

  head_tags = [
    title ? "<title>#{title}</title>" : nil,
    *preload_js.map { |js| %(<link rel="modulepreload" crossorigin href="#{js}">) },
    get_prefetch_urls_func_code ? get_inline_prefetch_code(get_prefetch_urls_func_code, {
      'url' => request.url,
      'path' => path,
      'params' => params['params'],
      'query' => request.params,
      'default' => is_default,
      'routeId' => route_id
    }) : nil
  ].compact.join("\n")

  end_tags = [
    *preload_css.map { |css| %(<link rel="stylesheet" crossorigin href="#{css}">) },
    *(preload || []).map { |item| %(<link rel="preload" as="#{item['as']}" crossorigin href="#{item['href']}">) }
  ].compact.join("\n")

  html = template.sub('<!-- ssr-head-placeholder -->', head_tags)
  html = html.sub('</head>', "#{end_tags}\n</head>")

  if found == default_route
    status 404
  end
  content_type 'text/html'
  html
end
