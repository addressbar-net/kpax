// Track 1: Pix Frozen Plazas (Base Version)
class PixPlazaSequencer {
    constructor(audioCtx, masterGainNode) {
        this.ctx = audioCtx;
        this.masterGain = masterGainNode;
        this.tempo = 64;
        this.secondsPerBeat = 60.0 / this.tempo;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.nextNoteTime = 0.0;
        this.currentStep = 0;
        this.timerID = null;
        this.isPlaying = false;

        this.notes = {
            Csharp4: 277.18, E4: 329.63, Gsharp4: 415.30, 
            A4: 440.00, Csharp5: 554.37, E5: 659.25, Gsharp5: 830.61
        };

        this.frostChimes = [
            this.notes.Csharp5, null, this.notes.E5, null,
            this.notes.Gsharp5, null, this.notes.E5, null,
            this.notes.A4, null, this.notes.Csharp5, null,
            this.notes.E5, null, this.notes.Csharp5, null
        ];

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
        const freq = this.frostChimes[step % 16];
        if (freq) {
            this.playGlassChime(freq, time, 0.35, 0.08);
        }
    }

    playGlassChime(freq, time, duration, volume) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(time); osc.stop(time + duration + 0.1);
    }
}
