// Track 3: Nov Mountain Ascent
class NovPeakSequencer {
    constructor(audioCtx, masterGainNode) {
        this.ctx = audioCtx;
        this.masterGain = masterGainNode;
        this.tempo = 82;
        this.secondsPerBeat = 60.0 / this.tempo;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.nextNoteTime = 0.0;
        this.currentStep = 0;
        this.timerID = null;
        this.isPlaying = false;

        this.notes = {
            D2: 73.42, A2: 110.00, D3: 146.83, F3: 174.61, A3: 220.00,
            C4: 261.63, D4: 293.66, F4: 349.23, A4: 440.00, D5: 587.33
        };

        this.peakArp = [
            this.notes.D3, null, this.notes.A3, null,
            this.notes.F3, null, this.notes.D4, null
        ];

        this.summitMelody = {
            32:  this.notes.A4,
            64:  this.notes.F4,
            96:  this.notes.D4,
            128: this.notes.D5,
            192: this.notes.A4,
            256: this.notes.F4,
            320: this.notes.C4,
            384: this.notes.D4
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
            this.playTone(this.notes.D2, time, 3.5, 0.06, 'sawtooth', 300);
        }

        const arpFreq = this.peakArp[step % 8];
        if (arpFreq) this.playTone(arpFreq, time, 0.4, 0.03, 'triangle', 800);

        const melFreq = this.summitMelody[step];
        if (melFreq) this.playTone(melFreq, time, 2.8, 0.07, 'sine', 1500);

        if (step % 32 === 16) {
            this.playMountainWind(time, 0.6, 0.015);
        }
    }

    playTone(freq, time, duration, volume, waveType, filterCutoff) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, time);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterCutoff || 1000, time);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        osc.start(time); osc.stop(time + duration + 0.1);
    }

    playMountainWind(time, duration, volume) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(600, time);
        filter.Q.setValueAtTime(3.0, time);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        noise.start(time);
    }
}
