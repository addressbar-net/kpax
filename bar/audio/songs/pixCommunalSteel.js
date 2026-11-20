// Track 6: Pix Communal Steel (Steel-Encased Stone & Warm Hearth Signals)
class PixCommunalSteelSequencer {
    constructor(audioCtx, masterGainNode) {
        this.ctx = audioCtx;
        this.masterGain = masterGainNode;
        this.tempo = 78;
        this.secondsPerBeat = 60.0 / this.tempo;
        this.stepTime = this.secondsPerBeat / 4.0;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.nextNoteTime = 0.0;
        this.currentStep = 0;
        this.timerID = null;
        this.isPlaying = false;

        this.notes = {
            Csharp2: 69.30, Gsharp2: 103.83, Csharp3: 138.59, E3: 164.81,
            Gsharp3: 207.65, A3: 220.00, Csharp4: 277.18, E4: 329.63,
            Fsharp4: 369.99, Gsharp4: 415.30, A4: 440.00, B4: 493.88,
            Csharp5: 554.37, E5: 659.25, Fsharp5: 739.99, Gsharp5: 830.61, A5: 880.00
        };

        // Continuous legato melody (Zero pauses or null steps)
        this.legatoMelody = [
            this.notes.Csharp4, this.notes.E4, this.notes.Gsharp4, this.notes.A4,
            this.notes.Csharp5, this.notes.E5, this.notes.Csharp5, this.notes.A4,
            this.notes.Fsharp4, this.notes.A4, this.notes.Csharp5, this.notes.E5,
            this.notes.Gsharp4, this.notes.E4, this.notes.Csharp4, this.notes.Gsharp3
        ];

        // Scaffolding Glissando Sequence
        this.steelBeamPitches = [
            this.notes.Gsharp5, this.notes.E5, this.notes.Fsharp5, this.notes.Csharp5
        ];

        this.totalStepsInLoop = 480;

        this.leadOsc = null;
        this.leadGain = null;
        this.bassOsc = null;
        this.bassGain = null;
        this.hearthPad1 = null;
        this.hearthPad2 = null;
        this.padGain = null;
        this.steelBeamOsc = null;
        this.steelBeamGain = null;
    }

    start() {
        if (this.isPlaying || !this.ctx) return;
        this.isPlaying = true;
        this.currentStep = 0;
        const now = this.ctx.currentTime + 0.05;
        this.nextNoteTime = now;

        this.initContinuousNodes(now);
        this.scheduler();
    }

    stop() {
        this.isPlaying = false;
        if (this.timerID) { clearTimeout(this.timerID); this.timerID = null; }
        this.teardownContinuousNodes();
    }

    initContinuousNodes(now) {
        if (!this.ctx) return;

        // 1. Continuous Legato Lead Line
        this.leadOsc = this.ctx.createOscillator();
        this.leadGain = this.ctx.createGain();
        this.leadOsc.type = 'sine';
        this.leadOsc.frequency.setValueAtTime(this.legatoMelody[0], now);
        this.leadGain.gain.setValueAtTime(0.0001, now);
        this.leadGain.gain.exponentialRampToValueAtTime(0.065, now + 0.1);
        this.leadOsc.connect(this.leadGain);
        this.leadGain.connect(this.masterGain);
        this.leadOsc.start(now);

        // 2. Unbroken Low Stone Bass
        this.bassOsc = this.ctx.createOscillator();
        this.bassGain = this.ctx.createGain();
        this.bassOsc.type = 'sine';
        this.bassOsc.frequency.setValueAtTime(this.notes.Csharp2, now);
        this.bassGain.gain.setValueAtTime(0.0001, now);
        this.bassGain.gain.exponentialRampToValueAtTime(0.08, now + 0.2);
        this.bassOsc.connect(this.bassGain);
        this.bassGain.connect(this.masterGain);
        this.bassOsc.start(now);

        // 3. Communal Hearth Pad (Dual Register)
        this.hearthPad1 = this.ctx.createOscillator();
        this.hearthPad2 = this.ctx.createOscillator();
        this.padGain = this.ctx.createGain();
        this.hearthPad1.type = 'triangle';
        this.hearthPad2.type = 'sine';
        this.hearthPad1.frequency.setValueAtTime(this.notes.Csharp3, now);
        this.hearthPad2.frequency.setValueAtTime(this.notes.Gsharp3, now);
        this.padGain.gain.setValueAtTime(0.0001, now);
        this.padGain.gain.exponentialRampToValueAtTime(0.045, now + 0.3);
        this.hearthPad1.connect(this.padGain);
        this.hearthPad2.connect(this.padGain);
        this.padGain.connect(this.masterGain);
        this.hearthPad1.start(now);
        this.hearthPad2.start(now);

        // 4. Steel Beam Frequency Signal
        this.steelBeamOsc = this.ctx.createOscillator();
        this.steelBeamGain = this.ctx.createGain();
        this.steelBeamOsc.type = 'triangle';
        this.steelBeamOsc.frequency.setValueAtTime(this.steelBeamPitches[0], now);
        this.steelBeamGain.gain.setValueAtTime(0.0001, now);
        this.steelBeamGain.gain.exponentialRampToValueAtTime(0.02, now + 0.15);
        this.steelBeamOsc.connect(this.steelBeamGain);
        this.steelBeamGain.connect(this.masterGain);
        this.steelBeamOsc.start(now);
    }

    teardownContinuousNodes() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const fadeTime = 0.2;

        [this.leadGain, this.bassGain, this.padGain, this.steelBeamGain].forEach(gainNode => {
            if (gainNode) {
                gainNode.gain.cancelScheduledValues(now);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, now + fadeTime);
            }
        });

        setTimeout(() => {
            [this.leadOsc, this.bassOsc, this.hearthPad1, this.hearthPad2, this.steelBeamOsc].forEach(osc => {
                if (osc) { try { osc.stop(); osc.disconnect(); } catch (e) {} }
            });
            this.leadOsc = null; this.bassOsc = null; this.hearthPad1 = null; this.hearthPad2 = null; this.steelBeamOsc = null;
        }, (fadeTime + 0.05) * 1000);
    }

    scheduler() {
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this.scheduleStep(this.currentStep, this.nextNoteTime);
            this.advanceStep();
        }
        if (this.isPlaying) {
            this.timerID = setTimeout(() => this.scheduler(), this.lookahead);
        }
    }

    advanceStep() {
        this.nextNoteTime += this.stepTime;
        this.currentStep = (this.currentStep + 1) % this.totalStepsInLoop;
    }

    scheduleStep(step, time) {
        const glideTime = 0.03;

        // 1. Legato Melody Glide
        const targetLeadFreq = this.legatoMelody[step % 16] || this.notes.Csharp4;
        if (this.leadOsc && Number.isFinite(targetLeadFreq)) {
            this.leadOsc.frequency.setTargetAtTime(targetLeadFreq, time, glideTime);
        }

        // 2. Steel Beam Frequency Modulation
        if (step % 4 === 0) {
            const targetSteelFreq = this.steelBeamPitches[(step / 4) % 4] || this.notes.Gsharp5;
            if (this.steelBeamOsc && Number.isFinite(targetSteelFreq)) {
                this.steelBeamOsc.frequency.setTargetAtTime(targetSteelFreq, time, glideTime);
            }
        }

        // 3. Foundation Chord Transitions (Shifts every 32 steps)
        if (step % 32 === 0) {
            const blockIndex = Math.floor(step / 32) % 4;
            let targetBass = this.notes.Csharp2;
            let targetPad1 = this.notes.Csharp3;
            let targetPad2 = this.notes.Gsharp3;

            if (blockIndex === 1) {
                targetBass = this.notes.A2;
                targetPad1 = this.notes.A3;
                targetPad2 = this.notes.E4;
            } else if (blockIndex === 2) {
                targetBass = this.notes.Fsharp2;
                targetPad1 = this.notes.Csharp3;
                targetPad2 = this.notes.Fsharp4;
            } else if (blockIndex === 3) {
                targetBass = this.notes.Gsharp2;
                targetPad1 = this.notes.E3;
                targetPad2 = this.notes.Gsharp3;
            }

            if (this.bassOsc && Number.isFinite(targetBass)) this.bassOsc.frequency.setTargetAtTime(targetBass, time, 0.08);
            if (this.hearthPad1 && Number.isFinite(targetPad1)) this.hearthPad1.frequency.setTargetAtTime(targetPad1, time, 0.08);
            if (this.hearthPad2 && Number.isFinite(targetPad2)) this.hearthPad2.frequency.setTargetAtTime(targetPad2, time, 0.08);
        }
    }
}