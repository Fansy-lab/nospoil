<img src="icons/icon-128.png" width="96" alt="NoSpoil icon">

# NoSpoil

A browser extension for Chrome and Firefox that blocks anything on a page that mentions one of your keywords. Add the name of a show, a match, a person or anything else you don't want to see, and every post, headline, video tile or image that mentions it is blurred or hidden.

Everything runs locally in your browser. Your keywords are stored on your device and nothing is sent anywhere.

## Install

NoSpoil is not in the browser stores yet, so you install it from this folder.

First get the files: click **Code → Download ZIP** on GitHub and unzip it, or clone the repository with git.

### Chrome, Edge, Brave and other Chromium browsers

1. Open `chrome://extensions` (in Edge: `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the NoSpoil folder.
4. Pin NoSpoil to the toolbar from the puzzle-piece menu so the icon is easy to reach.

Chrome may show a warning about `browser_specific_settings`. That key is only used by Firefox and the warning can be ignored.

### Firefox (version 109 or newer)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**
3. Choose the `manifest.json` file inside the NoSpoil folder.

Firefox removes temporary add-ons when it restarts, so you need to repeat these steps after each restart. A permanent install needs a version signed by Mozilla.

## Use

1. Click the NoSpoil icon in the toolbar.
2. Type your keywords in the box, one keyword or phrase per line.
3. That's it. Changes are saved as you type and apply to open tabs straight away.

Matching ignores upper and lower case, so `dune` also blocks "Dune" and "DUNE".

### Options

| Option | What it does |
| --- | --- |
| **Enabled** | Turns all blocking on or off without losing your keywords. |
| **Blur (click to reveal)** | Blurs matching content. This is the default. |
| **Hide completely** | Removes matching content from the page as if it was never there. |
| **Match whole words only** | `cat` blocks "cat" but not "category". Off by default. |

### Revealing something

In blur mode, click a blurred item. A panel appears on top of it asking whether to reveal it:

- **Reveal** shows the content.
- **Keep hidden**, the Escape key, or a click anywhere else leaves it blurred.

Revealed content stays visible until the page is reloaded.

## What gets blocked

NoSpoil looks at the visible text of the page and at image descriptions, link titles and accessibility labels. It keeps watching as the page changes, so content loaded while you scroll is covered too.

When it finds a keyword it blocks the surrounding item rather than only the word: the whole post, list entry, table row or video tile, including its thumbnail.

Text you type yourself (search boxes, forms, editors) is never blocked.

## Limitations

- A phrase broken up by formatting can be missed, for example when one word of it is bold.
- Matching content can flash for a moment while a page is first loading.
- Keywords that only appear in a web address or in the tab title are not blocked.
- Text drawn inside images or video is not read.
- Some embedded widgets use a closed part of the page that extensions cannot inspect.

## Development

There is no build step. The extension is plain JavaScript.

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3, shared by Chrome and Firefox). |
| `content.js` | Scans pages, blocks matches and shows the reveal prompt. |
| `content.css` | Blur and hide styles. |
| `popup.html`, `popup.js` | The settings popup. |
| `icons/` | Toolbar and store icons. |
| `scripts/make_icons.py` | Regenerates the icons: `python3 scripts/make_icons.py icons`. |

After changing a file, press the reload button for NoSpoil on the extensions page and refresh any open tabs.
