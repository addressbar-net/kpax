// Centralized Game State & Inventory Manager (Decoupled Singleton)

class GameStateManager {
    constructor() {
        // UI Overlay State Flags
        this.isItemMenuOpen = true;
        this.isDebugMenuOpen = false;
        this.isEquipmentMenuOpen = false;
        this.isMedallionsMenuOpen = false;
        this.isEquippablesMenuOpen = false;
        this.isConsumablesMenuOpen = false;
        this.isAccessoriesMenuOpen = false;
        this.isCutsceneActive = false;

        // Equipped Accessories (Active passive charms & relics, no hotbar required)
        this.equippedAccessories = {};

        // Moonsynth Lyre Return Marker (Magic Mirror mechanic)
        this.lyreMarker = null;
        this.lyreReturnState = null;

        // Active Hotbar Slots
        this.hotbar = {
            slot1: null,
            slot2: null,
            slot3: null
        };

        // Worn Equipment Slots (Cap, Shirt, Pants - Purely Cosmetic, No Boosts)
        // Default items equipped: Normal Cap, Normal Shirt, Normal Pants
        this.wornEquipment = {
            cap: null,
            shirt: null,
            pants: null
        };

        // 6 Sacred Realm Medallions (Earned starting from bottom, going clockwise)
        // Medallion 1 (Bottom, 6 o'clock): Sprint Speed Medallion (Earned & Always Active)
        this.medallions = {
            sprint_speed: true
        };

        // Consumable Items Inventory (Up to 20 usable items + 20 reserve stacks = 420 max)
        this.consumables = {};

        // World & Entity References
        this.characterEntity = null;
        this.worldEntity = null;
        this.gameObjects = [];

        // Dynamic State Caches
        this.lastInputData = null;
        this.playerState = 'GROUNDED';
        this.pendingLedgeAction = null;
        this.heldEntity = null;
        this.nearbyInteractable = null;
        this.nearbyExit = null;

        // Camera Vectors
        this.cameraPos = [0, 3.5, 7.0];
        this.cameraTarget = [0, 0, 0];
        this.zoomSequenceState = 'IDLE';
        this.isFirstPerson = false;
        this.pitchX = 0.0;

        // Active Room & Area Indicators
        this.currentRoom = "world";
        this.currentArea = "vow_forest";

        // Dimensional Traversal & Hopping Stone State (Light / Dark World)
        this.currentDimension = 'LIGHT'; // 'LIGHT' (3D) or 'DARK' (2D Retro)
        this.isPhaseShifting = false;
        this.nearbyHoppingStone = null;
        this.gridIncrement = 0.1;

        // Player Health & Vitality (Locked to 150 HP Max)
        this.maxHp = 150;
        this.hp = 150;
        this.badges = [];

        this.bindEventBus();
    }

    initEquipment() {
        if (typeof ITEM_REGISTRY === 'undefined') return;

        // Default cosmetic equipment equipped: Normal Cap, Normal Shirt, Normal Pants
        if (!this.wornEquipment.cap && ITEM_REGISTRY.normal_cap) {
            this.wornEquipment.cap = ITEM_REGISTRY.normal_cap;
        }
        if (!this.wornEquipment.shirt && ITEM_REGISTRY.normal_shirt) {
            this.wornEquipment.shirt = ITEM_REGISTRY.normal_shirt;
        }
        if (!this.wornEquipment.pants && ITEM_REGISTRY.normal_pants) {
            this.wornEquipment.pants = ITEM_REGISTRY.normal_pants;
        }
    }

    /**
     * Assigns a cosmetic item to the Cap, Shirt, or Pants slot.
     * Purely cosmetic, does not grant stat boosts.
     * @param {'cap'|'shirt'|'pants'} slot
     * @param {object} item
     * @returns {boolean}
     */
    equipWornItem(slot, item) {
        this.initEquipment();
        const validSlots = ['cap', 'shirt', 'pants'];
        if (!validSlots.includes(slot)) {
            console.warn(`[Equipment] Invalid slot: ${slot}`);
            return false;
        }

        if (item && item.slotType !== slot) {
            console.warn(`[Equipment] Item '${item.name}' cannot be assigned to ${slot} slot.`);
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('log:entry', {
                    tag: 'WARN',
                    message: `Cannot assign '${item.name}' to ${slot.toUpperCase()}! Only ${slot} attire permitted.`
                });
                window.EventBus.emit('sfx:play', 'nav');
            }
            return false;
        }

        this.wornEquipment[slot] = item;
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('equipment:updated', { slot, item });
            window.EventBus.emit('log:entry', {
                tag: 'OK',
                message: `Equipped cosmetic '${item ? item.name : 'None'}' to ${slot.toUpperCase()} slot.`
            });
            window.EventBus.emit('sfx:play', 'assign');
        }
        return true;
    }

    /**
     * Checks if a medallion has been earned.
     * @param {string} id - e.g. 'sprint_speed'
     * @returns {boolean}
     */
    hasMedallion(id) {
        return !!(this.medallions && this.medallions[id]);
    }

    /**
     * The Sprint Speed medallion is earned and always active (+50% movement speed).
     * @returns {boolean}
     */
    hasSprintBoost() {
        return this.hasMedallion('sprint_speed');
    }

    /**
     * Checks if an accessory is currently equipped.
     * @param {string} id - e.g. 'walk_straight'
     * @returns {boolean}
     */
    hasEquippedAccessory(id) {
        return !!(this.equippedAccessories && this.equippedAccessories[id]);
    }

    /**
     * Equips or unequips an accessory without hotbar assignment.
     * @param {string} id
     * @returns {boolean} New equipped state.
     */
    toggleEquipAccessory(id) {
        if (!this.equippedAccessories) this.equippedAccessories = {};
        this.equippedAccessories[id] = !this.equippedAccessories[id];
        const isEquipped = this.equippedAccessories[id];

        // Exclusive mutual unequip: Only one of Walk Straight or Look Straight can be equipped at a time
        if (isEquipped) {
            if (id === 'look_straight' && this.equippedAccessories['walk_straight']) {
                this.equippedAccessories['walk_straight'] = false;
                if (typeof window.EventBus !== 'undefined') {
                    window.EventBus.emit('accessory:toggled', { id: 'walk_straight', isEquipped: false });
                }
            } else if (id === 'walk_straight' && this.equippedAccessories['look_straight']) {
                this.equippedAccessories['look_straight'] = false;
                if (typeof window.EventBus !== 'undefined') {
                    window.EventBus.emit('accessory:toggled', { id: 'look_straight', isEquipped: false });
                }
            }
        }

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('accessory:toggled', { id, isEquipped });
            window.EventBus.emit('sfx:play', 'assign');
            const item = typeof ITEM_REGISTRY !== 'undefined' ? ITEM_REGISTRY[id] : null;
            const name = item ? item.name : id;
            window.EventBus.emit('log:entry', {
                tag: 'EQUIP',
                message: `${isEquipped ? 'Equipped' : 'Unequipped'} accessory '${name}'.`
            });
        }
        return isEquipped;
    }

    initConsumables() {
        if (typeof CONSUMABLES_REGISTRY === 'undefined') return;
        if (Object.keys(this.consumables).length === 0) {
            CONSUMABLES_REGISTRY.forEach(item => {
                this.consumables[item.id] = { ...item };
            });
        }
    }

    /**
     * Obtains consumable items into inventory.
     * Up to 20 usable items carried at once, plus up to 20 stacks.
     * "Adding 20 items should increase the stack by one without affecting the held items."
     * "When an item is obtained as the 21st item that adds to the stack, the number of items must become 0.
     * All of the items that were carried were transferred into the stack."
     * @param {string} id
     * @param {number} [amount=1]
     * @returns {boolean}
     */
    obtainConsumable(id, amount = 1) {
        this.initConsumables();
        const item = this.consumables[id];
        if (!item) return false;

        const numAmount = parseInt(amount, 10);
        if (isNaN(numAmount) || numAmount <= 0) return false;

        let addedCount = 0;
        let createdStacks = 0;
        const maxUsable = item.maxUsable || 20;
        const maxStacks = item.maxStacks || 20;

        // 1. Every group of 20 items adds directly to stacks without affecting held items
        const stacksToAdd = Math.floor(numAmount / 20);
        const remainder = numAmount % 20;

        if (stacksToAdd > 0) {
            const canAddStacks = Math.max(0, maxStacks - item.stacks);
            const actualStacks = Math.min(stacksToAdd, canAddStacks);
            item.stacks += actualStacks;
            createdStacks += actualStacks;
            addedCount += actualStacks * 20;
        }

        // If any stack blocks couldn't be added because stacks is at max (20),
        // allow them to overflow into loose items to fill remaining usable capacity
        const unaccommodatedStackItems = Math.max(0, (stacksToAdd - createdStacks) * 20);
        const looseItems = remainder + unaccommodatedStackItems;

        // 2. Add loose remainder items
        for (let i = 0; i < looseItems; i++) {
            if (item.usable < maxUsable) {
                item.usable++;
                addedCount++;
            } else if (item.stacks < maxStacks) {
                // "When an item is obtained as the 21st item that adds to the stack,
                // the number of items must become 0. All of the items that were carried were transferred into the stack."
                item.stacks++;
                item.usable = 0;
                createdStacks++;
                addedCount++;
            } else {
                // Absolute maximum capacity reached: 20/20 (420 total items)
                break;
            }
        }

        if (addedCount > 0) {
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('consumables:updated', { id, item });
                window.EventBus.emit('log:entry', {
                    tag: 'ITEM',
                    message: `Obtained ${item.name} (+${addedCount}) • Inventory: ${item.usable}/${item.stacks}${createdStacks > 0 ? ` [${createdStacks} Stack(s) Added • Held: ${item.usable}]` : ''}`
                });
                window.EventBus.emit('sfx:play', 'assign');
            }
            return true;
        }
        return false;
    }

    /**
     * Uses a consumable item.
     * Decrements usable. If usable reaches 0 and stacks > 0:
     * "A stack is depleted if the number of items reaches 0, in order to replace usable items with 20 (amount)."
     * @param {string} id
     * @returns {boolean}
     */
    useConsumable(id) {
        this.initConsumables();
        const item = this.consumables[id];
        if (!item) return false;

        if (item.usable <= 0 && item.stacks <= 0) {
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('log:entry', {
                    tag: 'WARN',
                    message: `Cannot use ${item.name}: None available (0/0).`
                });
                window.EventBus.emit('sfx:play', 'nav');
            }
            return false;
        }

        let stackDepleted = false;

        // If no usable items carried, but reserve stacks exist:
        // "A stack is depleted if the number of items reaches 0, in order to replace usable items with 20 (amount)."
        if (item.usable === 0 && item.stacks > 0) {
            item.stacks--;
            item.usable = 20;
            stackDepleted = true;
        }

        if (item.usable > 0) {
            item.usable--;
        }

        // If usable items just reached 0 upon this use, replenish from stack if any remain
        if (item.usable === 0 && item.stacks > 0) {
            item.stacks--;
            item.usable = 20;
            stackDepleted = true;
        }

        if (item.healAmount) {
            this.heal(item.healAmount);
        }

        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('consumables:updated', { id, item });
            window.EventBus.emit('log:entry', {
                tag: 'USE',
                message: `Used ${item.name}! Remaining: ${item.usable}/${item.stacks}${stackDepleted ? ' [Stack Depleted -> Replaced with 20 items]' : ''}`
            });
            window.EventBus.emit('sfx:play', 'assign');
        }
        return true;
    }

    bindEventBus() {
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.on('ui:toggleMenu', () => {
                // If chat is open, general menu toggle does not close chat - close chat option must be selected from chat menu
                if (window.isCellPhoneOpen || (window.ChatUI && window.ChatUI.isPhoneOpen)) {
                    return;
                }
                if (this.isDebugMenuOpen || this.isEquipmentMenuOpen || this.isMedallionsMenuOpen || this.isEquippablesMenuOpen || this.isConsumablesMenuOpen || this.isAccessoriesMenuOpen || window.isRadioMenuOpen) {
                    this.isDebugMenuOpen = false;
                    this.isEquipmentMenuOpen = false;
                    this.isMedallionsMenuOpen = false;
                    this.isEquippablesMenuOpen = false;
                    this.isConsumablesMenuOpen = false;
                    this.isAccessoriesMenuOpen = false;
                    this.isItemMenuOpen = false;
                    window.isRadioMenuOpen = false;
                } else if (this.isItemMenuOpen) {
                    this.isItemMenuOpen = false;
                } else {
                    this.isItemMenuOpen = true;
                }

                // Synchronize global flags for overlay helper functions
                window.isItemMenuOpen = this.isItemMenuOpen;
                window.isDebugMenuOpen = this.isDebugMenuOpen;
                window.isEquipmentMenuOpen = this.isEquipmentMenuOpen;
                window.isMedallionsMenuOpen = this.isMedallionsMenuOpen;
                window.isEquippablesMenuOpen = this.isEquippablesMenuOpen;
                window.isConsumablesMenuOpen = this.isConsumablesMenuOpen;
                window.isAccessoriesMenuOpen = this.isAccessoriesMenuOpen;

                if (typeof window.updateMenuOverlays === 'function') {
                    window.updateMenuOverlays();
                }
            });

            window.EventBus.on('ui:openEquipmentMenu', () => {
                this.isItemMenuOpen = false;
                this.isDebugMenuOpen = false;
                this.isEquipmentMenuOpen = true;
                this.isMedallionsMenuOpen = false;
                this.isEquippablesMenuOpen = false;
                this.isConsumablesMenuOpen = false;
                window.isItemMenuOpen = false;
                window.isDebugMenuOpen = false;
                window.isEquipmentMenuOpen = true;
                window.isMedallionsMenuOpen = false;
                window.isEquippablesMenuOpen = false;
                window.isConsumablesMenuOpen = false;
                if (typeof window.updateMenuOverlays === 'function') {
                    window.updateMenuOverlays();
                }
            });

            window.EventBus.on('ui:closeEquipmentMenu', () => {
                this.isEquipmentMenuOpen = false;
                this.isItemMenuOpen = true;
                window.isEquipmentMenuOpen = false;
                window.isItemMenuOpen = true;
                if (typeof window.updateMenuOverlays === 'function') {
                    window.updateMenuOverlays();
                }
            });

            window.EventBus.on('ui:openMedallionsMenu', () => {
                this.isItemMenuOpen = false;
                this.isDebugMenuOpen = false;
                this.isEquipmentMenuOpen = false;
                this.isMedallionsMenuOpen = true;
                this.isEquippablesMenuOpen = false;
                this.isConsumablesMenuOpen = false;
                window.isItemMenuOpen = false;
                window.isDebugMenuOpen = false;
                window.isEquipmentMenuOpen = false;
                window.isMedallionsMenuOpen = true;
                window.isEquippablesMenuOpen = false;
                window.isConsumablesMenuOpen = false;
                if (typeof window.updateMenuOverlays === 'function') {
                    window.updateMenuOverlays();
                }
            });

            window.EventBus.on('ui:closeMedallionsMenu', () => {
                this.isMedallionsMenuOpen = false;
                this.isItemMenuOpen = true;
                window.isMedallionsMenuOpen = false;
                window.isItemMenuOpen = true;
                if (typeof window.updateMenuOverlays === 'function') {
                    window.updateMenuOverlays();
                }
            });

            window.EventBus.on('ui:openEquippablesMenu', () => {
                this.isItemMenuOpen = false;
                this.isDebugMenuOpen = false;
                this.isEquipmentMenuOpen = false;
                this.isMedallionsMenuOpen = false;
                this.isEquippablesMenuOpen = true;
                this.isConsumablesMenuOpen = false;
                window.isItemMenuOpen = false;
                window.isDebugMenuOpen = false;
                window.isEquipmentMenuOpen = false;
                window.isMedallionsMenuOpen = false;
                window.isEquippablesMenuOpen = true;
                window.isConsumablesMenuOpen = false;
                if (typeof window.updateMenuOverlays === 'function') {
                    window.updateMenuOverlays();
                }
            });

            window.EventBus.on('ui:closeEquippablesMenu', () => {
                this.isEquippablesMenuOpen = false;
                this.isItemMenuOpen = true;
                window.isEquippablesMenuOpen = false;
                window.isItemMenuOpen = true;
                if (typeof window.updateMenuOverlays === 'function') {
                    window.updateMenuOverlays();
                }
            });

            window.EventBus.on('ui:openConsumablesMenu', () => {
                this.isItemMenuOpen = false;
                this.isDebugMenuOpen = false;
                this.isEquipmentMenuOpen = false;
                this.isMedallionsMenuOpen = false;
                this.isEquippablesMenuOpen = false;
                this.isConsumablesMenuOpen = true;
                window.isItemMenuOpen = false;
                window.isDebugMenuOpen = false;
                window.isEquipmentMenuOpen = false;
                window.isMedallionsMenuOpen = false;
                window.isEquippablesMenuOpen = false;
                window.isConsumablesMenuOpen = true;
                if (typeof window.updateMenuOverlays === 'function') {
                    window.updateMenuOverlays();
                }
            });

            window.EventBus.on('ui:closeConsumablesMenu', () => {
                this.isConsumablesMenuOpen = false;
                this.isItemMenuOpen = true;
                window.isConsumablesMenuOpen = false;
                window.isItemMenuOpen = true;
                if (typeof window.updateMenuOverlays === 'function') {
                    window.updateMenuOverlays();
                }
            });

            window.EventBus.on('ui:openAccessoriesMenu', () => {
                this.isItemMenuOpen = false;
                this.isDebugMenuOpen = false;
                this.isEquipmentMenuOpen = false;
                this.isMedallionsMenuOpen = false;
                this.isEquippablesMenuOpen = false;
                this.isConsumablesMenuOpen = false;
                this.isAccessoriesMenuOpen = true;
                window.isItemMenuOpen = false;
                window.isDebugMenuOpen = false;
                window.isEquipmentMenuOpen = false;
                window.isMedallionsMenuOpen = false;
                window.isEquippablesMenuOpen = false;
                window.isConsumablesMenuOpen = false;
                window.isAccessoriesMenuOpen = true;
                if (typeof window.updateMenuOverlays === 'function') {
                    window.updateMenuOverlays();
                }
            });

            window.EventBus.on('ui:closeAccessoriesMenu', () => {
                this.isAccessoriesMenuOpen = false;
                this.isItemMenuOpen = true;
                window.isAccessoriesMenuOpen = false;
                window.isItemMenuOpen = true;
                if (typeof window.updateMenuOverlays === 'function') {
                    window.updateMenuOverlays();
                }
            });

            window.EventBus.on('accessory:toggle', ({ id }) => {
                this.toggleEquipAccessory(id);
            });

            window.EventBus.on('consumable:use', ({ id }) => {
                this.useConsumable(id);
            });

            window.EventBus.on('consumable:obtain', ({ id, amount }) => {
                this.obtainConsumable(id, amount || 1);
            });

            window.EventBus.on('equipment:equip', ({ slot, item }) => {
                this.equipWornItem(slot, item);
            });

            window.EventBus.on('ui:hotbarUpdated', ({ slot, item }) => {
                this.hotbar[slot] = item;
                this.updateHpUI();
            });

            window.EventBus.on('player:takeDamage', ({ amount, eventType }) => {
                this.takeDamage(amount, eventType);
            });

            window.EventBus.on('player:heal', ({ amount }) => {
                this.heal(amount);
            });
        }
    }

    /**
     * Calculates passive damage reduction percentage (0.0 to 0.85) based on badges and worn equipment.
     * Certain badges and armor reduce damage from events, while max HP is always 150.
     * @param {string} [eventType='EVENT'] - e.g., 'FALL', 'HAZARD', 'COMBAT'
     * @returns {number} Fraction of damage absorbed.
     */
    getDamageReduction(eventType = 'EVENT') {
        this.initEquipment();
        let reduction = 0.0;

        // Check active hotbar slots for equipped badges
        for (const slot of ['slot1', 'slot2', 'slot3']) {
            const item = this.hotbar[slot];
            if (item && item.isBadge) {
                if (eventType === 'FALL' && item.id === 'feather_badge') {
                    reduction += (item.damageReduction !== undefined ? item.damageReduction : 0.70);
                } else if (item.id === 'guardian_badge') {
                    reduction += (item.damageReduction !== undefined ? item.damageReduction : 0.50);
                } else if (item.damageReduction) {
                    reduction += item.damageReduction;
                }
            }
        }

        // Check passive badges list and equipped accessories
        if (this.hasEquippedAccessory('guardian_badge')) reduction += 0.50;
        if (this.hasEquippedAccessory('feather_badge') && eventType === 'FALL') reduction += 0.70;

        if (Array.isArray(this.badges)) {
            for (const b of this.badges) {
                if (b === 'guardian' || b === 'guardian_badge') reduction += 0.50;
                if ((b === 'feather' || b === 'feather_badge') && eventType === 'FALL') reduction += 0.70;
            }
        }

        // Worn equipment is purely cosmetic and does not provide stat boosts

        return Math.min(0.85, reduction); // Cap maximum absorption at 85%
    }

    /**
     * Applies damage to the player, accounting for badge damage mitigation.
     * @param {number} rawAmount - Raw incoming damage.
     * @param {string} [eventType='EVENT'] - Contextual source of damage.
     * @returns {number} Effective damage applied.
     */
    /**
     * Damage disabled — HP removed per user request.
     * @returns {number} 0
     */
    takeDamage(rawAmount, eventType = 'EVENT') {
        return 0;
    }

    /**
     * Heal disabled — HP removed per user request.
     */
    heal(amount) {
        return;
    }

    /**
     * On-screen HP gauge disabled.
     */
    updateHpUI(flash = false) {
        return;
    }

    /**
     * Checks if a given item ID is currently equipped in any hotbar slot, worn in attire slots, or equipped as an accessory.
     * @param {string} itemId - e.g., 'walk_straight', 'normal_shirt', 'bat', 'telescope'
     * @returns {boolean}
     */
    hasEquippedItem(itemId) {
        this.initEquipment();
        const inHotbar = (this.hotbar.slot1 && this.hotbar.slot1.id === itemId) ||
                         (this.hotbar.slot2 && this.hotbar.slot2.id === itemId) ||
                         (this.hotbar.slot3 && this.hotbar.slot3.id === itemId);
        const inCap = this.wornEquipment?.cap && this.wornEquipment.cap.id === itemId;
        const inShirt = this.wornEquipment?.shirt && this.wornEquipment.shirt.id === itemId;
        const inPants = this.wornEquipment?.pants && this.wornEquipment.pants.id === itemId;
        const inAccessory = this.hasEquippedAccessory(itemId);
        return inHotbar || inCap || inShirt || inPants || inAccessory;
    }

    /**
     * Checks if a given item ID is a consumable supply.
     * @param {string} id
     * @returns {boolean}
     */
    isSupply(id) {
        if (!id) return false;
        this.initConsumables();
        return !!(this.consumables && this.consumables[id]);
    }

    /**
     * Uses the consumable supply equipped in a specific hotbar slot.
     * @param {string} slot - 'slot1', 'slot2', or 'slot3'
     * @returns {boolean}
     */
    useHotbarSupply(slot) {
        const item = this.hotbar[slot];
        if (item && this.isSupply(item.id)) {
            return this.useConsumable(item.id);
        }
        return false;
    }

    /**
     * Synchronizes a hotbar slot assignment.
     * @param {string} slot - 'slot1', 'slot2', or 'slot3'
     * @param {object|null} item
     */
    setHotbarSlot(slot, item) {
        if (this.hotbar[slot] !== undefined) {
            this.hotbar[slot] = item;
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('ui:hotbarUpdated', { slot, item });
            }
        }
    }

    /**
     * Updates active BGM area key.
     * @param {string} areaKey
     */
    setCurrentArea(areaKey) {
        this.currentArea = areaKey;
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('area:changed', { area: areaKey });
        }
    }

    /**
     * Toggles first-person view and emits camera event.
     */
    toggleFirstPerson() {
        this.isFirstPerson = !this.isFirstPerson;
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('camera:toggleFirstPerson');
        }
        return this.isFirstPerson;
    }
}

// Instantiate Global Singleton
window.GameState = new GameStateManager();
