// Centralized Dynamic Song & Area Registry
window.SONG_REGISTRY = window.SONG_REGISTRY || {};

window.registerSong = function(songDef) {
    if (!songDef || !songDef.id || !songDef.areaKey) {
        console.error("[SONG REGISTRY] Invalid song definition provided.", songDef);
        return;
    }

    window.SONG_REGISTRY[songDef.id] = songDef;

    // Dynamically register into AudioManager if already available
    if (typeof audioManager !== 'undefined' && audioManager && typeof audioManager.registerDynamicSong === 'function') {
        audioManager.registerDynamicSong(songDef);
    }
};
