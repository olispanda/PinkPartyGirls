#!/usr/bin/env node
// Injects Open Graph / Twitter Card meta tags into each page at deploy time,
// using content/settings.json (edited via Pages CMS) as the source. This has
// to happen at build time, not in the browser: link-preview crawlers
// (WhatsApp, iMessage, Slack, Facebook, ...) fetch the raw HTML and never run
// js/cms.js, so the tags must already be in the response.
//
// Copies the repo into _site/, patches the <!-- OG:START/END --> block in
// each page's <head>, and moves every page except the homepage into its own
// folder (about.html -> about/index.html) for pretty URLs (/about instead of
// /about.html). The source repo keeps flat filenames — simpler for local dev
// and CMS editing — only the deployed output is restructured. Run by
// .github/workflows/deploy.yml; safe to run locally too (`node scripts/inject-og.mjs`).

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync, mkdtempSync, renameSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const OUT = join(ROOT, "_site");

// dir: null keeps the page at the site root (only the homepage). Everything
// else becomes <dir>/index.html so it's reachable at /<dir> and /<dir>/.
const PAGES = [
  { file: "index.html", url: "/", dir: null },
  { file: "about.html", url: "/about", dir: "about" },
  { file: "music.html", url: "/music", dir: "music" },
  { file: "shows.html", url: "/shows", dir: "shows" },
  { file: "contact.html", url: "/contact", dir: "contact" },
];

// Things that only matter for editing/dev, not for the deployed site.
const EXCLUDE = new Set([
  "_site",
  ".git",
  ".github",
  "node_modules",
  ".pages.yml",
  "package.json",
  "package-lock.json",
  "bs-config.cjs",
  "CMS-SETUP.md",
  "scripts",
  ".gitignore",
]);

function siteUrl() {
  // A CNAME file (custom domain) is the most reliable source and doesn't
  // need updating if the domain ever changes elsewhere.
  const cnamePath = join(ROOT, "CNAME");
  if (existsSync(cnamePath)) {
    const domain = readFileSync(cnamePath, "utf8").trim();
    if (domain) return `https://${domain}`;
  }
  // Fall back to the default GitHub Pages URL when run in Actions without a
  // custom domain configured yet.
  const repo = process.env.GITHUB_REPOSITORY || "";
  const [owner, name] = repo.split("/");
  if (owner && name) return `https://${owner}.github.io/${name}`;
  return "";
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function absoluteUrl(base, path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (!base) return "";
  return base.replace(/\/$/, "") + "/" + String(path).replace(/^\//, "");
}

function buildOgBlock({ siteName, pageTitle, description, imageUrl, pageUrl }) {
  const lines = [
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${escapeAttr(siteName)}" />`,
    `<meta property="og:title" content="${escapeAttr(pageTitle)}" />`,
  ];
  if (description) lines.push(`<meta property="og:description" content="${escapeAttr(description)}" />`);
  if (imageUrl) lines.push(`<meta property="og:image" content="${escapeAttr(imageUrl)}" />`);
  if (pageUrl) lines.push(`<meta property="og:url" content="${escapeAttr(pageUrl)}" />`);
  lines.push(`<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}" />`);
  lines.push(`<meta name="twitter:title" content="${escapeAttr(pageTitle)}" />`);
  if (description) lines.push(`<meta name="twitter:description" content="${escapeAttr(description)}" />`);
  if (imageUrl) lines.push(`<meta name="twitter:image" content="${escapeAttr(imageUrl)}" />`);
  return lines.map((line) => "  " + line).join("\n");
}

function main() {
  const base = siteUrl();
  const settings = JSON.parse(readFileSync(join(ROOT, "content/settings.json"), "utf8"));
  const preview = settings.social_preview || {};
  const siteName = settings.band_name || "Pink Party Girls";
  const description = preview.description || "";
  const imageUrl = absoluteUrl(base, preview.image);

  // Build in a scratch dir outside the repo first — cpSync refuses to copy a
  // directory into its own subdirectory, which _site would be.
  const scratch = mkdtempSync(join(tmpdir(), "ppg-site-"));
  cpSync(ROOT, scratch, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(ROOT.length + 1);
      if (!rel) return true;
      const top = rel.split("/")[0];
      return !EXCLUDE.has(top);
    },
  });

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  cpSync(scratch, OUT, { recursive: true });
  rmSync(scratch, { recursive: true, force: true });

  const marker = /<!-- OG:START[\s\S]*?<!-- OG:END -->/;

  for (const { file, url, dir } of PAGES) {
    const full = join(OUT, file);
    if (!existsSync(full)) {
      console.warn(`skip ${file}: not found in _site`);
      continue;
    }
    let html = readFileSync(full, "utf8");
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1] : siteName;
    const pageUrl = absoluteUrl(base, url);
    const block = buildOgBlock({ siteName, pageTitle, description, imageUrl, pageUrl });
    const replacement =
      "<!-- OG:START — generated by scripts/inject-og.mjs from content/settings.json, do not edit by hand -->\n" +
      block +
      "\n  <!-- OG:END -->";

    if (marker.test(html)) {
      html = html.replace(marker, replacement);
    } else {
      html = html.replace(/<\/title>/i, `</title>\n  ${replacement}`);
    }
    writeFileSync(full, html);

    // Pretty URL: about.html -> about/index.html (homepage stays put).
    if (dir) {
      const dirPath = join(OUT, dir);
      mkdirSync(dirPath, { recursive: true });
      renameSync(full, join(dirPath, "index.html"));
    }
  }

  console.log(`OG tags injected for ${PAGES.length} pages.`);
  console.log(`Site URL: ${base || "(none — add a CNAME file or set GITHUB_REPOSITORY)"}`);
  console.log(`Preview image: ${imageUrl || "(none set in content/settings.json → social_preview.image)"}`);
  console.log(`Pretty URLs: ${PAGES.filter((p) => p.dir).map((p) => p.url).join(", ")}`);
}

main();
