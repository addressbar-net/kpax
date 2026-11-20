// Track: The Center Gem (Home Settlement)
class GemCenterSequencer {
    constructor(audioCtx, masterGainNode) {
        this.ctx = audioCtx;
        this.masterGain = masterGainNode;
        this.tempo = 58;
        this.secondsPerBeat = 60.0 / this.tempo;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.nextNoteTime = 0.0;
        this.currentStep = 0;
        this.timerID = null;
        this.isPlaying = false;

        this.notes = {
            A2: 110.00, Csharp3: 138.59, E3: 164.81, Fsharp3: 185.00,
            A3: 220.00, B3: 246.94, Csharp4: 277.18, E4: 329.63,
            Fsharp4: 369.99, A4: 440.00, Csharp5: 554.37
        };

        this.gemOstinato = [
            this.notes.A3, null, this.notes.E4, null,
            this.notes.Csharp4, null, this.notes.A3, null,
            this.notes.Fsharp3, null, this.notes.Csharp4, null,
            this.notes.E4, null, this.notes.Csharp4, null
        ];

        this.gemMelody = {
            32:  this.notes.A4,
            64:  this.notes.Fsharp4,
            96:  this.notes.E4,
            128: this.notes.Csharp5,
            192: this.notes.A4,
            256: 659.25,
            320: this.notes.Csharp5,
            384: this.notes.A4
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
        if (step % 32 === 0) {
            this.playTone(this.notes.A2, time, 3.8, 0.04, 'sine');
            this.playTone(this.notes.E3, time, 3.8, 0.03, 'sine');
            this.playTone(this.notes.Csharp4, time, 3.8, 0.03, 'triangle');
        }

        const ostFreq = this.gemOstinato[step % 16];
        if (ostFreq) this.playTone(ostFreq, time, 0.3, 0.05, 'triangle');

        const melFreq = this.gemMelody[step];
        if (melFreq) this.playTone(melFreq, time, 2.5, 0.08, 'sine');
    }

    playTone(freq, time, duration, volume, waveType) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(time); osc.stop(time + duration + 0.1);
    }
}
