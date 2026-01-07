// Tela de Baús

function initChestsScreen() {
    console.log('🎁 Inicializando tela de baús...');
    
    // Event listeners
    document.getElementById('backFromChests').addEventListener('click', () => {
        showScreen('mainMenu');
        updateMenuUI();
    });
    
    document.getElementById('collectRewards').addEventListener('click', collectChestRewards);
    
    renderChestShop();
    renderOwnedChests();
    updateChestsUI();
    
    console.log('🎁 Tela de baús inicializada!');
}

function updateChestsUI() {
    const goldCountChests = document.getElementById('goldCountChests');
    if (goldCountChests) goldCountChests.textContent = gameState.gold;
}

function renderChestShop() {
    document.querySelectorAll('.buy-chest-btn').forEach(btn => {
        btn.replaceWith(btn.cloneNode(true));
    });
    
    document.querySelectorAll('.buy-chest-btn').forEach(btn => {
        const chestType = btn.dataset.chest;
        const chestConfig = CHEST_CONFIG[chestType];
        
        if (gameState.gold >= chestConfig.price) {
            btn.disabled = false;
            btn.textContent = 'COMPRAR';
        } else {
            btn.disabled = true;
            btn.textContent = 'SEM OURO';
        }
        
        btn.addEventListener('click', () => buyChest(chestType));
    });
}

function renderOwnedChests() {
    const container = document.getElementById('ownedChestsList');
    container.innerHTML = '';
    
    if (gameState.ownedChests.length === 0) {
        container.innerHTML = '<div class="no-chests">Nenhum baú disponível</div>';
        return;
    }
    
    gameState.ownedChests.forEach((chestType, index) => {
        const chestConfig = CHEST_CONFIG[chestType];
        const chestElement = document.createElement('div');
        chestElement.className = 'owned-chest';
        chestElement.innerHTML = `
            <div class="chest-icon">${chestConfig.icon}</div>
            <div class="chest-name">${chestConfig.name}</div>
            <button class="open-chest-btn">ABRIR</button>
        `;
        
        chestElement.querySelector('.open-chest-btn').addEventListener('click', () => {
            openChest(index, chestType);
        });
        
        container.appendChild(chestElement);
    });
}

function buyChest(chestType) {
    const chestConfig = CHEST_CONFIG[chestType];
    
    if (gameState.gold >= chestConfig.price) {
        gameState.gold -= chestConfig.price;
        gameState.ownedChests.push(chestType);
        gameState.save();
        
        updateChestsUI();
        renderChestShop();
        renderOwnedChests();
    }
}

function openChest(chestIndex, chestType) {
    gameState.ownedChests.splice(chestIndex, 1);
    showChestOpeningModal(chestType);
}

function showChestOpeningModal(chestType) {
    const modal = document.getElementById('chestOpenModal');
    const chestConfig = CHEST_CONFIG[chestType];
    
    document.getElementById('openingChestIcon').textContent = chestConfig.icon;
    document.getElementById('openingChestName').textContent = `Abrindo ${chestConfig.name}...`;
    
    document.querySelector('.chest-opening').style.display = 'block';
    document.getElementById('chestRewards').style.display = 'none';
    
    modal.classList.add('active');
    
    setTimeout(() => generateChestRewards(chestType), 2500);
}

function generateChestRewards(chestType) {
    const chestConfig = CHEST_CONFIG[chestType];
    const rewards = [];
    
    // Gerar cartas baseadas nas chances de raridade
    const cardCount = Math.floor(Math.random() * (chestConfig.cardCount.max - chestConfig.cardCount.min + 1)) + chestConfig.cardCount.min;
    
    for (let i = 0; i < cardCount; i++) {
        const rarity = getRandomRarity(chestConfig.rarityChances);
        const cardsOfRarity = CARDS_BY_RARITY[rarity];
        
        if (cardsOfRarity.length > 0) {
            const randomCard = cardsOfRarity[Math.floor(Math.random() * cardsOfRarity.length)];
            
            // Quantidade baseada na raridade
            let amount;
            switch(rarity) {
                case 'common': amount = Math.floor(Math.random() * 3) + 2; break;
                case 'rare': amount = Math.floor(Math.random() * 2) + 1; break;
                case 'epic': amount = 1; break;
                case 'legendary': amount = 1; break;
                default: amount = 1;
            }
            
            rewards.push({
                type: 'card',
                cardId: randomCard,
                amount: amount,
                rarity: rarity
            });
            
            gameState.cardCounts[randomCard] = (gameState.cardCounts[randomCard] || 0) + amount;
        }
    }
    
    // Gerar ouro
    const goldAmount = Math.floor(Math.random() * (chestConfig.goldReward.max - chestConfig.goldReward.min + 1)) + chestConfig.goldReward.min;
    rewards.push({
        type: 'gold',
        amount: goldAmount
    });
    
    gameState.gold += goldAmount;
    
    displayChestRewards(rewards);
}

function getRandomRarity(chances) {
    const rand = Math.random();
    let cumulative = 0;
    
    for (const [rarity, chance] of Object.entries(chances)) {
        cumulative += chance;
        if (rand <= cumulative && chance > 0) {
            return rarity;
        }
    }
    
    return 'common';
}

function displayChestRewards(rewards) {
    document.querySelector('.chest-opening').style.display = 'none';
    
    const rewardsDisplay = document.getElementById('chestRewards');
    const rewardsList = document.getElementById('rewardsList');
    
    rewardsList.innerHTML = '';
    
    // Ordenar por raridade
    const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3, gold: 4 };
    rewards.sort((a, b) => {
        const aOrder = a.type === 'gold' ? 4 : rarityOrder[a.rarity];
        const bOrder = b.type === 'gold' ? 4 : rarityOrder[b.rarity];
        return aOrder - bOrder;
    });
    
    rewards.forEach(reward => {
        const rewardElement = document.createElement('div');
        rewardElement.className = 'reward-item';
        
        if (reward.type === 'card') {
            const card = CARDS[reward.cardId];
            rewardElement.innerHTML = `
                <div class="reward-icon">${card.icon}</div>
                <div class="reward-name">${card.name}</div>
                <div class="reward-amount">+${reward.amount}</div>
                <div class="rarity-badge ${reward.rarity}">${getRarityNameChest(reward.rarity)}</div>
            `;
        } else if (reward.type === 'gold') {
            rewardElement.innerHTML = `
                <div class="reward-icon">💰</div>
                <div class="reward-name">Ouro</div>
                <div class="reward-amount">+${reward.amount}</div>
            `;
        }
        
        rewardsList.appendChild(rewardElement);
    });
    
    rewardsDisplay.style.display = 'block';
}

function getRarityNameChest(rarity) {
    const names = {
        common: 'Comum',
        rare: 'Raro',
        epic: 'Épico',
        legendary: 'Lendário'
    };
    return names[rarity] || rarity;
}

function collectChestRewards() {
    const modal = document.getElementById('chestOpenModal');
    modal.classList.remove('active');
    
    gameState.save();
    updateChestsUI();
    renderOwnedChests();
    renderChestShop();
}