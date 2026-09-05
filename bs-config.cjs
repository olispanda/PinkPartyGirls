// Browsersync config — live-reloading dev server for the static site.
// Run with: npm run dev
module.exports = {
  server: {
    baseDir: ".",
    index: "index.html",
    // Pages link to pretty URLs (/about, not /about.html) — the deployed
    // site gets real about/index.html folders (see scripts/inject-og.mjs),
    // but locally we keep flat *.html files for simplicity, so tell the
    // static server to try appending .html when a path has no extension.
    serveStaticOptions: {
      extensions: ["html"],
    },
  },
  // Watch every asset the pages use and reload / inject on change.
  files: ["*.html", "css/*.css", "js/*.js", "content/*.json", "Assets/**/*"],
  watchEvents: ["add", "change", "unlink"],
  // Inject CSS changes without a full page reload; reload for HTML/JS.
  injectChanges: true,
  port: 3000,
  open: "local",
  notify: true,
  ghostMode: {
    // Mirror clicks / scroll / form input across every connected browser
    // (handy for testing the same state on phone + desktop at once).
    clicks: true,
    scroll: true,
    forms: true,
    location: true,
  },
  // Slight delay so multi-file saves (e.g. editor "format on save") settle
  // into a single reload.
  reloadDebounce: 200,
};
