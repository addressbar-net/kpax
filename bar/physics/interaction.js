// Dynamic World Interaction System (Decoupled & Phase-Driven)

class InteractionController {
    constructor() {
        this.nearbyInteractable = null;
        this.heldEntity = null;
        this.carryOffset = [0.0, 1.2, -0.8];
        this.interactionRadius = 1.8;

        this.bindEventBus();
    }

    bindEventBus() {
        if (typeof window.EventBus !== 'undefined') {
            // Bind strictly to PHASE 2 (engine:physics)
            // Ensures proximity scan runs immediately after player physics updates
            window.EventBus.on('engine:physics', () => {
                const charEntity = window.GameState ? window.GameState.characterEntity : null;
                const gameObjects = window.GameState ? window.GameState.gameObjects : [];

                if (charEntity) {
                    this.scanForInteractables(charEntity, gameObjects);
                    this.updateHeldObject(charEntity);
                }
            });
        }
    }

    /**
     * Scans for interactable entities within forward arc cone and proximity radius.
     */
    scanForInteractables(characterEntity, gameObjects) {
        if (!characterEntity || this.heldEntity || !gameObjects || gameObjects.length <= 1) {
            this.nearbyInteractable = null;
            if (window.GameState) window.GameState.nearbyInteractable = null;
            return;
        }

        const playerPos = characterEntity.position;
        const charFacing = characterEntity.rotationY;

        let closestObj = null;
        let minDistSq = this.interactionRadius * this.interactionRadius;

        for (let i = 0, len = gameObjects.length; i < len; i++) {
            const obj = gameObjects[i];
            if (!obj.isInteractable || obj === characterEntity) continue;

            const isBoat = obj.isVehicle || obj.name === 'BOAT' || obj.name === 'SPEEDBOAT';
            const effectiveRadius = isBoat ? 4.2 : this.interactionRadius;
            const effectiveRadiusSq = effectiveRadius * effectiveRadius;

            const dx = obj.position[0] - playerPos[0];
            const dy = obj.position[1] - playerPos[1];
            const dz = obj.position[2] - playerPos[2];
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq <= effectiveRadiusSq + 0.001) {
                const dirToObjYaw = Math.atan2(-dx, -dz);
                let angleDiff = Math.abs(charFacing - dirToObjYaw) % (Math.PI * 2);
                if (angleDiff > Math.PI) angleDiff = (Math.PI * 2) - angleDiff;

                // 120-degree forward cone for small items, 360-degree for adjacent boat/vehicle
                if (angleDiff <= Math.PI / 3 || isBoat) {
                    if (!closestObj || distSq < minDistSq || isBoat) {
                        minDistSq = distSq;
                        closestObj = obj;
                    }
                }
            }
        }

        this.nearbyInteractable = closestObj;
        if (window.GameState) {
            window.GameState.nearbyInteractable = closestObj;
            window.GameState.heldEntity = this.heldEntity;
        }
    }

    /**
     * Updates spatial transform of currently held object to match player carry offset.
     */
    updateHeldObject(characterEntity) {
        if (!this.heldEntity || !characterEntity) return;

        const sin = Math.sin(characterEntity.rotationY);
        const cos = Math.cos(characterEntity.rotationY);

        this.heldEntity.position[0] = characterEntity.position[0] - sin * Math.abs(this.carryOffset[2]);
        this.heldEntity.position[1] = characterEntity.position[1] + this.carryOffset[1];
        this.heldEntity.position[2] = characterEntity.position[2] - cos * Math.abs(this.carryOffset[2]);

        this.heldEntity.rotationY = characterEntity.rotationY;
    }

    /**
     * Executes pickup, drop, or vehicle boarding interactions when requested by input controller.
     * @returns {boolean} True if an interaction occurred.
     */
    handleInteractionInput(characterEntity, worldEntity, rawSelectPressed) {
        if (!rawSelectPressed) return false;

        // 1. If currently piloting a boat, disembark!
        if (window.playerPhysicsInstance && window.playerPhysicsInstance.currentState === window.State.BOATING) {
            this.disembarkBoat(characterEntity);
            return true;
        }

        // 2. If near a boat, board it!
        if (this.nearbyInteractable && (this.nearbyInteractable.isVehicle || this.nearbyInteractable.name === 'BOAT' || this.nearbyInteractable.name === 'SPEEDBOAT')) {
            this.boardBoat(characterEntity, this.nearbyInteractable);
            return true;
        }

        // 3. Drop currently held object
        if (this.heldEntity) {
            const dropDistance = 1.0;
            const sin = Math.sin(characterEntity.rotationY);
            const cos = Math.cos(characterEntity.rotationY);

            const dropX = characterEntity.position[0] - sin * dropDistance;
            const dropZ = characterEntity.position[2] - cos * dropDistance;

            let dropY = characterEntity.position[1];
            if (window.CollisionWorld) {
                const groundY = window.CollisionWorld.getGroundHeight(dropX, dropZ, characterEntity.position[1], 2.0, 5.0);
                if (groundY !== null) dropY = groundY;
            }

            this.heldEntity.position[0] = dropX;
            this.heldEntity.position[1] = dropY;
            this.heldEntity.position[2] = dropZ;

            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('log:entry', { tag: 'OK', message: `Placed down '${this.heldEntity.name || 'Object'}'` });
                window.EventBus.emit('sfx:play', 'land');
            }

            this.heldEntity = null;
            if (window.GameState) window.GameState.heldEntity = null;
            return true;
        }

        // 4. Pick up nearby scanned interactable
        if (this.nearbyInteractable) {
            this.heldEntity = this.nearbyInteractable;
            this.nearbyInteractable = null;

            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('log:entry', { tag: 'OK', message: `Picked up '${this.heldEntity.name || 'Object'}'` });
                window.EventBus.emit('sfx:play', 'assign');
            }

            if (window.GameState) {
                window.GameState.heldEntity = this.heldEntity;
                window.GameState.nearbyInteractable = null;
            }
            return true;
        }

        return false;
    }

    boardBoat(characterEntity, boatEntity) {
        if (!window.playerPhysicsInstance) return;
        window.playerPhysicsInstance.mountBoat(characterEntity, boatEntity);
        this.nearbyInteractable = null;
        if (window.GameState) window.GameState.nearbyInteractable = null;
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('log:entry', { tag: 'OK', message: `Boarded Speedboat! Left stick to steer & throttle. Press K to disembark.` });
            window.EventBus.emit('sfx:play', 'assign');
        }
    }

    disembarkBoat(characterEntity) {
        if (!window.playerPhysicsInstance) return;
        window.playerPhysicsInstance.dismountBoat(characterEntity);
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('log:entry', { tag: 'OK', message: `Disembarked boat.` });
            window.EventBus.emit('sfx:play', 'land');
        }
    }
}

window.InteractionController = InteractionController;
if (typeof window.EventBus !== 'undefined') {
    window.interactionControllerInstance = new InteractionController();
}
