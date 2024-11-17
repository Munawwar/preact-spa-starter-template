# Run program: ruby preact-iso-url-pattern.rb
require 'cgi'

def preact_iso_url_pattern_match(url, route, matches = nil)
  matches ||= { 'params' => {} }
  url = url.split('/').reject(&:empty?)
  route = (route || '').split('/').reject(&:empty?)

  (0...[url.length, route.length].max).each do |i|
    m, param, flag = route[i]&.match(/^(:?)(.*?)([+*?]?)$/)&.captures || ['', '', '']
    val = url[i]

    # segment match:
    next if m.empty? && param == val

    # /foo/* match
    if m.empty? && val && flag == '*'
      matches['rest'] = '/' + url[i..].map { |part| CGI.unescape(part) }.join('/')
      break
    end

    # segment mismatch / missing required field:
    return nil if m.empty? || (!val && flag != '?' && flag != '*')

    rest = flag == '+' || flag == '*'

    # rest (+/*) match:
    if rest
      val = url[i..].map { |part| CGI.unescape(part) }.join('/') || nil
    # normal/optional field:
    elsif val
      val = CGI.unescape(val)
    end

    matches['params'][param] = val
    matches[param] = val unless matches.key?(param)

    break if rest
  end

  matches
end

# Example usage:
# puts preact_iso_url_pattern_match("/foo/bar%20baz", "/foo/:param")
# puts preact_iso_url_pattern_match("/foo/bar/baz", "/foo/*")
# puts preact_iso_url_pattern_match("/foo", "/foo/:param?")
# puts preact_iso_url_pattern_match("/foo/bar", "/bar/:param")
# puts preact_iso_url_pattern_match('/users/test%40example.com/posts', '/users/:userId/posts')