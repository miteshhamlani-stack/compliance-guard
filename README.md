# Compliance Guard

A client-side mutual fund marketing and compliance checker built with React,
TypeScript, and Vite.

## Local development

```bash
npm ci
npm run dev
```

The local Vite server provides the portal at `http://localhost:5173/` and
Compliance Guard at `http://localhost:5173/compliance-guard/`. To test
Document Reconciler as well, start its Vite server in a second terminal:

```bash
cd apps-portal/document-reconciler-app
npm ci
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://localhost:5174/document-reconciler/` (or use its link on the
local portal home). Do not open the app's HTML files directly with `file://`;
Vite must serve them over HTTP for routes and assets to work.

The checker loads its rules from `public/rules.json`. If the file cannot be
loaded, it uses the bundled ruleset.

## Deploy to GitHub Pages

The workflow at `.github/workflows/deploy.yml` builds and deploys the
site when changes are pushed to `main`, after the scheduled rules metadata
workflow completes, or when manually dispatched.

For the repository
[`miteshhamlani-stack/compliance-guard`](https://github.com/miteshhamlani-stack/compliance-guard):

1. Push this project to the repository's `main` branch.
2. In **Settings → Pages**, set the build and deployment source to **GitHub
   Actions**.
3. Check **Actions** for the `Deploy Compliance Guard to GitHub Pages` workflow.

The production build uses the `/compliance-guard/` base path, while local Vite
development continues to use `/`. The deployed site should be available at
`https://miteshhamlani-stack.github.io/compliance-guard/` after a successful
workflow run.

The rules sync workflow records metadata from configured source pages. It does
not automatically interpret circulars or change legal rules; regulatory
content changes still require review.
