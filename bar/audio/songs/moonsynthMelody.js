// Track: Moonsynth (Performed with the Celestial Lyre at Obsidian Hopping Stones)
class MoonsynthSequencer {
    constructor(audioCtx, masterGainNode) {
        this.ctx = audioCtx;
        this.masterGain = masterGainNode;
        this.tempo = 96;
        this.secondsPerBeat = 60.0 / this.tempo;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.15;
        this.nextNoteTime = 0.0;
        this.currentStep = 0;
        this.timerID = null;
        this.isPlaying = false;

        // Celestial Lyre Frequency Palette (Lunar Minor Pentatonic / Nov Resonant Mode)
        this.notes = {
            D3: 146.83, A3: 220.00, C4: 261.63, D4: 293.66,
            F4: 349.23, G4: 392.00, A4: 440.00, C5: 523.25,
            D5: 587.33, F5: 698.46, A5: 880.00, C6: 1046.50
        };

        // 16-step ethereal phase-shift arpeggio sequence
        this.melodyPattern = [
            this.notes.D4, this.notes.A4, this.notes.C5, this.notes.D5,
            this.notes.F5, this.notes.D5, this.notes.A4, this.notes.C5,
            this.notes.G4, this.notes.C5, this.notes.D5, this.notes.F5,
            this.notes.A5, this.notes.F5, this.notes.D5, this.notes.C5
        ];

        this.bassDrone = [
            this.notes.D3, null, null, null,
            this.notes.A3, null, null, null,
            this.notes.C4, null, null, null,
            this.notes.D3, null, null, null
        ];

        this.totalStepsInLoop = 64;
    }

    start() {
        if (this.isPlaying || !this.ctx) return;
        this.isPlaying = true;
        this.currentStep = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.05;
        this.scheduler();
    }

    stop() {
        this.isPlaying = false;
        if (this.timerID) {
            clearTimeout(this.timerID);
            this.timerID = null;
        }
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
        this.nextNoteTime += (this.secondsPerBeat / 4.0);
        this.currentStep = (this.currentStep + 1) % this.totalStepsInLoop;
    }

    scheduleStep(step, time) {
        // Lyre Arpeggio Pluck
        const noteIndex = step % this.melodyPattern.length;
        const melodyFreq = this.melodyPattern[noteIndex];
        if (melodyFreq) {
            this.playPluckedString(melodyFreq, time, 0.45, 0.18);
        }

        // Deep Resonant Bass Drone
        const bassIndex = Math.floor(step / 4) % this.bassDrone.length;
        if (step % 4 === 0 && this.bassDrone[bassIndex]) {
            this.playBassDrone(this.bassDrone[bassIndex], time, 1.2, 0.12);
        }
    }

    /**
     * Synthesizes a plucked acoustic string sound (Lyre harmonic model)
     */
    playPluckedString(freq, time, duration = 0.5, volume = 0.2) {
        if (!this.ctx) return;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        // Fundamental + shimmering octave
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(freq, time);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 2.01, time); // slight detune shimmer

        // Resonant pluck filter envelope
        filter.type = 'lowpass';
        filter.Q.setValueAtTime(4.0, time);
        filter.frequency.setValueAtTime(freq * 5.0, time);
        filter.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 0.8), time + duration);

        // Exponential decay of plucked string
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);

        const targetDestination = this.masterGain || this.ctx.destination;
        gain.connect(targetDestination);

        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + duration);
        osc2.stop(time + duration);
    }

    playBassDrone(freq, time, duration = 1.0, volume = 0.15) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 2.5, time);
        filter.frequency.exponentialRampToValueAtTime(freq * 1.2, time + duration);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc.connect(filter);
        filter.connect(gain);
        const targetDestination = this.masterGain || this.ctx.destination;
        gain.connect(targetDestination);

        osc.start(time);
        osc.stop(time + duration);
    }

    /**
     * One-shot performance of the Moonsynth transition melody.
     * Fires onComplete at the climax of the phase-shift.
     */
    static playPhaseShiftPerformance(audioCtx, onPhaseShift, onComplete) {
        if (!audioCtx) {
            if (onPhaseShift) onPhaseShift();
            if (onComplete) onComplete();
            return;
        }

        const now = audioCtx.currentTime;
        const lyreNotes = [293.66, 369.99, 440.00, 554.37, 587.33, 739.99, 880.00, 1174.66]; // D Major / Lydian ascent
        const stepDuration = 0.14;

        lyreNotes.forEach((freq, idx) => {
            const noteTime = now + (idx * stepDuration);
            const osc = audioCtx.createOscillator();
            const oscHarmonic = audioCtx.createOscillator();
            const filter = audioCtx.createBiquadFilter();
            const gain = audioCtx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, noteTime);

            oscHarmonic.type = 'sine';
            oscHarmonic.frequency.setValueAtTime(freq * 2.01, noteTime);

            filter.type = 'lowpass';
            filter.Q.setValueAtTime(5.0, noteTime);
            filter.frequency.setValueAtTime(freq * 6.0, noteTime);
            filter.frequency.exponentialRampToValueAtTime(freq * 0.7, noteTime + 0.6);

            gain.gain.setValueAtTime(0.0001, noteTime);
            gain.gain.exponentialRampToValueAtTime(0.22, noteTime + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.65);

            osc.connect(filter);
            oscHarmonic.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(noteTime);
            oscHarmonic.start(noteTime);
            osc.stop(noteTime + 0.7);
            oscHarmonic.stop(noteTime + 0.7);
        });

        // Trigger phase shift at peak harmonic (approx 0.8s in)
        setTimeout(() => {
            if (typeof onPhaseShift === 'function') onPhaseShift();
        }, 850);

        // Completion callback after full shimmer dissipates (approx 1.4s)
        setTimeout(() => {
            if (typeof onComplete === 'function') onComplete();
        }, 1400);
    }
}

window.MoonsynthSequencer = MoonsynthSequencer;

if (typeof window.registerSong === 'function') {
    window.registerSong({
        id: 'moonsynth',
        name: 'Moonsynth (Lyre Performance)',
        areaKey: 'vow_forest',
        trackNumber: 4,
        SequencerClass: MoonsynthSequencer
    });
}
