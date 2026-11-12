# Landing page

A single static page: `index.html`, `style.css`, the fonts in `fonts/` (SIL Open Font License, see the `OFL-*.txt` files), and the
mark in `assets/`. There is no build step.

The board in the mockups is drawn in the page itself (an SVG `<symbol>`); it is not taken from any board maker.

## Preview

```sh
python3 -m http.server -d site 8000     # then open http://localhost:8000
```

## Publishing

`.github/workflows/pages.yml` publishes this folder with GitHub Pages whenever `site/` changes on `main`. Turn it on once under
**Settings > Pages > Build and deployment > Source: GitHub Actions**. Links on the page are relative, so it works at
`https://<owner>.github.io/<repo>/` without changes. The social preview image URL in `index.html` (`og:image`) and the GitHub links
point at `N3rdL0rd/slackboard`; change them if the repository lives elsewhere.
