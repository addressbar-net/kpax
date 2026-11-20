// Track 4: Vow Canopy Breeze (Atmospheric Wind Resonance)
if (typeof VowCanopyBreezeSequencer === 'undefined') {
    class VowCanopyBreezeSequencer {
        constructor(audioCtx, masterGainNode) {
            this.ctx = audioCtx;
            this.masterGain = masterGainNode;
            this.tempo = 88;
            this.secondsPerBeat = 60.0 / this.tempo;
            this.lookahead = 25.0;
            this.scheduleAheadTime = 0.1;
            this.nextNoteTime = 0.0;
            this.currentStep = 0;
            this.timerID = null;
            this.isPlaying = false;

            // Pentatonic Wooded Scale (F Pentatonic Minor)
            this.notes = {
                F2: 87.31, C3: 130.81, F3: 174.61, Ab3: 207.65, Bb3: 233.08,
                C4: 261.63, Eb4: 311.13, F4: 349.23, Ab4: 415.30, Bb4: 466.16,
                C5: 523.25, Eb5: 622.25, F5: 698.46
            };

            this.woodArp = [
                this.notes.F3, this.notes.Ab3, this.notes.C4, this.notes.Eb4,
                this.notes.F4, this.notes.Eb4, this.notes.C4, this.notes.Ab3
            ];

            this.canopyChimes = {
                16:  this.notes.C5,
                48:  this.notes.Eb5,
                80:  this.notes.F5,
                112: this.notes.Ab4,
                144: this.notes.C5,
                176: this.notes.Bb4
            };

            this.totalStepsInLoop = 256;
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
            // Soft Low Sub Root
            if (step % 32 === 0) {
                this.playSubNote(this.notes.F2, time, 1.8, 0.05);
            }

            // Gentle Organic Arpeggio
            if (step % 2 === 0) {
                const freq = this.woodArp[(step / 2) % 8];
                this.playWoodNote(freq, time, 0.22, 0.025);
            }

            // Canopy Chimes
            const chimeFreq = this.canopyChimes[step % 256];
            if (chimeFreq) {
                this.playChime(chimeFreq, time, 0.9, 0.04);
            }

            // Wind Rustle (Bandpass Noise)
            if (step % 64 === 16) {
                this.playWindRustle(time, 0.6, 0.015);
            }
        }

        playSubNote(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.linearRampToValueAtTime(volume, time + 0.2);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
            osc.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + duration + 0.1);
        }

        playWoodNote(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, time);
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(650, time);
            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.exponentialRampToValueAtTime(volume, time + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
            osc.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + duration + 0.1);
        }

        playChime(freq, time, duration, volume) {
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

        playWindRustle(time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const bufferSize = this.ctx.sampleRate * duration;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(800, time);
            filter.frequency.exponentialRampToValueAtTime(1400, time + duration);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(volume, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
            noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
            noise.start(time);
        }
    }

    window.VowCanopyBreezeSequencer = VowCanopyBreezeSequencer;
}

// Self-Register to Vow Area as Track 4
if (typeof registerSong === 'function') {
    registerSong({
        id: "vow_canopy_breeze",
        name: "Vow Canopy Breeze - Air Currents",
        areaKey: "vow_forest",
        trackNumber: 4,
        SequencerClass: window.VowCanopyBreezeSequencer
    });
}