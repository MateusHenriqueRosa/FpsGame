// Configuração do jogo
const GAME_CONFIG = {
    ELIXIR_MAX: 10,
    ELIXIR_REGEN_RATE: 2800, // Aumentado de 1000 para 2800ms (mais lento)
    GAME_DURATION: 180000,
    ARENA_PROGRESSION: [0, 150, 300, 450, 600],
    ARENA_NAMES: [
        'Arena dos Goblins',
        'Arena dos Ossos',
        'Arena Bárbara',
        'Arena P.E.K.K.A',
        'Arena Lendária'
    ]
};

// Configuração dos baús com raridades
const CHEST_CONFIG = {
    common: {
        name: 'Baú Comum',
        icon: '📦',
        price: 50,
        cardCount: { min: 3, max: 6 },
        goldReward: { min: 10, max: 30 },
        rarityChances: {
            common: 0.85,
            rare: 0.15,
            epic: 0,
            legendary: 0
        }
    },
    rare: {
        name: 'Baú Raro',
        icon: '🎁',
        price: 150,
        cardCount: { min: 6, max: 12 },
        goldReward: { min: 30, max: 80 },
        rarityChances: {
            common: 0.60,
            rare: 0.35,
            epic: 0.05,
            legendary: 0
        }
    },
    epic: {
        name: 'Baú Épico',
        icon: '💎',
        price: 400,
        cardCount: { min: 10, max: 18 },
        goldReward: { min: 80, max: 200 },
        rarityChances: {
            common: 0.40,
            rare: 0.40,
            epic: 0.18,
            legendary: 0.02
        }
    },
    legendary: {
        name: 'Baú Lendário',
        icon: '👑',
        price: 1000,
        cardCount: { min: 15, max: 25 },
        goldReward: { min: 200, max: 500 },
        rarityChances: {
            common: 0.25,
            rare: 0.35,
            epic: 0.30,
            legendary: 0.10
        }
    }
};

// Definição das cartas com raridades e comportamentos específicos
const CARDS = {
    // COMUNS
    knight: {
        name: 'Cavaleiro',
        icon: '🛡️',
        cost: 3,
        hp: 100,
        damage: 25,
        speed: 1,
        type: 'troop',
        rarity: 'common',
        description: 'Tanque balanceado que ataca qualquer coisa'
    },
    archer: {
        name: 'Arqueira',
        icon: '🏹',
        cost: 3,
        hp: 40,
        damage: 15,
        speed: 1.5,
        type: 'troop',
        rarity: 'common',
        description: 'Ataque à distância, prefere tropas'
    },
    goblin: {
        name: 'Goblins',
        icon: '👹',
        cost: 2,
        hp: 25,
        damage: 15,
        speed: 2,
        count: 3,
        type: 'troop',
        rarity: 'common',
        description: 'Tropas rápidas em grupo'
    },
    skeleton: {
        name: 'Esqueletos',
        icon: '💀',
        cost: 1,
        hp: 15,
        damage: 10,
        speed: 1.5,
        count: 4,
        type: 'troop',
        rarity: 'common',
        description: 'Enxame de baixo custo'
    },
    arrows: {
        name: 'Flechas',
        icon: '➡️',
        cost: 3,
        damage: 50,
        radius: 3,
        type: 'spell',
        rarity: 'common',
        description: 'Feitiço de área contra tropas pequenas'
    },
    // RARAS
    giant: {
        name: 'Gigante',
        icon: '🗿',
        cost: 5,
        hp: 200,
        damage: 40,
        speed: 0.5,
        type: 'troop',
        rarity: 'rare',
        description: 'Tanque que foca apenas torres'
    },
    wizard: {
        name: 'Mago',
        icon: '🧙‍♂️',
        cost: 5,
        hp: 60,
        damage: 35,
        speed: 1,
        type: 'troop',
        rarity: 'rare',
        description: 'Ataque à distância, prefere tropas'
    },
    fireball: {
        name: 'Bola de Fogo',
        icon: '🔥',
        cost: 4,
        damage: 80,
        radius: 2,
        type: 'spell',
        rarity: 'rare',
        description: 'Feitiço de alto dano em área'
    },
    // ÉPICAS
    dragon: {
        name: 'Dragão Bebê',
        icon: '🐲',
        cost: 4,
        hp: 80,
        damage: 30,
        speed: 1.2,
        type: 'troop',
        rarity: 'epic',
        description: 'Unidade voadora que prefere tropas'
    },
    lightning: {
        name: 'Raio',
        icon: '⚡',
        cost: 6,
        damage: 120,
        targets: 3,
        type: 'spell',
        rarity: 'epic',
        description: 'Atinge os 3 alvos com maior HP'
    },
    prince: {
        name: 'Príncipe',
        icon: '🤴',
        cost: 5,
        hp: 120,
        damage: 50,
        speed: 1.8,
        type: 'troop',
        rarity: 'epic',
        description: 'Carga devastadora contra torres'
    },
    // LENDÁRIAS
    pekka: {
        name: 'P.E.K.K.A',
        icon: '🤖',
        cost: 7,
        hp: 300,
        damage: 80,
        speed: 0.6,
        type: 'troop',
        rarity: 'legendary',
        description: 'Tanque supremo que foca torres'
    },
    sparky: {
        name: 'Sparky',
        icon: '⚙️',
        cost: 6,
        hp: 150,
        damage: 150,
        speed: 0.4,
        type: 'troop',
        rarity: 'legendary',
        description: 'Canhão devastador contra torres'
    }
};

// Cartas por raridade (para facilitar busca)
const CARDS_BY_RARITY = {
    common: [],
    rare: [],
    epic: [],
    legendary: []
};

// Preencher cartas por raridade
Object.entries(CARDS).forEach(([cardId, card]) => {
    CARDS_BY_RARITY[card.rarity].push(cardId);
});

console.log('📋 Cartas por raridade:', CARDS_BY_RARITY);