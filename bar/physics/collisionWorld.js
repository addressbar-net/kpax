// Collision World Adapter & Spatial Query Wrapper

class CollisionWorldAdapter {
    constructor() {
        this.worldEntity = null;
        // Material mapping table based on triangle index ranges or mesh surface IDs
        this.materialMap = new Map();
    }

    /**
     * Binds the active world terrain GameObject.
     * @param {object} entity - The active room/world GameObject.
     */
    setWorldEntity(entity) {
        this.worldEntity = entity;
    }

    /**
     * Registers material types for specific triangle index ranges or names.
     * @param {string} materialType - e.g., 'ICE', 'MOSS', 'WATER', 'SLIME', 'STONE'
     * @param {number[]} triIndices - Array of triangle indices matching the surface type.
     */
    registerSurfaceMaterials(materialType, triIndices) {
        if (!Array.isArray(triIndices)) return;
        for (const idx of triIndices) {
            this.materialMap.set(idx, materialType.toUpperCase());
        }
    }

    /**
     * Queries ground height at (x, z) coordinates.
     * @param {number} x - World X position.
     * @param {number} z - World Z position.
     * @param {number} [currentY=0] - Current Y height reference.
     * @param {number} [maxStepUp=0.35] - Maximum upward step height.
     * @param {number} [maxStepDown=5.0] - Maximum downward raycast range.
     * @returns {number|null} Y position of ground, or null if no terrain hit.
     */
    getGroundHeight(x, z, currentY = 0, maxStepUp = 0.35, maxStepDown = 5.0) {
        if (!this.worldEntity || typeof this.worldEntity.getGroundHeight !== 'function') {
            return null;
        }
        const height = this.worldEntity.getGroundHeight(x, z, currentY, maxStepUp, maxStepDown);
        return height;
    }

    /**
     * Queries ocean/water surface elevation at (x, z) coordinates.
     * @param {number} x - World X position.
     * @param {number} z - World Z position.
     * @returns {number|null} Water surface Y level (defaults to 0.0 in ocean world).
     */
    getWaterSurface(x, z) {
        if (this.worldEntity && typeof this.worldEntity.getWaterSurface === 'function') {
            return this.worldEntity.getWaterSurface(x, z);
        }
        return 0.0;
    }

    /**
     * Checks if a point or upward ray intersects the overhead water plane.
     * @param {number[]} origin - [x, y, z] start position.
     * @param {number[]} target - [x, y, z] end position.
     * @returns {object|null} Hit info or null.
     */
    checkWaterSurfaceOverhead(origin, target) {
        const waterY = this.getWaterSurface(origin[0], origin[2]);
        if (waterY !== null && origin[1] <= waterY + 0.1) {
            return { isWaterPlane: true, waterHeight: waterY };
        }
        return null;
    }

    /**
     * Checks if any terrain or water mesh exists beneath the coordinates (x, z).
     * @param {number} x - World X position.
     * @param {number} z - World Z position.
     * @param {number} [currentY=0] - Current Y position reference.
     * @returns {object|null} Detailed ground hit or null if in Open Sea.
     */
    checkMeshBeneath(x, z, currentY = 0) {
        if (!this.worldEntity || typeof this.worldEntity.getGroundTriangle !== 'function') {
            return null;
        }
        return this.worldEntity.getGroundTriangle(x, z, currentY, 15.0, 1000.0);
    }

    /**
     * Queries detailed ground triangle data including slope normal vector and surface material type.
     * @param {number} x - World X position.
     * @param {number} z - World Z position.
     * @param {number} [currentY=0] - Current Y height reference.
     * @param {number} [maxStepUp=0.35] - Maximum upward step height.
     * @param {number} [maxStepDown=500.0] - Maximum downward raycast range.
     * @returns {object|null} Object containing { heightY, normal, triIndex, material } or default object.
     */
    getGroundTriangle(x, z, currentY = 0, maxStepUp = 0.35, maxStepDown = 500.0) {
        if (!this.worldEntity || typeof this.worldEntity.getGroundTriangle !== 'function') {
            return null;
        }

        const triData = this.worldEntity.getGroundTriangle(x, z, currentY, maxStepUp, maxStepDown);
        if (!triData) return null;

        // Determine material type from index map or entity metadata, defaulting to 'STONE'
        triData.material = (this.materialMap.size > 0 && this.materialMap.get(triData.triIndex)) || triData.material || 'STONE';
        return triData;
    }

    /**
     * Performs a segment raycast for camera and sightline occlusion tests.
     * @param {number[]} origin - [x, y, z] start position.
     * @param {number[]} target - [x, y, z] end position.
     * @param {number} [maxWalkableNormalY=1.1] - Optional normal.y threshold to ignore walkable floor slopes.
     * @returns {number|null} Hit fraction (0.0 - 1.0) along ray, or null if unoccluded.
     */
    raycastSegment(origin, target, maxWalkableNormalY = 1.1) {
        if (!this.worldEntity || typeof this.worldEntity.raycastSegment !== 'function') {
            return null;
        }
        return this.worldEntity.raycastSegment(origin, target, maxWalkableNormalY);
    }

    /**
     * Radial Bounding Cylinder / Wall & Hanging Overhang Pushback Resolution.
     * Uses spatial-grid accelerated local triangle gathering to resolve both full walls
     * and walls of upper floors hanging down in front of the character.
     * @param {number} x - Target world X position.
     * @param {number} y - Target world waist Y position (footY + 1.0).
     * @param {number} z - Target world Z position.
     * @param {number} [radius=0.5] - Player bounding radius.
     * @returns {number[]} Corrected position array [newX, newY, newZ].
     */
    resolveWallCollisions(x, y, z, radius = 0.5) {
        if (!this.worldEntity) return [x, y, z];

        if (typeof this.worldEntity.resolveWallCollisionsFast === 'function') {
            const fastRes = this.worldEntity.resolveWallCollisionsFast(x, y, z, radius);
            if (fastRes !== null) return fastRes;
        }

        let correctedX = x;
        let correctedZ = z;
        const footY = y - 1.0;
        const maxSlopeCos = Math.cos(62.0 * Math.PI / 180.0);

        const angles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, 5 * Math.PI / 4, 3 * Math.PI / 2, 7 * Math.PI / 4];
        const rayDistance = radius + 0.3;
        const heightSamples = [
            { y: footY + 0.45, maxNormalY: maxSlopeCos },
            { y: footY + 1.0, maxNormalY: maxSlopeCos },
            { y: footY + 1.45, maxNormalY: 1.1 },
            { y: footY + 1.8, maxNormalY: 1.1 }
        ];
        
        for (const angle of angles) {
            const dirX = Math.cos(angle);
            const dirZ = Math.sin(angle);

            let closestHitFraction = null;

            for (const sample of heightSamples) {
                const origin = [correctedX, sample.y, correctedZ];
                const target = [correctedX + dirX * rayDistance, sample.y, correctedZ + dirZ * rayDistance];

                const hitFraction = this.raycastSegment(origin, target, sample.maxNormalY);
                if (hitFraction !== null && hitFraction < 1.0) {
                    if (closestHitFraction === null || hitFraction < closestHitFraction) {
                        closestHitFraction = hitFraction;
                    }
                }
            }

            if (closestHitFraction !== null) {
                const hitDistance = closestHitFraction * rayDistance;
                if (hitDistance < radius) {
                    const penetration = radius - hitDistance;
                    correctedX -= dirX * penetration;
                    correctedZ -= dirZ * penetration;
                }
            }
        }

        return [correctedX, y, correctedZ];
    }
}

// Global Singleton Instance
window.CollisionWorld = new CollisionWorldAdapter();
