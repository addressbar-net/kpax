// Track 5: Pix Radio Tower (Continuous Legato Stream)
class PixRadioTowerLegatoSequencer {
    constructor(audioCtx, masterGainNode) {
        this.ctx = audioCtx;
        this.masterGain = masterGainNode;
        this.tempo = 84;
        this.secondsPerBeat = 60.0 / this.tempo;
        this.stepTime = this.secondsPerBeat / 4.0;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.nextNoteTime = 0.0;
        this.currentStep = 0;
        this.timerID = null;
        this.isPlaying = false;

        this.notes = {
            Csharp2: 69.30, Fsharp2: 92.50, Gsharp2: 103.83, A2: 110.00,
            Csharp3: 138.59, Dsharp3: 155.56, E3: 164.81, Gsharp3: 207.65, A3: 220.00,
            Csharp4: 277.18, E4: 329.63, Fsharp4: 369.99, Gsharp4: 415.30,
            A4: 440.00, B4: 493.88, Csharp5: 554.37, E5: 659.25,
            Gsharp5: 830.61, A5: 880.00, B5: 987.77, Csharp6: 1108.73, E6: 1318.51
        };

        this.legatoSequence = [
            this.notes.Csharp5, this.notes.E5, this.notes.Gsharp5, this.notes.Csharp6,
            this.notes.B5, this.notes.Gsharp5, this.notes.E5, this.notes.Csharp5,
            this.notes.A4, this.notes.Csharp5, this.notes.E5, this.notes.A5,
            this.notes.Gsharp5, this.notes.E5, this.notes.Csharp5, this.notes.Gsharp4
        ];

        this.carrierPitches = [
            this.notes.E6, this.notes.Csharp6, this.notes.Gsharp5, this.notes.Csharp6
        ];

        this.totalStepsInLoop = 480;

        this.leadOsc = null;
        this.leadGain = null;
        this.bassOsc = null;
        this.bassGain = null;
        this.padOsc1 = null;
        this.padOsc2 = null;
        this.padGain = null;
        this.carrierOsc = null;
        this.carrierGain = null;
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

        this.leadOsc = this.ctx.createOscillator();
        this.leadGain = this.ctx.createGain();
        this.leadOsc.type = 'sine';
        this.leadOsc.frequency.setValueAtTime(this.legatoSequence[0], now);
        this.leadGain.gain.setValueAtTime(0.0001, now);
        this.leadGain.gain.exponentialRampToValueAtTime(0.07, now + 0.1);
        this.leadOsc.connect(this.leadGain);
        this.leadGain.connect(this.masterGain);
        this.leadOsc.start(now);

        this.bassOsc = this.ctx.createOscillator();
        this.bassGain = this.ctx.createGain();
        this.bassOsc.type = 'sine';
        this.bassOsc.frequency.setValueAtTime(this.notes.Csharp2, now);
        this.bassGain.gain.setValueAtTime(0.0001, now);
        this.bassGain.gain.exponentialRampToValueAtTime(0.08, now + 0.2);
        this.bassOsc.connect(this.bassGain);
        this.bassGain.connect(this.masterGain);
        this.bassOsc.start(now);

        this.padOsc1 = this.ctx.createOscillator();
        this.padOsc2 = this.ctx.createOscillator();
        this.padGain = this.ctx.createGain();
        this.padOsc1.type = 'triangle';
        this.padOsc2.type = 'sine';
        this.padOsc1.frequency.setValueAtTime(this.notes.Csharp3, now);
        this.padOsc2.frequency.setValueAtTime(this.notes.Gsharp3, now);
        this.padGain.gain.setValueAtTime(0.0001, now);
        this.padGain.gain.exponentialRampToValueAtTime(0.04, now + 0.3);
        this.padOsc1.connect(this.padGain);
        this.padOsc2.connect(this.padGain);
        this.padGain.connect(this.masterGain);
        this.padOsc1.start(now);
        this.padOsc2.start(now);

        this.carrierOsc = this.ctx.createOscillator();
        this.carrierGain = this.ctx.createGain();
        this.carrierOsc.type = 'triangle';
        this.carrierOsc.frequency.setValueAtTime(this.carrierPitches[0], now);
        this.carrierGain.gain.setValueAtTime(0.0001, now);
        this.carrierGain.gain.exponentialRampToValueAtTime(0.025, now + 0.15);
        this.carrierOsc.connect(this.carrierGain);
        this.carrierGain.connect(this.masterGain);
        this.carrierOsc.start(now);
    }

    teardownContinuousNodes() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const fadeTime = 0.2;

        [this.leadGain, this.bassGain, this.padGain, this.carrierGain].forEach(gainNode => {
            if (gainNode) {
                gainNode.gain.cancelScheduledValues(now);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, now + fadeTime);
            }
        });

        setTimeout(() => {
            [this.leadOsc, this.bassOsc, this.padOsc1, this.padOsc2, this.carrierOsc].forEach(osc => {
                if (osc) { try { osc.stop(); osc.disconnect(); } catch (e) {} }
            });
            this.leadOsc = null; this.bassOsc = null; this.padOsc1 = null; this.padOsc2 = null; this.carrierOsc = null;
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
        const glideTime = 0.025;

        const targetLeadFreq = this.legatoSequence[step % 16] || this.notes.Csharp5;
        if (this.leadOsc && Number.isFinite(targetLeadFreq)) {
            this.leadOsc.frequency.setTargetAtTime(targetLeadFreq, time, glideTime);
        }

        if (step % 4 === 0) {
            const targetCarrierFreq = this.carrierPitches[(step / 4) % 4] || this.notes.E6;
            if (this.carrierOsc && Number.isFinite(targetCarrierFreq)) {
                this.carrierOsc.frequency.setTargetAtTime(targetCarrierFreq, time, glideTime);
            }
        }

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
                targetPad1 = this.notes.Dsharp3;
                targetPad2 = this.notes.Gsharp3;
            }

            if (this.bassOsc && Number.isFinite(targetBass)) this.bassOsc.frequency.setTargetAtTime(targetBass, time, 0.08);
            if (this.padOsc1 && Number.isFinite(targetPad1)) this.padOsc1.frequency.setTargetAtTime(targetPad1, time, 0.08);
            if (this.padOsc2 && Number.isFinite(targetPad2)) this.padOsc2.frequency.setTargetAtTime(targetPad2, time, 0.08);
        }
    }
}