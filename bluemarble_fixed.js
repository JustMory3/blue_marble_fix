// ==UserScript==
// @name         Blue Marble
// @namespace    https://github.com/SwingTheVine/
// @version      0.88.0
// @description  A userscript to automate and/or enhance the user experience on Wplace.live. Make sure to comply with the site's Terms of Service, and rules! This script is not affiliated with Wplace.live in any way, use at your own risk. This script is not affiliated with TamperMonkey. The author of this userscript is not responsible for any damages, issues, loss of data, or punishment that may occur as a result of using this script. This script is provided "as is" under the MPL-2.0 license. The "Blue Marble" icon is licensed under CC0 1.0 Universal (CC0 1.0) Public Domain Dedication. The image is owned by NASA.
// @author       SwingTheVine
// @license      MPL-2.0
// @supportURL   https://discord.gg/tpeBPy46hf
// @homepageURL  https://bluemarble.lol/
// @icon         https://raw.githubusercontent.com/SwingTheVine/Wplace-BlueMarble/0c760b903739e6214f7b8990ffc4089a93e73bd2/dist/assets/Favicon.png
// @updateURL    https://raw.githubusercontent.com/SwingTheVine/Wplace-BlueMarble/main/dist/BlueMarble.user.js
// @downloadURL  https://raw.githubusercontent.com/SwingTheVine/Wplace-BlueMarble/main/dist/BlueMarble.user.js
// @match        https://wplace.live/*
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      telemetry.thebluecorner.net
// @resource     CSS-BM-File https://raw.githubusercontent.com/SwingTheVine/Wplace-BlueMarble/0c760b903739e6214f7b8990ffc4089a93e73bd2/dist/BlueMarble.user.css
// @noframes
// ==/UserScript==

// FIX NOTE: Changed `@grant GM.setValue` to `@grant GM_setValue` (with underscore).
// Greasemonkey 4+ uses GM.setValue (Promise-based), but Tampermonkey uses GM_setValue (sync/callback).
// The original header had `@grant GM.setValue` which is the GM4 API, but the code also
// used GM_getValue (sync), creating an inconsistency. We normalize everything to use
// the underscore variants (GM_setValue, GM_getValue) which work in both Tampermonkey
// and modern Greasemonkey via polyfill. All GM.setValue() calls in the code are also
// replaced with GM_setValue() below.

// Wplace  --> https://wplace.live
// License --> https://www.mozilla.org/en-US/MPL/2.0/

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: UTILITY HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    const SCRIPT_NAME = GM_info.script.name.toString();
    const SCRIPT_VERSION = GM_info.script.version.toString();

    function logError(...args) {
        (0, console.error)(...args);
    }

    // FIX NOTE: The original script used a WeakSet-based private field emulation
    // pattern (common in older Babel/TypeScript transpiled output). This can break
    // if the WeakSet is not initialized before use, or if the class instance is
    // created in a different scope. We preserve the pattern but ensure the WeakSet
    // is always initialized before any method runs.

    // Converts a number to a base-N string using a custom character alphabet.
    function numberToCustomBase(num, alphabet) {
        if (num === 0) return alphabet[0];
        let result = '';
        const base = alphabet.length;
        while (num > 0) {
            result = alphabet[num % base] + result;
            num = Math.floor(num / base);
        }
        return result;
    }

    // Converts a Uint8Array to a base64 string.
    function uint8ArrayToBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Converts a base64 string back to a Uint8Array.
    function base64ToUint8Array(b64) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    // Safely escapes HTML to prevent XSS when inserting usernames, etc.
    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: GM API COMPATIBILITY WRAPPER
    // ─────────────────────────────────────────────────────────────────────────

    // FIX NOTE: The original used both `GM.setValue` (Greasemonkey 4 async API)
    // and `GM_getValue` (Tampermonkey sync API) inconsistently. This wrapper
    // normalizes them. GM_setValue in Tampermonkey is synchronous; in GM4 it
    // returns a Promise. We wrap them so callers can always `await` the result.
    const Storage = {
        get(key, defaultValue = '{}') {
            try {
                // GM_getValue is synchronous in Tampermonkey
                return GM_getValue(key, defaultValue);
            } catch (e) {
                logError('Storage.get failed:', e);
                return defaultValue;
            }
        },
        set(key, value) {
            try {
                // FIX NOTE: Original used GM.setValue (with dot, GM4 async API).
                // Changed to GM_setValue (underscore) which works in Tampermonkey.
                // Both accept the same arguments; the underscore version is sync.
                GM_setValue(key, value);
            } catch (e) {
                logError('Storage.set failed:', e);
            }
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: COLOR PALETTE DATA
    // ─────────────────────────────────────────────────────────────────────────

    const COLOR_PALETTE = [
        { id: 0,  premium: false, name: 'Transparent',      rgb: [0,   0,   0]   },
        { id: 1,  premium: false, name: 'Black',            rgb: [0,   0,   0]   },
        { id: 2,  premium: false, name: 'Dark Gray',        rgb: [60,  60,  60]  },
        { id: 3,  premium: false, name: 'Gray',             rgb: [120, 120, 120] },
        { id: 4,  premium: false, name: 'Light Gray',       rgb: [210, 210, 210] },
        { id: 5,  premium: false, name: 'White',            rgb: [255, 255, 255] },
        { id: 6,  premium: false, name: 'Deep Red',         rgb: [96,  0,   24]  },
        { id: 7,  premium: false, name: 'Red',              rgb: [237, 28,  36]  },
        { id: 8,  premium: false, name: 'Orange',           rgb: [255, 127, 39]  },
        { id: 9,  premium: false, name: 'Gold',             rgb: [246, 170, 9]   },
        { id: 10, premium: false, name: 'Yellow',           rgb: [249, 221, 59]  },
        { id: 11, premium: false, name: 'Light Yellow',     rgb: [255, 250, 188] },
        { id: 12, premium: false, name: 'Dark Green',       rgb: [14,  185, 104] },
        { id: 13, premium: false, name: 'Green',            rgb: [19,  230, 123] },
        { id: 14, premium: false, name: 'Light Green',      rgb: [135, 255, 94]  },
        { id: 15, premium: false, name: 'Dark Teal',        rgb: [12,  129, 110] },
        { id: 16, premium: false, name: 'Teal',             rgb: [16,  174, 166] },
        { id: 17, premium: false, name: 'Light Teal',       rgb: [19,  225, 190] },
        { id: 18, premium: false, name: 'Dark Blue',        rgb: [40,  80,  158] },
        { id: 19, premium: false, name: 'Blue',             rgb: [64,  147, 228] },
        { id: 20, premium: false, name: 'Cyan',             rgb: [96,  247, 242] },
        { id: 21, premium: false, name: 'Indigo',           rgb: [107, 80,  246] },
        { id: 22, premium: false, name: 'Light Indigo',     rgb: [153, 177, 251] },
        { id: 23, premium: false, name: 'Dark Purple',      rgb: [120, 12,  153] },
        { id: 24, premium: false, name: 'Purple',           rgb: [170, 56,  185] },
        { id: 25, premium: false, name: 'Light Purple',     rgb: [224, 159, 249] },
        { id: 26, premium: false, name: 'Dark Pink',        rgb: [203, 0,   122] },
        { id: 27, premium: false, name: 'Pink',             rgb: [236, 31,  128] },
        { id: 28, premium: false, name: 'Light Pink',       rgb: [243, 141, 169] },
        { id: 29, premium: false, name: 'Dark Brown',       rgb: [104, 70,  52]  },
        { id: 30, premium: false, name: 'Brown',            rgb: [149, 104, 42]  },
        { id: 31, premium: false, name: 'Beige',            rgb: [248, 178, 119] },
        { id: 32, premium: true,  name: 'Medium Gray',      rgb: [170, 170, 170] },
        { id: 33, premium: true,  name: 'Dark Red',         rgb: [165, 14,  30]  },
        { id: 34, premium: true,  name: 'Light Red',        rgb: [250, 128, 114] },
        { id: 35, premium: true,  name: 'Dark Orange',      rgb: [228, 92,  26]  },
        { id: 36, premium: true,  name: 'Light Tan',        rgb: [214, 181, 148] },
        { id: 37, premium: true,  name: 'Dark Goldenrod',   rgb: [156, 132, 49]  },
        { id: 38, premium: true,  name: 'Goldenrod',        rgb: [197, 173, 49]  },
        { id: 39, premium: true,  name: 'Light Goldenrod',  rgb: [232, 212, 95]  },
        { id: 40, premium: true,  name: 'Dark Olive',       rgb: [74,  107, 58]  },
        { id: 41, premium: true,  name: 'Olive',            rgb: [90,  148, 74]  },
        { id: 42, premium: true,  name: 'Light Olive',      rgb: [132, 197, 115] },
        { id: 43, premium: true,  name: 'Dark Cyan',        rgb: [15,  121, 159] },
        { id: 44, premium: true,  name: 'Light Cyan',       rgb: [187, 250, 242] },
        { id: 45, premium: true,  name: 'Light Blue',       rgb: [125, 199, 255] },
        { id: 46, premium: true,  name: 'Dark Indigo',      rgb: [77,  49,  184] },
        { id: 47, premium: true,  name: 'Dark Slate Blue',  rgb: [74,  66,  132] },
        { id: 48, premium: true,  name: 'Slate Blue',       rgb: [122, 113, 196] },
        { id: 49, premium: true,  name: 'Light Slate Blue', rgb: [181, 174, 241] },
        { id: 50, premium: true,  name: 'Light Brown',      rgb: [219, 164, 99]  },
        { id: 51, premium: true,  name: 'Dark Beige',       rgb: [209, 128, 81]  },
        { id: 52, premium: true,  name: 'Light Beige',      rgb: [255, 197, 165] },
        { id: 53, premium: true,  name: 'Dark Peach',       rgb: [155, 82,  73]  },
        { id: 54, premium: true,  name: 'Peach',            rgb: [209, 128, 120] },
        { id: 55, premium: true,  name: 'Light Peach',      rgb: [250, 182, 164] },
        { id: 56, premium: true,  name: 'Dark Tan',         rgb: [123, 99,  82]  },
        { id: 57, premium: true,  name: 'Tan',              rgb: [156, 132, 107] },
        { id: 58, premium: true,  name: 'Dark Slate',       rgb: [51,  57,  65]  },
        { id: 59, premium: true,  name: 'Slate',            rgb: [109, 117, 141] },
        { id: 60, premium: true,  name: 'Light Slate',      rgb: [179, 185, 209] },
        { id: 61, premium: true,  name: 'Dark Stone',       rgb: [109, 100, 63]  },
        { id: 62, premium: true,  name: 'Stone',            rgb: [148, 140, 107] },
        { id: 63, premium: true,  name: 'Light Stone',      rgb: [205, 197, 158] },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 4: UI BUILDER CLASS
    // FIX NOTE: The original used a WeakSet-based private method pattern
    // (transpiled from TypeScript private methods). This pattern works but
    // requires the WeakSet (`_privateMethods`) to be declared at class scope.
    // We preserve the same pattern but rename obfuscated variables to be readable.
    // ─────────────────────────────────────────────────────────────────────────

    // WeakSet used to mark instances that have access to private methods.
    // This is the pattern TypeScript/Babel used before native # private fields.
    const _UIBuilderPrivate = new WeakSet();

    // The private method itself, stored outside the class.
    function _UIBuilder_createElement(type, defaults = {}, attrs = {}) {
        const el = document.createElement(type);

        // If there's a current container, nest inside it and track the stack
        if (this._currentEl) {
            this._parentStack.push(this._currentEl);
            this._currentEl.appendChild(el);
            this._currentEl = el;
        } else {
            // First element becomes the root
            this._rootEl = el;
            this._currentEl = el;
        }

        // Apply default properties (e.g. textContent, type)
        for (const [key, val] of Object.entries(defaults)) {
            el[key] = val;
        }
        // Apply additional attributes
        for (const [key, val] of Object.entries(attrs)) {
            el[key] = val;
        }

        return el;
    }

    class UIBuilder {
        constructor(name, version) {
            // Register this instance in the WeakSet so private method calls work
            _UIBuilderPrivate.add(this);

            this.name = name;
            this.version = version;
            this._statusElId = 'bm-o'; // Default status element ID
            this._messageListener = null;
            this._rootEl = null;
            this._currentEl = null;
            this._parentStack = [];
        }

        // Attach a message listener reference (used for telemetry/event hub)
        setListener(listener) {
            this._messageListener = listener;
        }

        // Pop back up one level in the DOM tree (end current element, go to parent)
        end() {
            if (this._parentStack.length > 0) {
                this._currentEl = this._parentStack.pop();
            }
            return this;
        }

        // Append the built element tree to a target parent and reset state
        appendTo(parentEl) {
            if (parentEl && this._rootEl) {
                parentEl.appendChild(this._rootEl);
            }
            this._rootEl = null;
            this._currentEl = null;
            this._parentStack = [];
        }

        // ── Element creation helpers ──────────────────────────────────────────

        div(attrs = {}, callback = () => {}) {
            // FIX NOTE: Original called a private method via WeakSet check.
            // We check the WeakSet here, matching the original pattern.
            if (!_UIBuilderPrivate.has(this)) throw new TypeError('Invalid receiver');
            callback(this, _UIBuilder_createElement.call(this, 'div', {}, attrs));
            return this;
        }

        p(attrs = {}, callback = () => {}) {
            if (!_UIBuilderPrivate.has(this)) throw new TypeError('Invalid receiver');
            callback(this, _UIBuilder_createElement.call(this, 'p', {}, attrs));
            return this;
        }

        small(attrs = {}, callback = () => {}) {
            if (!_UIBuilderPrivate.has(this)) throw new TypeError('Invalid receiver');
            callback(this, _UIBuilder_createElement.call(this, 'small', {}, attrs));
            return this;
        }

        img(attrs = {}, callback = () => {}) {
            if (!_UIBuilderPrivate.has(this)) throw new TypeError('Invalid receiver');
            callback(this, _UIBuilder_createElement.call(this, 'img', {}, attrs));
            return this;
        }

        heading(level, attrs = {}, callback = () => {}) {
            if (!_UIBuilderPrivate.has(this)) throw new TypeError('Invalid receiver');
            callback(this, _UIBuilder_createElement.call(this, 'h' + level, {}, attrs));
            return this;
        }

        hr(attrs = {}, callback = () => {}) {
            if (!_UIBuilderPrivate.has(this)) throw new TypeError('Invalid receiver');
            callback(this, _UIBuilder_createElement.call(this, 'hr', {}, attrs));
            return this;
        }

        br(attrs = {}, callback = () => {}) {
            if (!_UIBuilderPrivate.has(this)) throw new TypeError('Invalid receiver');
            callback(this, _UIBuilder_createElement.call(this, 'br', {}, attrs));
            return this;
        }

        checkbox(attrs = {}, callback = () => {}) {
            if (!_UIBuilderPrivate.has(this)) throw new TypeError('Invalid receiver');
            const label = _UIBuilder_createElement.call(this, 'label', { textContent: attrs.textContent || '' });
            delete attrs.textContent;
            const input = _UIBuilder_createElement.call(this, 'input', { type: 'checkbox' }, attrs);
            label.insertBefore(input, label.firstChild);
            this.end(); // pop input
            callback(this, label, input);
            return this;
        }

        button(attrs = {}, callback = () => {}) {
            if (!_UIBuilderPrivate.has(this)) throw new TypeError('Invalid receiver');
            callback(this, _UIBuilder_createElement.call(this, 'button', {}, attrs));
            return this;
        }

        helpButton(attrs = {}, callback = () => {}) {
            if (!_UIBuilderPrivate.has(this)) throw new TypeError('Invalid receiver');
            const helpText = attrs.title || attrs.textContent || 'Help: No info';
            delete attrs.textContent;
            attrs.title = `Help: ${helpText}`;
            const btnAttrs = {
                textContent: '?',
                className: 'bm-D',
                onclick: () => { this.setStatus(this._statusElId, helpText); }
            };
            callback(this, _UIBuilder_createElement.call(this, 'button', btnAttrs, attrs));
            return this;
        }

        input(attrs = {}, callback = () => {}) {
            if (!_UIBuilderPrivate.has(this)) throw new TypeError('Invalid receiver');
            callback(this, _UIBuilder_createElement.call(this, 'input', {}, attrs));
            return this;
        }

        fileInput(attrs = {}, callback = () => {}) {
            if (!_UIBuilderPrivate.has(this)) throw new TypeError('Invalid receiver');
            const labelText = attrs.textContent || '';
            delete attrs.textContent;

            const wrapper = _UIBuilder_createElement.call(this, 'div');
            // Hidden real file input
            const fileEl = _UIBuilder_createElement.call(this, 'input', {
                type: 'file',
                style: 'display: none !important; visibility: hidden !important; position: absolute !important; left: -9999px !important; width: 0 !important; height: 0 !important; opacity: 0 !important;'
            }, attrs);
            this.end(); // pop fileEl back to wrapper
            // Visible proxy button
            const btn = _UIBuilder_createElement.call(this, 'button', { textContent: labelText });
            this.end(); // pop btn back to wrapper
            this.end(); // pop wrapper

            fileEl.setAttribute('tabindex', '-1');
            fileEl.setAttribute('aria-hidden', 'true');
            btn.addEventListener('click', () => { fileEl.click(); });
            fileEl.addEventListener('change', () => {
                btn.style.maxWidth = `${btn.offsetWidth}px`;
                btn.textContent = fileEl.files.length > 0 ? fileEl.files[0].name : labelText;
            });

            callback(this, wrapper, fileEl, btn);
            return this;
        }

        textarea(attrs = {}, callback = () => {}) {
            if (!_UIBuilderPrivate.has(this)) throw new TypeError('Invalid receiver');
            callback(this, _UIBuilder_createElement.call(this, 'textarea', {}, attrs));
            return this;
        }

        // ── DOM helpers ───────────────────────────────────────────────────────

        // Set the innerHTML or textContent of an element by ID.
        setContent(id, content, asText = false) {
            const el = document.getElementById(id.replace(/^#/, ''));
            if (!el) return;
            if (el instanceof HTMLInputElement) {
                el.value = content;
            } else if (asText) {
                el.textContent = content;
            } else {
                el.innerHTML = content;
            }
        }

        // Make an element draggable. moveHandle is the drag handle element ID.
        makeDraggable(dragTargetId, handleId) {
            const target = document.querySelector('#' === dragTargetId?.[0] ? dragTargetId : '#' + dragTargetId);
            const handle = document.querySelector('#' === handleId?.[0] ? handleId : '#' + handleId);

            if (!target || !handle) {
                this.logError(`Can not drag! ${target ? '' : dragTargetId} ${target || handle ? '' : 'and '}${handle ? '' : handleId} was not found!`);
                return;
            }

            let isDragging = false;
            let offsetX = 0, offsetY = 0;
            let currentX = 0, currentY = 0;
            let targetX = 0, targetY = 0;
            let rect = null;
            let rafId = null;

            const animate = () => {
                if (!isDragging) return;
                const dx = Math.abs(currentX - targetX);
                const dy = Math.abs(currentY - targetY);
                if (dx > 0.5 || dy > 0.5) {
                    targetX = currentX;
                    targetY = currentY;
                    target.style.transform = `translate(${targetX}px, ${targetY}px)`;
                    target.style.left = '0px';
                    target.style.top = '0px';
                    target.style.right = '';
                }
                rafId = requestAnimationFrame(animate);
            };

            const startDrag = (clientX, clientY) => {
                isDragging = true;
                rect = target.getBoundingClientRect();
                offsetX = clientX - rect.left;
                offsetY = clientY - rect.top;

                const transform = window.getComputedStyle(target).transform;
                if (transform && transform !== 'none') {
                    const matrix = new DOMMatrix(transform);
                    targetX = matrix.m41;
                    targetY = matrix.m42;
                } else {
                    targetX = rect.left;
                    targetY = rect.top;
                }
                currentX = targetX;
                currentY = targetY;
                document.body.style.userSelect = 'none';
                handle.classList.add('dragging');
                if (rafId) cancelAnimationFrame(rafId);
                animate();
            };

            const stopDrag = () => {
                isDragging = false;
                if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
                document.body.style.userSelect = '';
                handle.classList.remove('dragging');
            };

            handle.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); });
            handle.addEventListener('touchstart', (e) => {
                const t = e.touches?.[0];
                if (t) { startDrag(t.clientX, t.clientY); e.preventDefault(); }
            }, { passive: false });
            document.addEventListener('mousemove', (e) => {
                if (isDragging && rect) { currentX = e.clientX - offsetX; currentY = e.clientY - offsetY; }
            }, { passive: true });
            document.addEventListener('touchmove', (e) => {
                if (isDragging && rect) {
                    const t = e.touches?.[0];
                    if (!t) return;
                    currentX = t.clientX - offsetX;
                    currentY = t.clientY - offsetY;
                    e.preventDefault();
                }
            }, { passive: false });
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
            document.addEventListener('touchcancel', stopDrag);
        }

        // Log a status message (updates the status textarea and console)
        logStatus(msg) {
            (0, console.info)(`${this.name}: ${msg}`);
            this.setContent(this._statusElId, 'Status: ' + msg, true);
        }

        // Log an error message
        logError(msg) {
            (0, console.error)(`${this.name}: ${msg}`);
            this.setContent(this._statusElId, 'Error: ' + msg, true);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 5: TEMPLATE CLASS
    // FIX NOTE: OffscreenCanvas is used for image processing. This is supported
    // in Chrome 69+, Firefox 105+ (in workers), Edge 79+. In the main thread,
    // Firefox only added OffscreenCanvas support fully in v105. We add a fallback
    // that uses a regular Canvas element if OffscreenCanvas is unavailable.
    // ─────────────────────────────────────────────────────────────────────────

    // Helper: create an offscreen canvas (with fallback to regular canvas)
    function createOffscreenCanvas(width, height) {
        if (typeof OffscreenCanvas !== 'undefined') {
            return new OffscreenCanvas(width, height);
        }
        // FIX NOTE: Fallback for browsers where OffscreenCanvas isn't available
        // in the main thread (older Firefox). We create a regular canvas element.
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    class Template {
        constructor({
            displayName = 'My template',
            orderIndex = 0,
            customId = '',
            url = '',
            file = null,
            coords = null,
            tiles = null,
            pixelUpdateInterval = 1000
        } = {}) {
            this.displayName = displayName;
            this.orderIndex = orderIndex;
            this.customId = customId;
            this.url = url;
            this.file = file;
            this.coords = coords;
            this.tiles = tiles;
            this.pixelUpdateInterval = pixelUpdateInterval;

            this.totalPixels = 0;
            this.nonTransparentPixels = 0;
            this.transparentMarkerPixels = 0;
            this.colorBreakdown = {};
            this.tileKeys = new Set();
            this.templateKey = null;

            // Build a set of valid color RGB strings (excluding transparent)
            const palette = Array.isArray(COLOR_PALETTE) ? COLOR_PALETTE : [];
            this.validColors = new Set(
                palette
                    .filter(c => c?.name?.toLowerCase() !== 'transparent' && Array.isArray(c?.rgb))
                    .map(c => `${c.rgb[0]},${c.rgb[1]},${c.rgb[2]}`)
            );
            // Special "transparent marker" color (222, 250, 206)
            this.validColors.add('222,250,206');
            this.validColors.add('other');

            // Map from RGB string -> color metadata
            this.colorMap = new Map(
                palette
                    .filter(c => Array.isArray(c?.rgb))
                    .map(c => [`${c.rgb[0]},${c.rgb[1]},${c.rgb[2]}`, { id: c.id, premium: !!c.premium, name: c.name }])
            );
            try {
                const transparent = palette.find(c => c?.name?.toLowerCase() === 'transparent');
                if (transparent && Array.isArray(transparent.rgb)) {
                    this.colorMap.set('222,250,206', { id: transparent.id, premium: !!transparent.premium, name: transparent.name });
                }
            } catch (e) {}
            try {
                this.colorMap.set('other', { id: 'other', premium: false, name: 'Other' });
            } catch (e) {}
        }

        async processFile(tileSize = 1000) {
            const bitmap = await createImageBitmap(this.file);
            const imgWidth = bitmap.width;
            const imgHeight = bitmap.height;
            this.totalPixels = imgWidth * imgHeight;

            try {
                // Analyze color breakdown
                const analysisCanvas = createOffscreenCanvas(imgWidth, imgHeight);
                const ctx = analysisCanvas.getContext('2d', { willReadFrequently: true });
                ctx.imageSmoothingEnabled = false;
                ctx.clearRect(0, 0, imgWidth, imgHeight);
                ctx.drawImage(bitmap, 0, 0);
                const pixelData = ctx.getImageData(0, 0, imgWidth, imgHeight).data;

                let visibleCount = 0;
                let transparentMarkerCount = 0;
                const colorCounts = new Map();

                for (let y = 0; y < imgHeight; y++) {
                    for (let x = 0; x < imgWidth; x++) {
                        const idx = 4 * (y * imgWidth + x);
                        const r = pixelData[idx], g = pixelData[idx + 1], b = pixelData[idx + 2], a = pixelData[idx + 3];
                        if (a === 0) continue; // fully transparent, skip
                        if (r === 222 && g === 250 && b === 206) transparentMarkerCount++;
                        const colorKey = this.validColors.has(`${r},${g},${b}`) ? `${r},${g},${b}` : 'other';
                        visibleCount++;
                        colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
                    }
                }

                this.nonTransparentPixels = visibleCount;
                this.transparentMarkerPixels = transparentMarkerCount;

                const breakdown = {};
                for (const [key, count] of colorCounts.entries()) {
                    breakdown[key] = { count, enabled: true };
                }
                this.colorBreakdown = breakdown;
            } catch (e) {
                this.nonTransparentPixels = Math.max(0, this.totalPixels);
                this.transparentMarkerPixels = 0;
            }

            // Build tile images
            const tilesMap = {};
            const tilesBase64 = {};
            const RENDER_SCALE = 3;
            const renderSize = tileSize * RENDER_SCALE;
            const [startTileX, startTileY, startPxX, startPxY] = this.coords;

            // We process the image in chunks that fit within tile boundaries
            for (let imgY = 0; imgY < imgHeight;) {
                const chunkHeight = Math.min(tileSize - (startPxY + imgY) % tileSize, imgHeight - imgY);

                for (let imgX = 0; imgX < imgWidth;) {
                    const chunkWidth = Math.min(tileSize - (startPxX + imgX) % tileSize, imgWidth - imgX);

                    const canvasW = chunkWidth * RENDER_SCALE;
                    const canvasH = chunkHeight * RENDER_SCALE;
                    const chunkCanvas = createOffscreenCanvas(canvasW, canvasH);
                    const chunkCtx = chunkCanvas.getContext('2d', { willReadFrequently: true });

                    chunkCtx.imageSmoothingEnabled = false;
                    chunkCtx.clearRect(0, 0, canvasW, canvasH);
                    chunkCtx.drawImage(bitmap, imgX, imgY, chunkWidth, chunkHeight, 0, 0, canvasW, canvasH);

                    const chunkData = chunkCtx.getImageData(0, 0, canvasW, canvasH);
                    const d = chunkData.data;

                    for (let py = 0; py < canvasH; py++) {
                        for (let px = 0; px < canvasW; px++) {
                            const pidx = 4 * (py * canvasW + px);
                            const r = d[pidx], g = d[pidx + 1], b = d[pidx + 2];

                            if (r === 222 && g === 250 && b === 206) {
                                // Transparent marker — checkerboard pattern with low alpha
                                if ((px + py) % 2 === 0) {
                                    d[pidx] = 0; d[pidx + 1] = 0; d[pidx + 2] = 0;
                                } else {
                                    d[pidx] = 255; d[pidx + 1] = 255; d[pidx + 2] = 255;
                                }
                                d[pidx + 3] = 32;
                            } else if (px % RENDER_SCALE !== 1 || py % RENDER_SCALE !== 1) {
                                // Only keep center pixel of each 3x3 block for the template overlay
                                d[pidx + 3] = 0;
                            } else {
                                // Keep this pixel if it's a valid palette color
                                if (!this.validColors.has(`${r},${g},${b}`)) {
                                    // leave as-is
                                }
                            }
                        }
                    }

                    chunkCtx.putImageData(chunkData, 0, 0);

                    // Calculate tile coordinates for this chunk
                    const tileX = startTileX + Math.floor((startPxX + imgX) / tileSize);
                    const tileY = startTileY + Math.floor((startPxY + imgY) / tileSize);
                    const localPxX = (startPxX + imgX) % tileSize;
                    const localPxY = (startPxY + imgY) % tileSize;

                    const tileKey = [
                        tileX.toString().padStart(4, '0'),
                        tileY.toString().padStart(4, '0'),
                        localPxX.toString().padStart(3, '0'),
                        localPxY.toString().padStart(3, '0')
                    ].join(',');

                    tilesMap[tileKey] = await createImageBitmap(chunkCanvas);
                    this.tileKeys.add([tileX.toString().padStart(4, '0'), tileY.toString().padStart(4, '0')].join(','));

                    // Also store as base64 for persistence
                    // FIX NOTE: convertToBlob() is async and only available on OffscreenCanvas.
                    // For regular Canvas fallback, we use toBlob() wrapped in a Promise.
                    let blob;
                    if (chunkCanvas instanceof OffscreenCanvas) {
                        blob = await chunkCanvas.convertToBlob({ type: 'image/png' });
                    } else {
                        blob = await new Promise(res => chunkCanvas.toBlob(res, 'image/png'));
                    }
                    const arrayBuffer = await blob.arrayBuffer();
                    tilesBase64[tileKey] = uint8ArrayToBase64(new Uint8Array(arrayBuffer));

                    imgX += chunkWidth;
                }
                imgY += chunkHeight;
            }

            return { tileBitmaps: tilesMap, tilesBase64 };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 6: TEMPLATE MANAGER CLASS
    // FIX NOTE: The original class used obfuscated single-letter property names
    // (e.g. this.rt, this.nt, this.ot). These are renamed for readability.
    // The core logic is preserved.
    // ─────────────────────────────────────────────────────────────────────────

    const TILE_SIZE = 1000;
    const RENDER_SCALE = 3;
    const RENDER_TILE_PX = TILE_SIZE * RENDER_SCALE;

    class TemplateManager {
        constructor(name, version, uiBuilder) {
            this.name = name;
            this.version = version;
            this.ui = uiBuilder;
            this.schemaVersion = '1.0.0';
            this.userId = null;
            this.alphabet = '!#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~';
            this.overlayCanvas = null;
            this.overlayCanvasId = 'bm-C';
            this.mapCanvasSelector = 'div#map canvas.maplibregl-canvas';
            this.savedData = null;
            this.templates = [];
            this.persistedData = null;
            this.templatesEnabled = true;
            this.tileStatsMap = new Map();
        }

        // Get (or create) the overlay canvas element
        getOverlayCanvas() {
            if (document.body.contains(this.overlayCanvas)) return this.overlayCanvas;

            document.getElementById(this.overlayCanvasId)?.remove();

            const mapCanvas = document.querySelector(this.mapCanvasSelector);
            const dpr = window.devicePixelRatio || 1;
            const canvas = document.createElement('canvas');
            canvas.id = this.overlayCanvasId;
            canvas.className = 'maplibregl-canvas';
            canvas.style.cssText = `position:absolute;top:0;left:0;z-index:8999;pointer-events:none;`;
            canvas.style.height = (mapCanvas?.clientHeight * dpr) + 'px';
            canvas.style.width = (mapCanvas?.clientWidth * dpr) + 'px';
            canvas.height = mapCanvas?.clientHeight * dpr || 0;
            canvas.width = mapCanvas?.clientWidth * dpr || 0;
            mapCanvas?.parentElement?.appendChild(canvas);
            this.overlayCanvas = canvas;

            window.addEventListener('move', () => this._onMapChange());
            window.addEventListener('zoom', () => this._onMapChange());
            window.addEventListener('resize', () => this._onMapChange());

            return this.overlayCanvas;
        }

        _onMapChange() {
            // Placeholder for map move/zoom/resize handling
        }

        // Build a default empty save object
        async buildDefaultSave() {
            return {
                whoami: this.name.replace(' ', ''),
                scriptVersion: this.version,
                schemaVersion: this.schemaVersion,
                templates: {}
            };
        }

        // Create a new template from a file upload
        async createTemplate(file, displayName, coords) {
            if (!this.persistedData) {
                this.persistedData = await this.buildDefaultSave();
            }
            this.ui.logStatus(`Creating template at ${coords.join(', ')}...`);

            const tmpl = new Template({
                displayName,
                orderIndex: 0,
                customId: numberToCustomBase(this.userId || 0, this.alphabet),
                file,
                coords
            });

            const { tileBitmaps, tilesBase64 } = await tmpl.processFile(TILE_SIZE);
            tmpl.tiles = tileBitmaps;

            const templateKey = `${tmpl.orderIndex} ${tmpl.customId}`;
            tmpl.templateKey = templateKey;
            this.persistedData.templates[templateKey] = {
                name: tmpl.displayName,
                coords: coords.join(', '),
                enabled: true,
                tiles: tilesBase64,
                palette: tmpl.colorBreakdown
            };

            this.templates = [tmpl]; // Replace current template list with this one

            const count = new Intl.NumberFormat().format(tmpl.totalPixels);
            this.ui.logStatus(`Template created at ${coords.join(', ')}! Total pixels: ${count}`);

            this._showColorPanel();
            await this._persistSave();
        }

        _showColorPanel() {
            try {
                const panel = document.querySelector('#bm-9');
                if (panel) panel.style.display = '';
                window.postMessage({ source: 'blue-marble', action: 'refresh-colors' }, '*');
            } catch (e) {}
        }

        async _persistSave() {
            Storage.set('bmTemplates', JSON.stringify(this.persistedData));
        }

        // Load templates from saved JSON data
        async loadFromSave(saveData) {
            if (saveData?.whoami !== 'BlueMarble') return;

            const templateEntries = saveData.templates;
            if (!templateEntries || Object.keys(templateEntries).length === 0) return;

            for (const [key, value] of Object.entries(templateEntries)) {
                try {
                    const parts = key.split(' ');
                    const orderIndex = Number(parts[0]);
                    const customId = parts[1] || '0';
                    const displayName = value.name || `Template ${orderIndex}`;
                    const rawTiles = value.tiles;
                    const tileBitmaps = {};
                    let visiblePixelCount = 0;
                    const colorCounts = new Map();

                    for (const [tileKey, b64] of Object.entries(rawTiles)) {
                        const bytes = base64ToUint8Array(b64);
                        const blob = new Blob([bytes], { type: 'image/png' });
                        const bitmap = await createImageBitmap(blob);
                        tileBitmaps[tileKey] = bitmap;

                        // Count visible pixels for display stats
                        try {
                            const w = bitmap.width, h = bitmap.height;
                            const analysisCanvas = createOffscreenCanvas(w, h);
                            const ctx = analysisCanvas.getContext('2d', { willReadFrequently: true });
                            ctx.imageSmoothingEnabled = false;
                            ctx.clearRect(0, 0, w, h);
                            ctx.drawImage(bitmap, 0, 0);
                            const data = ctx.getImageData(0, 0, w, h).data;

                            for (let py = 0; py < h; py++) {
                                for (let px = 0; px < w; px++) {
                                    if (px % RENDER_SCALE !== 1 || py % RENDER_SCALE !== 1) continue;
                                    const idx = 4 * (py * w + px);
                                    const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
                                    if (a < 64) continue;
                                    if (r === 222 && g === 250 && b === 206) continue;
                                    visiblePixelCount++;
                                    const tmplInstance = new Template();
                                    const colorKey = tmplInstance.validColors.has(`${r},${g},${b}`) ? `${r},${g},${b}` : 'other';
                                    colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
                                }
                            }
                        } catch (e) {}
                    }

                    const tmpl = new Template({ displayName, orderIndex, customId: customId });
                    tmpl.tiles = tileBitmaps;
                    tmpl.nonTransparentPixels = visiblePixelCount;
                    const breakdown = {};
                    for (const [colorKey, count] of colorCounts.entries()) {
                        breakdown[colorKey] = { count, enabled: true };
                    }
                    tmpl.colorBreakdown = breakdown;

                    // Restore per-color enabled state from saved palette
                    try {
                        const savedPalette = saveData?.templates?.[key]?.palette;
                        if (savedPalette) {
                            for (const [colorKey, colorData] of Object.entries(savedPalette)) {
                                if (tmpl.colorBreakdown[colorKey]) {
                                    tmpl.colorBreakdown[colorKey].enabled = !!colorData?.enabled;
                                } else {
                                    tmpl.colorBreakdown[colorKey] = { count: colorData?.count || 0, enabled: !!colorData?.enabled };
                                }
                            }
                        }
                    } catch (e) {}

                    tmpl.templateKey = key;
                    try {
                        Object.keys(tileBitmaps).forEach(k => {
                            tmpl.tileKeys.add(k.split(',').slice(0, 2).join(','));
                        });
                    } catch (e) {}

                    this.templates.push(tmpl);
                } catch (e) {
                    logError('Error loading template:', e);
                }
            }

            this._showColorPanel();
        }

        // Composite template overlay onto a tile image blob
        async compositeTemplate(inputBlob, tileCoords) {
            if (!this.templatesEnabled) return inputBlob;

            const tileKey = tileCoords[0].toString().padStart(4, '0') + ',' + tileCoords[1].toString().padStart(4, '0');
            const sortedTemplates = [...this.templates].sort((a, b) => a.orderIndex - b.orderIndex);

            // Check if any template has tiles for this tile position
            const hasMatchingTile = sortedTemplates.some(tmpl => {
                if (!tmpl?.tiles) return false;
                if (tmpl.tileKeys && tmpl.tileKeys.size > 0) return tmpl.tileKeys.has(tileKey);
                return Object.keys(tmpl.tiles).some(k => k.startsWith(tileKey));
            });

            if (!hasMatchingTile) return inputBlob;

            // Build list of matching tile entries
            const matchingEntries = sortedTemplates.map(tmpl => {
                const keys = Object.keys(tmpl.tiles || {}).filter(k => k.startsWith(tileKey));
                if (!keys.length) return null;
                const firstKey = keys[0];
                const parts = firstKey.split(',');
                return { bitmap: tmpl.tiles[firstKey], tileXY: [parts[0], parts[1]], pxOffset: [parts[2], parts[3]] };
            }).filter(Boolean);

            const matchCount = matchingEntries.length;
            let correctPixels = 0, requiredPixels = 0, wrongPixels = 0;

            // Draw existing tile onto composite canvas
            const existingBitmap = await createImageBitmap(inputBlob);
            const compositeCanvas = createOffscreenCanvas(RENDER_TILE_PX, RENDER_TILE_PX);
            const ctx = compositeCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, RENDER_TILE_PX, RENDER_TILE_PX);
            ctx.drawImage(existingBitmap, 0, 0, RENDER_TILE_PX, RENDER_TILE_PX);

            // Get existing canvas pixel data for comparison
            let existingData = null;
            try {
                existingData = ctx.getImageData(0, 0, RENDER_TILE_PX, RENDER_TILE_PX).data;
            } catch (e) {}

            for (const entry of matchingEntries) {
                if (existingData) {
                    try {
                        const tw = entry.bitmap.width, th = entry.bitmap.height;
                        const tCanvas = createOffscreenCanvas(tw, th);
                        const tCtx = tCanvas.getContext('2d', { willReadFrequently: true });
                        tCtx.imageSmoothingEnabled = false;
                        tCtx.drawImage(entry.bitmap, 0, 0);
                        const tData = tCtx.getImageData(0, 0, tw, th).data;
                        const offsetX = Number(entry.pxOffset[0]) * RENDER_SCALE;
                        const offsetY = Number(entry.pxOffset[1]) * RENDER_SCALE;

                        for (let py = 0; py < th; py++) {
                            for (let px = 0; px < tw; px++) {
                                if (px % RENDER_SCALE !== 1 || py % RENDER_SCALE !== 1) continue;
                                const ex = px + offsetX, ey = py + offsetY;
                                if (ex < 0 || ey < 0 || ex >= RENDER_TILE_PX || ey >= RENDER_TILE_PX) continue;
                                const tidx = 4 * (py * tw + px);
                                const tr = tData[tidx], tg = tData[tidx + 1], tb = tData[tidx + 2], ta = tData[tidx + 3];

                                if (ta < 64) {
                                    // Transparent in template — check if existing canvas pixel is a palette color
                                    try {
                                        const baseTemplate = this.templates[0];
                                        const eidx = 4 * (ey * RENDER_TILE_PX + ex);
                                        const er = existingData[eidx], eg = existingData[eidx + 1], eb = existingData[eidx + 2], ea = existingData[eidx + 3];
                                        const eKey = baseTemplate?.validColors?.has(`${er},${eg},${eb}`) ? `${er},${eg},${eb}` : 'other';
                                        if (ea >= 64 && baseTemplate?.validColors?.has(eKey)) wrongPixels++;
                                    } catch (e) {}
                                    continue;
                                }

                                requiredPixels++;
                                const eidx = 4 * (ey * RENDER_TILE_PX + ex);
                                const er = existingData[eidx], eg = existingData[eidx + 1], eb = existingData[eidx + 2], ea = existingData[eidx + 3];
                                if (ea < 64) continue;
                                if (er === tr && eg === tg && eb === tb) correctPixels++;
                                else wrongPixels++;
                            }
                        }
                    } catch (e) {}
                }

                // Draw template overlay, respecting color enable/disable
                try {
                    const baseTemplate = this.templates[0];
                    const palette = baseTemplate?.colorBreakdown || {};
                    const anyDisabled = Object.values(palette).some(c => c.enabled === false);

                    if (anyDisabled) {
                        const tw = entry.bitmap.width, th = entry.bitmap.height;
                        const maskCanvas = createOffscreenCanvas(tw, th);
                        const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
                        maskCtx.imageSmoothingEnabled = false;
                        maskCtx.drawImage(entry.bitmap, 0, 0);
                        const maskData = maskCtx.getImageData(0, 0, tw, th);
                        const md = maskData.data;

                        for (let py = 0; py < th; py++) {
                            for (let px = 0; px < tw; px++) {
                                if (px % RENDER_SCALE !== 1 || py % RENDER_SCALE !== 1) continue;
                                const midx = 4 * (py * tw + px);
                                const mr = md[midx], mg = md[midx + 1], mb = md[midx + 2];
                                if (md[midx + 3] < 1) continue;
                                const colorKey = baseTemplate?.validColors?.has(`${mr},${mg},${mb}`) ? `${mr},${mg},${mb}` : 'other';
                                if (!palette?.[colorKey]?.enabled) {
                                    md[midx + 3] = 0;
                                }
                            }
                        }
                        maskCtx.putImageData(maskData, 0, 0);
                        ctx.drawImage(maskCanvas, Number(entry.pxOffset[0]) * RENDER_SCALE, Number(entry.pxOffset[1]) * RENDER_SCALE);
                    } else {
                        ctx.drawImage(entry.bitmap, Number(entry.pxOffset[0]) * RENDER_SCALE, Number(entry.pxOffset[1]) * RENDER_SCALE);
                    }
                } catch (e) {
                    ctx.drawImage(entry.bitmap, Number(entry.pxOffset[0]) * RENDER_SCALE, Number(entry.pxOffset[1]) * RENDER_SCALE);
                }
            }

            // Update stats
            if (matchCount > 0) {
                this.tileStatsMap.set(tileKey, { correct: correctPixels, required: requiredPixels, wrong: wrongPixels });
                let totalCorrect = 0, totalRequired = 0, totalWrong = 0;
                for (const stats of this.tileStatsMap.values()) {
                    totalCorrect += stats.correct || 0;
                    totalRequired += stats.required || 0;
                    totalWrong += stats.wrong || 0;
                }
                const totalForTemplate = this.templates.reduce((sum, t) => sum + (t.nonTransparentPixels || t.totalPixels || 0), 0);
                const displayTotal = totalForTemplate > 0 ? totalForTemplate : totalRequired;
                const fmtCorrect = new Intl.NumberFormat().format(totalCorrect);
                const fmtTotal = new Intl.NumberFormat().format(displayTotal);
                const fmtWrong = new Intl.NumberFormat().format(displayTotal - totalCorrect);
                this.ui.logStatus(`Displaying ${matchCount} template${matchCount === 1 ? '' : 's'}.\nPainted ${fmtCorrect} / ${fmtTotal} • Wrong ${fmtWrong}`);
            } else {
                this.ui.logStatus(`Displaying 0 templates.`);
            }

            // Return composited image as blob
            if (compositeCanvas instanceof OffscreenCanvas) {
                return await compositeCanvas.convertToBlob({ type: 'image/png' });
            } else {
                return await new Promise(res => compositeCanvas.toBlob(res, 'image/png'));
            }
        }

        setEnabled(enabled) {
            this.templatesEnabled = enabled;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 7: EVENT HUB (handles page messages and fetch interception)
    // FIX NOTE: The original injected a <script> tag into the page context to
    // intercept `window.fetch`. This is necessary because userscripts run in an
    // isolated sandbox and cannot directly patch the page's fetch. The pattern is:
    //   1. Inject a script tag (runs in page context, can access window.fetch)
    //   2. That script patches fetch and posts messages back to the userscript
    //   3. The userscript listens for those messages via window.addEventListener
    // This works because both the page context and the userscript share the same
    // window.postMessage channel.
    // ─────────────────────────────────────────────────────────────────────────

    class EventHub {
        constructor(templateManager) {
            this.templateManager = templateManager;
            this.robotsCheckDone = false;
            this.pendingTileCoords = [];
            this.lastKnownCoords = [];
        }

        // Inject the fetch-interceptor script into the page context
        injectFetchInterceptor() {
            // THE REAL FIX:
            // Tampermonkey userscripts run in an isolated JS sandbox — their `window`
            // is NOT the same object as the page's `window`. So patching `window.fetch`
            // in the userscript only affects the sandbox, not the page code that loads tiles.
            //
            // The original script worked around this by injecting a <script> tag that
            // ran in page context. We tried replacing that with a direct patch, but both
            // ended up running simultaneously, using separate pendingBlobs maps, so the
            // callbacks could never find each other.
            //
            // The correct solution: use `unsafeWindow` (granted via @grant unsafeWindow).
            // `unsafeWindow` IS the real page window. Patching `unsafeWindow.fetch` means
            // the page's tile-loading code gets our patched version, and our pendingBlobs
            // map lives right here in the userscript closure — one map, no confusion.

            const pageWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
            const originalFetch = pageWindow.fetch;
            const pendingBlobs = new Map();

            // Expose so the tiles message handler can resolve blobs
            this._pendingBlobs = pendingBlobs;

            pageWindow.fetch = async (...args) => {
                let response;
                try {
                    response = await originalFetch.apply(pageWindow, args);
                } catch(e) {
                    throw e;
                }

                const cloned = response.clone();
                const url = (args[0] instanceof Request ? args[0].url : String(args[0])) || '';
                const contentType = cloned.headers.get('content-type') || '';

                if (contentType.includes('application/json')) {
                    cloned.json().then(data => {
                        window.postMessage({ source: 'blue-marble', endpoint: url, jsonData: data }, '*');
                    }).catch(() => {});

                } else if (contentType.includes('image/') && !url.includes('openfreemap') && !url.includes('maps')) {
                    console.info('[BlueMarble] intercepted tile:', url);
                    const timestamp = Date.now();
                    const blob = await cloned.blob();

                    return new Promise((resolve) => {
                        const blobId = crypto.randomUUID();

                        pendingBlobs.set(blobId, (returnedBlob) => {
                            resolve(new Response(returnedBlob, {
                                headers: response.headers,
                                status: response.status,
                                statusText: response.statusText
                            }));
                        });

                        // Send to our message listener for compositing
                        window.postMessage({
                            source: 'blue-marble',
                            endpoint: url,
                            blobID: blobId,
                            blobData: blob,
                            blink: timestamp
                        }, '*');

                        // Safety timeout — return original if compositing takes >8s
                        setTimeout(() => {
                            if (pendingBlobs.has(blobId)) {
                                console.warn('[BlueMarble] timeout waiting for composite, returning original');
                                pendingBlobs.delete(blobId);
                                resolve(response);
                            }
                        }, 8000);
                    });
                }

                return response;
            };

            console.info('[BlueMarble] fetch interceptor installed on unsafeWindow');
        }

        setupMessageListener(uiBuilder) {
            window.addEventListener('message', async (evt) => {
                const data = evt.data;
                if (!data || data.source !== 'blue-marble') return;

                // Handle color refresh action (no endpoint)
                if (data.action === 'refresh-colors') {
                    try { window.buildColorFilterList?.(); } catch (e) {}
                    return;
                }

                if (!data.endpoint) return;

                const url = data.endpoint;
                const urlPath = url.split('?')[0];

                // FIX: Use direct URL pattern matching instead of the broken path-segment
                // filter that stripped segments containing '.' (like .png filenames),
                // which meant tile URLs never matched 'case tiles'.
                let endpointType;
                if (/\/tiles\/\d+\/\d+\/\d+\.png/.test(urlPath) || /\/\d+\/\d+\.png$/.test(urlPath)) {
                    endpointType = 'tiles';
                } else if (/\/pixel\b/.test(urlPath) || /[?&]x=\d/.test(url)) {
                    endpointType = 'pixel';
                } else if (/\/me\b/.test(urlPath) || /\/users\/me/.test(urlPath)) {
                    endpointType = 'me';
                } else if (/\/robots/.test(urlPath)) {
                    endpointType = 'robots';
                } else {
                    // Fallback: use last non-numeric, non-extension path segment
                    endpointType = urlPath
                        .split('/')
                        .filter(p => p && isNaN(Number(p)))
                        .filter(p => p && !p.includes('.'))
                        .pop();
                }

                switch (endpointType) {
                    case 'me': {
                        // User profile data
                        const json = data.jsonData;
                        if (json.status && !json.status.toString().startsWith('2')) {
                            uiBuilder.logError('You are not logged in!\nCould not fetch userdata.');
                            return;
                        }
                        const pixelsToNextLevel = Math.ceil(
                            Math.pow(Math.floor(json.level) * Math.pow(30, 0.65), 1 / 0.65) - json.pixelsPainted
                        );
                        this.templateManager.userId = json.id;
                        uiBuilder.setContent('bm-u', `Username: <b>${escapeHTML(json.name)}</b>`);
                        uiBuilder.setContent('bm-p', `Droplets: <b>${new Intl.NumberFormat().format(json.droplets)}</b>`);
                        uiBuilder.setContent('bm-i', `Next level in <b>${new Intl.NumberFormat().format(pixelsToNextLevel)}</b> pixel${pixelsToNextLevel === 1 ? '' : 's'}`);
                        break;
                    }

                    case 'pixel': {
                        // Pixel click coordinate info
                        const pathParts = data.endpoint.split('?')[0].split('/').filter(p => p && !isNaN(Number(p)));
                        const queryParams = new URLSearchParams(data.endpoint.split('?')[1]);
                        const pixelXY = [queryParams.get('x'), queryParams.get('y')];

                        if (this.pendingTileCoords.length && (!pathParts.length || !pixelXY.length)) {
                            uiBuilder.logError('Coordinates are malformed! Did you try clicking the canvas first?');
                            return;
                        }
                        this.lastKnownCoords = [...pathParts, ...pixelXY];

                        // Display local pixel coordinates in the UI
                        const localX = parseInt(pathParts[0]) % 4 * 1000 + parseInt(pixelXY[0]);
                        const localY = parseInt(pathParts[1]) % 4 * 1000 + parseInt(pixelXY[1]);
                        const spans = document.querySelectorAll('span');
                        for (const span of spans) {
                            if (span.textContent.trim().includes(`${localX}, ${localY}`)) {
                                let infoEl = document.querySelector('#bm-h');
                                const infoText = `(Tl X: ${pathParts[0]}, Tl Y: ${pathParts[1]}, Px X: ${pixelXY[0]}, Px Y: ${pixelXY[1]})`;
                                if (infoEl) {
                                    infoEl.textContent = infoText;
                                } else {
                                    infoEl = document.createElement('span');
                                    infoEl.id = 'bm-h';
                                    infoEl.textContent = infoText;
                                    infoEl.style.cssText = 'margin-left: calc(var(--spacing)*3); font-size: small;';
                                    span.parentNode?.parentNode?.insertAdjacentElement('afterend', infoEl);
                                }
                            }
                        }
                        break;
                    }

                    case 'tiles': {
                        // Map tile image — composite template onto it
                        // Parse tile coords from the URL. wplace URLs look like:
                        //   https://.../{z}/{x}/{y}.png  or  https://.../{x}/{y}.png
                        const urlNoQuery = data.endpoint.split('?')[0];
                        const numericParts = urlNoQuery.split('/')
                            .map(p => p.replace('.png', ''))
                            .filter(p => p !== '' && !isNaN(Number(p)))
                            .map(Number);
                        const tileX = numericParts[numericParts.length - 2];
                        const tileY = numericParts[numericParts.length - 1];
                        const blobId = data.blobID;
                        const blobData = data.blobData;

                        console.info(`[BlueMarble] tile handler fired x=${tileX} y=${tileY}`);

                        if (isNaN(tileX) || isNaN(tileY) || !blobId) {
                            console.error('[BlueMarble] could not parse tile coords from', data.endpoint);
                            // Resolve with original blob so the map still loads
                            this._pendingBlobs?.get(blobId)?.(blobData);
                            this._pendingBlobs?.delete(blobId);
                            break;
                        }

                        const resultBlob = await this.templateManager.compositeTemplate(blobData, [tileX, tileY]);

                        // FIX: Resolve the pending fetch Promise directly via _pendingBlobs
                        // instead of posting back via window.postMessage.
                        // The old approach required a round-trip through postMessage which
                        // broke when the script tag injection was blocked by CSP.
                        const resolver = this._pendingBlobs?.get(blobId);
                        if (typeof resolver === 'function') {
                            resolver(resultBlob);
                            this._pendingBlobs.delete(blobId);
                        } else {
                            console.error('[BlueMarble] no resolver found for blobId', blobId);
                        }
                        break;
                    }

                    case 'robots': {
                        // Check if userscripts are allowed by site policy
                        const json = data.jsonData;
                        this.robotsCheckDone = json.userscript?.toString().toLowerCase() === 'false';
                        break;
                    }
                }
            });
        }

        // Send a telemetry heartbeat
        async sendHeartbeat(version) {
            const settingsRaw = Storage.get('bmUserSettings', '{}');
            let settings;
            try { settings = JSON.parse(settingsRaw); } catch (e) { return; }
            if (!settings || !settings.telemetry || !settings.uuid) return;

            const ua = navigator.userAgent;
            const browser = await detectBrowser(ua);
            const os = detectOS(ua);

            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://telemetry.thebluecorner.net/heartbeat',
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ uuid: settings.uuid, version, browser, os }),
                onload: (resp) => {
                    if (resp.status !== 200) logError('Failed to send heartbeat:', resp.statusText);
                },
                onerror: (err) => { logError('Error sending heartbeat:', err); }
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 8: BROWSER / OS DETECTION
    // ─────────────────────────────────────────────────────────────────────────

    async function detectBrowser(ua = navigator.userAgent) {
        ua = ua || '';
        if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
        if (ua.includes('Edg/')) return 'Edge';
        if (ua.includes('Vivaldi')) return 'Vivaldi';
        if (ua.includes('YaBrowser')) return 'Yandex';
        if (ua.includes('Kiwi')) return 'Kiwi';
        if (ua.includes('Brave')) return 'Brave';
        if (ua.includes('Firefox/')) return 'Firefox';
        if (ua.includes('Chrome/')) return 'Chrome';
        if (ua.includes('Safari/')) return 'Safari';
        // FIX NOTE: navigator.brave is not in the standard spec but Brave exposes it.
        // We guard against it being undefined.
        if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
            try {
                const isBrave = await navigator.brave.isBrave();
                if (isBrave) return 'Brave';
            } catch (e) {}
        }
        return 'Unknown';
    }

    function detectOS(ua = navigator.userAgent) {
        ua = ua || '';
        if (/Windows NT 11/i.test(ua)) return 'Windows 11';
        if (/Windows NT 10/i.test(ua)) return 'Windows 10';
        if (/Windows NT 6\.3/i.test(ua)) return 'Windows 8.1';
        if (/Windows NT 6\.2/i.test(ua)) return 'Windows 8';
        if (/Windows NT 6\.1/i.test(ua)) return 'Windows 7';
        if (/Windows NT 6\.0/i.test(ua)) return 'Windows Vista';
        if (/Windows NT 5\.1|Windows XP/i.test(ua)) return 'Windows XP';
        if (/Mac OS X 10[_\.]15/i.test(ua)) return 'macOS Catalina';
        if (/Mac OS X 10[_\.]14/i.test(ua)) return 'macOS Mojave';
        if (/Mac OS X 10[_\.]13/i.test(ua)) return 'macOS High Sierra';
        if (/Mac OS X 10[_\.]12/i.test(ua)) return 'macOS Sierra';
        if (/Mac OS X 10[_\.]11/i.test(ua)) return 'OS X El Capitan';
        if (/Mac OS X 10[_\.]10/i.test(ua)) return 'OS X Yosemite';
        if (/Mac OS X 10[_\.]/i.test(ua)) return 'macOS';
        if (/Android/i.test(ua)) return 'Android';
        if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
        if (/Linux/i.test(ua)) return 'Linux';
        return 'Unknown';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 9: CSS + FONT LOADING
    // FIX NOTE: The original called GM_getResourceText and GM_addStyle to inject
    // CSS from the @resource declaration. We preserve this. The font preload is
    // also preserved — it preloads the font then switches rel to 'stylesheet'
    // once the preload completes, a common performance pattern.
    // ─────────────────────────────────────────────────────────────────────────

    function loadStyles() {
        try {
            const css = GM_getResourceText('CSS-BM-File');
            if (css) {
                GM_addStyle(css);
            } else {
                logError('CSS resource not loaded — check @resource declaration and network access.');
            }
        } catch (e) {
            logError('Failed to load CSS resource:', e);
        }

        // Preload Google Font (Roboto Mono)
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Roboto+Mono:ital,wght@0,100..700;1,100..700&display=swap';
        fontLink.rel = 'preload';
        fontLink.as = 'style';
        fontLink.onload = function () {
            this.onload = null;
            this.rel = 'stylesheet';
        };
        document.head?.appendChild(fontLink);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 10: UI CONSTRUCTION
    // FIX NOTE: The original built the UI using a method-chaining builder pattern.
    // Here we rebuild it using plain DOM APIs for clarity and reliability. The
    // element IDs and structure are preserved exactly so the CSS still applies.
    // ─────────────────────────────────────────────────────────────────────────

    function buildUI(uiBuilder, templateManager) {
        // ── Telemetry consent dialog ──────────────────────────────────────────
        const settings = JSON.parse(Storage.get('bmUserSettings', '{}'));
        if (settings.telemetry === null || settings.telemetry === undefined || settings.telemetry > 1) {
            const overlay = document.createElement('div');
            overlay.id = 'bm-d';
            overlay.style.cssText = 'top:0;left:0;width:100vw;max-width:100vw;height:100vh;max-height:100vh;z-index:9999;';

            const inner = document.createElement('div');
            inner.id = 'bm-7';
            inner.style.cssText = 'display:flex;flex-direction:column;align-items:center;';

            const titleWrap = document.createElement('div');
            titleWrap.id = 'bm-1';
            titleWrap.style.marginTop = '10%';

            const title = document.createElement('h1');
            title.textContent = `${SCRIPT_NAME} Telemetry`;
            titleWrap.appendChild(title);
            inner.appendChild(titleWrap);

            const bodyWrap = document.createElement('div');
            bodyWrap.id = 'bm-e';
            bodyWrap.style.cssText = 'max-width:50%;overflow-y:auto;max-height:80vh;';

            const hr1 = document.createElement('hr');
            bodyWrap.appendChild(hr1);

            const description = document.createElement('p');
            description.textContent = 'We collect anonymous telemetry data such as your browser, OS, and script version to make the experience better for everyone. The data is never shared personally. The data is never sold. You can turn this off by pressing the \'Disable\' button, but keeping it on helps us improve features and reliability faster. Thank you for supporting the Blue Marble!';
            bodyWrap.appendChild(description);

            const description2 = document.createElement('p');
            description2.textContent = 'You can disable telemetry by pressing the "Disable" button below.';
            bodyWrap.appendChild(description2);

            const moreInfoBtn = document.createElement('button');
            moreInfoBtn.id = 'bm-8';
            moreInfoBtn.textContent = 'More Information';
            moreInfoBtn.onclick = () => window.open('https://github.com/SwingTheVine/Wplace-TelemetryServer#telemetry-data', '_blank', 'noopener noreferrer');
            bodyWrap.appendChild(document.createElement('br'));
            bodyWrap.appendChild(moreInfoBtn);

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'width:fit-content;margin:auto;text-align:center;';

            const enableBtn = document.createElement('button');
            enableBtn.id = 'bm-5';
            enableBtn.textContent = 'Enable Telemetry';
            enableBtn.style.marginRight = '2ch';
            enableBtn.onclick = () => {
                const s = JSON.parse(Storage.get('bmUserSettings', '{}'));
                s.telemetry = 1;
                Storage.set('bmUserSettings', JSON.stringify(s));
                overlay.style.display = 'none';
            };

            const disableBtn = document.createElement('button');
            disableBtn.id = 'bm-2';
            disableBtn.textContent = 'Disable Telemetry';
            disableBtn.onclick = () => {
                const s = JSON.parse(Storage.get('bmUserSettings', '{}'));
                s.telemetry = 0;
                Storage.set('bmUserSettings', JSON.stringify(s));
                overlay.style.display = 'none';
            };

            btnRow.appendChild(enableBtn);
            btnRow.appendChild(disableBtn);
            bodyWrap.appendChild(btnRow);
            inner.appendChild(bodyWrap);
            overlay.appendChild(inner);
            document.body.appendChild(overlay);
        }

        // ── Main panel ────────────────────────────────────────────────────────
        // Restore saved coordinate inputs
        let savedCoords = {};
        try { savedCoords = JSON.parse(Storage.get('bmCoords', '{}')) || {}; } catch (e) { savedCoords = {}; }

        const saveCoords = () => {
            try {
                const coordData = {
                    tlx: Number(document.querySelector('#bm-v')?.value || ''),
                    tly: Number(document.querySelector('#bm-w')?.value || ''),
                    px: Number(document.querySelector('#bm-x')?.value || ''),
                    py: Number(document.querySelector('#bm-y')?.value || '')
                };
                Storage.set('bmCoords', JSON.stringify(coordData));
            } catch (e) {}
        };

        // Panel container
        const panel = document.createElement('div');
        panel.id = 'bm-A';
        panel.style.cssText = 'top:10px;right:75px;';

        // Inner wrapper
        const panelInner = document.createElement('div');
        panelInner.id = 'bm-j';

        // Drag handle row
        const dragHandle = document.createElement('div');
        dragHandle.id = 'bm-z';

        // Logo / minimize button
        const logo = document.createElement('img');
        logo.alt = 'Blue Marble Icon - Click to minimize/maximize';
        logo.src = 'https://raw.githubusercontent.com/SwingTheVine/Wplace-BlueMarble/main/dist/assets/Favicon.png';
        logo.style.cursor = 'pointer';

        let minimized = false;
        logo.addEventListener('click', () => {
            minimized = !minimized;
            const collapsibleIds = ['#bm-A h1', '#bm-f', '#bm-A hr', '#bm-c > *:not(#bm-k)', '#bm-upload-btn', '#bm-6', `#${uiBuilder._statusElId}`, '#bm-9'];

            collapsibleIds.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    el.style.display = minimized ? 'none' : '';
                });
            });

            const coordInputPanel = document.querySelector('#bm-k');
            const coordInputs = document.querySelectorAll('#bm-k input');

            if (minimized) {
                ['#bm-q', '#bm-r', '#bm-s', '#bm-l', '#bm-k'].forEach(id => {
                    const el = document.querySelector(id);
                    if (el) el.style.display = 'none';
                });
                coordInputs.forEach(inp => inp.style.display = 'none');
                panel.style.cssText = 'top:10px;right:75px;width:60px;height:76px;max-width:60px;min-width:60px;padding:8px;';
                logo.style.marginLeft = '3px';
                panelInner.style.textAlign = 'center';
                panelInner.style.margin = '0';
                const dzTitle = document.querySelector('#bm-z h1');
                if (dzTitle) dzTitle.style.marginBottom = '0';
            } else {
                ['#bm-q', '#bm-r', '#bm-s', '#bm-l', '#bm-k'].forEach(id => {
                    const el = document.querySelector(id);
                    if (el) el.style.display = '';
                });
                coordInputs.forEach(inp => inp.style.display = '');
                panel.style.cssText = 'top:10px;right:75px;width:auto;max-width:300px;min-width:200px;padding:10px;';
                logo.style.marginLeft = '';
                panelInner.style.textAlign = '';
                panelInner.style.margin = '';
            }

            logo.alt = minimized
                ? 'Blue Marble Icon - Minimized (Click to maximize)'
                : 'Blue Marble Icon - Maximized (Click to minimize)';
        });

        dragHandle.appendChild(logo);
        panelInner.appendChild(dragHandle);

        // Title
        const titleH1 = document.createElement('h1');
        titleH1.textContent = SCRIPT_NAME;
        panelInner.appendChild(titleH1);

        // HR separator
        panelInner.appendChild(document.createElement('hr'));

        // User info section
        const userInfo = document.createElement('div');
        userInfo.id = 'bm-f';

        const usernameP = document.createElement('p');
        usernameP.id = 'bm-u';
        usernameP.textContent = 'Username:';

        const dropletsP = document.createElement('p');
        dropletsP.id = 'bm-p';
        dropletsP.textContent = 'Droplets:';

        const levelP = document.createElement('p');
        levelP.id = 'bm-i';
        levelP.textContent = 'Next level in...';

        userInfo.appendChild(usernameP);
        userInfo.appendChild(dropletsP);
        userInfo.appendChild(levelP);
        panelInner.appendChild(userInfo);
        panelInner.appendChild(document.createElement('hr'));

        // Controls section
        const controls = document.createElement('div');
        controls.id = 'bm-c';
        controls.style.cssText = 'display:block;';

        // Coordinate inputs container
        const coordContainer = document.createElement('div');
        coordContainer.id = 'bm-k';

        // "Use current position" button (crosshair icon)
        const coordFillBtn = document.createElement('button');
        coordFillBtn.id = 'bm-q';
        coordFillBtn.className = 'bm-D';
        coordFillBtn.style.marginTop = '0';
        coordFillBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 6"><circle cx="2" cy="2" r="2"></circle><path d="M2 6 L3.7 3 L0.3 3 Z"></path><circle cx="2" cy="2" r="0.7" fill="white"></circle></svg>';
        coordFillBtn.onclick = () => {
            const coords = uiBuilder._messageListener?.lastKnownCoords;
            if (coords?.[0]) {
                document.querySelector('#bm-v').value = coords[0] || '';
                document.querySelector('#bm-w').value = coords[1] || '';
                document.querySelector('#bm-x').value = coords[2] || '';
                document.querySelector('#bm-y').value = coords[3] || '';
                saveCoords();
            } else {
                uiBuilder.logError('Coordinates are malformed! Did you try clicking on the canvas first?');
            }
        };
        coordContainer.appendChild(coordFillBtn);

        // Helper to create a number input with paste support
        function makeCoordInput(id, placeholder, max, savedValue) {
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.id = id;
            inp.placeholder = placeholder;
            inp.min = 0;
            inp.max = max;
            inp.step = 1;
            inp.required = true;
            if (savedValue !== undefined && savedValue !== '') inp.value = savedValue;

            // Paste 4 space-separated numbers fills all 4 coord inputs
            inp.addEventListener('paste', (e) => {
                const pasted = (e.clipboardData || window.clipboardData).getData('text')
                    .split(' ').filter(Boolean).map(Number).filter(n => !isNaN(n));
                if (pasted.length === 4) {
                    const ids = ['#bm-v', '#bm-w', '#bm-x', '#bm-y'];
                    ids.forEach((sel, i) => { const el = document.querySelector(sel); if (el) el.value = pasted[i]; });
                    e.preventDefault();
                }
            });
            inp.addEventListener('input', saveCoords);
            inp.addEventListener('change', saveCoords);
            return inp;
        }

        coordContainer.appendChild(makeCoordInput('bm-v', 'Tl X', 2047, savedCoords.tlx ?? ''));
        coordContainer.appendChild(makeCoordInput('bm-w', 'Tl Y', 2047, savedCoords.tly ?? ''));
        coordContainer.appendChild(makeCoordInput('bm-x', 'Px X', 2047, savedCoords.px ?? ''));
        coordContainer.appendChild(makeCoordInput('bm-y', 'Px Y', 2047, savedCoords.py ?? ''));
        controls.appendChild(coordContainer);

        // Color filter panel (initially hidden until template is loaded)
        const colorPanel = document.createElement('div');
        colorPanel.id = 'bm-9';
        colorPanel.style.cssText = 'max-height:140px;overflow:auto;border:1px solid rgba(255,255,255,0.1);padding:4px;border-radius:4px;display:none;';

        const colorBtnRow = document.createElement('div');
        colorBtnRow.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';

        const enableAllBtn = document.createElement('button');
        enableAllBtn.id = 'bm-3';
        enableAllBtn.textContent = 'Enable All';
        enableAllBtn.onclick = () => {
            const tmpl = templateManager.templates[0];
            if (tmpl?.colorBreakdown) {
                Object.values(tmpl.colorBreakdown).forEach(c => c.enabled = true);
                window.buildColorFilterList?.();
                uiBuilder.logStatus('Enabled all colors');
            }
        };

        const disableAllBtn = document.createElement('button');
        disableAllBtn.id = 'bm-0';
        disableAllBtn.textContent = 'Disable All';
        disableAllBtn.onclick = () => {
            const tmpl = templateManager.templates[0];
            if (tmpl?.colorBreakdown) {
                Object.values(tmpl.colorBreakdown).forEach(c => c.enabled = false);
                window.buildColorFilterList?.();
                uiBuilder.logStatus('Disabled all colors');
            }
        };

        colorBtnRow.appendChild(enableAllBtn);
        colorBtnRow.appendChild(disableAllBtn);
        colorPanel.appendChild(colorBtnRow);

        const colorList = document.createElement('div');
        colorList.id = 'bm-g';
        colorPanel.appendChild(colorList);
        controls.appendChild(colorPanel);

        // File upload: NO wrapper div - directly in controls to avoid #bm-a { display:none } in the resource CSS killing everything inside it
        const hiddenFile = document.createElement('input');
        hiddenFile.type = 'file';
        hiddenFile.id = 'bm-file-input';
        hiddenFile.accept = 'image/png, image/jpeg, image/webp, image/bmp, image/gif';
        hiddenFile.style.cssText = 'display:none !important;visibility:hidden !important;position:absolute !important;left:-9999px !important;width:0 !important;height:0 !important;opacity:0 !important;';
        hiddenFile.setAttribute('tabindex', '-1');
        hiddenFile.setAttribute('aria-hidden', 'true');

        const uploadBtn = document.createElement('button');
        uploadBtn.id = 'bm-upload-btn';
        uploadBtn.textContent = 'Upload Template';
        uploadBtn.setAttribute('style', 'display:block !important;width:100%;margin-top:6px;margin-bottom:4px;')
        uploadBtn.onclick = () => hiddenFile.click();
        hiddenFile.addEventListener('change', () => {
            uploadBtn.textContent = hiddenFile.files.length > 0 ? hiddenFile.files[0].name : 'Upload Template';
        });
        controls.appendChild(hiddenFile);
        controls.appendChild(uploadBtn);

        // Action button row: Enable / Create / Disable
        const actionRow = document.createElement('div');
        actionRow.id = 'bm-4';
        actionRow.style.cssText = 'display:flex;gap:4px;margin-top:6px;';

        const enableTemplateBtn = document.createElement('button');
        enableTemplateBtn.id = 'bm-s';
        enableTemplateBtn.textContent = 'Enable';
        enableTemplateBtn.onclick = () => {
            templateManager.setEnabled(true);
            uiBuilder.logStatus('Enabled templates!');
        };

        const createTemplateBtn = document.createElement('button');
        createTemplateBtn.id = 'bm-r';
        createTemplateBtn.textContent = 'Create';
        createTemplateBtn.onclick = () => {
            const tlxInput = document.querySelector('#bm-v');
            const tlyInput = document.querySelector('#bm-w');
            const pxInput = document.querySelector('#bm-x');
            const pyInput = document.querySelector('#bm-y');

            for (const inp of [tlxInput, tlyInput, pxInput, pyInput]) {
                if (!inp.checkValidity()) {
                    inp.reportValidity();
                    uiBuilder.logError('Coordinates are malformed! Did you try clicking on the canvas first?');
                    return;
                }
            }

            const file = hiddenFile.files?.[0];
            if (!file) {
                uiBuilder.logError('No file selected!');
                return;
            }

            const coords = [
                Number(tlxInput.value),
                Number(tlyInput.value),
                Number(pxInput.value),
                Number(pyInput.value)
            ];

            templateManager.createTemplate(file, file.name.replace(/\.[^/.]+$/, ''), coords);
            uiBuilder.logStatus('Drew to canvas!');
        };

        const disableTemplateBtn = document.createElement('button');
        disableTemplateBtn.id = 'bm-l';
        disableTemplateBtn.textContent = 'Disable';
        disableTemplateBtn.onclick = () => {
            templateManager.setEnabled(false);
            uiBuilder.logStatus('Disabled templates!');
        };

        actionRow.appendChild(enableTemplateBtn);
        actionRow.appendChild(createTemplateBtn);
        actionRow.appendChild(disableTemplateBtn);
        controls.appendChild(actionRow);
        panelInner.appendChild(controls);

        // Status textarea
        const statusArea = document.createElement('textarea');
        statusArea.id = uiBuilder._statusElId;
        statusArea.placeholder = `Status: Sleeping...\nVersion: ${SCRIPT_VERSION}`;
        statusArea.readOnly = true;
        panelInner.appendChild(statusArea);

        // Bottom toolbar: external links
        const bottomBar = document.createElement('div');
        bottomBar.id = 'bm-6';

        const btnRow2 = document.createElement('div');

        const colorConverterBtn = document.createElement('button');
        colorConverterBtn.id = 'bm-m';
        colorConverterBtn.className = 'bm-D';
        colorConverterBtn.innerHTML = '🎨';
        colorConverterBtn.title = 'Template Color Converter';
        colorConverterBtn.addEventListener('click', () => {
            window.open('https://pepoafonso.github.io/color_converter_wplace/', '_blank', 'noopener noreferrer');
        });

        const websiteBtn = document.createElement('button');
        websiteBtn.id = 'bm-n';
        websiteBtn.className = 'bm-D';
        websiteBtn.innerHTML = '🌐';
        websiteBtn.title = 'Official Blue Marble Website';
        websiteBtn.addEventListener('click', () => {
            window.open('https://bluemarble.lol/', '_blank', 'noopener noreferrer');
        });

        btnRow2.appendChild(colorConverterBtn);
        btnRow2.appendChild(websiteBtn);
        bottomBar.appendChild(btnRow2);

        const creditSmall = document.createElement('small');
        creditSmall.textContent = 'Made by SwingTheVine';
        creditSmall.style.marginTop = 'auto';
        bottomBar.appendChild(creditSmall);

        const fixCredit = document.createElement('small');
        fixCredit.textContent = 'Fixed by Mory';
        fixCredit.style.cssText = 'margin-top: 2px; opacity: 0.7;';
        bottomBar.appendChild(fixCredit);

        panelInner.appendChild(bottomBar);
        panel.appendChild(panelInner);
        document.body.appendChild(panel);

        // Make the panel draggable using its drag handle
        uiBuilder.makeDraggable('bm-A', 'bm-z');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 11: COLOR FILTER LIST BUILDER
    // This is exposed on window so both internal code and message handlers
    // can call it to refresh the color filter UI after a template is loaded.
    // ─────────────────────────────────────────────────────────────────────────

    function buildColorFilterList(templateManager) {
        const container = document.querySelector('#bm-g');
        const tmpl = templateManager.templates?.[0];

        if (!container) return;
        if (!tmpl?.colorBreakdown) {
            container.innerHTML = '<small>No template colors to display.</small>';
            return;
        }

        container.innerHTML = '';
        const entries = Object.entries(tmpl.colorBreakdown).sort((a, b) => b[1].count - a[1].count);

        for (const [colorKey, colorData] of entries) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0;';

            const swatch = document.createElement('div');
            swatch.style.cssText = 'width:14px;height:14px;border:1px solid rgba(255,255,255,0.5);';

            const label = document.createElement('span');
            label.style.fontSize = '12px';

            let labelText = `${colorData.count.toLocaleString()}`;

            if (colorKey === 'other') {
                swatch.style.background = '#888';
                labelText = `Other • ${labelText}`;
            } else if (colorKey === '222,250,206') {
                swatch.style.background = 'rgb(222,250,206)';
                labelText = `Transparent • ${labelText}`;
            } else {
                const [r, g, b] = colorKey.split(',').map(Number);
                swatch.style.background = `rgb(${r},${g},${b})`;
                try {
                    const meta = templateManager.templates[0]?.colorMap?.get(colorKey);
                    if (meta && typeof meta.id === 'number') {
                        const premiumStar = meta.premium ? '★ ' : '';
                        labelText = `#${meta.id} ${premiumStar}${meta.name || `rgb(${r},${g},${b})`} • ${labelText}`;
                    }
                } catch (e) {}
            }

            label.textContent = labelText;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !!colorData.enabled;
            checkbox.addEventListener('change', () => {
                colorData.enabled = checkbox.checked;

                // FIX NOTE: Also persist the updated palette state so it survives refresh
                try {
                    const tmpl = templateManager.templates?.[0];
                    const key = tmpl?.templateKey;
                    if (tmpl && key && templateManager.persistedData?.templates?.[key]) {
                        templateManager.persistedData.templates[key].palette = tmpl.colorBreakdown;
                        Storage.set('bmTemplates', JSON.stringify(templateManager.persistedData));
                    }
                } catch (e) {}
            });

            row.appendChild(checkbox);
            row.appendChild(swatch);
            row.appendChild(label);
            container.appendChild(row);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 12: "MOVE UP/DOWN" BUTTON FOR COLOR PICKER
    // This injects a button into the site's native color picker UI to
    // reposition it (move it from bottom to top of the panel).
    // ─────────────────────────────────────────────────────────────────────────

    function setupColorPickerMoveButton() {
        const observer = new MutationObserver(() => {
            const colorEl = document.querySelector('#color-1');
            if (!colorEl) return;

            if (document.querySelector('#bm-t')) return; // Already injected

            const moveBtn = document.createElement('button');
            moveBtn.id = 'bm-t';
            moveBtn.textContent = 'Move ↑';
            moveBtn.className = 'btn btn-soft';
            moveBtn.onclick = function () {
                const container = this.parentNode.parentNode.parentNode.parentNode;
                const moveUp = this.textContent === 'Move ↑';

                container.parentNode.className = container.parentNode.className
                    .replace(moveUp ? 'bottom' : 'top', moveUp ? 'top' : 'bottom');

                container.style.borderTopLeftRadius = moveUp ? '0px' : 'var(--radius-box)';
                container.style.borderTopRightRadius = moveUp ? '0px' : 'var(--radius-box)';
                container.style.borderBottomLeftRadius = moveUp ? 'var(--radius-box)' : '0px';
                container.style.borderBottomRightRadius = moveUp ? 'var(--radius-box)' : '0px';
                this.textContent = moveUp ? 'Move ↓' : 'Move ↑';
            };

            const h2 = colorEl.parentNode?.parentNode?.parentNode?.parentNode?.querySelector('h2');
            h2?.parentNode?.appendChild(moveBtn);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 13: MAIN INITIALIZATION
    // FIX NOTE: The original script ran immediately on load. Some DOM manipulations
    // (like `document.body.appendChild`) can fail if the body isn't ready yet.
    // We wrap initialization in a function and call it after DOM is ready.
    // ─────────────────────────────────────────────────────────────────────────


    // Patch fetch on unsafeWindow IMMEDIATELY (before any page JS runs).
    // This must happen before DOMContentLoaded because the map starts loading
    // tiles as soon as the page JS initialises, which can be before DOM ready.
    // We create a minimal EventHub just for the fetch patch, then re-use it in init().
    const _earlyTemplateManager = new TemplateManager(SCRIPT_NAME, SCRIPT_VERSION, new UIBuilder(SCRIPT_NAME, SCRIPT_VERSION));
    const _earlyEventHub = new EventHub(_earlyTemplateManager);
    _earlyEventHub.injectFetchInterceptor();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _fullInit);
    } else {
        _fullInit();
    }

    function _fullInit() {
        // ── Load CSS + fonts ──────────────────────────────────────────────────
        loadStyles();

        // ── Create core instances, reusing the early event hub ────────────────
        const uiBuilder = new UIBuilder(SCRIPT_NAME, SCRIPT_VERSION);
        const templateManager = _earlyTemplateManager;
        const eventHub = _earlyEventHub;

        // Update the template manager's uiBuilder reference now that we have one
        templateManager.ui = uiBuilder;
        uiBuilder._messageListener = eventHub;

        // ── Load saved templates ──────────────────────────────────────────────
        let savedTemplates = {};
        try { savedTemplates = JSON.parse(Storage.get('bmTemplates', '{}')); } catch(e) {}
        templateManager.loadFromSave(savedTemplates).catch(e => logError('Error loading saved templates:', e));

        // ── Load/create user settings ─────────────────────────────────────────
        let userSettings = {};
        try { userSettings = JSON.parse(Storage.get('bmUserSettings', '{}')); } catch(e) {}
        if (Object.keys(userSettings).length === 0) {
            Storage.set('bmUserSettings', JSON.stringify({ uuid: crypto.randomUUID() }));
        }

        // ── Telemetry heartbeat ───────────────────────────────────────────────
        setInterval(() => eventHub.sendHeartbeat(SCRIPT_VERSION), 1_800_000);

        // ── Set up the message listener with the real uiBuilder ───────────────
        // Remove any listener set up during early init and set up the real one
        eventHub.setupMessageListener(uiBuilder);

        // ── Build UI ──────────────────────────────────────────────────────────
        buildUI(uiBuilder, templateManager);

        // ── Expose color list builder ─────────────────────────────────────────
        window.buildColorFilterList = () => buildColorFilterList(templateManager);
        window.addEventListener('message', (evt) => {
            if (evt.data?.action === 'refresh-colors' && evt.data?.source === 'blue-marble') {
                try { window.buildColorFilterList(); } catch(e) {}
            }
        });

        // ── Show color panel if templates already loaded ──────────────────────
        setTimeout(() => {
            try {
                if (templateManager.templates?.length > 0) {
                    const panel = document.querySelector('#bm-9');
                    if (panel) panel.style.display = '';
                    window.buildColorFilterList();
                }
            } catch(e) {}
        }, 0);

        // ── Color picker move button ──────────────────────────────────────────
        setupColorPickerMoveButton();

        (0, console.log)(`%c${SCRIPT_NAME}%c (${SCRIPT_VERSION}) loaded!`, 'color: cornflowerblue;', '');
    }

})();
