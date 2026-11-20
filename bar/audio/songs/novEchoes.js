// Procedural Web Audio Composition: "Nov Echoes" (Nov Area - Track 2)
// Aesthetic: Deep cavernous mountain resonances & delay taps in B Minor (BPM: 92)

class NovEchoesSequencer {
    constructor(ctx, bgmGainNode) {
        this.ctx = ctx;
        this.bgmGain = bgmGainNode;

        this.bpm = 92;
        this.stepTime = (60 / this.bpm) / 4;
        this.isPlaying = false;
        this.currentStep = 0;
        this.timerId = null;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;
        this.masterGain.connect(this.bgmGain);

        this.notes = {
            B1: 58.27, Fsharp2: 92.50, B2: 116.54,
            D3: 146.83, Fsharp3: 185.00, A3: 220.00, B3: 233.08, D4: 293.66
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
            this.triggerSubResonance(this.notes.B1, time, 3.5);
        }

        const echoPattern = [
            this.notes.B2, null, this.notes.Fsharp3, null,
            this.notes.D3, null, null,               this.notes.A3,
            this.notes.Fsharp2, null, this.notes.D4, null,
            this.notes.B3, null, null,               null
        ];

        const currentNote = echoPattern[step % 16];
        if (currentNote) {
            this.triggerEchoPluck(currentNote, time);
        }
    }

    triggerSubResonance(freq, time, duration) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.4, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + duration);
    }

    triggerEchoPluck(freq, time) {
        const delays = [0, 0.18, 0.36];
        const decays = [0.2, 0.1, 0.04];

        delays.forEach((delay, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, time + delay);

            gain.gain.setValueAtTime(decays[idx], time + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, time + delay + 0.15);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(time + delay);
            osc.stop(time + delay + 0.15);
        });
    }
}

if (typeof window.registerSong === 'function') {
    window.registerSong({
        id: 'nov_echoes',
        name: 'Nov Echoes',
        areaKey: 'nov_area',
        trackNumber: 6, // Assigned to Track 6
        SequencerClass: NovEchoesSequencer
    });
}
