// Centralized Asset & Item Registry
const ITEM_REGISTRY = {
    settings: { 
        id: "settings", 
        name: "Settings", 
        icon: "⚙️", 
        val: "Audio, Graphics & Engine Config", 
        desc: "Press Tab to close the Main Menu.", 
        isSystem: true 
    },
    clothes: {
        id: "clothes",
        name: "Clothes",
        icon: "👕",
        val: "Cosmetic Attire (Cap, Shirt, Pants)",
        desc: "Wardrobe attire altering character appearance without stat boosts. Cap, Shirt, and Pants slots.",
        isSystem: true,
        opensEquipmentMenu: true
    },
    medallions: {
        id: "medallions",
        name: "Medallions",
        icon: "⚡",
        val: "6 Sacred Relics (Sprint Active)",
        desc: "The 6 sacred medallions of the realm arranged clockwise. Sprint Speed medallion is earned and always active.",
        isSystem: true,
        opensMedallionsMenu: true
    },
    tools: {
        id: "tools",
        name: "Tools",
        icon: "⚔️",
        val: "Tools & Relics (Hotbar Slots J, I, L)",
        desc: "Equippable exploration tools & key relics (Modernized Scope, Bat Wings, Moonsynth Lyre).",
        isSystem: true,
        opensEquippablesMenu: true
    },
    supplies: {
        id: "supplies",
        name: "Supplies",
        icon: "🧪",
        val: "Potions & Provisions (Equip to Hotbar)",
        desc: "Consumable supplies and elixirs. Can be used immediately or equipped to Hotbar slots 1, 2, or 3.",
        isSystem: true,
        opensConsumablesMenu: true
    },
    accessories: {
        id: "accessories",
        name: "Accessories",
        icon: "🧭",
        val: "Passive Charms (Equip with K)",
        desc: "Equip or unequip accessories with K. Active effects apply passively without hotbars.",
        isSystem: true,
        opensAccessoriesMenu: true
    },
    rooms: {
        id: "rooms",
        name: "Rooms",
        icon: "🚪",
        val: "Room Selection & Entrance Warp",
        desc: "Browse all available rooms and entrances in the realm. Select to warp directly.",
        isSystem: true,
        opensRoomsMenu: true
    },
    // Backwards-compatible aliases
    get equipment() { return this.clothes; },
    get equippables() { return this.tools; },
    get consumables() { return this.supplies; },
    normal_shirt: {
        id: "normal_shirt",
        name: "Normal Shirt",
        icon: "👕",
        val: "Cosmetic Attire (No Boosts)",
        desc: "Standard everyday shirt. Purely alters appearance with no stat boosts.",
        slotType: "shirt",
        isCosmetic: true,
        isSystem: false
    },
    normal_pants: {
        id: "normal_pants",
        name: "Normal Pants",
        icon: "👖",
        val: "Cosmetic Attire (No Boosts)",
        desc: "Standard comfortable pants. Purely alters appearance with no stat boosts.",
        slotType: "pants",
        isCosmetic: true,
        isSystem: false
    },
    normal_cap: {
        id: "normal_cap",
        name: "Normal Cap",
        icon: "🧢",
        val: "Cosmetic Attire (No Boosts)",
        desc: "Standard brimmed cap. Purely alters appearance with no stat boosts.",
        slotType: "cap",
        isCosmetic: true,
        isSystem: false
    },
    cell_phone: {
        id: "cell_phone",
        name: "Cell Phone",
        icon: "📱",
        val: "PokéNav Cellular Link (Chat)",
        desc: "Handheld cellular communicator. Open to chat in the room and view notifications.",
        isSystem: true,
        isEquippable: true,
        opensCellPhone: true
    },
    text_message: {
        id: "text_message",
        name: "Text Message",
        icon: "💬",
        val: "Quick Text Box (Hotkey) / Cell Phone (Menu)",
        desc: "Type a text message in a box right above the notifications box when triggered via hotkey, or open the Cell Phone from the Tools menu.",
        isSystem: false,
        isEquippable: true,
        opensTextMessage: true
    },
    radio: {
        id: "radio",
        name: "Radio",
        icon: "📻",
        val: "BGM Tuning & Regional Music",
        desc: "Tune into regional music frequencies and calibrate background melody volumes.",
        isSystem: true,
        isEquippable: true,
        opensRadioMenu: true
    },
    map: {
        id: "map",
        name: "World Map",
        icon: "🗺️",
        val: "Nautical Chart & Coordinates",
        desc: "An oceanic navigational chart showing the current room coordinates, cardinal compass orientation, and nearby maritime waypoints.",
        isEquippable: true,
        opensMap: true,
        isSystem: false
    },
    telescope: { 
        id: "telescope", 
        name: "Modernized Scope", 
        icon: "🔭", 
        val: "Zoom (Moving) / FP Mode (Still)", 
        desc: "A classic brass telescope retrofitted with digital optics. Press while still to toggle First-Person View. Hold while moving to zoom in, lock facing, and strafe.", 
        isEquippable: true,
        isSystem: false 
    },
    bat: { 
        id: "bat", 
        name: "Bat Wings", 
        icon: "🦇", 
        val: "Hold Slot: Ascend | Hold Cross: Glide", 
        desc: "Synthetically woven wings powered by micro-grav engines. Hold hotbar button to ascend into the sky. While falling, hold Cross (K) to cushion your descent.", 
        isEquippable: true,
        isSystem: false 
    },
    shoes: { 
        id: "shoes", 
        name: "Sprint Shoes", 
        icon: "👟", 
        val: "+50% Movement Speed", 
        desc: "High-tech kinetic footwear. Passively increases overall walking and sprinting speed by +50% when worn on your feet.", 
        slotType: "feet",
        isSystem: false 
    },
    iron_boots: {
        id: "iron_boots",
        name: "Iron Greaves",
        icon: "🥾",
        val: "Heavy Tread & Traction",
        desc: "Dense iron-forged greaves. Provides ground traction on steep slopes and reduces hazard knockback.",
        slotType: "feet",
        isSystem: false
    },
    winged_boots: {
        id: "winged_boots",
        name: "Winged Sandals",
        icon: "🪽",
        val: "Air Cushion (-30% Fall)",
        desc: "Lightweight sandals blessed by sky currents. Cushions landings and reduces fall damage by 30%.",
        slotType: "feet",
        isSystem: false
    },
    adventurer_tunic: {
        id: "adventurer_tunic",
        name: "Adventurer Tunic",
        icon: "🥋",
        val: "Standard Exploration Garb",
        desc: "A durable and breathable explorer's tunic tailored for dimensional travel.",
        slotType: "body",
        isSystem: false
    },
    guardian_mail: {
        id: "guardian_mail",
        name: "Guardian Mail",
        icon: "🛡️",
        val: "-25% Damage Taken",
        desc: "Reinforced woven chainmail that absorbs physical and kinetic impacts, reducing damage by 25%.",
        slotType: "body",
        damageReduction: 0.25,
        isSystem: false
    },
    stealth_cloak: {
        id: "stealth_cloak",
        name: "Stealth Cloak",
        icon: "🥷",
        val: "Sound Dampening & Evasion",
        desc: "Woven from dark-matter fibers to suppress footstep vibrations and noise across dimensional planes.",
        slotType: "body",
        isSystem: false
    },
    lyre: { 
        id: "lyre", 
        name: "Moonsynth Lyre", 
        icon: "🪕", 
        val: "Teleport: Dark Room to Light Room", 
        desc: "An ancient celestial stringed instrument. Can be used anytime in a Dark Room to teleport to the corresponding Light Room. If no ground is beneath within falling distance, a brief cutscene returns you safely to the Dark Room.", 
        isEquippable: true,
        isSystem: false 
    },
    walk_straight: {
        id: "walk_straight",
        name: "Walk Straight",
        icon: "🧭",
        val: "8-Way Camera Lock (U / O)",
        desc: "An ornate navigation compass. When equipped, camera rotation with U and O clings to eight fixed positions.",
        isAccessory: true,
        isSystem: false
    },
    guardian_badge: { 
        id: "guardian_badge", 
        name: "Guardian Badge", 
        icon: "🛡️", 
        val: "-50% Damage Taken", 
        desc: "An ancient royal protection crest. Reduces damage received from falls, hazards, and events by 50% when equipped.", 
        isBadge: true,
        isAccessory: true,
        damageReduction: 0.50,
        isSystem: false 
    },
    feather_badge: { 
        id: "feather_badge", 
        name: "Feather Badge", 
        icon: "🪶", 
        val: "-70% Fall Damage", 
        desc: "Enchanted with airy levity. Cushions bottomless void drops, reducing fall damage by 70% when equipped.", 
        isBadge: true,
        isAccessory: true,
        damageReduction: 0.70,
        isSystem: false 
    }
};

// Accessories Registry (Accessible inside Accessories menu)
const ACCESSORIES_REGISTRY = [
    ITEM_REGISTRY.walk_straight,
    ITEM_REGISTRY.guardian_badge,
    ITEM_REGISTRY.feather_badge
];

// 6 Sacred Medallions Registry (Arranged from bottom, progressing clockwise)
const MEDALLIONS_REGISTRY = [
    {
        id: "sprint_speed",
        name: "Sprint Speed Medallion",
        icon: "⚡",
        slotPosition: 1,
        earned: true,
        clockPosition: "6 o'clock (Bottom)",
        benefit: "+50% Movement & Sprint Speed",
        desc: "Channeling ancient kinetic energy, permanently boosting running and walking velocity across all realms. Always active."
    },
    {
        id: "medallion_2",
        name: "Locked Medallion",
        icon: "🔒",
        slotPosition: 2,
        earned: false,
        clockPosition: "8 o'clock (Bottom-Left)",
        benefit: "Undiscovered Sacred Power",
        desc: "This sacred medallion has not yet been earned. Continue your journey across the realms to awaken its power."
    },
    {
        id: "medallion_3",
        name: "Locked Medallion",
        icon: "🔒",
        slotPosition: 3,
        earned: false,
        clockPosition: "10 o'clock (Top-Left)",
        benefit: "Undiscovered Sacred Power",
        desc: "This sacred medallion has not yet been earned. Continue your journey across the realms to awaken its power."
    },
    {
        id: "medallion_4",
        name: "Locked Medallion",
        icon: "🔒",
        slotPosition: 4,
        earned: false,
        clockPosition: "12 o'clock (Top)",
        benefit: "Undiscovered Sacred Power",
        desc: "This sacred medallion has not yet been earned. Continue your journey across the realms to awaken its power."
    },
    {
        id: "medallion_5",
        name: "Locked Medallion",
        icon: "🔒",
        slotPosition: 5,
        earned: false,
        clockPosition: "2 o'clock (Top-Right)",
        benefit: "Undiscovered Sacred Power",
        desc: "This sacred medallion has not yet been earned. Continue your journey across the realms to awaken its power."
    },
    {
        id: "medallion_6",
        name: "Locked Medallion",
        icon: "🔒",
        slotPosition: 6,
        earned: false,
        clockPosition: "4 o'clock (Bottom-Right)",
        benefit: "Undiscovered Sacred Power",
        desc: "This sacred medallion has not yet been earned. Continue your journey across the realms to awaken its power."
    }
];

// Equippable Items List (Accessible inside Equippable Items menu)
const EQUIPPABLE_ITEMS_REGISTRY = [
    ITEM_REGISTRY.map,
    ITEM_REGISTRY.telescope,
    ITEM_REGISTRY.bat,
    ITEM_REGISTRY.lyre,
    ITEM_REGISTRY.cell_phone,
    ITEM_REGISTRY.text_message,
    ITEM_REGISTRY.radio
];

// Consumable Items Registry (Implementation kept active, ready for custom supplies)
const CONSUMABLES_REGISTRY = [];

