// Global Overlay UI State Flags
window.isItemMenuOpen = true;
window.isDebugMenuOpen = false;
window.isEquipmentMenuOpen = false;
window.isMedallionsMenuOpen = false;
window.isEquippablesMenuOpen = false;
window.isConsumablesMenuOpen = false;
window.isAccessoriesMenuOpen = false;
window.isRoomsMenuOpen = false;
window.isCellPhoneOpen = false;
window.isRadioMenuOpen = false;
window.isMapMenuOpen = false;

window.updateMenuOverlays = function() {
    const itemOverlay = document.getElementById('item-menu-overlay');
    const debugOverlay = document.getElementById('debug-menu-overlay');
    const equipOverlay = document.getElementById('equipment-menu-overlay');
    const medalOverlay = document.getElementById('medallions-menu-overlay');
    const equipItemsOverlay = document.getElementById('equippable-menu-overlay');
    const consumableOverlay = document.getElementById('consumable-menu-overlay');
    const accessoriesOverlay = document.getElementById('accessories-menu-overlay');
    const roomsOverlay = document.getElementById('rooms-menu-overlay');
    const phoneOverlay = document.getElementById('cell-phone-menu-overlay');
    const radioOverlay = document.getElementById('radio-menu-overlay');
    const mapOverlay = document.getElementById('map-menu-overlay');

    if (!itemOverlay || !debugOverlay) return;

    const isDebugOpen = window.GameState ? window.GameState.isDebugMenuOpen : window.isDebugMenuOpen;
    const isItemOpen = window.GameState ? window.GameState.isItemMenuOpen : window.isItemMenuOpen;
    const isEquipOpen = window.GameState ? window.GameState.isEquipmentMenuOpen : window.isEquipmentMenuOpen;
    const isMedalOpen = window.GameState ? window.GameState.isMedallionsMenuOpen : window.isMedallionsMenuOpen;
    const isEquipItemsOpen = window.GameState ? window.GameState.isEquippablesMenuOpen : window.isEquippablesMenuOpen;
    const isConsumableOpen = window.GameState ? window.GameState.isConsumablesMenuOpen : window.isConsumablesMenuOpen;
    const isAccessoriesOpen = window.GameState ? window.GameState.isAccessoriesMenuOpen : window.isAccessoriesMenuOpen;
    const isRoomsOpen = window.GameState ? window.GameState.isRoomsMenuOpen : window.isRoomsMenuOpen;
    const isMapOpen = window.GameState ? window.GameState.isMapMenuOpen : window.isMapMenuOpen;
    const isPhoneOpen = !!window.isCellPhoneOpen;
    const isRadioOpen = !!window.isRadioMenuOpen;

    if (debugOverlay) debugOverlay.classList.toggle('hidden', !isDebugOpen);
    if (medalOverlay) {
        medalOverlay.classList.toggle('hidden', !isMedalOpen);
        if (isMedalOpen && typeof debugMenu !== 'undefined' && debugMenu) debugMenu.renderMedallionsMenu();
    }
    if (equipOverlay) {
        equipOverlay.classList.toggle('hidden', !isEquipOpen);
        if (isEquipOpen && typeof debugMenu !== 'undefined' && debugMenu) debugMenu.renderEquipmentMenu();
    }
    if (equipItemsOverlay) {
        equipItemsOverlay.classList.toggle('hidden', !isEquipItemsOpen);
        if (isEquipItemsOpen && typeof debugMenu !== 'undefined' && debugMenu) debugMenu.renderEquippablesMenu();
    }
    if (consumableOverlay) {
        consumableOverlay.classList.toggle('hidden', !isConsumableOpen);
        if (isConsumableOpen && typeof debugMenu !== 'undefined' && debugMenu) debugMenu.renderConsumablesMenu();
    }
    if (accessoriesOverlay) {
        accessoriesOverlay.classList.toggle('hidden', !isAccessoriesOpen);
        if (isAccessoriesOpen && typeof debugMenu !== 'undefined' && debugMenu) debugMenu.renderAccessoriesMenu();
    }
    if (phoneOverlay) {
        phoneOverlay.classList.toggle('hidden', !isPhoneOpen);
        if (isPhoneOpen && window.ChatUI) {
            window.ChatUI.isPhoneOpen = true;
            if (window.ChatUI.dom && window.ChatUI.dom.input) {
                setTimeout(() => window.ChatUI.dom.input.focus(), 50);
            }
        }
    }
    if (radioOverlay) {
        radioOverlay.classList.toggle('hidden', !isRadioOpen);
        if (isRadioOpen && typeof debugMenu !== 'undefined' && debugMenu) debugMenu.updateRadioOptionUI();
    }
    if (roomsOverlay) {
        roomsOverlay.classList.toggle('hidden', !isRoomsOpen);
        if (isRoomsOpen && typeof debugMenu !== 'undefined' && debugMenu) debugMenu.renderRoomsMenu();
    }
    if (mapOverlay) {
        mapOverlay.classList.toggle('hidden', !isMapOpen);
        if (isMapOpen && typeof debugMenu !== 'undefined' && debugMenu) debugMenu.renderMapMenu();
    }
    if (itemOverlay) {
        itemOverlay.classList.toggle('hidden', !isItemOpen);
        if (isItemOpen && typeof debugMenu !== 'undefined' && debugMenu) debugMenu.renderItemGrid();
    }

    if (typeof debugMenu !== 'undefined' && debugMenu && typeof debugMenu.renderMenuPixelHeaders === 'function') {
        debugMenu.renderMenuPixelHeaders();
    }
};

window.switchDebugTab = function(idx) {
    const totalDebugTabs = 4;
    window.activeDebugTab = (idx + totalDebugTabs) % totalDebugTabs;
    for (let i = 0; i < totalDebugTabs; i++) {
        const btn = document.getElementById(`tab-${i}-btn`);
        const pane = document.getElementById(`tab-${i}-pane`);
        if (btn) btn.classList.toggle('active', i === window.activeDebugTab);
        if (pane) pane.classList.toggle('active', i === window.activeDebugTab);
    }
    if (typeof debugMenu !== 'undefined' && debugMenu) {
        debugMenu.resetOptionState();
        debugMenu.updateTabOptionUI(window.activeDebugTab);
    }
};

window.toggleHidePlayerName = function(forceState = null) {
    if (window.ChatUI && typeof window.ChatUI.toggleHidePlayerName === 'function') {
        return window.ChatUI.toggleHidePlayerName(forceState);
    }
    let current = (localStorage.getItem('dw_hide_player_name') === 'true');
    let nextState = (forceState !== null) ? !!forceState : !current;
    try {
        localStorage.setItem('dw_hide_player_name', nextState ? 'true' : 'false');
    } catch (e) {}
    return nextState;
};

class DebugMenu {
    constructor() {
        this.stepCounter = 1;
        this.logContainer = null;
        this.varContainer = null;
        this.gridContainer = null;
        this.descModal = null;
        this.isDescModalOpen = false;

        this.gridItems = [];

        this.selectedGridIndex = 0;
        this.selectedOptionIndex = 0;
        this.isOptionEditing = false;

        this.selectedRadioOptionIndex = 0;
        this.isRadioOptionEditing = false;
        this.radioOpenedFrom = 'equippables';
        this.cellPhoneOpenedFrom = 'equippables';
        this.assignmentPhase = false;

        this.equipmentCategoryIndex = 0; // 0: Cap, 1: Shirt, 2: Pants
        this.selectedMedallionIndex = 0;  // 0 to 5 (Slots 1 to 6, starting at bottom)
        this.selectedEquippableIndex = 0;
        this.selectedConsumableIndex = 0;
        this.selectedAccessoryIndex = 0;

        this.assignedHotbar = {
            slot1: null, slot2: null, slot3: null
        };

        this.cardinalOrder = ['nov_area', 'vow_forest', 'vid_area', 'pix_area', 'gem_center'];

        this.bindEventBusListeners();
    }

    bindEventBusListeners() {
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.on('log:entry', (data) => this.log(data.tag, data.message));
            
            // Only rebuild Game Variables DOM when the Settings > Game Variables tab is actively open
            window.EventBus.on('engine:camera', ({ currentTime }) => {
                const gs = window.GameState;
                if (!gs || !gs.isDebugMenuOpen || window.activeDebugTab !== 3 || !gs.characterEntity) return;
                if (this._lastVarUpdateTime && (currentTime - this._lastVarUpdateTime < 100)) return;
                this._lastVarUpdateTime = currentTime || performance.now();

                const char = gs.characterEntity;
                const camPos = gs.cameraPos || [0, 0, 0];
                const inputData = gs.lastInputData || {};

                this.updateVariables({
                    "Active Room": gs.currentRoom || 'world',
                    "Active Area": gs.currentArea || 'vow_forest',
                    "Badge Defense": `${Math.round((gs.getDamageReduction ? gs.getDamageReduction('EVENT') : 0) * 100)}%`,
                    "Dimension": '3D LIGHT WORLD',
                    "Player XYZ": `(${char.position[0].toFixed(2)}, ${char.position[1].toFixed(2)}, ${char.position[2].toFixed(2)})`,
                    "Rotation Y": `${(char.rotationY * 180 / Math.PI).toFixed(1)}° (${char.rotationY.toFixed(2)} rad)`,
                    "Current State": gs.playerState || 'GROUNDED',
                    "Speed Mode": inputData.isRunToggled ? `RUNNING` : `WALKING`,
                    "Tilt Tier": (inputData.tiltTier || 'NONE').toUpperCase(),
                    "Walk Straight": gs.hasEquippedAccessory('walk_straight') ? 'EQUIPPED' : 'OFF',
                    "Held Object": gs.heldEntity ? gs.heldEntity.name : 'NONE',
                    "Nearby Interactable": gs.nearbyInteractable ? gs.nearbyInteractable.name : 'NONE',
                    "Pending Ledge Action": gs.pendingLedgeAction ? gs.pendingLedgeAction.type : 'NONE',
                    "Camera XYZ": `(${camPos[0].toFixed(2)}, ${camPos[1].toFixed(2)}, ${camPos[2].toFixed(2)})`,
                    "First Person View": gs.isFirstPerson ? `ACTIVE` : 'OFF'
                });
            });

            window.EventBus.on('consumables:updated', () => this.updateHUDOverlay());
        }
    }

    init() {
        if (typeof ITEM_REGISTRY !== 'undefined') {
            // Main Menu cards: Settings, Tools, Supplies, Accessories, Clothes, Medallions, Rooms
            this.gridItems = [
                ITEM_REGISTRY.settings,
                ITEM_REGISTRY.tools,
                ITEM_REGISTRY.supplies,
                ITEM_REGISTRY.accessories,
                ITEM_REGISTRY.clothes,
                ITEM_REGISTRY.medallions,
                ITEM_REGISTRY.rooms
            ].filter(Boolean);

            this.equippableGridItems = (typeof EQUIPPABLE_ITEMS_REGISTRY !== 'undefined' ? EQUIPPABLE_ITEMS_REGISTRY : [
                ITEM_REGISTRY.map,
                ITEM_REGISTRY.telescope,
                ITEM_REGISTRY.bat,
                ITEM_REGISTRY.lyre,
                ITEM_REGISTRY.cell_phone,
                ITEM_REGISTRY.text_message,
                ITEM_REGISTRY.radio
            ]).filter(Boolean);

            this.accessoryGridItems = (typeof ACCESSORIES_REGISTRY !== 'undefined' ? ACCESSORIES_REGISTRY : [
                ITEM_REGISTRY.walk_straight
            ]).filter(Boolean);

            this.assignedHotbar = {
                slot1: ITEM_REGISTRY.lyre, slot2: ITEM_REGISTRY.telescope, slot3: ITEM_REGISTRY.bat
            };

            if (window.GameState) {
                window.GameState.setHotbarSlot('slot1', this.assignedHotbar.slot1);
                window.GameState.setHotbarSlot('slot2', this.assignedHotbar.slot2);
                window.GameState.setHotbarSlot('slot3', this.assignedHotbar.slot3);
                window.GameState.initEquipment();
                window.GameState.initConsumables();
            }
        }

        this.logContainer = document.getElementById('execution-log');
        this.varContainer = document.getElementById('game-variables-list');
        this.gridContainer = document.getElementById('item-grid-container');

        const fsRow = document.getElementById('item-fullscreen');
        if (fsRow) {
            fsRow.addEventListener('click', () => this.toggleFullscreen());
        }

        this.createDescriptionModal();
        this.renderItemGrid();
        this.renderMenuPixelHeaders();
        this.updateHUDOverlay();
        if (typeof audioManager !== 'undefined') this.updateTabOptionUI(1);
    }

    toggleFullscreen() {
        const statusEl = document.getElementById('fullscreen-status');
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => {
                if (statusEl) statusEl.textContent = 'ON';
                this.log('INFO', 'Fullscreen mode ENABLED.');
                if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'assign');
            }).catch(err => {
                console.warn("Fullscreen request failed:", err);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().then(() => {
                    if (statusEl) statusEl.textContent = 'OFF';
                    this.log('INFO', 'Fullscreen mode DISABLED.');
                    if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
                });
            }
        }
    }

    createDescriptionModal() {
        if (document.getElementById('item-desc-modal')) return;

        const modalHtml = `
            <div id="item-desc-modal" style="
                position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: #ffffff; border: 2px solid #000000; border-radius: 0; padding: 20px;
                width: 340px; box-shadow: none; display: none;
                flex-direction: column; align-items: center; gap: 12px; z-index: 2000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #000000;
            ">
                <div id="desc-modal-icon" style="font-size: 48px; color: #000000;"></div>
                <div id="desc-modal-title" style="font-weight: bold; color: #000000; font-size: 18px; text-transform: uppercase;"></div>
                <div id="desc-modal-text" style="font-size: 13px; color: #000000; text-align: center; line-height: 1.5; margin: 4px 0;"></div>
                <div style="font-size: 11px; color: #000000; font-weight: bold; margin-top: 8px;"><b>K / CROSS:</b> Close Description</div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.descModal = document.getElementById('item-desc-modal');
    }

    openDescriptionModal() {
        const item = this.gridItems[this.selectedGridIndex];
        if (!item || item.isSystem || !this.descModal) return;

        this.isDescModalOpen = true;
        document.getElementById('desc-modal-icon').textContent = item.icon;
        document.getElementById('desc-modal-title').textContent = item.name;
        document.getElementById('desc-modal-text').textContent = item.desc;
        this.descModal.style.display = 'flex';
        this.log('INFO', `Opened description for '${item.name}'`);

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'desc');
        } else if (typeof audioManager !== 'undefined') {
            audioManager.playSFX('desc');
        }
    }

    closeDescriptionModal() {
        this.isDescModalOpen = false;
        if (this.descModal) this.descModal.style.display = 'none';

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
        } else if (typeof audioManager !== 'undefined') {
            audioManager.playSFX('nav');
        }
    }

    log(tag, message) {
        if (!this.logContainer) this.logContainer = document.getElementById('execution-log');
        if (!this.logContainer) return;

        const entry = document.createElement('div');
        entry.className = 'log-entry';

        let tagClass = 'log-tag-info';
        if (tag === 'OK') tagClass = 'log-tag-ok';
        if (tag === 'WARN') tagClass = 'log-tag-warn';

        entry.innerHTML = `<span class="log-step">[${String(this.stepCounter++).padStart(3, '0')}]</span><span class="${tagClass}">[${tag}]</span><span>${message}</span>`;
        this.logContainer.appendChild(entry);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    updateVariables(vars) {
        if (!this.varContainer) this.varContainer = document.getElementById('game-variables-list');
        if (!this.varContainer) return;

        let html = '';
        for (const [key, value] of Object.entries(vars)) {
            html += `<div class="var-row" style="display: flex; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid #e8e8e8; font-family: monospace; font-size: 12px; color: #000000;"><span class="var-key" style="color: #000000; font-weight: bold;">${key}:</span><span class="var-val" style="color: #000000;">${value}</span></div>`;
        }
        this.varContainer.innerHTML = html;
    }

    resetOptionState() {
        this.selectedOptionIndex = 0;
        this.isOptionEditing = false;
    }

    toggleOptionSelection(activeTabIdx) {
        if (activeTabIdx === 1) {
            if (this.selectedOptionIndex === 0) {
                this.toggleFullscreen();
                return;
            }
        }
        this.isOptionEditing = !this.isOptionEditing;
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'assign');
        } else if (typeof audioManager !== 'undefined') {
            audioManager.playSFX('assign');
        }
        this.updateTabOptionUI(activeTabIdx);
    }

    adjustOptionValue(delta) {
        const am = window.audioManager || (typeof audioManager !== 'undefined' ? audioManager : null);

        if (!am) return;

        if (window.activeDebugTab === 1 && this.selectedOptionIndex === 1) {
            let current = Math.round(am.sfxVolume * 10) / 10;
            const newVol = Math.max(0.0, Math.min(1.0, Math.round((current + delta) * 10) / 10));
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('audio:setSFXVolume', newVol);
                window.EventBus.emit('sfx:play', 'assign');
            } else {
                am.setSFXVolume(newVol);
                am.playSFX('assign');
            }
            this.updateTabOptionUI(1);
        }
    }

    navigateOptions(dirY, maxOptions, activeTabIdx) {
        if (this.isOptionEditing) return;
        if (dirY !== 0 && maxOptions > 0) {
            this.selectedOptionIndex = (this.selectedOptionIndex + dirY + maxOptions) % maxOptions;
            this.updateTabOptionUI(activeTabIdx);
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('sfx:play', 'nav');
            } else if (typeof audioManager !== 'undefined') {
                audioManager.playSFX('nav');
            }
        }
    }

    updateTabOptionUI(activeTabIdx) {
        const pane = document.getElementById(`tab-${activeTabIdx}-pane`);
        if (!pane) return;

        const am = window.audioManager || (typeof audioManager !== 'undefined' ? audioManager : null);

        if (activeTabIdx === 1) {
            const fsStatus = document.getElementById('fullscreen-status');
            if (fsStatus) {
                fsStatus.textContent = document.fullscreenElement ? 'ON' : 'OFF';
            }
            if (am) {
                const sfxValEl = document.getElementById('sfx-vol-val');
                if (sfxValEl) {
                    sfxValEl.textContent = `${Math.round(am.sfxVolume * 100)}%`;
                }
            }
        }

        const menuItems = pane.querySelectorAll('.menu-item');
        menuItems.forEach((item, idx) => {
            const isSelected = idx === this.selectedOptionIndex;

            item.classList.toggle('selected', isSelected);
            item.classList.toggle('editing', isSelected && this.isOptionEditing);

            if (isSelected) {
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    /* -------------------------------------------------------------
       RADIO MENU (Extracted BGM Tuning & Regional Music)
       ------------------------------------------------------------- */
    openRadioMenu() {
        if (window.isEquippablesMenuOpen) {
            this.radioOpenedFrom = 'equippables';
        } else if (window.isItemMenuOpen) {
            this.radioOpenedFrom = 'main';
        } else {
            this.radioOpenedFrom = 'gameplay';
        }

        const gs = window.GameState;
        if (gs) {
            gs.isItemMenuOpen = false;
            gs.isDebugMenuOpen = false;
            gs.isEquipmentMenuOpen = false;
            gs.isMedallionsMenuOpen = false;
            gs.isEquippablesMenuOpen = false;
            gs.isConsumablesMenuOpen = false;
        }
        window.isItemMenuOpen = false;
        window.isDebugMenuOpen = false;
        window.isEquipmentMenuOpen = false;
        window.isMedallionsMenuOpen = false;
        window.isEquippablesMenuOpen = false;
        window.isConsumablesMenuOpen = false;
        window.isCellPhoneOpen = false;
        window.isRadioMenuOpen = true;

        this.selectedRadioOptionIndex = 0;
        this.isRadioOptionEditing = false;

        if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
        this.updateRadioOptionUI();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
            window.EventBus.emit('log:entry', { tag: 'RADIO', message: 'Opened Radio music tuning menu.' });
        }
    }

    closeRadioMenu() {
        window.isRadioMenuOpen = false;
        const gs = window.GameState;
        if (this.radioOpenedFrom === 'equippables') {
            this.openEquippablesMenu();
        } else if (this.radioOpenedFrom === 'main') {
            if (gs) gs.isItemMenuOpen = true;
            window.isItemMenuOpen = true;
            if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
            this.renderItemGrid();
        } else {
            if (gs) {
                gs.isItemMenuOpen = false;
                gs.isDebugMenuOpen = false;
                gs.isEquipmentMenuOpen = false;
                gs.isMedallionsMenuOpen = false;
                gs.isEquippablesMenuOpen = false;
                gs.isConsumablesMenuOpen = false;
            }
            window.isItemMenuOpen = false;
            window.isDebugMenuOpen = false;
            window.isEquipmentMenuOpen = false;
            window.isMedallionsMenuOpen = false;
            window.isEquippablesMenuOpen = false;
            window.isConsumablesMenuOpen = false;
            window.isCellPhoneOpen = false;
            window.isRadioMenuOpen = false;
            if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
            const canvas = document.getElementById('glCanvas');
            if (canvas) canvas.focus();
        }

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
        }
    }

    navigateRadioOptions(dirY, maxOptions = 7) {
        if (this.isRadioOptionEditing) return;
        if (dirY !== 0 && maxOptions > 0) {
            this.selectedRadioOptionIndex = (this.selectedRadioOptionIndex + dirY + maxOptions) % maxOptions;
            this.updateRadioOptionUI();
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('sfx:play', 'nav');
            } else if (typeof audioManager !== 'undefined') {
                audioManager.playSFX('nav');
            }
        }
    }

    toggleRadioOptionSelection() {
        this.isRadioOptionEditing = !this.isRadioOptionEditing;
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'assign');
        } else if (typeof audioManager !== 'undefined') {
            audioManager.playSFX('assign');
        }
        this.updateRadioOptionUI();
    }

    adjustRadioOptionValue(delta) {
        const am = window.audioManager || (typeof audioManager !== 'undefined' ? audioManager : null);
        if (!am) return;

        if (this.selectedRadioOptionIndex === 0) {
            let current = Math.round(am.musicVolume * 10) / 10;
            const newVol = Math.max(0.0, Math.min(1.0, Math.round((current + delta) * 10) / 10));
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('audio:setMusicVolume', newVol);
                window.EventBus.emit('sfx:play', 'nav');
            } else {
                am.setMusicVolume(newVol);
                am.playSFX('nav');
            }

        } else if (this.selectedRadioOptionIndex === 1) {
            let currentIdx = this.cardinalOrder.indexOf(am.currentAreaKey || 'nov_area');
            let step = delta > 0 ? 1 : -1;
            let nextArea = this.cardinalOrder[(currentIdx + step + 5) % 5];
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('bgm:changeArea', nextArea);
                window.EventBus.emit('sfx:play', 'assign');
            } else {
                am.startAreaBGM(nextArea);
                am.playSFX('assign');
            }
            if (window.svgAudioMenu) window.svgAudioMenu.updateSelection(this.cardinalOrder.indexOf(nextArea));

        } else if (this.selectedRadioOptionIndex >= 2 && this.selectedRadioOptionIndex <= 6) {
            const areaKeys = ['nov_area', 'vow_forest', 'vid_area', 'pix_area', 'gem_center'];
            const trackNamesKeys = ['novTrackNames', 'vowTrackNames', 'vidTrackNames', 'pixTrackNames', 'gemTrackNames'];
            const idx = this.selectedRadioOptionIndex - 2;
            const areaKey = areaKeys[idx];

            let currentTrack = (am.areaTrackSelection && am.areaTrackSelection[areaKey]) || 1;
            let maxTracks = Math.max(1, Object.keys(am[trackNamesKeys[idx]] || {}).length);
            let step = delta > 0 ? 1 : -1;
            let nextTrack = ((currentTrack - 1 + step + maxTracks) % maxTracks) + 1;

            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('audio:setTrack', { areaKey, trackId: nextTrack });
                window.EventBus.emit('sfx:play', 'assign');
            } else {
                if (areaKey === 'vow_forest') am.setVowTrack(nextTrack);
                else if (areaKey === 'nov_area') am.setNovTrack(nextTrack);
                else if (areaKey === 'pix_area') am.setPixTrack(nextTrack);
                else if (areaKey === 'vid_area') am.setVidTrack(nextTrack);
                else if (areaKey === 'gem_center') am.setGemTrack(nextTrack);
                am.playSFX('assign');
            }
        }

        this.updateRadioOptionUI();
    }

    updateRadioOptionUI() {
        const overlay = document.getElementById('radio-menu-overlay');
        if (!overlay) return;

        const am = window.audioManager || (typeof audioManager !== 'undefined' ? audioManager : null);
        if (am) {
            const bgmValEl = document.getElementById('radio-bgm-vol-val');
            if (bgmValEl) bgmValEl.textContent = `${Math.round(am.musicVolume * 100)}%`;

            const novCurrent = (am.areaTrackSelection && am.areaTrackSelection.nov_area) || 1;
            const vowCurrent = (am.areaTrackSelection && am.areaTrackSelection.vow_forest) || 1;
            const vidCurrent = (am.areaTrackSelection && am.areaTrackSelection.vid_area) || 1;
            const pixCurrent = (am.areaTrackSelection && am.areaTrackSelection.pix_area) || 1;
            const gemCurrent = (am.areaTrackSelection && am.areaTrackSelection.gem_center) || 1;

            const novEl = document.getElementById('radio-nov-track-val');
            if (novEl) novEl.textContent = (am.novTrackNames && am.novTrackNames[novCurrent]) || `Track ${novCurrent}`;
            const vowEl = document.getElementById('radio-vow-track-val');
            if (vowEl) vowEl.textContent = (am.vowTrackNames && am.vowTrackNames[vowCurrent]) || `Track ${vowCurrent}`;
            const vidEl = document.getElementById('radio-vid-track-val');
            if (vidEl) vidEl.textContent = (am.vidTrackNames && am.vidTrackNames[vidCurrent]) || `Track ${vidCurrent}`;
            const pixEl = document.getElementById('radio-pix-track-val');
            if (pixEl) pixEl.textContent = (am.pixTrackNames && am.pixTrackNames[pixCurrent]) || `Track ${pixCurrent}`;
            const gemEl = document.getElementById('radio-gem-track-val');
            if (gemEl) gemEl.textContent = (am.gemTrackNames && am.gemTrackNames[gemCurrent]) || `Track ${gemCurrent}`;

            const gemContainer = document.getElementById('radio-svg-gem-row');
            if (gemContainer && window.svgAudioMenu) {
                window.svgAudioMenu.renderInsideContainer(gemContainer);
                const currentIdx = this.cardinalOrder.indexOf(am.currentAreaKey || 'nov_area');
                window.svgAudioMenu.updateSelection(currentIdx >= 0 ? currentIdx : 0);
            }
        }

        const activeArea = am ? (am.currentAreaKey || 'nov_area') : 'nov_area';
        const areaRowMap = {
            'nov_area': 2,
            'vow_forest': 3,
            'vid_area': 4,
            'pix_area': 5,
            'gem_center': 6
        };
        const activeRowIndex = areaRowMap[activeArea];

        const menuItems = overlay.querySelectorAll('.menu-item');
        menuItems.forEach((item, idx) => {
            const isSelected = idx === this.selectedRadioOptionIndex;
            const isActiveAreaRow = idx === activeRowIndex;

            item.classList.toggle('selected', isSelected);
            item.classList.toggle('editing', isSelected && this.isRadioOptionEditing);
            item.classList.toggle('active-area-row', isActiveAreaRow);

            if (isSelected) {
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    navigateGrid(dirX, dirY) {
        if (this.isDescModalOpen) return;

        const total = this.gridItems.length;
        if (total === 0) return;

        // In vertical list mode, navigate sequentially
        const step = dirY !== 0 ? dirY : dirX;
        if (step !== 0) {
            this.selectedGridIndex = (this.selectedGridIndex + step + total) % total;
            this.renderItemGrid();
            this.scrollToSelectedCard();
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('sfx:play', 'nav');
            } else if (typeof audioManager !== 'undefined') {
                audioManager.playSFX('nav');
            }
        }
    }

    scrollToSelectedCard() {
        if (!this.gridContainer) return;
        const selectedCard = this.gridContainer.children[this.selectedGridIndex];
        if (selectedCard) {
            selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    }

    getSelectedGridItem() { return this.gridItems[this.selectedGridIndex]; }

    assignSelectedItem(targetSlot) {
        if (this.isDescModalOpen) return;
        const item = this.gridItems[this.selectedGridIndex];
        if (!item || item.isSystem) return;

        if (this.assignedHotbar[targetSlot] && this.assignedHotbar[targetSlot].id === item.id) {
            this.assignedHotbar[targetSlot] = null;
            this.log('INFO', `Unequipped '${item.name}' from ${targetSlot.toUpperCase()}`);
            if (window.GameState) window.GameState.setHotbarSlot(targetSlot, null);
        } else {
            ['slot1', 'slot2', 'slot3'].forEach(s => {
                if (s !== targetSlot && this.assignedHotbar[s] && this.assignedHotbar[s].id === item.id) {
                    this.assignedHotbar[s] = null;
                    if (window.GameState) window.GameState.setHotbarSlot(s, null);
                }
            });
            this.assignedHotbar[targetSlot] = item;
            this.log('OK', `Assigned '${item.name}' to ${targetSlot.toUpperCase()}`);
            if (window.GameState) window.GameState.setHotbarSlot(targetSlot, item);
        }

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'assign');
        } else if (typeof audioManager !== 'undefined') {
            audioManager.playSFX('assign');
        }

        this.renderItemGrid();
        this.updateHUDOverlay();
    }

    renderItemGrid() {
        if (!this.gridContainer) this.gridContainer = document.getElementById('item-grid-container');
        if (!this.gridContainer) return;

        const pf = window.PixelFont;

        let html = '';
        this.gridItems.forEach((item, idx) => {
            const isSelected = idx === this.selectedGridIndex;
            const cursorGlyph = isSelected ? '▶' : ' ';
            const cursorHtml = pf ? pf.render(cursorGlyph) : (isSelected ? '▶' : '&nbsp;');
            const labelHtml = pf ? pf.render(item.name.toUpperCase()) : item.name.toUpperCase();

            html += `
                <div class="gba-menu-row ${isSelected ? 'selected' : ''}" onclick="debugMenu.selectAndActivateCard(${idx})">
                    <span class="gba-cursor">${cursorHtml}</span>
                    <span class="gba-item-label">${labelHtml}</span>
                </div>
            `;
        });
        this.gridContainer.innerHTML = html;

        const descEl = document.getElementById('main-menu-gba-desc');
        if (descEl && this.gridItems[this.selectedGridIndex]) {
            const cur = this.gridItems[this.selectedGridIndex];
            if (cur.id === 'settings' && (!cur.desc || cur.desc.includes('Configure BGM'))) {
                cur.desc = "Press Tab to close the Main Menu.";
            }
            const nameHtml = pf ? pf.render(cur.name.toUpperCase() + ':') : `${cur.name.toUpperCase()}:`;
            const descHtml = pf ? pf.render(cur.desc.toUpperCase()) : cur.desc;
            descEl.innerHTML = `<span class="gba-desc-name">${nameHtml}</span> ${descHtml}`;
            descEl.dataset.rawDesc = cur.desc;
            descEl.dataset.rawName = cur.name;
        }
    }

    selectAndActivateCard(idx) {
        this.selectedGridIndex = idx;
        this.renderItemGrid();
        const item = this.gridItems[idx];
        if (!item) return;

        if (item.opensMedallionsMenu || item.id === 'medallions') {
            this.openMedallionsMenu();
        } else if (item.opensEquipmentMenu || item.id === 'clothes' || item.id === 'equipment') {
            this.openEquipmentMenu();
        } else if (item.opensEquippablesMenu || item.id === 'tools' || item.id === 'equippables') {
            this.openEquippablesMenu();
        } else if (item.opensConsumablesMenu || item.id === 'supplies' || item.id === 'consumables') {
            this.openConsumablesMenu();
        } else if (item.opensAccessoriesMenu || item.id === 'accessories') {
            this.openAccessoriesMenu();
        } else if (item.opensRoomsMenu || item.id === 'rooms') {
            this.openRoomsMenu();
        } else if (item.opensCellPhone || item.id === 'cell_phone') {
            this.openCellPhoneMenu();
        } else if (item.opensRadioMenu || item.id === 'radio') {
            this.openRadioMenu();
        } else if (item.opensMap || item.id === 'map') {
            this.openMapMenu();
        } else if (item.id === 'settings' || item.isSystem) {
            const gs = window.GameState;
            if (gs) {
                gs.isDebugMenuOpen = true;
                gs.isItemMenuOpen = false;
                gs.isEquipmentMenuOpen = false;
                gs.isMedallionsMenuOpen = false;
                gs.isEquippablesMenuOpen = false;
                gs.isConsumablesMenuOpen = false;
                gs.isAccessoriesMenuOpen = false;
            }
            window.isDebugMenuOpen = true;
            window.isItemMenuOpen = false;
            window.isEquipmentMenuOpen = false;
            window.isMedallionsMenuOpen = false;
            window.isEquippablesMenuOpen = false;
            window.isConsumablesMenuOpen = false;
            window.isAccessoriesMenuOpen = false;
            window.isCellPhoneOpen = false;
            window.isRadioMenuOpen = false;
            this.resetOptionState();
            if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
            if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
        } else {
            this.openDescriptionModal();
        }
    }

    openCellPhoneMenu() {
        if (window.isEquippablesMenuOpen) {
            this.cellPhoneOpenedFrom = 'equippables';
        } else if (window.isItemMenuOpen) {
            this.cellPhoneOpenedFrom = 'main';
        } else {
            this.cellPhoneOpenedFrom = 'gameplay';
        }

        const gs = window.GameState;
        if (gs) {
            gs.isItemMenuOpen = false;
            gs.isDebugMenuOpen = false;
            gs.isEquipmentMenuOpen = false;
            gs.isMedallionsMenuOpen = false;
            gs.isEquippablesMenuOpen = false;
            gs.isConsumablesMenuOpen = false;
        }
        window.isItemMenuOpen = false;
        window.isDebugMenuOpen = false;
        window.isEquipmentMenuOpen = false;
        window.isMedallionsMenuOpen = false;
        window.isEquippablesMenuOpen = false;
        window.isConsumablesMenuOpen = false;
        window.isRadioMenuOpen = false;
        window.isCellPhoneOpen = true;

        if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();

        if (window.ChatUI) {
            window.ChatUI.isPhoneOpen = true;
            if (window.ChatUI.dom && window.ChatUI.dom.input) {
                setTimeout(() => window.ChatUI.dom.input.focus(), 40);
            }
        }

        if (window.inputControllerInstance) {
            window.inputControllerInstance.hotbarSupply1Latched = false;
            window.inputControllerInstance.hotbarSupply2Latched = false;
            window.inputControllerInstance.hotbarSupply3Latched = false;
            window.inputControllerInstance.keys['j'] = false;
            window.inputControllerInstance.keys['i'] = false;
            window.inputControllerInstance.keys['l'] = false;
            window.inputControllerInstance.keys['1'] = false;
            window.inputControllerInstance.keys['2'] = false;
            window.inputControllerInstance.keys['3'] = false;
        }

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
            window.EventBus.emit('log:entry', { tag: 'PHONE', message: 'Opened Cell Phone communication menu.' });
        }
    }

    closeCellPhoneMenu() {
        window.isCellPhoneOpen = false;
        if (window.ChatUI) {
            window.ChatUI.isPhoneOpen = false;
            if (typeof window.ChatUI.closeTabSubmenu === 'function') {
                window.ChatUI.closeTabSubmenu();
            }
            if (window.ChatUI.dom && window.ChatUI.dom.input) window.ChatUI.dom.input.blur();
        }

        if (window.inputControllerInstance) {
            window.inputControllerInstance.hotbarSupply1Latched = false;
            window.inputControllerInstance.hotbarSupply2Latched = false;
            window.inputControllerInstance.hotbarSupply3Latched = false;
            window.inputControllerInstance.keys['j'] = false;
            window.inputControllerInstance.keys['i'] = false;
            window.inputControllerInstance.keys['l'] = false;
            window.inputControllerInstance.keys['1'] = false;
            window.inputControllerInstance.keys['2'] = false;
            window.inputControllerInstance.keys['3'] = false;
        }
        const gs = window.GameState;
        if (this.cellPhoneOpenedFrom === 'equippables') {
            this.openEquippablesMenu();
        } else if (this.cellPhoneOpenedFrom === 'main') {
            if (gs) gs.isItemMenuOpen = true;
            window.isItemMenuOpen = true;
            if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
            this.renderItemGrid();
        } else {
            if (gs) {
                gs.isItemMenuOpen = false;
                gs.isDebugMenuOpen = false;
                gs.isEquipmentMenuOpen = false;
                gs.isMedallionsMenuOpen = false;
                gs.isEquippablesMenuOpen = false;
                gs.isConsumablesMenuOpen = false;
            }
            window.isItemMenuOpen = false;
            window.isDebugMenuOpen = false;
            window.isEquipmentMenuOpen = false;
            window.isMedallionsMenuOpen = false;
            window.isEquippablesMenuOpen = false;
            window.isConsumablesMenuOpen = false;
            window.isRadioMenuOpen = false;
            if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
            const canvas = document.getElementById('glCanvas');
            if (canvas) canvas.focus();
        }

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
        }
    }

    cycleSubmenu(dir) {
        // L1/R1 and U/O menu switching has been removed per user specification.
        // Menu selection is performed exclusively from the Main Menu popup (Tab key / PS5 Options button).
        return;
    }

    closeAllSubmenus() {
        const gs = window.GameState;
        if (gs) {
            gs.isItemMenuOpen = true;
            gs.isDebugMenuOpen = false;
            gs.isEquipmentMenuOpen = false;
            gs.isMedallionsMenuOpen = false;
            gs.isEquippablesMenuOpen = false;
            gs.isConsumablesMenuOpen = false;
            gs.isAccessoriesMenuOpen = false;
        }
        window.isItemMenuOpen = true;
        window.isDebugMenuOpen = false;
        window.isEquipmentMenuOpen = false;
        window.isMedallionsMenuOpen = false;
        window.isEquippablesMenuOpen = false;
        window.isConsumablesMenuOpen = false;
        window.isAccessoriesMenuOpen = false;
        window.isCellPhoneOpen = false;
        window.isRadioMenuOpen = false;
        if (window.ChatUI) {
            window.ChatUI.isPhoneOpen = false;
            if (window.ChatUI.dom && window.ChatUI.dom.input) window.ChatUI.dom.input.blur();
        }
        if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
        this.renderItemGrid();
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
        }
    }

    updateHUDOverlay() {
        const slot1El = document.getElementById('hud-slot-1');
        const slot2El = document.getElementById('hud-slot-2');
        const slot3El = document.getElementById('hud-slot-3');
        const gs = window.GameState;

        const formatSlot = (item, defaultKey) => {
            if (!item) return `<span class="hud-label">EMPTY (${defaultKey})</span>`;
            if (gs && gs.consumables && gs.consumables[item.id]) {
                const supply = gs.consumables[item.id];
                return `<span class="hud-icon">${item.icon}</span><span class="hud-label">${item.name} (${supply.usable}/${supply.stacks})</span>`;
            }
            return `<span class="hud-icon">${item.icon}</span><span class="hud-label">${item.name}</span>`;
        };

        if (slot1El) slot1El.innerHTML = formatSlot(this.assignedHotbar.slot1, 'J');
        if (slot2El) slot2El.innerHTML = formatSlot(this.assignedHotbar.slot2, 'I');
        if (slot3El) slot3El.innerHTML = formatSlot(this.assignedHotbar.slot3, 'L');
    }

    openEquipmentMenu() {
        if (window.GameState) {
            window.GameState.isItemMenuOpen = false;
            window.GameState.isDebugMenuOpen = false;
            window.GameState.isMedallionsMenuOpen = false;
            window.GameState.isEquipmentMenuOpen = true;
            window.GameState.initEquipment();
        }
        window.isItemMenuOpen = false;
        window.isDebugMenuOpen = false;
        window.isMedallionsMenuOpen = false;
        window.isEquipmentMenuOpen = true;

        this.equipmentCategoryIndex = 0; // 0: Cap, 1: Shirt, 2: Pants
        window.updateMenuOverlays();
        this.renderEquipmentMenu();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
            window.EventBus.emit('log:entry', { tag: 'MENU', message: 'Opened Worn Equipment (Cosmetic) menu.' });
        }
    }

    closeEquipmentMenu() {
        if (window.GameState) {
            window.GameState.isEquipmentMenuOpen = false;
            window.GameState.isItemMenuOpen = true;
        }
        window.isEquipmentMenuOpen = false;
        window.isItemMenuOpen = true;
        window.updateMenuOverlays();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
        }
    }

    closeDebugMenu() {
        const gs = window.GameState;
        if (gs) {
            gs.isDebugMenuOpen = false;
            gs.isItemMenuOpen = true;
        }
        window.isDebugMenuOpen = false;
        window.isItemMenuOpen = true;
        this.isOptionEditing = false;
        if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
        }
    }

    navigateEquipmentMenu(dirX) {
        if (dirX !== 0) {
            this.equipmentCategoryIndex = (this.equipmentCategoryIndex + dirX + 3) % 3;
            this.renderEquipmentMenu();
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('sfx:play', 'nav');
            }
        }
    }

    renderEquipmentMenu() {
        const gs = window.GameState;
        if (!gs) return;
        gs.initEquipment();

        // Active Cap
        const capActive = gs.wornEquipment.cap;
        const capIconEl = document.getElementById('worn-cap-icon');
        const capNameEl = document.getElementById('worn-cap-name');
        const capStatsEl = document.getElementById('worn-cap-stats');
        if (capIconEl && capNameEl && capStatsEl) {
            capIconEl.textContent = capActive ? capActive.icon : '🧢';
            capNameEl.textContent = capActive ? capActive.name : 'Normal Cap';
            capStatsEl.textContent = capActive ? (capActive.val || capActive.desc) : 'Cosmetic Appearance (No Boosts)';
        }

        // Active Shirt
        const shirtActive = gs.wornEquipment.shirt;
        const shirtIconEl = document.getElementById('worn-shirt-icon');
        const shirtNameEl = document.getElementById('worn-shirt-name');
        const shirtStatsEl = document.getElementById('worn-shirt-stats');
        if (shirtIconEl && shirtNameEl && shirtStatsEl) {
            shirtIconEl.textContent = shirtActive ? shirtActive.icon : '👕';
            shirtNameEl.textContent = shirtActive ? shirtActive.name : 'Normal Shirt';
            shirtStatsEl.textContent = shirtActive ? (shirtActive.val || shirtActive.desc) : 'Cosmetic Appearance (No Boosts)';
        }

        // Active Pants
        const pantsActive = gs.wornEquipment.pants;
        const pantsIconEl = document.getElementById('worn-pants-icon');
        const pantsNameEl = document.getElementById('worn-pants-name');
        const pantsStatsEl = document.getElementById('worn-pants-stats');
        if (pantsIconEl && pantsNameEl && pantsStatsEl) {
            pantsIconEl.textContent = pantsActive ? pantsActive.icon : '👖';
            pantsNameEl.textContent = pantsActive ? pantsActive.name : 'Normal Pants';
            pantsStatsEl.textContent = pantsActive ? (pantsActive.val || pantsActive.desc) : 'Cosmetic Appearance (No Boosts)';
        }

        // Highlight selected slot column
        const categories = ['cap', 'shirt', 'pants'];
        categories.forEach((cat, idx) => {
            const col = document.getElementById(`category-col-${cat}`);
            if (col) {
                col.classList.toggle('cursor-selected', this.equipmentCategoryIndex === idx);
                col.onclick = () => {
                    this.equipmentCategoryIndex = idx;
                    this.renderEquipmentMenu();
                };
            }
        });
    }

    openMedallionsMenu() {
        if (window.GameState) {
            window.GameState.isItemMenuOpen = false;
            window.GameState.isDebugMenuOpen = false;
            window.GameState.isEquipmentMenuOpen = false;
            window.GameState.isMedallionsMenuOpen = true;
        }
        window.isItemMenuOpen = false;
        window.isDebugMenuOpen = false;
        window.isEquipmentMenuOpen = false;
        window.isMedallionsMenuOpen = true;

        this.selectedMedallionIndex = 0; // Starts at Slot 1 (Bottom, 6 o'clock)
        window.updateMenuOverlays();
        this.renderMedallionsMenu();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
            window.EventBus.emit('log:entry', { tag: 'MEDAL', message: 'Opened Medallions of the Realm menu.' });
        }
    }

    closeMedallionsMenu() {
        if (window.GameState) {
            window.GameState.isMedallionsMenuOpen = false;
            window.GameState.isItemMenuOpen = true;
        }
        window.isMedallionsMenuOpen = false;
        window.isItemMenuOpen = true;
        window.updateMenuOverlays();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
        }
    }

    navigateMedallions(dir) {
        if (dir !== 0) {
            // 6 slots: 0 to 5
            this.selectedMedallionIndex = (this.selectedMedallionIndex + dir + 6) % 6;
            this.renderMedallionsMenu();
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('sfx:play', 'nav');
            }
        }
    }

    inspectMedallion(slotNum) {
        this.selectedMedallionIndex = slotNum - 1;
        this.renderMedallionsMenu();
    }

    renderMedallionsMenu() {
        const list = typeof MEDALLIONS_REGISTRY !== 'undefined' ? MEDALLIONS_REGISTRY : [];
        if (list.length === 0) return;

        const currentMedal = list[this.selectedMedallionIndex];
        if (!currentMedal) return;

        // Update node highlighting
        for (let i = 1; i <= 6; i++) {
            const nodeEl = document.getElementById(`medallion-slot-${i}`);
            if (nodeEl) {
                const isHovered = (i - 1) === this.selectedMedallionIndex;
                nodeEl.classList.toggle('active-hover', isHovered);

                // Mouseover does not affect the menu; click triggers selection
                nodeEl.onclick = () => this.inspectMedallion(i);
            }
        }

        // Update Inspector Panel
        const statusBadge = document.getElementById('inspect-status-badge');
        const slotNum = document.getElementById('inspect-slot-num');
        const iconEl = document.getElementById('inspect-icon');
        const titleEl = document.getElementById('inspect-title');
        const benefitVal = document.getElementById('inspect-benefit-val');
        const descEl = document.getElementById('inspect-desc');

        if (statusBadge) {
            statusBadge.textContent = currentMedal.earned ? "ALWAYS ACTIVE" : "LOCKED";
            statusBadge.className = `inspect-badge ${currentMedal.earned ? 'active-badge' : 'locked-badge'}`;
        }
        if (slotNum) {
            slotNum.textContent = `SLOT ${currentMedal.slotPosition} • ${currentMedal.clockPosition.toUpperCase()}`;
        }
        if (iconEl) {
            iconEl.textContent = currentMedal.icon;
        }
        if (titleEl) {
            titleEl.textContent = currentMedal.name;
        }
        if (benefitVal) {
            benefitVal.textContent = currentMedal.benefit;
            benefitVal.style.color = currentMedal.earned ? '#00e676' : '#78909c';
        }
        if (descEl) {
            descEl.textContent = currentMedal.desc;
        }
    }

    /* -------------------------------------------------------------
       EQUIPPABLE ITEMS MENU (Tools & Relics)
       ------------------------------------------------------------- */
    openEquippablesMenu() {
        if (window.GameState) {
            window.GameState.isItemMenuOpen = false;
            window.GameState.isDebugMenuOpen = false;
            window.GameState.isEquipmentMenuOpen = false;
            window.GameState.isMedallionsMenuOpen = false;
            window.GameState.isConsumablesMenuOpen = false;
            window.GameState.isEquippablesMenuOpen = true;
        }
        window.isItemMenuOpen = false;
        window.isDebugMenuOpen = false;
        window.isEquipmentMenuOpen = false;
        window.isMedallionsMenuOpen = false;
        window.isConsumablesMenuOpen = false;
        window.isEquippablesMenuOpen = true;

        this.selectedEquippableIndex = 0;
        this.assignmentPhase = false;
        window.updateMenuOverlays();
        this.renderEquippablesMenu();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
            window.EventBus.emit('log:entry', { tag: 'MENU', message: 'Opened Equippable Items menu.' });
        }
    }

    closeEquippablesMenu() {
        this.assignmentPhase = false;
        if (window.GameState) {
            window.GameState.isEquippablesMenuOpen = false;
            window.GameState.isItemMenuOpen = true;
        }
        window.isEquippablesMenuOpen = false;
        window.isItemMenuOpen = true;
        window.updateMenuOverlays();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
        }
    }

    navigateEquippablesGrid(dx, dy) {
        const len = this.equippableGridItems ? this.equippableGridItems.length : 0;
        if (len === 0) return;
        const step = dy !== 0 ? dy : dx;
        if (step !== 0) {
            this.selectedEquippableIndex = (this.selectedEquippableIndex + step + len) % len;
            this.renderEquippablesMenu();
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('sfx:play', 'nav');
            }
        }
    }

    assignSelectedEquippable(targetSlot) {
        if (!this.equippableGridItems || this.equippableGridItems.length === 0) return;
        const item = this.equippableGridItems[this.selectedEquippableIndex];
        if (!item) return;

        this.assignmentPhase = false;

        if (this.assignedHotbar[targetSlot] && this.assignedHotbar[targetSlot].id === item.id) {
            this.assignedHotbar[targetSlot] = null;
            this.log('INFO', `Unequipped '${item.name}' from ${targetSlot.toUpperCase()}`);
            if (window.GameState) window.GameState.setHotbarSlot(targetSlot, null);
        } else {
            ['slot1', 'slot2', 'slot3'].forEach(s => {
                if (s !== targetSlot && this.assignedHotbar[s] && this.assignedHotbar[s].id === item.id) {
                    this.assignedHotbar[s] = null;
                    if (window.GameState) window.GameState.setHotbarSlot(s, null);
                }
            });
            this.assignedHotbar[targetSlot] = item;
            this.log('OK', `Assigned '${item.name}' to ${targetSlot.toUpperCase()}`);
            if (window.GameState) window.GameState.setHotbarSlot(targetSlot, item);
        }

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'assign');
        } else if (typeof audioManager !== 'undefined') {
            audioManager.playSFX('assign');
        }

        this.renderEquippablesMenu();
        this.updateHUDOverlay();
    }

    useSelectedEquippable() {
        if (!this.equippableGridItems || this.equippableGridItems.length === 0) return;
        const item = this.equippableGridItems[this.selectedEquippableIndex];
        if (!item) return;
        this.activateToolItem(item, true);
    }

    activateToolItem(item, fromMenu = false) {
        if (!item) return;

        if (item.opensTextMessage || item.id === 'text_message') {
            const inToolsMenu = fromMenu || window.isEquippablesMenuOpen || (window.GameState && window.GameState.isEquippablesMenuOpen);
            if (inToolsMenu) {
                this.openCellPhoneMenu();
            } else if (window.ChatUI && typeof window.ChatUI.openTextMessageTool === 'function') {
                window.ChatUI.openTextMessageTool();
            }
        } else if (item.opensCellPhone || item.id === 'cell_phone') {
            this.openCellPhoneMenu();
        } else if (item.opensRadioMenu || item.id === 'radio') {
            this.openRadioMenu();
        } else if (item.opensMap || item.id === 'map') {
            this.openMapMenu();
        } else if (item.id === 'lyre') {
            if (typeof window.triggerLyrePhaseShift === 'function') {
                window.triggerLyrePhaseShift();
            } else if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('dimension:phaseShift');
            }
            if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'assign');
        } else if (item.id === 'telescope') {
            if (window.GameState && typeof window.GameState.toggleFirstPerson === 'function') {
                window.GameState.toggleFirstPerson();
            }
            if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'assign');
        } else if (item.id === 'bat') {
            if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'assign');
            this.log('OK', 'Swung Bat.');
        } else if (item.id === 'wings') {
            if (window.GameState && typeof window.GameState.toggleBatWings === 'function') {
                window.GameState.toggleBatWings();
            }
        }
    }

    renderEquippablesMenu() {
        const container = document.getElementById('equippables-grid-container');
        if (!container) return;

        const pf = window.PixelFont;

        if (!this.equippableGridItems || this.equippableGridItems.length === 0) {
            this.equippableGridItems = (typeof EQUIPPABLE_ITEMS_REGISTRY !== 'undefined' ? EQUIPPABLE_ITEMS_REGISTRY : [
                ITEM_REGISTRY.telescope, ITEM_REGISTRY.bat, ITEM_REGISTRY.lyre, ITEM_REGISTRY.cell_phone, ITEM_REGISTRY.text_message, ITEM_REGISTRY.radio
            ]).filter(Boolean);
        }

        let html = '';
        this.equippableGridItems.forEach((item, idx) => {
            const isSelected = idx === this.selectedEquippableIndex;
            const isAssigning = this.assignmentPhase && isSelected;

            let assignedBtn = "";
            if (this.assignedHotbar.slot1 && this.assignedHotbar.slot1.id === item.id) assignedBtn += " [BUTTON J]";
            if (this.assignedHotbar.slot2 && this.assignedHotbar.slot2.id === item.id) assignedBtn += " [BUTTON I]";
            if (this.assignedHotbar.slot3 && this.assignedHotbar.slot3.id === item.id) assignedBtn += " [BUTTON L]";

            const cursorHtml = pf ? pf.render(isSelected ? '▶' : ' ') : (isSelected ? '▶' : '&nbsp;');
            const nameHtml = pf ? pf.render(item.name.toUpperCase()) : item.name.toUpperCase();
            const tagHtml = (assignedBtn && pf) ? pf.render(assignedBtn) : assignedBtn;
            const assignTagHtml = pf ? pf.render("[ASSIGN: J/I/L]") : "[ASSIGN: J/I/L]";

            html += `
                <div class="gba-sub-row ${isSelected ? 'selected' : ''} ${isAssigning ? 'assign-highlight' : ''}" onclick="debugMenu.selectedEquippableIndex = ${idx}; debugMenu.renderEquippablesMenu();">
                    <span class="gba-cursor">${cursorHtml}</span>
                    <span class="gba-sub-name">${nameHtml}</span>
                    ${isAssigning ? `<span class="gba-sub-slot-tag assign-tag">${assignTagHtml}</span>` : (assignedBtn ? `<span class="gba-sub-slot-tag">${tagHtml}</span>` : '')}
                </div>
            `;
        });
        container.innerHTML = html;
    }

    /* -------------------------------------------------------------
       CONSUMABLE ITEMS MENU (20 Max / 20 Stacks = 420 Total)
       ------------------------------------------------------------- */
    openConsumablesMenu() {
        if (window.GameState) {
            window.GameState.isItemMenuOpen = false;
            window.GameState.isDebugMenuOpen = false;
            window.GameState.isEquipmentMenuOpen = false;
            window.GameState.isMedallionsMenuOpen = false;
            window.GameState.isEquippablesMenuOpen = false;
            window.GameState.isConsumablesMenuOpen = true;
            window.GameState.initConsumables();
        }
        window.isItemMenuOpen = false;
        window.isDebugMenuOpen = false;
        window.isEquipmentMenuOpen = false;
        window.isMedallionsMenuOpen = false;
        window.isEquippablesMenuOpen = false;
        window.isConsumablesMenuOpen = true;

        this.selectedConsumableIndex = 0;
        this.assignmentPhase = false;
        window.updateMenuOverlays();
        this.renderConsumablesMenu();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
            window.EventBus.emit('log:entry', { tag: 'MENU', message: 'Opened Consumable Items menu.' });
        }
    }

    closeConsumablesMenu() {
        this.assignmentPhase = false;
        if (window.GameState) {
            window.GameState.isConsumablesMenuOpen = false;
            window.GameState.isItemMenuOpen = true;
        }
        window.isConsumablesMenuOpen = false;
        window.isItemMenuOpen = true;
        window.updateMenuOverlays();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
        }
    }

    navigateConsumablesGrid(dx, dy) {
        const list = typeof CONSUMABLES_REGISTRY !== 'undefined' ? CONSUMABLES_REGISTRY : [];
        if (list.length === 0) return;
        const step = dy !== 0 ? dy : dx;
        if (step !== 0) {
            this.selectedConsumableIndex = (this.selectedConsumableIndex + step + list.length) % list.length;
            this.renderConsumablesMenu();
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('sfx:play', 'nav');
            }
        }
    }

    useSelectedConsumable() {
        const list = typeof CONSUMABLES_REGISTRY !== 'undefined' ? CONSUMABLES_REGISTRY : [];
        if (list.length === 0) return;
        const target = list[this.selectedConsumableIndex];
        if (!target) return;

        if (window.GameState) {
            window.GameState.useConsumable(target.id);
        }
        this.renderConsumablesMenu();
    }

    obtainSelectedConsumable(amount = 1) {
        const list = typeof CONSUMABLES_REGISTRY !== 'undefined' ? CONSUMABLES_REGISTRY : [];
        if (list.length === 0) return;
        const target = list[this.selectedConsumableIndex];
        if (!target) return;

        if (window.GameState) {
            window.GameState.obtainConsumable(target.id, amount);
        }
        this.renderConsumablesMenu();
    }

    promptCustomAmount(idx) {
        const list = typeof CONSUMABLES_REGISTRY !== 'undefined' ? CONSUMABLES_REGISTRY : [];
        if (list.length === 0) return;
        if (idx !== undefined) this.selectedConsumableIndex = idx;
        const target = list[this.selectedConsumableIndex];
        if (!target) return;

        const input = window.prompt(`Enter number of items to add to ${target.name}:\n(Adding 20 items increases stack by 1 without affecting held items)`, "20");
        if (input !== null) {
            const val = parseInt(input.trim(), 10);
            if (!isNaN(val) && val > 0) {
                this.obtainSelectedConsumable(val);
            }
        }
    }

    assignSelectedSupply(targetSlot) {
        const list = typeof CONSUMABLES_REGISTRY !== 'undefined' ? CONSUMABLES_REGISTRY : [];
        if (list.length === 0) return;
        const item = list[this.selectedConsumableIndex];
        if (!item) return;

        this.assignmentPhase = false;

        if (this.assignedHotbar[targetSlot] && this.assignedHotbar[targetSlot].id === item.id) {
            this.assignedHotbar[targetSlot] = null;
            this.log('INFO', `Unequipped '${item.name}' from ${targetSlot.toUpperCase()}`);
            if (window.GameState) window.GameState.setHotbarSlot(targetSlot, null);
        } else {
            ['slot1', 'slot2', 'slot3'].forEach(s => {
                if (s !== targetSlot && this.assignedHotbar[s] && this.assignedHotbar[s].id === item.id) {
                    this.assignedHotbar[s] = null;
                    if (window.GameState) window.GameState.setHotbarSlot(s, null);
                }
            });
            this.assignedHotbar[targetSlot] = item;
            this.log('OK', `Equipped Supply '${item.name}' to ${targetSlot.toUpperCase()}`);
            if (window.GameState) window.GameState.setHotbarSlot(targetSlot, item);
        }

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'assign');
        } else if (typeof audioManager !== 'undefined') {
            audioManager.playSFX('assign');
        }

        this.renderConsumablesMenu();
        this.updateHUDOverlay();
    }

    renderConsumablesMenu() {
        const container = document.getElementById('consumables-grid-container');
        if (!container) return;

        const gs = window.GameState;
        if (gs) gs.initConsumables();

        const pf = window.PixelFont;
        const registryList = typeof CONSUMABLES_REGISTRY !== 'undefined' ? CONSUMABLES_REGISTRY : [];

        if (registryList.length === 0) {
            const emptyNotice = pf ? pf.render("NO SUPPLIES REGISTERED") : "NO SUPPLIES REGISTERED";
            const subNotice = pf ? pf.render("SUPPLY ARCHITECTURE READY FOR CUSTOM ITEMS") : "Supply architecture ready for custom items.";
            container.innerHTML = `
                <div class="gba-empty-notice" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 160px; text-align: center; color: #000000; gap: 8px;">
                    <div style="font-weight: bold; font-size: 13px;">${emptyNotice}</div>
                    <div style="font-size: 10px; opacity: 0.65;">${subNotice}</div>
                </div>
            `;
            return;
        }

        let html = '';
        registryList.forEach((regItem, idx) => {
            const isSelected = idx === this.selectedConsumableIndex;
            const isAssigning = this.assignmentPhase && isSelected;
            const currentItem = (gs && gs.consumables && gs.consumables[regItem.id]) ? gs.consumables[regItem.id] : regItem;
            const usable = currentItem.usable !== undefined ? currentItem.usable : 0;
            const stacks = currentItem.stacks !== undefined ? currentItem.stacks : 0;

            let assignedBtn = "";
            if (this.assignedHotbar.slot1 && this.assignedHotbar.slot1.id === regItem.id) assignedBtn += " [BUTTON J]";
            if (this.assignedHotbar.slot2 && this.assignedHotbar.slot2.id === regItem.id) assignedBtn += " [BUTTON I]";
            if (this.assignedHotbar.slot3 && this.assignedHotbar.slot3.id === regItem.id) assignedBtn += " [BUTTON L]";

            const cursorHtml = pf ? pf.render(isSelected ? '▶' : ' ') : (isSelected ? '▶' : '&nbsp;');
            const nameHtml = pf ? pf.render(regItem.name.toUpperCase()) : regItem.name.toUpperCase();
            const qtyHtml = pf ? pf.render(`×${usable}/${stacks}`) : `×${usable}/${stacks}`;
            const tagHtml = (assignedBtn && pf) ? pf.render(assignedBtn) : assignedBtn;
            const assignTagHtml = pf ? pf.render("[ASSIGN: J/I/L]") : "[ASSIGN: J/I/L]";

            html += `
                <div class="gba-sub-row ${isSelected ? 'selected' : ''} ${isAssigning ? 'assign-highlight' : ''}" onclick="debugMenu.selectedConsumableIndex = ${idx}; debugMenu.renderConsumablesMenu();">
                    <span class="gba-cursor">${cursorHtml}</span>
                    <span class="gba-sub-name">${nameHtml}</span>
                    <span class="gba-sub-qty">${qtyHtml}</span>
                    ${isAssigning ? `<span class="gba-sub-slot-tag assign-tag">${assignTagHtml}</span>` : (assignedBtn ? `<span class="gba-sub-slot-tag">${tagHtml}</span>` : '')}
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /* -------------------------------------------------------------
       ACCESSORIES MENU (Passive Relics & Charms)
       ------------------------------------------------------------- */
    openAccessoriesMenu() {
        if (window.GameState) {
            window.GameState.isItemMenuOpen = false;
            window.GameState.isDebugMenuOpen = false;
            window.GameState.isEquipmentMenuOpen = false;
            window.GameState.isMedallionsMenuOpen = false;
            window.GameState.isEquippablesMenuOpen = false;
            window.GameState.isConsumablesMenuOpen = false;
            window.GameState.isAccessoriesMenuOpen = true;
        }
        window.isItemMenuOpen = false;
        window.isDebugMenuOpen = false;
        window.isEquipmentMenuOpen = false;
        window.isMedallionsMenuOpen = false;
        window.isEquippablesMenuOpen = false;
        window.isConsumablesMenuOpen = false;
        window.isAccessoriesMenuOpen = true;

        this.selectedAccessoryIndex = 0;
        window.updateMenuOverlays();
        this.renderAccessoriesMenu();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
            window.EventBus.emit('log:entry', { tag: 'MENU', message: 'Opened Accessories menu.' });
        }
    }

    closeAccessoriesMenu() {
        if (window.GameState) {
            window.GameState.isAccessoriesMenuOpen = false;
            window.GameState.isItemMenuOpen = true;
        }
        window.isAccessoriesMenuOpen = false;
        window.isItemMenuOpen = true;
        window.updateMenuOverlays();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
        }
    }

    navigateAccessoriesGrid(dx, dy) {
        const len = this.accessoryGridItems ? this.accessoryGridItems.length : 0;
        if (len === 0) return;
        const step = dy !== 0 ? dy : dx;
        if (step !== 0) {
            this.selectedAccessoryIndex = (this.selectedAccessoryIndex + step + len) % len;
            this.renderAccessoriesMenu();
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('sfx:play', 'nav');
            }
        }
    }

    toggleEquipSelectedAccessory() {
        if (!this.accessoryGridItems || this.accessoryGridItems.length === 0) return;
        const item = this.accessoryGridItems[this.selectedAccessoryIndex];
        if (!item) return;

        if (window.GameState && typeof window.GameState.toggleEquipAccessory === 'function') {
            window.GameState.toggleEquipAccessory(item.id);
        } else if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('accessory:toggle', { id: item.id });
        }
        this.renderAccessoriesMenu();
    }

    renderAccessoriesMenu() {
        const container = document.getElementById('accessories-grid-container');
        if (!container) return;

        const pf = window.PixelFont;

        if (!this.accessoryGridItems || this.accessoryGridItems.length === 0) {
            this.accessoryGridItems = (typeof ACCESSORIES_REGISTRY !== 'undefined' ? ACCESSORIES_REGISTRY : [
                ITEM_REGISTRY.walk_straight
            ]).filter(Boolean);
        }

        let html = '';
        this.accessoryGridItems.forEach((item, idx) => {
            const isSelected = idx === this.selectedAccessoryIndex;
            const isEquipped = window.GameState && typeof window.GameState.hasEquippedAccessory === 'function'
                ? window.GameState.hasEquippedAccessory(item.id)
                : false;

            const cursorHtml = pf ? pf.render(isSelected ? '▶' : ' ') : (isSelected ? '▶' : '&nbsp;');
            const nameHtml = pf ? pf.render(item.name.toUpperCase()) : item.name.toUpperCase();
            const tagHtml = pf ? pf.render("[EQUIPPED]") : "[EQUIPPED]";

            // If an Accessory is equipped, it’s indicated in the menu. If it is unequipped, it’s also possible to tell—there will be no decoration.
            const decorationHtml = isEquipped ? `<span class="gba-sub-slot-tag">${tagHtml}</span>` : '';

            html += `
                <div class="gba-sub-row ${isSelected ? 'selected' : ''}" onclick="debugMenu.selectedAccessoryIndex = ${idx}; debugMenu.toggleEquipSelectedAccessory();">
                    <span class="gba-cursor">${cursorHtml}</span>
                    <span class="gba-sub-name">${nameHtml}</span>
                    ${decorationHtml}
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /* -------------------------------------------------------------
       ROOM SELECTION MENU (Recognizes & warps to available rooms)
       ------------------------------------------------------------- */
    openRoomsMenu() {
        if (window.GameState) {
            window.GameState.isItemMenuOpen = false;
            window.GameState.isDebugMenuOpen = false;
            window.GameState.isEquipmentMenuOpen = false;
            window.GameState.isMedallionsMenuOpen = false;
            window.GameState.isEquippablesMenuOpen = false;
            window.GameState.isConsumablesMenuOpen = false;
            window.GameState.isAccessoriesMenuOpen = false;
            window.GameState.isMapMenuOpen = false;
            window.GameState.isRoomsMenuOpen = true;
        }
        window.isItemMenuOpen = false;
        window.isDebugMenuOpen = false;
        window.isEquipmentMenuOpen = false;
        window.isMedallionsMenuOpen = false;
        window.isEquippablesMenuOpen = false;
        window.isConsumablesMenuOpen = false;
        window.isAccessoriesMenuOpen = false;
        window.isMapMenuOpen = false;
        window.isRoomsMenuOpen = true;

        this.selectedRoomIndex = 0;
        this.discoverAvailableRooms();
        window.updateMenuOverlays();
        this.renderRoomsMenu();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
            window.EventBus.emit('log:entry', { tag: 'ROOMS', message: 'Opened Room Selection menu.' });
        }
    }

    closeRoomsMenu() {
        if (window.GameState) {
            window.GameState.isRoomsMenuOpen = false;
            window.GameState.isItemMenuOpen = true;
        }
        window.isRoomsMenuOpen = false;
        window.isItemMenuOpen = true;
        window.updateMenuOverlays();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
        }
    }

    discoverAvailableRooms() {
        const loader = window.TarAppLoader || (window.parent && window.parent.TarAppLoader);
        const decoder = (typeof TextDecoder !== 'undefined') ? new TextDecoder('utf-8') : null;
        const roomMap = new Map();

        // 1. Inspect in-memory virtual filesystem from unpacked bar.tar
        const nonRoomAssets = new Set([
            'player', 'boat', 'door', 'tricurse_cursor', 'entrance_pipe',
            'cursor', 'pipe'
        ]);

        if (loader && loader.fileSystem) {
            for (const [filePath, entry] of Object.entries(loader.fileSystem)) {
                // Support both root rooms and sub-rooms in directories (e.g. rooms/kokiri_forest/links_house.gltf)
                const match = filePath.match(/^(?:rooms|light|gltf)\/([a-zA-Z0-9_\/]+)\.gltf$/i);
                if (!match) continue;
                const roomPath = match[1];
                const destFile = roomPath.split('/').pop().toLowerCase();
                if (nonRoomAssets.has(destFile)) continue;
                const roomName = roomPath;

                let gltf = null;
                try {
                    if (typeof entry.text === 'function') {
                        gltf = JSON.parse(entry.text());
                    } else if (entry.data && decoder) {
                        gltf = JSON.parse(decoder.decode(entry.data));
                    }
                } catch (e) {}

                const entrances = [];
                if (gltf && gltf.nodes) {
                    gltf.nodes.forEach(n => {
                        if (n.name && (n.name.match(/^en_([lds])__([a-zA-Z0-9_\/]+?)(?:\.\d{3})?$/) || n.name.match(/^en__([a-zA-Z0-9_\/]+?)(?:\.\d{3})?$/))) {
                            entrances.push(n.name);
                        }
                    });
                }
                roomMap.set(roomName, entrances);
            }
        }

        // 2. Always guarantee current active room, 'world', and 'ocean_haven' are present
        const currentRoom = (window.GameState && window.GameState.currentRoom) || 'world';
        if (!roomMap.has(currentRoom)) {
            roomMap.set(currentRoom, ['en_l__' + currentRoom]);
        }
        if (!roomMap.has('world')) {
            roomMap.set('world', ['en_l__world']);
        }
        if (!roomMap.has('ocean_haven')) {
            roomMap.set('ocean_haven', ['en_l__world', 'en_l__ocean_haven']);
        }

        // 3. Transform to menu list items
        this.roomMenuItems = Array.from(roomMap.entries()).map(([roomName, entrances]) => {
            const entList = (entrances && entrances.length > 0) ? entrances : ['en_l__' + roomName];
            const displayName = roomName.includes('/')
                ? roomName.split('/').map(s => s.toUpperCase().replace(/_/g, ' ')).join(' / ')
                : roomName.toUpperCase().replace(/__/g, ' / ').replace(/_/g, ' ');
            return {
                id: roomName,
                name: displayName,
                entrances: entList,
                primaryEntrance: entList[0]
            };
        }).sort((a, b) => a.id.localeCompare(b.id));

        if (this.selectedRoomIndex >= this.roomMenuItems.length) {
            this.selectedRoomIndex = 0;
        }
    }

    navigateRoomsGrid(dx, dy) {
        const len = this.roomMenuItems ? this.roomMenuItems.length : 0;
        if (len === 0) return;
        const step = dy !== 0 ? dy : dx;
        if (step !== 0) {
            this.selectedRoomIndex = (this.selectedRoomIndex + step + len) % len;
            this.renderRoomsMenu();
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('sfx:play', 'nav');
            }
        }
    }

    warpToSelectedRoom() {
        if (!this.roomMenuItems || this.roomMenuItems.length === 0) return;
        const target = this.roomMenuItems[this.selectedRoomIndex];
        if (!target) return;

        const targetRoomName = target.id;
        const targetEntrance = target.primaryEntrance;

        // Close all menus so player returns immediately to gameplay in target room
        if (window.GameState) {
            window.GameState.isItemMenuOpen = false;
            window.GameState.isDebugMenuOpen = false;
            window.GameState.isEquipmentMenuOpen = false;
            window.GameState.isMedallionsMenuOpen = false;
            window.GameState.isEquippablesMenuOpen = false;
            window.GameState.isConsumablesMenuOpen = false;
            window.GameState.isAccessoriesMenuOpen = false;
            window.GameState.isRoomsMenuOpen = false;
            window.GameState.isMapMenuOpen = false;
        }
        window.isItemMenuOpen = false;
        window.isDebugMenuOpen = false;
        window.isEquipmentMenuOpen = false;
        window.isMedallionsMenuOpen = false;
        window.isEquippablesMenuOpen = false;
        window.isConsumablesMenuOpen = false;
        window.isAccessoriesMenuOpen = false;
        window.isRoomsMenuOpen = false;
        window.isMapMenuOpen = false;
        window.updateMenuOverlays();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'assign');
            window.EventBus.emit('log:entry', {
                tag: 'WARP',
                message: `Warping to room '${targetRoomName}' via entrance '${targetEntrance}'`
            });
            window.EventBus.emit('room:load', {
                targetRoom: targetRoomName,
                sourceRoom: targetEntrance
            });
        } else if (typeof window.loadRoom === 'function') {
            window.loadRoom(targetRoomName, targetEntrance);
        }
    }

    renderRoomsMenu() {
        const container = document.getElementById('rooms-grid-container');
        if (!container) return;

        const pf = window.PixelFont;

        if (!this.roomMenuItems || this.roomMenuItems.length === 0) {
            this.discoverAvailableRooms();
        }

        const currentRoom = (window.GameState && window.GameState.currentRoom) || 'world';

        let html = '';
        this.roomMenuItems.forEach((item, idx) => {
            const isSelected = idx === this.selectedRoomIndex;
            const isCurrent = (item.id === currentRoom);

            const cursorHtml = pf ? pf.render(isSelected ? '▶' : ' ') : (isSelected ? '▶' : '&nbsp;');
            const roomHtml = pf ? pf.render(item.name) : item.name;

            const entStr = item.entrances.join(', ');
            const entHtml = pf ? pf.render(`[ENTRANCE: ${entStr}]`) : `[ENTRANCE: ${entStr}]`;
            const currentBadge = isCurrent ? (pf ? pf.render("[HERE]") : "[HERE]") : "";

            html += `
                <div class="gba-sub-row ${isSelected ? 'selected' : ''}" onclick="debugMenu.selectedRoomIndex = ${idx}; debugMenu.warpToSelectedRoom();" style="display:flex; justify-content:space-between; align-items:center; padding: 4px 6px;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span class="gba-cursor">${cursorHtml}</span>
                        <span class="gba-sub-name" style="font-weight:bold;">${roomHtml}</span>
                        ${isCurrent ? `<span class="gba-sub-slot-tag" style="background:#000000; color:#ffffff; padding:1px 4px; font-size:10px;">${currentBadge}</span>` : ''}
                    </div>
                    <span class="gba-sub-slot-tag" style="color:#444444; font-size:10px; margin-left:auto;">${entHtml}</span>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /* -------------------------------------------------------------
       WORLD MAP & NAUTICAL CHART (Key Exploration Gear)
       ------------------------------------------------------------- */
    openMapMenu() {
        if (window.isEquippablesMenuOpen) {
            this.mapOpenedFrom = 'equippables';
        } else if (window.isItemMenuOpen) {
            this.mapOpenedFrom = 'main';
        } else {
            this.mapOpenedFrom = 'gameplay';
        }

        const gs = window.GameState;
        if (gs) {
            gs.isItemMenuOpen = false;
            gs.isDebugMenuOpen = false;
            gs.isEquipmentMenuOpen = false;
            gs.isMedallionsMenuOpen = false;
            gs.isEquippablesMenuOpen = false;
            gs.isConsumablesMenuOpen = false;
            gs.isAccessoriesMenuOpen = false;
            gs.isRoomsMenuOpen = false;
            gs.isMapMenuOpen = true;
        }
        window.isItemMenuOpen = false;
        window.isDebugMenuOpen = false;
        window.isEquipmentMenuOpen = false;
        window.isMedallionsMenuOpen = false;
        window.isEquippablesMenuOpen = false;
        window.isConsumablesMenuOpen = false;
        window.isAccessoriesMenuOpen = false;
        window.isRoomsMenuOpen = false;
        window.isCellPhoneOpen = false;
        window.isRadioMenuOpen = false;
        window.isMapMenuOpen = true;

        if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
        this.renderMapMenu();

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
            window.EventBus.emit('log:entry', { tag: 'MAP', message: 'Opened World Map & Nautical Chart.' });
        }
    }

    closeMapMenu() {
        if (window.GameState) window.GameState.isMapMenuOpen = false;
        window.isMapMenuOpen = false;

        const gs = window.GameState;
        if (this.mapOpenedFrom === 'equippables') {
            this.openEquippablesMenu();
        } else if (this.mapOpenedFrom === 'main') {
            if (gs) gs.isItemMenuOpen = true;
            window.isItemMenuOpen = true;
            if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
            this.renderItemGrid();
        } else {
            if (gs) {
                gs.isItemMenuOpen = false;
                gs.isDebugMenuOpen = false;
                gs.isEquipmentMenuOpen = false;
                gs.isMedallionsMenuOpen = false;
                gs.isEquippablesMenuOpen = false;
                gs.isConsumablesMenuOpen = false;
                gs.isAccessoriesMenuOpen = false;
                gs.isRoomsMenuOpen = false;
                gs.isMapMenuOpen = false;
            }
            window.isItemMenuOpen = false;
            window.isDebugMenuOpen = false;
            window.isEquipmentMenuOpen = false;
            window.isMedallionsMenuOpen = false;
            window.isEquippablesMenuOpen = false;
            window.isConsumablesMenuOpen = false;
            window.isAccessoriesMenuOpen = false;
            window.isRoomsMenuOpen = false;
            window.isCellPhoneOpen = false;
            window.isRadioMenuOpen = false;
            window.isMapMenuOpen = false;
            if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
            const canvas = document.getElementById('glCanvas');
            if (canvas) canvas.focus();
        }

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('sfx:play', 'nav');
        }
    }

    renderMapMenu() {
        const container = document.getElementById('map-content-container');
        if (!container) return;

        const gs = window.GameState;
        const char = gs ? gs.characterEntity : null;
        const currentRoom = (gs && gs.currentRoom) || 'world';
        const posX = char ? char.position[0] : 0.0;
        const posY = char ? char.position[1] : 0.0;
        const posZ = char ? char.position[2] : 0.0;
        const rotY = char ? char.rotationY : 0.0;

        const roomDef = (window.ROOM_COORDINATES && window.ROOM_COORDINATES[currentRoom]) || { x: 0.0, z: 0.0 };
        const globalX = (gs && gs.isOpenSea) ? posX : (posX + roomDef.x);
        const globalZ = (gs && gs.isOpenSea) ? posZ : (posZ + roomDef.z);

        const rawLat = -globalZ * 0.1;
        const rawLon =  globalX * 0.1;

        const totalLatDeg = Math.floor(Math.abs(rawLat));
        const latMin = ((Math.abs(rawLat) - totalLatDeg) * 60).toFixed(1).padStart(4, '0');
        const latDeg = ((totalLatDeg % 360) + 360) % 360;
        const latDir = rawLat >= 0 ? 'N' : 'S';

        const totalLonDeg = Math.floor(Math.abs(rawLon));
        const lonMin = ((Math.abs(rawLon) - totalLonDeg) * 60).toFixed(1).padStart(4, '0');
        const lonDeg = ((totalLonDeg % 360) + 360) % 360;
        const lonDir = rawLon >= 0 ? 'E' : 'W';

        const deg = Math.round(((-rotY * 180 / Math.PI) % 360 + 360) % 360);
        const compassPoints = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const compassDir = compassPoints[Math.round(deg / 45) % 8];

        const phys = window.playerPhysicsInstance;
        const isBoating = phys && phys.currentState === (window.State && window.State.BOATING);
        const speedKts = isBoating ? Math.abs((phys.boatVelocity || 0) * 1.944).toFixed(1) : '0.0';

        const svgCenterX = 200, svgCenterY = 140;
        const svgScale = 1.35;
        const playerSvgX = Math.max(25, Math.min(375, svgCenterX + posX * svgScale));
        const playerSvgY = Math.max(25, Math.min(275, svgCenterY + (posZ - 35) * svgScale));
        const headingDeg = (rotY * 180 / Math.PI);

        container.innerHTML = `
            <div class="map-card-wrapper">
                <div class="map-chart-box">
                    <svg viewBox="0 0 400 290" class="nautical-chart-svg">
                        <defs>
                            <pattern id="chart-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(56, 217, 212, 0.12)" stroke-width="1"/>
                            </pattern>
                            <radialGradient id="ocean-glow" cx="50%" cy="50%" r="65%">
                                <stop offset="0%" stop-color="#143657"/>
                                <stop offset="100%" stop-color="#091827"/>
                            </radialGradient>
                        </defs>
                        <rect width="400" height="290" fill="url(#ocean-glow)"/>
                        <rect width="400" height="290" fill="url(#chart-grid)"/>

                        <!-- Compass Rose -->
                        <g transform="translate(350, 42) scale(0.65)">
                            <circle r="28" fill="none" stroke="rgba(56, 217, 212, 0.4)" stroke-width="1.5"/>
                            <polygon points="0,-26 6,-8 0,0 -6,-8" fill="#e74c3c"/>
                            <polygon points="0,26 6,8 0,0 -6,8" fill="#ecf0f1"/>
                            <polygon points="26,0 8,6 0,0 8,-6" fill="#ecf0f1"/>
                            <polygon points="-26,0 -8,6 0,0 -8,-6" fill="#ecf0f1"/>
                            <text x="0" y="-30" fill="#e74c3c" font-size="11" font-weight="bold" text-anchor="middle">N</text>
                            <text x="0" y="38" fill="#38d9d4" font-size="9" text-anchor="middle">S</text>
                            <text x="36" y="3" fill="#38d9d4" font-size="9" text-anchor="middle">E</text>
                            <text x="-36" y="3" fill="#38d9d4" font-size="9" text-anchor="middle">W</text>
                        </g>

                        <!-- Landmark 1: Temple of Time & Sanctuary -->
                        <g class="map-landmark" transform="translate(200, 75)">
                            <rect x="-35" y="-28" width="70" height="42" rx="3" fill="#2d556e" stroke="#38d9d4" stroke-width="1.5"/>
                            <rect x="-8" y="14" width="16" height="20" fill="#5F3714" stroke="#DEB887" stroke-width="1"/>
                            <text x="0" y="-12" fill="#ffffff" font-size="8" font-weight="bold" text-anchor="middle">TEMPLE</text>
                            <text x="0" y="-2" fill="#38d9d4" font-size="7" text-anchor="middle">OF TIME</text>
                            <text x="0" y="28" fill="#DEB887" font-size="6" text-anchor="middle">Pier & Dock</text>
                        </g>

                        <!-- Maritime Navigation Channel -->
                        <line x1="200" y1="110" x2="200" y2="195" stroke="rgba(56, 217, 212, 0.35)" stroke-dasharray="4,4" stroke-width="1.5"/>

                        <!-- Landmark 2: Sea Gateway Beacon (Z = 95) -->
                        <g class="map-landmark" transform="translate(200, 195)">
                            <circle cx="-14" cy="0" r="3.5" fill="#38d9d4"/>
                            <circle cx="14" cy="0" r="3.5" fill="#38d9d4"/>
                            <line x1="-14" y1="0" x2="14" y2="0" stroke="#f1c40f" stroke-width="1.5"/>
                            <text x="0" y="-6" fill="#f1c40f" font-size="7" font-weight="bold" text-anchor="middle">SEA GATEWAY</text>
                        </g>

                        <!-- Landmark 3: Ocean Haven Atoll -->
                        <g class="map-landmark" transform="translate(200, 248)">
                            <polygon points="0,-18 24,-8 24,14 0,24 -24,14 -24,-8" fill="#1b4d3e" stroke="#38d9d4" stroke-width="1.5"/>
                            <circle cx="0" cy="0" r="6" fill="#f39c12"/>
                            <text x="0" y="-4" fill="#ffffff" font-size="8" font-weight="bold" text-anchor="middle">OCEAN</text>
                            <text x="0" y="5" fill="#38d9d4" font-size="7" text-anchor="middle">HAVEN</text>
                            <text x="0" y="31" fill="#a4e2db" font-size="6.5" text-anchor="middle">Atoll Marina & Farm</text>
                        </g>

                        <!-- Player Vessel Live Marker -->
                        <g transform="translate(${playerSvgX.toFixed(1)}, ${playerSvgY.toFixed(1)}) rotate(${headingDeg.toFixed(1)})">
                            <circle r="9" fill="rgba(56, 217, 212, 0.25)" stroke="#38d9d4" stroke-width="1"/>
                            <polygon points="0,-10 6,7 0,3 -6,7" fill="#00e5ff" stroke="#ffffff" stroke-width="1"/>
                        </g>
                    </svg>
                </div>
                <div class="map-telemetry-panel">
                    <div class="map-telemetry-row">
                        <span class="map-lbl">SECTOR:</span>
                        <span class="map-val highlight">${currentRoom.toUpperCase().replace('_', ' ')}</span>
                    </div>
                    <div class="map-telemetry-row">
                        <span class="map-lbl">LATITUDE (Y):</span>
                        <span class="map-val">${latDeg}° ${latMin}' ${latDir} [${globalZ.toFixed(0)}]</span>
                    </div>
                    <div class="map-telemetry-row">
                        <span class="map-lbl">LONGITUDE (X):</span>
                        <span class="map-val">${lonDeg}° ${lonMin}' ${lonDir} [${globalX.toFixed(0)}]</span>
                    </div>
                    <div class="map-telemetry-row">
                        <span class="map-lbl">HEADING:</span>
                        <span class="map-val">${deg.toString().padStart(3, '0')}° ${compassDir}</span>
                    </div>
                    <div class="map-telemetry-row">
                        <span class="map-lbl">SPEED:</span>
                        <span class="map-val">${speedKts} KTS ${isBoating ? '(BOATING)' : ''}</span>
                    </div>
                </div>
            </div>
        `;
    }

    renderMenuPixelHeaders() {
        if (!window.PixelFont) return;
        const pf = window.PixelFont;
        document.querySelectorAll('.gba-title').forEach(el => {
            if (!el.dataset.rawText) el.dataset.rawText = el.textContent.trim();
            el.innerHTML = pf.render(el.dataset.rawText.toUpperCase());
        });
        document.querySelectorAll('.tab-hint').forEach(el => {
            if (!el.dataset.rawText) el.dataset.rawText = el.textContent.trim();
            el.innerHTML = pf.render(el.dataset.rawText.toUpperCase());
        });
    }
}
window.DebugMenu = DebugMenu;
