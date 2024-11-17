package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"runtime"
)

type Route struct {
	Path            string            `json:"path"`
	Title           string            `json:"title"`
	Component       string            `json:"Component"`
	Default         bool              `json:"default"`
	RouteId         string            `json:"routeId"`
	Preload         []PreloadItem     `json:"preload"`
	GetPrefetchUrls string            `json:"getPrefetchUrls"`
}

type PreloadItem struct {
	As   string `json:"as"`
	Href string `json:"href"`
}

type RouteParams struct {
	URL     string            `json:"url"`
	Path    string            `json:"path"`
	Params  map[string]string `json:"params"`
	Query   map[string]string `json:"query"`
	Default bool              `json:"default"`
	RouteId string            `json:"routeId"`
}

func main() {
	// Get the current file's directory
	_, filename, _, _ := runtime.Caller(0)
	root := filepath.Dir(filepath.Dir(filepath.Dir(filename)))

	port := os.Getenv("PORT")
	if port == "" {
		port = "5173"
	}

	// Read routes
	routesFile, err := ioutil.ReadFile(filepath.Join(root, "dist", "routes.json"))
	if err != nil {
		log.Fatal(err)
	}
	var clientSideManagedRoutes []Route
	json.Unmarshal(routesFile, &clientSideManagedRoutes)

	// Read manifest
	manifestFile, err := ioutil.ReadFile(filepath.Join(root, "dist", ".vite", "manifest.json"))
	if err != nil {
		log.Fatal(err)
	}
	var viteProdManifest map[string]interface{}
	json.Unmarshal(manifestFile, &viteProdManifest)

	// Serve static files
	fs := http.FileServer(http.Dir(filepath.Join(root, "dist")))
	http.Handle("/public/", http.StripPrefix("/public/", fs))

	var defaultRoute *Route
	for _, route := range clientSideManagedRoutes {
		if route.Default {
			defaultRoute = &route
			break
		}
	}

	// Test API endpoint
	http.HandleFunc("/api/test", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"test": "test"})
	})

	// Main handler
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		template, err := ioutil.ReadFile(filepath.Join(root, "dist", "index.html"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		params := &Matches{Params: make(map[string]string)}
		var found *Route
		for _, route := range clientSideManagedRoutes {
			if preactIsoUrlPatternMatch(r.URL.Path, route.Path, params) != nil {
				found = &route
				break
			}
		}
		if found == nil {
			found = defaultRoute
		}

		// for requests like /favicon.ico don't spend time rendering 404 page
		if found == defaultRoute && (
			defaultRoute == nil ||
			strings.Contains(strings.Split(r.URL.Path, "/")[len(strings.Split(r.URL.Path, "/"))-1], ".")) {
			http.NotFound(w, r)
			return
		}

		manifestEntry, ok := viteProdManifest[found.Component].(map[string]interface{})
		if !ok {
			manifestEntry = make(map[string]interface{})
		}

		preloadJS := []string{}
		if imports, ok := manifestEntry["imports"].([]interface{}); ok {
			for _, imp := range imports {
				if s, ok := imp.(string); ok && !strings.HasSuffix(s, ".html") {
					preloadJS = append(preloadJS, fmt.Sprintf("/public/%s", s))
				}
			}
		}
		if file, ok := manifestEntry["file"].(string); ok {
			preloadJS = append(preloadJS, fmt.Sprintf("/public/%s", file))
		}

		preloadCSS := []string{}
		if css, ok := manifestEntry["css"].([]interface{}); ok {
			for _, c := range css {
				if s, ok := c.(string); ok {
					preloadCSS = append(preloadCSS, fmt.Sprintf("/public/%s", s))
				}
			}
		}

		headContent := []string{}
		endHeadContent := []string{}
		if found.Title != "" {
			headContent = append(headContent, fmt.Sprintf("<title>%s</title>", found.Title))
		}
		for _, js := range preloadJS {
			headContent = append(headContent, fmt.Sprintf(`  <link rel="modulepreload" crossorigin href="%s">`, js))
		}
		if found.GetPrefetchUrls != "" {
			queryParams := make(map[string]string)
			for key, values := range r.URL.Query() {
				if len(values) > 0 {
						queryParams[key] = values[0]
				}
			}
			routeParams := RouteParams{
				URL:     r.URL.String(),
				Path:    found.Path,
				Params:  params.Params,
				Query:   queryParams,
				Default: found.Default,
				RouteId: found.RouteId,
			}
			headContent = append(headContent, getInlinePrefetchCode(found.GetPrefetchUrls, routeParams))
		}
		for _, css := range preloadCSS {
			endHeadContent = append(endHeadContent, fmt.Sprintf(`  <link rel="stylesheet" crossorigin href="%s">`, css))
		}
		if found.Preload != nil {
			for _, item := range found.Preload {
				endHeadContent = append(endHeadContent, fmt.Sprintf(`  <link rel="preload" as="%s" crossorigin href="%s">`, item.As, item.Href))
			}
		}

		html := strings.Replace(string(template), "<!-- ssr-head-placeholder -->", strings.Join(headContent, "\n"), 1)
		html = strings.Replace(string(html), "</head>", strings.Join(endHeadContent, "\n") + "\n</head>", 1)

		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(html))
	})

	log.Printf("Listening on http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func getInlinePrefetchCode(getPrefetchUrlsFuncCode string, route RouteParams) string {
	param, _ := json.Marshal(route)
	return fmt.Sprintf(`<script>(window.prefetchUrlsPromise = Promise.resolve((%s)(%s))).then(m=>Object.entries(m).forEach(([,u])=>{
		let d=document.createElement('link')
		d.rel='preload'
		d.as='fetch'
		d.crossOrigin='anonymous'
		d.href=u
		document.head.appendChild(d)
	}))</script>`, getPrefetchUrlsFuncCode, string(param))
}
