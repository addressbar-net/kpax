// Track 4: Nov Citrine Sluices (Thermal Harvest)
if (typeof NovCitrineSluicesSequencer === 'undefined') {
    class NovCitrineSluicesSequencer {
        constructor(audioCtx, masterGainNode) {
            this.ctx = audioCtx;
            this.masterGain = masterGainNode;
            this.tempo = 96;
            this.secondsPerBeat = 60.0 / this.tempo;
            this.lookahead = 25.0;
            this.scheduleAheadTime = 0.1;
            this.nextNoteTime = 0.0;
            this.currentStep = 0;
            this.timerID = null;
            this.isPlaying = false;

            this.notes = {
                D1: 36.71, D2: 73.42, A2: 110.00, D3: 146.83, F3: 174.61,
                A3: 220.00, C4: 261.63, D4: 293.66, F4: 349.23, A4: 440.00,
                C5: 523.25, D5: 587.33, F5: 698.46, A5: 880.00, C6: 1046.50
            };

            this.bassPulse = [
                this.notes.D2, null, this.notes.D2, null,
                this.notes.A2, null, this.notes.D2, null,
                this.notes.F3, null, this.notes.D2, null,
                this.notes.A2, null, this.notes.D2, null
            ];

            this.citrineSparkles = {
                8:   this.notes.A5, 24:  this.notes.C6, 40:  this.notes.F5, 72:  this.notes.D5,
                104: this.notes.C6, 136: this.notes.A5, 168: this.notes.F5, 200: this.notes.D5,
                232: this.notes.A5, 264: this.notes.C6, 296: this.notes.F5, 328: this.notes.D5,
                360: this.notes.C6, 392: this.notes.A5, 424: this.notes.F5, 456: this.notes.D5
            };

            this.moltenArp = [
                this.notes.D3, this.notes.F3, this.notes.A3, this.notes.D4,
                this.notes.F4, this.notes.D4, this.notes.A3, this.notes.F3
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
            if (step % 32 === 0) this.playThermalThump(this.notes.D1, time, 0.4, 0.08);

            const bassFreq = this.bassPulse[step % 16];
            if (bassFreq) this.playSawBass(bassFreq, time, 0.18, 0.05);

            if (step % 2 === 0) {
                const arpFreq = this.moltenArp[(step / 2) % 8];
                this.playSynthNote(arpFreq, time, 0.12, 0.03, 'triangle');
            }

            const sparkleFreq = this.citrineSparkles[step];
            if (sparkleFreq) this.playCitrineSparkle(sparkleFreq, time, 0.3, 0.07);

            if (step % 32 === 16) this.playSteamVent(time, 0.18, 0.02);
        }

        playThermalThump(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * 1.5, time);
            osc.frequency.exponentialRampToValueAtTime(freq, time + 0.05);
            gain.gain.setValueAtTime(volume, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
            osc.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + duration + 0.1);
        }

        playSawBass(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, time);
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(500, time);
            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.exponentialRampToValueAtTime(volume, time + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
            osc.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + duration + 0.1);
        }

        playCitrineSparkle(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.exponentialRampToValueAtTime(volume, time + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
            osc.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + duration + 0.1);
        }

        playSteamVent(time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const bufferSize = this.ctx.sampleRate * duration;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1400, time);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(volume, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
            noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
            noise.start(time);
        }

        playSynthNote(freq, time, duration, volume, waveType) {
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

    window.NovCitrineSluicesSequencer = NovCitrineSluicesSequencer;
}

// SELF-REGISTRATION MANIFEST
if (typeof registerSong === 'function') {
    registerSong({
        id: "nov_citrine_sluices",
        name: "Nov Citrine Sluices - Thermal Harvest",
        areaKey: "nov_area",
        trackNumber: 4,
        SequencerClass: window.NovCitrineSluicesSequencer
    });
}
