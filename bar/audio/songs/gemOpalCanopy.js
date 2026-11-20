// Track 2: Gem Base (Opal Settlement - Resonant Horizons)
if (typeof GemOpalCanopySequencer === 'undefined') {
    class GemOpalCanopySequencer {
        constructor(audioCtx, masterGainNode) {
            this.ctx = audioCtx;
            this.masterGain = masterGainNode;
            this.tempo = 62;
            this.secondsPerBeat = 60.0 / this.tempo;
            this.lookahead = 25.0;
            this.scheduleAheadTime = 0.1;
            this.nextNoteTime = 0.0;
            this.currentStep = 0;
            this.timerID = null;
            this.isPlaying = false;

            // F# Minor / A Major Opal Harmonized Frequency Scale
            this.notes = {
                Fsharp2: 92.50, Csharp3: 138.59, Fsharp3: 185.00, A3: 220.00,
                Csharp4: 277.18, E4: 329.63, Fsharp4: 369.99, A4: 440.00,
                B4: 493.88, Csharp5: 554.37, E5: 659.25, Fsharp5: 739.99
            };

            // Opal Ambient Pad Swells
            this.padChords = [
                [this.notes.Fsharp2, this.notes.Csharp3, this.notes.A3],
                [this.notes.A3, this.notes.Csharp4, this.notes.E4],
                [this.notes.Fsharp3, this.notes.A3, this.notes.Csharp4],
                [this.notes.Csharp3, this.notes.Fsharp3, this.notes.B4]
            ];

            // Horizon Pulse Arpeggio
            this.pulseArp = [
                this.notes.Csharp4, this.notes.E4, this.notes.Fsharp4, this.notes.A4,
                this.notes.Csharp5, this.notes.A4, this.notes.Fsharp4, this.notes.E4
            ];

            // Reflective Lead Arc
            this.leadMelody = {
                32:  this.notes.A4,
                64:  this.notes.Csharp5,
                96:  this.notes.E5,
                128: this.notes.Fsharp5,
                160: this.notes.E5,
                192: this.notes.Csharp5,
                224: this.notes.B4,
                256: this.notes.A4
            };

            this.totalStepsInLoop = 384;
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
            // 1. Warm Opal Pad Swell (Every 32 Steps)
            if (step % 32 === 0) {
                const chord = this.padChords[Math.floor(step / 32) % this.padChords.length];
                chord.forEach(freq => this.playPadSwell(freq, time, 3.6, 0.04));
            }

            // 2. Crystal Horizon Pulse (Eight-Note Arp)
            if (step % 2 === 0) {
                const freq = this.pulseArp[(step / 2) % 8];
                this.playCrystalNote(freq, time, 0.28, 0.025);
            }

            // 3. Lead Horizon Tone
            const leadFreq = this.leadMelody[step];
            if (leadFreq) {
                this.playLeadTone(leadFreq, time, 2.4, 0.06);
            }
        }

        playPadSwell(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, time);

            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.linearRampToValueAtTime(volume, time + 0.8);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(time);
            osc.stop(time + duration + 0.1);
        }

        playCrystalNote(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);

            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.exponentialRampToValueAtTime(volume, time + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(time);
            osc.stop(time + duration + 0.1);
        }

        playLeadTone(freq, time, duration, volume) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);

            gain.gain.setValueAtTime(0.0001, time);
            gain.gain.exponentialRampToValueAtTime(volume, time + 0.12);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(time);
            osc.stop(time + duration + 0.1);
        }
    }

    window.GemOpalCanopySequencer = GemOpalCanopySequencer;
}

// Self-Register to Gem Base Area as Track 2
if (typeof registerSong === 'function') {
    registerSong({
        id: "gem_opal_canopy",
        name: "Gem Base - Opal Settlement (Resonant Horizons)",
        areaKey: "gem_center",
        trackNumber: 2,
        SequencerClass: window.GemOpalCanopySequencer
    });
}