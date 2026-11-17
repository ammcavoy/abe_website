# CLAUDE.md

Static artist portfolio (Abe Weston, to become abeweston.com) on GitHub Pages. There's no build step and no backend: content is JSON in the repo, edited through `admin.html`, which commits directly to `main` via the GitHub API.

## Documentation lives in the Obsidian vault
`../Website Vault/` (the parent folder) holds the full docs. Read `Website Vault/Session Guide.md` first, then `Website Vault/Sites/abeweston.com.md` and the relevant note under `Website Vault/Framework/`. Bugs and ideas are tracked in `Website Vault/Known Issues.md` and `Website Vault/Backlog.md`. Update the vault when behavior changes.

## Key rules
- **Run `git pull` before editing.** The admin page pushes content commits straight to `main` on GitHub, so the local clone is usually behind.
- Pushing to `main` deploys the live site. There's no CI or preview.
- `site-config.json` pins the site name and the GitHub repo the admin may write to. The admin only accepts fine-grained tokens scoped to that repo and refuses to write `.js`/`.html`/`.css`, `site-config.json`, `CNAME` or `scripts/`.
- Tabs with `"itemType": "artwork"` hold single-image pieces (`image`, `year`, `dimensions`, `medium`, `sold`, `price`); tabs without it use the original adventure shape. Keep both shapes compatible with `content-loader.js` (reader) and `content-manager.js` / `admin.js` (writers).
- Framework code is duplicated in `../website` and `../maria_website`. Note any fix that should be ported there.
- To serve locally: `python3 -m http.server 8000` (`fetch` doesn't work from `file://`). The local admin page still writes to the real repo.
- Never write GitHub tokens or personal contact info into files.
