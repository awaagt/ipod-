# Black Chrome iPod Classic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, high-fidelity interactive web application simulating a Black Chrome iPod Classic with full Click Wheel physics, audio playback, synthesized mechanical click sounds, and local MP3 upload support.

**Architecture:** Client-side static single-page application using semantic HTML5, modern CSS3 skeuomorphic styling with chrome specular highlights, and pure vanilla JavaScript managing state machines for iPod OS menus, rotary Click Wheel gestures, and HTML5 Audio / Web Audio synthesis.

**Tech Stack:** HTML5, CSS3, Modern JavaScript (ES6+), Web Audio API, HTML5 Audio, Lucide / FontAwesome icons.

**Spec:** Black Chrome iPod Classic specification approved during brainstorming.

## Global Constraints
- Target directory: `c:\Users\ASUS\OneDrive\Desktop\ipod-player\`
- No external heavy runtime dependencies (zero npm build step needed; pure standalone browser app).
- Works 100% offline out-of-the-box.
- Rotary Click Wheel must support both discrete button clicking AND continuous circular mouse/touch dragging.
- Synthesized mechanical click sound must fire reliably on every scroll step.

## Review Focus
1. **Rotary angle calculation:** Circular wheel tracking must correctly handle 0-360 degree boundary wraps without jumping.
2. **Audio context initialization:** Web Audio API context must unlock on first user interaction without browser autoplay blocks.
3. **Local MP3 file handling:** Custom user-uploaded MP3 files must generate valid ObjectURLs and clean up safely on song change.
4. **Responsive scaling:** The iPod chassis must scale cleanly on desktop screens and mobile viewports.
5. **State transitions:** Pressing MENU from Now Playing must return to the active track's menu list, and pressing Center must toggle Now Playing.

---

### Task 1: Project Setup & HTML Chassis Structure
**Files:**
- Create: `c:\Users\ASUS\OneDrive\Desktop\ipod-player\index.html`

- [ ] Step 1: Create directory `c:\Users\ASUS\OneDrive\Desktop\ipod-player\` and subdirectories.
- [ ] Step 2: Write `index.html` containing:
  - iPod outer casing (`.ipod-chassis`)
  - Chrome metallic rim frame (`.chrome-bezel`)
  - LCD screen viewport (`.screen-container`) with:
    - Status bar (`.status-bar`) with title, play icon, and battery gauge
    - Menu view (`#view-menu`) with header and navigable list items
    - Now Playing view (`#view-player`) with album art container, title, artist, seekbar, and timestamps
  - Click Wheel (`.click-wheel`) with 4 perimeter buttons (MENU, PREV, NEXT, PLAY/PAUSE) and Center Select button (`.center-button`)
  - Hidden file input for uploading custom MP3s
  - Link to `style.css` and `app.js`
- [ ] Step 3: Verify HTML structure in browser.

### Task 2: CSS Styling - Black Chrome Skeuomorphism & iPod OS Interface
**Files:**
- Create: `c:\Users\ASUS\OneDrive\Desktop\ipod-player\style.css`

- [ ] Step 1: Implement realistic hardware styling:
  - Piano black front face with subtle vertical reflections
  - Mirror chrome stainless steel border with multi-layer box-shadows
  - Authentic matte dark-charcoal Click Wheel with crisp white labels
  - Tactile center button with radial metallic brush effect
- [ ] Step 2: Implement LCD display styling:
  - Classic iPod blue gradient header (`#0284c7` to `#0369a1`)
  - Dual-pane layout on widescreen / clean list view
  - Selected menu item highlighted with glossy blue band
  - Now Playing screen with album art drop-shadow, retro typography, and scrub bar
- [ ] Step 3: Implement tactile button press and rotary feedback animations.
- [ ] Step 4: Verify visual appearance matches the approved Black Chrome iPod design.

### Task 3: JavaScript Engine - Menu State Machine, Click Sound & Wheel Physics
**Files:**
- Create: `c:\Users\ASUS\OneDrive\Desktop\ipod-player\app.js`

- [ ] Step 1: Build the Web Audio API sound generator:
  - Procedural 1000Hz short bandpass click impulse simulating iPod's internal piezo speaker.
- [ ] Step 2: Build the menu state machine:
  - Hierarchical menu tree (Main Menu -> Music -> Playlists / All Songs / Now Playing / Upload).
  - Navigation handlers: Move up/down, Select, Back to parent menu.
- [ ] Step 3: Implement Rotary Wheel physics:
  - Calculate `Math.atan2(y, x)` relative to wheel center.
  - Track delta angles to trigger discrete scroll events every 15-20 degrees.
  - Trigger audio click sound on every scroll step.
- [ ] Step 4: Test menu navigation and click sound in browser.

### Task 4: Audio Playback Engine & Built-in Playlist
**Files:**
- Modify: `c:\Users\ASUS\OneDrive\Desktop\ipod-player\app.js`

- [ ] Step 1: Configure default royalty-free playlist with playable audio sources (procedural audio synthesizer + high-reliability audio samples).
- [ ] Step 2: Implement playback controls:
  - Play, Pause, Next, Previous track.
  - Progress bar updater and time formatters (`MM:SS`).
  - Seek scrub using wheel during playback.
  - Volume control via wheel in Now Playing screen.
- [ ] Step 3: Implement local MP3 file reader:
  - Handle `input[type=file]` change event, parse file names, create object URLs, and dynamically inject tracks into the playlist.
- [ ] Step 4: Test audio playback, track switching, and MP3 uploading.

### Task 5: Final Integration, Verification & User Launch
**Files:**
- Modify: `c:\Users\ASUS\OneDrive\Desktop\ipod-player\index.html`
- Modify: `c:\Users\ASUS\OneDrive\Desktop\ipod-player\style.css`
- Modify: `c:\Users\ASUS\OneDrive\Desktop\ipod-player\app.js`

- [ ] Step 1: Test all edge cases (rapid clicking, boundary wraps, empty playlists).
- [ ] Step 2: Ensure responsive scaling on various desktop and mobile viewports.
- [ ] Step 3: Launch the project in the user's browser.
