// Track 3: Pix Frozen Plazas (5-Layer Complex)
class PixPlaza5LayerSequencer {
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
            Csharp2: 69.30, Gsharp2: 103.83, A2: 110.00, Csharp3: 138.59, E3: 164.81,
            Csharp4: 277.18, E4: 329.63, Gsharp4: 415.30, A4: 440.00, B4: 493.88,
            Csharp5: 554.37, E5: 659.25, Gsharp5: 830.61, A5: 880.00, B5: 987.77, Csharp6: 1108.73
        };

        this.chimePhraseA = [
            this.notes.Csharp5, null, this.notes.E5, null,
            this.notes.Gsharp5, null, this.notes.A5, null,
            this.notes.B5, null, this.notes.Gsharp5, null,
            this.notes.E5, null, this.notes.Csharp5, null
        ];
        this.chimePhraseB = [
            this.notes.A4, null, this.notes.Csharp5, null,
            this.notes.E5, null, this.notes.Csharp5, null,
            this.notes.Gsharp5, null, this.notes.E5, null,
            this.notes.B5, null, this.notes.Csharp6, null
        ];

        this.subBassPattern = [
            this.notes.Csharp2, null, null, null,
            this.notes.Gsharp2, null, null, null,
            this.notes.A2, null, null, null,
            this.notes.E3, null, null, null
        ];

        this.padSwells = {
            0:   this.notes.Csharp4,
            64:  this.notes.E4,
            128: this.notes.Gsharp4,
            192: this.notes.A4,
            256: this.notes.Csharp5,
            384: this.notes.E4
        };

        this.shimmerArp = [
            this.notes.E5, this.notes.Gsharp5, this.notes.Csharp6, this.notes.Gsharp5,
            this.notes.E5, this.notes.Gsharp5, this.notes.Csharp6, this.notes.Gsharp5
        ];

        this.bellEchoes = {
            48:  this.notes.Gsharp4,
            112: this.notes.Csharp5,
            208: this.notes.E5,
            336: this.notes.B5,
            416: this.notes.Csharp6
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
        const isPhraseB = Math.floor(step / 16) % 2 === 1;
        const chimePattern = isPhraseB ? this.chimePhraseB : this.chimePhraseA;
        const chimeFreq = chimePattern[step % 16];
        if (chimeFreq) this.playTone(chimeFreq, time, 0.3, 0.07, 'triangle');

        const bassFreq = this.subBassPattern[step % 16];
        if (bassFreq) this.playTone(bassFreq, time, 1.8, 0.06, 'sine');

        const padFreq = this.padSwells[step];
        if (padFreq) this.playTone(padFreq, time, 3.5, 0.04, 'sine');

        if (step % 2 === 0) {
            const arpFreq = this.shimmerArp[(step / 2) % 8];
            this.playTone(arpFreq, time, 0.12, 0.02, 'sine');
        }

        const bellFreq = this.bellEchoes[step];
        if (bellFreq) this.playTone(bellFreq, time, 4.0, 0.05, 'square');
    }

    playTone(freq, time, duration, volume, waveType) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(time); osc.stop(time + duration + 0.1);
    }
}
