// Character Animator Subsystem (Ocarina of Time Articulated Skeletal Kinematics)
// Drives real-time visible knee, elbow, arm, leg, torso, and cap movements
// Guaranteed exact pivot points and natural human joint kinematics

class CharacterAnimator {
    constructor() {
        this.animTimer = 0.0;
        this.idleTimer = 0.0;
        this.rollTimer = 0.0;
        this.rollDuration = 0.52;
        this.isRolling = false;
        this.rollSpeed = 8.5;

        // Joint pivot positions in character model space (meters)
        this.joints = {
            hipL: [-0.13, 0.82, 0.0],
            kneeL: [-0.13, 0.46, 0.0],
            hipR: [0.13, 0.82, 0.0],
            kneeR: [0.13, 0.46, 0.0],
            shoulderL: [-0.27, 1.20, 0.0],
            elbowL: [-0.27, 0.98, 0.0],
            shoulderR: [0.27, 1.20, 0.0],
            elbowR: [0.27, 0.98, 0.0],
            neck: [0.0, 1.28, 0.0],
            cap: [0.0, 1.50, 0.10],
            torso: [0.0, 0.82, 0.0],
            wingL: [-0.06, 1.08, 0.20],
            wingR: [0.06, 1.08, 0.20]
        };

        // Internal isolated scratch matrices for makeJointTransform
        this._jointTNeg = new Float32Array(16);
        this._jointRotX = new Float32Array(16);
        this._jointRotY = new Float32Array(16);
        this._jointRotZ = new Float32Array(16);
        this._jointTPos = new Float32Array(16);
        this._jointTemp = new Float32Array(16);

        // Internal isolated scratch matrices for makeChildTransform
        this._childLocal = new Float32Array(16);
        this._childParentCopy = new Float32Array(16);

        // Dedicated limb transform buffers (zero allocations, 100% isolated)
        this._matTorso = new Float32Array(16);
        this._matHead = new Float32Array(16);
        this._matCap = new Float32Array(16);
        this._matEquip = new Float32Array(16);
        this._matThighL = new Float32Array(16);
        this._matShinL = new Float32Array(16);
        this._matThighR = new Float32Array(16);
        this._matShinR = new Float32Array(16);
        this._matUpperArmL = new Float32Array(16);
        this._matForearmL = new Float32Array(16);
        this._matUpperArmR = new Float32Array(16);
        this._matForearmR = new Float32Array(16);
        this._matWingL = new Float32Array(16);
        this._matWingR = new Float32Array(16);

        this.wingFlapTimer = 0.0;

        this.bindEventBus();
    }

    bindEventBus() {
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.on('engine:camera', ({ dt }) => {
                const gs = window.GameState;
                if (gs && gs.characterEntity && gs.characterEntity.model) {
                    this.update(dt, gs.characterEntity, gs);
                }

                // Animate remote multiplayer players independently
                if (window.DarkWorldMultiplayer && window.DarkWorldMultiplayer.remotePlayers) {
                    for (const [_, rp] of window.DarkWorldMultiplayer.remotePlayers) {
                        if (!rp || !rp.entity || !rp.entity.model) continue;
                        if (gs && rp.entity.model === gs.characterEntity.model) {
                            if (typeof gs.characterEntity.model.createInstance === 'function') {
                                rp.entity.model = gs.characterEntity.model.createInstance();
                            } else {
                                continue;
                            }
                        }
                        this.updateRemote(dt, rp);
                    }
                }
            });
        }
    }

    // Matrix utility helpers (column-major WebGL layout)
    setIdentity(m) {
        m.fill(0);
        m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
        return m;
    }

    setTranslation(m, tx, ty, tz) {
        this.setIdentity(m);
        m[12] = tx; m[13] = ty; m[14] = tz;
        return m;
    }

    setRotationX(m, angle) {
        this.setIdentity(m);
        const c = Math.cos(angle), s = Math.sin(angle);
        m[5] = c;  m[6] = s;
        m[9] = -s; m[10] = c;
        return m;
    }

    setRotationY(m, angle) {
        this.setIdentity(m);
        const c = Math.cos(angle), s = Math.sin(angle);
        m[0] = c;  m[2] = -s;
        m[8] = s;  m[10] = c;
        return m;
    }

    setRotationZ(m, angle) {
        this.setIdentity(m);
        const c = Math.cos(angle), s = Math.sin(angle);
        m[0] = c;  m[1] = s;
        m[4] = -s; m[5] = c;
        return m;
    }

    multiply(out, a, b) {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

        for (let col = 0; col < 4; col++) {
            const b0 = b[col * 4], b1 = b[col * 4 + 1], b2 = b[col * 4 + 2], b3 = b[col * 4 + 3];
            out[col * 4]     = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
            out[col * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
            out[col * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
            out[col * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        }
        return out;
    }

    // Pivot transform: M = T(J + offset) * R_Z(rz) * R_Y(ry) * R_X(rx) * T(-J)
    makeJointTransform(out, jx, jy, jz, rx, ry = 0, rz = 0, dx = 0, dy = 0, dz = 0) {
        this.setTranslation(this._jointTNeg, -jx, -jy, -jz);
        this.setRotationX(this._jointRotX, rx);
        this.multiply(this._jointTemp, this._jointRotX, this._jointTNeg);

        if (ry !== 0) {
            this.setRotationY(this._jointRotY, ry);
            this.multiply(this._jointTemp, this._jointRotY, this._jointTemp);
        }
        if (rz !== 0) {
            this.setRotationZ(this._jointRotZ, rz);
            this.multiply(this._jointTemp, this._jointRotZ, this._jointTemp);
        }

        this.setTranslation(this._jointTPos, jx + dx, jy + dy, jz + dz);
        this.multiply(out, this._jointTPos, this._jointTemp);
        return out;
    }

    // Child joint transform attached to parent joint: M_child = M_parent * M_localPivot
    makeChildTransform(out, parentMat, jx, jy, jz, rx, ry = 0, rz = 0) {
        for (let i = 0; i < 16; i++) this._childParentCopy[i] = parentMat[i];
        this.makeJointTransform(this._childLocal, jx, jy, jz, rx, ry, rz);
        this.multiply(out, this._childParentCopy, this._childLocal);
        return out;
    }

    // Attached transform for root-origin meshes (Ego Wings): M_out = parentMat * T(jx, jy, jz) * Rz * Ry * Rx
    makeAttachedTransform(out, parentMat, jx, jy, jz, rx, ry = 0, rz = 0) {
        this.setRotationX(this._childLocal, rx);

        if (ry !== 0) {
            this.setRotationY(this._jointRotY, ry);
            this.multiply(this._childLocal, this._jointRotY, this._childLocal);
        }
        if (rz !== 0) {
            this.setRotationZ(this._jointRotZ, rz);
            this.multiply(this._childLocal, this._jointRotZ, this._childLocal);
        }

        this._childLocal[12] = jx;
        this._childLocal[13] = jy;
        this._childLocal[14] = jz;

        for (let i = 0; i < 16; i++) this._childParentCopy[i] = parentMat[i];
        this.multiply(out, this._childParentCopy, this._childLocal);
        return out;
    }

    applyLimbMatrix(model, nodeName, matrix) {
        if (!model || !model.primitivesByNode) return;
        const prims = model.primitivesByNode.get(nodeName);
        if (!prims) return;
        for (let i = 0; i < prims.length; i++) {
            const m = prims[i].nodeMatrix;
            for (let k = 0; k < 16; k++) m[k] = matrix[k];
        }
    }

    triggerRoll() {
        if (this.isRolling) return;
        this.isRolling = true;
        this.rollTimer = 0.0;
        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'roll');
    }

    update(dt, charEntity, gs) {
        const model = charEntity.model;
        if (!model || !model.primitivesByNode) return;

        if (!model.primitivesByNode.has('ego_wing_left') && window.GLTFModel && window.GLTFModel._sharedWingsModel) {
            model.attachWingModel(window.GLTFModel._sharedWingsModel);
        }

        const phys = window.playerPhysicsInstance;
        const state = phys ? phys.currentState : 'GROUNDED';
        const inputData = gs ? gs.lastInputData : null;

        if (state !== 'FLOATING' && state !== 'JUMPING' && state !== 'FALLING' && state !== 'JUMP_DOWN') {
            this._matWingL.fill(0);
            this._matWingR.fill(0);
            this.applyLimbMatrix(model, 'ego_wing_left', this._matWingL);
            this.applyLimbMatrix(model, 'ego_wing_right', this._matWingR);
        }

        const moveSpeed = (inputData && !phys.isLockedInTransition) ? inputData.moveSpeed : 0;
        const isMoving = moveSpeed > 0.1 && (state === 'GROUNDED' || state === 'SLIDING');

        // Check Roll Action: Space key or Action button when moving in Grounded state
        if (inputData && (inputData.rawSelectPressed || (window.InputControllerInstance && window.InputControllerInstance.keys['space']))) {
            if (isMoving && !this.isRolling && state === 'GROUNDED') {
                this.triggerRoll();
            }
        }

        // ==========================================
        // 0. FORWARD ACTION ROLL (360 Somersault)
        // ==========================================
        if (this.isRolling) {
            this.rollTimer += dt;
            const rollProgress = Math.min(1.0, this.rollTimer / this.rollDuration);

            // Forward roll speed impulse
            const rollSin = Math.sin(charEntity.rotationY);
            const rollCos = Math.cos(charEntity.rotationY);
            charEntity.position[0] -= rollSin * this.rollSpeed * dt;
            charEntity.position[2] -= rollCos * this.rollSpeed * dt;
            if (phys) phys.resolveWallCollisions(charEntity);

            // 360 degree somersault pitch
            const rollPitch = rollProgress * Math.PI * 2.0;

            // Compact tuck: knees bent tight backward, elbows tucked forward
            this.makeJointTransform(this._matTorso, this.joints.torso[0], this.joints.torso[1], this.joints.torso[2], -rollPitch, 0, 0, 0, -0.25 * Math.sin(rollProgress * Math.PI), 0);

            this.applyLimbMatrix(model, 'torso', this._matTorso);
            this.applyLimbMatrix(model, 'head', this._matTorso);
            this.applyLimbMatrix(model, 'cap', this._matTorso);
            this.applyLimbMatrix(model, 'equipment', this._matTorso);

            // Tuck arms and legs into tight aerodynamic ball
            this.makeChildTransform(this._matUpperArmL, this._matTorso, this.joints.shoulderL[0], this.joints.shoulderL[1], this.joints.shoulderL[2], 0.8, 0, 0.4);
            this.applyLimbMatrix(model, 'left_upper_arm', this._matUpperArmL);
            this.makeChildTransform(this._matForearmL, this._matUpperArmL, this.joints.elbowL[0], this.joints.elbowL[1], this.joints.elbowL[2], 1.4);
            this.applyLimbMatrix(model, 'left_forearm', this._matForearmL);

            this.makeChildTransform(this._matUpperArmR, this._matTorso, this.joints.shoulderR[0], this.joints.shoulderR[1], this.joints.shoulderR[2], 0.8, 0, -0.4);
            this.applyLimbMatrix(model, 'right_upper_arm', this._matUpperArmR);
            this.makeChildTransform(this._matForearmR, this._matUpperArmR, this.joints.elbowR[0], this.joints.elbowR[1], this.joints.elbowR[2], 1.4);
            this.applyLimbMatrix(model, 'right_forearm', this._matForearmR);

            this.makeChildTransform(this._matThighL, this._matTorso, this.joints.hipL[0], this.joints.hipL[1], this.joints.hipL[2], 1.2);
            this.applyLimbMatrix(model, 'left_thigh', this._matThighL);
            // Knee bends backward tight into tuck (-1.6 rad)
            this.makeChildTransform(this._matShinL, this._matThighL, this.joints.kneeL[0], this.joints.kneeL[1], this.joints.kneeL[2], -1.6);
            this.applyLimbMatrix(model, 'left_shin', this._matShinL);

            this.makeChildTransform(this._matThighR, this._matTorso, this.joints.hipR[0], this.joints.hipR[1], this.joints.hipR[2], 1.2);
            this.applyLimbMatrix(model, 'right_thigh', this._matThighR);
            // Knee bends backward tight into tuck (-1.6 rad)
            this.makeChildTransform(this._matShinR, this._matThighR, this.joints.kneeR[0], this.joints.kneeR[1], this.joints.kneeR[2], -1.6);
            this.applyLimbMatrix(model, 'right_shin', this._matShinR);

            if (rollProgress >= 1.0) {
                this.isRolling = false;
                this.rollTimer = 0.0;
            }
            return;
        }

        // ==========================================
        // 1. BOATING STATE (Seated at helm)
        // ==========================================
        if (state === 'BOATING') {
            const steerX = inputData ? inputData.inputX : 0;
            const helmYaw = -steerX * 0.35;

            // Torso seated upright at boat helm
            this.makeJointTransform(this._matTorso, this.joints.torso[0], this.joints.torso[1], this.joints.torso[2], 0.1, helmYaw, 0, 0, -0.15, 0.05);
            this.applyLimbMatrix(model, 'torso', this._matTorso);
            this.applyLimbMatrix(model, 'head', this._matTorso);
            this.applyLimbMatrix(model, 'equipment', this._matTorso);

            // Cap trailing back in sea breeze
            this.makeJointTransform(this._matCap, this.joints.cap[0], this.joints.cap[1], this.joints.cap[2], -0.35, helmYaw, 0);
            this.applyLimbMatrix(model, 'cap', this._matCap);

            // Thighs rotated forward 90 degrees (+1.45 rad) to sit
            this.makeJointTransform(this._matThighL, this.joints.hipL[0], this.joints.hipL[1], this.joints.hipL[2], 1.45, 0, 0.08, 0, -0.15, 0.05);
            this.applyLimbMatrix(model, 'left_thigh', this._matThighL);
            // Knees bent downward/backward (-1.45 rad) into boat footwell
            this.makeChildTransform(this._matShinL, this._matThighL, this.joints.kneeL[0], this.joints.kneeL[1], this.joints.kneeL[2], -1.45);
            this.applyLimbMatrix(model, 'left_shin', this._matShinL);

            this.makeJointTransform(this._matThighR, this.joints.hipR[0], this.joints.hipR[1], this.joints.hipR[2], 1.45, 0, -0.08, 0, -0.15, 0.05);
            this.applyLimbMatrix(model, 'right_thigh', this._matThighR);
            // Knees bent downward/backward (-1.45 rad) into boat footwell
            this.makeChildTransform(this._matShinR, this._matThighR, this.joints.kneeR[0], this.joints.kneeR[1], this.joints.kneeR[2], -1.45);
            this.applyLimbMatrix(model, 'right_shin', this._matShinR);

            // Arms raised forward gripping wheel (+0.75 rad) with bent elbows (+0.85 rad)
            this.makeJointTransform(this._matUpperArmL, this.joints.shoulderL[0], this.joints.shoulderL[1], this.joints.shoulderL[2], 0.75 + helmYaw, 0, 0.2);
            this.applyLimbMatrix(model, 'left_upper_arm', this._matUpperArmL);
            this.makeChildTransform(this._matForearmL, this._matUpperArmL, this.joints.elbowL[0], this.joints.elbowL[1], this.joints.elbowL[2], 0.85);
            this.applyLimbMatrix(model, 'left_forearm', this._matForearmL);

            this.makeJointTransform(this._matUpperArmR, this.joints.shoulderR[0], this.joints.shoulderR[1], this.joints.shoulderR[2], 0.75 - helmYaw, 0, -0.2);
            this.applyLimbMatrix(model, 'right_upper_arm', this._matUpperArmR);
            this.makeChildTransform(this._matForearmR, this._matUpperArmR, this.joints.elbowR[0], this.joints.elbowR[1], this.joints.elbowR[2], 0.85);
            this.applyLimbMatrix(model, 'right_forearm', this._matForearmR);
            return;
        }

        // ==========================================
        // 2. SWIMMING STATE (Prone kicking in water)
        // ==========================================
        if (state === 'SWIMMING') {
            this.animTimer += dt * (isMoving ? 6.0 : 2.5);
            const swimPhase = this.animTimer;

            // Body horizontal prone pitch (belly down facing water) with gentle surface bobbing
            const swimBob = Math.sin(swimPhase * 0.7) * 0.02;
            this.makeJointTransform(this._matTorso, this.joints.torso[0], this.joints.torso[1], this.joints.torso[2], -1.25, 0, 0, 0, -0.05 + swimBob, 0);
            this.applyLimbMatrix(model, 'torso', this._matTorso);
            this.applyLimbMatrix(model, 'equipment', this._matTorso);

            // Head attached to torso neck: pitched upward (+0.95 rad) relative to prone body to look forward across water
            this.makeChildTransform(this._matHead, this._matTorso, this.joints.neck[0], this.joints.neck[1], this.joints.neck[2], 0.95, 0, 0);
            this.applyLimbMatrix(model, 'head', this._matHead);
            this.makeChildTransform(this._matCap, this._matHead, this.joints.cap[0], this.joints.cap[1], this.joints.cap[2], 0.12, 0, 0);
            this.applyLimbMatrix(model, 'cap', this._matCap);

            // Alternating flutter kicks with knees extending cleanly behind torso
            const kickL = Math.sin(swimPhase) * 0.28;
            const kickR = -kickL;
            const kneeL = Math.max(0, kickL) * 0.6 + 0.12;
            const kneeR = Math.max(0, kickR) * 0.6 + 0.12;

            this.makeChildTransform(this._matThighL, this._matTorso, this.joints.hipL[0], this.joints.hipL[1], this.joints.hipL[2], -kickL, 0, 0.06);
            this.applyLimbMatrix(model, 'left_thigh', this._matThighL);
            this.makeChildTransform(this._matShinL, this._matThighL, this.joints.kneeL[0], this.joints.kneeL[1], this.joints.kneeL[2], kneeL);
            this.applyLimbMatrix(model, 'left_shin', this._matShinL);

            this.makeChildTransform(this._matThighR, this._matTorso, this.joints.hipR[0], this.joints.hipR[1], this.joints.hipR[2], -kickR, 0, -0.06);
            this.applyLimbMatrix(model, 'right_thigh', this._matThighR);
            this.makeChildTransform(this._matShinR, this._matThighR, this.joints.kneeR[0], this.joints.kneeR[1], this.joints.kneeR[2], kneeR);
            this.applyLimbMatrix(model, 'right_shin', this._matShinR);

            // Swimming stroke: arms reaching forward ahead of shoulders with paddling rhythm
            const strokeL = Math.sin(swimPhase) * 0.35;
            const strokeR = -strokeL;
            const elbowL = 0.45 + Math.cos(swimPhase) * 0.25;
            const elbowR = 0.45 - Math.cos(swimPhase) * 0.25;

            this.makeChildTransform(this._matUpperArmL, this._matTorso, this.joints.shoulderL[0], this.joints.shoulderL[1], this.joints.shoulderL[2], -0.35 + strokeL, 0, 0.40);
            this.applyLimbMatrix(model, 'left_upper_arm', this._matUpperArmL);
            this.makeChildTransform(this._matForearmL, this._matUpperArmL, this.joints.elbowL[0], this.joints.elbowL[1], this.joints.elbowL[2], elbowL);
            this.applyLimbMatrix(model, 'left_forearm', this._matForearmL);

            this.makeChildTransform(this._matUpperArmR, this._matTorso, this.joints.shoulderR[0], this.joints.shoulderR[1], this.joints.shoulderR[2], -0.35 + strokeR, 0, -0.40);
            this.applyLimbMatrix(model, 'right_upper_arm', this._matUpperArmR);
            this.makeChildTransform(this._matForearmR, this._matUpperArmR, this.joints.elbowR[0], this.joints.elbowR[1], this.joints.elbowR[2], elbowR);
            this.applyLimbMatrix(model, 'right_forearm', this._matForearmR);
            return;
        }

        // ==========================================
        // 3. FLOATING STATE (EGO WINGS ACTIVE)
        // ==========================================
        if (state === 'FLOATING') {
            const isDescendingLocal = !!(inputData && inputData.rawSelectPressed) || !!(window.InputControllerInstance && (window.InputControllerInstance.keys[' '] || window.InputControllerInstance.keys['space'] || window.InputControllerInstance.keys['k'])) || (phys && phys.verticalVelocity < -0.15);
            const flightWeight = isDescendingLocal ? 0.0 : Math.min(1.0, Math.max(0.0, (moveSpeed - 0.10) / 0.50));

            this.idleTimer += dt * 2.0;
            const hoverRespiration = Math.sin(this.idleTimer) * 0.015;

            // Forward flight lean when traveling, steady upright when resting in hover
            const flightLean = -0.08 * flightWeight;
            const floatBobY = hoverRespiration;

            this.makeJointTransform(this._matTorso, this.joints.torso[0], this.joints.torso[1], this.joints.torso[2], flightLean, 0, 0, 0, floatBobY, 0);
            this.applyLimbMatrix(model, 'torso', this._matTorso);
            this.applyLimbMatrix(model, 'equipment', this._matTorso);

            // Head stays level looking forward
            this.makeChildTransform(this._matHead, this._matTorso, this.joints.neck[0], this.joints.neck[1], this.joints.neck[2], -flightLean * 0.5);
            this.applyLimbMatrix(model, 'head', this._matHead);

            // Cap trails in wind behind head (-0.45 in resting hover)
            const capAngle = -0.45 + (-0.25 + Math.sin(this.idleTimer * 2) * 0.05) * flightWeight * 0.5;
            this.makeChildTransform(this._matCap, this._matHead, this.joints.cap[0], this.joints.cap[1], this.joints.cap[2], capAngle);
            this.applyLimbMatrix(model, 'cap', this._matCap);

            // ==========================================
            // EGO WINGS: Fairy wings (Paris Hilton style)
            // Aligned to upper back; flaps where flutter kick had motion;
            // Slowed down flutter; present when descending
            // ==========================================
            let wingPitchL, wingYawL, wingRollL;
            let wingPitchR, wingYawR, wingRollR;

            if (isDescendingLocal) {
                // When only descending: slowed down further, serene gentle glide flutter swept back
                this.wingFlapTimer = (this.wingFlapTimer || 0) + dt * 4.2;
                const descentSin = Math.sin(this.wingFlapTimer);
                const descentCos = Math.cos(this.wingFlapTimer);

                wingPitchL = 0.05 + descentSin * 0.05;
                wingYawL = 0.26 + descentSin * 0.12;
                wingRollL = 0.18 + descentCos * 0.14;

                wingPitchR = 0.05 + descentSin * 0.05;
                wingYawR = -0.26 - descentSin * 0.12;
                wingRollR = -0.18 - descentCos * 0.14;
            } else if (flightWeight > 0.02) {
                // Forward flight: slowed down, graceful fairy wing flutter swept back behind Link
                this.wingFlapTimer = (this.wingFlapTimer || 0) + dt * (8.5 + moveSpeed * 2.0);
                const flapSin = Math.sin(this.wingFlapTimer);
                const flapCos = Math.cos(this.wingFlapTimer);

                wingPitchL = 0.04 + (flapSin * 0.08 * flightWeight);
                wingYawL = 0.28 + (flapSin * 0.30 * flightWeight);
                wingRollL = 0.15 + (flapCos * 0.22 * flightWeight);

                wingPitchR = 0.04 + (flapSin * 0.08 * flightWeight);
                wingYawR = -0.28 - (flapSin * 0.30 * flightWeight);
                wingRollR = -0.15 - (flapCos * 0.22 * flightWeight);
            } else {
                // Resting hover: wings open wide swept back behind shoulders with gentle breathing drift
                const hoverDrift = Math.sin(this.idleTimer * 1.8) * 0.05;
                wingPitchL = 0.04;
                wingYawL = 0.28 - hoverDrift;
                wingRollL = 0.15;

                wingPitchR = 0.04;
                wingYawR = -0.28 + hoverDrift;
                wingRollR = -0.15;
            }

            this.makeAttachedTransform(this._matWingL, this._matTorso, this.joints.wingL[0], this.joints.wingL[1], this.joints.wingL[2], wingPitchL, wingYawL, wingRollL);
            this.applyLimbMatrix(model, 'ego_wing_left', this._matWingL);
            this.makeAttachedTransform(this._matWingR, this._matTorso, this.joints.wingR[0], this.joints.wingR[1], this.joints.wingR[2], wingPitchR, wingYawR, wingRollR);
            this.applyLimbMatrix(model, 'ego_wing_right', this._matWingR);

            // --- LEGS (Flutter kick replaced by natural tucked levitate stance) ---
            const thighL = 0.55 + Math.sin(this.idleTimer) * 0.02;
            const kneeL = -1.15;
            this.makeChildTransform(this._matThighL, this._matTorso, this.joints.hipL[0], this.joints.hipL[1], this.joints.hipL[2], thighL, 0, 0.15);
            this.applyLimbMatrix(model, 'left_thigh', this._matThighL);
            this.makeChildTransform(this._matShinL, this._matThighL, this.joints.kneeL[0], this.joints.kneeL[1], this.joints.kneeL[2], kneeL);
            this.applyLimbMatrix(model, 'left_shin', this._matShinL);

            const thighR = 0.40 - Math.sin(this.idleTimer) * 0.02;
            const kneeR = -0.95;
            this.makeChildTransform(this._matThighR, this._matTorso, this.joints.hipR[0], this.joints.hipR[1], this.joints.hipR[2], thighR, 0, -0.15);
            this.applyLimbMatrix(model, 'right_thigh', this._matThighR);
            this.makeChildTransform(this._matShinR, this._matThighR, this.joints.kneeR[0], this.joints.kneeR[1], this.joints.kneeR[2], kneeR);
            this.applyLimbMatrix(model, 'right_shin', this._matShinR);

            // --- ARMS (Hover balance) ---
            const armDrift = Math.sin(this.idleTimer * 1.2) * 0.05;
            const armAngleL = -0.35 + armDrift;
            const elbowAngleL = 0.75;
            this.makeChildTransform(this._matUpperArmL, this._matTorso, this.joints.shoulderL[0], this.joints.shoulderL[1], this.joints.shoulderL[2], armAngleL, 0, 0.45);
            this.applyLimbMatrix(model, 'left_upper_arm', this._matUpperArmL);
            this.makeChildTransform(this._matForearmL, this._matUpperArmL, this.joints.elbowL[0], this.joints.elbowL[1], this.joints.elbowL[2], elbowAngleL);
            this.applyLimbMatrix(model, 'left_forearm', this._matForearmL);

            const armAngleR = -0.35 - armDrift;
            const elbowAngleR = 0.75;
            this.makeChildTransform(this._matUpperArmR, this._matTorso, this.joints.shoulderR[0], this.joints.shoulderR[1], this.joints.shoulderR[2], armAngleR, 0, -0.45);
            this.applyLimbMatrix(model, 'right_upper_arm', this._matUpperArmR);
            this.makeChildTransform(this._matForearmR, this._matUpperArmR, this.joints.elbowR[0], this.joints.elbowR[1], this.joints.elbowR[2], elbowAngleR);
            this.applyLimbMatrix(model, 'right_forearm', this._matForearmR);

            return;
        }

        // ==========================================
        // 3B. JUMPING / FALLING / AIRBORNE STATE
        // If descending: wings shown at slow flutter; If only falling: wings hidden
        // ==========================================
        if (state === 'JUMPING' || state === 'FALLING' || state === 'JUMP_DOWN') {
            const isDescendingLocal = !!(inputData && inputData.rawSelectPressed) || !!(window.InputControllerInstance && (window.InputControllerInstance.keys[' '] || window.InputControllerInstance.keys['space'] || window.InputControllerInstance.keys['k']));

            this.idleTimer += dt * 2.0;
            const hoverRespiration = Math.sin(this.idleTimer) * 0.015;

            this.makeJointTransform(this._matTorso, this.joints.torso[0], this.joints.torso[1], this.joints.torso[2], 0, 0, 0, 0, hoverRespiration, 0);
            this.applyLimbMatrix(model, 'torso', this._matTorso);
            this.applyLimbMatrix(model, 'equipment', this._matTorso);

            if (isDescendingLocal) {
                // Descending: Ego Wings are shown and slowed down further
                this.wingFlapTimer = (this.wingFlapTimer || 0) + dt * 4.2;
                const descentSin = Math.sin(this.wingFlapTimer);
                const descentCos = Math.cos(this.wingFlapTimer);

                const wingPitchL = 0.05 + descentSin * 0.05;
                const wingYawL = 0.26 + descentSin * 0.12;
                const wingRollL = 0.18 + descentCos * 0.14;

                const wingPitchR = 0.05 + descentSin * 0.05;
                const wingYawR = -0.26 - descentSin * 0.12;
                const wingRollR = -0.18 - descentCos * 0.14;

                this.makeAttachedTransform(this._matWingL, this._matTorso, this.joints.wingL[0], this.joints.wingL[1], this.joints.wingL[2], wingPitchL, wingYawL, wingRollL);
                this.applyLimbMatrix(model, 'ego_wing_left', this._matWingL);
                this.makeAttachedTransform(this._matWingR, this._matTorso, this.joints.wingR[0], this.joints.wingR[1], this.joints.wingR[2], wingPitchR, wingYawR, wingRollR);
                this.applyLimbMatrix(model, 'ego_wing_right', this._matWingR);
            } else {
                this._matWingL.fill(0);
                this._matWingR.fill(0);
                this.applyLimbMatrix(model, 'ego_wing_left', this._matWingL);
                this.applyLimbMatrix(model, 'ego_wing_right', this._matWingR);
            }

            this.makeChildTransform(this._matHead, this._matTorso, this.joints.neck[0], this.joints.neck[1], this.joints.neck[2], 0);
            this.applyLimbMatrix(model, 'head', this._matHead);

            this.makeChildTransform(this._matCap, this._matHead, this.joints.cap[0], this.joints.cap[1], this.joints.cap[2], -0.25);
            this.applyLimbMatrix(model, 'cap', this._matCap);

            this.makeChildTransform(this._matThighL, this._matTorso, this.joints.hipL[0], this.joints.hipL[1], this.joints.hipL[2], 0.35, 0, 0.08);
            this.applyLimbMatrix(model, 'left_thigh', this._matThighL);
            this.makeChildTransform(this._matShinL, this._matThighL, this.joints.kneeL[0], this.joints.kneeL[1], this.joints.kneeL[2], -0.6);
            this.applyLimbMatrix(model, 'left_shin', this._matShinL);

            this.makeChildTransform(this._matThighR, this._matTorso, this.joints.hipR[0], this.joints.hipR[1], this.joints.hipR[2], 0.35, 0, -0.08);
            this.applyLimbMatrix(model, 'right_thigh', this._matThighR);
            this.makeChildTransform(this._matShinR, this._matThighR, this.joints.kneeR[0], this.joints.kneeR[1], this.joints.kneeR[2], -0.6);
            this.applyLimbMatrix(model, 'right_shin', this._matShinR);

            this.makeChildTransform(this._matUpperArmL, this._matTorso, this.joints.shoulderL[0], this.joints.shoulderL[1], this.joints.shoulderL[2], -0.2, 0, 0.4);
            this.applyLimbMatrix(model, 'left_upper_arm', this._matUpperArmL);
            this.makeChildTransform(this._matForearmL, this._matUpperArmL, this.joints.elbowL[0], this.joints.elbowL[1], this.joints.elbowL[2], 0.5);
            this.applyLimbMatrix(model, 'left_forearm', this._matForearmL);

            this.makeChildTransform(this._matUpperArmR, this._matTorso, this.joints.shoulderR[0], this.joints.shoulderR[1], this.joints.shoulderR[2], -0.2, 0, -0.4);
            this.applyLimbMatrix(model, 'right_upper_arm', this._matUpperArmR);
            this.makeChildTransform(this._matForearmR, this._matUpperArmR, this.joints.elbowR[0], this.joints.elbowR[1], this.joints.elbowR[2], 0.5);
            this.applyLimbMatrix(model, 'right_forearm', this._matForearmR);

            return;
        }

        // ==========================================
        // 4. RUNNING / WALKING LOCOMOTION
        // ==========================================
        if (isMoving) {
            // Gait tiers: Slight tilt (walk), Medium tilt (jog), Full tilt (sprint)
            const isSlight = moveSpeed < 2.6;
            const isMedium = moveSpeed >= 2.6 && moveSpeed < 4.2;

            // Step cadence physically synchronized to ground displacement
            // 1 full gait cycle (2 steps) covers ~3.6 meters of terrain at full sprint,
            // scaling down to ~1.9 meters in slow walk. Prevents foot-sliding/buzzing legs.
            const strideDist = isSlight ? 1.9 : (isMedium ? 2.7 : 3.6);
            const gaitFreq = (2.0 * Math.PI) / strideDist; // radians per meter traveled
            const animSpeed = Math.max(0.8, moveSpeed) * gaitFreq;
            this.animTimer += dt * animSpeed;
            const phase = this.animTimer;

            const sinP = Math.sin(phase);
            const cosP = Math.cos(phase);

            // Forward athletic lean: Negative pitch around X rotates upper body forward into -Z
            // Sprint: -0.15 rad (~8.6 degrees forward lean)
            // Jog: -0.07 rad (~4 degrees forward lean)
            // Walk: -0.02 rad (~1.2 degrees forward lean)
            const leanForward = isSlight ? -0.02 : (isMedium ? -0.07 : -0.15);
            const bobY = Math.abs(sinP) * (isSlight ? 0.015 : (isMedium ? 0.028 : 0.040));

            this.makeJointTransform(this._matTorso, this.joints.torso[0], this.joints.torso[1], this.joints.torso[2], leanForward, 0, 0, 0, bobY, 0);
            this.applyLimbMatrix(model, 'torso', this._matTorso);
            this.applyLimbMatrix(model, 'equipment', this._matTorso);

            // Head stays level looking forward, lifting slightly relative to leaning torso
            const headPitch = -leanForward * 0.55;
            this.makeChildTransform(this._matHead, this._matTorso, this.joints.neck[0], this.joints.neck[1], this.joints.neck[2], headPitch);
            this.applyLimbMatrix(model, 'head', this._matHead);

            // Cap trails in wind behind head
            const capFlutter = isSlight 
                ? -0.15 + Math.sin(phase * 2) * 0.03
                : -0.22 - (isMedium ? 0.08 : 0.16) + Math.sin(phase * 2) * 0.08;
            this.makeChildTransform(this._matCap, this._matHead, this.joints.cap[0], this.joints.cap[1], this.joints.cap[2], capFlutter);
            this.applyLimbMatrix(model, 'cap', this._matCap);

            // --- LEGS & KNEES (Ocarina of Time Bending Knees) ---
            const strideAmp = isSlight ? 0.36 : (isMedium ? 0.50 : 0.65);
            const kneeBendMax = isSlight ? 0.60 : (isMedium ? 0.88 : 1.18);

            // Left Leg: Thigh swings forward/backward
            const thighSwingL = sinP * strideAmp;
            // Left Knee: Bends backwards up to 68 degrees during backswing and recovery!
            const kneeBendL = - (0.05 + Math.max(0, -sinP) * kneeBendMax);

            this.makeJointTransform(this._matThighL, this.joints.hipL[0], this.joints.hipL[1], this.joints.hipL[2], thighSwingL, 0, 0, 0, bobY, 0);
            this.applyLimbMatrix(model, 'left_thigh', this._matThighL);
            // VISIBLE FUNCTIONING KNEE HINGE JOINT (Bends backward naturally)
            this.makeChildTransform(this._matShinL, this._matThighL, this.joints.kneeL[0], this.joints.kneeL[1], this.joints.kneeL[2], kneeBendL);
            this.applyLimbMatrix(model, 'left_shin', this._matShinL);

            // Right Leg: Opposite phase
            const thighSwingR = -sinP * strideAmp;
            const kneeBendR = - (0.05 + Math.max(0, sinP) * kneeBendMax);

            this.makeJointTransform(this._matThighR, this.joints.hipR[0], this.joints.hipR[1], this.joints.hipR[2], thighSwingR, 0, 0, 0, bobY, 0);
            this.applyLimbMatrix(model, 'right_thigh', this._matThighR);
            // VISIBLE FUNCTIONING KNEE HINGE JOINT (Bends backward naturally)
            this.makeChildTransform(this._matShinR, this._matThighR, this.joints.kneeR[0], this.joints.kneeR[1], this.joints.kneeR[2], kneeBendR);
            this.applyLimbMatrix(model, 'right_shin', this._matShinR);

            // --- ARMS & ELBOWS (Ocarina of Time Pumping Elbows attached to leaning torso) ---
            const armAmp = isSlight ? 0.30 : (isMedium ? 0.44 : 0.58);
            const elbowBase = isSlight ? 0.28 : (isMedium ? 0.42 : 0.58);
            const elbowAmp = isSlight ? 0.22 : (isMedium ? 0.35 : 0.50);

            // Left Arm swings opposite to Left Leg
            const armSwingL = -sinP * armAmp;
            // Left Elbow: Pumps forward
            const elbowBendL = elbowBase + Math.max(0, sinP) * elbowAmp;

            this.makeChildTransform(this._matUpperArmL, this._matTorso, this.joints.shoulderL[0], this.joints.shoulderL[1], this.joints.shoulderL[2], armSwingL, 0, 0.12);
            this.applyLimbMatrix(model, 'left_upper_arm', this._matUpperArmL);
            // VISIBLE FUNCTIONING ELBOW HINGE JOINT (Bends forward naturally)
            this.makeChildTransform(this._matForearmL, this._matUpperArmL, this.joints.elbowL[0], this.joints.elbowL[1], this.joints.elbowL[2], elbowBendL);
            this.applyLimbMatrix(model, 'left_forearm', this._matForearmL);

            // Right Arm
            const armSwingR = sinP * armAmp;
            const elbowBendR = elbowBase + Math.max(0, -sinP) * elbowAmp;

            this.makeChildTransform(this._matUpperArmR, this._matTorso, this.joints.shoulderR[0], this.joints.shoulderR[1], this.joints.shoulderR[2], armSwingR, 0, -0.12);
            this.applyLimbMatrix(model, 'right_upper_arm', this._matUpperArmR);
            // VISIBLE FUNCTIONING ELBOW HINGE JOINT (Bends forward naturally)
            this.makeChildTransform(this._matForearmR, this._matUpperArmR, this.joints.elbowR[0], this.joints.elbowR[1], this.joints.elbowR[2], elbowBendR);
            this.applyLimbMatrix(model, 'right_forearm', this._matForearmR);
            return;
        }

        // ==========================================
        // 5. IDLE STATE (Ready stance & breathing)
        // ==========================================
        this.idleTimer += dt * 2.4;
        const breath = Math.sin(this.idleTimer);
        const breathY = breath * 0.008;

        this.makeJointTransform(this._matTorso, this.joints.torso[0], this.joints.torso[1], this.joints.torso[2], 0, 0, 0, 0, breathY, 0);
        this.applyLimbMatrix(model, 'torso', this._matTorso);
        this.applyLimbMatrix(model, 'head', this._matTorso);
        this.applyLimbMatrix(model, 'equipment', this._matTorso);

        this.makeJointTransform(this._matCap, this.joints.cap[0], this.joints.cap[1], this.joints.cap[2], -0.05 + breath * 0.02);
        this.applyLimbMatrix(model, 'cap', this._matCap);

        // Athletic stance: knees slightly bent backward naturally
        this.makeJointTransform(this._matThighL, this.joints.hipL[0], this.joints.hipL[1], this.joints.hipL[2], 0.04, 0, 0.05);
        this.applyLimbMatrix(model, 'left_thigh', this._matThighL);
        this.makeChildTransform(this._matShinL, this._matThighL, this.joints.kneeL[0], this.joints.kneeL[1], this.joints.kneeL[2], -0.06);
        this.applyLimbMatrix(model, 'left_shin', this._matShinL);

        this.makeJointTransform(this._matThighR, this.joints.hipR[0], this.joints.hipR[1], this.joints.hipR[2], -0.04, 0, -0.05);
        this.applyLimbMatrix(model, 'right_thigh', this._matThighR);
        this.makeChildTransform(this._matShinR, this._matThighR, this.joints.kneeR[0], this.joints.kneeR[1], this.joints.kneeR[2], -0.06);
        this.applyLimbMatrix(model, 'right_shin', this._matShinR);

        // Relaxed elbows at sides with hands ready (bent forward naturally)
        this.makeJointTransform(this._matUpperArmL, this.joints.shoulderL[0], this.joints.shoulderL[1], this.joints.shoulderL[2], 0.06 + breath * 0.02, 0, 0.14);
        this.applyLimbMatrix(model, 'left_upper_arm', this._matUpperArmL);
        this.makeChildTransform(this._matForearmL, this._matUpperArmL, this.joints.elbowL[0], this.joints.elbowL[1], this.joints.elbowL[2], 0.35 + breath * 0.03);
        this.applyLimbMatrix(model, 'left_forearm', this._matForearmL);

        this.makeJointTransform(this._matUpperArmR, this.joints.shoulderR[0], this.joints.shoulderR[1], this.joints.shoulderR[2], 0.06 - breath * 0.02, 0, -0.14);
        this.applyLimbMatrix(model, 'right_upper_arm', this._matUpperArmR);
        this.makeChildTransform(this._matForearmR, this._matUpperArmR, this.joints.elbowR[0], this.joints.elbowR[1], this.joints.elbowR[2], 0.35 - breath * 0.03);
        this.applyLimbMatrix(model, 'right_forearm', this._matForearmR);
    }

    updateRemote(dt, rp) {
        const entity = rp.entity;
        const model = entity ? entity.model : null;
        if (!model || !model.primitivesByNode) return;

        if (!model.primitivesByNode.has('ego_wing_left') && window.GLTFModel && window.GLTFModel._sharedWingsModel) {
            model.attachWingModel(window.GLTFModel._sharedWingsModel);
        }

        // Initialize remote timers and position tracking
        if (rp._animTimer === undefined) rp._animTimer = Math.random() * 10.0;
        if (rp._idleTimer === undefined) rp._idleTimer = Math.random() * 10.0;
        if (rp._prevX === undefined) {
            rp._prevX = entity.position[0];
            rp._prevY = entity.position[1];
            rp._prevZ = entity.position[2];
        }

        const dx = entity.position[0] - rp._prevX;
        const dy = entity.position[1] - (rp._prevY !== undefined ? rp._prevY : entity.position[1]);
        const dz = entity.position[2] - rp._prevZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        rp._prevX = entity.position[0];
        rp._prevY = entity.position[1];
        rp._prevZ = entity.position[2];

        // Detect if remote player was moving over this frame interval
        const moveSpeed = (dt > 0.0001) ? Math.min(6.0, dist / dt) : 0;
        const instantVy = (dt > 0.0001) ? (dy / dt) : 0;
        if (rp._smoothedVy === undefined) rp._smoothedVy = 0;
        rp._smoothedVy += (instantVy - rp._smoothedVy) * Math.min(1.0, dt * 10.0);

        // Track active descent with hold window so packet jitter does not pulse the animation
        const netVy = (entity.smoothedVy !== undefined) ? entity.smoothedVy : rp._smoothedVy;
        const isDescendingNow = (netVy < -0.12) || (instantVy < -0.12) || (rp.targetY !== undefined && rp.targetY < entity.position[1] - 0.05);
        const isAscendingNow = (netVy > 0.10) || (instantVy > 0.10) || (rp.targetY !== undefined && rp.targetY > entity.position[1] + 0.05);

        if (isDescendingNow) {
            rp._descentTimer = 0.25;
        } else if (isAscendingNow) {
            rp._descentTimer = 0.0;
        } else if (rp._descentTimer > 0) {
            rp._descentTimer = Math.max(0.0, rp._descentTimer - dt);
        }

        const isMoving = dist > 0.005 || moveSpeed > 0.12;
        const state = entity.state || 'GROUNDED';

        if (state !== 'FLOATING' && state !== 'FALLING' && state !== 'JUMPING' && state !== 'JUMP_DOWN') {
            this._matWingL.fill(0);
            this._matWingR.fill(0);
            this.applyLimbMatrix(model, 'ego_wing_left', this._matWingL);
            this.applyLimbMatrix(model, 'ego_wing_right', this._matWingR);
        }

        if (state === 'ROLLING') {
            rp._rollTimer = (rp._rollTimer || 0) + dt;
            const rollProgress = Math.min(1.0, rp._rollTimer / 0.52);
            const rollPitch = rollProgress * Math.PI * 2.0;

            this.makeJointTransform(this._matTorso, this.joints.torso[0], this.joints.torso[1], this.joints.torso[2], -rollPitch, 0, 0, 0, -0.25 * Math.sin(rollProgress * Math.PI), 0);
            this.applyLimbMatrix(model, 'torso', this._matTorso);
            this.applyLimbMatrix(model, 'head', this._matTorso);
            this.applyLimbMatrix(model, 'cap', this._matTorso);
            this.applyLimbMatrix(model, 'equipment', this._matTorso);

            this.makeChildTransform(this._matUpperArmL, this._matTorso, this.joints.shoulderL[0], this.joints.shoulderL[1], this.joints.shoulderL[2], 0.8, 0, 0.4);
            this.applyLimbMatrix(model, 'left_upper_arm', this._matUpperArmL);
            this.makeChildTransform(this._matForearmL, this._matUpperArmL, this.joints.elbowL[0], this.joints.elbowL[1], this.joints.elbowL[2], 1.4);
            this.applyLimbMatrix(model, 'left_forearm', this._matForearmL);

            this.makeChildTransform(this._matUpperArmR, this._matTorso, this.joints.shoulderR[0], this.joints.shoulderR[1], this.joints.shoulderR[2], 0.8, 0, -0.4);
            this.applyLimbMatrix(model, 'right_upper_arm', this._matUpperArmR);
            this.makeChildTransform(this._matForearmR, this._matUpperArmR, this.joints.elbowR[0], this.joints.elbowR[1], this.joints.elbowR[2], 1.4);
            this.applyLimbMatrix(model, 'right_forearm', this._matForearmR);

            this.makeChildTransform(this._matThighL, this._matTorso, this.joints.hipL[0], this.joints.hipL[1], this.joints.hipL[2], 1.2);
            this.applyLimbMatrix(model, 'left_thigh', this._matThighL);
            this.makeChildTransform(this._matShinL, this._matThighL, this.joints.kneeL[0], this.joints.kneeL[1], this.joints.kneeL[2], -1.6);
            this.applyLimbMatrix(model, 'left_shin', this._matShinL);

            this.makeChildTransform(this._matThighR, this._matTorso, this.joints.hipR[0], this.joints.hipR[1], this.joints.hipR[2], 1.2);
            this.applyLimbMatrix(model, 'right_thigh', this._matThighR);
            this.makeChildTransform(this._matShinR, this._matThighR, this.joints.kneeR[0], this.joints.kneeR[1], this.joints.kneeR[2], -1.6);
            this.applyLimbMatrix(model, 'right_shin', this._matShinR);

            if (rollProgress >= 1.0) {
                rp._rollTimer = 0;
            }
            return;
        } else {
            rp._rollTimer = 0;
        }

        if (state === 'BOATING') {
            // Torso seated upright at boat helm
            this.makeJointTransform(this._matTorso, this.joints.torso[0], this.joints.torso[1], this.joints.torso[2], 0.1, 0, 0, 0, -0.15, 0.05);
            this.applyLimbMatrix(model, 'torso', this._matTorso);
            this.applyLimbMatrix(model, 'head', this._matTorso);
            this.applyLimbMatrix(model, 'equipment', this._matTorso);
            this.applyLimbMatrix(model, 'cap', this._matTorso);
            this.makeChildTransform(this._matUpperArmL, this._matTorso, this.joints.shoulderL[0], this.joints.shoulderL[1], this.joints.shoulderL[2], 0.6, 0, 0.2);
            this.applyLimbMatrix(model, 'left_upper_arm', this._matUpperArmL);
            this.makeChildTransform(this._matForearmL, this._matUpperArmL, this.joints.elbowL[0], this.joints.elbowL[1], this.joints.elbowL[2], 0.8);
            this.applyLimbMatrix(model, 'left_forearm', this._matForearmL);
            this.makeChildTransform(this._matUpperArmR, this._matTorso, this.joints.shoulderR[0], this.joints.shoulderR[1], this.joints.shoulderR[2], 0.6, 0, -0.2);
            this.applyLimbMatrix(model, 'right_upper_arm', this._matUpperArmR);
            this.makeChildTransform(this._matForearmR, this._matUpperArmR, this.joints.elbowR[0], this.joints.elbowR[1], this.joints.elbowR[2], 0.8);
            this.applyLimbMatrix(model, 'right_forearm', this._matForearmR);
            this.makeChildTransform(this._matThighL, this._matTorso, this.joints.hipL[0], this.joints.hipL[1], this.joints.hipL[2], 1.45, 0, 0.1);
            this.applyLimbMatrix(model, 'left_thigh', this._matThighL);
            this.makeChildTransform(this._matShinL, this._matThighL, this.joints.kneeL[0], this.joints.kneeL[1], this.joints.kneeL[2], -1.55);
            this.applyLimbMatrix(model, 'left_shin', this._matShinL);
            this.makeChildTransform(this._matThighR, this._matTorso, this.joints.hipR[0], this.joints.hipR[1], this.joints.hipR[2], 1.45, 0, -0.1);
            this.applyLimbMatrix(model, 'right_thigh', this._matThighR);
            this.makeChildTransform(this._matShinR, this._matThighR, this.joints.kneeR[0], this.joints.kneeR[1], this.joints.kneeR[2], -1.55);
            this.applyLimbMatrix(model, 'right_shin', this._matShinR);
            return;
        }

        if (state === 'SWIMMING') {
            rp._animTimer += dt * (isMoving ? 6.0 : 2.5);
            const swimPhase = rp._animTimer;
            const swimBob = Math.sin(swimPhase * 0.7) * 0.02;
            this.makeJointTransform(this._matTorso, this.joints.torso[0], this.joints.torso[1], this.joints.torso[2], -1.25, 0, 0, 0, -0.05 + swimBob, 0);
            this.applyLimbMatrix(model, 'torso', this._matTorso);
            this.applyLimbMatrix(model, 'equipment', this._matTorso);
            this.makeChildTransform(this._matHead, this._matTorso, this.joints.neck[0], this.joints.neck[1], this.joints.neck[2], 0.95, 0, 0);
            this.applyLimbMatrix(model, 'head', this._matHead);
            this.makeChildTransform(this._matCap, this._matHead, this.joints.cap[0], this.joints.cap[1], this.joints.cap[2], 0.12, 0, 0);
            this.applyLimbMatrix(model, 'cap', this._matCap);
            const kickL = Math.sin(swimPhase) * 0.28;
            const kickR = -kickL;
            const kneeL = Math.max(0, kickL) * 0.6 + 0.12;
            const kneeR = Math.max(0, kickR) * 0.6 + 0.12;
            this.makeChildTransform(this._matThighL, this._matTorso, this.joints.hipL[0], this.joints.hipL[1], this.joints.hipL[2], -kickL, 0, 0.06);
            this.applyLimbMatrix(model, 'left_thigh', this._matThighL);
            this.makeChildTransform(this._matShinL, this._matThighL, this.joints.kneeL[0], this.joints.kneeL[1], this.joints.kneeL[2], kneeL);
            this.applyLimbMatrix(model, 'left_shin', this._matShinL);
            this.makeChildTransform(this._matThighR, this._matTorso, this.joints.hipR[0], this.joints.hipR[1], this.joints.hipR[2], -kickR, 0, -0.06);
            this.applyLimbMatrix(model, 'right_thigh', this._matThighR);
            this.makeChildTransform(this._matShinR, this._matThighR, this.joints.kneeR[0], this.joints.kneeR[1], this.joints.kneeR[2], kneeR);
            this.applyLimbMatrix(model, 'right_shin', this._matShinR);
            const strokeL = Math.sin(swimPhase) * 0.35;
            const strokeR = -strokeL;
            const elbowL = 0.45 + Math.cos(swimPhase) * 0.25;
            const elbowR = 0.45 - Math.cos(swimPhase) * 0.25;
            this.makeChildTransform(this._matUpperArmL, this._matTorso, this.joints.shoulderL[0], this.joints.shoulderL[1], this.joints.shoulderL[2], -0.35 + strokeL, 0, 0.40);
            this.applyLimbMatrix(model, 'left_upper_arm', this._matUpperArmL);
            this.makeChildTransform(this._matForearmL, this._matUpperArmL, this.joints.elbowL[0], this.joints.elbowL[1], this.joints.elbowL[2], elbowL);
            this.applyLimbMatrix(model, 'left_forearm', this._matForearmL);
            this.makeChildTransform(this._matUpperArmR, this._matTorso, this.joints.shoulderR[0], this.joints.shoulderR[1], this.joints.shoulderR[2], -0.35 + strokeR, 0, -0.40);
            this.applyLimbMatrix(model, 'right_upper_arm', this._matUpperArmR);
            this.makeChildTransform(this._matForearmR, this._matUpperArmR, this.joints.elbowR[0], this.joints.elbowR[1], this.joints.elbowR[2], elbowR);
            this.applyLimbMatrix(model, 'right_forearm', this._matForearmR);
            return;
        }

        // ==========================================
        // LEVITATE / FLOATING STATE (EGO WINGS ACTIVE)
        // ==========================================
        if (state === 'FLOATING') {
            const isDescending = (rp._descentTimer > 0);
            const flightWeight = isDescending ? 0.0 : Math.min(1.0, Math.max(0.0, (moveSpeed - 0.12) / 0.50));

            rp._idleTimer += dt * 2.0;
            const hoverRespiration = Math.sin(rp._idleTimer) * 0.015;

            // Forward flight lean when traveling, steady upright when resting in hover
            const flightLean = -0.08 * flightWeight;
            const floatBobY = hoverRespiration;

            this.makeJointTransform(this._matTorso, this.joints.torso[0], this.joints.torso[1], this.joints.torso[2], flightLean, 0, 0, 0, floatBobY, 0);
            this.applyLimbMatrix(model, 'torso', this._matTorso);
            this.applyLimbMatrix(model, 'equipment', this._matTorso);

            // Head stays level
            this.makeChildTransform(this._matHead, this._matTorso, this.joints.neck[0], this.joints.neck[1], this.joints.neck[2], -flightLean * 0.5);
            this.applyLimbMatrix(model, 'head', this._matHead);

            // Cap trails in wind behind head (-0.45 in resting hover)
            const capAngle = -0.45 + (-0.25 + Math.sin(rp._idleTimer * 2) * 0.05) * flightWeight * 0.5;
            this.makeChildTransform(this._matCap, this._matHead, this.joints.cap[0], this.joints.cap[1], this.joints.cap[2], capAngle);
            this.applyLimbMatrix(model, 'cap', this._matCap);

            // ==========================================
            // EGO WINGS: Fairy wings (Paris Hilton style)
            // Aligned to upper back; flaps where flutter kick had motion;
            // Slowed down flutter; present when descending
            // ==========================================
            let wingPitchL, wingYawL, wingRollL;
            let wingPitchR, wingYawR, wingRollR;

            if (isDescending) {
                // When only descending: slowed down further, serene gentle glide flutter swept back
                rp._wingFlapTimer = (rp._wingFlapTimer || 0) + dt * 4.2;
                const descentSin = Math.sin(rp._wingFlapTimer);
                const descentCos = Math.cos(rp._wingFlapTimer);

                wingPitchL = 0.05 + descentSin * 0.05;
                wingYawL = 0.26 + descentSin * 0.12;
                wingRollL = 0.18 + descentCos * 0.14;

                wingPitchR = 0.05 + descentSin * 0.05;
                wingYawR = -0.26 - descentSin * 0.12;
                wingRollR = -0.18 - descentCos * 0.14;
            } else if (flightWeight > 0.02) {
                // Forward flight: slowed down, graceful fairy wing flutter swept back behind Link
                rp._wingFlapTimer = (rp._wingFlapTimer || 0) + dt * (8.5 + moveSpeed * 2.0);
                const flapSin = Math.sin(rp._wingFlapTimer);
                const flapCos = Math.cos(rp._wingFlapTimer);

                wingPitchL = 0.04 + (flapSin * 0.08 * flightWeight);
                wingYawL = 0.28 + (flapSin * 0.30 * flightWeight);
                wingRollL = 0.15 + (flapCos * 0.22 * flightWeight);

                wingPitchR = 0.04 + (flapSin * 0.08 * flightWeight);
                wingYawR = -0.28 - (flapSin * 0.30 * flightWeight);
                wingRollR = -0.15 - (flapCos * 0.22 * flightWeight);
            } else {
                // Resting hover: wings open wide swept back behind shoulders with gentle breathing drift
                const hoverDrift = Math.sin(rp._idleTimer * 1.8) * 0.05;
                wingPitchL = 0.04;
                wingYawL = 0.28 - hoverDrift;
                wingRollL = 0.15;

                wingPitchR = 0.04;
                wingYawR = -0.28 + hoverDrift;
                wingRollR = -0.15;
            }

            this.makeAttachedTransform(this._matWingL, this._matTorso, this.joints.wingL[0], this.joints.wingL[1], this.joints.wingL[2], wingPitchL, wingYawL, wingRollL);
            this.applyLimbMatrix(model, 'ego_wing_left', this._matWingL);
            this.makeAttachedTransform(this._matWingR, this._matTorso, this.joints.wingR[0], this.joints.wingR[1], this.joints.wingR[2], wingPitchR, wingYawR, wingRollR);
            this.applyLimbMatrix(model, 'ego_wing_right', this._matWingR);

            // Natural resting hover legs (no flutter kick)
            const thighL = 0.55 + Math.sin(rp._idleTimer) * 0.02;
            const kneeL = -1.15;
            this.makeChildTransform(this._matThighL, this._matTorso, this.joints.hipL[0], this.joints.hipL[1], this.joints.hipL[2], thighL, 0, 0.15);
            this.applyLimbMatrix(model, 'left_thigh', this._matThighL);
            this.makeChildTransform(this._matShinL, this._matThighL, this.joints.kneeL[0], this.joints.kneeL[1], this.joints.kneeL[2], kneeL);
            this.applyLimbMatrix(model, 'left_shin', this._matShinL);

            const thighR = 0.40 - Math.sin(rp._idleTimer) * 0.02;
            const kneeR = -0.95;
            this.makeChildTransform(this._matThighR, this._matTorso, this.joints.hipR[0], this.joints.hipR[1], this.joints.hipR[2], thighR, 0, -0.15);
            this.applyLimbMatrix(model, 'right_thigh', this._matThighR);
            this.makeChildTransform(this._matShinR, this._matThighR, this.joints.kneeR[0], this.joints.kneeR[1], this.joints.kneeR[2], kneeR);
            this.applyLimbMatrix(model, 'right_shin', this._matShinR);

            // Arms splayed outward for hover balance
            const armDrift = Math.sin(rp._idleTimer * 1.2) * 0.05;
            const armAngleL = -0.35 + armDrift;
            const elbowAngleL = 0.75;
            this.makeChildTransform(this._matUpperArmL, this._matTorso, this.joints.shoulderL[0], this.joints.shoulderL[1], this.joints.shoulderL[2], armAngleL, 0, 0.45);
            this.applyLimbMatrix(model, 'left_upper_arm', this._matUpperArmL);
            this.makeChildTransform(this._matForearmL, this._matUpperArmL, this.joints.elbowL[0], this.joints.elbowL[1], this.joints.elbowL[2], elbowAngleL);
            this.applyLimbMatrix(model, 'left_forearm', this._matForearmL);

            const armAngleR = -0.35 - armDrift;
            const elbowAngleR = 0.75;
            this.makeChildTransform(this._matUpperArmR, this._matTorso, this.joints.shoulderR[0], this.joints.shoulderR[1], this.joints.shoulderR[2], armAngleR, 0, -0.45);
            this.applyLimbMatrix(model, 'right_upper_arm', this._matUpperArmR);
            this.makeChildTransform(this._matForearmR, this._matUpperArmR, this.joints.elbowR[0], this.joints.elbowR[1], this.joints.elbowR[2], elbowAngleR);
            this.applyLimbMatrix(model, 'right_forearm', this._matForearmR);

            return;
        }

        // ==========================================
        // AIRBORNE / FALLING / JUMPING STATE
        // If descending: wings shown at slow flutter; If only falling: wings hidden
        // ==========================================
        let isAirborneByHeight = false;
        if (window.CollisionWorld && typeof window.CollisionWorld.getGroundHeight === 'function' && state !== 'SWIMMING' && state !== 'BOATING') {
            const groundY = window.CollisionWorld.getGroundHeight(entity.position[0], entity.position[2], entity.position[1], 0.4, 500.0);
            if (groundY !== null && !isNaN(groundY) && (entity.position[1] - groundY) > 1.2) {
                isAirborneByHeight = true;
            }
        }

        if (state === 'FALLING' || state === 'JUMPING' || state === 'JUMP_DOWN' || isAirborneByHeight) {
            rp._idleTimer += dt * 2.0;
            const hoverRespiration = Math.sin(rp._idleTimer) * 0.015;

            this.makeJointTransform(this._matTorso, this.joints.torso[0], this.joints.torso[1], this.joints.torso[2], 0, 0, 0, 0, hoverRespiration, 0);
            this.applyLimbMatrix(model, 'torso', this._matTorso);
            this.applyLimbMatrix(model, 'equipment', this._matTorso);

            const isDescending = (rp._descentTimer > 0);
            if (isDescending) {
                // Descending: Ego Wings are shown and slowed down further
                rp._wingFlapTimer = (rp._wingFlapTimer || 0) + dt * 4.2;
                const descentSin = Math.sin(rp._wingFlapTimer);
                const descentCos = Math.cos(rp._wingFlapTimer);

                const wingPitchL = 0.05 + descentSin * 0.05;
                const wingYawL = 0.26 + descentSin * 0.12;
                const wingRollL = 0.18 + descentCos * 0.14;

                const wingPitchR = 0.05 + descentSin * 0.05;
                const wingYawR = -0.26 - descentSin * 0.12;
                const wingRollR = -0.18 - descentCos * 0.14;

                this.makeAttachedTransform(this._matWingL, this._matTorso, this.joints.wingL[0], this.joints.wingL[1], this.joints.wingL[2], wingPitchL, wingYawL, wingRollL);
                this.applyLimbMatrix(model, 'ego_wing_left', this._matWingL);
                this.makeAttachedTransform(this._matWingR, this._matTorso, this.joints.wingR[0], this.joints.wingR[1], this.joints.wingR[2], wingPitchR, wingYawR, wingRollR);
                this.applyLimbMatrix(model, 'ego_wing_right', this._matWingR);
            } else {
                this._matWingL.fill(0);
                this._matWingR.fill(0);
                this.applyLimbMatrix(model, 'ego_wing_left', this._matWingL);
                this.applyLimbMatrix(model, 'ego_wing_right', this._matWingR);
            }

            this.makeChildTransform(this._matHead, this._matTorso, this.joints.neck[0], this.joints.neck[1], this.joints.neck[2], 0);
            this.applyLimbMatrix(model, 'head', this._matHead);

            this.makeChildTransform(this._matCap, this._matHead, this.joints.cap[0], this.joints.cap[1], this.joints.cap[2], -0.25);
            this.applyLimbMatrix(model, 'cap', this._matCap);

            this.makeChildTransform(this._matThighL, this._matTorso, this.joints.hipL[0], this.joints.hipL[1], this.joints.hipL[2], 0.35, 0, 0.08);
            this.applyLimbMatrix(model, 'left_thigh', this._matThighL);
            this.makeChildTransform(this._matShinL, this._matThighL, this.joints.kneeL[0], this.joints.kneeL[1], this.joints.kneeL[2], -0.6);
            this.applyLimbMatrix(model, 'left_shin', this._matShinL);

            this.makeChildTransform(this._matThighR, this._matTorso, this.joints.hipR[0], this.joints.hipR[1], this.joints.hipR[2], 0.35, 0, -0.08);
            this.applyLimbMatrix(model, 'right_thigh', this._matThighR);
            this.makeChildTransform(this._matShinR, this._matThighR, this.joints.kneeR[0], this.joints.kneeR[1], this.joints.kneeR[2], -0.6);
            this.applyLimbMatrix(model, 'right_shin', this._matShinR);

            this.makeChildTransform(this._matUpperArmL, this._matTorso, this.joints.shoulderL[0], this.joints.shoulderL[1], this.joints.shoulderL[2], -0.2, 0, 0.4);
            this.applyLimbMatrix(model, 'left_upper_arm', this._matUpperArmL);
            this.makeChildTransform(this._matForearmL, this._matUpperArmL, this.joints.elbowL[0], this.joints.elbowL[1], this.joints.elbowL[2], 0.5);
            this.applyLimbMatrix(model, 'left_forearm', this._matForearmL);

            this.makeChildTransform(this._matUpperArmR, this._matTorso, this.joints.shoulderR[0], this.joints.shoulderR[1], this.joints.shoulderR[2], -0.2, 0, -0.4);
            this.applyLimbMatrix(model, 'right_upper_arm', this._matUpperArmR);
            this.makeChildTransform(this._matForearmR, this._matUpperArmR, this.joints.elbowR[0], this.joints.elbowR[1], this.joints.elbowR[2], 0.5);
            this.applyLimbMatrix(model, 'right_forearm', this._matForearmR);

            return;
        }

        // Continuous walk-to-idle blend weight based on smoothed traveling speed
        const walkWeight = Math.min(1.0, Math.max(0.0, (moveSpeed - 0.10) / 0.50));
        const idleWeight = 1.0 - walkWeight;

        // Advance gait animation timer continuously when moving
        const strideDist = 2.5;
        const gaitFreq = (2.0 * Math.PI) / strideDist;
        const animSpeed = Math.max(1.0, moveSpeed) * gaitFreq;
        rp._animTimer += dt * animSpeed * (walkWeight > 0.01 ? 1.0 : 0.0);
        const phase = rp._animTimer;
        const sinP = Math.sin(phase);

        // Advance breathing idle timer continuously
        rp._idleTimer += dt * 2.4;
        const breath = Math.sin(rp._idleTimer);
        const breathY = breath * 0.008;

        // Smoothly blended torso lean and vertical bob
        const leanForward = -0.06 * walkWeight;
        const bobY = (Math.abs(sinP) * 0.025) * walkWeight + (breathY * idleWeight);

        this.makeJointTransform(this._matTorso, this.joints.torso[0], this.joints.torso[1], this.joints.torso[2], leanForward, 0, 0, 0, bobY, 0);
        this.applyLimbMatrix(model, 'torso', this._matTorso);
        this.applyLimbMatrix(model, 'equipment', this._matTorso);

        // Head
        const headPitch = -leanForward * 0.55;
        this.makeChildTransform(this._matHead, this._matTorso, this.joints.neck[0], this.joints.neck[1], this.joints.neck[2], headPitch);
        this.applyLimbMatrix(model, 'head', this._matHead);

        // Cap
        const capFlutter = (-0.20 + Math.sin(phase * 2) * 0.05) * walkWeight + ((-0.05 + breath * 0.02) * idleWeight);
        this.makeChildTransform(this._matCap, this._matHead, this.joints.cap[0], this.joints.cap[1], this.joints.cap[2], capFlutter);
        this.applyLimbMatrix(model, 'cap', this._matCap);

        // --- LEGS ---
        const strideAmp = 0.45 * walkWeight;
        const kneeBendMax = 0.75 * walkWeight;

        // Left leg
        const thighSwingL = (sinP * strideAmp) + (0.04 * idleWeight);
        const kneeBendL = (walkWeight > 0.02)
            ? (-0.05 - Math.max(0, -sinP) * kneeBendMax) * walkWeight + (-0.06 * idleWeight)
            : -0.06;
        this.makeJointTransform(this._matThighL, this.joints.hipL[0], this.joints.hipL[1], this.joints.hipL[2], thighSwingL, 0, 0.05 * idleWeight, 0, bobY, 0);
        this.applyLimbMatrix(model, 'left_thigh', this._matThighL);
        this.makeChildTransform(this._matShinL, this._matThighL, this.joints.kneeL[0], this.joints.kneeL[1], this.joints.kneeL[2], kneeBendL);
        this.applyLimbMatrix(model, 'left_shin', this._matShinL);

        // Right leg
        const thighSwingR = (-sinP * strideAmp) + (-0.04 * idleWeight);
        const kneeBendR = (walkWeight > 0.02)
            ? (-0.05 - Math.max(0, sinP) * kneeBendMax) * walkWeight + (-0.06 * idleWeight)
            : -0.06;
        this.makeJointTransform(this._matThighR, this.joints.hipR[0], this.joints.hipR[1], this.joints.hipR[2], thighSwingR, 0, -0.05 * idleWeight, 0, bobY, 0);
        this.applyLimbMatrix(model, 'right_thigh', this._matThighR);
        this.makeChildTransform(this._matShinR, this._matThighR, this.joints.kneeR[0], this.joints.kneeR[1], this.joints.kneeR[2], kneeBendR);
        this.applyLimbMatrix(model, 'right_shin', this._matShinR);

        // --- ARMS ---
        const armAmp = 0.40 * walkWeight;
        const elbowBase = 0.35;
        const elbowAmp = 0.30 * walkWeight;

        // Left arm
        const armSwingL = (-sinP * armAmp) + ((0.06 + breath * 0.02) * idleWeight);
        const elbowBendL = (elbowBase + Math.max(0, sinP) * elbowAmp) * walkWeight + ((0.35 + breath * 0.03) * idleWeight);
        this.makeChildTransform(this._matUpperArmL, this._matTorso, this.joints.shoulderL[0], this.joints.shoulderL[1], this.joints.shoulderL[2], armSwingL, 0, 0.12 * walkWeight + 0.14 * idleWeight);
        this.applyLimbMatrix(model, 'left_upper_arm', this._matUpperArmL);
        this.makeChildTransform(this._matForearmL, this._matUpperArmL, this.joints.elbowL[0], this.joints.elbowL[1], this.joints.elbowL[2], elbowBendL);
        this.applyLimbMatrix(model, 'left_forearm', this._matForearmL);

        // Right arm
        const armSwingR = (sinP * armAmp) + ((0.06 - breath * 0.02) * idleWeight);
        const elbowBendR = (elbowBase + Math.max(0, -sinP) * elbowAmp) * walkWeight + ((0.35 - breath * 0.03) * idleWeight);
        this.makeChildTransform(this._matUpperArmR, this._matTorso, this.joints.shoulderR[0], this.joints.shoulderR[1], this.joints.shoulderR[2], armSwingR, 0, -0.12 * walkWeight - 0.14 * idleWeight);
        this.applyLimbMatrix(model, 'right_upper_arm', this._matUpperArmR);
        this.makeChildTransform(this._matForearmR, this._matUpperArmR, this.joints.elbowR[0], this.joints.elbowR[1], this.joints.elbowR[2], elbowBendR);
        this.applyLimbMatrix(model, 'right_forearm', this._matForearmR);
    }
}

// Global singleton and class export
window.CharacterAnimator = CharacterAnimator;
window.characterAnimatorInstance = new CharacterAnimator();
