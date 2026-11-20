class SVGAudioInventoryMenu {
    constructor() {
        this.selectedRegionIndex = 0;
        this.regions = [
            { id: "nov_area", name: "Nov", gem: "Ruby", color: "#E0115F", trackKey: "novTrackNames" },
            { id: "vow_forest", name: "Vow", gem: "Emerald", color: "#50C878", trackKey: "vowTrackNames" },
            { id: "vid_area", name: "Vid", gem: "Diamond", color: "#E0F7FA", trackKey: "vidTrackNames" },
            { id: "pix_area", name: "Pix", gem: "Sapphire", color: "#0F52BA", trackKey: "pixTrackNames" },
            { id: "gem_center", name: "Gem Base", gem: "Opal", color: "#A8C3BC", trackKey: "gemTrackNames" }
        ];

        this.mountedContainer = null;
    }

    renderInsideContainer(targetEl) {
        if (!targetEl) return;
        this.mountedContainer = targetEl;
        this.mountedContainer.innerHTML = this.renderSVG();
        this.bindEvents();

        const am = window.audioManager || (typeof audioManager !== 'undefined' ? audioManager : null);
        if (am && am.currentAreaKey) {
            const currentIdx = this.regions.findIndex(r => r.id === am.currentAreaKey);
            if (currentIdx !== -1) this.selectedRegionIndex = currentIdx;
        }

        this.updateSelection(this.selectedRegionIndex, false);
    }

    renderSVG() {
        return `
            <svg id="audio-inventory-svg" viewBox="0 0 450 70" style="width: 100%; max-width: 450px; height: 75px;" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <filter id="gem-glow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    
                    <!-- Ruby Gradient (Nov) -->
                    <radialGradient id="grad-ruby" cx="35%" cy="35%" r="65%">
                        <stop offset="0%" stop-color="#FF527B"/>
                        <stop offset="60%" stop-color="#E0115F"/>
                        <stop offset="100%" stop-color="#70002B"/>
                    </radialGradient>

                    <!-- Emerald Gradient (Vow) -->
                    <radialGradient id="grad-emerald" cx="35%" cy="35%" r="65%">
                        <stop offset="0%" stop-color="#A2F9C4"/>
                        <stop offset="60%" stop-color="#50C878"/>
                        <stop offset="100%" stop-color="#185E32"/>
                    </radialGradient>

                    <!-- Diamond Gradient (Vid) -->
                    <radialGradient id="grad-diamond" cx="35%" cy="35%" r="65%">
                        <stop offset="0%" stop-color="#FFFFFF"/>
                        <stop offset="50%" stop-color="#E0F7FA"/>
                        <stop offset="100%" stop-color="#80DEEA"/>
                    </radialGradient>

                    <!-- Sapphire Gradient (Pix) -->
                    <radialGradient id="grad-sapphire" cx="35%" cy="35%" r="65%">
                        <stop offset="0%" stop-color="#64B5F6"/>
                        <stop offset="60%" stop-color="#0F52BA"/>
                        <stop offset="100%" stop-color="#05215A"/>
                    </radialGradient>

                    <!-- Opal Gradient (Gem Base) -->
                    <radialGradient id="grad-opal" cx="35%" cy="35%" r="65%">
                        <stop offset="0%" stop-color="#E0F7FA"/>
                        <stop offset="50%" stop-color="#A8C3BC"/>
                        <stop offset="100%" stop-color="#4B605B"/>
                    </radialGradient>
                </defs>

                <!-- 5 Gem Slots in Nov, Vow, Vid, Pix, Gem Base Order -->
                ${this.regions.map((region, idx) => {
                    const cx = 45 + idx * 90;
                    const gradId = `grad-${region.gem.toLowerCase().replace(' ', '')}`;
                    return `
                        <g class="svg-nav-slot" data-index="${idx}" transform="translate(${cx}, 35)" style="cursor: pointer;">
                            <circle class="slot-backdrop" r="28" fill="#121418" stroke="#333A42" stroke-width="2" />
                            
                            <g class="gem-group" filter="url(#gem-glow)">
                                <polygon points="0,-18 12,-12 18,0 12,12 0,18 -12,12 -18,0 -12,-12" 
                                         fill="url(#${gradId})" stroke="${region.color}" stroke-width="1.5"/>
                                <polygon points="0,-10 6,-6 10,0 6,6 0,10 -6,6 -10,0 -6,-6" 
                                         fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>
                            </g>
                        </g>
                    `;
                }).join('')}
            </svg>
        `;
    }

    bindEvents() {
        if (!this.mountedContainer) return;
        const slots = this.mountedContainer.querySelectorAll('.svg-nav-slot');
        slots.forEach(slot => {
            slot.addEventListener('click', () => {
                const idx = parseInt(slot.getAttribute('data-index'), 10);
                this.updateSelection(idx, true);
            });
        });
    }

    updateSelection(idx, triggerAudio = true) {
        this.selectedRegionIndex = idx;
        const region = this.regions[idx];

        if (!this.mountedContainer) return;

        const backdrops = this.mountedContainer.querySelectorAll('.slot-backdrop');
        backdrops.forEach((backdrop, cardIdx) => {
            if (cardIdx === idx) {
                backdrop.setAttribute('stroke', region.color);
                backdrop.setAttribute('stroke-width', '3.5');
                backdrop.setAttribute('fill', '#1E232B');
            } else {
                backdrop.setAttribute('stroke', '#333A42');
                backdrop.setAttribute('stroke-width', '2');
                backdrop.setAttribute('fill', '#121418');
            }
        });

        if (triggerAudio) {
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('bgm:changeArea', region.id);
                window.EventBus.emit('sfx:play', 'nav');
            } else {
                const am = window.audioManager || (typeof audioManager !== 'undefined' ? audioManager : null);
                if (am) {
                    am.startAreaBGM(region.id);
                    am.playSFX('nav');
                }
            }
        }
    }
}

// Global instance
window.svgAudioMenu = new SVGAudioInventoryMenu();
