// Track 4: Pix Radio Tower (Crisp Pulse Broadcast)
class PixRadioTowerSequencer {
    constructor(audioCtx, masterGainNode) {
        this.ctx = audioCtx;
        this.masterGain = masterGainNode;
        this.tempo = 72;
        this.secondsPerBeat = 60.0 / this.tempo;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.nextNoteTime = 0.0;
        this.currentStep = 0;
        this.timerID = null;
        this.isPlaying = false;

        this.notes = {
            Csharp3: 138.59, Gsharp3: 207.65, Csharp4: 277.18, E4: 329.63,
            Fsharp4: 369.99, Gsharp4: 415.30, A4: 440.00, B4: 493.88,
            Csharp5: 554.37, E5: 659.25, Gsharp5: 830.61, A5: 880.00,
            B5: 987.77, Csharp6: 1108.73, E6: 1318.51
        };

        this.beaconPattern = [
            this.notes.Csharp5, null, this.notes.Gsharp5, null,
            this.notes.Csharp6, null, this.notes.Gsharp5, null,
            this.notes.E5, null, this.notes.B4, null,
            this.notes.Gsharp4, null, this.notes.Csharp5, null
        ];

        this.transmissionMelody = {
            32:  this.notes.Csharp5,
            64:  this.notes.E5,
            96:  this.notes.Gsharp5,
            128: this.notes.Csharp6,
            192: this.notes.B4,
            256: this.notes.Gsharp5,
            320: this.notes.E5,
            384: this.notes.Csharp5
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
            this.playTone(this.notes.Csharp3, time, 3.6, 0.05, 'sine', 350);
            this.playTone(this.notes.Gsharp3, time, 3.6, 0.03, 'sine', 400);
        }

        const beaconFreq = this.beaconPattern[step % 16];
        if (beaconFreq) this.playGlassChime(beaconFreq, time, 0.35, 0.06);

        const signalFreq = this.transmissionMelody[step];
        if (signalFreq) this.playTone(signalFreq, time, 2.2, 0.08, 'triangle', 1800);

        if (step % 8 === 0) {
            this.playCarrierWave(time, 0.08, 0.015);
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

    playCarrierWave(time, duration, volume) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1760.00, time);
        osc.frequency.exponentialRampToValueAtTime(3520.00, time + duration);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(time); osc.stop(time + duration + 0.05);
    }

    playTone(freq, time, duration, volume, waveType, filterCutoff) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, time);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterCutoff || 1200, time);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        osc.start(time); osc.stop(time + duration + 0.1);
    }
}