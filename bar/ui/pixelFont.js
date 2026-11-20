/**
 * PixelFont — Bitmap Pixel Font & PNG Glyph Generator
 * 
 * Designs a retro handheld Game Boy Advance-style bitmap pixel font.
 * Each glyph is rendered onto an offscreen canvas and exported as an authentic
 * standalone PNG Data URL. Menu strings are rendered as scaled pixel bitmap images
 * ensuring 100% identical, pixel-crisp display across all devices and screen sizes.
 */

(function(window) {
    'use strict';

    // 5x7 Classic Handheld Bitmap Font Matrix (7 rows of 5 binary columns)
    const FONT_DATA = {
        'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
        'B': [0b11110, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110, 0b00000],
        'C': [0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111, 0b00000],
        'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110, 0b00000],
        'E': [0b11111, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111, 0b00000],
        'F': [0b11111, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000, 0b00000],
        'G': [0b01111, 0b10000, 0b10000, 0b10111, 0b10001, 0b01111, 0b00000],
        'H': [0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001, 0b00000],
        'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111, 0b00000],
        'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100, 0b00000],
        'K': [0b10001, 0b10010, 0b11100, 0b10100, 0b10010, 0b10001, 0b00000],
        'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111, 0b00000],
        'M': [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b00000],
        'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b00000],
        'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110, 0b00000],
        'P': [0b11110, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000, 0b00000],
        'Q': [0b01110, 0b10001, 0b10001, 0b10101, 0b10011, 0b01111, 0b00001],
        'R': [0b11110, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001, 0b00000],
        'S': [0b01111, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110, 0b00000],
        'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000],
        'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110, 0b00000],
        'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100, 0b00000],
        'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b11011, 0b10001, 0b00000],
        'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b00000],
        'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00000],
        'Z': [0b11111, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111, 0b00000],

        // Digits
        '0': [0b01110, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110, 0b00000],
        '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b01110, 0b00000],
        '2': [0b01110, 0b10001, 0b00010, 0b00100, 0b01000, 0b11111, 0b00000],
        '3': [0b11110, 0b00001, 0b00110, 0b00001, 0b00001, 0b11110, 0b00000],
        '4': [0b10010, 0b10010, 0b10010, 0b11111, 0b00010, 0b00010, 0b00000],
        '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110, 0b00000],
        '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110, 0b00000],
        '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b00000],
        '8': [0b01110, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110, 0b00000],
        '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110, 0b00000],

        // Symbols & Punctuation
        ':': [0b00000, 0b00100, 0b00000, 0b00000, 0b00100, 0b00000, 0b00000],
        '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00000],
        ',': [0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100, 0b01000],
        '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
        '+': [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
        '/': [0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b00000, 0b00000],
        '\\': [0b10000, 0b01000, 0b00100, 0b00010, 0b00001, 0b00000, 0b00000],
        '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110, 0b00000],
        ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110, 0b00000],
        '(': [0b00110, 0b01000, 0b01000, 0b01000, 0b01000, 0b00110, 0b00000],
        ')': [0b01100, 0b00010, 0b00010, 0b00010, 0b00010, 0b01100, 0b00000],
        '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100, 0b00000],
        '?': [0b01110, 0b10001, 0b00010, 0b00100, 0b00000, 0b00100, 0b00000],
        '\'': [0b00100, 0b00100, 0b01000, 0b00000, 0b00000, 0b00000, 0b00000],
        '"': [0b01010, 0b01010, 0b10100, 0b00000, 0b00000, 0b00000, 0b00000],
        '=': [0b00000, 0b11111, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
        '<': [0b00010, 0b00100, 0b01000, 0b00100, 0b00010, 0b00000, 0b00000],
        '>': [0b01000, 0b00100, 0b00010, 0b00100, 0b01000, 0b00000, 0b00000],
        '_': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b11111],
        '%': [0b10001, 0b00010, 0b00100, 0b01000, 0b10001, 0b00000, 0b00000],
        '&': [0b01100, 0b10010, 0b01100, 0b10101, 0b10010, 0b01101, 0b00000],
        '*': [0b00000, 0b10101, 0b01110, 0b10101, 0b00000, 0b00000, 0b00000],
        '×': [0b00000, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b00000],
        '|': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
        '#': [0b01010, 0b11111, 0b01010, 0b01010, 0b11111, 0b01010, 0b00000],

        // Directional Cursors & Handheld Indicators
        '▶': [0b10000, 0b11000, 0b11100, 0b11110, 0b11100, 0b11000, 0b10000],
        '►': [0b10000, 0b11000, 0b11100, 0b11110, 0b11100, 0b11000, 0b10000],
        '◄': [0b00001, 0b00011, 0b00111, 0b01111, 0b00111, 0b00011, 0b00001],
        '◀': [0b00001, 0b00011, 0b00111, 0b01111, 0b00111, 0b00011, 0b00001],
        '▼': [0b11111, 0b01110, 0b01110, 0b00100, 0b00000, 0b00000, 0b00000],
        '▲': [0b00100, 0b01110, 0b01110, 0b11111, 0b00000, 0b00000, 0b00000],

        // Handheld Cell Phone Icon (5x7 Bitmap)
        '📱': [0b01110, 0b10001, 0b11011, 0b10001, 0b10001, 0b10101, 0b01110],
        // Medallion Bolt Icon
        '⚡': [0b00110, 0b01100, 0b11111, 0b00010, 0b00110, 0b01000, 0b00000],
        // Settings Gear Icon
        '⚙': [0b01010, 0b11111, 0b10001, 0b11111, 0b01010, 0b00000, 0b00000]
    };

    class PixelFontManager {
        constructor() {
            this.glyphPNGs = {};
            this.glyphWidth = 5;
            this.glyphHeight = 7;
            this.canvasWidth = 6;  // 5 + 1px spacing
            this.canvasHeight = 8; // 7 + 1px baseline
            this.isReady = false;
            this.init();
        }

        init() {
            this.generateAllGlyphPNGs();
            this.isReady = true;
        }

        /**
         * Generates a PNG Data URL for a single character bitmap matrix.
         * @param {string} char 
         * @param {Array<number>} bitRows 
         * @returns {string} Data URL of PNG image
         */
        createGlyphPNG(char, bitRows) {
            const canvas = document.createElement('canvas');
            canvas.width = this.canvasWidth;
            canvas.height = this.canvasHeight;
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000000';

            for (let y = 0; y < bitRows.length && y < this.canvasHeight; y++) {
                const row = bitRows[y];
                for (let x = 0; x < this.glyphWidth; x++) {
                    const mask = 1 << (this.glyphWidth - 1 - x);
                    if ((row & mask) !== 0) {
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
            }

            return canvas.toDataURL('image/png');
        }

        /**
         * Pre-renders and caches every glyph as a standalone PNG.
         */
        generateAllGlyphPNGs() {
            for (const [char, rows] of Object.entries(FONT_DATA)) {
                this.glyphPNGs[char] = this.createGlyphPNG(char, rows);
            }

            // Lowercase mapping (maps to crisp uppercase or small caps)
            for (let c = 97; c <= 122; c++) {
                const lower = String.fromCharCode(c);
                const upper = lower.toUpperCase();
                if (this.glyphPNGs[upper]) {
                    this.glyphPNGs[lower] = this.glyphPNGs[upper];
                }
            }

            // Space placeholder PNG (transparent 4px)
            const spaceCanvas = document.createElement('canvas');
            spaceCanvas.width = 4;
            spaceCanvas.height = this.canvasHeight;
            this.glyphPNGs[' '] = spaceCanvas.toDataURL('image/png');
        }

        /**
         * Returns the PNG Data URL for a glyph, falling back to '?' if unknown.
         * @param {string} char
         * @returns {string}
         */
        getPNG(char) {
            if (this.glyphPNGs[char]) return this.glyphPNGs[char];
            const upper = char.toUpperCase();
            if (this.glyphPNGs[upper]) return this.glyphPNGs[upper];
            return this.glyphPNGs['?'] || '';
        }

        /**
         * Converts an arbitrary string into an HTML block of pixel-scaled PNG glyphs.
         * @param {string} text - Text to render
         * @param {Object} [options] - Rendering options
         * @param {number} [options.scale=1] - Multiplier scale
         * @param {string} [options.className=''] - Extra CSS class
         * @returns {string} HTML string of crisp pixel images
         */
        render(text, options = {}) {
            if (text === null || text === undefined) return '';
            const str = String(text);
            const scale = options.scale || 1;
            const w = this.canvasWidth * scale;
            const h = this.canvasHeight * scale;

            let html = `<span class="pixel-text ${options.className || ''}" aria-label="${this.escapeHtml(str)}" style="display:inline-flex; align-items:center; vertical-align:middle; line-height:1;">`;

            for (let i = 0; i < str.length; i++) {
                const char = str[i];
                if (char === ' ') {
                    html += `<span class="pixel-space" style="display:inline-block; width:${4 * scale}px; height:${h}px;"></span>`;
                } else if (char === '\n') {
                    html += `</span><br class="pixel-br"/><span class="pixel-text ${options.className || ''}" style="display:inline-flex; align-items:center; vertical-align:middle; line-height:1;">`;
                } else {
                    const png = this.getPNG(char);
                    html += `<img class="pixel-glyph" src="${png}" alt="${this.escapeHtml(char)}" style="width:${w}px; height:${h}px; image-rendering:pixelated; image-rendering:crisp-edges; flex-shrink:0; pointer-events:none;" />`;
                }
            }

            html += `</span>`;
            return html;
        }

        /**
         * Replaces text inside a target element with rendered pixel font PNGs.
         * @param {HTMLElement|string} target 
         * @param {string} [text] - If omitted, uses element's textContent
         */
        applyToElement(target, text = null) {
            const el = typeof target === 'string' ? document.querySelector(target) : target;
            if (!el) return;
            const str = (text !== null) ? text : el.textContent.trim();
            el.innerHTML = this.render(str);
        }

        escapeHtml(str) {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    }

    // Export Singleton to Window
    window.PixelFont = new PixelFontManager();

})(window);
