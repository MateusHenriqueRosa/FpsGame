// Tela de Cartas
let selectedCardId = null;
let currentDeck = [];

function initCardsScreen() {
    console.log('🃏 Inicializando tela de cartas...');
    
    // Carregar deck atual
    currentDeck = [...gameState.deck];
    
    // Event listeners
    document.getElementById('backFromCards').addEventListener('click', () => {
        showScreen('mainMenu');
        updateMenuUI();
    });
    
    document.getElementById('closeCardDetail').addEventListener('click', closeCardDetail);
    document.getElementById('saveDeckBtn').addEventListener('click', saveDeck);
    
    renderCardCollection();
    renderDeckSlots();
    updateCardsUI();
    
    console.log('🃏 Tela de cartas inicializada!');
}

function updateCardsUI() {
    const goldCountCards = document.getElementById('goldCountCards');
    if (goldCountCards) goldCountCards.textContent = gameState.gold;
    
    // Atualizar contador do deck
    const deckCount = document.getElementById('deckCount');
    if (deckCount) deckCount.textContent = currentDeck.length;
    
    // Atualizar botão salvar
    const saveDeckBtn = document.getElementById('saveDeckBtn');
    if (saveDeckBtn) {
        saveDeckBtn.disabled = currentDeck.length !== 8;
        saveDeckBtn.textContent = currentDeck.length === 8 ? 'SALVAR DECK' : `FALTAM ${8 - currentDeck.length} CARTAS`;
    }
}

function renderDeckSlots() {
    const slots = document.querySelectorAll('.deck-slot');
    
    slots.forEach((slot, index) => {
        const cardId = currentDeck[index];
        
        if (cardId && CARDS[cardId]) {
            const card = CARDS[cardId];
            slot.className = 'deck-slot filled';
            slot.innerHTML = `
                <div class="slot-number">${index + 1}</div>
                <div class="card-cost">${card.cost}</div>
                <div class="card-icon">${card.icon}</div>
                <div class="card-name">${card.name}</div>
                <button class="remove-card-btn" onclick="removeFromDeck(${index})">×</button>
            `;
        } else {
            slot.className = 'deck-slot empty';
            slot.innerHTML = `
                <div class="slot-number">${index + 1}</div>
                <div class="slot-hint">Arraste uma carta</div>
            `;
        }
        
        // Event listeners para drop
        slot.addEventListener('dragover', handleDragOver);
        slot.addEventListener('drop', (e) => handleDrop(e, index));
        slot.addEventListener('dragleave', handleDragLeave);
    });
}

function renderCardCollection() {
    const container = document.getElementById('cardCollection');
    container.innerHTML = '';
    
    // Ordenar cartas por raridade
    const rarityOrder = { common: 0, rare: 1, epic: 2, legendary: 3 };
    const sortedCards = Object.entries(CARDS).sort((a, b) => {
        return rarityOrder[a[1].rarity] - rarityOrder[b[1].rarity];
    });
    
    sortedCards.forEach(([cardId, card]) => {
        const level = gameState.cardLevels[cardId] || 1;
        const count = gameState.cardCounts[cardId] || 0;
        const inDeck = currentDeck.includes(cardId);
        
        const cardElement = document.createElement('div');
        cardElement.className = `card rarity-${card.rarity} ${inDeck ? 'in-deck' : ''}`;
        cardElement.draggable = true;
        cardElement.dataset.cardId = cardId;
        
        cardElement.innerHTML = `
            <div class="card-cost">${card.cost}</div>
            <div class="card-icon">${card.icon}</div>
            <div class="card-name">${card.name}</div>
            <div class="card-level">Nível ${level}</div>
            <div class="card-count">x${count}</div>
            <div class="rarity-badge ${card.rarity}">${getRarityName(card.rarity)}</div>
        `;
        
        // Event listeners
        cardElement.addEventListener('click', () => showCardDetail(cardId));
        cardElement.addEventListener('dragstart', handleDragStart);
        cardElement.addEventListener('dragend', handleDragEnd);
        
        container.appendChild(cardElement);
    });
}

// Drag & Drop handlers
function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.dataset.cardId);
    e.target.classList.add('dragging');
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e, slotIndex) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const cardId = e.dataTransfer.getData('text/plain');
    
    if (cardId && CARDS[cardId]) {
        // Verificar se a carta já está no deck
        const existingIndex = currentDeck.indexOf(cardId);
        
        if (existingIndex !== -1) {
            // Se já está no deck, trocar posições
            currentDeck[existingIndex] = currentDeck[slotIndex];
            currentDeck[slotIndex] = cardId;
        } else {
            // Adicionar nova carta
            currentDeck[slotIndex] = cardId;
        }
        
        // Remover slots vazios
        currentDeck = currentDeck.filter(id => id);
        
        renderDeckSlots();
        renderCardCollection();
        updateCardsUI();
    }
}

function removeFromDeck(slotIndex) {
    currentDeck.splice(slotIndex, 1);
    renderDeckSlots();
    renderCardCollection();
    updateCardsUI();
}

function saveDeck() {
    if (currentDeck.length === 8) {
        const success = gameState.saveDeck(currentDeck);
        if (success) {
            alert('✅ Deck salvo com sucesso!');
        }
    } else {
        alert(`❌ O deck deve ter exatamente 8 cartas!\nAtualmente: ${currentDeck.length}/8`);
    }
}

function getRarityName(rarity) {
    const names = {
        common: 'Comum',
        rare: 'Raro',
        epic: 'Épico',
        legendary: 'Lendário'
    };
    return names[rarity] || rarity;
}

function showCardDetail(cardId) {
    selectedCardId = cardId;
    const card = CARDS[cardId];
    const currentLevel = gameState.cardLevels[cardId] || 1;
    const cardCount = gameState.cardCounts[cardId] || 0;
    const cardsNeeded = gameState.getCardsNeededForUpgrade(currentLevel, card.rarity);
    const upgradeCost = gameState.getUpgradeCost(currentLevel, card.rarity);
    
    // Calcular estatísticas
    const currentStats = getCardStats(cardId, currentLevel);
    const nextStats = currentLevel < 5 ? getCardStats(cardId, currentLevel + 1) : null;
    
    // Preencher informações básicas
    document.getElementById('detailCardIcon').textContent = card.icon;
    document.getElementById('detailCardName').textContent = card.name;
    document.getElementById('detailCardLevel').textContent = `Nível ${currentLevel}`;
    document.getElementById('detailCardCost').textContent = `💜 ${card.cost}`;
    
    // Raridade
    const rarityBadge = document.getElementById('detailCardRarity');
    rarityBadge.className = `rarity-badge ${card.rarity}`;
    rarityBadge.textContent = getRarityName(card.rarity);
    
    // Estatísticas
    if (card.type === 'spell') {
        document.getElementById('detailCardHp').textContent = '-';
        document.getElementById('detailCardDamage').textContent = currentStats.damage;
        document.getElementById('detailCardSpeed').textContent = '-';
        document.getElementById('detailCardHpNext').textContent = '';
        document.getElementById('detailCardDamageNext').textContent = nextStats ? `→ ${nextStats.damage}` : '';
        document.getElementById('detailCardSpeedNext').textContent = '';
    } else {
        document.getElementById('detailCardHp').textContent = currentStats.hp;
        document.getElementById('detailCardDamage').textContent = currentStats.damage;
        document.getElementById('detailCardSpeed').textContent = currentStats.speed.toFixed(1);
        
        if (nextStats && currentLevel < 5) {
            document.getElementById('detailCardHpNext').textContent = `→ ${nextStats.hp}`;
            document.getElementById('detailCardDamageNext').textContent = `→ ${nextStats.damage}`;
        } else {
            document.getElementById('detailCardHpNext').textContent = '';
            document.getElementById('detailCardDamageNext').textContent = '';
        }
        document.getElementById('detailCardSpeedNext').textContent = '';
    }
    
    // Alcance
    const rangeRow = document.getElementById('detailCardRangeRow');
    if (card.type === 'troop' && ['archer', 'wizard', 'dragon', 'sparky'].includes(cardId)) {
        rangeRow.style.display = 'flex';
        document.getElementById('detailCardRange').textContent = '3';
    } else {
        rangeRow.style.display = 'none';
    }
    
    // Progresso
    if (currentLevel < 5) {
        document.getElementById('detailCardProgress').textContent = `${cardCount}/${cardsNeeded}`;
        const progressPercent = (cardCount / cardsNeeded) * 100;
        document.getElementById('detailProgressFill').style.width = `${Math.min(progressPercent, 100)}%`;
    } else {
        document.getElementById('detailCardProgress').textContent = 'MAX';
        document.getElementById('detailProgressFill').style.width = '100%';
    }
    
    // Custo e botão
    document.getElementById('detailUpgradeCost').textContent = `💰 ${upgradeCost}`;
    
    const upgradeBtn = document.getElementById('upgradeCardBtn');
    const canUpgrade = currentLevel < 5 && cardCount >= cardsNeeded && gameState.gold >= upgradeCost;
    
    // Limpar event listeners antigos
    const newUpgradeBtn = upgradeBtn.cloneNode(true);
    upgradeBtn.parentNode.replaceChild(newUpgradeBtn, upgradeBtn);
    
    if (currentLevel >= 5) {
        newUpgradeBtn.textContent = 'NÍVEL MÁXIMO';
        newUpgradeBtn.disabled = true;
    } else if (!canUpgrade) {
        newUpgradeBtn.textContent = cardCount < cardsNeeded ? 'FALTAM CARTAS' : 'SEM OURO';
        newUpgradeBtn.disabled = true;
    } else {
        newUpgradeBtn.textContent = 'MELHORAR';
        newUpgradeBtn.disabled = false;
        newUpgradeBtn.onclick = () => doUpgrade(cardId);
    }
    
    document.getElementById('cardDetailModal').classList.add('active');
}

function getCardStats(cardId, level) {
    const card = CARDS[cardId];
    const multiplier = 1 + (level - 1) * 0.1;
    
    if (card.type === 'spell') {
        return {
            hp: 0,
            damage: Math.floor(card.damage * multiplier),
            speed: 0
        };
    }
    
    return {
        hp: Math.floor(card.hp * multiplier),
        damage: Math.floor(card.damage * multiplier),
        speed: card.speed || 0
    };
}

function closeCardDetail() {
    document.getElementById('cardDetailModal').classList.remove('active');
    selectedCardId = null;
}

function doUpgrade(cardId) {
    const card = CARDS[cardId];
    const currentLevel = gameState.cardLevels[cardId] || 1;
    const cardCount = gameState.cardCounts[cardId] || 0;
    const cardsNeeded = gameState.getCardsNeededForUpgrade(currentLevel, card.rarity);
    const upgradeCost = gameState.getUpgradeCost(currentLevel, card.rarity);
    
    const canUpgrade = currentLevel < 5 && cardCount >= cardsNeeded && gameState.gold >= upgradeCost;
    
    if (canUpgrade) {
        console.log('✅ Executando upgrade de', cardId);
        
        gameState.cardLevels[cardId]++;
        gameState.cardCounts[cardId] -= cardsNeeded;
        gameState.gold -= upgradeCost;
        gameState.save();
        
        // Fechar e reabrir modal
        closeCardDetail();
        updateCardsUI();
        renderCardCollection();
        
        setTimeout(() => showCardDetail(cardId), 100);
        
        console.log('🎉 Upgrade concluído!');
    }
}