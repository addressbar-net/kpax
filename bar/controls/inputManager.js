// Input Listener & Polling Controller (Decoupled & Phase-Driven)

class InputController {
    constructor() {
        this.keys = {};
        this.isRunToggled = true;
        this.aLatched = false;
        this.tabLatched = false;
        this.menuToggleLatched = false;

        this.slot1Latched = false;
        this.slot2Latched = false;
        this.slot3Latched = false;
        this.telescopeToggleLatched = false;
        this.lyreLatched = false;
        this.hotbarSupply1Latched = false;
        this.hotbarSupply2Latched = false;
        this.hotbarSupply3Latched = false;

        this.menuSlot1Latched = false;
        this.menuSlot2Latched = false;
        this.menuSlot3Latched = false;
        this.menuNavTabLatched = false;
        this.optNavVertLatched = false;
        this.optAdjustHorizLatched = false;
        this.rotateCCWLatched = false;
        this.rotateCWLatched = false;

        this.navRepeatTimer = 0.0;
        this.navDelayDuration = 0.22;
        this.navInputActive = false;

        this.selectRepeatTimer = 0.0;
        this.selectActive = false;

        this.initListeners();
        this.bindEventBus();
    }

    bindEventBus() {
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.on('engine:input', ({ dt }) => {
                const gs = window.GameState;
                const hasSprintSpeed = gs ? (gs.hasSprintBoost ? gs.hasSprintBoost() : gs.hasMedallion('sprint_speed')) : true;
                const inputData = this.pollInput(hasSprintSpeed);

                if (gs) {
                    gs.lastInputData = inputData;
                }

                this.processMenuAndActionInputs(dt, inputData);
            });
        }
    }

    initListeners() {
        // Intercept Tab globally so it NEVER changes focus to another HTML element
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' || e.code === 'Tab') {
                e.preventDefault();
            }
        }, true);

        window.addEventListener('keyup', (e) => {
            if (e.key === 'Tab' || e.code === 'Tab') {
                e.preventDefault();
            }
        }, true);

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' || e.code === 'Tab') {
                e.preventDefault();
            }

            const isTextMsgToolOpen = Boolean((window.ChatUI && window.ChatUI.isTextMessageToolOpen) || window.isTextMessageToolOpen);
            if (isTextMsgToolOpen) {
                return;
            }

            const isTyping = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
            if (isTyping) {
                if (e.key === 'Escape' && e.target.id !== 'text-msg-tool-input') {
                    e.target.blur();
                    const canvas = document.getElementById('glCanvas');
                    if (canvas) canvas.focus();
                }
                return;
            }

            if (e.key === 'Enter') {
                const phoneOpen = window.ChatUI ? window.ChatUI.isPhoneOpen : false;
                if (!phoneOpen) {
                    const gs = window.GameState;
                    const isMenuOpen = gs ? (gs.isItemMenuOpen || gs.isDebugMenuOpen || gs.isEquipmentMenuOpen || gs.isMedallionsMenuOpen || gs.isEquippablesMenuOpen || gs.isConsumablesMenuOpen || gs.isAccessoriesMenuOpen || gs.isRoomsMenuOpen || gs.isMapMenuOpen || window.isCellPhoneOpen || window.isRadioMenuOpen || window.isRoomsMenuOpen || window.isMapMenuOpen) : false;
                    if (!isMenuOpen && typeof window.toggleCellPhone === 'function') {
                        e.preventDefault();
                        window.toggleCellPhone(true);
                        return;
                    }
                }
            }

            if (e.code === 'Space') e.preventDefault();
            this.keys[e.key.toLowerCase()] = true;
            this.keys[e.code.toLowerCase()] = true;
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'Tab' || e.code === 'Tab') {
                e.preventDefault();
            }

            const k = e.key.toLowerCase();
            const code = e.code.toLowerCase();
            this.keys[k] = false;
            this.keys[code] = false;

            const isTyping = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
            if (isTyping) return;

            if (k === 'e' || k === 'd') this.optNavVertLatched = false;
            if (k === 's' || k === 'f') {
                this.menuNavTabLatched = false;
                this.optAdjustHorizLatched = false;
            }
            if (k === 'u' || code === 'keyu') this.rotateCCWLatched = false;
            if (k === 'o' || code === 'keyo') this.rotateCWLatched = false;
        });

        window.addEventListener('blur', () => {
            this.keys = {};
            this.rotateCCWLatched = false;
            this.rotateCWLatched = false;
            this.tabLatched = false;
        });
    }

    isBtnPressed(btn) {
        if (!btn) return false;
        if (typeof btn === 'object') return btn.pressed || btn.value > 0.5;
        return btn === 1.0;
    }

    handleTabAction() {
        const gs = window.GameState;
        const chatUI = window.ChatUI;
        const isTextMsgToolOpen = Boolean((chatUI && chatUI.isTextMessageToolOpen) || window.isTextMessageToolOpen);
        if (isTextMsgToolOpen) {
            if (chatUI && typeof chatUI.closeTextMessageTool === 'function') {
                chatUI.closeTextMessageTool();
            }
            return;
        }

        const isChatOpen = Boolean((chatUI && chatUI.isPhoneOpen) || window.isCellPhoneOpen);

        // 1. If Chat is open: Tab toggles the chat submenu (additional options)
        if (isChatOpen) {
            if (chatUI && typeof chatUI.toggleTabSubmenu === 'function') {
                chatUI.toggleTabSubmenu();
            }
            return;
        }

        // 2. Submenus: Tab closes the open submenu
        const dMenu = (typeof window !== 'undefined' && window.debugMenu) ? window.debugMenu : (typeof debugMenu !== 'undefined' ? debugMenu : null);
        if (dMenu) {
            const isDebug = gs ? gs.isDebugMenuOpen : window.isDebugMenuOpen;
            if (isDebug) {
                dMenu.closeDebugMenu();
                return;
            }

            const isEquippables = gs ? gs.isEquippablesMenuOpen : window.isEquippablesMenuOpen;
            if (isEquippables) {
                if (dMenu.assignmentPhase) {
                    dMenu.assignmentPhase = false;
                    dMenu.renderEquippablesMenu();
                } else {
                    dMenu.closeEquippablesMenu();
                }
                return;
            }

            const isConsumables = gs ? gs.isConsumablesMenuOpen : window.isConsumablesMenuOpen;
            if (isConsumables) {
                if (dMenu.assignmentPhase) {
                    dMenu.assignmentPhase = false;
                    dMenu.renderConsumablesMenu();
                } else {
                    dMenu.closeConsumablesMenu();
                }
                return;
            }

            const isAccessories = gs ? gs.isAccessoriesMenuOpen : window.isAccessoriesMenuOpen;
            if (isAccessories) {
                dMenu.closeAccessoriesMenu();
                return;
            }

            const isRooms = gs ? gs.isRoomsMenuOpen : window.isRoomsMenuOpen;
            if (isRooms) {
                dMenu.closeRoomsMenu();
                return;
            }

            const isMap = gs ? gs.isMapMenuOpen : window.isMapMenuOpen;
            if (isMap) {
                dMenu.closeMapMenu();
                return;
            }

            const isEquipment = gs ? gs.isEquipmentMenuOpen : window.isEquipmentMenuOpen;
            if (isEquipment) {
                dMenu.closeEquipmentMenu();
                return;
            }

            const isMedallions = gs ? gs.isMedallionsMenuOpen : window.isMedallionsMenuOpen;
            if (isMedallions) {
                dMenu.closeMedallionsMenu();
                return;
            }

            if (window.isRadioMenuOpen) {
                dMenu.closeRadioMenu();
                return;
            }

            const isItemMenu = gs ? gs.isItemMenuOpen : window.isItemMenuOpen;
            if (isItemMenu) {
                if (dMenu.isDescModalOpen) {
                    dMenu.closeDescriptionModal();
                } else {
                    if (gs) gs.isItemMenuOpen = false;
                    window.isItemMenuOpen = false;
                    if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
                    if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
                }
                return;
            }
        } else {
            const isItemMenu = gs ? gs.isItemMenuOpen : window.isItemMenuOpen;
            if (isItemMenu) {
                if (gs) gs.isItemMenuOpen = false;
                window.isItemMenuOpen = false;
                if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
                if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
                return;
            }
        }

        // 3. No menu open: Tab opens the Main Menu
        if (gs) gs.isItemMenuOpen = true;
        window.isItemMenuOpen = true;
        if (typeof debugMenu !== 'undefined' && debugMenu.renderItemGrid) {
            debugMenu.renderItemGrid();
        }
        if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
    }

    pollInput(hasSprintBoost) {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let activeGp = null;
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i] && gamepads[i].connected) { activeGp = gamepads[i]; break; }
        }

        // PS5 Options Button is button 9 in standard Gamepad API mapping
        const isOptionsBtn = activeGp ? this.isBtnPressed(activeGp.buttons[9]) : false;
        const isTabKey = this.keys['tab'] || false;
        const rawTab = isTabKey || isOptionsBtn;

        const isTyping = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.isContentEditable);
        if (isTyping) {
            return {
                inputX: 0, inputZ: 0, moveSpeed: 0,
                isBatHeld: false, isTelescopeHeld: false, isLyrePressed: false,
                rawTab, rawTriangleSlot2: false, rawSelectPressed: false,
                rawSquareSlot1: false, rawCircleSlot3: false,
                navVertDir: 0, navHorizDir: 0,
                camRotateCCW: false, camRotateCW: false
            };
        }

        let inputX = 0, inputZ = 0, moveSpeed = 0;
        let isBatHeld = false, isTelescopeHeld = false, isLyrePressed = false;
        let tiltTier = 'none';

        let rawTriangleSlot2 = this.keys['i'] || this.keys['2'] || false;
        let rawSelectPressed = this.keys['k'] || false;
        let rawSquareSlot1 = this.keys['j'] || this.keys['1'] || false;
        let rawCircleSlot3 = this.keys['l'] || this.keys['3'] || false;

        let navVertDir = 0, navHorizDir = 0;
        // Sprint Speed medallion is always active (+50% movement speed)
        const speedMultiplier = hasSprintBoost ? 1.5 : 1.0;

        const gs = window.GameState;
        const isChatOpen = Boolean((window.ChatUI && (window.ChatUI.isPhoneOpen || window.ChatUI.isTextMessageToolOpen)) || window.isCellPhoneOpen || window.isTextMessageToolOpen);
        const isMenuOpen = gs ? (gs.isItemMenuOpen || gs.isDebugMenuOpen || gs.isEquipmentMenuOpen || gs.isMedallionsMenuOpen || gs.isEquippablesMenuOpen || gs.isConsumablesMenuOpen || gs.isAccessoriesMenuOpen || gs.isRoomsMenuOpen || gs.isMapMenuOpen || isChatOpen || window.isRadioMenuOpen || window.isRoomsMenuOpen || window.isMapMenuOpen) : (window.isItemMenuOpen || window.isDebugMenuOpen || window.isEquipmentMenuOpen || window.isMedallionsMenuOpen || window.isEquippablesMenuOpen || window.isConsumablesMenuOpen || window.isAccessoriesMenuOpen || window.isRoomsMenuOpen || window.isMapMenuOpen || isChatOpen || window.isRadioMenuOpen);
        const isCutsceneActive = Boolean(gs && gs.isCutsceneActive);
        const zoomState = gs ? gs.zoomSequenceState : 'IDLE';

        let rawRotateCCW = false;
        let rawRotateCW = false;
        // Z-Targeting: Shift/Z key on keyboard, or L2 trigger (button 6) on controller. L1 (button 4) is dedicated to camera CCW rotation.
        const isZTargetHeld = this.keys['shift'] || this.keys['z'] || (activeGp ? this.isBtnPressed(activeGp.buttons[6]) : false);

        if (!isMenuOpen && !isCutsceneActive) {
            let kbX = 0, kbZ = 0;
            // Movement Controls: ESDF and Arrow keys (E: forward, D: backward, S: left, F: right)
            // 'a' is reserved exclusively for Walk/Run toggle
            if (this.keys['e'] || this.keys['arrowup']) kbZ -= 1;
            if (this.keys['d'] || this.keys['arrowdown']) kbZ += 1;
            if (this.keys['s'] || this.keys['arrowleft']) kbX -= 1;
            if (this.keys['f'] || this.keys['arrowright']) kbX += 1;

            if (kbX !== 0 || kbZ !== 0) {
                const len = Math.hypot(kbX, kbZ);
                inputX = kbX / len;
                inputZ = kbZ / len;
                // Keyboard walk/run toggle: Full tilt sprint (5.2) vs Slight/Medium tilt walk (2.2)
                const baseSpeed = this.isRunToggled ? 5.2 : 2.2;
                tiltTier = this.isRunToggled ? 'full' : 'slight';
                moveSpeed = baseSpeed * speedMultiplier;
            }

            // Keyboard Camera Rotation Controls: U (CCW) / O (CW)
            if (this.keys['u'] || this.keys['keyu']) rawRotateCCW = true;
            if (this.keys['o'] || this.keys['keyo']) rawRotateCW = true;
        }

        if (activeGp) {
            const lx = activeGp.axes[0] || 0;
            const ly = activeGp.axes[1] || 0;
            const lMag = Math.hypot(lx, ly);

            if (lMag >= 0.15) {
                if (!isMenuOpen) {
                    // 160 divisions for the joystick (~2 degrees each: 360° / 160 = 2.25°)
                    // (180 divisions would be exactly 360° / 180 = 2.00°)
                    const JOYSTICK_DIVISIONS = 160;
                    const angleStep = (2.0 * Math.PI) / JOYSTICK_DIVISIONS;
                    const rawAngle = Math.atan2(ly, lx);
                    const quantizedAngle = Math.round(rawAngle / angleStep) * angleStep;

                    inputX = Math.round(Math.cos(quantizedAngle) * 10000) / 10000;
                    inputZ = Math.round(Math.sin(quantizedAngle) * 10000) / 10000;

                    // Ocarina of Time analog stick tilt tiers:
                    // 1. Slight tilt (lMag: 0.15 to 0.45): Slow deliberate creep / walk
                    // 2. Medium tilt (lMag: 0.45 to 0.75): Steady jog
                    // 3. Full tilt (lMag: >= 0.75): Full athletic sprint
                    let baseSpeed = 5.2;
                    if (lMag < 0.45) {
                        tiltTier = 'slight';
                        baseSpeed = 1.8;
                    } else if (lMag < 0.75) {
                        tiltTier = 'medium';
                        baseSpeed = 3.4;
                    } else {
                        tiltTier = 'full';
                        baseSpeed = 5.2;
                    }
                    moveSpeed = baseSpeed * speedMultiplier;
                }
                if (ly <= -0.5) navVertDir = -1;
                if (ly >= 0.5) navVertDir = 1;
                if (lx <= -0.5) navHorizDir = -1;
                if (lx >= 0.5) navHorizDir = 1;
            }

            if (this.isBtnPressed(activeGp.buttons[3])) rawTriangleSlot2 = true;
            if (this.isBtnPressed(activeGp.buttons[2])) rawSquareSlot1 = true;
            if (this.isBtnPressed(activeGp.buttons[1])) rawCircleSlot3 = true;
            if (this.isBtnPressed(activeGp.buttons[0])) rawSelectPressed = true;

            // Controller L1 / R1 (Overworld camera rotation only)
            if (this.isBtnPressed(activeGp.buttons[4])) {
                if (!isMenuOpen) rawRotateCCW = true;
            }
            if (this.isBtnPressed(activeGp.buttons[5])) {
                if (!isMenuOpen) rawRotateCW = true;
            }
        }

        // Latching logic: must be pressed and released before it can be pressed and counted again
        let camRotateCCW = false;
        let camRotateCW = false;

        if (rawRotateCCW) {
            if (!this.rotateCCWLatched) {
                this.rotateCCWLatched = true;
                camRotateCCW = true;
            }
        } else {
            this.rotateCCWLatched = false;
        }

        if (rawRotateCW) {
            if (!this.rotateCWLatched) {
                this.rotateCWLatched = true;
                camRotateCW = true;
            }
        } else {
            this.rotateCWLatched = false;
        }

        if (isMenuOpen) {
            if (this.keys['e'] || this.keys['arrowup']) navVertDir = -1;
            if (this.keys['d'] || this.keys['arrowdown']) navVertDir = 1;
            if (this.keys['s'] || this.keys['arrowleft']) navHorizDir = -1;
            if (this.keys['f'] || this.keys['arrowright']) navHorizDir = 1;
            if (this.keys['enter'] || this.keys[' ']) rawSelectPressed = true;
        }

        // Equipment Checks - ONLY active when NO menu is open
        if (!isMenuOpen && gs && gs.hotbar) {
            if (rawSquareSlot1 && gs.hotbar.slot1) {
                if (gs.hotbar.slot1.id === 'bat') isBatHeld = true;
                if (gs.hotbar.slot1.id === 'telescope') isTelescopeHeld = true;
                if (gs.hotbar.slot1.id === 'lyre') isLyrePressed = true;
            }
            if (rawTriangleSlot2 && gs.hotbar.slot2) {
                if (gs.hotbar.slot2.id === 'bat') isBatHeld = true;
                if (gs.hotbar.slot2.id === 'telescope') isTelescopeHeld = true;
                if (gs.hotbar.slot2.id === 'lyre') isLyrePressed = true;
            }
            if (rawCircleSlot3 && gs.hotbar.slot3) {
                if (gs.hotbar.slot3.id === 'bat') isBatHeld = true;
                if (gs.hotbar.slot3.id === 'telescope') isTelescopeHeld = true;
                if (gs.hotbar.slot3.id === 'lyre') isLyrePressed = true;
            }
        }

        return {
            inputX, inputZ, moveSpeed, speedMultiplier, tiltTier,
            isBatHeld, isTelescopeHeld, isLyrePressed,
            rawTab, rawTriangleSlot2, rawSelectPressed, rawSquareSlot1, rawCircleSlot3,
            navVertDir, navHorizDir, isRunToggled: this.isRunToggled,
            camRotateCCW, camRotateCW, isZTargetHeld
        };
    }

    processMenuAndActionInputs(dt, inputData) {
        const { rawTab, rawSquareSlot1, rawTriangleSlot2, rawCircleSlot3, rawSelectPressed, navHorizDir, navVertDir, isTelescopeHeld, isBatHeld, isLyrePressed, moveSpeed } = inputData;
        const gs = window.GameState;

        // 1. Tab Action (Tab key / PS5 Options button)
        // Tab opens/closes Main Menu, closes submenus, or toggles additional options in Chat
        if (rawTab) {
            if (!this.tabLatched) {
                this.tabLatched = true;
                this.handleTabAction();
            }
        } else {
            this.tabLatched = false;
        }

        // Unlatch hotbar slot assignment buttons whenever the buttons are not held
        if (!rawSquareSlot1) this.hotbarSupply1Latched = false;
        if (!rawTriangleSlot2) this.hotbarSupply2Latched = false;
        if (!rawCircleSlot3) this.hotbarSupply3Latched = false;

        const isItemMenu = gs ? gs.isItemMenuOpen : window.isItemMenuOpen;
        const isDebugMenu = gs ? gs.isDebugMenuOpen : window.isDebugMenuOpen;
        const isEquipmentMenu = gs ? gs.isEquipmentMenuOpen : window.isEquipmentMenuOpen;
        const isMedallionsMenu = gs ? gs.isMedallionsMenuOpen : window.isMedallionsMenuOpen;
        const isEquippablesMenu = gs ? gs.isEquippablesMenuOpen : window.isEquippablesMenuOpen;
        const isConsumablesMenu = gs ? gs.isConsumablesMenuOpen : window.isConsumablesMenuOpen;
        const isAccessoriesMenu = gs ? gs.isAccessoriesMenuOpen : window.isAccessoriesMenuOpen;
        const isRoomsMenu = gs ? gs.isRoomsMenuOpen : window.isRoomsMenuOpen;
        const isMapMenu = gs ? gs.isMapMenuOpen : window.isMapMenuOpen;

        // 2. Settings (Debug) Menu Navigation
        if (isDebugMenu && typeof debugMenu !== 'undefined' && debugMenu) {

            let tabDir = 0;
            if (!debugMenu.isOptionEditing) {
                if (this.keys['s'] || this.keys['arrowleft'] || navHorizDir < 0) tabDir = -1;
                if (this.keys['f'] || this.keys['arrowright'] || navHorizDir > 0) tabDir = 1;
            }

            if (tabDir !== 0) {
                if (!this.menuNavTabLatched) {
                    const activeTab = window.activeDebugTab || 0;
                    window.switchDebugTab(activeTab + tabDir);
                    this.menuNavTabLatched = true;
                    if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
                }
            } else {
                this.menuNavTabLatched = false;
            }

            let optVertDir = 0;
            if (!debugMenu.isOptionEditing) {
                if (this.keys['e'] || this.keys['arrowup'] || navVertDir < 0) optVertDir = -1;
                if (this.keys['d'] || this.keys['arrowdown'] || navVertDir > 0) optVertDir = 1;
            }

            if (optVertDir !== 0) {
                if (!this.optNavVertLatched) {
                    const activeTab = window.activeDebugTab || 0;
                    let maxOpts = 0;
                    if (activeTab === 1) maxOpts = 2;

                    if (maxOpts > 0) debugMenu.navigateOptions(optVertDir, maxOpts, activeTab);
                    else if (activeTab === 0) document.getElementById('tab-0-pane').scrollTop += optVertDir * 16;
                    else if (activeTab === 2) document.getElementById('execution-log').scrollTop += optVertDir * 16;
                    else if (activeTab === 3) document.getElementById('game-variables-container').scrollTop += optVertDir * 16;
                    this.optNavVertLatched = true;
                }
            } else {
                this.optNavVertLatched = false;
            }

            let adjStep = 0;
            if (debugMenu.isOptionEditing) {
                if (this.keys['s'] || this.keys['arrowleft'] || navHorizDir < 0) adjStep = -0.1;
                if (this.keys['f'] || this.keys['arrowright'] || navHorizDir > 0) adjStep = 0.1;
            }

            if (adjStep !== 0) {
                if (!this.optAdjustHorizLatched) {
                    if (window.activeDebugTab === 1) debugMenu.adjustOptionValue(adjStep);
                    this.optAdjustHorizLatched = true;
                }
            } else {
                this.optAdjustHorizLatched = false;
            }

            if (rawSelectPressed) {
                if (!this.selectActive) {
                    const activeTab = window.activeDebugTab || 0;
                    if (activeTab === 1) debugMenu.toggleOptionSelection(1);
                    this.selectActive = true;
                    this.selectRepeatTimer = this.navDelayDuration;
                } else {
                    this.selectRepeatTimer -= dt;
                    if (this.selectRepeatTimer <= 0) this.selectRepeatTimer = this.navDelayDuration;
                }
            } else {
                this.selectActive = false;
                this.selectRepeatTimer = 0.0;
            }

            // Return to Main Menu on Escape / Backspace (NOT I / Triangle)
            if (this.keys['escape'] || this.keys['backspace']) {
                if (!this.slot2Latched) {
                    if (gs) { gs.isDebugMenuOpen = false; gs.isItemMenuOpen = true; }
                    window.isDebugMenuOpen = false;
                    window.isItemMenuOpen = true;
                    debugMenu.isOptionEditing = false;
                    this.slot2Latched = true;
                    if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
                    if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
                }
            } else {
                this.slot2Latched = false;
            }

        // 3. Medallions Menu Navigation (Cycle 6 Medallions clockwise / counter-clockwise)
        } else if (isMedallionsMenu && typeof debugMenu !== 'undefined' && debugMenu) {
            let dir = 0;
            if (this.keys['s'] || this.keys['arrowleft'] || navHorizDir < 0 || this.keys['d'] || this.keys['arrowdown'] || navVertDir > 0) dir = -1;
            if (this.keys['f'] || this.keys['arrowright'] || navHorizDir > 0 || this.keys['e'] || this.keys['arrowup'] || navVertDir < 0) dir = 1;

            if (dir !== 0) {
                if (!this.navInputActive) {
                    debugMenu.navigateMedallions(dir);
                    this.navInputActive = true;
                    this.navRepeatTimer = this.navDelayDuration;
                } else {
                    this.navRepeatTimer -= dt;
                    if (this.navRepeatTimer <= 0) {
                        debugMenu.navigateMedallions(dir);
                        this.navRepeatTimer = this.navDelayDuration;
                    }
                }
            } else {
                this.navInputActive = false;
                this.navRepeatTimer = 0.0;
            }

            // Return to Main Menu on Escape / Backspace (NOT I / Triangle)
            if (this.keys['escape'] || this.keys['backspace']) {
                if (!this.slot2Latched) {
                    debugMenu.closeMedallionsMenu();
                    this.slot2Latched = true;
                }
            } else {
                this.slot2Latched = false;
            }

        // 4. Worn Equipment Menu Navigation (Clothes: Cap, Shirt, Pants)
        } else if (isEquipmentMenu && typeof debugMenu !== 'undefined' && debugMenu) {
            let dir = 0;
            if (this.keys['s'] || this.keys['arrowleft'] || navHorizDir < 0 || this.keys['e'] || this.keys['arrowup'] || navVertDir < 0) dir = -1;
            if (this.keys['f'] || this.keys['arrowright'] || navHorizDir > 0 || this.keys['d'] || this.keys['arrowdown'] || navVertDir > 0) dir = 1;

            if (dir !== 0) {
                if (!this.navInputActive) {
                    debugMenu.navigateEquipmentMenu(dir);
                    this.navInputActive = true;
                    this.navRepeatTimer = this.navDelayDuration;
                } else {
                    this.navRepeatTimer -= dt;
                    if (this.navRepeatTimer <= 0) {
                        debugMenu.navigateEquipmentMenu(dir);
                        this.navRepeatTimer = this.navDelayDuration;
                    }
                }
            } else {
                this.navInputActive = false;
                this.navRepeatTimer = 0.0;
            }

            // Return to Main Menu on Escape / Backspace (NOT I / Triangle)
            if (this.keys['escape'] || this.keys['backspace']) {
                if (!this.slot2Latched) {
                    debugMenu.closeEquipmentMenu();
                    this.slot2Latched = true;
                }
            } else {
                this.slot2Latched = false;
            }

        // 5. Equippable Items Menu Navigation (Tools & Relics)
        } else if (isEquippablesMenu && typeof debugMenu !== 'undefined' && debugMenu) {
            if (navVertDir !== 0 || navHorizDir !== 0) {
                if (!this.navInputActive) {
                    debugMenu.navigateEquippablesGrid(navHorizDir, navVertDir);
                    this.navInputActive = true;
                    this.navRepeatTimer = this.navDelayDuration;
                } else {
                    this.navRepeatTimer -= dt;
                    if (this.navRepeatTimer <= 0) {
                        debugMenu.navigateEquippablesGrid(navHorizDir, navVertDir);
                        this.navRepeatTimer = this.navDelayDuration;
                    }
                }
            } else {
                this.navInputActive = false;
                this.navRepeatTimer = 0.0;
            }

            // L Button / Circle / 3: Toggle assignment phase or assign to L / Slot 3
            if (rawCircleSlot3 || this.keys['3'] || this.keys['l'] || this.keys['L']) {
                if (!this.menuSlot3Latched) {
                    if (!debugMenu.assignmentPhase) {
                        debugMenu.assignmentPhase = true;
                        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'assign');
                        debugMenu.renderEquippablesMenu();
                    } else {
                        debugMenu.assignSelectedEquippable('slot3');
                    }
                    this.menuSlot3Latched = true;
                }
            } else {
                this.menuSlot3Latched = false;
            }

            // J Button / Square / 1: Assign to J / Slot 1 if assignment phase active
            if (rawSquareSlot1 || this.keys['1'] || this.keys['j'] || this.keys['J']) {
                if (!this.menuSlot1Latched) {
                    if (debugMenu.assignmentPhase) {
                        debugMenu.assignSelectedEquippable('slot1');
                    }
                    this.menuSlot1Latched = true;
                }
            } else {
                this.menuSlot1Latched = false;
            }

            // I Button / Triangle / 2: Assign to I / Slot 2 ONLY if assignment phase active (does NOT close menu)
            if (rawTriangleSlot2 || this.keys['2'] || this.keys['i'] || this.keys['I']) {
                if (!this.menuSlot2Latched) {
                    if (debugMenu.assignmentPhase) {
                        debugMenu.assignSelectedEquippable('slot2');
                    }
                    this.menuSlot2Latched = true;
                }
            } else {
                this.menuSlot2Latched = false;
            }

            // K Button / Cross / Enter: Cancel assignment phase if active, else directly use tool
            if (rawSelectPressed || this.keys['enter'] || this.keys['k'] || this.keys['K']) {
                if (!this.selectActive) {
                    if (debugMenu.assignmentPhase) {
                        debugMenu.assignmentPhase = false;
                        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
                        debugMenu.renderEquippablesMenu();
                    } else {
                        debugMenu.useSelectedEquippable();
                    }
                    this.selectActive = true;
                }
            } else {
                this.selectActive = false;
            }

            // Escape / Backspace: Return to Main Menu (NOT B)
            if (this.keys['escape'] || this.keys['backspace']) {
                if (!this.slot2Latched) {
                    if (debugMenu.assignmentPhase) {
                        debugMenu.assignmentPhase = false;
                        debugMenu.renderEquippablesMenu();
                    } else {
                        debugMenu.closeEquippablesMenu();
                    }
                    this.slot2Latched = true;
                }
            } else {
                this.slot2Latched = false;
            }

        // 6. Consumable Items Menu Navigation (Supplies - 20 Max / 20 Stacks = 420 Total)
        } else if (isConsumablesMenu && typeof debugMenu !== 'undefined' && debugMenu) {
            if (navVertDir !== 0 || navHorizDir !== 0) {
                if (!this.navInputActive) {
                    debugMenu.navigateConsumablesGrid(navHorizDir, navVertDir);
                    this.navInputActive = true;
                    this.navRepeatTimer = this.navDelayDuration;
                } else {
                    this.navRepeatTimer -= dt;
                    if (this.navRepeatTimer <= 0) {
                        debugMenu.navigateConsumablesGrid(navHorizDir, navVertDir);
                        this.navRepeatTimer = this.navDelayDuration;
                    }
                }
            } else {
                this.navInputActive = false;
                this.navRepeatTimer = 0.0;
            }

            // L Button / Circle / 3: Toggle assignment phase or assign to L / Slot 3
            if (rawCircleSlot3 || this.keys['3'] || this.keys['l'] || this.keys['L']) {
                if (!this.menuSlot3Latched) {
                    if (!debugMenu.assignmentPhase) {
                        debugMenu.assignmentPhase = true;
                        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'assign');
                        debugMenu.renderConsumablesMenu();
                    } else {
                        debugMenu.assignSelectedSupply('slot3');
                    }
                    this.menuSlot3Latched = true;
                }
            } else {
                this.menuSlot3Latched = false;
            }

            // J Button / Square / 1: Assign to J / Slot 1 if assignment phase active
            if (rawSquareSlot1 || this.keys['1'] || this.keys['j'] || this.keys['J']) {
                if (!this.menuSlot1Latched) {
                    if (debugMenu.assignmentPhase) {
                        debugMenu.assignSelectedSupply('slot1');
                    }
                    this.menuSlot1Latched = true;
                }
            } else {
                this.menuSlot1Latched = false;
            }

            // I Button / Triangle / 2: Assign to I / Slot 2 ONLY if assignment phase active (does NOT close menu)
            if (rawTriangleSlot2 || this.keys['2'] || this.keys['i'] || this.keys['I']) {
                if (!this.menuSlot2Latched) {
                    if (debugMenu.assignmentPhase) {
                        debugMenu.assignSelectedSupply('slot2');
                    }
                    this.menuSlot2Latched = true;
                }
            } else {
                this.menuSlot2Latched = false;
            }

            // K Button / Cross / Enter: Cancel assignment phase if active, else directly use consumable
            if (rawSelectPressed || this.keys['enter'] || this.keys['k'] || this.keys['K']) {
                if (!this.selectActive) {
                    if (debugMenu.assignmentPhase) {
                        debugMenu.assignmentPhase = false;
                        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
                        debugMenu.renderConsumablesMenu();
                    } else {
                        debugMenu.useSelectedConsumable();
                    }
                    this.selectActive = true;
                }
            } else {
                this.selectActive = false;
            }

            // Plus (=) key: Test Obtain +1 consumable item
            if (this.keys['+'] || this.keys['=']) {
                if (!this.obtain1Latched) {
                    debugMenu.obtainSelectedConsumable(1);
                    this.obtain1Latched = true;
                }
            } else {
                this.obtain1Latched = false;
            }

            // C key: Prompt custom amount of items to add
            if (this.keys['c'] || this.keys['C']) {
                if (!this.customAmountLatched) {
                    debugMenu.promptCustomAmount(debugMenu.selectedConsumableIndex);
                    this.customAmountLatched = true;
                }
            } else {
                this.customAmountLatched = false;
            }

            // Escape / Backspace: Return to Main Menu (NOT B)
            if (this.keys['escape'] || this.keys['backspace']) {
                if (!this.slot2Latched) {
                    if (debugMenu.assignmentPhase) {
                        debugMenu.assignmentPhase = false;
                        debugMenu.renderConsumablesMenu();
                    } else {
                        debugMenu.closeConsumablesMenu();
                    }
                    this.slot2Latched = true;
                }
            } else {
                this.slot2Latched = false;
            }

        // Accessories Menu Navigation (Passive Relics & Charms)
        } else if (isAccessoriesMenu && typeof debugMenu !== 'undefined' && debugMenu) {
            if (navVertDir !== 0 || navHorizDir !== 0) {
                if (!this.navInputActive) {
                    debugMenu.navigateAccessoriesGrid(navHorizDir, navVertDir);
                    this.navInputActive = true;
                    this.navRepeatTimer = this.navDelayDuration;
                } else {
                    this.navRepeatTimer -= dt;
                    if (this.navRepeatTimer <= 0) {
                        debugMenu.navigateAccessoriesGrid(navHorizDir, navVertDir);
                        this.navRepeatTimer = this.navDelayDuration;
                    }
                }
            } else {
                this.navInputActive = false;
                this.navRepeatTimer = 0.0;
            }

            // K Button / Cross / Enter: Equip or unequip accessory
            // "Equip or unequip an accessory by pressing K when the menu cursor is over it."
            if (rawSelectPressed || this.keys['enter'] || this.keys['k'] || this.keys['K']) {
                if (!this.selectActive) {
                    debugMenu.toggleEquipSelectedAccessory();
                    this.selectActive = true;
                    this.selectRepeatTimer = this.navDelayDuration;
                } else {
                    this.selectRepeatTimer -= dt;
                    if (this.selectRepeatTimer <= 0) this.selectRepeatTimer = this.navDelayDuration;
                }
            } else {
                this.selectActive = false;
                this.selectRepeatTimer = 0.0;
            }

            // Escape / Backspace: Return to Main Menu
            if (this.keys['escape'] || this.keys['backspace']) {
                if (!this.slot2Latched) {
                    debugMenu.closeAccessoriesMenu();
                    this.slot2Latched = true;
                }
            } else {
                this.slot2Latched = false;
            }

        // 7. Room Selection Menu Navigation
        } else if (isRoomsMenu && typeof debugMenu !== 'undefined' && debugMenu) {
            if (navVertDir !== 0 || navHorizDir !== 0) {
                if (!this.navInputActive) {
                    debugMenu.navigateRoomsGrid(navHorizDir, navVertDir);
                    this.navInputActive = true;
                    this.navRepeatTimer = this.navDelayDuration;
                } else {
                    this.navRepeatTimer -= dt;
                    if (this.navRepeatTimer <= 0) {
                        debugMenu.navigateRoomsGrid(navHorizDir, navVertDir);
                        this.navRepeatTimer = this.navDelayDuration;
                    }
                }
            } else {
                this.navInputActive = false;
                this.navRepeatTimer = 0.0;
            }

            // K Button / Cross / Enter: Warp to selected room
            if (rawSelectPressed || this.keys['enter'] || this.keys['k'] || this.keys['K']) {
                if (!this.selectActive) {
                    debugMenu.warpToSelectedRoom();
                    this.selectActive = true;
                    this.selectRepeatTimer = this.navDelayDuration;
                } else {
                    this.selectRepeatTimer -= dt;
                    if (this.selectRepeatTimer <= 0) this.selectRepeatTimer = this.navDelayDuration;
                }
            } else {
                this.selectActive = false;
                this.selectRepeatTimer = 0.0;
            }

            // Escape / Backspace: Return to Main Menu
            if (this.keys['escape'] || this.keys['backspace']) {
                if (!this.slot2Latched) {
                    debugMenu.closeRoomsMenu();
                    this.slot2Latched = true;
                }
            } else {
                this.slot2Latched = false;
            }

        // 7. Cell Phone Menu Navigation (PokéNav Link & Room Chat)
        } else if (window.isCellPhoneOpen && typeof debugMenu !== 'undefined' && debugMenu) {
            // Keep hotbar latches reset while cell phone is open
            this.hotbarSupply1Latched = false;
            this.hotbarSupply2Latched = false;
            this.hotbarSupply3Latched = false;
            const chatUI = window.ChatUI;

            if (chatUI && chatUI.isSubmenuOpen) {
                let optVertDir = 0;
                if (this.keys['e'] || this.keys['arrowup'] || navVertDir < 0) optVertDir = -1;
                if (this.keys['d'] || this.keys['arrowdown'] || navVertDir > 0) optVertDir = 1;

                if (optVertDir !== 0) {
                    if (!this.optNavVertLatched) {
                        chatUI.navigateSubmenu(optVertDir);
                        this.optNavVertLatched = true;
                    }
                } else {
                    this.optNavVertLatched = false;
                }

                if (rawSelectPressed || this.keys['enter'] || this.keys['k'] || this.keys['K']) {
                    if (!this.selectActive) {
                        chatUI.selectSubmenuOption();
                        this.selectActive = true;
                        this.selectRepeatTimer = this.navDelayDuration;
                    } else {
                        this.selectRepeatTimer -= dt;
                        if (this.selectRepeatTimer <= 0) this.selectRepeatTimer = this.navDelayDuration;
                    }
                } else {
                    this.selectActive = false;
                }
            }

            // Tab key ONLY toggles the submenu in Chat (keys['tab'] / PS5 Options button handled via unified handleTabAction)

        // 8. Radio Menu Navigation (Extracted Audio BGM & Regional Tracks)
        } else if (window.isRadioMenuOpen && typeof debugMenu !== 'undefined' && debugMenu) {
            let optVertDir = 0;
            if (!debugMenu.isRadioOptionEditing) {
                if (this.keys['e'] || this.keys['arrowup'] || navVertDir < 0) optVertDir = -1;
                if (this.keys['d'] || this.keys['arrowdown'] || navVertDir > 0) optVertDir = 1;
            }

            if (optVertDir !== 0) {
                if (!this.optNavVertLatched) {
                    debugMenu.navigateRadioOptions(optVertDir, 7);
                    this.optNavVertLatched = true;
                }
            } else {
                this.optNavVertLatched = false;
            }

            let adjStep = 0;
            if (debugMenu.isRadioOptionEditing) {
                if (this.keys['s'] || this.keys['arrowleft'] || navHorizDir < 0) adjStep = -0.1;
                if (this.keys['f'] || this.keys['arrowright'] || navHorizDir > 0) adjStep = 0.1;
            }

            if (adjStep !== 0) {
                if (!this.optAdjustHorizLatched) {
                    debugMenu.adjustRadioOptionValue(adjStep);
                    this.optAdjustHorizLatched = true;
                }
            } else {
                this.optAdjustHorizLatched = false;
            }

            if (rawSelectPressed || this.keys['enter'] || this.keys['k'] || this.keys['K']) {
                if (!this.selectActive) {
                    debugMenu.toggleRadioOptionSelection();
                    this.selectActive = true;
                    this.selectRepeatTimer = this.navDelayDuration;
                } else {
                    this.selectRepeatTimer -= dt;
                    if (this.selectRepeatTimer <= 0) this.selectRepeatTimer = this.navDelayDuration;
                }
            } else {
                this.selectActive = false;
                this.selectRepeatTimer = 0.0;
            }

            // Return to Main Menu on Escape / Backspace (NOT I / Triangle)
            if (this.keys['escape'] || this.keys['backspace']) {
                if (!this.slot2Latched) {
                    debugMenu.closeRadioMenu();
                    this.slot2Latched = true;
                }
            } else {
                this.slot2Latched = false;
            }

        // 8.5 World Map & Nautical Chart Navigation
        } else if (isMapMenu && typeof debugMenu !== 'undefined' && debugMenu) {
            // K / Cross / Enter: Close Map
            if (rawSelectPressed || this.keys['enter'] || this.keys['k'] || this.keys['K']) {
                if (!this.selectActive) {
                    debugMenu.closeMapMenu();
                    this.selectActive = true;
                    this.selectRepeatTimer = this.navDelayDuration;
                } else {
                    this.selectRepeatTimer -= dt;
                    if (this.selectRepeatTimer <= 0) this.selectRepeatTimer = this.navDelayDuration;
                }
            } else {
                this.selectActive = false;
                this.selectRepeatTimer = 0.0;
            }

            // Escape / Backspace: Return from Map
            if (this.keys['escape'] || this.keys['backspace']) {
                if (!this.slot2Latched) {
                    debugMenu.closeMapMenu();
                    this.slot2Latched = true;
                }
            } else {
                this.slot2Latched = false;
            }

        // 9. Main Menu Navigation (Pokemon Ruby GBA 3:2 Right-Side Start Menu)
        } else if (isItemMenu && typeof debugMenu !== 'undefined' && debugMenu) {
            if (navVertDir !== 0 || navHorizDir !== 0) {
                if (!this.navInputActive) {
                    debugMenu.navigateGrid(navHorizDir, navVertDir);
                    this.navInputActive = true;
                    this.navRepeatTimer = this.navDelayDuration;
                } else {
                    this.navRepeatTimer -= dt;
                    if (this.navRepeatTimer <= 0) {
                        debugMenu.navigateGrid(navHorizDir, navVertDir);
                        this.navRepeatTimer = this.navDelayDuration;
                    }
                }
            } else {
                this.navInputActive = false;
                this.navRepeatTimer = 0.0;
            }

            if (rawSelectPressed || this.keys['enter'] || this.keys['k'] || this.keys['K']) {
                if (!this.selectActive) {
                    if (debugMenu.isDescModalOpen) {
                        debugMenu.closeDescriptionModal();
                    } else {
                        debugMenu.selectAndActivateCard(debugMenu.selectedGridIndex);
                    }
                    this.selectActive = true;
                    this.selectRepeatTimer = this.navDelayDuration;
                } else {
                    this.selectRepeatTimer -= dt;
                    if (this.selectRepeatTimer <= 0) this.selectRepeatTimer = this.navDelayDuration;
                }
            } else {
                this.selectActive = false;
                this.selectRepeatTimer = 0.0;
            }

            // Return to Gameplay on Escape / Backspace (NOT I / Triangle)
            if (this.keys['escape'] || this.keys['backspace']) {
                if (!this.slot2Latched) {
                    this.slot2Latched = true;
                    if (debugMenu.isDescModalOpen) {
                        debugMenu.closeDescriptionModal();
                    } else {
                        if (gs) {
                            gs.isItemMenuOpen = false;
                        }
                        window.isItemMenuOpen = false;
                        if (typeof window.updateMenuOverlays === 'function') window.updateMenuOverlays();
                        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
                    }
                }
            } else {
                this.slot2Latched = false;
            }

        // 5. In-Game Action Handling
        } else {
            this.menuSlot1Latched = false;
            this.menuSlot2Latched = false;
            this.menuSlot3Latched = false;
            this.navInputActive = false;

            const isCurrentMenuOpen = gs ? (gs.isItemMenuOpen || gs.isDebugMenuOpen || gs.isEquipmentMenuOpen || gs.isMedallionsMenuOpen || gs.isEquippablesMenuOpen || gs.isConsumablesMenuOpen || gs.isAccessoriesMenuOpen || gs.isRoomsMenuOpen || gs.isMapMenuOpen || window.isCellPhoneOpen || window.isTextMessageToolOpen || (window.ChatUI && (window.ChatUI.isPhoneOpen || window.ChatUI.isTextMessageToolOpen)) || window.isRadioMenuOpen || window.isRoomsMenuOpen || window.isMapMenuOpen) : (window.isItemMenuOpen || window.isDebugMenuOpen || window.isEquipmentMenuOpen || window.isMedallionsMenuOpen || window.isEquippablesMenuOpen || window.isConsumablesMenuOpen || window.isAccessoriesMenuOpen || window.isRoomsMenuOpen || window.isMapMenuOpen || window.isCellPhoneOpen || window.isTextMessageToolOpen || (window.ChatUI && (window.ChatUI.isPhoneOpen || window.ChatUI.isTextMessageToolOpen)) || window.isRadioMenuOpen);

            if (!isCurrentMenuOpen) {
                // Telescope Trigger: STRICT MUTUAL EXCLUSION
                if (isTelescopeHeld) {
                    if (moveSpeed === 0) {
                        if (!this.telescopeToggleLatched) {
                            if (typeof window.EventBus !== 'undefined') {
                                window.EventBus.emit('camera:toggleFirstPerson');
                                window.EventBus.emit('sfx:play', 'telescope_zoom');
                            }
                            this.telescopeToggleLatched = true;
                        }
                    } else {
                        if (typeof window.EventBus !== 'undefined') {
                            window.EventBus.emit('camera:setZoomState', true);
                        }
                    }
                } else {
                    this.telescopeToggleLatched = false;
                    if (typeof window.EventBus !== 'undefined') {
                        window.EventBus.emit('camera:setZoomState', false);
                    }
                }

                // Bat Wings
                if (isBatHeld) {
                    if (typeof window.EventBus !== 'undefined') {
                        window.EventBus.emit('player:float', true);
                        window.EventBus.emit('sfx:batWings', true);
                    }
                } else {
                    if (typeof window.EventBus !== 'undefined') {
                        window.EventBus.emit('player:float', false);
                        window.EventBus.emit('sfx:batWings', false);
                    }
                }

                // Hotbar Equipped Items Activation (Slots 1, 2, 3)
                const dMenu = (typeof window !== 'undefined' && window.debugMenu) ? window.debugMenu : (typeof debugMenu !== 'undefined' ? debugMenu : null);
                if (rawSquareSlot1) {
                    if (!this.hotbarSupply1Latched) {
                        this.hotbarSupply1Latched = true;
                        if (gs && gs.hotbar && gs.hotbar.slot1) {
                            if (gs.isSupply(gs.hotbar.slot1.id)) {
                                gs.useConsumable(gs.hotbar.slot1.id);
                                if (dMenu) dMenu.updateHUDOverlay();
                            } else if (dMenu) {
                                dMenu.activateToolItem(gs.hotbar.slot1);
                            }
                        }
                    }
                } else {
                    this.hotbarSupply1Latched = false;
                }

                if (rawTriangleSlot2) {
                    if (!this.hotbarSupply2Latched) {
                        this.hotbarSupply2Latched = true;
                        if (gs && gs.hotbar && gs.hotbar.slot2) {
                            if (gs.isSupply(gs.hotbar.slot2.id)) {
                                gs.useConsumable(gs.hotbar.slot2.id);
                                if (dMenu) dMenu.updateHUDOverlay();
                            } else if (dMenu) {
                                dMenu.activateToolItem(gs.hotbar.slot2);
                            }
                        }
                    }
                } else {
                    this.hotbarSupply2Latched = false;
                }

                if (rawCircleSlot3) {
                    if (!this.hotbarSupply3Latched) {
                        this.hotbarSupply3Latched = true;
                        if (gs && gs.hotbar && gs.hotbar.slot3) {
                            if (gs.isSupply(gs.hotbar.slot3.id)) {
                                gs.useConsumable(gs.hotbar.slot3.id);
                                if (dMenu) dMenu.updateHUDOverlay();
                            } else if (dMenu) {
                                dMenu.activateToolItem(gs.hotbar.slot3);
                            }
                        }
                    }
                } else {
                    this.hotbarSupply3Latched = false;
                }

                // Interactions
                if (rawSelectPressed) {
                    if (!this.selectActive) {
                        this.selectActive = true;
                        this.selectRepeatTimer = this.navDelayDuration;

                        if (window.interactionControllerInstance && gs && gs.characterEntity) {
                            const didInteract = window.interactionControllerInstance.handleInteractionInput(gs.characterEntity, gs.worldEntity, rawSelectPressed);

                            // Prioritize room transition door over ledge mantle/climb when in front of an exit
                            if (!didInteract && gs.nearbyExit) {
                                if (typeof window.EventBus !== 'undefined') {
                                    window.EventBus.emit('sfx:play', 'assign');
                                    window.EventBus.emit('room:load', { 
                                        targetRoom: gs.nearbyExit.targetRoom, 
                                        sourceRoom: gs.currentRoom
                                    });
                                }
                            } else {
                                let didLedgeAction = false;
                                const isFloating = gs && (gs.playerState === 'FLOATING' || (window.playerPhysicsInstance && window.playerPhysicsInstance.currentState === window.State.FLOATING));
                                if (!didInteract && !isFloating && window.playerPhysicsInstance) {
                                    didLedgeAction = window.playerPhysicsInstance.tryExecuteLedgeAction(
                                        gs.characterEntity, gs.worldEntity,
                                        () => { if (typeof window.EventBus !== 'undefined') window.EventBus.emit('camera:snapBehind'); }
                                    );
                                }
                            }
                        }
                    } else {
                        this.selectRepeatTimer -= dt;
                        if (this.selectRepeatTimer <= 0) this.selectRepeatTimer = this.navDelayDuration;
                    }
                } else {
                    this.selectActive = false;
                    this.selectRepeatTimer = 0.0;
                }
            } else {
                this.telescopeToggleLatched = false;
                this.hotbarSupply1Latched = false;
                this.hotbarSupply2Latched = false;
                this.hotbarSupply3Latched = false;
                this.lyreLatched = false;
                if (typeof window.EventBus !== 'undefined') {
                    window.EventBus.emit('player:float', false);
                    window.EventBus.emit('sfx:batWings', false);
                }
            }
        }

        // 5. Walk/Run Toggle (exclusively toggles between walk: 2.2 and sprint: 5.2)
        if (this.keys['a'] || this.keys['keya']) {
            if (!this.aLatched) {
                this.isRunToggled = !this.isRunToggled;
                this.aLatched = true;
            }
        } else {
            this.aLatched = false;
        }
    }
}

window.InputController = InputController;
if (typeof window.EventBus !== 'undefined') {
    window.inputControllerInstance = new InputController();
}
