// Procedural Web Audio Composition: "Vid Neon Sync" (Vid Area - Track 1)
// Aesthetic: Upbeat electronic synthwave waterways in C Minor (BPM: 120)

class VidNeonSyncSequencer {
    constructor(ctx, bgmGainNode) {
        this.ctx = ctx;
        this.bgmGain = bgmGainNode;

        this.bpm = 120;
        this.stepTime = (60 / this.bpm) / 4;
        this.isPlaying = false;
        this.currentStep = 0;
        this.timerId = null;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.85;
        this.masterGain.connect(this.bgmGain);

        this.notes = {
            C2: 65.41, G2: 98.00, C3: 130.81, Dsharp3: 155.56,
            F3: 174.61, G3: 196.00, Asharp3: 233.08, C4: 261.63, Dsharp4: 311.13
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
        // Driving Synthwave Bass
        if (step % 2 === 0) {
            this.triggerNeonBass(this.notes.C2, time);
        }

        // Electro Kick
        if (step % 4 === 0) {
            this.triggerPunchKick(time);
        }

        // Neon Arpeggio
        const arp = [
            this.notes.C3, this.notes.Dsharp3, this.notes.G3, this.notes.C4,
            this.notes.Asharp3, this.notes.G3, this.notes.Dsharp3, this.notes.F3,
            this.notes.C3, this.notes.Dsharp4, this.notes.C4, this.notes.G3,
            this.notes.F3, this.notes.Dsharp3, this.notes.G3, this.notes.Asharp3
        ];

        const currentArp = arp[step % 16];
        if (currentArp) {
            this.triggerNeonLead(currentArp, time);
        }
    }

    triggerNeonBass(freq, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, time);
        filter.frequency.exponentialRampToValueAtTime(150, time + 0.1);

        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.1);
    }

    triggerNeonLead(freq, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.12, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.08);
    }

    triggerPunchKick(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);

        gain.gain.setValueAtTime(0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.08);
    }
}

if (typeof window.registerSong === 'function') {
    window.registerSong({
        id: 'vid_neon_sync',
        name: 'Vid Neon Sync',
        areaKey: 'vid_area',
        trackNumber: 2, // Assigned to Track 2
        SequencerClass: VidNeonSyncSequencer
    });
}
