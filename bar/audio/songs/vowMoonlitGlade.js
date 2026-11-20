// Track 3: Vow Moonlit Glade
class VowGladeSequencer {
    constructor(audioCtx, masterGainNode) {
        this.ctx = audioCtx;
        this.masterGain = masterGainNode;
        this.tempo = 40;
        this.secondsPerBeat = 60.0 / this.tempo;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.nextNoteTime = 0.0;
        this.currentStep = 0;
        this.timerID = null;
        this.isPlaying = false;

        this.notes = {
            A1: 55.00, E2: 82.41, A2: 110.00, C3: 130.81, E3: 164.81, 
            Gsharp3: 207.65, A3: 220.00, B3: 246.94, C4: 261.63, E4: 329.63, F4: 349.23, Gsharp4: 415.30, A4: 440.00
        };

        this.bassWaltzPattern = [
            this.notes.A2, null, null, null,
            this.notes.E3, null, null, null,
            this.notes.Gsharp3, null, null, null
        ];

        this.gladeMelody = {
            24: this.notes.E4, 48: this.notes.F4, 72: this.notes.E4, 96: this.notes.C4,
            144: this.notes.Gsharp4, 192: this.notes.A4, 240: this.notes.E4,
            312: this.notes.F4, 384: this.notes.Gsharp3, 432: this.notes.A3
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
        const bassFreq = this.bassWaltzPattern[step % 12];
        if (bassFreq) this.playSynthNote(bassFreq, time, 1.2, 0.05, 'triangle');
        const melodyFreq = this.gladeMelody[step];
        if (melodyFreq) this.playSynthNote(melodyFreq, time, 3.5, 0.08, 'sine');
    }

    playSynthNote(freq, time, duration, volume, waveType) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(time); osc.stop(time + duration + 0.1);
    }
}
