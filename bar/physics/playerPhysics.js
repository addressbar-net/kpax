// Player Physics Controller (Decoupled & Phase-Driven)

if (!window.State) {
    window.State = { 
        GROUNDED: 'GROUNDED', 
        JUMPING: 'JUMPING', 
        FALLING: 'FALLING', 
        HANGING: 'HANGING', 
        FLOATING: 'FLOATING',
        HOPPING: 'HOPPING',     
        CLIMBING: 'CLIMBING',   
        JUMP_DOWN: 'JUMP_DOWN',
        SWIMMING: 'SWIMMING',
        SLIDING: 'SLIDING',
        BOATING: 'BOATING'
    };
}

class PlayerPhysics {
    constructor() {
        this.currentState = window.State.GROUNDED;
        
        // Strict 62 degree max walkable slope limit (60 deg walkable; 63, 66, 68 deg non-walkable)
        this.maxSlopeAngle = 62.0;
        this.maxSlopeCos = Math.cos(this.maxSlopeAngle * Math.PI / 180.0);

        this.isFirstPerson = false;
        this.isUnderwater = false;
        this.pitchX = 0.0;
        this.verticalVelocity = 0.0;
        this.gravity = -25.0;
        this.floatAscentSpeed = 6.0;
        this.floatDescentSpeed = -1.5;
        this.hangDistance = 0.4;

        // Slide Velocity Tuning
        this.slideSpeed = 12.0;

        // Tall Ledge Wall Climb Tuning
        // Reduced from 4.5m to 1.8m so player cannot climb to the top of gate meshes / doorframes
        this.maxClimbLedgeHeight = 1.8;

        // Water Locomotion Tuning
        this.waterDrag = 3.5;
        this.swimSpeed = 5.5;
        this.buoyancyForce = 12.0;

        // Speedboat Vehicle Tuning
        this.activeVehicle = null;
        this.boatVelocity = 0.0;
        this.boatMaxSpeed = 22.0; // High cruising speed across open sea
        this.boatMaxReverse = -4.5;
        this.boatAccel = 14.0;
        this.boatBrake = 20.0;
        this.boatWaterDrag = 1.0;
        this.boatSteerRate = 1.85;
        this.waveTimer = 0.0;

        this.jumpOffPoint = [0, 0, 0];
        this.airVelocity = [0, 0];
        this.ledgeNormal = [0, 0, 1];

        this.activeTriangleIndex = -1;
        this.actionTimer = 0.0;
        this.actionDuration = 0.25;
        this.startPos = [0, 0, 0];
        this.targetPos = [0, 0, 0];

        this.isLockedInTransition = false;
        this.pendingLedgeAction = null; 
        this._wasStoppedLastFrame = false;
        this.lockedZTargetFacing = null;
        this.waterDropCooldown = 0.0;

        this.bindEventBus();
    }

    bindEventBus() {
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.on('player:float', (active) => {
                if (active) {
                    this.currentState = window.State.FLOATING;
                    this.isLockedInTransition = false;
                    this.verticalVelocity = 0.0;
                } else if (this.currentState === window.State.FLOATING) {
                    this.currentState = window.State.FALLING;
                    this.verticalVelocity = 0.0;
                    this.isLockedInTransition = false;
                }
            });

            window.EventBus.on('engine:physics', ({ dt }) => {
                const gs = window.GameState;
                if (!gs || !gs.characterEntity || !gs.lastInputData) return;

                const camPos = gs.cameraPos || [0, 3.5, 7.0];
                const zoomState = gs.zoomSequenceState || 'IDLE';

                this.isFirstPerson = gs.isFirstPerson || false;

                this.updatePhysics(
                    dt, gs.lastInputData, gs.characterEntity, gs.worldEntity, camPos, zoomState,
                    () => {
                        if (window.EventBus) window.EventBus.emit('camera:snapBehind');
                    }
                );

                gs.playerState = this.currentState;
                gs.pendingLedgeAction = this.pendingLedgeAction;
                gs.pitchX = this.pitchX;
                gs.isUnderwater = this.isUnderwater;
            });
        }
    }

    getWaterSurfaceElevation(x, z) {
        if (window.CollisionWorld && typeof window.CollisionWorld.getWaterSurface === 'function') {
            const h = window.CollisionWorld.getWaterSurface(x, z);
            if (h !== null) return h;
        }
        // Only sea-capable rooms have an open ocean water surface at Y = 0.0. Inland rooms like vow_3 and vow_4 have no water.
        const gs = window.GameState;
        const curRoom = gs ? gs.currentRoom : null;
        const isSeaRoom = (curRoom === 'world' || curRoom === 'ocean_haven' || curRoom === 'open_sea' || (curRoom && curRoom.includes('links_house')));
        return isSeaRoom ? 0.0 : null;
    }

    checkWaterSurfaces(characterEntity) {
        if (this.currentState === window.State.BOATING || this.currentState === window.State.CLIMBING || this.currentState === window.State.HOPPING || this.isLockedInTransition) {
            if (this.currentState === window.State.BOATING) {
                this.isUnderwater = false;
            }
            return;
        }

        if (this.waterDropCooldown > 0 && this.currentState === window.State.GROUNDED) {
            this.isUnderwater = false;
            return;
        }

        const x = characterEntity.position[0];
        const y = characterEntity.position[1];
        const z = characterEntity.position[2];

        const waterLevel = this.getWaterSurfaceElevation(x, z);
        
        let groundY = null;
        if (window.CollisionWorld) {
            groundY = window.CollisionWorld.getGroundHeight(x, z, y, 0.4, 5.0);
        }

        // Submerged if foot Y is at or below water level and not standing on dry ground at or above water level
        const isWater = (waterLevel !== null) && (y <= waterLevel + 0.1) && (groundY === null || groundY < waterLevel - 0.15);

        if (isWater) {
            this.isUnderwater = true;
            if (this.currentState !== window.State.SWIMMING && this.currentState !== window.State.BOATING && this.currentState !== window.State.FLOATING) {
                this.currentState = window.State.SWIMMING;
                this.verticalVelocity = 0.0;
                this.isLockedInTransition = false;
                if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'land');
            }
        } else {
            this.isUnderwater = false;
            if (this.currentState === window.State.SWIMMING) {
                this.currentState = window.State.FALLING;
            }
        }
    }

    mountBoat(characterEntity, boatEntity) {
        this.activeVehicle = boatEntity;
        this.currentState = window.State.BOATING;
        this.boatVelocity = 0.0;
        this.isUnderwater = false;
        characterEntity.position[0] = boatEntity.position[0];
        characterEntity.position[2] = boatEntity.position[2];
        if (boatEntity.rotationY !== undefined) {
            characterEntity.rotationY = boatEntity.rotationY;
        }
    }

    dismountBoat(characterEntity) {
        this.activeVehicle = null;
        this.boatVelocity = 0.0;

        const charX = characterEntity.position[0];
        const charZ = characterEntity.position[2];
        const angles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
        let placedOnLand = false;

        if (window.CollisionWorld) {
            for (const a of angles) {
                const testX = charX + Math.cos(a) * 2.2;
                const testZ = charZ + Math.sin(a) * 2.2;
                const groundY = window.CollisionWorld.getGroundHeight(testX, testZ, characterEntity.position[1], 1.2, 5.0);
                if (groundY !== null && groundY >= -0.05) {
                    characterEntity.position[0] = testX;
                    characterEntity.position[1] = groundY;
                    characterEntity.position[2] = testZ;
                    this.currentState = window.State.GROUNDED;
                    this.isUnderwater = false;
                    placedOnLand = true;
                    break;
                }
            }
        }

        if (!placedOnLand) {
            characterEntity.position[0] += Math.sin(characterEntity.rotationY + Math.PI / 2) * 1.8;
            characterEntity.position[2] += Math.cos(characterEntity.rotationY + Math.PI / 2) * 1.8;
            characterEntity.position[1] = -0.2;
            this.currentState = window.State.SWIMMING;
            this.isUnderwater = true;
        }
    }

    updateBoatingPhysics(dt, inputData, characterEntity) {
        const { inputX, inputZ } = inputData;
        this.waveTimer += dt;

        // Steering rudder (Left stick X or S/F keys)
        const steerResponse = 0.4 + 0.6 * Math.min(1.0, Math.abs(this.boatVelocity) / 4.0);
        characterEntity.rotationY -= inputX * this.boatSteerRate * steerResponse * dt;

        // Throttle & Reverse (Left stick Y or W/E/D keys, forward is negative inputZ)
        if (inputZ < -0.1) {
            const throttle = -inputZ;
            this.boatVelocity = Math.min(this.boatMaxSpeed, this.boatVelocity + this.boatAccel * throttle * dt);
        } else if (inputZ > 0.1) {
            const reverse = inputZ;
            if (this.boatVelocity > 0.5) {
                this.boatVelocity = Math.max(0.0, this.boatVelocity - this.boatBrake * reverse * dt);
            } else {
                this.boatVelocity = Math.max(this.boatMaxReverse, this.boatVelocity - this.boatAccel * 0.6 * reverse * dt);
            }
        } else {
            this.boatVelocity *= Math.exp(-this.boatWaterDrag * dt);
            if (Math.abs(this.boatVelocity) < 0.05) this.boatVelocity = 0.0;
        }

        const headingSin = Math.sin(characterEntity.rotationY);
        const headingCos = Math.cos(characterEntity.rotationY);
        const moveX = -headingSin * this.boatVelocity * dt;
        const moveZ = -headingCos * this.boatVelocity * dt;

        characterEntity.position[0] += moveX;
        characterEntity.position[2] += moveZ;

        this.resolveWallCollisions(characterEntity);

        const waterLevel = this.getWaterSurfaceElevation(characterEntity.position[0], characterEntity.position[2]);
        const wave = Math.sin(this.waveTimer * 2.5 + characterEntity.position[0] * 0.08 + characterEntity.position[2] * 0.08) * 0.06;
        const boatY = (waterLevel !== null ? waterLevel : 0.0) + wave - 0.15;

        characterEntity.position[1] = boatY + 0.35;

        if (this.activeVehicle) {
            this.activeVehicle.position[0] = characterEntity.position[0];
            this.activeVehicle.position[1] = boatY;
            this.activeVehicle.position[2] = characterEntity.position[2];
            this.activeVehicle.rotationY = characterEntity.rotationY;
        }
    }

    resolveWallCollisions(characterEntity) {
        if (!window.CollisionWorld || typeof window.CollisionWorld.resolveWallCollisions !== 'function') return;

        const corrected = window.CollisionWorld.resolveWallCollisions(
            characterEntity.position[0],
            characterEntity.position[1] + 1.0,
            characterEntity.position[2],
            0.5
        );

        characterEntity.position[0] = corrected[0];
        characterEntity.position[2] = corrected[2];
    }

    calculateLedgeNormal(bankX, bankZ, currentY) {
        const sampleDist = 0.5;
        let sumX = 0, sumZ = 0, count = 0;
        const angles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4];
        
        for (const a of angles) {
            const px = bankX + Math.cos(a) * sampleDist;
            const pz = bankZ + Math.sin(a) * sampleDist;
            const hit = window.CollisionWorld ? window.CollisionWorld.getGroundHeight(px, pz, currentY, 1.0, 3.0) : null;
            // Point is open air if no ground or if ground is significantly lower (> 0.8m drop)
            if (hit === null || hit < currentY - 0.8) {
                sumX += Math.cos(a);
                sumZ += Math.sin(a);
                count++;
            }
        }
        
        if (count > 0) {
            const len = Math.hypot(sumX, sumZ) || 1.0;
            return [sumX / len, 0, sumZ / len];
        }
        return null;
    }

    probeTallLedge(characterEntity, moveDir) {
        if (!window.CollisionWorld) return null;

        // When in interaction range of an exit door, disable ledge climb so the player enters the door instead
        const gs = window.GameState;
        if (gs && gs.nearbyExit) return null;

        const charX = characterEntity.position[0];
        const charY = characterEntity.position[1];
        const charZ = characterEntity.position[2];

        const forwardX = charX + moveDir[0] * 0.6;
        const forwardZ = charZ + moveDir[1] * 0.6;

        const mantleMax = Math.min(1.2, this.maxClimbLedgeHeight);

        // 1. Check Mantle range (charY + 0.4 .. charY + mantleMax) in a single query
        if (mantleMax > 0.4) {
            const mantleTri = window.CollisionWorld.getGroundTriangle(forwardX, forwardZ, charY + mantleMax, 0.0, mantleMax - 0.4);
            if (mantleTri && mantleTri.normal[1] >= this.maxSlopeCos) {
                const delta = mantleTri.heightY - charY;
                if (delta > 0.4 && delta <= mantleMax) {
                    return {
                        targetPos: [forwardX, mantleTri.heightY, forwardZ],
                        heightDelta: delta,
                        type: 'MANTLE'
                    };
                }
            }
        }

        // 2. Check High Climb range (charY + mantleMax .. charY + maxClimbLedgeHeight) in a single query
        if (this.maxClimbLedgeHeight > mantleMax) {
            const highTri = window.CollisionWorld.getGroundTriangle(
                forwardX,
                forwardZ,
                charY + this.maxClimbLedgeHeight,
                0.0,
                this.maxClimbLedgeHeight - mantleMax
            );
            if (highTri && highTri.normal[1] >= this.maxSlopeCos) {
                const delta = highTri.heightY - charY;
                if (delta > mantleMax && delta <= this.maxClimbLedgeHeight) {
                    return {
                        targetPos: [forwardX, highTri.heightY, forwardZ],
                        heightDelta: delta,
                        type: 'HIGH_CLIMB'
                    };
                }
            }
        }

        return null;
    }

    tryExecuteLedgeAction(characterEntity, worldEntity, snapCameraCallback) {
        if (!this.pendingLedgeAction) return false;
        if (this.currentState === window.State.FLOATING) return false;

        if (this.pendingLedgeAction.type === 'MANTLE' || this.pendingLedgeAction.type === 'HIGH_CLIMB') {
            this.currentState = window.State.CLIMBING;
            this.isLockedInTransition = true;
            this.actionTimer = 0.0;
            
            const height = this.pendingLedgeAction.heightDelta || 1.5;
            this.actionDuration = Math.min(0.75, Math.max(0.35, height * 0.18));

            this.startPos = [...characterEntity.position];
            this.targetPos = [...this.pendingLedgeAction.targetPos];

            if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'assign');
            this.pendingLedgeAction = null;
            return true;
        }

        return false;
    }

    updatePhysics(dt, inputData, characterEntity, worldEntity, camPos, zoomSequenceState, snapCameraCallback) {
        let { inputX, inputZ, moveSpeed, speedMultiplier, rawSelectPressed } = inputData;

        this.checkWaterSurfaces(characterEntity);

        if (this.isLockedInTransition || this.currentState === window.State.CLIMBING || this.currentState === window.State.HOPPING || zoomSequenceState === 'ZOOM_IN' || zoomSequenceState === 'PAUSE_HOLD') {
            inputX = 0;
            inputZ = 0;
            moveSpeed = 0;
        }

        if (this.isFirstPerson) {
            if (Math.abs(inputX) > 0.1) characterEntity.rotationY -= inputX * 2.0 * dt;
            if (Math.abs(inputZ) > 0.1) {
                this.pitchX -= inputZ * 2.0 * dt;
                this.pitchX = Math.max(-1.0, Math.min(1.0, this.pitchX));
            }
            if (window.CollisionWorld) {
                const currentGroundY = window.CollisionWorld.getGroundHeight(characterEntity.position[0], characterEntity.position[2], characterEntity.position[1], 0.60, 5.0);
                if (currentGroundY !== null) characterEntity.position[1] = currentGroundY;
            }
            this.resolveWallCollisions(characterEntity);
        } else {
            if (inputData && inputData.isZTargetHeld) {
                if (this.lockedZTargetFacing === null) {
                    // Lock facing direction to character's current facing direction when Z-targeting begins
                    this.lockedZTargetFacing = characterEntity.rotationY;
                    if (typeof snapCameraCallback === 'function') {
                        snapCameraCallback();
                    }
                }
                characterEntity.rotationY = this.lockedZTargetFacing;
            } else {
                this.lockedZTargetFacing = null;
            }

            const hasLookStraight = window.GameState && (
                typeof window.GameState.hasEquippedAccessory === 'function'
                    ? window.GameState.hasEquippedAccessory('look_straight')
                    : (window.GameState.hasEquippedItem ? window.GameState.hasEquippedItem('look_straight') : false)
            );

            let worldMoveX = 0, worldMoveZ = 0;
            if (hasLookStraight) {
                // Look Straight: S, D, E, and F move Link relative to the direction he is facing
                const facingAngle = characterEntity.rotationY;
                const sinFacing = Math.sin(facingAngle), cosFacing = Math.cos(facingAngle);
                worldMoveX = cosFacing * inputX + sinFacing * inputZ;
                worldMoveZ = -sinFacing * inputX + cosFacing * inputZ;
            } else if (zoomSequenceState === 'HOLD_LOCKED' || (inputData && inputData.isZTargetHeld)) {
                const facingAngle = (inputData && inputData.isZTargetHeld && this.lockedZTargetFacing !== null)
                    ? this.lockedZTargetFacing
                    : characterEntity.rotationY;
                const sinFacing = Math.sin(facingAngle), cosFacing = Math.cos(facingAngle);
                worldMoveX = cosFacing * inputX + sinFacing * inputZ;
                worldMoveZ = -sinFacing * inputX + cosFacing * inputZ;
            } else {
                let camDX = characterEntity.position[0] - camPos[0], camDZ = characterEntity.position[2] - camPos[2];
                let forwardLen = Math.hypot(camDX, camDZ);
                if (forwardLen < 0.6 && window.GameState && window.GameState.unoccludedCamPos) {
                    camDX = characterEntity.position[0] - window.GameState.unoccludedCamPos[0];
                    camDZ = characterEntity.position[2] - window.GameState.unoccludedCamPos[2];
                    forwardLen = Math.hypot(camDX, camDZ);
                }
                const fwdX = forwardLen > 0.0001 ? camDX / forwardLen : 0, fwdZ = forwardLen > 0.0001 ? camDZ / forwardLen : -1;
                worldMoveX = -fwdZ * inputX + fwdX * (-inputZ);
                worldMoveZ = fwdX * inputX + fwdZ * (-inputZ);
            }

            switch (this.currentState) {
                case window.State.BOATING:
                    this.updateBoatingPhysics(dt, inputData, characterEntity);
                    break;

                case window.State.SWIMMING:
                    if (this.waterDropCooldown > 0) {
                        this.waterDropCooldown -= dt;
                    }
                    if (moveSpeed > 0) {
                        characterEntity.position[0] += worldMoveX * this.swimSpeed * dt;
                        characterEntity.position[2] += worldMoveZ * this.swimSpeed * dt;
                        if (!hasLookStraight) {
                            characterEntity.rotationY = Math.atan2(-worldMoveX, -worldMoveZ);
                        }
                    }

                    const waterLevel = this.getWaterSurfaceElevation(characterEntity.position[0], characterEntity.position[2]);
                    if (waterLevel !== null && characterEntity.position[1] > waterLevel - 0.15) {
                        characterEntity.position[1] = waterLevel - 0.15;
                    }

                    // Probe for climbable shore, dock, or land ledge directly in front of Link
                    this.pendingLedgeAction = null;
                    if (window.CollisionWorld && (!this.waterDropCooldown || this.waterDropCooldown <= 0)) {
                        const fwdX = -Math.sin(characterEntity.rotationY);
                        const fwdZ = -Math.cos(characterEntity.rotationY);
                        for (const dist of [0.70, 0.95, 0.50]) {
                            const px = characterEntity.position[0] + fwdX * dist;
                            const pz = characterEntity.position[2] + fwdZ * dist;
                            const tri = window.CollisionWorld.getGroundTriangle(px, pz, (waterLevel !== null ? waterLevel : 0.0) + 1.8, 0.0, 2.2);
                            if (tri && tri.normal[1] >= this.maxSlopeCos && tri.heightY >= (waterLevel !== null ? waterLevel - 0.05 : -0.05)) {
                                const heightDelta = tri.heightY - characterEntity.position[1];
                                if (heightDelta > 0.15 && heightDelta <= 1.8) {
                                    this.pendingLedgeAction = {
                                        targetPos: [px, tri.heightY, pz],
                                        heightDelta: heightDelta,
                                        type: 'MANTLE'
                                    };
                                    break;
                                }
                            }
                        }
                    }

                    // Press K to climb onto land out of water!
                    if (rawSelectPressed && this.pendingLedgeAction) {
                        this.currentState = window.State.CLIMBING;
                        this.isLockedInTransition = true;
                        this.isUnderwater = false;
                        this.actionTimer = 0.0;
                        const h = this.pendingLedgeAction.heightDelta || 0.45;
                        this.actionDuration = Math.min(0.60, Math.max(0.35, h * 0.35));
                        this.startPos = [...characterEntity.position];
                        this.targetPos = [...this.pendingLedgeAction.targetPos];
                        this.waterDropCooldown = 0.6;
                        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'assign');
                        this.pendingLedgeAction = null;
                        return;
                    }

                    if (rawSelectPressed) {
                        characterEntity.position[1] += this.buoyancyForce * dt;
                    } else {
                        characterEntity.position[1] += 2.0 * dt;
                    }
                    if (waterLevel !== null && characterEntity.position[1] > waterLevel - 0.15) {
                        characterEntity.position[1] = waterLevel - 0.15;
                    }

                    // Direct gentle slope shore exit
                    if (window.CollisionWorld && (!this.waterDropCooldown || this.waterDropCooldown <= 0)) {
                        const solidGroundY = window.CollisionWorld.getGroundHeight(characterEntity.position[0], characterEntity.position[2], characterEntity.position[1], 0.60, 0.8);
                        if (solidGroundY !== null && solidGroundY >= (waterLevel !== null ? waterLevel - 0.05 : -0.05)) {
                            characterEntity.position[1] = solidGroundY;
                            this.currentState = window.State.GROUNDED;
                            this.isUnderwater = false;
                        }
                    }
                    this.resolveWallCollisions(characterEntity);
                    break;

                case window.State.JUMP_DOWN:
                    this.actionTimer += dt;
                    const jumpProgress = Math.min(1.0, this.actionTimer / this.actionDuration);

                    characterEntity.position[0] += this.airVelocity[0] * dt;
                    characterEntity.position[2] += this.airVelocity[1] * dt;
                    
                    this.verticalVelocity += this.gravity * dt;
                    characterEntity.position[1] += this.verticalVelocity * dt;

                    if (jumpProgress >= 1.0) {
                        this.currentState = window.State.FALLING;
                        this.isLockedInTransition = false;
                    }
                    this.resolveWallCollisions(characterEntity);
                    break;

                case window.State.HOPPING:
                case window.State.CLIMBING:
                    this.actionTimer += dt;
                    const progress = Math.min(1.0, this.actionTimer / this.actionDuration);

                    if (this.currentState === window.State.HOPPING) {
                        characterEntity.position[0] = this.startPos[0] + (this.targetPos[0] - this.startPos[0]) * progress;
                        characterEntity.position[2] = this.startPos[2] + (this.targetPos[2] - this.startPos[2]) * progress;
                        const arcHeight = 0.25 * Math.sin(progress * Math.PI);
                        characterEntity.position[1] = this.startPos[1] + (this.targetPos[1] - this.startPos[1]) * progress + arcHeight;
                    } else {
                        // Eased 2-phase pull-up: rise vertically first, then step forward onto the ledge
                        const yT = Math.min(1.0, progress * 1.35);
                        const ySmooth = Math.sin(yT * Math.PI * 0.5);
                        const xzT = Math.max(0.0, (progress - 0.25) / 0.75);
                        const xzSmooth = xzT * xzT * (3 - 2 * xzT);

                        characterEntity.position[0] = this.startPos[0] + (this.targetPos[0] - this.startPos[0]) * xzSmooth;
                        characterEntity.position[1] = this.startPos[1] + (this.targetPos[1] - this.startPos[1]) * ySmooth;
                        characterEntity.position[2] = this.startPos[2] + (this.targetPos[2] - this.startPos[2]) * xzSmooth;
                    }

                    if (progress >= 1.0) {
                        characterEntity.position = [...this.targetPos];
                        this.currentState = window.State.GROUNDED;
                        this.isLockedInTransition = false;
                        this.isUnderwater = false;
                        this.waterDropCooldown = 0.6;
                        this.pendingLedgeAction = null;
                        this._wasStoppedLastFrame = true;
                    }
                    break;

                case window.State.FLOATING:
                    this.pendingLedgeAction = null;
                    if (rawSelectPressed) {
                        characterEntity.position[1] += this.floatDescentSpeed * dt;
                    } else {
                        characterEntity.position[1] += this.floatAscentSpeed * dt;
                    }
                    if (moveSpeed > 0) {
                        characterEntity.position[0] += worldMoveX * moveSpeed * dt;
                        characterEntity.position[2] += worldMoveZ * moveSpeed * dt;
                        if (!hasLookStraight) {
                            characterEntity.rotationY = Math.atan2(-worldMoveX, -worldMoveZ);
                        }
                    }
                    this.resolveWallCollisions(characterEntity);
                    break;

                case window.State.GROUNDED:
                case window.State.SLIDING:
                    const charSin = Math.sin(characterEntity.rotationY);
                    const charCos = Math.cos(characterEntity.rotationY);
                    const moveDir = [worldMoveX || -charSin, worldMoveZ || -charCos];

                    if (moveSpeed > 0 || !this._wasStoppedLastFrame || rawSelectPressed) {
                        const tallLedge = this.probeTallLedge(characterEntity, moveDir);
                        if (tallLedge) {
                            this.pendingLedgeAction = {
                                type: tallLedge.type || (tallLedge.heightDelta > 1.2 ? 'HIGH_CLIMB' : 'MANTLE'),
                                targetPos: tallLedge.targetPos,
                                heightDelta: tallLedge.heightDelta,
                                moveDir: moveDir
                            };
                        } else {
                            this.pendingLedgeAction = null;
                        }
                    }

                    if (rawSelectPressed && this.pendingLedgeAction) {
                        if (this.tryExecuteLedgeAction(characterEntity, worldEntity, snapCameraCallback)) {
                            this._wasStoppedLastFrame = false;
                            return;
                        }
                    }

                    const currentTriData = (moveSpeed > 0 || !this._wasStoppedLastFrame || this.currentState === window.State.SLIDING) && window.CollisionWorld
                        ? window.CollisionWorld.getGroundTriangle(characterEntity.position[0], characterEntity.position[2], characterEntity.position[1], 0.35, 5.0)
                        : null;

                    // If standing on a steep non-walkable slope (63 deg, 66 deg, 68 deg), execute slope slide physics
                    if (currentTriData !== null && currentTriData.normal[1] < this.maxSlopeCos) {
                        this.currentState = window.State.SLIDING;
                        this.pendingLedgeAction = null; // Disable mantle on steep slides
                        this._wasStoppedLastFrame = false;

                        const normal = currentTriData.normal;
                        // Downward slope vector projection
                        const slideX = normal[0] * (1.0 - normal[1]);
                        const slideZ = normal[2] * (1.0 - normal[1]);

                        characterEntity.position[0] += slideX * this.slideSpeed * dt;
                        characterEntity.position[2] += slideZ * this.slideSpeed * dt;
                        characterEntity.position[1] = currentTriData.heightY;

                        this.resolveWallCollisions(characterEntity);
                        return;
                    } else if (this.currentState === window.State.SLIDING) {
                        this.currentState = window.State.GROUNDED;
                    }

                    if (inputData && inputData.isZTargetHeld) {
                        characterEntity.rotationY = this.lockedZTargetFacing !== null ? this.lockedZTargetFacing : characterEntity.rotationY;
                    }

                    if (moveSpeed > 0 && !this.isLockedInTransition) {
                        this._wasStoppedLastFrame = false;
                        if (inputData && inputData.isZTargetHeld) {
                            // Ocarina of Time Z-Targeting: lock facing direction forward while strafing left/right
                            characterEntity.rotationY = this.lockedZTargetFacing !== null ? this.lockedZTargetFacing : characterEntity.rotationY;
                        } else if (hasLookStraight) {
                            // Look Straight: Link maintains his facing direction while moving relative to it
                        } else if (zoomSequenceState !== 'HOLD_LOCKED') {
                            characterEntity.rotationY = Math.atan2(-worldMoveX, -worldMoveZ);
                        }

                        let nextX = characterEntity.position[0] + worldMoveX * moveSpeed * dt;
                        let nextZ = characterEntity.position[2] + worldMoveZ * moveSpeed * dt;

                        // Resolve wall and hanging-wall collisions at current elevation before ground evaluation
                        // so obstructing walls of upper floors stop the player without snapping to the floor above.
                        if (window.CollisionWorld && typeof window.CollisionWorld.resolveWallCollisions === 'function') {
                            const corrected = window.CollisionWorld.resolveWallCollisions(
                                nextX,
                                characterEntity.position[1] + 1.0,
                                nextZ,
                                0.5
                            );
                            nextX = corrected[0];
                            nextZ = corrected[2];
                        }

                        const stepDist = Math.hypot(nextX - characterEntity.position[0], nextZ - characterEntity.position[2]);
                        const maxWalkStepUp = Math.min(0.60, stepDist * Math.tan(this.maxSlopeAngle * Math.PI / 180.0) + 0.25);

                        const targetTriData = window.CollisionWorld ? window.CollisionWorld.getGroundTriangle(nextX, nextZ, characterEntity.position[1], maxWalkStepUp, 5.0) : null;

                        if (targetTriData !== null && targetTriData.normal[1] >= this.maxSlopeCos) {
                            const heightDelta = targetTriData.heightY - characterEntity.position[1];
                            this.activeTriangleIndex = targetTriData.triIndex;

                            if (heightDelta >= -1.0 && heightDelta <= maxWalkStepUp) {
                                // Smooth walking up slopes <= 62 degrees (like the 60 deg ramp)
                                characterEntity.position[0] = nextX;
                                characterEntity.position[2] = nextZ;
                                characterEntity.position[1] = targetTriData.heightY;
                                this.jumpOffPoint[0] = characterEntity.position[0];
                                this.jumpOffPoint[1] = characterEntity.position[1];
                                this.jumpOffPoint[2] = characterEntity.position[2];

                            } else if (heightDelta < -1.0) {
                                // Stepping off steep drop (> 1.0m) triggers short jump down
                                this.currentState = window.State.JUMP_DOWN;
                                this.isLockedInTransition = true;
                                this.actionTimer = 0.0;
                                this.actionDuration = 0.15;
                                this.verticalVelocity = 2.0;
                                this.airVelocity[0] = worldMoveX * moveSpeed;
                                this.airVelocity[1] = worldMoveZ * moveSpeed;
                                characterEntity.position[0] = nextX;
                                characterEntity.position[2] = nextZ;
                                this.jumpOffPoint = [...characterEntity.position];
                            }
                        } else if (targetTriData !== null && targetTriData.normal[1] < this.maxSlopeCos) {
                            // Moving forward onto a steep slope causes sliding back along slope normal
                            const normal = targetTriData.normal;
                            const slideX = normal[0] * (1.0 - normal[1]);
                            const slideZ = normal[2] * (1.0 - normal[1]);

                            characterEntity.position[0] += slideX * this.slideSpeed * dt;
                            characterEntity.position[2] += slideZ * this.slideSpeed * dt;
                            characterEntity.position[1] = targetTriData.heightY;
                            this.currentState = window.State.SLIDING;
                            this.resolveWallCollisions(characterEntity);
                        } else {
                            // Stepping off open edge
                            const waterLevel = this.getWaterSurfaceElevation(nextX, nextZ);
                            if (waterLevel !== null && characterEntity.position[1] <= waterLevel + 0.5) {
                                // Direct smooth walk-off from low parcel bank directly into swimming locomotion
                                characterEntity.position[0] = nextX;
                                characterEntity.position[2] = nextZ;
                                characterEntity.position[1] = waterLevel - 0.15;
                                this.currentState = window.State.SWIMMING;
                                this.isUnderwater = true;
                                this.verticalVelocity = 0.0;
                                this.isLockedInTransition = false;
                                this.waterDropCooldown = 0.5; // 500ms cooldown prevents instant snap back to ledge
                                if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'land');
                            } else {
                                this.currentState = window.State.JUMP_DOWN;
                                this.isLockedInTransition = true;
                                this.actionTimer = 0.0;
                                this.actionDuration = 0.15;
                                this.verticalVelocity = 2.0;
                                this.airVelocity[0] = worldMoveX * moveSpeed;
                                this.airVelocity[1] = worldMoveZ * moveSpeed;
                                characterEntity.position[0] = nextX;
                                characterEntity.position[2] = nextZ;
                                this.jumpOffPoint = [...characterEntity.position];
                            }
                        }
                    } else if (window.CollisionWorld && !this._wasStoppedLastFrame) {
                        // 0.1 increment rule upon stopping in 3D rooms (run once when coming to a stop)
                        characterEntity.position[0] = Math.round(characterEntity.position[0] * 10) / 10;
                        characterEntity.position[2] = Math.round(characterEntity.position[2] * 10) / 10;
                        this.resolveWallCollisions(characterEntity);
                        const currentGroundY = window.CollisionWorld.getGroundHeight(characterEntity.position[0], characterEntity.position[2], characterEntity.position[1], 0.60, 5.0);
                        if (currentGroundY === null) {
                            this.currentState = window.State.FALLING;
                            this.jumpOffPoint = [...characterEntity.position];
                            this.verticalVelocity = 0.0;
                            this.airVelocity[0] = 0.0;
                            this.airVelocity[1] = 0.0;
                            this._wasStoppedLastFrame = false;
                        } else {
                            characterEntity.position[1] = Math.round(currentGroundY * 10) / 10;
                            this._wasStoppedLastFrame = true;
                        }
                    }
                    break;

                case window.State.HANGING:
                    this._wasStoppedLastFrame = false;
                    if (rawSelectPressed || inputZ < -0.3) {
                        this.currentState = window.State.CLIMBING;
                        this.isLockedInTransition = true;
                        this.actionTimer = 0.0;
                        this.actionDuration = 0.4;
                        this.startPos = [...characterEntity.position];
                        this.targetPos = [...this.jumpOffPoint];
                        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'assign');
                    } else if (inputZ > 0.3) {
                        this.currentState = window.State.FALLING;
                        this.verticalVelocity = -1.0;
                        this.airVelocity[0] = 0.0;
                        this.airVelocity[1] = 0.0;
                    }
                    break;

                case window.State.JUMPING:
                case window.State.FALLING:
                    this._wasStoppedLastFrame = false;
                    this.pendingLedgeAction = null;

                    if (rawSelectPressed) {
                        characterEntity.position[1] += this.floatDescentSpeed * dt;
                        this.verticalVelocity = this.floatDescentSpeed;
                    } else {
                        this.verticalVelocity += this.gravity * dt;
                        characterEntity.position[1] += this.verticalVelocity * dt;
                    }
                    if (moveSpeed > 0 && !this.isLockedInTransition) {
                        characterEntity.position[0] += worldMoveX * moveSpeed * dt;
                        characterEntity.position[2] += worldMoveZ * moveSpeed * dt;
                        if (!hasLookStraight) {
                            characterEntity.rotationY = Math.atan2(-worldMoveX, -worldMoveZ);
                        }
                    }
                    this.resolveWallCollisions(characterEntity);

                    const waterSurface = this.getWaterSurfaceElevation(characterEntity.position[0], characterEntity.position[2]);
                    if (waterSurface !== null && characterEntity.position[1] <= waterSurface + 0.05 && this.verticalVelocity <= 0) {
                        characterEntity.position[1] = waterSurface - 0.15;
                        this.verticalVelocity = 0.0;
                        this.airVelocity[0] = 0.0;
                        this.airVelocity[1] = 0.0;
                        this.currentState = window.State.SWIMMING;
                        this.isUnderwater = true;
                        this.isLockedInTransition = false;
                        this.waterDropCooldown = 0.5;
                        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'land');
                        break;
                    }

                    const maxLandingStepUp = Math.max(0.25, Math.abs(this.verticalVelocity * dt) + 0.1);
                    const landingTriData = window.CollisionWorld ? window.CollisionWorld.getGroundTriangle(characterEntity.position[0], characterEntity.position[2], characterEntity.position[1], maxLandingStepUp, 500.0) : null;
                    if (landingTriData !== null && characterEntity.position[1] <= landingTriData.heightY && this.verticalVelocity <= 0) {
                        characterEntity.position[1] = landingTriData.heightY;
                        this.verticalVelocity = 0.0;
                        this.airVelocity[0] = 0.0;
                        this.airVelocity[1] = 0.0;
                        this.currentState = window.State.GROUNDED;
                        this.isLockedInTransition = false;
                        this.jumpOffPoint = [characterEntity.position[0], landingTriData.heightY, characterEntity.position[2]];
                        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'land');
                    } else if (landingTriData === null && (this.jumpOffPoint[1] - characterEntity.position[1] >= 40.0)) {
                        characterEntity.position = [...this.jumpOffPoint];
                        this.verticalVelocity = 0.0;
                        this.airVelocity[0] = 0.0;
                        this.airVelocity[1] = 0.0;
                        this.currentState = window.State.GROUNDED;
                        this.isLockedInTransition = false;
                        snapCameraCallback();
                        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'land');
                    }
                    break;
            }
        }
    }
}

window.PlayerPhysics = PlayerPhysics;
if (typeof window.EventBus !== 'undefined') {
    window.playerPhysicsInstance = new PlayerPhysics();
}
