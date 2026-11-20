// Track 7: Pix Subterranean Quartz (Focused-Light Resonance)
// Theme: Thawed subterranean caverns beneath Pix, optical lenses funneling sunlight through glacial ice, and glowing Citrine quartz clusters.

if (typeof PixSubterraneanQuartzSequencer === 'undefined') {
    class PixSubterraneanQuartzSequencer {
        constructor(audioCtx, masterGainNode) {
            this.ctx = audioCtx;
            this.masterGain = masterGainNode;
            this.tempo = 84; // Subterranean ambient tempo
            this.secondsPerBeat = 60.0 / this.tempo;
            this.lookahead = 25.0;
            this.scheduleAheadTime = 0.1;
            this.nextNoteTime = 0.0;
            this.currentStep = 0;
            this.timerID = null;
            this.isPlaying = false;

            // Optical / Quartz Resonance Scale (C Minor / Eb Lydian Shimmer)
            this.notes = {
                C2: 65.41, Eb2: 77.78, G2: 98.00, Bb2: 116.54,
                C3: 130.81, Eb3: 155.56, F3: 174.61, G3: 196.00, Bb3: 233.08,
                C4: 261.63, Eb4: 311.13, F4: 349.23, G4: 392.00, Bb4: 466.16,
                C5: 523.25, Eb5: 622.25, G5: 783.99, C6: 1046.50
            };

            // Deep Ice Cavern Ambient Drone
            this.cavernBass = [
                this.notes.C2, null, null, null,
                this.notes.Eb2, null, null, null,
                this.notes.G2, null, null, null,
                this.notes.C2, null, null, null
            ];

            // Focused-Light Arpeggio (Sunlight passing through lenses)
            this.lightBeamArp = [
                this.notes.C4, this.notes.Eb4, this.notes.G4, this.notes.Bb4,
                this.notes.C5, this.notes.Bb4, this.notes.G4, this.notes.Eb4
            ];

            // Quartz Resonance Sparkles (Crystallized Citrine Formations)
            this.quartzSparkles = {
                16:  this.notes.C6,
                48:  this.notes.Eb5,
                80:  this.notes.G5,
                112: this.notes.Bb4,
                144: this.notes.C6,
                176: this.notes.G5,
                208: this.notes.Eb5,
                240: this.notes.C5
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
            // 1. Cavern Drone & Deep Glacial Resonance
            if (step % 16 === 0) {
                const bassFreq = this.cavernBass[(step / 16) % 16];
                if (bassFreq) this.playSubDrone(bassFreq, time, 1.8, 0.06);
            }

            // 2. Focused Sunlight Beam Arpeggio (Mid-range optical shimmer)
            if (step % 2 === 0) {
                const arpFreq = this.lightBeamArp[(step / 2) % 8];
                this.playOpticalArp(arpFreq, time, 0.25, 0.025);
            }

            // 3. Citrine Quartz Resonance Chimes
            const sparkleFreq = this.quartzSparkles[step % 256];
            if (sparkleFreq) {
                this.playQuartzResonance(sparkleFreq, time, 0.8, 0.05);
            }

            // 4. Glacial Melt Water Drips
            if (step % 32 === 12 || step % 32 === 28) {
                this.playIceDrip(time, 0.08, 0.015);
            }
        }

        playSubDrone(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, time);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(320, time);

            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.linearRampToValueAtTime(volume, time + 0.3);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

            osc.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + duration + 0.1);
        }

        playOpticalArp(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);

            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.exponentialRampToValueAtTime(volume, time + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

            osc.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + duration + 0.1);
        }

        playQuartzResonance(freq, time, duration, volume) {
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

        playIceDrip(time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(1400, time);
            osc.frequency.exponentialRampToValueAtTime(2800, time + duration);

            gain.gain.setValueAtTime(volume, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

            osc.connect(gain); gain.connect(this.masterGain);
            osc.start(time); osc.stop(time + duration + 0.05);
        }
    }

    window.PixSubterraneanQuartzSequencer = PixSubterraneanQuartzSequencer;
}

// SELF-REGISTRATION MANIFEST: Assigns to Pix Area as Track 7
if (typeof registerSong === 'function') {
    registerSong({
        id: "pix_subterranean_quartz",
        name: "Pix Subterranean Quartz - Optical Resonance",
        areaKey: "pix_area",
        trackNumber: 7,
        SequencerClass: window.PixSubterraneanQuartzSequencer
    });
}