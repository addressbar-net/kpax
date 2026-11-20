// Centralized Procedural Audio Manager Base Engine
class AudioManager {
    constructor() {
        this.ctx = null;
        this.isInitialized = false;

        this.sfxVolume = 1.0;
        this.musicVolume = 1.0;
        this.masterVolumeMultiplier = 9.0;

        this.areaTrackSelection = {
            vow_forest: 1, nov_area: 1, pix_area: 1, vid_area: 1, gem_center: 1
        };

        this.vowTrackNames = { 
            1: "Track 1 (Vow Serene Woods)", 
            2: "Track 2 (Vow Ancient Canopy)", 
            3: "Track 3 (Vow Moonlit Glade)" 
        };
        this.novTrackNames = { 
            1: "Track 1 (Nov Resonant Chords)",
            2: "Track 2 (Nov Volcanic Sluices)",
            3: "Track 3 (Nov Mountain Ascent)"
        };
        this.pixTrackNames = { 
            1: "Track 1 (Pix Frozen Plazas)", 
            2: "Track 2 (Pix Frozen Plazas - Layered Ambient)", 
            3: "Track 3 (Pix Frozen Plazas - 5-Layer Complex)",
            4: "Track 4 (Pix Radio Tower - Pulse)",
            5: "Track 5 (Pix Radio Tower - Legato Stream)",
            6: "Track 6 (Pix Communal Steel - Legato)"
        };
        this.vidTrackNames = { 
            1: "Track 1 (Vid Motion Waterways)" 
        };
        this.gemTrackNames = {
            1: "Track 1 (Center Gem Settlement)",
            2: "Track 2 (Gem Base - Opal Settlement)",
            3: "Track 3 (Gem Opal Polish)"
        };

        this.areaMap = {
            nov_area: { name: "Nov Voice Realm (West)", rooms: ["nov_entry"] },
            vow_forest: { name: "Vow Ancient Forest (South)", rooms: ["vow_entry"] },
            vid_area: { name: "Vid Waterways (North)", rooms: ["vid_entry"] },
            pix_area: { name: "Pix Frozen Plazas (East)", rooms: ["pix_entry"] },
            gem_center: { name: "Center Gem Settlement", rooms: ["gem_entry"] }
        };

        this.currentAreaKey = null;
        this.currentRoomKey = null;

        this.bgmGain = null;
        this.targetBgmGain = 0.30;
        this.sequencer = null;

        this.batWingsOsc = null;
        this.batWingsGain = null;

        this.dynamicSequencers = {};
        this.loadPreRegisteredSongs();
        this.bindEventBusListeners();
    }

    bindEventBusListeners() {
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.on('sfx:play', (type) => this.playSFX(type));
            window.EventBus.on('sfx:batWings', (active) => this.setBatWingsActive(active));
            window.EventBus.on('bgm:changeArea', (areaKey) => this.startAreaBGM(areaKey));

            // Audio Settings Event Listeners
            window.EventBus.on('audio:setSFXVolume', (val) => this.setSFXVolume(val));
            window.EventBus.on('audio:setMusicVolume', (val) => this.setMusicVolume(val));
            window.EventBus.on('audio:playMoonsynth', (data) => {
                const onPhaseShift = data ? data.onPhaseShift : null;
                const onComplete = data ? data.onComplete : null;
                this.playMoonsynth(onPhaseShift, onComplete);
            });
            window.EventBus.on('audio:setTrack', (data) => {
                const { areaKey, trackId } = data;
                if (areaKey === 'vow_forest') this.setVowTrack(trackId);
                else if (areaKey === 'nov_area') this.setNovTrack(trackId);
                else if (areaKey === 'pix_area') this.setPixTrack(trackId);
                else if (areaKey === 'vid_area') this.setVidTrack(trackId);
                else if (areaKey === 'gem_center') this.setGemTrack(trackId);
            });
        }
    }

    playMoonsynth(onPhaseShift, onComplete) {
        if (!this.isInitialized || !this.ctx) this.init();
        if (typeof window.MoonsynthSequencer !== 'undefined' && typeof window.MoonsynthSequencer.playPhaseShiftPerformance === 'function') {
            window.MoonsynthSequencer.playPhaseShiftPerformance(this.ctx, onPhaseShift, onComplete);
        } else {
            if (typeof onPhaseShift === 'function') onPhaseShift();
            if (typeof onComplete === 'function') onComplete();
        }
    }

    loadPreRegisteredSongs() {
        if (window.SONG_REGISTRY) {
            Object.values(window.SONG_REGISTRY).forEach(songDef => {
                this.registerDynamicSong(songDef);
            });
        }
    }

    registerDynamicSong(songDef) {
        const { name, areaKey, trackNumber, SequencerClass } = songDef;

        const trackMapKey = `${areaKey.split('_')[0]}TrackNames`;
        if (this[trackMapKey]) {
            this[trackMapKey][trackNumber] = `Track ${trackNumber} (${name})`;
        }

        if (!this.dynamicSequencers[areaKey]) this.dynamicSequencers[areaKey] = {};
        this.dynamicSequencers[areaKey][trackNumber] = SequencerClass;
    }

    init() {
        if (this.isInitialized) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.ctx = new AudioContext();
        this.isInitialized = true;

        const unlock = () => {
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('pointerdown', unlock);
        };
        window.addEventListener('keydown', unlock);
        window.addEventListener('pointerdown', unlock);
    }

    setSFXVolume(val) {
        this.sfxVolume = Math.max(0.0, Math.min(1.0, val));
    }

    setMusicVolume(val) {
        this.musicVolume = Math.max(0.0, Math.min(1.0, val));
        if (this.bgmGain && this.ctx) {
            const targetGain = this.targetBgmGain * this.musicVolume * this.masterVolumeMultiplier;
            this.bgmGain.gain.setValueAtTime(targetGain, this.ctx.currentTime);
        }
    }

    setVowTrack(trackId) {
        this.areaTrackSelection.vow_forest = trackId;
        if (this.currentAreaKey === 'vow_forest') this.startAreaBGM('vow_forest');
    }

    setNovTrack(trackId) {
        this.areaTrackSelection.nov_area = trackId;
        if (this.currentAreaKey === 'nov_area') this.startAreaBGM('nov_area');
    }

    setPixTrack(trackId) {
        this.areaTrackSelection.pix_area = trackId;
        if (this.currentAreaKey === 'pix_area') this.startAreaBGM('pix_area');
    }

    setVidTrack(trackId) {
        this.areaTrackSelection.vid_area = trackId;
        if (this.currentAreaKey === 'vid_area') this.startAreaBGM('vid_area');
    }

    setGemTrack(trackId) {
        this.areaTrackSelection.gem_center = trackId;
        if (this.currentAreaKey === 'gem_center') this.startAreaBGM('gem_center');
    }

    playSFX(type) {
        if (!this.isInitialized || !this.ctx) this.init();
        if (!this.ctx || this.ctx.state !== 'running' || this.sfxVolume <= 0) return;

        const now = this.ctx.currentTime;
        const masterSfx = this.sfxVolume * this.masterVolumeMultiplier;

        switch (type) {
            case 'nav': {
                const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(440, now);
                gain.gain.setValueAtTime(0.0125 * masterSfx, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
                osc.connect(gain); gain.connect(this.ctx.destination);
                osc.start(now); osc.stop(now + 0.04); break;
            }
            case 'assign': {
                const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
                osc.type = 'triangle'; osc.frequency.setValueAtTime(520, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
                gain.gain.setValueAtTime(0.025 * masterSfx, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
                osc.connect(gain); gain.connect(this.ctx.destination);
                osc.start(now); osc.stop(now + 0.08); break;
            }
            case 'desc': {
                const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(659.25, now);
                osc.frequency.setValueAtTime(783.99, now + 0.04);
                gain.gain.setValueAtTime(0.019 * masterSfx, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
                osc.connect(gain); gain.connect(this.ctx.destination);
                osc.start(now); osc.stop(now + 0.12); break;
            }
            case 'telescope_zoom': {
                const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
                gain.gain.setValueAtTime(0.019 * masterSfx, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
                osc.connect(gain); gain.connect(this.ctx.destination);
                osc.start(now); osc.stop(now + 0.2); break;
            }
            case 'land': {
                const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(120, now);
                osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
                gain.gain.setValueAtTime(0.0375 * masterSfx, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
                osc.connect(gain); gain.connect(this.ctx.destination);
                osc.start(now); osc.stop(now + 0.15); break;
            }
        }
    }

    setBatWingsActive(active) {
        if (!this.isInitialized || !this.ctx) this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        if (active && !this.batWingsOsc && this.sfxVolume > 0) {
            this.batWingsOsc = this.ctx.createOscillator();
            const lfo = this.ctx.createOscillator();
            const lfoGain = this.ctx.createGain();
            this.batWingsGain = this.ctx.createGain();

            this.batWingsOsc.type = 'sawtooth';
            this.batWingsOsc.frequency.setValueAtTime(180, now);

            lfo.frequency.setValueAtTime(8.0, now);
            lfoGain.gain.setValueAtTime(40, now);
            lfo.connect(lfoGain);
            lfoGain.connect(this.batWingsOsc.frequency);

            this.batWingsGain.gain.setValueAtTime(0.006 * this.sfxVolume * this.masterVolumeMultiplier, now);

            this.batWingsOsc.connect(this.batWingsGain);
            this.batWingsGain.connect(this.ctx.destination);

            lfo.start(now);
            this.batWingsOsc.start(now);
        } else if (!active && this.batWingsOsc) {
            this.batWingsGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
            this.batWingsOsc.stop(now + 0.05);
            this.batWingsOsc = null;
            this.batWingsGain = null;
        }
    }

    updateLocation(roomKey) {
        if (this.currentRoomKey === roomKey) return;
        this.currentRoomKey = roomKey;

        let newAreaKey = null;
        for (const [aKey, areaData] of Object.entries(this.areaMap)) {
            if (areaData.rooms.includes(roomKey)) { newAreaKey = aKey; break; }
        }

        if (!newAreaKey) return;
        this.startAreaBGM(newAreaKey);
    }

    startAreaBGM(areaKey) {
        if (!this.isInitialized || !this.ctx) this.init();
        if (!this.ctx) return;

        this.stopAreaBGM();
        this.currentAreaKey = areaKey;
        const now = this.ctx.currentTime;
        const fadeDuration = 1.5;

        const effectiveGain = this.targetBgmGain * this.musicVolume * this.masterVolumeMultiplier;

        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.setValueAtTime(0.001, now);
        this.bgmGain.gain.exponentialRampToValueAtTime(effectiveGain, now + fadeDuration);
        this.bgmGain.connect(this.ctx.destination);

        const selectedTrack = this.areaTrackSelection[areaKey] || 1;

        if (this.dynamicSequencers[areaKey] && this.dynamicSequencers[areaKey][selectedTrack]) {
            const SeqClass = this.dynamicSequencers[areaKey][selectedTrack];
            this.sequencer = new SeqClass(this.ctx, this.bgmGain);
            this.sequencer.start();
            return;
        }

        if (areaKey === 'vow_forest') {
            if (selectedTrack === 1) this.sequencer = new ForestThemeSequencer(this.ctx, this.bgmGain);
            else if (selectedTrack === 2) this.sequencer = new VowCanopySequencer(this.ctx, this.bgmGain);
            else this.sequencer = new VowGladeSequencer(this.ctx, this.bgmGain);
            this.sequencer.start();
        } else if (areaKey === 'nov_area') {
            if (selectedTrack === 1) this.sequencer = new NovVoiceSequencer(this.ctx, this.bgmGain);
            else if (selectedTrack === 2) this.sequencer = new NovVolcanoSequencer(this.ctx, this.bgmGain);
            else this.sequencer = new NovPeakSequencer(this.ctx, this.bgmGain);
            this.sequencer.start();
        } else if (areaKey === 'pix_area') {
            if (selectedTrack === 1) this.sequencer = new PixPlazaSequencer(this.ctx, this.bgmGain);
            else if (selectedTrack === 2) this.sequencer = new PixPlazaLayeredSequencer(this.ctx, this.bgmGain);
            else if (selectedTrack === 3) this.sequencer = new PixPlaza5LayerSequencer(this.ctx, this.bgmGain);
            else if (selectedTrack === 4) this.sequencer = new PixRadioTowerSequencer(this.ctx, this.bgmGain);
            else if (selectedTrack === 5) this.sequencer = new PixRadioTowerLegatoSequencer(this.ctx, this.bgmGain);
            else this.sequencer = new PixCommunalSteelSequencer(this.ctx, this.bgmGain);
            this.sequencer.start();
        } else if (areaKey === 'vid_area') {
            this.sequencer = new VidMotionSequencer(this.ctx, this.bgmGain);
            this.sequencer.start();
        } else if (areaKey === 'gem_center') {
            if (selectedTrack === 2 && typeof window.GemOpalCanopySequencer !== 'undefined') {
                this.sequencer = new window.GemOpalCanopySequencer(this.ctx, this.bgmGain);
            } else {
                this.sequencer = new GemCenterSequencer(this.ctx, this.bgmGain);
            }
            this.sequencer.start();
        }
    }

    stopAreaBGM() {
        if (this.sequencer) { this.sequencer.stop(); this.sequencer = null; }
        if (this.bgmGain && this.ctx) {
            const now = this.ctx.currentTime;
            this.bgmGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
            this.bgmGain = null;
        }
    }
}

window.audioManager = new AudioManager();
var audioManager = window.audioManager;
