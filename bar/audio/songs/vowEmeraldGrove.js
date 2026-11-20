// Track 6: Vow Emerald Grove (Luminescent Canopy Harmonic)
if (typeof VowEmeraldGroveSequencer === 'undefined') {
    class VowEmeraldGroveSequencer {
        constructor(audioCtx, masterGainNode) {
            this.ctx = audioCtx;
            this.masterGain = masterGainNode;
            this.tempo = 92;
            this.secondsPerBeat = 60.0 / this.tempo;
            this.lookahead = 25.0;
            this.scheduleAheadTime = 0.1;
            this.nextNoteTime = 0.0;
            this.currentStep = 0;
            this.timerID = null;
            this.isPlaying = false;

            this.notes = {
                A2: 110.00, C3: 130.81, E3: 164.81, G3: 196.00,
                A3: 220.00, C4: 261.63, E4: 329.63, G4: 392.00,
                A4: 440.00, C5: 523.25, E5: 659.25, A5: 880.00
            };

            this.groveArp = [
                this.notes.A3, this.notes.C4, this.notes.E4, this.notes.G4,
                this.notes.A4, this.notes.G4, this.notes.E4, this.notes.C4
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
            // Emerald Drone Swell
            if (step % 32 === 0) {
                this.playEmeraldSwell(this.notes.A2, time, 2.0, 0.05);
            }

            // Bright Canopy Arp
            if (step % 2 === 0) {
                const freq = this.groveArp[(step / 2) % 8];
                this.playBell(freq, time, 0.3, 0.03);
            }

            // High Sparkle Ring
            if (step % 32 === 16) {
                this.playBell(this.notes.E5, time, 0.8, 0.04);
            }
        }

        playEmeraldSwell(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.linearRampToValueAtTime(volume, time + 0.4);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
            osc.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + duration + 0.1);
        }

        playBell(freq, time, duration, volume) {
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
    }

    window.VowEmeraldGroveSequencer = VowEmeraldGroveSequencer;
}

// Self-Register to Vow Area as Track 6
if (typeof registerSong === 'function') {
    registerSong({
        id: "vow_emerald_grove",
        name: "Vow Emerald Grove - Canopy Harmonics",
        areaKey: "vow_forest",
        trackNumber: 6,
        SequencerClass: window.VowEmeraldGroveSequencer
    });
}