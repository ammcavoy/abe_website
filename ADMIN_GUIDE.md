# Admin Guide

The admin page (`/admin.html`) edits the site's content and commits it straight to the `ammcavoy/abe_website` repository on GitHub. GitHub Pages redeploys within a few minutes.

## One-time setup: a fine-grained GitHub token

The admin page only accepts **fine-grained** personal access tokens, and only ones restricted to this single repository. Classic tokens (`ghp_…`) are rejected because they grant access to every repository on the account.

1. Open https://github.com/settings/personal-access-tokens/new
2. **Token name**: "abe_website admin" (anything you like)
3. **Expiration**: pick a date (90 days or 1 year). You will paste a new token when it expires.
4. **Resource owner**: `ammcavoy`
5. **Repository access**: **Only select repositories** → choose `abe_website`
6. **Permissions → Repository permissions → Contents: Read and write**. Leave everything else at "No access". (GitHub adds Metadata: read automatically.)
7. Generate the token and copy it. It starts with `github_pat_`.
8. Open the admin page, paste the token, click **Save Token**. The page checks that the token has write access to `ammcavoy/abe_website` and to nothing else, then shows "✓ Connected".

The token is stored in your browser's localStorage only. Revoke it at any time at https://github.com/settings/personal-access-tokens.

## Managing artworks

Each series (Techno, Sailing, Portraits) is a tab. Open **Manage Portfolio**, then click **Manage pieces** next to the series:

- **Create New**: fill in Item ID (lowercase, hyphens; also used as the image file name), Title, Year, Width/Height/Unit, Medium, Sold, optional Price, optional Date created and Description, and choose one image. **Save to GitHub** uploads the image as `<tab>/<id>.<ext>` and updates `<tab>/<tab>.json` in one commit.
- **Edit Existing**: pick a piece, change fields, optionally choose a replacement image, save.
- **Delete This Item** removes the entry and its image file.

## Managing tabs

Under **Manage Portfolio → Edit settings** each tab has an Item Type (Artwork or Adventure), a Description (the artist statement shown above the grid; blank lines become paragraph breaks) and, for artwork tabs, a **Cover Artwork** chosen from that tab's existing pieces. Saving writes `tabs-config.json`.

## Home and About pages

**Edit Home Page** sets the two featured artworks (one beside the tagline, one below it), the tagline and contact details, plus the contact page's image (decorative, shown beside the form) and intro text.

**Edit About Page** holds the About photo collection (click one to show it beside the text; up to two stack) and the about text and background lines. Both tabs save to the same `home-config.json`.

## Contact form (one-time setup)

The site is static, so the contact form needs a small relay service to deliver mail. Until one is configured the form falls back to opening the visitor's own email app with the message pre-filled, which works but is less convenient.

Recommended: [Formspree](https://formspree.io) (free tier is enough for a portfolio).

1. Sign up with Abe's email (or your own, then set Abe's address as the form's recipient).
2. Create a new form. Copy its endpoint, which looks like `https://formspree.io/f/abcdwxyz`.
3. In the repo, set `contact.endpoint` in `site-config.json` to that URL and push. (This file is intentionally not editable from the admin page.)
4. Submit a test message from `/contact.html`. The first submission may ask the recipient to confirm their email address.

The form posts JSON with these fields: `firstName`, `lastName`, `name`, `email`, `phone` (optional), `subject`, `series`, `piece`, `pieceDetails`, `pieceUrl`, `message`, plus `_subject` (email subject line) and `_replyto` so replies go straight to the sender. A hidden `_gotcha` honeypot field filters bots. Any service that accepts a JSON POST and returns 2xx on success will work in place of Formspree.

## Troubleshooting

- *"Only fine-grained tokens are accepted"*: you pasted a classic token. Create a fine-grained one as above.
- *"Token does not have write access"*: the token's Contents permission is read-only, or it was created for a different repository.
- *"Token must be restricted to … only"*: the token was granted more than one repository. Create a new one with only `abe_website` selected.
- *"Blocked request outside the configured repository"*: something tried to write to another repo. The admin refuses this by design.
- Saves that fail partway through leave the repo untouched (everything goes into a single commit). Refresh and try again.
- Changes take a few minutes to appear; the browser may also cache JSON for up to 10 minutes.
