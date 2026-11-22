# iPod Classic Simulator Interactive Music Player Enhancement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the iPod Classic Simulator into a fully interactive music player web application featuring hierarchical menu navigation, multi-input Click Wheel physics, full music library categorization (Artists/Albums/Playlists), local MP3 upload with drag-and-drop, full playback controls (Shuffle & 3 Repeat modes), 3D Cover Flow, Web Audio API real-time Music Visualizer, and persistent state & audio storage via localStorage and IndexedDB, keeping the U2 Special Edition identity as the default.

**Architecture:**
- **UI / Chassis Layer:** Skeuomorphic U2 Special Edition iPod Classic chassis (black faceplate, crimson red click wheel, mirror chrome bezel, 2.5" LCD screen).
- **Navigation State Machine:** Deep hierarchical menu tree with dynamic sub-menu generation (Artists -> Artist Tracks, Albums -> Album Tracks, Playlists -> Playlist Tracks), navigation breadcrumbs, and smooth slide transitions.
- **Audio & Visualizer Engine:** HTML5 Audio + Web Audio API (`AudioContext`, 5-band `BiquadFilterNode` EQ, and `AnalyserNode` for live FFT frequency and waveform rendering on `<canvas>`).
- **Input Dispatcher:** Unified rotary gesture handler with pointer capture supporting mouse drag, touch gestures, keyboard navigation, and mouse scroll wheel.
- **Storage Layer:** `localStorage` for user preferences and player state; `IndexedDB` (`iPodClassicDB`) for storing local audio files as Blobs so uploaded songs persist across browser refreshes.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5 Audio & Canvas, Web Audio API, IndexedDB, CSS3 3D Transforms, FontAwesome 6.

---

## Global Constraints
- Primary identity is U2 Special Edition (`theme-u2-edition`: Jet black chassis, Crimson Red Click Wheel, chrome rim) as the default theme.
- All existing features (volume HUD, click sounds, brick game, clock, screensaver) must remain fully functional.
- Zero external build dependencies (runs directly by opening `index.html` in any modern web browser).

---

## Task Decomposition

### Task 1: Default U2 Special Edition Identity & Visualizer View Scaffolding
- **Files:** `index.html`, `style.css`, `app.js`
- Set default theme to `theme-u2-edition` on first load in HTML and JS.
- Add `#view-visualizer` in `index.html` with canvas for real-time FFT frequency spectrum and waveform.
- Style visualizer screen with retro phosphor green / neon cyan CRT aesthetics.

### Task 2: Real-Time Web Audio API Analyser Visualizer Engine
- **Files:** `app.js`, `style.css`
- Connect `audioEngine` -> `AnalyserNode` (fftSize: 128 / 64 bins) -> EQ cascade -> `destination`.
- Implement dynamic visualizer render loop:
  - 32 animated equalizer spectrum bars bouncing in real-time to the actual music frequency data.
  - Waveform oscilloscope overlay.
  - Wire visualizer into `Now Playing` mini equalizer bars as well.

### Task 3: Deep Hierarchical Menu Navigation (Artists, Albums, Playlists)
- **Files:** `app.js`
- Expand `MENUS` with dynamic submenus:
  - `artists` -> click artist opens list of songs by that artist -> click song plays it!
  - `albums` -> click album opens list of songs on that album -> click song plays it!
  - `playlists` -> click playlist opens list of songs in that playlist -> click song plays it!
  - `music` -> adds "Visualizer" entry to easily launch the full-screen visualizer!
- Support deep `menuHistory` stack back-navigation via `btn-menu` and `Escape`.

### Task 4: Complete Playback Controls (Shuffle & 3-State Repeat)
- **Files:** `app.js`, `index.html`
- Implement 3-state Repeat: `Off` -> `Repeat All` -> `Repeat One`.
- Implement Shuffle: randomizes track order with unplayed tracking.
- Handle `audioEngine` `ended` event accurately:
  - `Repeat One`: rewinds track to 0 and replays immediately.
  - `Repeat All`: loops back to track 0 after last song.
  - `Shuffle`: selects random next song.
  - `Off`: plays sequentially and stops at end of playlist.
- Update status bar badges (`#status-shuffle-icon`, `#status-repeat-icon`).

### Task 5: Robust Click Wheel Multi-Input Support (Mouse, Touch, Keyboard)
- **Files:** `app.js`, `style.css`
- Ensure `touch-action: none;` and coordinate handling for mobile / touchscreen users.
- Refine degree angle tracking (`DEGREE_STEP`) and velocity.
- Comprehensive keyboard mapping (Arrows, Enter, Escape, Space, `+`/`-`, `[`/`]`).
- Mouse wheel scroll anywhere over device.

### Task 6: 3D Cover Flow Carousel Polish
- **Files:** `app.js`, `style.css`
- Ensure Cover Flow updates dynamically whenever new tracks or local files are added.
- Smooth card scaling, dynamic angles (`55deg`), floor reflection, and snappy selection via center button.

### Task 7: Local MP3 File Import & Drag-and-Drop
- **Files:** `index.html`, `app.js`, `style.css`
- Support drag-and-drop of MP3 audio files onto the iPod chassis or screen.
- Auto-extract filename into clean title and artist.
- Instantly add to active playlist, trigger playback, and refresh all menus (All Songs, Artists, Albums, Cover Flow).

### Task 8: Persistence Engine (localStorage & IndexedDB for Audio Blobs)
- **Files:** `app.js`
- Create `iPodClassicDB` in IndexedDB (object store: `uploaded_songs`).
- Save uploaded audio blobs and metadata in IndexedDB.
- On initialization, retrieve stored audio files, restore `URL.createObjectURL(blob)` into `playlist`.
- Save volume, theme, repeat mode, shuffle state, EQ preset, and click sound setting in `localStorage`.
- Restore all preferences on page load.

### Task 9: Verification & Testing
- Test in browser: verify U2 theme, menu navigation, touch/mouse wheel, audio playback, visualizer animation, file upload, and persistence across page refreshes.
- Commit all changes to Git.
