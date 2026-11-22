/* ==========================================================================
   IPOD CLASSIC U2 SPECIAL EDITION - COMPLETE INTERACTIVE MUSIC PLAYER
   Features:
   1. Real Deep Hierarchical Menu Navigation (Artists, Albums, Playlists, etc.)
   2. Rotary Click Wheel Physics (Mouse, Touchscreen, Keyboard, Mouse Scroll)
   3. Complete Music Library Categorization & Filtering
   4. Local MP3 File Import & Drag-and-Drop Upload
   5. Full Playback Engine: Play, Pause, Next, Prev, Shuffle, & 3-State Repeat
   6. Authentic 3D Cover Flow Carousel with Floor Reflection
   7. Real-Time Web Audio API Music Visualizer (Spectrum, Oscilloscope, Radial)
   8. Permanent Storage: localStorage for settings & IndexedDB for audio files
   ========================================================================== */

// --- 1. STORAGE & PERSISTENCE ENGINE (INDEXEDDB & LOCALSTORAGE) ---
const DB_NAME = 'iPodClassicDB';
const DB_VERSION = 1;
const STORE_NAME = 'uploaded_songs';

function openDatabase() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject("IndexedDB not supported");
            return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function saveCustomSongToDB(songData) {
    try {
        const db = await openDatabase();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.add(songData);
        return new Promise((resolve) => {
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = () => resolve(null);
        });
    } catch (err) {
        console.warn("Gagal menyimpan lagu ke IndexedDB:", err);
        return null;
    }
}

async function updateSongInDB(songId, updates) {
    if (!songId) return;
    try {
        const db = await openDatabase();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(songId);
        req.onsuccess = () => {
            const data = req.result;
            if (data) {
                Object.assign(data, updates);
                store.put(data);
            }
        };
    } catch (err) {
        console.warn("Gagal update lagu di IndexedDB:", err);
    }
}

// --- ID3 TAG PARSER (APIC EMBEDDED COVER ART, TIT2, TPE1, TALB, USLT LYRICS) ---
async function parseID3Tags(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        // Read first 512KB where ID3v2 header, APIC picture and USLT lyrics tag reside
        const slice = file.slice(0, 512 * 1024);
        reader.onload = function(e) {
            try {
                const buf = new Uint8Array(e.target.result);
                // ID3 header check: "ID3"
                if (buf.length < 10 || buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) {
                    resolve(null);
                    return;
                }
                const version = buf[3];
                // Syncsafe integer for tag length
                const tagSize = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
                const maxLen = Math.min(buf.length, 10 + tagSize);
                let pos = 10;
                let title = null, artist = null, album = null, coverUrl = null, lyrics = null;

                while (pos + 10 < maxLen) {
                    let frameId = "";
                    for (let c = 0; c < 4; c++) frameId += String.fromCharCode(buf[pos + c]);
                    if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

                    let frameSize = 0;
                    if (version === 4) {
                        frameSize = ((buf[pos+4] & 0x7f) << 21) | ((buf[pos+5] & 0x7f) << 14) | ((buf[pos+6] & 0x7f) << 7) | (buf[pos+7] & 0x7f);
                    } else {
                        frameSize = (buf[pos+4] << 24) | (buf[pos+5] << 16) | (buf[pos+6] << 8) | buf[pos+7];
                    }

                    if (frameSize <= 0 || pos + 10 + frameSize > buf.length) break;
                    const frameData = buf.subarray(pos + 10, pos + 10 + frameSize);

                    function decodeText(data) {
                        if (!data || data.length <= 1) return "";
                        const enc = data[0];
                        const textBytes = data.subarray(1);
                        try {
                            if (enc === 0) return new TextDecoder("latin1").decode(textBytes).replace(/\0+$/, "").trim();
                            if (enc === 1) return new TextDecoder("utf-16").decode(textBytes).replace(/\0+$/, "").trim();
                            if (enc === 2) return new TextDecoder("utf-16be").decode(textBytes).replace(/\0+$/, "").trim();
                            return new TextDecoder("utf-8").decode(textBytes).replace(/\0+$/, "").trim();
                        } catch(err) {
                            return "";
                        }
                    }

                    if (frameId === 'TIT2' && !title) {
                        title = decodeText(frameData);
                    } else if (frameId === 'TPE1' && !artist) {
                        artist = decodeText(frameData);
                    } else if (frameId === 'TALB' && !album) {
                        album = decodeText(frameData);
                    } else if (frameId === 'APIC' && !coverUrl) {
                        try {
                            const enc = frameData[0];
                            let mimeEnd = 1;
                            while (mimeEnd < frameData.length && frameData[mimeEnd] !== 0) mimeEnd++;
                            const mime = new TextDecoder("ascii").decode(frameData.subarray(1, mimeEnd)) || "image/jpeg";
                            let p = mimeEnd + 2; // skip null & picture type byte
                            if (enc === 1 || enc === 2) {
                                while (p < frameData.length - 1 && !(frameData[p] === 0 && frameData[p+1] === 0)) p += 2;
                                p += 2;
                            } else {
                                while (p < frameData.length && frameData[p] !== 0) p++;
                                p += 1;
                            }
                            if (p < frameData.length) {
                                const imgBytes = frameData.subarray(p);
                                const blob = new Blob([imgBytes], { type: mime });
                                coverUrl = URL.createObjectURL(blob);
                            }
                        } catch(e) {
                            console.warn("APIC parse error", e);
                        }
                    } else if (frameId === 'USLT' && !lyrics) {
                        try {
                            const enc = frameData[0];
                            let p = 4; // Skip encoding (1) and language (3)
                            if (enc === 1 || enc === 2) {
                                while (p < frameData.length - 1 && !(frameData[p] === 0 && frameData[p+1] === 0)) p += 2;
                                p += 2;
                            } else {
                                while (p < frameData.length && frameData[p] !== 0) p++;
                                p += 1;
                            }
                            if (p < frameData.length) {
                                const lyricBytes = frameData.subarray(p);
                                let rawLyrics = "";
                                if (enc === 0) rawLyrics = new TextDecoder("latin1").decode(lyricBytes);
                                else if (enc === 1) rawLyrics = new TextDecoder("utf-16").decode(lyricBytes);
                                else if (enc === 2) rawLyrics = new TextDecoder("utf-16be").decode(lyricBytes);
                                else rawLyrics = new TextDecoder("utf-8").decode(lyricBytes);

                                if (rawLyrics.includes("[") && rawLyrics.includes("]")) {
                                    lyrics = parseLRC(rawLyrics);
                                } else {
                                    const lines = rawLyrics.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                                    lyrics = lines.map((text, idx) => ({ time: idx * 4.5, text }));
                                }
                            }
                        } catch(e) {
                            console.warn("USLT parse error", e);
                        }
                    }

                    pos += 10 + frameSize;
                }
                resolve({ title, artist, album, coverUrl, lyrics });
            } catch (err) {
                resolve(null);
            }
        };
        reader.onerror = () => resolve(null);
        reader.readAsArrayBuffer(slice);
    });
}

// --- SMART TITLE & METADATA CLEANER ---
function cleanSongQuery(rawTitle, rawArtist) {
    let t = (rawTitle || "").replace(/\.[a-zA-Z0-9]{2,4}$/, "").trim();
    // remove leading track numbers like "01 - ", "1. ", "01 "
    t = t.replace(/^[\d\s.\-_]+(?=[A-Za-z])/, "").trim();
    // remove common junk tags
    t = t.replace(/\[(official|video|audio|lyrics|hd|4k|hq|remastered|live|mv|audio)[^\]]*\]/gi, "");
    t = t.replace(/\((official|video|audio|lyrics|hd|4k|hq|remastered|live|mv|audio)[^)]*\)/gi, "");
    t = t.trim();

    let a = (rawArtist || "").trim();
    if (!a || a.toLowerCase().includes("local") || a.toLowerCase().includes("komputer") || a.toLowerCase().includes("uploaded")) {
        a = "";
    }

    // If title has " - ", split artist and title
    if (!a && t.includes(" - ")) {
        const parts = t.split(" - ");
        a = parts[0].trim();
        t = parts.slice(1).join(" - ").trim();
    } else if (t.includes(" - ") && !t.toLowerCase().includes(a.toLowerCase())) {
        const parts = t.split(" - ");
        if (!a) a = parts[0].trim();
        t = parts.slice(1).join(" - ").trim();
    }

    // Clean trailing parentheses
    t = t.replace(/\s*\((remastered|deluxe|bonus|single)[^)]*\)/gi, "").trim();

    return { title: t, artist: a };
}

// --- LRC PARSER (SYNCHRONIZED LYRICS) ---
function parseLRC(lrcText) {
    if (!lrcText) return [];
    const lines = lrcText.split('\n');
    const result = [];
    const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
    for (const rawLine of lines) {
        const matches = [...rawLine.matchAll(timeRegex)];
        const text = rawLine.replace(timeRegex, '').trim();
        if (matches.length > 0 && text) {
            for (const m of matches) {
                const mins = parseInt(m[1], 10);
                const secs = parseInt(m[2], 10);
                const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
                const time = mins * 60 + secs + ms / 1000;
                result.push({ time, text });
            }
        }
    }
    result.sort((a, b) => a.time - b.time);
    return result;
}

// --- ONLINE ALBUM ARTWORK FETCH ENGINE (ITUNES SEARCH API) ---
async function fetchOnlineArtwork(rawTitle, rawArtist) {
    try {
        const { title, artist } = cleanSongQuery(rawTitle, rawArtist);
        const term = artist ? `${artist} ${title}` : title;
        if (!term) return null;

        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=1`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.results && data.results.length > 0) {
            const item = data.results[0];
            const cover600 = item.artworkUrl100 
                ? item.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg') 
                : null;
            return {
                cover: cover600,
                artist: item.artistName || artist,
                album: item.collectionName || item.trackName,
                title: item.trackName || title
            };
        }
    } catch(e) {
        console.warn("iTunes artwork notice:", e);
    }
    return null;
}

// --- CURATED BEAT-CALIBRATED LYRICS (OFFICIAL STUDIO CD TIMING) ---
const CURATED_BEAT_LYRICS = {
    'helena': [
        { time: 4.57, text: "Long ago" },
        { time: 6.86, text: "Just like the hearse you die to get in again" },
        { time: 12.86, text: "We are so far from you" },
        { time: 19.27, text: "Burning on" },
        { time: 22.33, text: "Just like the match you strike to incinerate" },
        { time: 27.69, text: "The lives of everyone you know" },
        { time: 33.94, text: "And what's the worst you take (Worst you take)" },
        { time: 37.36, text: "From every heart you break (Heart you break)" },
        { time: 41.14, text: "And like the blade you stain (Blade you stain)" },
        { time: 44.88, text: "Well, I've been holding on tonight" },
        { time: 50.03, text: "What's the worst that I can say?" },
        { time: 54.12, text: "Things are better if I stay" },
        { time: 58.04, text: "So long and goodnight" },
        { time: 61.30, text: "So long and goodnight" },
        { time: 66.59, text: "Came a time" },
        { time: 70.08, text: "When every star fall" },
        { time: 72.23, text: "Brought you to tears again" },
        { time: 76.14, text: "We are the very hurt you sold" },
        { time: 81.33, text: "And what's the worst you take (Worst you take)" },
        { time: 85.01, text: "From every heart you break (Heart you break)" },
        { time: 89.30, text: "And like the blade you stain (Blade you stain)" },
        { time: 92.51, text: "Well, I've been holding on tonight" },
        { time: 98.53, text: "What's the worst that I can say?" },
        { time: 102.47, text: "Things are better if I stay" },
        { time: 105.65, text: "So long and goodnight" },
        { time: 109.12, text: "So long and goodnight" },
        { time: 113.72, text: "Well, if you carry on this way" },
        { time: 117.69, text: "Things are better if I stay" },
        { time: 120.99, text: "So long and goodnight" },
        { time: 124.40, text: "So long and goodnight" },
        { time: 131.83, text: "Can you hear me?" },
        { time: 138.96, text: "Are you near me?" },
        { time: 146.66, text: "Can we pretend to leave and then" },
        { time: 154.19, text: "We'll meet again" },
        { time: 157.93, text: "When both our cars collide" },
        { time: 163.28, text: "What's the worst that I can say?" },
        { time: 167.29, text: "Things are better if I stay" },
        { time: 170.47, text: "So long and goodnight" },
        { time: 173.93, text: "So long and goodnight" },
        { time: 178.33, text: "Well, if you carry on this way" },
        { time: 182.34, text: "Things are better if I stay" },
        { time: 185.78, text: "So long and goodnight" },
        { time: 189.45, text: "So long and goodnight" }
    ]
};

// --- ONLINE SYNCHRONIZED LYRICS FETCH ENGINE (LRCLIB API) ---
async function fetchOnlineLyrics(rawTitle, rawArtist, durationSec) {
    try {
        const { title, artist } = cleanSongQuery(rawTitle, rawArtist);

        // 1. Check curated beat-matched tracks first (e.g. Helena)
        const lowTitle = (title || "").toLowerCase();
        for (const [key, curatedList] of Object.entries(CURATED_BEAT_LYRICS)) {
            if (lowTitle.includes(key)) {
                return { type: 'synced', lyrics: JSON.parse(JSON.stringify(curatedList)) };
            }
        }

        const term = artist ? `${artist} ${title}` : title;
        if (!term) return null;

        const url = `https://lrclib.net/api/search?q=${encodeURIComponent(term)}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
            // 2. Prefer Synced Lyrics with beat validation
            const bestSynced = list.find(item => item.syncedLyrics && item.syncedLyrics.length > 10);
            if (bestSynced && bestSynced.syncedLyrics) {
                const parsed = parseLRC(bestSynced.syncedLyrics);
                if (parsed.length > 0) {
                    return { type: 'synced', lyrics: parsed };
                }
            }

            // 3. Fallback to Plain Lyrics
            const bestPlain = list.find(item => item.plainLyrics && item.plainLyrics.length > 10) || list[0];
            if (bestPlain && bestPlain.plainLyrics) {
                const lines = bestPlain.plainLyrics.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const step = (durationSec && durationSec > 20) ? (durationSec / Math.max(1, lines.length)) : 4.5;
                const parsed = lines.map((text, idx) => ({
                    time: Math.round(idx * step * 10) / 10,
                    text: text
                }));
                return { type: 'plain', lyrics: parsed };
            }
        }
    } catch(e) {
        console.warn("LrcLib lyrics notice:", e);
    }
    return null;
}

// --- AUTOMATIC METADATA & LYRICS ENHANCER ---
function checkAndEnhanceTrackMetadata(track) {
    if (!track) return;

    // 1. Check if cover needs real online artwork
    if (!track.cover || track.cover.includes('unsplash')) {
        fetchOnlineArtwork(track.title, track.artist).then(onlineMeta => {
            if (onlineMeta && onlineMeta.cover) {
                track.cover = onlineMeta.cover;
                if (onlineMeta.artist && (!track.artist || track.artist === 'Local Artist' || track.artist === 'MP3 Lokal')) {
                    track.artist = onlineMeta.artist;
                }
                if (onlineMeta.album && (!track.album || track.album === 'Uploaded MP3' || track.album === 'File Komputer')) {
                    track.album = onlineMeta.album;
                }
                if (track.id) updateSongInDB(track.id, { cover: track.cover, artist: track.artist, album: track.album });
                updatePlayerUI();
                renderCurrentMenu();
                renderCoverFlow();
            }
        });
    }

    // 2. Check if lyrics need real online synchronized lyrics
    const isHelena = track.title && track.title.toLowerCase().includes('helena');
    if (isHelena && (!track.lyrics || track.lyrics[0].time < 3.0)) {
        track.lyrics = JSON.parse(JSON.stringify(CURATED_BEAT_LYRICS['helena']));
        track.lyricsType = 'synced';
        if (track.id) updateSongInDB(track.id, { lyrics: track.lyrics, lyricsType: 'synced' });
        if (currentView === 'lyrics' && playlist[currentTrackIndex] === track) renderLyrics();
    } else if (!track.lyrics || (track.lyrics.length <= 2 && track.lyrics[0].text.includes("Memutar"))) {
        fetchOnlineLyrics(track.title, track.artist, audioEngine.duration).then(res => {
            if (res && res.lyrics && res.lyrics.length > 0) {
                track.lyrics = res.lyrics;
                track.lyricsType = res.type;
                if (track.id) updateSongInDB(track.id, { lyrics: res.lyrics, lyricsType: res.type });
                if (currentView === 'lyrics') renderLyrics();
            }
        });
    }
}

async function loadCustomSongsFromDB() {
    try {
        const db = await openDatabase();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = async () => {
            const savedSongs = req.result || [];
            playlist = [];
            for (const s of savedSongs) {
                const url = s.blob ? URL.createObjectURL(s.blob) : (s.src || "");
                let cover = s.cover;
                let lyrics = s.lyrics || null;

                if (!cover && s.blob) {
                    try {
                        const meta = await parseID3Tags(s.blob);
                        if (meta && meta.coverUrl) cover = meta.coverUrl;
                        if (meta && meta.lyrics && !lyrics) lyrics = meta.lyrics;
                    } catch(e) {}
                }

                const trackObj = {
                    id: s.id,
                    title: s.title,
                    artist: s.artist || "MP3 Lokal",
                    album: s.album || "File Komputer",
                    cover: cover || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300",
                    duration: s.duration || "--:--",
                    src: url,
                    isCustom: true,
                    lyrics: lyrics,
                    lyricsType: s.lyricsType || (lyrics ? 'synced' : 'plain'),
                    lyricsOffset: s.lyricsOffset || 0
                };

                playlist.push(trackObj);
                checkAndEnhanceTrackMetadata(trackObj);
            }

            // Jika di memori HP / browser belum ada lagu upload, muat lagu bawaan agar tidak kosong!
            if (playlist.length === 0 && DEFAULT_PLAYLIST.length > 0) {
                DEFAULT_PLAYLIST.forEach(def => {
                    playlist.push({ ...def });
                });
            }

            if (playlist.length > 0) {
                currentTrackIndex = 0;
                loadTrack(0);
            } else {
                currentTrackIndex = -1;
                updatePlayerUI();
            }
            renderCurrentMenu();
            renderCoverFlow();
        };
    } catch (err) {
        console.warn("IndexedDB load note:", err);
        if (playlist.length === 0 && DEFAULT_PLAYLIST.length > 0) {
            DEFAULT_PLAYLIST.forEach(def => {
                playlist.push({ ...def });
            });
            currentTrackIndex = 0;
            loadTrack(0);
            renderCurrentMenu();
            renderCoverFlow();
        }
    }
}

function savePreferences() {
    try {
        const prefs = {
            theme: THEMES[currentThemeIndex].id,
            volume: currentVolume,
            isShuffle: isShuffle,
            repeatMode: repeatMode,
            activeEqPreset: activeEqPreset,
            clickSoundEnabled: clickSoundEnabled,
            visualizerModeIdx: visualizerModeIdx
        };
        localStorage.setItem('ipod_classic_prefs', JSON.stringify(prefs));
    } catch (e) {}
}

function restorePreferences() {
    try {
        const raw = localStorage.getItem('ipod_classic_prefs');
        if (raw) {
            const p = JSON.parse(raw);
            if (p.theme) setTheme(p.theme);
            if (typeof p.volume === 'number') setVolume(p.volume, false);
            if (typeof p.isShuffle === 'boolean') {
                isShuffle = p.isShuffle;
                if (statusShuffleIcon) statusShuffleIcon.style.display = isShuffle ? 'inline-block' : 'none';
            }
            if (p.repeatMode) {
                repeatMode = p.repeatMode;
                updateRepeatUI();
            }
            if (p.activeEqPreset) applyEqPreset(p.activeEqPreset);
            if (typeof p.clickSoundEnabled === 'boolean') {
                clickSoundEnabled = p.clickSoundEnabled;
                const btn = document.getElementById('toggle-sound-btn');
                if (btn) btn.innerHTML = clickSoundEnabled ? '<i class="fa-solid fa-volume-high"></i> Tik: ON' : '<i class="fa-solid fa-volume-xmark"></i> Tik: OFF';
            }
            if (typeof p.visualizerModeIdx === 'number') visualizerModeIdx = p.visualizerModeIdx;
        } else {
            // Default: U2 Special Edition (Black + Crimson Red Click Wheel)
            setTheme('theme-u2-edition');
        }
    } catch (e) {
        setTheme('theme-u2-edition');
    }
}

// --- 2. MULTI-THEME ENGINE ---
const THEMES = [
    { id: 'theme-u2-edition', name: 'U2 Special Edition', label: '★ U2 SPECIAL EDITION ★' },
    { id: 'theme-cyber-purple', name: 'Midnight Cosmic Violet', label: '★ MIDNIGHT PURPLE • COSMIC HORIZON ★' },
    { id: 'theme-cyber-green', name: 'Deftones Cyber Green', label: '★ DEFTONES • DIAMOND EYES ★' },
    { id: 'theme-black-chrome', name: 'Black Chrome', label: '✦ BLACK CHROME EDITION ✦' },
    { id: 'theme-classic-white', name: 'Classic White', label: ' IPOD CLASSIC WHITE' },
    { id: 'theme-space-gray', name: 'Space Gray', label: ' SPACE GRAY EDITION' }
];

let currentThemeIndex = 0;

function setTheme(themeId) {
    const ipodEl = document.getElementById('ipod');
    const ipodBack = document.getElementById('ipod-back');
    const u2Back = document.getElementById('u2-back-section');
    const deftonesBack = document.getElementById('deftones-back-section');
    const purpleBack = document.getElementById('purple-back-section');
    if (!ipodEl) return;

    THEMES.forEach(t => {
        ipodEl.classList.remove(t.id);
        if (ipodBack) ipodBack.classList.remove(`${t.id}-back`);
    });
    ipodEl.classList.add(themeId);
    if (ipodBack) ipodBack.classList.add(`${themeId}-back`);

    // Toggle Backplate Engravings
    if (u2Back) u2Back.style.display = (themeId !== 'theme-cyber-green' && themeId !== 'theme-cyber-purple') ? 'block' : 'none';
    if (deftonesBack) deftonesBack.style.display = (themeId === 'theme-cyber-green') ? 'block' : 'none';
    if (purpleBack) purpleBack.style.display = (themeId === 'theme-cyber-purple') ? 'block' : 'none';

    const themeObj = THEMES.find(t => t.id === themeId) || THEMES[0];
    currentThemeIndex = THEMES.indexOf(themeObj);

    const brandingEl = document.getElementById('bottom-branding-text');
    if (brandingEl) {
        brandingEl.innerHTML = `<span>${themeObj.label}</span>`;
    }

    const btnThemeName = document.getElementById('btn-theme-name');
    if (btnThemeName) {
        btnThemeName.innerText = themeObj.name;
    }

    const aboutEd = document.getElementById('about-edition-name');
    if (aboutEd) {
        aboutEd.innerText = themeObj.name;
    }

    updateMenuPreviewArt();
    updatePlayerUI();
    savePreferences();
    renderCurrentMenu();
}

function cycleTheme() {
    playMechanicalClick();
    currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
    setTheme(THEMES[currentThemeIndex].id);
}

// --- 3. WEB AUDIO API SYNTHESIZER, EQUALIZER & LIVE ANALYSER ---
let audioCtx = null;
let clickSoundEnabled = true;
let audioSourceNode = null;
let analyserNode = null;
let eqFilters = [];
let activeEqPreset = 'Flat / Off';

const EQ_PRESETS = {
    'Flat / Off': [0, 0, 0, 0, 0],
    'Bass Booster': [7, 5, 1, 0, -1],
    'Rock': [5, 3, -1, 3, 5],
    'Pop': [-1, 2, 5, 3, -2],
    'Vocal': [-2, 1, 4, 3, 1],
    'Electronic': [6, 4, 0, 2, 5],
    'Acoustic': [4, 2, 1, 3, 4]
};

function initAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    initAudioChain();
}

function initAudioChain() {
    if (!audioCtx || audioSourceNode) return;
    try {
        const engine = document.getElementById('audio-engine');
        if (!engine) return;
        
        audioSourceNode = audioCtx.createMediaElementSource(engine);

        // Analyser Node for Real-time Music Visualizer
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 64; // Provides 32 frequency bins
        analyserNode.smoothingTimeConstant = 0.8;

        // 5-Band Equalizer: 60Hz, 250Hz, 1kHz, 4kHz, 12kHz
        const freqs = [60, 250, 1000, 4000, 12000];
        const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

        eqFilters = freqs.map((f, i) => {
            const filter = audioCtx.createBiquadFilter();
            filter.type = types[i];
            filter.frequency.value = f;
            filter.gain.value = 0;
            return filter;
        });

        // Audio Chain: Source -> Analyser -> EQ Cascade -> Destination
        audioSourceNode.connect(analyserNode);

        let prevNode = analyserNode;
        for (let i = 0; i < eqFilters.length; i++) {
            prevNode.connect(eqFilters[i]);
            prevNode = eqFilters[i];
        }
        prevNode.connect(audioCtx.destination);
    } catch (e) {
        console.warn("Audio Chain setup note:", e);
    }
}

function applyEqPreset(presetName) {
    activeEqPreset = presetName;
    const gains = EQ_PRESETS[presetName] || [0, 0, 0, 0, 0];
    if (eqFilters.length === 5) {
        eqFilters.forEach((filter, idx) => {
            if (filter.gain.setValueAtTime && audioCtx) {
                filter.gain.setValueAtTime(gains[idx], audioCtx.currentTime);
            } else {
                filter.gain.value = gains[idx];
            }
        });
    }
    savePreferences();
    renderCurrentMenu();
}

function playMechanicalClick() {
    if (!clickSoundEnabled) return;
    try {
        initAudioContext();
        if (!audioCtx) return;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.007);

        filter.type = 'highpass';
        filter.frequency.setValueAtTime(700, audioCtx.currentTime);

        gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.009);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.01);
    } catch (e) {}
}

function toggleClickSound() {
    clickSoundEnabled = !clickSoundEnabled;
    const btn = document.getElementById('toggle-sound-btn');
    if (btn) {
        btn.innerHTML = clickSoundEnabled 
            ? '<i class="fa-solid fa-volume-high"></i> Tik: ON' 
            : '<i class="fa-solid fa-volume-xmark"></i> Tik: OFF';
    }
    playMechanicalClick();
    savePreferences();
    renderCurrentMenu();
}

// --- 4. PLAYLIST & MUSIC LIBRARY DATA ---
const DEFAULT_PLAYLIST = [
    {
        title: "Helena",
        artist: "My Chemical Romance",
        album: "Three Cheers for Sweet Revenge",
        cover: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bf/16/ef/bf16ef80-bfd7-8a60-9df5-0fa225d31515/093624861263.jpg/600x600bb.jpg",
        duration: "03:24",
        src: "assets/audio/helena.mp3",
        lyrics: CURATED_BEAT_LYRICS['helena'],
        lyricsType: 'synced',
        isDefault: true
    },
    {
        title: "Cancer",
        artist: "My Chemical Romance",
        album: "The Black Parade",
        cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/28/bf/a1/28bfa17c-0ff3-f8d2-45e0-5ca6855177df/093624933595.jpg/600x600bb.jpg",
        duration: "02:22",
        src: "assets/audio/cancer.mp3",
        lyrics: [
            { time: 0, text: "Turn away" },
            { time: 5, text: "If you could get me a drink of water" },
            { time: 11, text: "'Cause my lips are chapped and faded" },
            { time: 16, text: "Call my aunt Marie" },
            { time: 21, text: "Help her gather all my things" },
            { time: 26, text: "And bury me in all my favorite colors" },
            { time: 31, text: "My sisters and my brothers, still" },
            { time: 37, text: "I will not kiss you" },
            { time: 42, text: "'Cause the hardest part of this is leaving you" },
            { time: 53, text: "Now turn away" },
            { time: 58, text: "'Cause I'm awful just to see" },
            { time: 64, text: "'Cause all my hairs have abandoned all my body" },
            { time: 72, text: "Oh, my agony" },
            { time: 76, text: "Know that I will never marry" },
            { time: 82, text: "Baby, I'm just soggy from the chemo" },
            { time: 87, text: "Standing by the street" },
            { time: 92, text: "And that I will never marry" },
            { time: 97, text: "Baby, I'm just soggy from the chemo" },
            { time: 102, text: "Standing by the street" },
            { time: 108, text: "So turn away" },
            { time: 113, text: "'Cause the hardest part of this is leaving you" },
            { time: 125, text: "Yes, the hardest part of this" },
            { time: 132, text: "Is leaving you" }
        ],
        lyricsType: 'synced',
        isDefault: true
    },
    {
        title: "Blinding Lights",
        artist: "The Weeknd",
        album: "After Hours",
        cover: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/8a/a5/d8/8aa5d8df-1a89-d9fc-e038-f1f310f81d13/20UMGIM08226.rgb.jpg/600x600bb.jpg",
        duration: "03:20",
        src: "assets/audio/blinding-lights.mp3",
        lyrics: [
            { time: 0, text: "Yeah" },
            { time: 26, text: "I've been tryin' to call" },
            { time: 29, text: "I've been on my own for long enough" },
            { time: 33, text: "Maybe you can show me how to love, maybe" },
            { time: 39, text: "I'm going through withdrawals" },
            { time: 42, text: "You don't even have to do too much" },
            { time: 46, text: "You can turn me on with just a touch, baby" },
            { time: 52, text: "I look around and Sin City's cold and empty" },
            { time: 57, text: "No one's around to judge me" },
            { time: 60, text: "I can't see clearly when you're gone" },
            { time: 65, text: "I said, ooh, I'm blinded by the lights" },
            { time: 72, text: "No, I can't sleep until I feel your touch" },
            { time: 78, text: "I said, ooh, I'm drowning in the night" },
            { time: 85, text: "Oh, when I'm like this, you're the one I trust" }
        ],
        lyricsType: 'synced',
        isDefault: true
    }
];

let playlist = [];
let currentTrackIndex = -1;
let isPlaying = false;
let currentVolume = 0.8;
let isShuffle = false;
let repeatMode = 'off'; // 'off' | 'all' | 'one'

// --- 5. DOM ELEMENTS ---
const audioEngine = document.getElementById('audio-engine');
const statusTitle = document.getElementById('status-title');
const statusPlayIcon = document.getElementById('status-play-icon');
const statusShuffleIcon = document.getElementById('status-shuffle-icon');
const statusRepeatIcon = document.getElementById('status-repeat-icon');
const statusSleepIcon = document.getElementById('status-sleep-icon');

const viewMenu = document.getElementById('view-menu');
const viewPlayer = document.getElementById('view-player');
const viewVisualizer = document.getElementById('view-visualizer');
const viewCoverflow = document.getElementById('view-coverflow');
const viewLyrics = document.getElementById('view-lyrics');
const viewVideos = document.getElementById('view-videos');
const viewPhotos = document.getElementById('view-photos');
const viewClock = document.getElementById('view-clock');
const viewGame = document.getElementById('view-game');
const viewQuiz = document.getElementById('view-quiz');
const viewAbout = document.getElementById('view-about');

// Hardware Controls & PWA DOM
const statusHoldIcon = document.getElementById('status-hold-icon');
const holdAssembly = document.getElementById('hold-assembly');
const btnHoldToggle = document.getElementById('btn-hold-toggle');
const headphoneAssembly = document.getElementById('headphone-assembly');
const earphonePlug = document.getElementById('earphone-plug');
const headphoneLabel = document.getElementById('headphone-label');
const ipodFlipper = document.getElementById('ipod-flipper');
const btnInstallPwa = document.getElementById('btn-install-pwa');

// Hardware States
let isHoldLocked = false;
let isHeadphonesPlugged = true;
let isIpodFlipped = false;

function flashHoldLock() {
    if (!statusHoldIcon) return;
    statusHoldIcon.style.display = 'inline-block';
    statusHoldIcon.style.transform = 'scale(1.4)';
    setTimeout(() => {
        statusHoldIcon.style.transform = 'scale(1)';
        if (!isHoldLocked) statusHoldIcon.style.display = 'none';
    }, 250);
}

function toggleHoldSwitch() {
    isHoldLocked = !isHoldLocked;
    playMechanicalClick();

    if (holdAssembly) {
        holdAssembly.classList.toggle('locked', isHoldLocked);
    }
    if (statusHoldIcon) {
        statusHoldIcon.style.display = isHoldLocked ? 'inline-block' : 'none';
    }
    if (btnHoldToggle) {
        btnHoldToggle.innerHTML = isHoldLocked
            ? '<i class="fa-solid fa-lock"></i> HOLD: ON'
            : '<i class="fa-solid fa-lock-open"></i> HOLD: OFF';
    }
}

function toggleHeadphones() {
    isHeadphonesPlugged = !isHeadphonesPlugged;
    playMechanicalClick();

    if (earphonePlug) {
        earphonePlug.classList.toggle('connected', isHeadphonesPlugged);
    }
    if (headphoneLabel) {
        headphoneLabel.innerText = isHeadphonesPlugged ? 'JACK: ON' : 'JACK: OFF';
    }

    // Auto-pause when unplugged!
    if (!isHeadphonesPlugged) {
        if (audioEngine && !audioEngine.paused) {
            audioEngine.pause();
            isPlaying = false;
            updatePlayStateUI();
        }
    }
}

function toggleIpodFlip() {
    isIpodFlipped = !isIpodFlipped;
    playMechanicalClick();
    if (ipodFlipper) {
        ipodFlipper.classList.toggle('flipped', isIpodFlipped);
    }
}

const menuHeaderTitle = document.getElementById('menu-header-title');
const menuItemsList = document.getElementById('menu-items-list');
const menuArtPreview = document.getElementById('menu-art-preview');
const menuPaneLeft = document.querySelector('.menu-pane-left');

// Player DOM
const playerTrackTitle = document.getElementById('player-track-title');
const playerTrackArtist = document.getElementById('player-track-artist');
const playerTrackAlbum = document.getElementById('player-track-album');
const albumCoverImg = document.getElementById('album-cover-img');
const albumFallbackArt = document.getElementById('album-fallback-art');
const playerProgressFill = document.getElementById('player-progress-fill');
const timeCurrent = document.getElementById('time-current');
const timeRemaining = document.getElementById('time-remaining');
const equalizerBars = document.getElementById('equalizer-bars');
const playerVolFill = document.getElementById('player-vol-fill');

// Volume Elements
let hudTimeout = null;
const volumeHudPopup = document.getElementById('volume-hud-popup');
const hudVolPercent = document.getElementById('hud-vol-percent');
const hudBarFill = document.getElementById('hud-bar-fill');
const volNumericLabel = document.getElementById('vol-numeric-label');
const toolbarVolText = document.getElementById('toolbar-vol-text');
const volBarClickable = document.getElementById('vol-bar-clickable');
const hudBarTrack = document.getElementById('hud-bar-track');

// Click Wheel Elements
const clickWheel = document.getElementById('click-wheel');
const btnMenu = document.getElementById('btn-menu');
const btnCenter = document.getElementById('btn-center');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnPlay = document.getElementById('btn-play');
const mp3FileInput = document.getElementById('mp3-file-input');

// --- 6. DEEP HIERARCHICAL MENU SPECIFICATION ---
let currentScreen = 'menu';
let currentMenuId = 'main';
let selectedIndex = 0;
let menuHistory = ['main'];

// State variables for sub-browsing
let selectedArtist = "";
let selectedAlbum = "";
let selectedPlaylistName = "";

const MENUS = {
    main: {
        title: "iPod Classic",
        items: [
            { label: "Now Playing", action: () => openPlayerView() },
            { label: "Music", target: "music" },
            { label: "Videos", action: () => switchView('videos') },
            { label: "Photos", action: () => switchView('photos') },
            { label: "Extras", target: "extras" },
            { label: "Settings", target: "settings" },
            { label: "Shuffle Songs", action: () => triggerShuffleAll() }
        ]
    },
    music: {
        title: "Music",
        items: [
            { label: "Cover Flow", action: () => switchView('coverflow') },
            { label: "Visualizer", action: () => switchView('visualizer') },
            { label: "Playlists", target: "playlists" },
            { label: "Artists", target: "artists" },
            { label: "Albums", target: "albums" },
            { label: "All Songs", target: "songs" },
            { label: "🗑 Hapus Lagu (Pilih)", target: "deleteSongMenu" },
            { label: "+ Upload MP3...", action: () => bukaInputLagu() }
        ]
    },
    deleteSongMenu: {
        title: "Hapus Lagu (Pilih)",
        dynamic: true,
        getItems: () => {
            if (!playlist.length) {
                return [{ label: "iPod Kosong (0 Lagu)", action: () => {} }];
            }
            return playlist.map((t, idx) => ({
                label: `🗑 ${idx + 1}. ${t.title}`,
                action: () => deleteSongByIndex(idx)
            }));
        }
    },
    playlists: {
        title: "Playlists",
        dynamic: true,
        getItems: () => {
            const customLists = getCustomPlaylists();
            const items = [
                { label: "+ Buat Playlist Baru...", action: () => promptNewPlaylist() },
                { label: `All MP3s (${playlist.length})`, action: () => openPlaylistDetails("All MP3s") }
            ];
            customLists.forEach(pl => {
                items.push({
                    label: `♫ ${pl.name} (${pl.songs.length})`,
                    action: () => openCustomPlaylistDetails(pl.id)
                });
            });
            return items;
        }
    },
    playlist_details: {
        title: "Playlist",
        dynamic: true,
        getItems: () => {
            if (!playlist.length) {
                return [{ label: "+ Tambah Lagu MP3...", action: () => bukaInputLagu() }];
            }
            return playlist.map((t, idx) => ({
                label: `${t.title} - ${t.artist}`,
                action: () => playTrackByIndex(idx)
            }));
        }
    },
    custom_playlist_details: {
        title: "Playlist",
        dynamic: true,
        getItems: () => {
            const pl = getCustomPlaylists().find(p => p.id === currentCustomPlaylistId);
            if (!pl) return [{ label: "Playlist tidak ditemukan", action: () => navigateBack() }];
            const items = [
                { label: "+ Tambah Lagu...", action: () => openAddSongToPlaylistPicker(pl.id) },
                { label: "✕ Hapus Playlist Ini", action: () => deletePlaylistAndReturn(pl.id) }
            ];
            const matchingSongs = playlist.filter(t => pl.songs.includes(t.title));
            if (matchingSongs.length === 0) {
                items.push({ label: "(Playlist Kosong)", action: () => {} });
            } else {
                matchingSongs.forEach(t => {
                    const idx = playlist.indexOf(t);
                    items.push({
                        label: `${t.title} - ${t.artist}`,
                        action: () => playTrackByIndex(idx)
                    });
                });
            }
            return items;
        }
    },
    playlist_song_picker: {
        title: "Pilih Lagu",
        dynamic: true,
        getItems: () => {
            if (!playlist.length) {
                return [{ label: "+ Upload MP3 Dulu...", action: () => bukaInputLagu() }];
            }
            const pl = getCustomPlaylists().find(p => p.id === currentCustomPlaylistId);
            return playlist.map(t => {
                const isAdded = pl && pl.songs.includes(t.title);
                return {
                    label: `${isAdded ? '✓ ' : '+ '}${t.title}`,
                    action: () => toggleSongInCustomPlaylist(currentCustomPlaylistId, t.title)
                };
            });
        }
    },
    artists: {
        title: "Artists",
        dynamic: true,
        getItems: () => {
            const artists = [...new Set(playlist.map(t => t.artist))];
            if (!artists.length) {
                return [{ label: "+ Tambah Lagu MP3...", action: () => bukaInputLagu() }];
            }
            return artists.map(a => ({
                label: a,
                action: () => openArtistDetails(a)
            }));
        }
    },
    artist_details: {
        title: "Artist Songs",
        dynamic: true,
        getItems: () => {
            const artistSongs = playlist.filter(t => t.artist === selectedArtist);
            return artistSongs.map(t => {
                const globalIdx = playlist.indexOf(t);
                return {
                    label: t.title,
                    action: () => playTrackByIndex(globalIdx)
                };
            });
        }
    },
    albums: {
        title: "Albums",
        dynamic: true,
        getItems: () => {
            const albums = [...new Set(playlist.map(t => t.album))];
            if (!albums.length) {
                return [{ label: "+ Tambah Lagu MP3...", action: () => bukaInputLagu() }];
            }
            return albums.map(alb => ({
                label: alb || "Single",
                action: () => openAlbumDetails(alb)
            }));
        }
    },
    album_details: {
        title: "Album Songs",
        dynamic: true,
        getItems: () => {
            const albumSongs = playlist.filter(t => t.album === selectedAlbum);
            return albumSongs.map(t => {
                const globalIdx = playlist.indexOf(t);
                return {
                    label: t.title,
                    action: () => playTrackByIndex(globalIdx)
                };
            });
        }
    },
    songs: {
        title: "All Songs",
        dynamic: true,
        getItems: () => {
            if (!playlist.length) {
                return [{ label: "+ Tambah Lagu MP3...", action: () => bukaInputLagu(), hasSubmenu: false }];
            }
            return playlist.map((t, idx) => ({
                label: `${idx + 1}. ${t.title}`,
                action: () => playTrackByIndex(idx),
                canDelete: true,
                songIndex: idx,
                hasSubmenu: false
            }));
        }
    },
    extras: {
        title: "Extras",
        items: [
            { label: "Music Quiz", action: () => startMusicQuiz() },
            { label: "Clock & Stopwatch", action: () => switchView('clock') },
            { label: "Games: Brick", action: () => switchView('game') },
            { label: "Lyrics Viewer", action: () => switchView('lyrics') },
            { label: "Sleep Timer", target: "sleepTimer" }
        ]
    },
    sleepTimer: {
        title: "Sleep Timer",
        dynamic: true,
        getItems: () => [
            { label: `Off ${sleepRemainingSec === null ? '✓' : ''}`, action: () => setSleepTimer(0) },
            { label: `15 Menit ${sleepRemainingSec === 15 * 60 ? '✓' : ''}`, action: () => setSleepTimer(15 * 60) },
            { label: `30 Menit ${sleepRemainingSec === 30 * 60 ? '✓' : ''}`, action: () => setSleepTimer(30 * 60) },
            { label: `45 Menit ${sleepRemainingSec === 45 * 60 ? '✓' : ''}`, action: () => setSleepTimer(45 * 60) },
            { label: `60 Menit ${sleepRemainingSec === 60 * 60 ? '✓' : ''}`, action: () => setSleepTimer(60 * 60) }
        ]
    },
    settings: {
        title: "Settings",
        dynamic: true,
        getItems: () => [
            { label: `Theme: ${THEMES[currentThemeIndex].name}`, target: "themesMenu" },
            { label: `Equalizer: ${activeEqPreset}`, target: "eqMenu" },
            { label: `Repeat: ${repeatMode.toUpperCase()}`, action: () => toggleRepeatMode() },
            { label: `Shuffle: ${isShuffle ? 'ON' : 'OFF'}`, action: () => toggleShuffleMode() },
            { label: `Clicker Sound: ${clickSoundEnabled ? 'ON' : 'OFF'}`, action: () => toggleClickSound() },
            { label: "Hapus Lagu (Pilih)...", target: "deleteSongMenu" },
            { label: "Pulihkan Lagu Bawaan", action: () => resetDefaultSongs() },
            { label: "Hapus Semua Lagu", action: () => clearAllSongs() },
            { label: "About iPod", action: () => openAboutView() }
        ]
    },
    themesMenu: {
        title: "Theme Switcher",
        dynamic: true,
        getItems: () => THEMES.map(th => ({
            label: `${th.name} ${THEMES[currentThemeIndex].id === th.id ? '✓' : ''}`,
            action: () => setTheme(th.id)
        }))
    },
    eqMenu: {
        title: "Equalizer Presets",
        dynamic: true,
        getItems: () => Object.keys(EQ_PRESETS).map(presetName => ({
            label: `${presetName} ${activeEqPreset === presetName ? '✓' : ''}`,
            action: () => applyEqPreset(presetName)
        }))
    }
};

function openArtistDetails(artistName) {
    selectedArtist = artistName;
    MENUS.artist_details.title = artistName;
    menuHistory.push("artist_details");
    currentMenuId = "artist_details";
    selectedIndex = 0;
    renderCurrentMenu('forward');
}

function openAlbumDetails(albumName) {
    selectedAlbum = albumName;
    MENUS.album_details.title = albumName || "Album";
    menuHistory.push("album_details");
    currentMenuId = "album_details";
    selectedIndex = 0;
    renderCurrentMenu('forward');
}

function openPlaylistDetails(playlistName) {
    selectedPlaylistName = playlistName;
    MENUS.playlist_details.title = playlistName;
    menuHistory.push("playlist_details");
    currentMenuId = "playlist_details";
    selectedIndex = 0;
    renderCurrentMenu('forward');
}

// Custom Playlist Management Functions
let currentCustomPlaylistId = null;

function getCustomPlaylists() {
    try {
        const raw = localStorage.getItem('ipod_custom_playlists');
        return raw ? JSON.parse(raw) : [
            { id: 'pl_fav', name: 'Favorit', songs: [] }
        ];
    } catch(e) {
        return [{ id: 'pl_fav', name: 'Favorit', songs: [] }];
    }
}

function saveCustomPlaylists(lists) {
    try {
        localStorage.setItem('ipod_custom_playlists', JSON.stringify(lists));
    } catch(e) {}
}

function promptNewPlaylist() {
    playMechanicalClick();
    const name = prompt("Masukkan nama Playlist baru:");
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    const lists = getCustomPlaylists();
    const newId = 'pl_' + Date.now();
    lists.push({ id: newId, name: cleanName, songs: [] });
    saveCustomPlaylists(lists);
    openCustomPlaylistDetails(newId);
}

function openCustomPlaylistDetails(plId) {
    currentCustomPlaylistId = plId;
    const pl = getCustomPlaylists().find(p => p.id === plId);
    MENUS.custom_playlist_details.title = pl ? pl.name : "Playlist";
    menuHistory.push("custom_playlist_details");
    currentMenuId = "custom_playlist_details";
    selectedIndex = 0;
    renderCurrentMenu('forward');
}

function openAddSongToPlaylistPicker(plId) {
    playMechanicalClick();
    currentCustomPlaylistId = plId;
    menuHistory.push("playlist_song_picker");
    currentMenuId = "playlist_song_picker";
    selectedIndex = 0;
    renderCurrentMenu('forward');
}

function toggleSongInCustomPlaylist(plId, songTitle) {
    playMechanicalClick();
    const lists = getCustomPlaylists();
    const pl = lists.find(p => p.id === plId);
    if (!pl) return;
    const idx = pl.songs.indexOf(songTitle);
    if (idx >= 0) {
        pl.songs.splice(idx, 1);
    } else {
        pl.songs.push(songTitle);
    }
    saveCustomPlaylists(lists);
    renderCurrentMenu();
}

function deletePlaylistAndReturn(plId) {
    playMechanicalClick();
    if (confirm("Hapus playlist ini? (File lagu tidak akan terhapus dari memori iPod)")) {
        let lists = getCustomPlaylists();
        lists = lists.filter(p => p.id !== plId);
        saveCustomPlaylists(lists);
        navigateBack();
    }
}

function renderCurrentMenu(animDirection = null) {
    const menuDef = MENUS[currentMenuId];
    if (!menuDef) return;

    menuHeaderTitle.innerText = menuDef.title;
    statusTitle.innerText = menuDef.title;

    if (animDirection && menuPaneLeft) {
        menuPaneLeft.classList.remove('slide-in-right', 'slide-in-left');
        void menuPaneLeft.offsetWidth;
        menuPaneLeft.classList.add(animDirection === 'forward' ? 'slide-in-right' : 'slide-in-left');
    }

    const items = menuDef.dynamic ? menuDef.getItems() : menuDef.items;
    menuItemsList.innerHTML = '';

    if (selectedIndex >= items.length) {
        selectedIndex = Math.max(0, items.length - 1);
    }

    items.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = `menu-item ${idx === selectedIndex ? 'selected' : ''}`;
        
        let deleteBtnHtml = '';
        if (item.canDelete && typeof item.songIndex === 'number') {
            deleteBtnHtml = `<button class="menu-item-del-btn" title="Hapus lagu ini" onclick="event.stopPropagation(); deleteSongByIndex(${item.songIndex}, event);"><i class="fa-solid fa-xmark"></i></button>`;
        }

        li.innerHTML = `
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${item.label}</span>
            ${deleteBtnHtml}
            <span class="chevron">${item.hasSubmenu !== false ? '&gt;' : ''}</span>
        `;
        li.onclick = () => {
            selectedIndex = idx;
            selectCurrentMenuItem();
        };
        menuItemsList.appendChild(li);
    });

    const selectedEl = menuItemsList.children[selectedIndex];
    if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
    }

    updateMenuPreviewArt();
}

function updateMenuPreviewArt() {
    const curTrack = playlist[currentTrackIndex];
    if (curTrack && curTrack.cover) {
        menuArtPreview.innerHTML = `<img src="${curTrack.cover}" alt="Preview" onerror="this.parentElement.innerHTML='<div class=\\'art-placeholder\\'><i class=\\'fa-solid fa-music\\'></i></div>'">`;
    } else {
        const isGreen = THEMES[currentThemeIndex] && THEMES[currentThemeIndex].id === 'theme-cyber-green';
        const isPurple = THEMES[currentThemeIndex] && THEMES[currentThemeIndex].id === 'theme-cyber-purple';
        if (isGreen) {
            menuArtPreview.innerHTML = `<img src="assets/theme-green-deftones.jpg" alt="Deftones Diamond Eyes" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px; box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);">`;
        } else if (isPurple) {
            menuArtPreview.innerHTML = `<img src="assets/theme-purple-blackhole.jpg" alt="Cosmic Event Horizon" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px; box-shadow: 0 0 8px rgba(168, 85, 247, 0.6);">`;
        } else {
            menuArtPreview.innerHTML = `<div class="art-placeholder"><i class="fa-solid fa-compact-disc"></i></div>`;
        }
    }
}

function switchView(viewName) {
    currentScreen = viewName;

    const views = [viewMenu, viewPlayer, viewVisualizer, viewCoverflow, viewLyrics, viewVideos, viewPhotos, viewClock, viewGame, viewAbout, viewQuiz];
    views.forEach(v => {
        if (v) v.classList.remove('active');
    });

    if (viewName === 'menu') {
        if (viewMenu) viewMenu.classList.add('active');
        renderCurrentMenu();
    } else if (viewName === 'player') {
        if (viewPlayer) viewPlayer.classList.add('active');
        statusTitle.innerText = "Now Playing";
        updatePlayerUI();
    } else if (viewName === 'visualizer') {
        if (viewVisualizer) viewVisualizer.classList.add('active');
        statusTitle.innerText = "Visualizer";
        startRealtimeVisualizer();
    } else if (viewName === 'coverflow') {
        if (viewCoverflow) viewCoverflow.classList.add('active');
        statusTitle.innerText = "Cover Flow";
        renderCoverFlow();
    } else if (viewName === 'lyrics') {
        if (viewLyrics) viewLyrics.classList.add('active');
        statusTitle.innerText = "Lyrics";
        renderLyrics();
    } else if (viewName === 'videos') {
        if (viewVideos) viewVideos.classList.add('active');
        statusTitle.innerText = "Videos";
        startVideoVisualizer();
    } else if (viewName === 'photos') {
        if (viewPhotos) viewPhotos.classList.add('active');
        statusTitle.innerText = "Photos";
        renderPhotoViewer();
    } else if (viewName === 'clock') {
        if (viewClock) viewClock.classList.add('active');
        statusTitle.innerText = "Clock";
        updateClockDisplay();
    } else if (viewName === 'game') {
        if (viewGame) viewGame.classList.add('active');
        statusTitle.innerText = "Brick Breakout";
        startBrickGame();
    } else if (viewName === 'quiz') {
        if (viewQuiz) viewQuiz.classList.add('active');
        statusTitle.innerText = "Music Quiz";
    } else if (viewName === 'about') {
        if (viewAbout) viewAbout.classList.add('active');
        statusTitle.innerText = "About";
    }
}

function openPlayerView() {
    switchView('player');
}

function openAboutView() {
    switchView('about');
}

function navigateBack() {
    playMechanicalClick();
    if (currentScreen === 'quiz') {
        stopMusicQuiz();
        switchView('menu');
        return;
    }
    if (currentScreen !== 'menu') {
        switchView('menu');
        return;
    }

    if (menuHistory.length > 1) {
        menuHistory.pop();
        currentMenuId = menuHistory[menuHistory.length - 1];
        selectedIndex = 0;
        renderCurrentMenu('back');
    }
}

function selectCurrentMenuItem() {
    playMechanicalClick();
    const menuDef = MENUS[currentMenuId];
    if (!menuDef) return;

    const items = menuDef.dynamic ? menuDef.getItems() : menuDef.items;
    const selected = items[selectedIndex];
    if (!selected) return;

    if (selected.target) {
        menuHistory.push(selected.target);
        currentMenuId = selected.target;
        selectedIndex = 0;
        renderCurrentMenu('forward');
    } else if (selected.action) {
        selected.action();
    }
}

// --- 7. PLAYBACK CONTROLS: SHUFFLE & 3-STATE REPEAT ---
function toggleShuffleMode() {
    isShuffle = !isShuffle;
    playMechanicalClick();
    if (statusShuffleIcon) {
        statusShuffleIcon.style.display = isShuffle ? 'inline-block' : 'none';
    }
    savePreferences();
    renderCurrentMenu();
}

function toggleRepeatMode() {
    playMechanicalClick();
    if (repeatMode === 'off') {
        repeatMode = 'all';
    } else if (repeatMode === 'all') {
        repeatMode = 'one';
    } else {
        repeatMode = 'off';
    }

    updateRepeatUI();
    savePreferences();
    renderCurrentMenu();
}

function updateRepeatUI() {
    if (statusRepeatIcon) {
        if (repeatMode === 'off') {
            statusRepeatIcon.style.display = 'none';
        } else {
            statusRepeatIcon.style.display = 'inline-block';
            statusRepeatIcon.innerHTML = repeatMode === 'one' 
                ? '<i class="fa-solid fa-repeat"></i><sub style="font-size:7px">1</sub>' 
                : '<i class="fa-solid fa-repeat"></i>';
        }
    }
}

function triggerShuffleAll() {
    isShuffle = true;
    if (statusShuffleIcon) statusShuffleIcon.style.display = 'inline-block';
    const randIdx = Math.floor(Math.random() * playlist.length);
    playTrackByIndex(randIdx);
}

// --- 8. REAL-TIME MUSIC VISUALIZER ENGINE ---
let visualizerAnimId = null;
let visualizerModeIdx = 0;
const VISUALIZER_MODES = [
    { name: 'SPECTRUM 32-BAND', type: 'bars' },
    { name: 'NEON OSCILLOSCOPE', type: 'wave' },
    { name: 'RADIAL STEREO PULSE', type: 'radial' }
];

function cycleVisualizerMode() {
    playMechanicalClick();
    visualizerModeIdx = (visualizerModeIdx + 1) % VISUALIZER_MODES.length;
    const tag = document.getElementById('vis-mode-tag');
    if (tag) tag.innerText = VISUALIZER_MODES[visualizerModeIdx].name;
    savePreferences();
}

function startRealtimeVisualizer() {
    initAudioContext();
    const canvas = document.getElementById('visualizer-canvas');
    const visTrack = document.getElementById('vis-track-title');
    const tag = document.getElementById('vis-mode-tag');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (tag) tag.innerText = VISUALIZER_MODES[visualizerModeIdx].name;
    const curSong = playlist[currentTrackIndex];
    if (visTrack && curSong) visTrack.innerText = `${curSong.title} - ${curSong.artist}`;

    if (visualizerAnimId) cancelAnimationFrame(visualizerAnimId);

    const bufferLength = analyserNode ? analyserNode.frequencyBinCount : 32;
    const freqData = new Uint8Array(bufferLength);
    const timeData = new Uint8Array(bufferLength);

    function renderVisFrame() {
        if (currentScreen !== 'visualizer') return;

        if (analyserNode && !audioEngine.paused) {
            analyserNode.getByteFrequencyData(freqData);
            analyserNode.getByteTimeDomainData(timeData);
            updateRealtimeMiniEqualizer(freqData);
        } else {
            // Idle decay
            for (let i = 0; i < bufferLength; i++) {
                freqData[i] = Math.max(0, freqData[i] - 4);
                timeData[i] = 128;
            }
        }

        ctx.fillStyle = '#060a14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const mode = VISUALIZER_MODES[visualizerModeIdx].type;
        const isGreenTheme = THEMES[currentThemeIndex] && THEMES[currentThemeIndex].id === 'theme-cyber-green';

        if (mode === 'bars') {
            // Mode 1: 32 Frequency Bars
            const barCount = 32;
            const barWidth = (canvas.width / barCount) - 2;

            for (let i = 0; i < barCount; i++) {
                const val = freqData[i] || 0;
                const barHeight = Math.max(3, (val / 255) * (canvas.height - 25));
                const x = i * (barWidth + 2) + 2;
                const y = canvas.height - barHeight - 4;

                const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
                if (isGreenTheme) {
                    grad.addColorStop(0, '#86efac'); // Neon Phosphor Green
                    grad.addColorStop(0.5, '#22c55e'); // Matrix Emerald
                    grad.addColorStop(1, '#052e16'); // Deep Forest
                } else {
                    grad.addColorStop(0, '#ef4444'); // Crimson U2 Red
                    grad.addColorStop(0.5, '#f59e0b'); // Amber
                    grad.addColorStop(1, '#0284c7'); // Ocean Blue
                }

                ctx.fillStyle = grad;
                ctx.fillRect(x, y, barWidth, barHeight);

                // Peak Cap
                ctx.fillStyle = isGreenTheme ? '#bbf7d0' : '#ffffff';
                ctx.fillRect(x, y - 2, barWidth, 1.5);
            }
        } else if (mode === 'wave') {
            // Mode 2: Neon Oscilloscope
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = isGreenTheme ? '#4ade80' : '#38bdf8';
            ctx.shadowColor = isGreenTheme ? '#4ade80' : '#38bdf8';
            ctx.shadowBlur = 8;
            ctx.beginPath();

            const sliceWidth = canvas.width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = timeData[i] / 128.0;
                const y = (v * canvas.height) / 2;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
                x += sliceWidth;
            }

            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else if (mode === 'radial') {
            // Mode 3: Radial Stereo Pulse
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const baseRadius = 26;

            ctx.beginPath();
            ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
            ctx.fillStyle = isGreenTheme ? '#16a34a' : '#dc2626';
            ctx.fill();

            for (let i = 0; i < bufferLength; i++) {
                const angle = (i / bufferLength) * Math.PI * 2;
                const len = (freqData[i] / 255) * 45;
                const x1 = centerX + Math.cos(angle) * (baseRadius + 2);
                const y1 = centerY + Math.sin(angle) * (baseRadius + 2);
                const x2 = centerX + Math.cos(angle) * (baseRadius + 2 + len);
                const y2 = centerY + Math.sin(angle) * (baseRadius + 2 + len);

                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
        }

        visualizerAnimId = requestAnimationFrame(renderVisFrame);
    }

    renderVisFrame();
}

function updateRealtimeMiniEqualizer(freqArray) {
    if (!equalizerBars) return;
    const spans = equalizerBars.querySelectorAll('span');
    if (spans.length >= 4) {
        const b1 = Math.min(12, Math.max(2, (freqArray[1] / 255) * 12));
        const b2 = Math.min(12, Math.max(2, (freqArray[5] / 255) * 12));
        const b3 = Math.min(12, Math.max(2, (freqArray[11] / 255) * 12));
        const b4 = Math.min(12, Math.max(2, (freqArray[18] / 255) * 12));
        spans[0].style.height = `${b1}px`;
        spans[1].style.height = `${b2}px`;
        spans[2].style.height = `${b3}px`;
        spans[3].style.height = `${b4}px`;
    }
}

// --- 9. 3D COVER FLOW ENGINE ---
let coverFlowIndex = 0;

function renderCoverFlow() {
    const carousel = document.getElementById('coverflow-carousel');
    const cfTitle = document.getElementById('cf-title');
    const cfSub = document.getElementById('cf-sub');
    const cfCount = document.getElementById('cf-count');
    if (!carousel) return;

    carousel.innerHTML = '';
    const trackCount = playlist.length;

    if (trackCount === 0) {
        const emptyCard = document.createElement('div');
        emptyCard.className = 'coverflow-card';
        emptyCard.style.transform = `translateX(0px) translateZ(80px) rotateY(0deg)`;
        emptyCard.style.opacity = '1';
        emptyCard.style.display = 'flex';
        emptyCard.style.flexDirection = 'column';
        emptyCard.style.alignItems = 'center';
        emptyCard.style.justifyContent = 'center';
        emptyCard.style.background = '#18181b';
        emptyCard.style.border = '2px dashed #ef4444';
        emptyCard.style.cursor = 'pointer';
        emptyCard.innerHTML = `<i class="fa-solid fa-plus" style="font-size:26px; color:#ef4444; margin-bottom:4px;"></i><span style="font-size:9px; color:#e2e8f0; font-weight:700;">Tambah MP3</span>`;
        emptyCard.onclick = () => bukaInputLagu();
        carousel.appendChild(emptyCard);

        if (cfTitle) cfTitle.innerText = "Belum Ada Lagu MP3";
        if (cfSub) cfSub.innerText = "Klik untuk upload dari komputer";
        if (cfCount) cfCount.innerText = "0 of 0";
        return;
    }

    if (coverFlowIndex >= trackCount) coverFlowIndex = trackCount - 1;
    if (coverFlowIndex < 0) coverFlowIndex = 0;

    playlist.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'coverflow-card';
        const coverBg = item.cover ? `url('${item.cover}')` : 'none';
        card.style.backgroundImage = coverBg;
        if (!item.cover) {
            card.style.background = '#18181b';
            card.style.display = 'flex';
            card.style.alignItems = 'center';
            card.style.justifyContent = 'center';
            card.innerHTML = `<i class="fa-solid fa-music" style="font-size:32px; color:#ef4444;"></i>`;
        }

        const offset = idx - coverFlowIndex;
        if (offset === 0) {
            card.style.transform = `translateX(0px) translateZ(80px) rotateY(0deg)`;
            card.style.opacity = '1';
            card.style.zIndex = '50';
            card.style.filter = 'brightness(1.1)';
        } else if (offset < 0) {
            const dist = Math.abs(offset);
            const xPos = -55 - (dist * 28);
            const zPos = 20 - (dist * 35);
            card.style.transform = `translateX(${xPos}px) translateZ(${zPos}px) rotateY(55deg)`;
            card.style.opacity = `${Math.max(0.3, 1 - dist * 0.22)}`;
            card.style.zIndex = `${30 - dist}`;
            card.style.filter = 'brightness(0.65)';
        } else {
            const dist = offset;
            const xPos = 55 + (dist * 28);
            const zPos = 20 - (dist * 35);
            card.style.transform = `translateX(${xPos}px) translateZ(${zPos}px) rotateY(-55deg)`;
            card.style.opacity = `${Math.max(0.3, 1 - dist * 0.22)}`;
            card.style.zIndex = `${30 - dist}`;
            card.style.filter = 'brightness(0.65)';
        }

        card.onclick = () => {
            if (coverFlowIndex === idx) {
                playTrackByIndex(idx);
            } else {
                coverFlowIndex = idx;
                playMechanicalClick();
                renderCoverFlow();
            }
        };

        carousel.appendChild(card);
    });

    const currentTrack = playlist[coverFlowIndex];
    if (currentTrack) {
        if (cfTitle) cfTitle.innerText = currentTrack.title;
        if (cfSub) cfSub.innerText = `${currentTrack.artist} • ${currentTrack.album || "Single"}`;
        if (cfCount) cfCount.innerText = `${coverFlowIndex + 1} of ${trackCount}`;
    }
}

function stepCoverFlow(direction) {
    playMechanicalClick();
    coverFlowIndex += direction;
    if (coverFlowIndex < 0) coverFlowIndex = 0;
    if (coverFlowIndex >= playlist.length) coverFlowIndex = playlist.length - 1;
    renderCoverFlow();
}

// --- 10. SYNCHRONIZED INTERACTIVE LYRICS ENGINE ---
let isFetchingLyricsNow = false;

function renderLyrics() {
    const scroller = document.getElementById('lyrics-scroller');
    const linesContainer = document.getElementById('lyrics-lines');
    const trackNameHeader = document.getElementById('lyrics-track-name');
    const lyricsBadge = document.getElementById('lyrics-status-badge');
    const track = playlist[currentTrackIndex];
    if (!linesContainer) return;

    if (!track) {
        if (trackNameHeader) trackNameHeader.innerText = "Tidak Ada Lagu";
        if (lyricsBadge) lyricsBadge.innerText = "OFF";
        linesContainer.innerHTML = `
            <div class="lyrics-empty-msg">
                <i class="fa-solid fa-compact-disc" style="font-size:24px; color:#64748b; margin-bottom:8px;"></i>
                <br>Belum ada lagu yang diputar.<br>Pilih lagu dari library terlebih dahulu.
            </div>`;
        return;
    }

    if (trackNameHeader) {
        trackNameHeader.innerText = `${track.title} - ${track.artist}`;
    }

    // Check if lyrics are placeholder or missing -> fetch online!
    const isPlaceholder = !track.lyrics || (track.lyrics.length <= 2 && track.lyrics[0].text && track.lyrics[0].text.includes("Memutar"));

    if (isPlaceholder) {
        linesContainer.innerHTML = `
            <div class="lyrics-empty-msg">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:22px; color:#38bdf8; margin-bottom:10px;"></i>
                <br>Mencari lirik resmi untuk <strong>"${track.title}"</strong>...
                <br><br>
                <button class="lyrics-action-btn" onclick="promptPasteLyrics()"><i class="fa-solid fa-paste"></i> Tempel Lirik Sendiri</button>
            </div>
        `;
        if (lyricsBadge) lyricsBadge.innerText = "SEARCHING...";

        if (!isFetchingLyricsNow) {
            isFetchingLyricsNow = true;
            fetchOnlineLyrics(track.title, track.artist, audioEngine.duration).then(res => {
                isFetchingLyricsNow = false;
                if (res && res.lyrics && res.lyrics.length > 0) {
                    track.lyrics = res.lyrics;
                    track.lyricsType = res.type;
                    if (track.id) updateSongInDB(track.id, { lyrics: res.lyrics });
                    if (currentScreen === 'lyrics') renderLyrics();
                } else {
                    if (linesContainer && currentScreen === 'lyrics') {
                        linesContainer.innerHTML = `
                            <div class="lyrics-empty-msg">
                                <i class="fa-solid fa-file-circle-xmark" style="font-size:22px; color:#94a3b8; margin-bottom:8px;"></i>
                                <br>Lirik otomatis tidak ditemukan.
                                <br><br>
                                <button class="lyrics-action-btn" onclick="promptPasteLyrics()"><i class="fa-solid fa-paste"></i> Tempel Lirik (LRC / Teks)</button>
                            </div>
                        `;
                        if (lyricsBadge) lyricsBadge.innerText = "MANUAL";
                    }
                }
            }).catch(() => {
                isFetchingLyricsNow = false;
            });
        }
        return;
    }

    if (lyricsBadge) {
        lyricsBadge.innerText = track.lyricsType === 'plain' ? 'PLAIN' : 'SYNCED';
    }

    const offsetDisplay = document.getElementById('lyrics-offset-val');
    if (offsetDisplay) {
        const curOff = (track && track.lyricsOffset) ? track.lyricsOffset : 0;
        const sign = curOff > 0 ? '+' : '';
        offsetDisplay.innerText = `${sign}${curOff.toFixed(1)}s`;
    }

    linesContainer.innerHTML = '';
    track.lyrics.forEach((line, idx) => {
        const lineEl = document.createElement('div');
        lineEl.className = 'lyric-line';
        lineEl.id = `lyric-line-${idx}`;
        lineEl.innerText = line.text;
        lineEl.title = `Klik untuk lompat ke ${formatTime(line.time)}`;
        lineEl.onclick = () => {
            playMechanicalClick();
            if (typeof line.time === 'number') {
                audioEngine.currentTime = line.time;
                if (audioEngine.paused) audioEngine.play();
            }
        };
        linesContainer.appendChild(lineEl);
    });

    updateLyricsActiveLine();
}

function updateLyricsActiveLine() {
    if (currentScreen !== 'lyrics') return;
    const track = playlist[currentTrackIndex];
    if (!track || !track.lyrics || track.lyrics.length === 0) return;

    const curTime = audioEngine.currentTime;
    let activeIdx = 0;

    for (let i = 0; i < track.lyrics.length; i++) {
        if (curTime >= track.lyrics[i].time) {
            activeIdx = i;
        }
    }

    const lines = document.querySelectorAll('.lyric-line');
    lines.forEach((el, idx) => {
        if (idx === activeIdx) {
            el.className = 'lyric-line active';
        } else if (idx < activeIdx) {
            el.className = 'lyric-line past';
        } else {
            el.className = 'lyric-line future';
        }
    });

    const activeEl = document.getElementById(`lyric-line-${activeIdx}`);
    if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function scrollLyrics(direction) {
    const scroller = document.getElementById('lyrics-scroller');
    if (scroller) {
        scroller.scrollTop += direction * 35;
    }
}

function adjustLyricsOffset(delta) {
    playMechanicalClick();
    if (currentTrackIndex < 0 || !playlist[currentTrackIndex]) return;
    const track = playlist[currentTrackIndex];
    if (!track.lyrics || !track.lyrics.length) return;

    track.lyricsOffset = Math.round(((track.lyricsOffset || 0) + delta) * 10) / 10;
    track.lyrics.forEach(line => {
        if (typeof line.time === 'number') {
            line.time = Math.max(0, Math.round((line.time + delta) * 100) / 100);
        }
    });

    const offsetDisplay = document.getElementById('lyrics-offset-val');
    if (offsetDisplay) {
        const sign = track.lyricsOffset > 0 ? '+' : '';
        offsetDisplay.innerText = `${sign}${track.lyricsOffset.toFixed(1)}s`;
    }

    if (track.id) {
        updateSongInDB(track.id, { lyrics: track.lyrics, lyricsOffset: track.lyricsOffset });
    }

    renderLyrics();
}

function promptPasteLyrics() {
    playMechanicalClick();
    const track = playlist[currentTrackIndex];
    if (!track) {
        alert("Pilih atau putar lagu terlebih dahulu sebelum menambahkan lirik.");
        return;
    }
    const input = prompt(`Tempel lirik untuk lagu "${track.title}":\n(Mendukung format lirik berwaktu [mm:ss] atau teks lirik biasa)`, "");
    if (!input || !input.trim()) return;

    let parsed = [];
    if (input.includes("[") && input.includes("]")) {
        parsed = parseLRC(input);
    }
    if (parsed.length === 0) {
        const lines = input.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const duration = (audioEngine && audioEngine.duration > 10) ? audioEngine.duration : 180;
        const step = duration / Math.max(1, lines.length);
        parsed = lines.map((text, idx) => ({
            time: Math.round(idx * step * 10) / 10,
            text: text
        }));
    }

    track.lyrics = parsed;
    track.lyricsType = input.includes("[") ? 'synced' : 'plain';
    if (track.id) updateSongInDB(track.id, { lyrics: parsed });
    renderLyrics();
    alert("Lirik berhasil disimpan untuk lagu ini!");
}

// --- 11. SLEEP TIMER ENGINE ---
let sleepRemainingSec = null;
let sleepInterval = null;

function setSleepTimer(seconds) {
    playMechanicalClick();
    if (sleepInterval) clearInterval(sleepInterval);
    
    if (seconds <= 0) {
        sleepRemainingSec = null;
        if (statusSleepIcon) statusSleepIcon.style.display = 'none';
        alert("Sleep Timer dimatikan.");
    } else {
        sleepRemainingSec = seconds;
        if (statusSleepIcon) statusSleepIcon.style.display = 'inline-block';
        alert(`Sleep timer aktif: iPod akan mati dalam ${Math.round(seconds / 60)} menit.`);

        sleepInterval = setInterval(() => {
            if (sleepRemainingSec > 0) {
                sleepRemainingSec--;
                if (sleepRemainingSec <= 5 && audioEngine.volume > 0.05) {
                    audioEngine.volume = Math.max(0, audioEngine.volume - 0.2);
                }
            } else {
                clearInterval(sleepInterval);
                audioEngine.pause();
                isPlaying = false;
                updatePlayStateUI();
                sleepRemainingSec = null;
                if (statusSleepIcon) statusSleepIcon.style.display = 'none';
                audioEngine.volume = currentVolume;
                alert("Sleep Timer selesai: Musik telah berhenti otomatis.");
            }
        }, 1000);
    }
    renderCurrentMenu();
}

// --- 12. RETRO CLOCK & STOPWATCH ENGINE ---
let stopwatchTimeMs = 0;
let stopwatchRunning = false;
let stopwatchInterval = null;

function updateClockDisplay() {
    const clockLarge = document.getElementById('clock-time-large');
    const clockDate = document.getElementById('clock-date-str');
    const ssClock = document.getElementById('ss-clock');
    const now = new Date();

    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');

    if (clockLarge) clockLarge.innerText = `${hours}:${mins}:${secs}`;
    if (ssClock) ssClock.innerText = `${hours}:${mins}`;

    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    if (clockDate) clockDate.innerText = dateStr;
}

setInterval(updateClockDisplay, 1000);
updateClockDisplay();

function toggleStopwatch() {
    playMechanicalClick();
    const swDisplay = document.getElementById('stopwatch-time');
    if (!swDisplay) return;

    if (!stopwatchRunning) {
        stopwatchRunning = true;
        const startTime = Date.now() - stopwatchTimeMs;
        stopwatchInterval = setInterval(() => {
            stopwatchTimeMs = Date.now() - startTime;
            const ms = Math.floor((stopwatchTimeMs % 1000) / 100);
            const s = Math.floor((stopwatchTimeMs / 1000) % 60);
            const m = Math.floor(stopwatchTimeMs / 60000);
            swDisplay.innerText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
        }, 100);
    } else {
        stopwatchRunning = false;
        clearInterval(stopwatchInterval);
    }
}

function resetStopwatch() {
    playMechanicalClick();
    stopwatchRunning = false;
    clearInterval(stopwatchInterval);
    stopwatchTimeMs = 0;
    const swDisplay = document.getElementById('stopwatch-time');
    if (swDisplay) swDisplay.innerText = "00:00.0";
}

// --- 13. RETRO BRICK BREAKOUT CANVAS MINI-GAME ---
let gameAnimationId = null;
let gameRunning = false;
let gameScoreVal = 0;
let gameLivesVal = 3;

let paddle = { x: 125, y: 155, width: 50, height: 7, speed: 0 };
let ball = { x: 150, y: 140, r: 4, dx: 2, dy: -2 };
let bricks = [];
const BRICK_ROWS = 4;
const BRICK_COLS = 6;
const BRICK_COLORS = ['#ef4444', '#f97316', '#22c55e', '#38bdf8'];

function initBrickGame() {
    bricks = [];
    for (let c = 0; c < BRICK_COLS; c++) {
        bricks[c] = [];
        for (let r = 0; r < BRICK_ROWS; r++) {
            bricks[c][r] = { x: 0, y: 0, status: 1, color: BRICK_COLORS[r] };
        }
    }
    paddle.x = 125;
    ball.x = 150;
    ball.y = 140;
    ball.dx = 2;
    ball.dy = -2;
    gameScoreVal = 0;
    gameLivesVal = 3;
    updateGameTopBar();
}

function updateGameTopBar() {
    const sc = document.getElementById('game-score');
    const lv = document.getElementById('game-lives');
    if (sc) sc.innerText = gameScoreVal;
    if (lv) lv.innerText = '❤️'.repeat(Math.max(0, gameLivesVal));
}

function startBrickGame() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    initBrickGame();
    gameRunning = true;
    if (gameAnimationId) cancelAnimationFrame(gameAnimationId);

    const bWidth = 42;
    const bHeight = 10;
    const bPadding = 6;
    const bOffsetTop = 15;
    const bOffsetLeft = 8;

    function draw() {
        if (currentScreen !== 'game') {
            gameRunning = false;
            return;
        }

        ctx.fillStyle = '#030712';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Bricks
        let activeBricks = 0;
        for (let c = 0; c < BRICK_COLS; c++) {
            for (let r = 0; r < BRICK_ROWS; r++) {
                const b = bricks[c][r];
                if (b.status === 1) {
                    activeBricks++;
                    const brickX = c * (bWidth + bPadding) + bOffsetLeft;
                    const brickY = r * (bHeight + bPadding) + bOffsetTop;
                    b.x = brickX;
                    b.y = brickY;
                    ctx.fillStyle = b.color;
                    ctx.shadowColor = b.color;
                    ctx.shadowBlur = 4;
                    ctx.fillRect(brickX, brickY, bWidth, bHeight);
                    ctx.shadowBlur = 0;
                }
            }
        }

        // Draw Paddle
        ctx.fillStyle = '#f8fafc';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
        ctx.shadowBlur = 0;

        // Draw Ball
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.closePath();

        // Ball Collision with Walls
        if (ball.x + ball.dx > canvas.width - ball.r || ball.x + ball.dx < ball.r) {
            ball.dx = -ball.dx;
            playMechanicalClick();
        }
        if (ball.y + ball.dy < ball.r) {
            ball.dy = -ball.dy;
            playMechanicalClick();
        } else if (ball.y + ball.dy > paddle.y - ball.r) {
            if (ball.x >= paddle.x && ball.x <= paddle.x + paddle.width) {
                const hitPos = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
                ball.dx = hitPos * 3;
                ball.dy = -Math.abs(ball.dy);
                playMechanicalClick();
            } else if (ball.y + ball.dy > canvas.height - ball.r) {
                gameLivesVal--;
                updateGameTopBar();
                if (gameLivesVal <= 0) {
                    gameRunning = false;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#ef4444';
                    ctx.font = 'bold 16px "Space Mono", monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 10);
                    ctx.fillStyle = '#cbd5e1';
                    ctx.font = '10px "Plus Jakarta Sans", sans-serif';
                    ctx.fillText('Klik Tombol Tengah untuk Main Lagi', canvas.width / 2, canvas.height / 2 + 15);
                    return;
                } else {
                    ball.x = paddle.x + paddle.width / 2;
                    ball.y = 140;
                    ball.dx = 2;
                    ball.dy = -2;
                }
            }
        }

        // Ball Collision with Bricks
        for (let c = 0; c < BRICK_COLS; c++) {
            for (let r = 0; r < BRICK_ROWS; r++) {
                const b = bricks[c][r];
                if (b.status === 1) {
                    if (ball.x > b.x && ball.x < b.x + bWidth && ball.y > b.y && ball.y < b.y + bHeight) {
                        ball.dy = -ball.dy;
                        b.status = 0;
                        gameScoreVal += 10;
                        updateGameTopBar();
                        playMechanicalClick();
                    }
                }
            }
        }

        if (activeBricks === 0) {
            gameRunning = false;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#22c55e';
            ctx.font = 'bold 16px "Space Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('YOU WIN! 🎉', canvas.width / 2, canvas.height / 2 - 10);
            ctx.fillStyle = '#cbd5e1';
            ctx.font = '10px "Plus Jakarta Sans", sans-serif';
            ctx.fillText('Skor Kamu Sempurna! Klik Tengah untuk Ulangi', canvas.width / 2, canvas.height / 2 + 15);
            return;
        }

        ball.x += ball.dx;
        ball.y += ball.dy;

        gameAnimationId = requestAnimationFrame(draw);
    }

    draw();
}

function movePaddle(deltaX) {
    paddle.x += deltaX;
    if (paddle.x < 4) paddle.x = 4;
    if (paddle.x > 298 - paddle.width - 4) paddle.x = 298 - paddle.width - 4;
}

// --- RETRO MUSIC QUIZ GAME ENGINE ---
let quizScore = 0;
let quizRound = 0;
const MAX_QUIZ_ROUNDS = 5;
let quizTimerInterval = null;
let quizTimeLeft = 10;
let quizChoices = [];
let quizCorrectIndex = 0;
let quizSelectedIndex = 0;
let quizAnswered = false;
let quizPrevTrackIndex = -1;
let quizPrevTime = 0;
let quizPrevPlaying = false;

function startMusicQuiz() {
    playMechanicalClick();
    if (playlist.length < 2) {
        alert("Minimal 2 lagu MP3 diperlukan di memori iPod untuk memainkan Music Quiz!\nSilakan tambahkan lagu MP3 terlebih dahulu.");
        if (playlist.length === 0) bukaInputLagu();
        return;
    }

    initAudioContext();

    // Save previous playback state
    quizPrevTrackIndex = currentTrackIndex;
    quizPrevTime = audioEngine.currentTime;
    quizPrevPlaying = !audioEngine.paused;

    quizScore = 0;
    quizRound = 0;
    switchView('quiz');
    loadQuizQuestion();
}

function stopMusicQuiz() {
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    audioEngine.pause();
    // Restore previous track state
    if (quizPrevTrackIndex >= 0 && quizPrevTrackIndex < playlist.length) {
        loadTrack(quizPrevTrackIndex);
        audioEngine.currentTime = quizPrevTime;
        if (quizPrevPlaying) {
            audioEngine.play().catch(() => {});
        }
    }
}

function loadQuizQuestion() {
    quizRound++;
    const totalRounds = Math.min(MAX_QUIZ_ROUNDS, playlist.length);
    if (quizRound > totalRounds) {
        showQuizGameOver();
        return;
    }

    const roundTag = document.getElementById('quiz-round-tag');
    const scoreBadge = document.getElementById('quiz-score-badge');
    const promptText = document.getElementById('quiz-prompt');
    const timerFill = document.getElementById('quiz-timer-fill');

    if (roundTag) roundTag.innerText = `SOAL ${quizRound}/${totalRounds}`;
    if (scoreBadge) scoreBadge.innerText = `SKOR: ${quizScore}`;
    if (promptText) promptText.innerText = "Dengarkan potongan lagunya, tebak judulnya!";
    if (timerFill) {
        timerFill.style.width = '100%';
        timerFill.classList.remove('warning', 'danger');
    }

    // Pick a random target song
    const targetIdx = Math.floor(Math.random() * playlist.length);
    const targetSong = playlist[targetIdx];

    // Pick 3 distractors
    const otherSongs = playlist.filter((_, i) => i !== targetIdx);
    const shuffledOthers = [...otherSongs].sort(() => Math.random() - 0.5);
    
    let choicesPool = [targetSong.title];
    for (let i = 0; i < Math.min(3, shuffledOthers.length); i++) {
        choicesPool.push(shuffledOthers[i].title);
    }
    // If not enough unique songs, add classic decoys
    const decoys = ["With or Without You", "Where The Streets Have No Name", "Beautiful Day", "Sunday Bloody Sunday", "One", "Elevation"];
    let dIdx = 0;
    while (choicesPool.length < 4 && dIdx < decoys.length) {
        if (!choicesPool.includes(decoys[dIdx])) {
            choicesPool.push(decoys[dIdx]);
        }
        dIdx++;
    }

    // Shuffle final 4 choices
    quizChoices = choicesPool.sort(() => Math.random() - 0.5);
    quizCorrectIndex = quizChoices.indexOf(targetSong.title);
    quizSelectedIndex = 0;
    quizAnswered = false;

    renderQuizChoices();

    // Play 10-second audio snippet
    audioEngine.src = targetSong.src;
    audioEngine.currentTime = 5;
    audioEngine.play().catch(e => console.log("Quiz snippet note:", e));

    // Start 10-second countdown timer
    quizTimeLeft = 10;
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    quizTimerInterval = setInterval(() => {
        quizTimeLeft -= 0.1;
        if (timerFill) {
            const pct = Math.max(0, (quizTimeLeft / 10) * 100);
            timerFill.style.width = `${pct}%`;
            if (pct < 30) {
                timerFill.classList.add('danger');
            } else if (pct < 60) {
                timerFill.classList.add('warning');
            }
        }

        if (quizTimeLeft <= 0) {
            clearInterval(quizTimerInterval);
            answerQuizQuestion(-1);
        }
    }, 100);
}

function renderQuizChoices() {
    const choicesList = document.getElementById('quiz-choices-list');
    if (!choicesList) return;
    choicesList.innerHTML = '';

    const letters = ['A', 'B', 'C', 'D'];
    quizChoices.forEach((title, idx) => {
        const li = document.createElement('li');
        li.className = `quiz-choice-item ${idx === quizSelectedIndex ? 'selected' : ''}`;
        li.innerHTML = `
            <span class="quiz-choice-badge">${letters[idx]}</span>
            <span class="quiz-choice-text">${title}</span>
        `;
        li.onclick = () => {
            if (quizAnswered) return;
            quizSelectedIndex = idx;
            renderQuizChoices();
            answerQuizQuestion(idx);
        };
        choicesList.appendChild(li);
    });
}

function answerQuizQuestion(choiceIdx) {
    if (quizAnswered) return;
    quizAnswered = true;
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    audioEngine.pause();
    playMechanicalClick();

    const choicesList = document.getElementById('quiz-choices-list');
    const promptText = document.getElementById('quiz-prompt');
    const scoreBadge = document.getElementById('quiz-score-badge');

    const items = choicesList ? choicesList.children : [];
    if (items[quizCorrectIndex]) {
        items[quizCorrectIndex].classList.add('correct');
    }

    if (choiceIdx === quizCorrectIndex) {
        const bonus = Math.max(10, Math.floor(quizTimeLeft * 10));
        const pts = 100 + bonus;
        quizScore += pts;
        if (scoreBadge) scoreBadge.innerText = `SKOR: ${quizScore}`;
        if (promptText) promptText.innerText = `Tepat Sekali! +${pts} Poin 🎉`;
    } else {
        if (choiceIdx >= 0 && items[choiceIdx]) {
            items[choiceIdx].classList.add('wrong');
        }
        if (promptText) {
            promptText.innerText = (choiceIdx === -1) ? "Waktu Habis! ⏰" : "Kurang Tepat! 😅";
        }
    }

    setTimeout(() => {
        loadQuizQuestion();
    }, 1800);
}

function showQuizGameOver() {
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    audioEngine.pause();

    const promptText = document.getElementById('quiz-prompt');
    const choicesList = document.getElementById('quiz-choices-list');
    const roundTag = document.getElementById('quiz-round-tag');

    if (roundTag) roundTag.innerText = "SELESAI";
    if (promptText) promptText.innerHTML = `<strong>KUIS SELESAI!</strong><br>Total Skor: <span style="color: #4ade80; font-size: 13px;">${quizScore}</span> Poin`;

    if (choicesList) {
        choicesList.innerHTML = `
            <li class="quiz-choice-item selected" onclick="startMusicQuiz()">
                <span class="quiz-choice-badge">▶</span>
                <span>Main Lagi</span>
            </li>
            <li class="quiz-choice-item" onclick="navigateBack()">
                <span class="quiz-choice-badge">✕</span>
                <span>Kembali ke Menu</span>
            </li>
        `;
    }
}

// --- 14. RETRO VIDEO SYNTHWAVE VISUALIZER ENGINE ---
let videoAnimId = null;

function startVideoVisualizer() {
    const canvas = document.getElementById('video-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let t = 0;

    function renderFrame() {
        if (currentScreen !== 'videos') return;
        t += 0.04;

        ctx.fillStyle = '#060814';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Synthwave Sun
        const sunY = 50;
        const grad = ctx.createLinearGradient(0, 10, 0, 85);
        grad.addColorStop(0, '#f43f5e');
        grad.addColorStop(1, '#fbbf24');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(canvas.width / 2, sunY, 32, 0, Math.PI * 2);
        ctx.fill();

        // 3D Perspective Grid
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1;
        const horizon = 75;

        for (let i = 0; i < 8; i++) {
            const y = horizon + Math.pow(i + (t % 1), 2) * 1.3;
            if (y < canvas.height) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
            }
        }

        for (let x = -canvas.width; x < canvas.width * 2; x += 35) {
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, horizon);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        const isAudioActive = !audioEngine.paused;
        ctx.fillStyle = '#38bdf8';
        for (let b = 0; b < 16; b++) {
            const barH = isAudioActive ? Math.sin(t * 3 + b * 0.8) * 15 + 18 : 4;
            const barW = 8;
            const barX = 20 + b * 16;
            ctx.fillRect(barX, canvas.height - barH, barW, barH);
        }

        videoAnimId = requestAnimationFrame(renderFrame);
    }

    renderFrame();
}

// --- 15. PHOTO GALLERY VIEWER ENGINE ---
const PHOTOS_DATA = [
    { title: "Y2K Aesthetic Skyline", url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80" },
    { title: "Cyber Neon Tokyo", url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80" },
    { title: "Late Night Vinyl Studio", url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=500&auto=format&fit=crop&q=80" },
    { title: "Retro Cassette Tape", url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=80" },
    { title: "Classic Silver Stage", url: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=500&auto=format&fit=crop&q=80" }
];
let currentPhotoIdx = 0;

function renderPhotoViewer() {
    const photoImg = document.getElementById('photo-viewer-img');
    const photoTitle = document.getElementById('photo-title');
    const photoCounter = document.getElementById('photo-counter');
    const curPhoto = PHOTOS_DATA[currentPhotoIdx];
    if (!curPhoto) return;

    if (photoImg) photoImg.src = curPhoto.url;
    if (photoTitle) photoTitle.innerText = curPhoto.title;
    if (photoCounter) photoCounter.innerText = `${currentPhotoIdx + 1} / ${PHOTOS_DATA.length}`;
}

function stepPhotos(direction) {
    playMechanicalClick();
    currentPhotoIdx = (currentPhotoIdx + direction + PHOTOS_DATA.length) % PHOTOS_DATA.length;
    renderPhotoViewer();
}

// --- 16. IDLE RETRO SCREENSAVER ENGINE ---
let screensaverTimer = null;
const IDLE_TIMEOUT_MS = 45000;

function resetScreensaverTimer() {
    const overlay = document.getElementById('screensaver-overlay');
    if (overlay && overlay.classList.contains('active')) {
        overlay.classList.remove('active');
    }

    if (screensaverTimer) clearTimeout(screensaverTimer);
    screensaverTimer = setTimeout(() => {
        if (overlay) {
            updateClockDisplay();
            overlay.classList.add('active');
        }
    }, IDLE_TIMEOUT_MS);
}

['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, resetScreensaverTimer, { passive: true });
});
resetScreensaverTimer();

// --- 17. AUDIO PLAYBACK & SCRUBBING ---
function loadTrack(index) {
    if (!playlist.length || index < 0 || index >= playlist.length) {
        audioEngine.src = "";
        currentTrackIndex = -1;
        updatePlayerUI();
        return;
    }
    currentTrackIndex = index;
    const track = playlist[currentTrackIndex];

    audioEngine.src = track.src;
    audioEngine.volume = currentVolume;
    updatePlayerUI();

    // Check if background online lookup can fetch real official cover / lyrics
    checkAndEnhanceTrackMetadata(track);
}

function playTrackByIndex(index) {
    if (!playlist.length) {
        bukaInputLagu();
        return;
    }
    initAudioContext();
    loadTrack(index);
    audioEngine.play().then(() => {
        isPlaying = true;
        updatePlayStateUI();
        openPlayerView();
    }).catch(err => {
        console.warn("Autoplay notice:", err);
        openPlayerView();
    });
}

function togglePlayPause() {
    if (!playlist.length) {
        bukaInputLagu();
        return;
    }
    initAudioContext();
    playMechanicalClick();

    if (!audioEngine.src && playlist.length > 0) {
        loadTrack(0);
    }

    if (audioEngine.paused && audioEngine.src) {
        audioEngine.play().then(() => {
            isPlaying = true;
            updatePlayStateUI();
        }).catch(e => console.log(e));
    } else if (!audioEngine.paused) {
        audioEngine.pause();
        isPlaying = false;
        updatePlayStateUI();
    }
}

function playNextTrack() {
    if (!playlist.length) return;
    playMechanicalClick();
    if (isShuffle) {
        let randIdx = Math.floor(Math.random() * playlist.length);
        if (randIdx === currentTrackIndex && playlist.length > 1) {
            randIdx = (randIdx + 1) % playlist.length;
        }
        playTrackByIndex(randIdx);
    } else {
        let nextIdx = (currentTrackIndex + 1) % playlist.length;
        playTrackByIndex(nextIdx);
    }
}

function playPrevTrack() {
    if (!playlist.length) return;
    playMechanicalClick();
    if (audioEngine.currentTime > 3) {
        audioEngine.currentTime = 0;
        return;
    }
    let prevIdx = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    playTrackByIndex(prevIdx);
}

function updatePlayStateUI() {
    const isAudioPlaying = !audioEngine.paused && audioEngine.currentTime > 0;
    
    if (statusPlayIcon) {
        statusPlayIcon.innerHTML = isAudioPlaying 
            ? '<i class="fa-solid fa-play"></i>' 
            : '<i class="fa-solid fa-pause"></i>';
    }

    const vinyl = document.querySelector('.spin-vinyl');
    if (vinyl) {
        vinyl.classList.toggle('playing', isAudioPlaying);
    }

    if (equalizerBars) {
        equalizerBars.classList.toggle('playing', isAudioPlaying);
    }
}

function updatePlayerUI() {
    if (!playlist.length || currentTrackIndex < 0 || currentTrackIndex >= playlist.length) {
        if (playerTrackTitle) playerTrackTitle.innerText = "Tidak Ada Lagu";
        if (playerTrackArtist) playerTrackArtist.innerText = "Upload MP3 dari komputermu";
        if (playerTrackAlbum) playerTrackAlbum.innerText = "iPod Kosong";
        if (albumCoverImg) {
            albumCoverImg.style.display = 'none';
            if (albumFallbackArt) albumFallbackArt.style.display = 'flex';
        }
        if (playerProgressFill) playerProgressFill.style.width = '0%';
        if (timeCurrent) timeCurrent.innerText = "0:00";
        if (timeRemaining) timeRemaining.innerText = "-0:00";
        updatePlayStateUI();
        updateVolumeUI();
        return;
    }

    const track = playlist[currentTrackIndex];
    if (playerTrackTitle) playerTrackTitle.innerText = track.title;
    if (playerTrackArtist) playerTrackArtist.innerText = track.artist;
    if (playerTrackAlbum) playerTrackAlbum.innerText = track.album || "U2 Special Edition";

    if (track.cover && albumCoverImg) {
        albumCoverImg.style.display = 'block';
        albumCoverImg.src = track.cover;
        if (albumFallbackArt) albumFallbackArt.style.display = 'none';
    } else if (albumCoverImg && albumFallbackArt) {
        albumCoverImg.style.display = 'none';
        albumFallbackArt.style.display = 'flex';
    }

    updatePlayStateUI();
    updateVolumeUI();
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

audioEngine.addEventListener('timeupdate', () => {
    if (isNaN(audioEngine.duration) || audioEngine.duration <= 0) return;
    const progress = (audioEngine.currentTime / audioEngine.duration) * 100;
    if (playerProgressFill) playerProgressFill.style.width = `${progress}%`;

    if (timeCurrent) timeCurrent.innerText = formatTime(audioEngine.currentTime);
    const rem = audioEngine.duration - audioEngine.currentTime;
    if (timeRemaining) timeRemaining.innerText = `-${formatTime(rem)}`;

    updateLyricsActiveLine();
});

audioEngine.addEventListener('ended', () => {
    if (repeatMode === 'one') {
        audioEngine.currentTime = 0;
        audioEngine.play();
    } else if (repeatMode === 'all' || isShuffle) {
        playNextTrack();
    } else {
        if (currentTrackIndex < playlist.length - 1) {
            playNextTrack();
        } else {
            isPlaying = false;
            updatePlayStateUI();
        }
    }
});

audioEngine.addEventListener('play', () => updatePlayStateUI());
audioEngine.addEventListener('pause', () => updatePlayStateUI());

// Scrubber Progress Bar click
const scrubBarClickable = document.getElementById('scrub-bar-clickable');
if (scrubBarClickable) {
    scrubBarClickable.addEventListener('click', (e) => {
        if (!audioEngine.duration) return;
        const rect = scrubBarClickable.getBoundingClientRect();
        const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audioEngine.currentTime = clickRatio * audioEngine.duration;
        playMechanicalClick();
    });
}

// Click on Album Art flips to Lyrics
const playerArtEl = document.getElementById('player-art');
if (playerArtEl) {
    playerArtEl.addEventListener('click', () => {
        playMechanicalClick();
        switchView('lyrics');
    });
}

// --- 18. VOLUME SYSTEM & HUD POPUP ---
function setVolume(newVol, showHud = true) {
    currentVolume = Math.max(0, Math.min(1, Math.round(newVol * 100) / 100));
    audioEngine.volume = currentVolume;
    updateVolumeUI();

    if (showHud) {
        showVolumeHud();
    }
    savePreferences();
}

function changeVolume(delta) {
    playMechanicalClick();
    setVolume(currentVolume + delta, true);
}

function showVolumeHud() {
    if (!volumeHudPopup) return;
    volumeHudPopup.classList.add('visible');
    
    if (hudTimeout) clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => {
        volumeHudPopup.classList.remove('visible');
    }, 1800);
}

function updateVolumeUI() {
    const percent = Math.round(currentVolume * 100);
    const percentStr = `${percent}%`;

    if (playerVolFill) playerVolFill.style.width = percentStr;
    if (hudBarFill) hudBarFill.style.width = percentStr;
    if (hudVolPercent) hudVolPercent.innerText = percentStr;
    if (volNumericLabel) volNumericLabel.innerText = percentStr;
    if (toolbarVolText) toolbarVolText.innerText = percentStr;
}

function setupVolumeBarInteractivity() {
    function handleBarMove(e, barEl) {
        const rect = barEl.getBoundingClientRect();
        const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
        const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const newVol = clickX / rect.width;
        setVolume(newVol, true);
    }

    [volBarClickable, hudBarTrack].forEach(bar => {
        if (!bar) return;
        let isBarDragging = false;

        bar.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            isBarDragging = true;
            try { bar.setPointerCapture(e.pointerId); } catch(err) {}
            playMechanicalClick();
            handleBarMove(e, bar);
        });

        bar.addEventListener('pointermove', (e) => {
            if (!isBarDragging) return;
            e.stopPropagation();
            handleBarMove(e, bar);
        });

        const stopDrag = () => { isBarDragging = false; };
        bar.addEventListener('pointerup', stopDrag);
        bar.addEventListener('pointercancel', stopDrag);
    });
}
setupVolumeBarInteractivity();

// --- 19. ROTARY CLICK WHEEL GESTURE & MULTI-INPUT HANDLING ---
let isDragging = false;
let startAngle = 0;
let accumulatedAngle = 0;
const DEGREE_STEP = 18;

function getAngleFromEvent(e) {
    const rect = clickWheel.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
    const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;

    const rad = Math.atan2(clientY - centerY, clientX - centerX);
    return rad * (180 / Math.PI);
}

// Touch & Pointer Down
clickWheel.addEventListener('pointerdown', (e) => {
    if (isHoldLocked) {
        flashHoldLock();
        return;
    }
    if (e.target.closest('.center-button') || e.target.closest('.wheel-btn')) {
        return;
    }
    e.preventDefault();
    isDragging = true;
    startAngle = getAngleFromEvent(e);
    accumulatedAngle = 0;
    try { clickWheel.setPointerCapture(e.pointerId); } catch(err) {}
});

// Pointer Move
clickWheel.addEventListener('pointermove', (e) => {
    if (isHoldLocked || !isDragging) return;
    e.preventDefault();
    const currentAngle = getAngleFromEvent(e);
    let delta = currentAngle - startAngle;

    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    accumulatedAngle += delta;
    startAngle = currentAngle;

    if (Math.abs(accumulatedAngle) >= DEGREE_STEP) {
        const steps = Math.floor(Math.abs(accumulatedAngle) / DEGREE_STEP);
        const direction = accumulatedAngle > 0 ? 1 : -1;

        for (let i = 0; i < steps; i++) {
            handleWheelStep(direction);
        }

        accumulatedAngle %= DEGREE_STEP;
    }
});

function handleWheelStep(direction) {
    if (isHoldLocked) return;
    playMechanicalClick();

    if (currentScreen === 'menu') {
        const menuDef = MENUS[currentMenuId];
        const items = menuDef.dynamic ? menuDef.getItems() : menuDef.items;
        selectedIndex += direction;
        if (selectedIndex < 0) selectedIndex = 0;
        if (selectedIndex >= items.length) selectedIndex = items.length - 1;
        renderCurrentMenu();
    } else if (currentScreen === 'player') {
        setVolume(currentVolume + (direction * 0.05), true);
    } else if (currentScreen === 'visualizer') {
        setVolume(currentVolume + (direction * 0.05), true);
    } else if (currentScreen === 'coverflow') {
        stepCoverFlow(direction);
    } else if (currentScreen === 'lyrics') {
        scrollLyrics(direction);
    } else if (currentScreen === 'photos') {
        stepPhotos(direction);
    } else if (currentScreen === 'game') {
        movePaddle(direction * 14);
    } else if (currentScreen === 'quiz') {
        if (!quizAnswered && quizChoices.length > 0) {
            quizSelectedIndex = Math.max(0, Math.min(quizChoices.length - 1, quizSelectedIndex + direction));
            renderQuizChoices();
        }
    }
}

clickWheel.addEventListener('pointerup', () => { isDragging = false; });
clickWheel.addEventListener('pointercancel', () => { isDragging = false; });

// Wheel buttons click events
btnMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isHoldLocked) { flashHoldLock(); return; }
    if (currentScreen === 'clock' && stopwatchRunning) {
        resetStopwatch();
    } else {
        navigateBack();
    }
});

btnPlay.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isHoldLocked) { flashHoldLock(); return; }
    togglePlayPause();
});

btnNext.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isHoldLocked) { flashHoldLock(); return; }
    if (currentScreen === 'photos') {
        stepPhotos(1);
    } else {
        playNextTrack();
    }
});

btnPrev.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isHoldLocked) { flashHoldLock(); return; }
    if (currentScreen === 'photos') {
        stepPhotos(-1);
    } else {
        playPrevTrack();
    }
});

btnCenter.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isHoldLocked) { flashHoldLock(); return; }
    playMechanicalClick();

    if (currentScreen === 'menu') {
        selectCurrentMenuItem();
    } else if (currentScreen === 'player') {
        switchView('visualizer');
    } else if (currentScreen === 'visualizer') {
        cycleVisualizerMode();
    } else if (currentScreen === 'coverflow') {
        playTrackByIndex(coverFlowIndex);
    } else if (currentScreen === 'lyrics') {
        switchView('player');
    } else if (currentScreen === 'clock') {
        toggleStopwatch();
    } else if (currentScreen === 'game') {
        startBrickGame();
    } else if (currentScreen === 'quiz') {
        if (!quizAnswered) {
            answerQuizQuestion(quizSelectedIndex);
        } else {
            const choicesList = document.getElementById('quiz-choices-list');
            if (choicesList && choicesList.children.length === 2) {
                if (quizSelectedIndex === 0) {
                    startMusicQuiz();
                } else {
                    navigateBack();
                }
            }
        }
    } else if (currentScreen === 'photos') {
        stepPhotos(1);
    } else if (currentScreen === 'about' || currentScreen === 'videos') {
        switchView('menu');
    }
});

// Comprehensive Keyboard controls
window.addEventListener('keydown', (e) => {
    if (isHoldLocked) {
        if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace', ' '].includes(e.key)) {
            flashHoldLock();
            return;
        }
    }
    if (e.key === 'ArrowDown') {
        if (currentScreen === 'player' || currentScreen === 'visualizer') {
            changeVolume(-0.05);
        } else {
            handleWheelStep(1);
        }
    } else if (e.key === 'ArrowUp') {
        if (currentScreen === 'player' || currentScreen === 'visualizer') {
            changeVolume(0.05);
        } else {
            handleWheelStep(-1);
        }
    } else if (e.key === '+' || e.key === '=' || e.key === ']') {
        changeVolume(0.05);
    } else if (e.key === '-' || e.key === '_' || e.key === '[') {
        changeVolume(-0.05);
    } else if (e.key === 'Enter') {
        btnCenter.click();
    } else if (e.key === 'Escape' || e.key === 'Backspace') {
        btnMenu.click();
    } else if (e.key === ' ') {
        btnPlay.click();
    } else if (e.key === 'ArrowRight') {
        btnNext.click();
    } else if (e.key === 'ArrowLeft') {
        btnPrev.click();
    }
});

// Mouse scroll wheel anywhere over iPod
const ipodEl = document.getElementById('ipod');
if (ipodEl) {
    ipodEl.addEventListener('wheel', (e) => {
        if (isHoldLocked) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        if (currentScreen === 'player' || currentScreen === 'visualizer') {
            changeVolume(delta);
        } else {
            handleWheelStep(e.deltaY > 0 ? 1 : -1);
        }
    }, { passive: false });
}

// --- 20. LOCAL MP3 FILE PICKER & DRAG-AND-DROP ENGINE ---
function bukaInputLagu() {
    playMechanicalClick();
    if (mp3FileInput) mp3FileInput.click();
}

async function handleUploadedFiles(files) {
    const fileList = Array.from(files);
    const audioFiles = [];
    const lrcFiles = [];

    fileList.forEach(f => {
        if (f.name.toLowerCase().endsWith('.lrc')) {
            lrcFiles.push(f);
        } else {
            audioFiles.push(f);
        }
    });

    for (const file of audioFiles) {
        const fileUrl = URL.createObjectURL(file);
        const cleanTitle = file.name.replace(/\.[^/.]+$/, "");

        let meta = null;
        try {
            meta = await parseID3Tags(file);
        } catch(e) {}

        let finalTitle = (meta && meta.title && meta.title.length > 0) ? meta.title : cleanTitle;
        let finalArtist = (meta && meta.artist && meta.artist.length > 0) ? meta.artist : "Local Artist";
        let finalAlbum = (meta && meta.album && meta.album.length > 0) ? meta.album : "Uploaded MP3";
        let finalCover = (meta && meta.coverUrl) ? meta.coverUrl : null;
        let finalLyrics = (meta && meta.lyrics) ? meta.lyrics : null;
        let finalLyricsType = finalLyrics ? 'synced' : null;

        // Check if an accompanying .lrc file was uploaded in the same batch
        const matchedLrc = lrcFiles.find(l => {
            const lrcBase = l.name.replace(/\.lrc$/i, "").toLowerCase();
            return lrcBase === cleanTitle.toLowerCase() || lrcBase === finalTitle.toLowerCase();
        });

        if (matchedLrc) {
            try {
                const lrcText = await matchedLrc.text();
                const parsed = parseLRC(lrcText);
                if (parsed.length > 0) {
                    finalLyrics = parsed;
                    finalLyricsType = 'synced';
                }
            } catch(e) {}
        }

        // Online fetching for cover artwork if missing or generic
        if (!finalCover) {
            try {
                const onlineMeta = await fetchOnlineArtwork(finalTitle, finalArtist);
                if (onlineMeta && onlineMeta.cover) {
                    finalCover = onlineMeta.cover;
                    if (onlineMeta.artist && finalArtist === "Local Artist") finalArtist = onlineMeta.artist;
                    if (onlineMeta.album && finalAlbum === "Uploaded MP3") finalAlbum = onlineMeta.album;
                }
            } catch(e) {}
        }
        if (!finalCover) {
            finalCover = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300";
        }

        // Online fetching for lyrics if missing
        if (!finalLyrics) {
            try {
                const onlineLrc = await fetchOnlineLyrics(finalTitle, finalArtist, null);
                if (onlineLrc && onlineLrc.lyrics) {
                    finalLyrics = onlineLrc.lyrics;
                    finalLyricsType = onlineLrc.type;
                }
            } catch(e) {}
        }

        if (!finalLyrics) {
            finalLyrics = [
                { time: 0, text: `Memutar file: ${finalTitle}` },
                { time: 5, text: `Artis: ${finalArtist} • Album: ${finalAlbum}` }
            ];
            finalLyricsType = 'plain';
        }

        const songObj = {
            title: finalTitle,
            artist: finalArtist,
            album: finalAlbum,
            cover: finalCover,
            duration: "--:--",
            src: fileUrl,
            isCustom: true,
            lyrics: finalLyrics,
            lyricsType: finalLyricsType
        };

        // Add to active playlist
        playlist.unshift(songObj);

        // Save to IndexedDB so it persists on page refresh!
        saveCustomSongToDB({
            title: songObj.title,
            artist: songObj.artist,
            album: songObj.album,
            cover: finalCover,
            lyrics: finalLyrics,
            lyricsType: finalLyricsType,
            duration: songObj.duration,
            blob: file
        }).then(newId => {
            if (newId) songObj.id = newId;
        });
    }

    // Standalone .lrc files uploaded
    if (audioFiles.length === 0 && lrcFiles.length > 0) {
        for (const lrcFile of lrcFiles) {
            try {
                const text = await lrcFile.text();
                const parsed = parseLRC(text);
                if (parsed.length > 0) {
                    const lrcBase = lrcFile.name.replace(/\.lrc$/i, "").toLowerCase();
                    let targetTrack = playlist.find(t => t.title.toLowerCase().includes(lrcBase) || lrcBase.includes(t.title.toLowerCase()));
                    if (!targetTrack && currentTrackIndex >= 0 && playlist[currentTrackIndex]) {
                        targetTrack = playlist[currentTrackIndex];
                    }
                    if (targetTrack) {
                        targetTrack.lyrics = parsed;
                        targetTrack.lyricsType = 'synced';
                        if (targetTrack.id) {
                            updateSongInDB(targetTrack.id, { lyrics: parsed, lyricsType: 'synced' });
                        }
                    }
                }
            } catch(e) {}
        }
        if (currentView === 'lyrics') {
            renderLyrics();
        }
    }

    playMechanicalClick();
    renderCurrentMenu();
    renderCoverFlow();
    if (audioFiles.length > 0) {
        playTrackByIndex(0);
    }
}

if (mp3FileInput) {
    mp3FileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length) {
            handleUploadedFiles(e.target.files);
        }
    });
}

// Drag & Drop MP3 directly onto iPod
function setupDragAndDrop() {
    const chassis = document.getElementById('ipod');
    if (!chassis) return;

    ['dragenter', 'dragover'].forEach(name => {
        chassis.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            chassis.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(name => {
        chassis.addEventListener(name, (e) => {
            e.preventDefault();
            e.stopPropagation();
            chassis.classList.remove('drag-over');
        });
    });

    chassis.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files).filter(f => 
            f.type.startsWith('audio/') || 
            f.name.toLowerCase().endsWith('.mp3') || 
            f.name.toLowerCase().endsWith('.wav') || 
            f.name.toLowerCase().endsWith('.m4a') || 
            f.name.toLowerCase().endsWith('.flac') || 
            f.name.toLowerCase().endsWith('.ogg') ||
            f.name.toLowerCase().endsWith('.lrc')
        );
        if (files.length > 0) {
            handleUploadedFiles(files);
        }
    });
}
setupDragAndDrop();

async function deleteSongByIndex(index, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (index < 0 || index >= playlist.length) return;
    const targetSong = playlist[index];
    playMechanicalClick();

    if (!confirm(`Hapus lagu "${targetSong.title}" dari iPod?`)) return;

    const wasCurrent = (index === currentTrackIndex);
    const songId = targetSong.id;
    const songTitle = targetSong.title;

    // 1. Delete from IndexedDB
    if (songId) {
        try {
            const db = await openDatabase();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(songId);
        } catch(e) {
            console.warn("Gagal hapus lagu dari DB:", e);
        }
    }

    // 2. Remove from custom playlists in localStorage
    try {
        let lists = getCustomPlaylists();
        lists.forEach(pl => {
            if (pl.songs) {
                pl.songs = pl.songs.filter(name => name !== songTitle);
            }
        });
        saveCustomPlaylists(lists);
    } catch(e) {}

    // 3. Remove from playlist memory
    playlist.splice(index, 1);

    // 4. Update playback & active index
    if (playlist.length === 0) {
        currentTrackIndex = -1;
        audioEngine.pause();
        audioEngine.src = "";
    } else if (wasCurrent) {
        currentTrackIndex = Math.min(index, playlist.length - 1);
        loadTrack(currentTrackIndex);
        if (isPlaying) {
            audioEngine.play().catch(() => {});
        }
    } else if (index < currentTrackIndex) {
        currentTrackIndex--;
    }

    updatePlayerUI();
    renderCurrentMenu();
    renderCoverFlow();
    if (currentScreen === 'lyrics') renderLyrics();
}

function deleteCurrentSong() {
    playMechanicalClick();
    if (currentTrackIndex < 0 || !playlist[currentTrackIndex]) {
        alert("Tidak ada lagu yang sedang diputar untuk dihapus.");
        return;
    }
    deleteSongByIndex(currentTrackIndex);
}

async function clearAllSongs(silent = false) {
    playMechanicalClick();
    if (!playlist.length && !silent) {
        alert("iPod sudah kosong. Belum ada file MP3 yang tersimpan.");
        return;
    }
    if (silent || confirm("Hapus semua file MP3 dari memori iPod?")) {
        audioEngine.pause();
        audioEngine.src = "";
        playlist = [];
        currentTrackIndex = -1;
        try {
            const db = await openDatabase();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).clear();
        } catch(e) {}
        localStorage.removeItem('ipod_custom_playlists');
        updatePlayerUI();
        renderCurrentMenu();
        renderCoverFlow();
        if (currentView === 'lyrics') renderLyrics();
        if (!silent) alert("Semua file MP3 berhasil dihapus dari memori iPod.");
    }
}

function resetPlaylist() {
    clearAllSongs();
}

async function resetDefaultSongs() {
    playMechanicalClick();
    if (confirm("Muat kembali lagu bawaan (Helena, Cancer, Blinding Lights) ke dalam iPod?")) {
        DEFAULT_PLAYLIST.forEach(def => {
            const exists = playlist.some(t => t.title.toLowerCase() === def.title.toLowerCase());
            if (!exists) {
                playlist.push({ ...def });
            }
        });
        if (currentTrackIndex === -1 && playlist.length > 0) {
            currentTrackIndex = 0;
            loadTrack(0);
        }
        updatePlayerUI();
        renderCurrentMenu();
        renderCoverFlow();
        alert("Lagu bawaan berhasil dimuat ke memori iPod!");
    }
}

// --- PROGRESSIVE WEB APP (PWA) REGISTRATION & INSTALLATION ---
let deferredInstallPrompt = null;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('iPod PWA ServiceWorker aktif:', reg.scope))
            .catch(err => console.log('ServiceWorker note:', err));
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btnInstallPwa) {
        btnInstallPwa.style.display = 'inline-flex';
    }
});

function triggerPWAInstall() {
    playMechanicalClick();
    if (!deferredInstallPrompt) {
        alert("iPod Classic Simulator siap diinstal! Di browser Google Chrome / Microsoft Edge, klik ikon Install ⊕ di address bar atas untuk memasang di desktop.");
        return;
    }
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('User installed iPod Classic PWA');
        }
        deferredInstallPrompt = null;
        if (btnInstallPwa) btnInstallPwa.style.display = 'none';
    });
}

// --- 21. INITIAL LAUNCH ---
restorePreferences();
loadCustomSongsFromDB();
updatePlayerUI();
renderCurrentMenu();
updateVolumeUI();
