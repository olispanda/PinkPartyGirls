// Browsersync config — live-reloading dev server for the static site.
// Run with: npm run dev
module.exports = {
  server: {
    baseDir: ".",
    index: "index.html",
  },
  // Watch every asset the pages use and reload / inject on change.
  files: ["*.html", "css/*.css", "js/*.js", "Assets/**/*"],
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
