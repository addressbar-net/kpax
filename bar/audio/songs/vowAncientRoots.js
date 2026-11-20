// Track 5: Vow Ancient Roots (Deep Subterranean Flora)
if (typeof VowAncientRootsSequencer === 'undefined') {
    class VowAncientRootsSequencer {
        constructor(audioCtx, masterGainNode) {
            this.ctx = audioCtx;
            this.masterGain = masterGainNode;
            this.tempo = 76;
            this.secondsPerBeat = 60.0 / this.tempo;
            this.lookahead = 25.0;
            this.scheduleAheadTime = 0.1;
            this.nextNoteTime = 0.0;
            this.currentStep = 0;
            this.timerID = null;
            this.isPlaying = false;

            this.notes = {
                D1: 36.71, D2: 73.42, F2: 87.31, A2: 110.00, D3: 146.83,
                F3: 174.61, A3: 220.00, C4: 261.63, D4: 293.66, F4: 349.23
            };

            this.rootBass = [
                this.notes.D2, null, this.notes.D2, null,
                this.notes.F2, null, this.notes.A2, null
            ];

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
            // Deep Sub Thump
            if (step % 16 === 0) {
                this.playSubPulse(this.notes.D1, time, 0.6, 0.07);
            }

            // Warm Root Bass
            if (step % 4 === 0) {
                const freq = this.rootBass[(step / 4) % 8];
                if (freq) this.playRootBass(freq, time, 0.35, 0.04);
            }

            // Mossy Resonance Pluck
            if (step % 8 === 2) {
                this.playPluck(this.notes.F3, time, 0.18, 0.025);
            }
        }

        playSubPulse(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(volume, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
            osc.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + duration + 0.1);
        }

        playRootBass(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, time);
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(380, time);
            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.exponentialRampToValueAtTime(volume, time + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
            osc.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + duration + 0.1);
        }

        playPluck(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.exponentialRampToValueAtTime(volume, time + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
            osc.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + duration + 0.1);
        }
    }

    window.VowAncientRootsSequencer = VowAncientRootsSequencer;
}

// Self-Register to Vow Area as Track 5
if (typeof registerSong === 'function') {
    registerSong({
        id: "vow_ancient_roots",
        name: "Vow Ancient Roots - Deep Pulse",
        areaKey: "vow_forest",
        trackNumber: 5,
        SequencerClass: window.VowAncientRootsSequencer
    });
}