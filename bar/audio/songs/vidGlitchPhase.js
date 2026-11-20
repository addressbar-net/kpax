// Procedural Web Audio Composition: "Vid Glitch Phase" (Vid Area - Track 2)
// Aesthetic: Syncopated, glitchy digital pulse stream in F Minor (BPM: 126)

class VidGlitchPhaseSequencer {
    constructor(ctx, bgmGainNode) {
        this.ctx = ctx;
        this.bgmGain = bgmGainNode;

        this.bpm = 126;
        this.stepTime = (60 / this.bpm) / 4;
        this.isPlaying = false;
        this.currentStep = 0;
        this.timerId = null;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.85;
        this.masterGain.connect(this.bgmGain);

        this.notes = {
            F2: 87.31, Gsharp2: 103.83, C3: 130.81, Dsharp3: 155.56,
            F3: 174.61, Gsharp3: 207.65, C4: 261.63, Dsharp4: 311.13, F4: 349.23
        };
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

        this.currentStep = (this.currentStep + 1) % 32;
        this.timerId = setTimeout(() => this.scheduler(), this.stepTime * 1000);
    }

    playStep(step, time) {
        if (step % 4 === 0 || step % 16 === 10) {
            this.triggerGlitchBass(this.notes.F2, time);
        }

        if (step % 2 === 1) {
            this.triggerGlitchClick(time);
        }

        const pattern = [
            this.notes.F3, this.notes.C4, null,           this.notes.Gsharp3,
            this.notes.Dsharp4, null,    this.notes.F4,    this.notes.C4,
            null,          this.notes.F3,this.notes.Gsharp3, null,
            this.notes.C4, null,         this.notes.Dsharp3, this.notes.F4
        ];

        const note = pattern[step % 16];
        if (note) {
            this.triggerDigitalChirp(note, time);
        }
    }

    triggerGlitchBass(freq, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.35, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.12);
    }

    triggerDigitalChirp(freq, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, time);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, time + 0.04);

        gain.gain.setValueAtTime(0.12, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.04);
    }

    triggerGlitchClick(time) {
        const bufferSize = this.ctx.sampleRate * 0.02;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 5000;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(time);
        noise.stop(time + 0.02);
    }
}

if (typeof window.registerSong === 'function') {
    window.registerSong({
        id: 'vid_glitch_phase',
        name: 'Vid Glitch Phase',
        areaKey: 'vid_area',
        trackNumber: 3, // Assigned to Track 3
        SequencerClass: VidGlitchPhaseSequencer
    });
}
