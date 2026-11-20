// Track 2: Vow Ancient Canopy
class VowCanopySequencer {
    constructor(audioCtx, masterGainNode) {
        this.ctx = audioCtx;
        this.masterGain = masterGainNode;
        this.tempo = 48;
        this.secondsPerBeat = 60.0 / this.tempo;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.nextNoteTime = 0.0;
        this.currentStep = 0;
        this.timerID = null;
        this.isPlaying = false;

        this.notes = {
            Fsharp2: 92.50, Csharp3: 138.59, Fsharp3: 185.00, A3: 220.00,
            Csharp4: 277.18, E4: 329.63, Fsharp4: 369.99, A4: 440.00, Csharp5: 554.37, E5: 659.25
        };

        this.shimmerPattern = [
            this.notes.Fsharp3, null, this.notes.Csharp4, null,
            this.notes.Fsharp4, null, this.notes.A4, null,
            this.notes.Csharp5, null, this.notes.A4, null,
            this.notes.Fsharp4, null, this.notes.Csharp4, null
        ];

        this.canopyMelody = {
            32: this.notes.E5, 64: this.notes.Csharp5, 128: this.notes.A4,
            160: this.notes.Fsharp4, 224: this.notes.E5, 288: this.notes.Csharp5,
            352: this.notes.A4, 416: this.notes.Fsharp3
        };

        this.totalStepsInLoop = 480;
    }

    start() {
        if (this.isPlaying || !this.ctx) return;
        this.isPlaying = true;
        this.currentStep = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        this.scheduler();
    }

    stop() {
        this.isPlaying = false;
        if (this.timerID) { clearTimeout(this.timerID); this.timerID = null; }
    }

    scheduler() {
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this.scheduleStep(this.currentStep, this.nextNoteTime);
            this.advanceStep();
        }
        if (this.isPlaying) { this.timerID = setTimeout(() => this.scheduler(), this.lookahead); }
    }

    advanceStep() {
        this.nextNoteTime += (this.secondsPerBeat / 4.0);
        this.currentStep = (this.currentStep + 1) % this.totalStepsInLoop;
    }

    scheduleStep(step, time) {
        const arpFreq = this.shimmerPattern[step % 16];
        if (arpFreq) this.playSynthNote(arpFreq, time, 0.4, 0.04, 'sine');
        const melodyFreq = this.canopyMelody[step];
        if (melodyFreq) this.playSynthNote(melodyFreq, time, 3.0, 0.09, 'sine');
    }

    playSynthNote(freq, time, duration, volume, waveType) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(time); osc.stop(time + duration + 0.1);
    }
}
