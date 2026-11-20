// Camera Controller Subsystem (Decoupled & Phase-Driven with Smooth Follow Lerp)

const ZoomPhase = { 
    IDLE: 'IDLE', 
    ZOOM_IN: 'ZOOM_IN', 
    PAUSE_HOLD: 'PAUSE_HOLD', 
    HOLD_LOCKED: 'HOLD_LOCKED', 
    ZOOM_OUT: 'ZOOM_OUT' 
};

class CameraController {
    constructor() {
        // Pokemon Ruby GBA 3/4 Elevated Top-Down Perspective (~40-45 degree angle)
		let height = 2.5;
		let distance = 5;
        this.activeCamDistance = distance;
        this.activeCamHeight = height;
        this.camPos = [0, height, distance];

        this.defaultCamDistance = distance;
        this.closeCamDistance = 3.0;
        this.defaultCamHeight = height;
        this.closeCamHeight = 1.6;

        this.followLagSpeed = 10.0; // Restored smooth camera trailing lag speed
        this.zoomSequenceState = ZoomPhase.IDLE;
        this.zoomTimer = 0.0;
        this.zoomInDuration = 0.2;
        this.pauseHoldDuration = 0.1;
        this.zoomOutSpeed = 6.0;

        this.startDist = this.defaultCamDistance;
        this.startHeight = this.defaultCamHeight;
        this.lockedFacingAngle = 0.0;

        this.isTelescopeMovingZoom = false;
        this.camRotationSpeed = 3.0; // Radians per second for orbital camera rotation
        this.isRotatingToSnap = false;
        this.targetSnapAngle = 0.0;
        this.currentSnapDir = 0;
        this.isSnappedTo8Way = false;
        this.restingSnapAngle = null;
        this.snapAnchorCharPos = null;
        this.occlusionFraction = 1.0;
        this._scratchRenderCamPos = [0, height, distance];
        this._scratchCamTarget = [0, 0, 0];
        this._scratchResult = { renderCamPos: this._scratchRenderCamPos, camTarget: this._scratchCamTarget };
        this._upVec = [0, 1, 0];

        this.bindEventBus();
    }

    bindEventBus() {
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.on('camera:snapBehind', () => {
                const charEntity = window.GameState ? window.GameState.characterEntity : null;
                if (charEntity) {
                    this.activeCamDistance = this.defaultCamDistance;
                    this.activeCamHeight = this.defaultCamHeight;
                    this.snapCameraBehindCharacter(charEntity);

                    if (typeof renderer !== 'undefined' && renderer && renderer.canvas) {
                        Mat4.perspective(renderer.projMatrix, Math.PI / 4, renderer.canvas.width / renderer.canvas.height, 0.1, 2000.0);
                    }

                    const gs = window.GameState;
                    if (gs) {
                        const { renderCamPos, camTarget } = this.calculateCameraTarget(
                            charEntity, false, 0.0, gs.worldEntity, gs.playerState || 'GROUNDED', 0.016
                        );
                        gs.cameraPos = renderCamPos;
                        gs.cameraTarget = camTarget;
                    }
                }
            });

            window.EventBus.on('camera:setZoomState', (active) => {
                this.isTelescopeMovingZoom = active;
            });

            window.EventBus.on('camera:toggleFirstPerson', () => {
                const gs = window.GameState;
                if (!gs || !gs.characterEntity) return;

                const nextFirstPerson = !gs.isFirstPerson;
                this.isRotatingToSnap = false;

                if (!nextFirstPerson) {
                    gs.pitchX = 0.0;
                    this.snapCameraBehindCharacter(gs.characterEntity);
                    const { renderCamPos, camTarget } = this.calculateCameraTarget(
                        gs.characterEntity, false, 0.0, gs.worldEntity, gs.playerState || 'GROUNDED', 0.016
                    );
                    gs.cameraPos = renderCamPos;
                    gs.cameraTarget = camTarget;
                }

                gs.isFirstPerson = nextFirstPerson;
            });

            window.EventBus.on('engine:camera', ({ dt }) => {
                const gs = window.GameState;
                if (!gs || !gs.characterEntity) return;

                if (gs.lastInputData && gs.lastInputData.isZTargetHeld) {
                    this.snapCameraBehindCharacter(gs.characterEntity, this.activeCamDistance, this.activeCamHeight);
                }

                this.updateTelescopeZoom(dt, gs.characterEntity, gs.isFirstPerson || false);
                this.updateCameraRotation(dt, gs.characterEntity, gs.lastInputData, gs.isFirstPerson || false);

                const { renderCamPos, camTarget } = this.calculateCameraTarget(
                    gs.characterEntity, gs.isFirstPerson || false, gs.pitchX || 0.0, gs.worldEntity, gs.playerState || 'GROUNDED', dt
                );

                gs.cameraPos = renderCamPos;
                gs.unoccludedCamPos = [this.camPos[0], this.camPos[1], this.camPos[2]];
                gs.cameraTarget = camTarget;
                gs.zoomSequenceState = this.zoomSequenceState;
            });

            window.EventBus.on('engine:render', ({ renderer }) => {
                const gs = window.GameState;
                if (!gs || !renderer || !gs.characterEntity) return;

                const renderCamPos = gs.cameraPos || this.camPos;
                const camTarget = gs.cameraTarget || [0, 0, 0];

                this.renderScene(renderer, gs.characterEntity, gs.isFirstPerson || false, renderCamPos, camTarget);
            });
        }
    }

    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle <= -Math.PI) angle += 2 * Math.PI;
        return angle;
    }

    getNextSnapAngle(currentAngle, dir) {
        const S = Math.PI / 4; // 45 degrees
        const EPSILON = 1e-6; // Minimum angular difference to avoid targeting current point (~0.000057 degrees)

        // If resting cleanly at an 8-way point without having drifted, step to the next position
        if (this.isSnappedTo8Way && this.restingSnapAngle !== null && !this.isRotatingToSnap) {
            return this.normalizeAngle(this.restingSnapAngle + dir * S);
        }

        // Find the 8-way position that is ahead in the rotation direction, even if only slightly ahead
        let bestTarget = null;
        let minDistance = Infinity;

        for (let k = 0; k < 8; k++) {
            const candidate = this.normalizeAngle(k * S);
            let dist;
            if (dir === 1) {
                // CCW: candidate - currentAngle
                dist = (candidate - currentAngle) % (2 * Math.PI);
                if (dist < 0) dist += 2 * Math.PI;
            } else {
                // CW: currentAngle - candidate
                dist = (currentAngle - candidate) % (2 * Math.PI);
                if (dist < 0) dist += 2 * Math.PI;
            }

            if (dist > EPSILON && dist < minDistance) {
                minDistance = dist;
                bestTarget = candidate;
            }
        }

        if (bestTarget === null) {
            bestTarget = this.normalizeAngle(currentAngle + dir * S);
        }

        return bestTarget;
    }

    snapCameraBehindCharacter(characterEntity, targetDistance = this.activeCamDistance, targetHeight = this.activeCamHeight) {
        if (!characterEntity) return;
        this.isRotatingToSnap = false;
        this.isSnappedTo8Way = false;
        this.restingSnapAngle = null;
        this.snapAnchorCharPos = null;
        const sin = Math.sin(characterEntity.rotationY);
        const cos = Math.cos(characterEntity.rotationY);
        this.camPos[0] = characterEntity.position[0] + sin * targetDistance;
        this.camPos[1] = characterEntity.position[1] + targetHeight;
        this.camPos[2] = characterEntity.position[2] + cos * targetDistance;
    }

    updateCameraRotation(dt, characterEntity, inputData, isFirstPerson) {
        if (!characterEntity || isFirstPerson || !inputData) {
            this.isRotatingToSnap = false;
            return;
        }
        if (this.zoomSequenceState === ZoomPhase.ZOOM_IN || this.zoomSequenceState === ZoomPhase.PAUSE_HOLD || this.zoomSequenceState === ZoomPhase.HOLD_LOCKED) {
            this.isRotatingToSnap = false;
            return;
        }

        const isMenuOpen = window.GameState ? (window.GameState.isItemMenuOpen || window.GameState.isDebugMenuOpen) : (window.isItemMenuOpen || window.isDebugMenuOpen);
        if (isMenuOpen) {
            this.isRotatingToSnap = false;
            return;
        }

        const dx = this.camPos[0] - characterEntity.position[0];
        const dz = this.camPos[2] - characterEntity.position[2];
        const currentDist = Math.hypot(dx, dz);
        const effectiveDist = currentDist > 0.0001 ? currentDist : this.activeCamDistance;
        const currentAngle = this.normalizeAngle(Math.atan2(dx, dz));

        const S = Math.PI / 4;
        const isCCW = inputData.camRotateCCW && !inputData.camRotateCW;
        const isCW = inputData.camRotateCW && !inputData.camRotateCCW;

        const hasWalkStraight = window.GameState && (
            typeof window.GameState.hasEquippedAccessory === 'function'
                ? window.GameState.hasEquippedAccessory('walk_straight')
                : (window.GameState.hasEquippedItem ? window.GameState.hasEquippedItem('walk_straight') : false)
        );

        if (isCCW) {
            if (this.isRotatingToSnap && this.currentSnapDir === 1) {
                this.targetSnapAngle = this.normalizeAngle(this.targetSnapAngle + S);
            } else if (hasWalkStraight) {
                this.targetSnapAngle = this.getNextSnapAngle(currentAngle, 1);
            } else {
                this.targetSnapAngle = this.normalizeAngle(currentAngle + S);
            }
            this.isRotatingToSnap = true;
            this.currentSnapDir = 1;
            this.isSnappedTo8Way = false;
        } else if (isCW) {
            if (this.isRotatingToSnap && this.currentSnapDir === -1) {
                this.targetSnapAngle = this.normalizeAngle(this.targetSnapAngle - S);
            } else if (hasWalkStraight) {
                this.targetSnapAngle = this.getNextSnapAngle(currentAngle, -1);
            } else {
                this.targetSnapAngle = this.normalizeAngle(currentAngle - S);
            }
            this.isRotatingToSnap = true;
            this.currentSnapDir = -1;
            this.isSnappedTo8Way = false;
        }

        if (!this.isRotatingToSnap) return;

        const step = this.camRotationSpeed * dt;
        let newAngle = currentAngle;
        const diff = this.normalizeAngle(this.targetSnapAngle - currentAngle);

        if (this.currentSnapDir === 1) {
            // Rotating Counterclockwise (positive angle)
            const remaining = diff > 0 ? diff : 0;

            if (remaining <= step || remaining <= 0.0001) {
                newAngle = this.targetSnapAngle;
                this.isRotatingToSnap = false; // Stop! Must release and press again
                this.isSnappedTo8Way = hasWalkStraight;
                this.restingSnapAngle = hasWalkStraight ? this.targetSnapAngle : null;
                this.snapAnchorCharPos = hasWalkStraight ? [characterEntity.position[0], characterEntity.position[1], characterEntity.position[2]] : null;
            } else {
                newAngle = this.normalizeAngle(currentAngle + step);
            }
        } else if (this.currentSnapDir === -1) {
            // Rotating Clockwise (negative angle)
            const remaining = diff < 0 ? -diff : 0;

            if (remaining <= step || remaining <= 0.0001) {
                newAngle = this.targetSnapAngle;
                this.isRotatingToSnap = false; // Stop! Must release and press again
                this.isSnappedTo8Way = hasWalkStraight;
                this.restingSnapAngle = hasWalkStraight ? this.targetSnapAngle : null;
                this.snapAnchorCharPos = hasWalkStraight ? [characterEntity.position[0], characterEntity.position[1], characterEntity.position[2]] : null;
            } else {
                newAngle = this.normalizeAngle(currentAngle - step);
            }
        }

        this.camPos[0] = characterEntity.position[0] + Math.sin(newAngle) * effectiveDist;
        this.camPos[2] = characterEntity.position[2] + Math.cos(newAngle) * effectiveDist;
    }

    updateTelescopeZoom(dt, characterEntity, isFirstPerson) {
        const isMenuOpen = window.GameState ? (window.GameState.isItemMenuOpen || window.GameState.isDebugMenuOpen) : (window.isItemMenuOpen || window.isDebugMenuOpen);

        if (!isFirstPerson && !isMenuOpen) {
            if (this.isTelescopeMovingZoom && this.zoomSequenceState === ZoomPhase.IDLE) {
                this.startDist = this.activeCamDistance;
                this.startHeight = this.activeCamHeight;
                this.zoomTimer = 0.0;
                this.zoomSequenceState = ZoomPhase.ZOOM_IN;
                this.lockedFacingAngle = characterEntity.rotationY;
                if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'telescope_zoom');
            }
            if (!this.isTelescopeMovingZoom && this.zoomSequenceState === ZoomPhase.HOLD_LOCKED) {
                this.zoomSequenceState = ZoomPhase.ZOOM_OUT;
            }

            switch (this.zoomSequenceState) {
                case ZoomPhase.ZOOM_IN:
                    characterEntity.rotationY = this.lockedFacingAngle;
                    this.zoomTimer += dt;
                    const tIn = Math.min(1.0, this.zoomTimer / this.zoomInDuration);
                    this.activeCamDistance = this.startDist + (this.closeCamDistance - this.startDist) * tIn;
                    this.activeCamHeight = this.startHeight + (this.closeCamHeight - this.startHeight) * tIn;
                    this.snapCameraBehindCharacter(characterEntity, this.activeCamDistance, this.activeCamHeight);
                    if (tIn >= 1.0) {
                        this.activeCamDistance = this.closeCamDistance;
                        this.activeCamHeight = this.closeCamHeight;
                        this.zoomTimer = this.pauseHoldDuration;
                        this.zoomSequenceState = ZoomPhase.PAUSE_HOLD;
                    }
                    break;

                case ZoomPhase.PAUSE_HOLD:
                    characterEntity.rotationY = this.lockedFacingAngle;
                    this.zoomTimer -= dt;
                    this.snapCameraBehindCharacter(characterEntity, this.activeCamDistance, this.activeCamHeight);
                    if (this.zoomTimer <= 0) {
                        if (this.isTelescopeMovingZoom) {
                            this.zoomSequenceState = ZoomPhase.HOLD_LOCKED;
                        } else {
                            this.zoomSequenceState = ZoomPhase.ZOOM_OUT;
                        }
                    }
                    break;

                case ZoomPhase.HOLD_LOCKED:
                    characterEntity.rotationY = this.lockedFacingAngle;
                    this.activeCamDistance = this.closeCamDistance;
                    this.activeCamHeight = this.closeCamHeight;
                    this.snapCameraBehindCharacter(characterEntity, this.activeCamDistance, this.activeCamHeight);
                    break;

                case ZoomPhase.ZOOM_OUT:
                    this.activeCamDistance += this.zoomOutSpeed * dt;
                    if (this.activeCamDistance >= this.defaultCamDistance) {
                        this.activeCamDistance = this.defaultCamDistance;
                        this.activeCamHeight = this.defaultCamHeight;
                        this.zoomSequenceState = ZoomPhase.IDLE;
                    } else {
                        const tOut = (this.activeCamDistance - this.closeCamDistance) / (this.defaultCamDistance - this.closeCamDistance);
                        this.activeCamHeight = this.closeCamHeight + (this.defaultCamHeight - this.closeCamHeight) * tOut;
                    }
                    break;
            }
        }
    }

    calculateCameraTarget(characterEntity, isFirstPerson, pitchX, worldEntity, currentState, dt) {
        const renderCamPos = this._scratchRenderCamPos;
        const camTarget = this._scratchCamTarget;

        if (isFirstPerson) {
            renderCamPos[0] = characterEntity.position[0];
            renderCamPos[1] = characterEntity.position[1] + 1.6;
            renderCamPos[2] = characterEntity.position[2];
            const cosPitch = Math.cos(pitchX);
            const sinPitch = Math.sin(pitchX);
            const sinYaw = Math.sin(characterEntity.rotationY);
            const cosYaw = Math.cos(characterEntity.rotationY);
            camTarget[0] = renderCamPos[0] - sinYaw * cosPitch;
            camTarget[1] = renderCamPos[1] + sinPitch;
            camTarget[2] = renderCamPos[2] - cosYaw * cosPitch;
        } else {
            if (this.zoomSequenceState === ZoomPhase.ZOOM_IN || this.zoomSequenceState === ZoomPhase.PAUSE_HOLD || this.zoomSequenceState === ZoomPhase.HOLD_LOCKED) {
                // Direct Snap during scope sequence
                this.snapCameraBehindCharacter(characterEntity, this.activeCamDistance, this.activeCamHeight);
            } else {
                // Smooth Camera Trailing Lerp relative to player offset
                let targetDX = this.camPos[0] - characterEntity.position[0];
                let targetDZ = this.camPos[2] - characterEntity.position[2];
                let currentDist = Math.hypot(targetDX, targetDZ);

                if (currentState === 'BOATING') {
                    // Smoothly steer camera behind the boat's heading when sailing using angular slerp
                    const targetAngle = characterEntity.rotationY;
                    const currentCamAngle = Math.atan2(targetDX, targetDZ);
                    const angleDiff = this.normalizeAngle(targetAngle - currentCamAngle);
                    const boatAlignSpeed = 3.5;
                    const blendedAngle = currentCamAngle + angleDiff * (1.0 - Math.exp(-boatAlignSpeed * dt));
                    const boatCamDist = 6.2;
                    targetDX = Math.sin(blendedAngle) * boatCamDist;
                    targetDZ = Math.cos(blendedAngle) * boatCamDist;
                } else if (window.GameState && window.GameState.lastInputData && window.GameState.lastInputData.isZTargetHeld) {
                    // Position camera directly behind character facing the character's facing direction
                    const headingSin = Math.sin(characterEntity.rotationY);
                    const headingCos = Math.cos(characterEntity.rotationY);
                    targetDX = headingSin * this.activeCamDistance;
                    targetDZ = headingCos * this.activeCamDistance;
                } else if (currentDist > 0.0001) {
                    targetDX = (targetDX / currentDist) * this.activeCamDistance;
                    targetDZ = (targetDZ / currentDist) * this.activeCamDistance;
                } else {
                    targetDZ = this.activeCamDistance;
                }

                const camHeight = (currentState === 'BOATING') ? 2.8 : this.activeCamHeight;
                const targetCamX = characterEntity.position[0] + targetDX;
                const targetCamY = characterEntity.position[1] + camHeight;
                const targetCamZ = characterEntity.position[2] + targetDZ;

                // Frame-rate independent lerp (higher speed during hanging and boating for tight responsive tracking)
                const effectiveLagSpeed = currentState === 'BOATING' ? 12.0 : (currentState === 'HANGING' ? 8.0 : this.followLagSpeed);
                const lerpFactor = 1.0 - Math.exp(-effectiveLagSpeed * dt);

                this.camPos[0] += (targetCamX - this.camPos[0]) * lerpFactor;
                this.camPos[1] += (targetCamY - this.camPos[1]) * lerpFactor;
                this.camPos[2] += (targetCamZ - this.camPos[2]) * lerpFactor;

                if (this.snapAnchorCharPos && characterEntity) {
                    const charDistMoved = Math.hypot(
                        characterEntity.position[0] - this.snapAnchorCharPos[0],
                        characterEntity.position[2] - this.snapAnchorCharPos[2]
                    );
                    if (charDistMoved > 0.001) {
                        this.isSnappedTo8Way = false;
                        this.restingSnapAngle = null;
                        this.snapAnchorCharPos = null;
                    }
                }
            }

            camTarget[0] = characterEntity.position[0];
            camTarget[1] = characterEntity.position[1] + (currentState === 'SWIMMING' ? 0.6 : 1.0);
            camTarget[2] = characterEntity.position[2];
            
            renderCamPos[0] = this.camPos[0];
            renderCamPos[1] = this.camPos[1];
            renderCamPos[2] = this.camPos[2];

            if (window.CollisionWorld) {
                // Ignore walkable upward-facing floor polygons (ny >= 0.7) for camera line-of-sight occlusion
                const hitFraction = window.CollisionWorld.raycastSegment(camTarget, this.camPos, 0.7);
                if (hitFraction !== null) {
                    // Maintain a minimum standoff distance of at least 32% (~1.6m) so camera never collapses into player
                    const targetFraction = Math.max(0.32, hitFraction - 0.06);
                    if (targetFraction < this.occlusionFraction) {
                        // Rapid pull-in to prevent wall clipping
                        this.occlusionFraction += (targetFraction - this.occlusionFraction) * (1.0 - Math.exp(-25.0 * dt));
                    } else {
                        // Smooth ease-out to prevent alternating-frame oscillation glitch
                        this.occlusionFraction += (targetFraction - this.occlusionFraction) * (1.0 - Math.exp(-6.0 * dt));
                    }
                } else {
                    // Smooth recovery to full camera distance without sudden snapping
                    this.occlusionFraction += (1.0 - this.occlusionFraction) * (1.0 - Math.exp(-6.0 * dt));
                }

                if (this.occlusionFraction < 0.999) {
                    renderCamPos[0] = camTarget[0] + (this.camPos[0] - camTarget[0]) * this.occlusionFraction;
                    renderCamPos[1] = camTarget[1] + (this.camPos[1] - camTarget[1]) * this.occlusionFraction;
                    renderCamPos[2] = camTarget[2] + (this.camPos[2] - camTarget[2]) * this.occlusionFraction;
                }
            } else {
                this.occlusionFraction = 1.0;
            }
        }

        return this._scratchResult;
    }

    renderScene(renderer, characterEntity, isFirstPerson, renderCamPos, camTarget) {
        if (!renderer) return;
        const gl = renderer.gl;

        gl.clearColor(0.08, 0.08, 0.12, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(renderer.program);

        Mat4.lookAt(renderer.viewMatrix, renderCamPos, camTarget, this._upVec);
        gl.uniformMatrix4fv(renderer.locations.u_projectionMatrix, false, renderer.projMatrix);
        gl.uniformMatrix4fv(renderer.locations.u_viewMatrix, false, renderer.viewMatrix);

        // Guarantee worldEntity (room terrain/environment) is rendered first to establish depth buffer
        const worldEnt = window.GameState ? window.GameState.worldEntity : null;
        if (worldEnt && worldEnt.model) {
            if (worldEnt.isDynamic) worldEnt.updateMatrix();
            gl.uniform3fv(renderer.locations.u_color, worldEnt.color);
            gl.uniform1i(renderer.locations.u_unlit, worldEnt.isUnlit ? 1 : 0);
            worldEnt.model.draw(renderer.locations, worldEnt.transformMatrix, worldEnt.isDynamic);
        }

        const objs = renderer.gameObjects;
        for (let i = 0, len = objs.length; i < len; i++) {
            const obj = objs[i];
            if (obj === worldEnt) continue; // Already rendered as baseline terrain
            if (isFirstPerson && obj === characterEntity) continue;
            if (!obj.model) continue;
            
            obj.updateMatrix();
            
            gl.uniform3fv(renderer.locations.u_color, obj.color);
            gl.uniform1i(renderer.locations.u_unlit, obj.isUnlit ? 1 : 0);
            obj.model.draw(renderer.locations, obj.transformMatrix, obj.isDynamic);
        }
    }
}

window.CameraController = CameraController;
if (typeof window.EventBus !== 'undefined') {
    window.cameraControllerInstance = new CameraController();
}
