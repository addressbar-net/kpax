// Track 2: Nov Volcanic Sluices
class NovVolcanoSequencer {
    constructor(audioCtx, masterGainNode) {
        this.ctx = audioCtx;
        this.masterGain = masterGainNode;
        this.tempo = 108;
        this.secondsPerBeat = 60.0 / this.tempo;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.nextNoteTime = 0.0;
        this.currentStep = 0;
        this.timerID = null;
        this.isPlaying = false;

        this.notes = {
            D2: 73.42, A2: 110.00, D3: 146.83, F3: 174.61, A3: 220.00,
            C4: 261.63, D4: 293.66, F4: 349.23, G4: 392.00, A4: 440.00
        };

        this.bassLine = [
            this.notes.D2, null, this.notes.D2, null,
            this.notes.A2, null, this.notes.D2, null,
            this.notes.F3, null, this.notes.D2, null,
            this.notes.A2, null, this.notes.D2, null
        ];

        this.leadPulse = [
            this.notes.D4, this.notes.F4, this.notes.A4, this.notes.D4,
            this.notes.G4, this.notes.F4, 329.63, this.notes.D4
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
        const bassFreq = this.bassLine[step % 16];
        if (bassFreq) this.playSawBass(bassFreq, time, 0.2, 0.06);

        if (step % 2 === 0) {
            const leadFreq = this.leadPulse[(step / 2) % 8];
            this.playTone(leadFreq, time, 0.12, 0.03, 'square');
        }

        if (step % 16 === 12) {
            this.playSteamVent(time, 0.15, 0.02);
        }
    }

    playSawBass(freq, time, duration, volume) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, time);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        osc.start(time); osc.stop(time + duration + 0.1);
    }

    playSteamVent(time, duration, volume) {
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
        filter.frequency.setValueAtTime(1200, time);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        noise.start(time);
    }

    playTone(freq, time, duration, volume, waveType) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(gain); gain.connect(this.masterGain);
        osc.start(time); osc.stop(time + duration + 0.1);
    }
}
