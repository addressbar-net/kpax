// Procedural Web Audio Composition: "Gem Resonance (Opal Polish)"
// Focus: Solid terrain dynamics, precision ground physics, D Minor (BPM: 112)

class GemOpalPhysicsSequencer {
    constructor(ctx, bgmGainNode) {
        this.ctx = ctx;
        this.bgmGain = bgmGainNode;

        this.bpm = 112;
        this.stepTime = (60 / this.bpm) / 4; // 16th note step (~0.133s)
        this.isPlaying = false;
        this.currentStep = 0;
        this.timerId = null;

        // Sub-gain Node for this Sequencer
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.85;
        this.masterGain.connect(this.bgmGain);

        // Scale Frequencies (D Minor Crystalline Scale)
        this.notes = {
            D2: 73.42, F2: 87.31, A2: 110.00, C3: 130.81,
            D3: 146.83, F3: 174.61, A3: 220.00, C4: 261.63,
            D4: 293.66, E4: 329.63, F4: 349.23, A4: 440.00, C5: 523.25
        };

        this.bindEventBus();
    }

    bindEventBus() {
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.on('sfx:play', (sfxKey) => {
                if (sfxKey === 'land' && this.isPlaying) {
                    this.triggerImpactResonance(this.ctx.currentTime);
                }
            });
        }
    }

    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.currentStep = 0;
        this.scheduler();
    }

    stop() {
        this.isPlaying = false;
        if (this.timerId) clearTimeout(this.timerId);
    }

    scheduler() {
        if (!this.isPlaying) return;

        const startTime = this.ctx.currentTime + 0.05;
        this.playStep(this.currentStep, startTime);

        this.currentStep = (this.currentStep + 1) % 64; // 4-bar 16th pattern
        this.timerId = setTimeout(() => this.scheduler(), this.stepTime * 1000);
    }

    playStep(step, time) {
        // --- 1. GROUND BASS (Solid Terrain Cadence) ---
        const bassPattern = [
            this.notes.D2, null, this.notes.D2, null,
            this.notes.F2, null, this.notes.D2, null,
            this.notes.A2, null, this.notes.F2, null,
            this.notes.C3, null, this.notes.D2, null
        ];

        const currentBass = bassPattern[step % 16];
        if (currentBass) {
            this.triggerGroundBass(currentBass, time);
        }

        // --- 2. TERRAIN KICK & CLICK (Step Timing) ---
        if (step % 4 === 0) {
            this.triggerSolidKick(time);
        }
        if (step % 8 === 4) {
            this.triggerMechanicalSnare(time);
        }

        // --- 3. GEOMETRIC OPAL ARPEGGIO (Precision Pulses) ---
        const crystalPattern = [
            this.notes.D4, this.notes.F4, this.notes.A4, this.notes.C5,
            null,          this.notes.A4, this.notes.F4, this.notes.D4,
            this.notes.E4, this.notes.A4, this.notes.C5, null,
            this.notes.F4, this.notes.D4, this.notes.A3, this.notes.F3
        ];

        const currentCrystal = crystalPattern[step % 16];
        if (currentCrystal) {
            this.triggerOpalPulse(currentCrystal, time);
        }
    }

    // --- SYNTH VOICE GENERATORS ---

    triggerGroundBass(freq, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(350, time);
        filter.frequency.exponentialRampToValueAtTime(120, time + 0.18);

        gain.gain.setValueAtTime(0.35, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.18);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.18);
    }

    triggerOpalPulse(freq, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.18, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.1);
    }

    triggerSolidKick(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(130, time);
        osc.frequency.exponentialRampToValueAtTime(38, time + 0.09);

        gain.gain.setValueAtTime(0.6, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.09);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.09);
    }

    triggerMechanicalSnare(time) {
        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2400;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(time);
        noise.stop(time + 0.05);
    }

    triggerImpactResonance(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(this.notes.D3, time);
        osc.frequency.exponentialRampToValueAtTime(this.notes.D2, time + 0.25);

        gain.gain.setValueAtTime(0.25, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.25);
    }
}

// Auto-register using window.registerSong
if (typeof window.registerSong === 'function') {
    window.registerSong({
        id: 'gem_opal_physics',
        name: 'Gem Opal Polish',
        areaKey: 'gem_center',
        trackNumber: 3,
        SequencerClass: GemOpalPhysicsSequencer
    });
}