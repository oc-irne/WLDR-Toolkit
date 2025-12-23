// ==UserScript==
// @name         WLDR Toolkit - Logo Overhaul
// @namespace    https://github.com/oc-irne/WLDR-Toolkit/blob/main/README.md
// @version      0.0.1
// @updateURL    https://raw.githubusercontent.com/oc-irne/WLDR-Toolkit/refs/heads/main/WLDR%20Toolkit%20-%20Logo.user.js
// @downloadURL  https://raw.githubusercontent.com/oc-irne/WLDR-Toolkit/refs/heads/main/WLDR%20Toolkit%20-%20Logo.user.js
// @description  Replace logo
// @author       ocirne
// @match        https://app.dev.welder.nl/*
// @match        https://app.test.welder.nl/*
// @match        https://salesdemo.dev.welder.cloud/*
// @match        https://salesdemo.test.welder.cloud/*
// @match        https://screenshots.dev.welder.cloud/*
// @match        https://screenshots.test.welder.cloud/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const NEW_LOGO_SVG = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 546 356"
  class="wldr-logoicon"
  aria-hidden="true"
  style="height: 2.40625rem; width: auto;"
>
  <style>
    .s1wldrfulllogo { fill: var(--primary); }
  </style>
  <g>
    <path fill-rule="evenodd" class="s1wldrfulllogo"
      d="m247.94 253.13c14.7 36.75-2.94 79.41-39.71 95.58-36.77 14.7-79.41-2.94-94.12-39.71l-86.76-207.35c-14.7-38.23 2.95-80.88 39.7-95.58 36.76-14.71 79.42 2.94 94.13 39.71zm180.87 1.48c14.72 36.76-2.94 79.41-39.7 94.12-36.78 16.17-79.41-1.48-94.13-38.23l-86.76-208.83c-16.17-36.77 1.47-79.41 39.72-94.12 36.75-16.18 79.42 1.46 94.11 38.23zm110.29-160.3c14.72 38.23-2.94 79.41-39.7 94.12-38.25 16.17-79.41-2.95-95.6-39.72l-19.11-47.05c-3.55-8.88-5.3-18.37-5.15-27.93 0.15-9.56 2.21-18.99 6.04-27.75 3.83-8.76 9.36-16.67 16.28-23.27 6.91-6.6 15.07-11.75 24-15.17 36.78-16.17 79.41 2.94 94.14 39.71z"
    />
    <path fill-rule="evenodd" class="s1wldrfulllogo"
      d="m365.83 273.93l49.87-20.65c6.12-2.54 13.14 0.37 15.68 6.49l20.66 49.87c2.53 6.12-0.38 13.14-6.5 15.68l-49.87 20.66c-6.12 2.53-13.14-0.38-15.68-6.5l-20.65-49.87c-2.54-6.12 0.37-13.14 6.49-15.68z"
    />
    <path fill-rule="evenodd" class="s1wldrfulllogo"
      d="m9.83 29.93l49.87-20.65c6.12-2.54 13.14 0.37 15.68 6.49l20.66 49.87c2.53 6.12-0.38 13.14-6.5 15.68l-49.87 20.66c-6.12 2.53-13.14-0.38-15.68-6.5l-20.65-49.87c-2.54-6.12 0.37-13.14 6.49-15.68z"
    />
  </g>
</svg>
`;

  function replaceLogo() {
    const anchor = document.querySelector('a.navbar-logo');
    if (!anchor) return;

    // Prevent double replacement
    if (anchor.querySelector('svg.wldr-logoicon')) return;

    const img = anchor.querySelector('img[src="/company/logo.svg"]');
    if (!img) return;

    img.remove();
    anchor.insertAdjacentHTML('afterbegin', NEW_LOGO_SVG);
  }

/* -----------------------------
 * Favicon replacement
 * ----------------------------- */
function setFavicon() {
  const svgDataUrl =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      NEW_LOGO_SVG
        .replace(/<style>[\s\S]*?<\/style>/g, '') // strip <style> (CSS vars break favicons)
        .replace(/\n+/g, '')                     // remove newlines
        .trim()
    );

  // Remove existing favicons
  document.querySelectorAll('link[rel*="icon"]').forEach(el => el.remove());

  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = svgDataUrl;

  document.head.appendChild(link);
}


  // Initial run
  replaceLogo();
      setFavicon();

  // Observe SPA DOM changes
  const observer = new MutationObserver(replaceLogo);
  observer.observe(document.body, { childList: true, subtree: true });
})();
