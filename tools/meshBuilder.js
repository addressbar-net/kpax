const fs = require('fs');
const path = require('path');

// Helper class for building glTF 2.0 geometry
class MeshBuilder {
    constructor() {
        this.primitives = new Map(); // materialIndex -> { positions: [], normals: [], uvs: [], indices: [] }
    }

    getPrim(matIdx) {
        if (!this.primitives.has(matIdx)) {
            this.primitives.set(matIdx, { positions: [], normals: [], uvs: [], indices: [] });
        }
        return this.primitives.get(matIdx);
    }

    addQuad(p1, p2, p3, p4, normal, matIdx, uScale = 1.0, vScale = 1.0) {
        const prim = this.getPrim(matIdx);
        const baseIdx = prim.positions.length / 3;

        prim.positions.push(...p1, ...p2, ...p3, ...p4);
        prim.normals.push(...normal, ...normal, ...normal, ...normal);
        prim.uvs.push(0, 0,  uScale, 0,  uScale, vScale,  0, vScale);
        prim.indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
    }

    addBox(x1, y1, z1, x2, y2, z2, matIdx) {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        const minZ = Math.min(z1, z2), maxZ = Math.max(z1, z2);

        const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;

        // Top (+Y)
        this.addQuad(
            [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ],
            [0, 1, 0], matIdx, dx, dz
        );
        // Bottom (-Y)
        this.addQuad(
            [minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ],
            [0, -1, 0], matIdx, dx, dz
        );
        // Front (+Z)
        this.addQuad(
            [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ],
            [0, 0, 1], matIdx, dx, dy
        );
        // Back (-Z)
        this.addQuad(
            [maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ],
            [0, 0, -1], matIdx, dx, dy
        );
        // Left (-X)
        this.addQuad(
            [minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ],
            [-1, 0, 0], matIdx, dz, dy
        );
        // Right (+X)
        this.addQuad(
            [maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ],
            [1, 0, 0], matIdx, dz, dy
        );
    }

    addCylinder(cx, cz, minY, maxY, radius, segments, matIdx) {
        const prim = this.getPrim(matIdx);
        const height = maxY - minY;

        // Side walls
        for (let i = 0; i < segments; i++) {
            const th1 = (i / segments) * Math.PI * 2;
            const th2 = ((i + 1) / segments) * Math.PI * 2;
            const cos1 = Math.cos(th1), sin1 = Math.sin(th1);
            const cos2 = Math.cos(th2), sin2 = Math.sin(th2);

            const p1 = [cx + radius * cos1, minY, cz + radius * sin1];
            const p2 = [cx + radius * cos2, minY, cz + radius * sin2];
            const p3 = [cx + radius * cos2, maxY, cz + radius * sin2];
            const p4 = [cx + radius * cos1, maxY, cz + radius * sin1];

            const baseIdx = prim.positions.length / 3;
            prim.positions.push(...p1, ...p2, ...p3, ...p4);
            prim.normals.push(cos1, 0, sin1,  cos2, 0, sin2,  cos2, 0, sin2,  cos1, 0, sin1);
            prim.uvs.push(i / segments, 0,  (i + 1) / segments, 0,  (i + 1) / segments, 1,  i / segments, 1);
            prim.indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
        }

        // Top Cap
        const topCenterIdx = prim.positions.length / 3;
        prim.positions.push(cx, maxY, cz);
        prim.normals.push(0, 1, 0);
        prim.uvs.push(0.5, 0.5);

        for (let i = 0; i < segments; i++) {
            const th = (i / segments) * Math.PI * 2;
            const cos = Math.cos(th), sin = Math.sin(th);
            prim.positions.push(cx + radius * cos, maxY, cz + radius * sin);
            prim.normals.push(0, 1, 0);
            prim.uvs.push(0.5 + 0.5 * cos, 0.5 + 0.5 * sin);
        }
        for (let i = 0; i < segments; i++) {
            const next = (i + 1) % segments;
            prim.indices.push(topCenterIdx, topCenterIdx + 1 + i, topCenterIdx + 1 + next);
        }
    }

    addTriangle(p1, p2, p3, normal = null, matIdx = 0, uvs = [0, 0, 1, 0, 0.5, 1]) {
        const prim = this.getPrim(matIdx);
        const baseIdx = prim.positions.length / 3;
        let n = normal;
        if (!n) {
            const ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2];
            const vx = p3[0] - p1[0], vy = p3[1] - p1[1], vz = p3[2] - p1[2];
            let cx = uy * vz - uz * vy;
            let cy = uz * vx - ux * vz;
            let cz = ux * vy - uy * vx;
            const len = Math.hypot(cx, cy, cz) || 1.0;
            n = [cx / len, cy / len, cz / len];
        }
        prim.positions.push(...p1, ...p2, ...p3);
        prim.normals.push(...n, ...n, ...n);
        prim.uvs.push(...uvs);
        prim.indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    }

    addCone(cx, cz, minY, maxY, radius, segments, matIdx) {
        const prim = this.getPrim(matIdx);
        const apex = [cx, maxY, cz];
        for (let i = 0; i < segments; i++) {
            const th1 = (i / segments) * Math.PI * 2;
            const th2 = ((i + 1) / segments) * Math.PI * 2;
            const c1 = Math.cos(th1), s1 = Math.sin(th1);
            const c2 = Math.cos(th2), s2 = Math.sin(th2);
            const p1 = [cx + radius * c1, minY, cz + radius * s1];
            const p2 = [cx + radius * c2, minY, cz + radius * s2];
            this.addTriangle(p1, p2, apex, null, matIdx);
        }
        // Base cap (-Y)
        const baseCenterIdx = prim.positions.length / 3;
        prim.positions.push(cx, minY, cz);
        prim.normals.push(0, -1, 0);
        prim.uvs.push(0.5, 0.5);
        for (let i = 0; i < segments; i++) {
            const th = (i / segments) * Math.PI * 2;
            prim.positions.push(cx + radius * Math.cos(th), minY, cz + radius * Math.sin(th));
            prim.normals.push(0, -1, 0);
            prim.uvs.push(0.5 + 0.5 * Math.cos(th), 0.5 + 0.5 * Math.sin(th));
        }
        for (let i = 0; i < segments; i++) {
            const next = (i + 1) % segments;
            prim.indices.push(baseCenterIdx, baseCenterIdx + 1 + next, baseCenterIdx + 1 + i);
        }
    }

    addTorusRing(cx, cz, y, rInner, rOuter, height, segments, matIdx) {
        // Hollow ring cylinder (fountain wall, basin rim)
        for (let i = 0; i < segments; i++) {
            const th1 = (i / segments) * Math.PI * 2;
            const th2 = ((i + 1) / segments) * Math.PI * 2;
            const c1 = Math.cos(th1), s1 = Math.sin(th1);
            const c2 = Math.cos(th2), s2 = Math.sin(th2);

            // Outer wall
            this.addQuad(
                [cx + rOuter * c1, y, cz + rOuter * s1],
                [cx + rOuter * c2, y, cz + rOuter * s2],
                [cx + rOuter * c2, y + height, cz + rOuter * s2],
                [cx + rOuter * c1, y + height, cz + rOuter * s1],
                [c1, 0, s1], matIdx
            );
            // Inner wall
            this.addQuad(
                [cx + rInner * c2, y, cz + rInner * s2],
                [cx + rInner * c1, y, cz + rInner * s1],
                [cx + rInner * c1, y + height, cz + rInner * s1],
                [cx + rInner * c2, y + height, cz + rInner * s2],
                [-c1, 0, -s1], matIdx
            );
            // Top rim
            this.addQuad(
                [cx + rInner * c1, y + height, cz + rInner * s1],
                [cx + rOuter * c1, y + height, cz + rOuter * s1],
                [cx + rOuter * c2, y + height, cz + rOuter * s2],
                [cx + rInner * c2, y + height, cz + rInner * s2],
                [0, 1, 0], matIdx
            );
        }
    }
}

// Convert MeshBuilder to glTF 2.0 structures
function serializeGltfMesh(builder, materials, existingHoppingData = null) {
    const buffers = [];
    let currentByteOffset = 0;

    const gltfPrims = [];
    const accessors = [];
    const bufferViews = [];

    const sortedMatIndices = Array.from(builder.primitives.keys()).sort((a, b) => a - b);

    for (const matIdx of sortedMatIndices) {
        const primData = builder.primitives.get(matIdx);
        if (primData.indices.length === 0) continue;

        const posArr = new Float32Array(primData.positions);
        const normArr = new Float32Array(primData.normals);
        const uvArr = new Float32Array(primData.uvs);
        const indArr = new Uint16Array(primData.indices);

        // Calculate min/max for position
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < posArr.length; i += 3) {
            minX = Math.min(minX, posArr[i]); maxX = Math.max(maxX, posArr[i]);
            minY = Math.min(minY, posArr[i + 1]); maxY = Math.max(maxY, posArr[i + 1]);
            minZ = Math.min(minZ, posArr[i + 2]); maxZ = Math.max(maxZ, posArr[i + 2]);
        }

        // POSITION
        const posBV = bufferViews.length;
        const posBuf = Buffer.from(posArr.buffer);
        bufferViews.push({
            buffer: 0,
            byteOffset: currentByteOffset,
            byteLength: posBuf.length,
            target: 34962
        });
        currentByteOffset += posBuf.length;
        buffers.push(posBuf);

        const posAcc = accessors.length;
        accessors.push({
            bufferView: posBV,
            componentType: 5126,
            count: posArr.length / 3,
            max: [maxX, maxY, maxZ],
            min: [minX, minY, minZ],
            type: "VEC3"
        });

        // NORMAL
        const normBV = bufferViews.length;
        const normBuf = Buffer.from(normArr.buffer);
        bufferViews.push({
            buffer: 0,
            byteOffset: currentByteOffset,
            byteLength: normBuf.length,
            target: 34962
        });
        currentByteOffset += normBuf.length;
        buffers.push(normBuf);

        const normAcc = accessors.length;
        accessors.push({
            bufferView: normBV,
            componentType: 5126,
            count: normArr.length / 3,
            type: "VEC3"
        });

        // TEXCOORD_0
        const uvBV = bufferViews.length;
        const uvBuf = Buffer.from(uvArr.buffer);
        bufferViews.push({
            buffer: 0,
            byteOffset: currentByteOffset,
            byteLength: uvBuf.length,
            target: 34962
        });
        currentByteOffset += uvBuf.length;
        buffers.push(uvBuf);

        const uvAcc = accessors.length;
        accessors.push({
            bufferView: uvBV,
            componentType: 5126,
            count: uvArr.length / 2,
            type: "VEC2"
        });

        // INDICES
        // Align to 4 bytes for index buffer offset
        const pad = (4 - (currentByteOffset % 4)) % 4;
        if (pad > 0) {
            const padBuf = Buffer.alloc(pad);
            buffers.push(padBuf);
            currentByteOffset += pad;
        }

        const indBV = bufferViews.length;
        const indBuf = Buffer.from(indArr.buffer);
        bufferViews.push({
            buffer: 0,
            byteOffset: currentByteOffset,
            byteLength: indBuf.length,
            target: 34963
        });
        currentByteOffset += indBuf.length;
        buffers.push(indBuf);

        const indAcc = accessors.length;
        accessors.push({
            bufferView: indBV,
            componentType: 5123,
            count: indArr.length,
            type: "SCALAR"
        });

        // Align next buffer to 4 bytes
        const nextPad = (4 - (currentByteOffset % 4)) % 4;
        if (nextPad > 0) {
            const pBuf = Buffer.alloc(nextPad);
            buffers.push(pBuf);
            currentByteOffset += nextPad;
        }

        gltfPrims.push({
            attributes: {
                POSITION: posAcc,
                NORMAL: normAcc,
                TEXCOORD_0: uvAcc
            },
            indices: indAcc,
            material: matIdx
        });
    }

    return {
        primitives: gltfPrims,
        accessors,
        bufferViews,
        buffers,
        totalByteLength: currentByteOffset
    };
}

module.exports = {
    MeshBuilder,
    serializeGltfMesh
};
