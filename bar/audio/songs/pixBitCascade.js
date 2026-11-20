// Procedural Web Audio Composition: "Pix Bit Cascade" (Pix Area - Track 2)
// Aesthetic: Fast cascading bitwise arpeggios in E Minor (BPM: 132)

class PixBitCascadeSequencer {
    constructor(ctx, bgmGainNode) {
        this.ctx = ctx;
        this.bgmGain = bgmGainNode;

        this.bpm = 132;
        this.stepTime = (60 / this.bpm) / 4;
        this.isPlaying = false;
        this.currentStep = 0;
        this.timerId = null;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;
        this.masterGain.connect(this.bgmGain);

        this.notes = {
            E2: 82.41, B2: 123.47, E3: 164.81, G3: 196.00,
            B3: 246.94, E4: 329.63, G4: 392.00, B4: 493.88, E5: 659.25
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
        // Fast Sub Stabs
        if (step % 4 === 0) {
            this.triggerSubStab(this.notes.E2, time);
        }

        // Fast Cascading 16th Arps
        const cascade = [
            this.notes.E3, this.notes.G3, this.notes.B3, this.notes.E4,
            this.notes.G4, this.notes.B4, this.notes.E5, this.notes.B4,
            this.notes.G4, this.notes.E4, this.notes.B3, this.notes.G3,
            this.notes.E3, this.notes.B2, this.notes.E3, this.notes.G3
        ];

        const note = cascade[step % 16];
        if (note) {
            this.triggerBitArp(note, time);
        }
    }

    triggerSubStab(freq, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.35, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.15);
    }

    triggerBitArp(freq, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.12, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.06);
    }
}

if (typeof window.registerSong === 'function') {
    window.registerSong({
        id: 'pix_bit_cascade',
        name: 'Pix Bit Cascade',
        areaKey: 'pix_area',
        trackNumber: 9, // Assigned to Track 9
        SequencerClass: PixBitCascadeSequencer
    });
}
