// Estado do jogo
class GameState {
    constructor() {
        console.log('🏗️ Inicializando GameState...');
        
        this.trophies = parseInt(localStorage.getItem('trophies')) || 0;
        this.gold = parseInt(localStorage.getItem('gold')) || 1000;
        this.wins = parseInt(localStorage.getItem('wins')) || 0;
        this.losses = parseInt(localStorage.getItem('losses')) || 0;
        this.cardLevels = JSON.parse(localStorage.getItem('cardLevels')) || {};
        this.cardCounts = JSON.parse(localStorage.getItem('cardCounts')) || {};
        this.ownedChests = JSON.parse(localStorage.getItem('ownedChests')) || [];
        this.deck = JSON.parse(localStorage.getItem('deck')) || [];
        
        this.currentArena = this.calculateArena();
        this.elixir = GAME_CONFIG.ELIXIR_MAX;
        this.gameTime = GAME_CONFIG.GAME_DURATION;
        this.playerTowers = { left: 100, king: 200, right: 100 };
        this.enemyTowers = { left: 100, king: 200, right: 100 };
        this.selectedCard = null;
        this.hand = [];
        
        // Inicializar cartas e deck padrão
        this.initializeCards();
        this.initializeDefaultDeck();
        this.generateHand();
        
        console.log('🏗️ GameState inicializado!');
    }
    
    initializeCards() {
        Object.keys(CARDS).forEach(cardId => {
            if (!this.cardLevels[cardId]) {
                this.cardLevels[cardId] = 1;
            }
            if (!this.cardCounts[cardId]) {
                // Cartas iniciais baseadas na raridade
                const rarity = CARDS[cardId].rarity;
                switch(rarity) {
                    case 'common': this.cardCounts[cardId] = 10; break;
                    case 'rare': this.cardCounts[cardId] = 5; break;
                    case 'epic': this.cardCounts[cardId] = 2; break;
                    case 'legendary': this.cardCounts[cardId] = 0; break;
                }
            }
        });
        
        if (this.gold < 500) {
            this.gold = 1000;
        }
    }
    
    initializeDefaultDeck() {
        // Se não tem deck salvo, criar um deck padrão com as primeiras 8 cartas
        if (this.deck.length !== 8) {
            this.deck = Object.keys(CARDS).slice(0, 8);
            console.log('🃏 Deck padrão criado:', this.deck);
        }
    }
    
    saveDeck(newDeck) {
        if (newDeck.length === 8) {
            this.deck = [...newDeck];
            this.save();
            console.log('💾 Deck salvo:', this.deck);
            return true;
        }
        return false;
    }
    
    calculateArena() {
        for (let i = GAME_CONFIG.ARENA_PROGRESSION.length - 1; i >= 0; i--) {
            if (this.trophies >= GAME_CONFIG.ARENA_PROGRESSION[i]) {
                return i;
            }
        }
        return 0;
    }
    
    generateHand() {
        this.hand = [];
        const shuffledDeck = [...this.deck].sort(() => Math.random() - 0.5);
        this.hand = shuffledDeck.slice(0, 4);
    }
    
    save() {
        localStorage.setItem('trophies', this.trophies.toString());
        localStorage.setItem('gold', this.gold.toString());
        localStorage.setItem('wins', this.wins.toString());
        localStorage.setItem('losses', this.losses.toString());
        localStorage.setItem('cardLevels', JSON.stringify(this.cardLevels));
        localStorage.setItem('cardCounts', JSON.stringify(this.cardCounts));
        localStorage.setItem('ownedChests', JSON.stringify(this.ownedChests));
        localStorage.setItem('deck', JSON.stringify(this.deck));
        console.log('💾 Dados salvos!');
    }
    
    getCardsNeededForUpgrade(currentLevel, rarity) {
        // Cartas necessárias variam por raridade
        const requirements = {
            common: [0, 2, 4, 10, 20, 0],
            rare: [0, 2, 4, 6, 10, 0],
            epic: [0, 1, 2, 4, 6, 0],
            legendary: [0, 1, 1, 2, 4, 0]
        };
        
        if (currentLevel < 1 || currentLevel > 5) return 0;
        return requirements[rarity][currentLevel] || 0;
    }
    
    getUpgradeCost(currentLevel, rarity) {
        // Custo varia por raridade
        const baseCost = {
            common: 50,
            rare: 100,
            epic: 200,
            legendary: 500
        };
        return baseCost[rarity] * currentLevel;
    }
}

// Instância global do estado do jogo
let gameState = new GameState();