// Procedural Web Audio Composition: "Nov Starlight" (Nov Area - Track 1)
// Aesthetic: Resonant, starry, open voice-realm chords in G Major (BPM: 100)

class NovStarlightSequencer {
    constructor(ctx, bgmGainNode) {
        this.ctx = ctx;
        this.bgmGain = bgmGainNode;

        this.bpm = 100;
        this.stepTime = (60 / this.bpm) / 4;
        this.isPlaying = false;
        this.currentStep = 0;
        this.timerId = null;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;
        this.masterGain.connect(this.bgmGain);

        this.notes = {
            G2: 98.00, D3: 146.83, G3: 196.00, B3: 246.94,
            D4: 293.66, Fsharp4: 369.99, G4: 392.00, B4: 493.88, D5: 587.33
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
        if (step % 16 === 0) {
            this.triggerWarmDrone(this.notes.G2, time, 4.0);
            this.triggerWarmDrone(this.notes.D3, time, 4.0);
        }

        const arpeggio = [
            this.notes.G3, this.notes.B3, this.notes.D4, this.notes.Fsharp4,
            this.notes.G4, this.notes.D4, this.notes.B3, this.notes.G3,
            this.notes.D4, this.notes.Fsharp4, this.notes.B4, this.notes.D5,
            this.notes.B4, this.notes.G4, this.notes.D4, this.notes.B3
        ];

        const currentNote = arpeggio[step % 16];
        if (currentNote) {
            this.triggerStarBell(currentNote, time);
        }
    }

    triggerWarmDrone(freq, time, duration) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.01, time);
        gain.gain.linearRampToValueAtTime(0.25, time + 0.8);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + duration);
    }

    triggerStarBell(freq, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + 0.25);
    }
}

if (typeof window.registerSong === 'function') {
    window.registerSong({
        id: 'nov_starlight',
        name: 'Nov Starlight',
        areaKey: 'nov_area',
        trackNumber: 5, // Assigned to Track 5
        SequencerClass: NovStarlightSequencer
    });
}
