// Centralized Procedural Song Manifest & Asset Pipeline

const SONG_FILES = [
    // Gem Center
    'audio/songs/gemCenterSettlement.js',
    'audio/songs/gemOpalCanopy.js',
    'audio/songs/gemOpalPhysics.js',

    // Nov Area
    'audio/songs/novCitrineSluices.js',
    'audio/songs/novEchoes.js',
    'audio/songs/novMountainAscent.js',
    'audio/songs/novResonantChords.js',
    'audio/songs/novStarlight.js',
    'audio/songs/novVolcanicSluices.js',

    // Pix Area
    'audio/songs/pixBitCascade.js',
    'audio/songs/pixCommunalSteel.js',
    'audio/songs/pixFrozenPlazas.js',
    'audio/songs/pixPixelPulse.js',
    'audio/songs/pixPlaza5Layer.js',
    'audio/songs/pixPlazaLayered.js',
    'audio/songs/pixRadioTower.js',
    'audio/songs/pixRadioTowerLegato.js',
    'audio/songs/pixSubterraneanQuartz.js',

    // Vid Area
    'audio/songs/vidGlitchPhase.js',
    'audio/songs/vidMotionWaterways.js',
    'audio/songs/vidNeonSync.js',

    // Vow Area & Dimensional Songs
    'audio/songs/vowAncientCanopy.js',
    'audio/songs/vowAncientRoots.js',
    'audio/songs/vowCanopyBreeze.js',
    'audio/songs/vowEmeraldGrove.js',
    'audio/songs/vowMoonlitGlade.js',
    'audio/songs/vowSereneWoods.js',
    'audio/songs/moonsynthMelody.js'
];

window.loadAllSongsDynamically = async function() {
    console.log("[SongManifest] Loading procedural song registry...");
    for (const songPath of SONG_FILES) {
        try {
            const resolvedUrl = typeof window.resolveUrl === 'function' ? window.resolveUrl(songPath) : songPath;
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = resolvedUrl;
                script.onload = () => resolve(songPath);
                script.onerror = (err) => reject(err);
                document.head.appendChild(script);
            });
        } catch (err) {
            console.warn(`[SongManifest] Failed to load song '${songPath}':`, err);
        }
    }
    console.log("[SongManifest] All songs loaded and registered successfully.");
};
