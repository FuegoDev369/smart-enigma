# Smart Enigma

A client-side, offline encryption tool with real AES-256-GCM, air-gap transfer (QR code, data-over-sound), and file support — nothing ever leaves your browser.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)
![Version](https://img.shields.io/badge/version-5.1.0-blue)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
![SMART-ENIGMA](https://img.shields.io/badge/SMART--ENIGMA-AABBCC?logo=github&logoColor=white)

![Interface Screenshot](https://res.cloudinary.com/dn7ivwhlw/image/upload/v1783340532/projects/smart-enigma.png)

## Features

- 🔒 **Real AES-256-GCM encryption** via the native Web Crypto API (PBKDF2, 600,000 iterations, random salt + IV per message)
- 🕵️ **Zero network calls** — no analytics, no tracking, no external fonts or CDNs, strict CSP
- 🌍 **9 languages** — English, French, Chinese, Spanish, Russian, German, Portuguese, Italian, Korean (auto-detected from the browser, loaded on demand)
- 🌗 **Light / dark theme** with system preference detection
- 🗝️ Key strength indicator and key fingerprint (SHA-256 safety number) to verify a shared key without revealing it
- ⚠️ Panic wipe — press Escape three times to instantly clear the key, message, result, and selected file
- 📁 **File encryption** — drag & drop or browse any file (up to 25 MB), original filename restored automatically on decryption
- 🗜️ **Optional LZSS compression** before encryption, with a homemade compressor (no library), falling back to raw storage when it wouldn't help
- 📱 **Air-gap transfer** — turn any ciphertext into a scannable **QR code** or an audible **FSK sound signal**, so it can cross to another device without ever touching a network
- 🧩 Optional legacy substitution cipher, clearly labeled as a demo (not secure) for educational comparison
- ♿ Accessible: keyboard navigation, `aria-live` regions, `prefers-reduced-motion` and `prefers-contrast` support
- 📴 Fully offline-capable — no install, no account, no server required to use the app
- 🗝️ Key is never stored or transmitted, and is wiped from memory when the tab closes

## Requirements

**To use the app:** any modern browser with Web Crypto API support (Chrome, Firefox, Safari, Edge — desktop or mobile). No build tools, no install, no server — just open `index.html`.

**To build from source or run tests:** Node.js 19+ (for native Web Crypto in tests) and npm.

## Project Structure

```
smart-enigma/
├── index.html                  # Entry point, loaded directly by the browser in dev
├── build.mjs                   # Dev server + production build (esbuild)
├── package.json
├── src/
│   ├── css/                    # 18 partials, imported by main.css
│   └── js/
│       ├── main.js             # App entry point, event wiring
│       ├── state.js            # Shared mutable app state
│       ├── dom.js               # All DOM references
│       ├── crypto/              # AES-256-GCM, legacy substitution cipher, buffer helpers
│       ├── compression/         # Homemade LZSS compressor
│       ├── qr/                  # Hand-written QR encoder + canvas renderer
│       ├── sound/               # FSK modem (data-over-sound)
│       ├── i18n/                # Translation orchestration + 9 locale files
│       ├── ui/                  # Toast, theme, clipboard
│       └── features/            # Text/file actions, key strength, fingerprint, panic wipe
└── tests/                       # node:test unit tests + manual regression checklist
```

## Installation

**Option 1 — Just use it, no install**

Download or clone the repo and open `index.html` directly in your browser. That's the entire installation.

**Option 2 — Clone the repo (for development)**

```bash
git clone https://github.com/fuegodev369/smart-enigma.git
cd smart-enigma
npm install
npm run dev
```

Then open `http://localhost:5173/`. A local dev server is required once you're working with the ES module source (`file://` blocks ES imports) — it isn't needed just to use the app.

**Option 3 — Download directly**

```bash
curl -L -o smart-enigma.zip https://github.com/fuegodev369/smart-enigma/archive/refs/heads/main.zip
unzip smart-enigma.zip
```

## Usage

Smart Enigma is a single-page app — there is no command line. Everything happens through the interface:

| Control | Description |
|---|---|
| Secret Key | The password used to derive your encryption key (never sent anywhere) |
| Max-Enigma toggle | Keep it **on** for real AES-256-GCM encryption (default and recommended) |
| Message box | The text you want to encrypt or decrypt |
| ENCRYPT | Encrypts the message with the current key |
| DECRYPT | Decrypts a previously encrypted message with the same key |
| CLEAR | Wipes the message and result (asks for confirmation) |
| Copy buttons | Copy the key or the result to your clipboard |
| Key strength meter | Local heuristic estimate of how strong your key looks |
| Key fingerprint | SHA-256 safety number to compare with the other party without revealing the key |
| Panic wipe | Press Escape three times to instantly clear key, message, result, and file |
| Language selector | Switch between 9 supported languages |
| Theme toggle | Switch between light and dark mode |
| File dropzone | Drag & drop, click to browse, or use the keyboard to select a file (max 25 MB) |
| Encrypt File | Encrypts the selected file and offers it for download as `filename.enigma` |
| Decrypt File | Decrypts a `.enigma` file and restores it under its original filename |
| Compress toggle | Runs LZSS compression on the file before encryption; shows the resulting savings |
| Generate QR Code | Turns the current output into a scannable QR code for air-gap transfer |
| Emit / Listen (sound) | Sends or receives the current output as an FSK audio signal between two devices |

## Interactive flow example

```
1. Enter a secret key, e.g.: correct-horse-battery-staple
2. Type your message: Meet me at the usual place, 9pm.
3. Keep "Max-Enigma (AES-256)" enabled.
4. Click ENCRYPT.

RESULT:
kR3n9F2vLxQ8mZaP1sT6wYb4cV7dJhN0gU5eK2iO...  (base64 blob)

5. Send this text to the recipient through any channel you like,
   or hand it over air-gapped via the QR code / sound buttons.
   They open the same page, enter the same key, paste the blob
   (or scan/listen), and click DECRYPT to recover the original message.
```

## Output example

The encrypted result is a single base64 string containing the random salt, the random IV, and the ciphertext — everything needed to decrypt except the key itself:

```
xN9m2QeR8pKzV3sLtY7bJ4cD1wA6gU0iO5hF2nE8...
```

Encrypting a file follows the same principle but produces a downloadable binary blob (`document.pdf.enigma`) instead of text. Decrypting it restores the original file under its original name.

## Default behavior

| Situation | Behavior |
|---|---|
| Max-Enigma toggle | ON by default (AES-256-GCM) |
| No key entered | Toast warning, action cancelled |
| No message entered | Toast warning, action cancelled |
| Wrong key on decrypt | "Decryption failed" toast, output cleared |
| Tab closed | Key field wiped from memory |
| Triple Escape press | Key, message, result, and file wiped instantly, no confirmation |
| Browser language unsupported | Falls back to English |
| System theme | Detected automatically on first load |
| File larger than 25 MB | Toast warning, file rejected |
| Wrong key on file decrypt | "Decryption failed" toast, no file produced |
| Compression toggle off, or compression doesn't help | Payload stored raw, 0% savings shown |
| Payload too long for a QR code | Clear error toast, no QR generated |

## Development

```bash
npm install       # installs esbuild + stylelint (dev only, zero runtime dependency)
npm run dev       # local dev server at http://localhost:5173/
npm run build     # production bundle in dist/
npm run lint:css  # stylelint against src/css/
npm test          # runs the unit test suite (node:test)
```

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/fuegodev369/smart-enigma). Keep the app dependency-free at runtime and offline-first.

## License

MIT © FuegoDev
