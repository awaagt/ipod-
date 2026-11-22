# iPod Classic 7 Ultimate Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the iPod Classic U2 Edition into a museum-grade simulator by implementing all 7 requested features:
1. Pure Client-side ID3 Tag & Embedded Cover Art Extractor
2. Physical Top HOLD Switch (interlocking controls with orange lock indicator)
3. Classic White 3.5mm Earphone Cable with Auto-Pause on Unplug
4. 3D Flip iPod Chassis showing Mirror Chrome Stainless Steel Backplate with Engraved U2 Signatures
5. Retro "Music Quiz" (Kuis Tebak Lagu) Game with Snippet Playback & Timed Multiple Choice
6. Custom Playlist Creator (create playlists, assign MP3s, saved in storage)
7. Progressive Web App (PWA) with manifest, service worker, and desktop installability

**Architecture:**
- **Zero-Dependency Pure Frontend:** Vanilla JS, CSS3 3D Transforms, Web Audio API, Canvas, IndexedDB.
- **3D Card Flip Mechanism:** Wrapper `<div class="ipod-3d-wrapper" id="ipod-flipper">` containing front face (`ipod-front`) and back face (`ipod-back`) with `transform-style: preserve-3d` and `rotateY(180deg)`.
- **Embedded Binary ID3 Parser:** In-memory ArrayBuffer parser detecting ID3v2 tags (TIT2, TPE1, TALB, APIC) to extract embedded JPEG/PNG album artwork as Blobs.
- **Game Engine & Audio Snippet Engine:** Music Quiz controller driving random snippet playback, countdown timer, and wheel-based answer selection.

---

## Tasks

### Task 1: 3D Flip Chassis & Mirror Chrome Backplate with U2 Signatures
- [x] In `index.html`: Wrap `.ipod-chassis` in `#ipod-flipper` container. Add `.ipod-back` element with engraved Apple logo, specs, and U2 signatures (Bono, The Edge, Adam Clayton, Larry Mullen Jr.). Add toolbar flip button.
- [x] In `style.css`: Add 3D perspective flip rules, mirror chrome radial gradient, specular glare, and laser-engraving styles.
- [x] In `app.js`: Add `toggleIpodFlip()` function.

### Task 2: Physical HOLD Switch & Control Interlocking
- [x] In `index.html`: Add top panel hardware with `#hold-switch` and orange indicator strip. Add `#status-hold-icon` in status bar.
- [x] In `style.css`: Style top hardware bezel, recessed slider slot, orange accent, and padlock status.
- [x] In `app.js`: Implement `toggleHoldSwitch()`. When locked, intercept and block all wheel rotation, center clicks, and keyboard inputs with dull feedback.

### Task 3: 3.5mm Headphone Jack & Earphone Cable with Auto-Pause
- [x] In `index.html`: Add 3.5mm headphone port on top panel with pluggable classic white Apple earphone cable.
- [x] In `style.css`: Style 3.5mm jack bezel, headphone plug, rubber boot, and white cord.
- [x] In `app.js`: Add `toggleHeadphones()`: unplugging pauses audio automatically with screen toast notice; plugging back in resumes or confirms connection.

### Task 4: Client-side ID3 Tag & Embedded Cover Art Extractor
- [x] In `app.js`: Implement `extractID3Tags(file)` using `FileReader.readAsArrayBuffer` to parse ID3v2 frames (TIT2, TPE1, TALB, APIC).
- [x] Convert APIC binary payload to `Blob` and `URL.createObjectURL(blob)`.
- [x] Save cover image Blob in IndexedDB alongside audio.
- [x] Update `handleUploadedFiles()` to utilize real extracted title, artist, album, and embedded artwork for Cover Flow and Now Playing.

### Task 5: Retro "Music Quiz" Game
- [x] In `index.html`: Add `#view-quiz` in `.lcd-screen` with snippet progress bar, round counter, score badge, and 4 option buttons.
- [x] In `style.css`: Style Music Quiz retro TV show aesthetic.
- [x] In `app.js`: Implement `startMusicQuiz()`, snippet playback (plays 8s from random timestamp), 4 choices generated from library, wheel selection, timer countdown, and scoring.
- [x] Add "Music Quiz" into `Extras > Games` menu hierarchy.

### Task 6: Custom Playlist Creator & Management
- [x] In `app.js`: Add `createCustomPlaylist()`, `addTrackToPlaylist()`, and save to `localStorage`.
- [x] In `Playlists` menu: add "+ Buat Playlist Baru..." option with interactive naming and song selection.
- [x] Allow removing songs or deleting custom playlists.

### Task 7: PWA (Progressive Web App) Desktop Installation
- [x] Create `manifest.json` with standalone display, theme colors, and icons.
- [x] Create `sw.js` (Service Worker) for asset caching.
- [x] In `index.html`: link manifest and add "Install App" pill button in toolbar.
- [x] In `app.js`: register service worker and handle `beforeinstallprompt`.

### Task 8: Verification, Git Commit & Launch
- [x] Verify all 7 features work seamlessly without regressions.
- [x] Commit all changes to Git.
- [x] Launch in browser and deliver detailed walkthrough.
