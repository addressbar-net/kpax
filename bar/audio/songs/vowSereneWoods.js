// Track 1: Vow Serene Woods
class ForestThemeSequencer {
    constructor(audioCtx, masterGainNode) {
        this.ctx = audioCtx;
        this.masterGain = masterGainNode;
        this.tempo = 60;
        this.secondsPerBeat = 60.0 / this.tempo;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.nextNoteTime = 0.0;
        this.currentStep = 0;
        this.timerID = null;
        this.isPlaying = false;

        this.notes = {
            A2: 110.00, E3: 164.81, A3: 220.00, B3: 246.94, Csharp4: 277.18, 
            E4: 329.63, Fsharp4: 369.99, A4: 440.00, Csharp5: 554.37, E5: 659.25
        };

        this.ostinatoPattern = [
            this.notes.A3, null, this.notes.Csharp4, null,
            this.notes.E4, null, this.notes.Csharp4, null,
            this.notes.A3, null, this.notes.E4, null,
            this.notes.Csharp4, null, this.notes.A3, null
        ];

        this.melodyArc = {
            16:  this.notes.A4, 24:  this.notes.Fsharp4, 32:  this.notes.E4,
            64:  this.notes.Csharp5, 80:  this.notes.A4, 120: this.notes.Fsharp4,
            144: this.notes.Csharp5, 240: this.notes.E5, 256: this.notes.Csharp5,
            360: this.notes.E4, 448: this.notes.Csharp4
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
        const ostinatoFreq = this.ostinatoPattern[step % 16];
        if (ostinatoFreq) this.playSynthNote(ostinatoFreq, time, 0.25, 0.05, 'triangle');
        const melodyFreq = this.melodyArc[step];
        if (melodyFreq) this.playSynthNote(melodyFreq, time, 2.2, 0.12, 'sine');
    }

    playSynthNote(freq, time, duration, volume, waveType) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(time); osc.stop(time + duration + 0.1);
    }
}
