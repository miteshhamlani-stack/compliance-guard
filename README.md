# Compliance Guard

A client-side mutual fund marketing and compliance checker built with React,
TypeScript, and Vite.

## Local development

```bash
npm ci
npm run dev
```

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

The production build and local Vite development both use the site root so the
Apps Portal and its client-side tools are available on the configured custom
domain, `https://apps.sbisif.com/`, after a successful workflow run.

## Document Reconciler

Open `/document-reconciler` to compare a lead document with locally parsed
addendums. PDF, DOCX, TXT, and Markdown files are processed in the browser;
parsed document text, custom circulars, and review decisions are stored in
browser local storage. Approved drafts can be exported as DOCX files with a
CSV audit trail.

The parser keeps all text it extracts and does not OCR image-only PDF pages.
Review the parsed preview, especially for scanned PDFs, before relying on an
export.

The rules sync workflow records metadata from configured source pages. It does
not automatically interpret circulars or change legal rules; regulatory
content changes still require review.
