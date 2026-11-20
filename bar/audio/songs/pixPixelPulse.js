// Procedural Web Audio Composition: "Pix Pixel Pulse" (Pix Area - Track 1)
// Aesthetic: Crisp 8-bit chip chiptune rhythm in A Minor (BPM: 116)

class PixPixelPulseSequencer {
    constructor(ctx, bgmGainNode) {
        this.ctx = ctx;
        this.bgmGain = bgmGainNode;

        this.bpm = 116;
        this.stepTime = (60 / this.bpm) / 4;
        this.isPlaying = false;
        this.currentStep = 0;
        this.timerId = null;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;
        this.masterGain.connect(this.bgmGain);

        this.notes = {
            A2: 110.00, C3: 130.81, E3: 164.81,
            A3: 220.00, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.00, A4: 440.00
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
        // Chiptune Square Bass
        const bassPattern = [
            this.notes.A2, null, this.notes.A2, null,
            this.notes.C3, null, this.notes.E3, null
        ];
        const currentBass = bassPattern[step % 8];
        if (currentBass) {
            this.triggerChipBass(currentBass, time);
        }

        // Chiptune Lead
        const leadPattern = [
            this.notes.A3, this.notes.C4, this.notes.E4, this.notes.A4,
            this.notes.G4, this.notes.E4, this.notes.C4, this.notes.B3,
            this.notes.A3, this.notes.D4, this.notes.E4, this.notes.G4,
            this.notes.E4, this.notes.C4, this.notes.B3, this.notes.A3
        ];

        const currentLead = leadPattern[step % 16];
        if (currentLead) {
            this.triggerChipLead(currentLead, time);
        }
    }

    triggerChipBass(freq, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.25, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.1);
    }

    triggerChipLead(freq, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'pulse' in osc ? 'pulse' : 'square';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.08);
    }
}

if (typeof window.registerSong === 'function') {
    window.registerSong({
        id: 'pix_pixel_pulse',
        name: 'Pix Pixel Pulse',
        areaKey: 'pix_area',
        trackNumber: 8, // Assigned to Track 8
        SequencerClass: PixPixelPulseSequencer
    });
}
