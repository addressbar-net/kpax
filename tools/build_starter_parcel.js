const fs = require('fs');
const path = require('path');
const { MeshBuilder, serializeGltfMesh } = require('./meshBuilder');

function buildStarterParcel() {
    const builder = new MeshBuilder();

    const materials = [
        {
            name: "Grass_Top_Emerald",
            pbrMetallicRoughness: {
                baseColorFactor: [0.20, 0.58, 0.24, 1.0],
                metallicFactor: 0.05,
                roughnessFactor: 0.85
            }
        },
        {
            name: "Block_Stone_Base",
            pbrMetallicRoughness: {
                baseColorFactor: [0.24, 0.22, 0.21, 1.0],
                metallicFactor: 0.15,
                roughnessFactor: 0.90
            }
        },
        {
            name: "Mahogany_Timber_Stack",
            pbrMetallicRoughness: {
                baseColorFactor: [0.42, 0.22, 0.12, 1.0],
                metallicFactor: 0.10,
                roughnessFactor: 0.40
            }
        },
        {
            name: "Gilded_Brass_Frame",
            pbrMetallicRoughness: {
                baseColorFactor: [0.95, 0.78, 0.22, 1.0],
                metallicFactor: 0.88,
                roughnessFactor: 0.22
            }
        },
        {
            name: "Pix_Glass_Aperture",
            pbrMetallicRoughness: {
                baseColorFactor: [0.35, 0.88, 0.95, 0.70],
                metallicFactor: 0.20,
                roughnessFactor: 0.10
            }
        },
        {
            name: "Tricurse_Cursor_Gold",
            pbrMetallicRoughness: {
                baseColorFactor: [1.0, 0.84, 0.10, 1.0],
                metallicFactor: 0.95,
                roughnessFactor: 0.15
            }
        },
        {
            name: "Mortar_Seam_Dark",
            pbrMetallicRoughness: {
                baseColorFactor: [0.12, 0.11, 0.10, 1.0],
                metallicFactor: 0.0,
                roughnessFactor: 1.0
            }
        }
    ];

    const MAT_GRASS = 0;
    const MAT_STONE = 1;
    const MAT_TIMBER = 2;
    const MAT_BRASS = 3;
    const MAT_PIX_GLASS = 4;
    const MAT_TRICURSE = 5;
    const MAT_MORTAR = 6;

    // =========================================================================
    // 1. $8 \times 8$ GRID OF STACKABLE FOUNDATION BLOCKS WITH MORTAR JOINTS
    // =========================================================================
    // Grid: 8 columns (-4 to 3), 8 rows (-4 to 3)
    // Each block: 2.0m x 2.0m wide, 1.0m deep (Y from -1.0 to 0.0)
    // Margins between blocks: 0.04m mortar chamfer so every block is visibly modular!
    const blockSize = 2.0;
    const gap = 0.03; // Visible block bevel groove

    // Solid Mortar Bedding & Joint Matrix (-1.0 to 0.0) filling all seams between blocks
    // Ensures watertight walkable ground across the entire parcel so Link never falls into cracks
    builder.addBox(-8.0, -1.0, -8.0, 8.0, 0.0, 8.0, MAT_MORTAR);

    for (let gx = -4; gx < 4; gx++) {
        for (let gz = -4; gz < 4; gz++) {
            const x1 = gx * blockSize + gap;
            const x2 = (gx + 1) * blockSize - gap;
            const z1 = gz * blockSize + gap;
            const z2 = (gz + 1) * blockSize - gap;

            // Foundation block stone body (-1.0 to 0.0)
            builder.addBox(x1, -1.0, z1, x2, 0.0, z2, MAT_STONE);

            // Emerald Grass top cap on the surface
            builder.addQuad(
                [x1, 0.005, z2],
                [x2, 0.005, z2],
                [x2, 0.005, z1],
                [x1, 0.005, z1],
                [0, 1, 0], MAT_GRASS, 1.0, 1.0
            );
        }
    }

    // Platform Substrate bed under all blocks (-1.0 to -1.4)
    builder.addBox(-8.05, -1.4, -8.05, 8.05, -1.0, 8.05, MAT_MORTAR);

    // =========================================================================
    // 2. ELEVATED STACKED TIMBER TERRACE (Northwest Quadrant)
    // =========================================================================
    // Demonstrates vertical block stacking!
    // A 3x3 stack of mahogany timber blocks rising from Y=0.0 to Y=1.0m
    // Mortar bedding between timber blocks prevents cracks on elevated terrace
    builder.addBox(-8.0, 0.0, -8.0, -2.0, 0.995, -2.0, MAT_MORTAR);

    for (let tx = -4; tx < -1; tx++) {
        for (let tz = -4; tz < -1; tz++) {
            const x1 = tx * blockSize + gap;
            const x2 = (tx + 1) * blockSize - gap;
            const z1 = tz * blockSize + gap;
            const z2 = (tz + 1) * blockSize - gap;

            builder.addBox(x1, 0.0, z1, x2, 1.0, z2, MAT_TIMBER);
        }
    }

    // Stone Access Step at [-2.0, 0.0 to 0.5, -2.0 to 0.0] with mortar joint
    builder.addBox(-2.0, 0.0, -2.0, 0.0, 0.495, 0.0, MAT_MORTAR);
    builder.addBox(-2.0 + gap, 0.0, -2.0 + gap, 0.0 - gap, 0.5, -0.0 - gap, MAT_STONE);

    // =========================================================================
    // 3. THE PIX FRAME (Aperture Shrine on the Eastern Edge)
    // =========================================================================
    // Position: X = 6.0, Z = 0.0 (Facing East into the unrendered fog)
    // Stone Plinth Pedestal
    builder.addBox(5.2, 0.0, -1.5, 6.8, 0.35, 1.5, MAT_STONE);
    builder.addBox(5.4, 0.35, -1.3, 6.6, 0.50, 1.3, MAT_BRASS);

    // Two vertical brass pillars (Z = -1.1 and Z = +1.1)
    builder.addBox(5.85, 0.5, -1.15, 6.15, 2.4, -0.95, MAT_BRASS);
    builder.addBox(5.85, 0.5, 0.95, 6.15, 2.4, 1.15, MAT_BRASS);

    // Mahogany finial caps on top of pillars
    builder.addBox(5.80, 2.4, -1.20, 6.20, 2.65, -0.90, MAT_TIMBER);
    builder.addBox(5.80, 2.4, 0.90, 6.20, 2.65, 1.20, MAT_TIMBER);

    // Horizontal top & bottom brass frame rails
    builder.addBox(5.90, 0.75, -1.0, 6.10, 0.90, 1.0, MAT_BRASS);
    builder.addBox(5.90, 2.10, -1.0, 6.10, 2.25, 1.0, MAT_BRASS);

    // Shimmering Pix Glass Aperture Pane (Looking East +X)
    builder.addQuad(
        [6.0, 0.90, -0.95],
        [6.0, 0.90, 0.95],
        [6.0, 2.10, 0.95],
        [6.0, 2.10, -0.95],
        [-1, 0, 0], MAT_PIX_GLASS, 1.0, 1.0 // Facing west toward Link
    );
    builder.addQuad(
        [6.0, 0.90, 0.95],
        [6.0, 0.90, -0.95],
        [6.0, 2.10, -0.95],
        [6.0, 2.10, 0.95],
        [1, 0, 0], MAT_PIX_GLASS, 1.0, 1.0 // Facing east into horizon
    );

    // Brass Viewfinder Sight Pins
    builder.addBox(5.95, 1.45, -0.15, 6.05, 1.55, 0.15, MAT_BRASS);
    builder.addBox(5.95, 1.35, -0.05, 6.05, 1.65, 0.05, MAT_BRASS);

    // =========================================================================
    // 4. THE TRICURSE CURSOR (Floating Reticle Beacon)
    // =========================================================================
    // Floating high above the spawn platform center [0, 3.2, 0]
    // A 3-pronged cursor arrow pointing straight down
    const cy = 3.2;
    // Central cursor needle body
    builder.addBox(-0.10, cy - 0.6, -0.10, 0.10, cy + 0.4, 0.10, MAT_TRICURSE);
    // Cursor point downward pyramid
    builder.addQuad([-0.18, cy - 0.6, -0.18], [0.18, cy - 0.6, -0.18], [0, cy - 0.95, 0], [-0.18, cy - 0.6, -0.18], [0, -1, 0], MAT_TRICURSE);
    builder.addQuad([0.18, cy - 0.6, -0.18], [0.18, cy - 0.6, 0.18], [0, cy - 0.95, 0], [0.18, cy - 0.6, -0.18], [0, -1, 0], MAT_TRICURSE);
    builder.addQuad([0.18, cy - 0.6, 0.18], [-0.18, cy - 0.6, 0.18], [0, cy - 0.95, 0], [0.18, cy - 0.6, 0.18], [0, -1, 0], MAT_TRICURSE);
    builder.addQuad([-0.18, cy - 0.6, 0.18], [-0.18, cy - 0.6, -0.18], [0, cy - 0.95, 0], [-0.18, cy - 0.6, 0.18], [0, -1, 0], MAT_TRICURSE);

    // 3 Cursor Wings (Tricurse triad)
    builder.addBox(-0.55, cy + 0.1, -0.08, -0.10, cy + 0.35, 0.08, MAT_TRICURSE);
    builder.addBox(0.10, cy + 0.1, -0.08, 0.55, cy + 0.35, 0.08, MAT_TRICURSE);
    builder.addBox(-0.08, cy + 0.1, 0.10, 0.08, cy + 0.35, 0.55, MAT_TRICURSE);

    // =========================================================================
    // 5. SERIALIZE GLTF & BIN
    // =========================================================================
    const serialized = serializeGltfMesh(builder, materials);
    const fullBuffer = Buffer.concat(serialized.buffers);

    const nodes = [
        {
            name: "Starter_Parcel_Geometry",
            mesh: 0,
            translation: [0, 0, 0]
        },
        // Link's Main Spawn Entrance Node
        {
            name: "en_l__world",
            translation: [0.0, 0.05, 0.0],
            rotation: [0, 0, 0, 1]
        },
        {
            name: "en__world",
            translation: [0.0, 0.05, 0.0],
            rotation: [0, 0, 0, 1]
        },
        {
            name: "en_l__starter_parcel",
            translation: [0.0, 0.05, 0.0],
            rotation: [0, 0, 0, 1]
        },
        {
            name: "og_en__world",
            translation: [0.0, 0.05, 0.0],
            rotation: [0, 0, 0, 1]
        },
        // Pix Frame Aperture Trigger Node (Press K to click & expand)
        {
            name: "ex_l__pix_frame",
            translation: [5.6, 0.5, 0.0],
            rotation: [0, 0.7071, 0, 0.7071]
        },
        {
            name: "bar_ex__kpax.click",
            translation: [5.6, 0.5, 0.0],
            rotation: [0, 0.7071, 0, 0.7071]
        },
        {
            name: "node_pix_frame",
            translation: [6.0, 1.5, 0.0],
            rotation: [0, 0, 0, 1]
        },
        // Tricurse Cursor Anchor Node
        {
            name: "node_tricurse_cursor",
            translation: [0.0, 3.0, 0.0],
            rotation: [0, 0, 0, 1]
        }
    ];

    const gltfOut = {
        asset: {
            version: "2.0",
            generator: "kpax.click Starter Parcel & Pix Frame Builder"
        },
        scene: 0,
        scenes: [{ name: "Scene", nodes: [0, 1, 2, 3, 4, 5, 6, 7, 8] }],
        nodes,
        meshes: [{ name: "Starter_Parcel_Mesh", primitives: serialized.primitives }],
        materials,
        accessors: serialized.accessors,
        bufferViews: serialized.bufferViews,
        buffers: [{ byteLength: fullBuffer.length, uri: "world.bin" }]
    };

    const outDir = '/addr.bar/addr.bar.2/models/rooms';
    fs.mkdirSync(outDir, { recursive: true });

    const gltfPath = path.join(outDir, 'world.gltf');
    const binPath = path.join(outDir, 'world.bin');

    fs.writeFileSync(gltfPath, JSON.stringify(gltfOut, null, 2));
    fs.writeFileSync(binPath, fullBuffer);

    console.log(`[Starter Parcel] Successfully generated ${gltfPath} and ${binPath} (${fullBuffer.length} bytes, ${serialized.primitives.length} primitives).`);
}

buildStarterParcel();
