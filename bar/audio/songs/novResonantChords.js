// Track 1: Nov Resonant Chords
class NovVoiceSequencer {
    constructor(audioCtx, masterGainNode) {
        this.ctx = audioCtx;
        this.masterGain = masterGainNode;
        this.tempo = 50;
        this.secondsPerBeat = 60.0 / this.tempo;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.nextNoteTime = 0.0;
        this.currentStep = 0;
        this.timerID = null;
        this.isPlaying = false;

        this.notes = {
            A2: 110.00, E3: 164.81, A3: 220.00, C4: 261.63, 
            E4: 329.63, F4: 349.23, Gsharp4: 415.30, A4: 440.00, C5: 523.25, E5: 659.25
        };

        this.chordPads = [
            [this.notes.A2, this.notes.E3, this.notes.C4],
            [this.notes.A2, this.notes.F4, this.notes.C4],
            [this.notes.E3, this.notes.Gsharp4, 246.94],
            [this.notes.A2, this.notes.E3, this.notes.A3]
        ];

        this.voiceMelodyArc = {
            16: this.notes.A4, 32: this.notes.C5, 48: 246.94,
            80: this.notes.Gsharp4, 96: this.notes.A4, 128: this.notes.E5,
            160: this.notes.F4, 200: this.notes.E4, 256: this.notes.C4,
            320: this.notes.Gsharp4, 400: this.notes.A3
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
            const chord = this.chordPads[Math.floor(step / 32) % this.chordPads.length];
            chord.forEach(freq => this.playFormantResonantNote(freq, time, 3.2, 0.05));
        }
        const melodyFreq = this.voiceMelodyArc[step];
        if (melodyFreq) this.playSynthNote(melodyFreq, time, 2.5, 0.08, 'sine');
    }

    playFormantResonantNote(freq, time, duration, volume) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(freq * 1.5, time);
        filter.Q.setValueAtTime(4.0, time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        osc.start(time); osc.stop(time + duration + 0.1);
    }

    playSynthNote(freq, time, duration, volume, waveType) {
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
