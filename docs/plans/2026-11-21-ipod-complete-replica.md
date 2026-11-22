# iPod Classic Complete Replica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Black Chrome iPod player into an ultra-authentic iPod Classic OS replica featuring 3D Cover Flow, full menu hierarchy, Theme Switcher, Equalizer, Shuffle/Repeat, Lyrics, Sleep Timer, Retro Clock, Brick mini-game, and Idle Screen Saver.

**Architecture:** 
- Modular vanilla JavaScript, HTML5 Audio + Web Audio API (`AudioContext`, `BiquadFilterNode` cascade for 5-band EQ), Canvas for 2D Brick game, and hardware-accelerated CSS 3D transforms for 3D Cover Flow.
- State-driven navigation system with transition animation classes (`slide-left`, `slide-right`), breadcrumb stack, and event-driven Click Wheel physics routing (Menu navigation, Cover Flow scrubbing, Volume adjustment, and Paddle control).
- Multi-theme CSS architecture with data-theme or root class switches (`theme-black-chrome`, `theme-classic-white`, `theme-u2-edition`, `theme-space-gray`).

**Tech Stack:** HTML5, CSS3 3D Transforms, Web Audio API, HTML5 Canvas, Vanilla JS (ES6+), FontAwesome 6 icons.

**Spec:** User provided 3 screenshots outlining the feature list (Music Library, Playlists, 3D Cover Flow, Equalizer, Shuffle, Repeat, Volume Wheel, Lyrics, Sleep Timer, Theme Switcher, Screen animations, Click Sound, Screen Saver, and iPod Classic OS Menu Hierarchy).

---

## Global Constraints
- Standalone zero-dependency vanilla JS/CSS/HTML running locally in browser (`c:\Users\ASUS\OneDrive\Desktop\ipod-player\index.html`).
- Preservation of existing volume HUD, mechanical click sounds, and local MP3 upload functionality.
- Performance: smooth 60fps animations on screen LCD (2.5 inch aspect ratio container).

---

## Task Decomposition

### Task 1: Multi-Theme Styling Architecture
- **Files:** `style.css`, `index.html`, `app.js`
- **Deliverable:** 4 swappable themes:
  1. `theme-black-chrome`: Sleek glossy black faceplate, chrome rim, silver center button.
  2. `theme-classic-white`: Iconic 2001-2007 glossy white faceplate, matte gray wheel, white center button.
  3. `theme-u2-edition`: Fifth-gen U2 Special Edition: jet black faceplate, bright red click wheel, chrome back.
  4. `theme-space-gray`: Anodized matte space gray aluminum with black click wheel.
- Persist theme choice in `localStorage`.

### Task 2: Hierarchical Menu System & Slide Animations
- **Files:** `app.js`, `style.css`, `index.html`
- **Deliverable:** Expand `MENUS` tree to support:
  - `main`: Now Playing, Music, Videos, Photos, Extras, Settings, Shuffle Songs.
  - `music`: Cover Flow, Playlists, Artists, Albums, Songs.
  - Sub-menus with smooth slide-in (`slide-left`) and slide-out (`slide-right`) transitions.
  - Dynamic breadcrumb header title update.

### Task 3: 3D Cover Flow View
- **Files:** `index.html`, `style.css`, `app.js`
- **Deliverable:**
  - CSS 3D carousel container with `perspective`, `transform-style: preserve-3d`, dynamic `rotateY` angles, and floor reflection.
  - Click Wheel rotary control steps through albums left and right with snappy cover transitions and click sounds.
  - Center button selects and plays the highlighted album track, switching to Now Playing.

### Task 4: Web Audio API Equalizer & Audio Modes (Shuffle / Repeat)
- **Files:** `app.js`, `index.html`, `style.css`
- **Deliverable:**
  - Connect `audioEngine` to Web Audio API `AudioContext` with low-shelf, peaking, and high-shelf filters.
  - 6 Presets: Off/Flat, Bass Booster, Rock, Pop, Vocal, Electronic.
  - Shuffle mode toggle and Repeat mode (Off -> All -> One) with indicator badges in status bar.

### Task 5: Interactive Lyrics & Sleep Timer
- **Files:** `index.html`, `style.css`, `app.js`
- **Deliverable:**
  - Lyrics view with synced/scrollable lines and retro glow typography.
  - Pressing Center Button on Now Playing cycles between Track Info, Scrubber, and Lyrics.
  - Sleep timer modal (Off, 15m, 30m, 45m, 60m) with live countdown in status bar and 5s audio fade-out.

### Task 6: Extras: Retro Clock & Brick Breakout Canvas Mini-Game
- **Files:** `index.html`, `style.css`, `app.js`
- **Deliverable:**
  - Real-time digital clock with working stopwatch.
  - Authentic 2D Brick Breakout game on `<canvas>` rendered inside LCD screen:
    - Paddle controlled via Click Wheel rotation!
    - Ball physics, breakable bricks, score counter, sound effects, lives.

### Task 7: Screen Saver & Videos / Photos View
- **Files:** `index.html`, `style.css`, `app.js`
- **Deliverable:**
  - Idle detector (45s of inactivity): shows retro floating clock / monochrome Apple logo screensaver. Any input dismisses it.
  - Videos view: Embedded retro music video clip player with iPod playback controls.
  - Photos view: Gallery grid and slideshow viewer.

### Task 8: Verification & Polish
- **Deliverable:** End-to-end testing of Click Wheel gestures across all views, keyboard navigation, theme switching, equalizer fidelity, and commit to Git.
