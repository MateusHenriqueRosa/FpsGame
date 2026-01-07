// Tela de Jogo
let scene, camera, renderer;
let gameObjects = [];
let elixirTimer, gameTimer;
let isGameActive = false;
let currentElixir = 10;
let currentGameTime = 180000;
let playerTowers = { left: 100, king: 200, right: 100 };
let enemyTowers = { left: 100, king: 200, right: 100 };
let selectedGameCard = null;
let gameHand = [];

function initGameScreen() {
    console.log('🎮 Inicializando tela de jogo...');
    
    document.getElementById('continueButton').addEventListener('click', () => {
        showScreen('mainMenu');
        updateMenuUI();
    });
    
    startGame();
}

function startGame() {
    console.log('🎮 === INICIANDO NOVA PARTIDA ===');
    
    currentElixir = 10;
    currentGameTime = 180000;
    playerTowers = { left: 100, king: 200, right: 100 };
    enemyTowers = { left: 100, king: 200, right: 100 };
    gameObjects = [];
    isGameActive = true;
    
    // Verificar se tem deck válido
    if (!gameState.deck || gameState.deck.length !== 8) {
        console.log('❌ Deck inválido:', gameState.deck);
        alert('❌ Você precisa montar um deck com 8 cartas antes de jogar!\nVá em CARTAS para criar seu deck.');
        showScreen('mainMenu');
        return;
    }
    
    console.log('🃏 Deck do jogador:', gameState.deck.map(id => CARDS[id].name));
    
    gameState.generateHand();
    gameHand = [...gameState.hand];
    
    console.log('✋ Mão inicial:', gameHand.map(id => CARDS[id].name));
    console.log('🏆 Troféus atuais:', gameState.trophies);
    console.log('🏟️ Arena atual:', GAME_CONFIG.ARENA_NAMES[gameState.currentArena]);
    
    initializeThreeJS();
    setupGameUI();
    
    // Inicializar IA do inimigo
    initializeEnemyAI();
    
    startGameLoop();
    
    console.log('✅ Jogo iniciado com sucesso!');
}

function initializeThreeJS() {
    const canvas = document.getElementById('gameCanvas');
    canvas.innerHTML = '';
    
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight - 180);
    renderer.setClearColor(0x4a90e2);
    canvas.appendChild(renderer.domElement);
    
    camera.position.set(0, 10, 8);
    camera.lookAt(0, 0, 0);
    
    createArena();
    
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);
    
    renderer.domElement.addEventListener('click', onArenaClick);
}

function createArena() {
    console.log('🏗️ Criando arena com pontes...');
    
    // Chão da arena
    const groundGeometry = new THREE.PlaneGeometry(10, 16);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    
    // Rio no meio
    const riverGeometry = new THREE.PlaneGeometry(10, 1.5);
    const riverMaterial = new THREE.MeshLambertMaterial({ color: 0x4169E1 });
    const river = new THREE.Mesh(riverGeometry, riverMaterial);
    river.rotation.x = -Math.PI / 2;
    river.position.y = 0.01;
    scene.add(river);
    
    // Ponte esquerda
    const bridgeLeftGeometry = new THREE.PlaneGeometry(1.5, 1.5);
    const bridgeMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const bridgeLeft = new THREE.Mesh(bridgeLeftGeometry, bridgeMaterial);
    bridgeLeft.rotation.x = -Math.PI / 2;
    bridgeLeft.position.set(-2.5, 0.02, 0);
    bridgeLeft.userData = { type: 'bridge', side: 'left' };
    scene.add(bridgeLeft);
    gameObjects.push(bridgeLeft);
    
    // Ponte direita
    const bridgeRightGeometry = new THREE.PlaneGeometry(1.5, 1.5);
    const bridgeRight = new THREE.Mesh(bridgeRightGeometry, bridgeMaterial);
    bridgeRight.rotation.x = -Math.PI / 2;
    bridgeRight.position.set(2.5, 0.02, 0);
    bridgeRight.userData = { type: 'bridge', side: 'right' };
    scene.add(bridgeRight);
    gameObjects.push(bridgeRight);
    
    // Torres do jogador (parte de cima)
    createTower(-3, 6, 'player');
    createTower(3, 6, 'player');
    createTower(0, 7.5, 'player', true);
    
    // Torres do inimigo (parte de baixo)
    createTower(-3, -6, 'enemy');
    createTower(3, -6, 'enemy');
    createTower(0, -7.5, 'enemy', true);
    
    // Verificar torres criadas
    const towers = gameObjects.filter(obj => obj.userData.type === 'tower');
    console.log(`🏰 Total de torres criadas: ${towers.length}`);
    towers.forEach(tower => {
        console.log(`   - ${tower.userData.owner} ${tower.userData.isKing ? 'Rei' : 'Torre'} em (${tower.position.x}, ${tower.position.z}) HP: ${tower.userData.hp}`);
    });
    
    console.log('🏗️ Arena criada com sucesso!');
}

function createTower(x, z, owner, isKing = false) {
    const geometry = isKing ? 
        new THREE.CylinderGeometry(0.8, 0.8, 2, 8) : 
        new THREE.CylinderGeometry(0.6, 0.6, 1.5, 6);
    
    const material = new THREE.MeshLambertMaterial({ 
        color: owner === 'player' ? 0x4169E1 : 0xDC143C 
    });
    
    const tower = new THREE.Mesh(geometry, material);
    tower.position.set(x, isKing ? 1 : 0.75, z);
    
    const maxHp = isKing ? 200 : 100;
    
    tower.userData = { 
        type: 'tower', 
        owner, 
        isKing, 
        hp: maxHp,
        maxHp: maxHp,
        range: 4,
        damage: 30,
        attackSpeed: 1000,
        lastAttack: 0
    };
    
    scene.add(tower);
    gameObjects.push(tower);
    
    console.log(`🏰 Torre criada: ${owner} ${isKing ? 'Rei' : 'Normal'} em (${x}, ${z}) - HP: ${maxHp}`);
}

function setupGameUI() {
    renderGameHand();
    startElixirRegen();
    startGameTimer();
    updateGameUI();
}

function renderGameHand() {
    const handContainer = document.getElementById('cardHand');
    handContainer.innerHTML = '';
    
    gameHand.forEach((cardId) => {
        const card = CARDS[cardId];
        const cardElement = document.createElement('div');
        cardElement.className = 'hand-card';
        cardElement.dataset.cardId = cardId;
        
        let shortName = card.name;
        if (shortName.length > 8) shortName = shortName.substring(0, 6) + '..';
        
        cardElement.innerHTML = `
            <div class="card-cost">${card.cost}</div>
            <div class="card-icon">${card.icon}</div>
            <div class="card-name">${shortName}</div>
        `;
        
        cardElement.addEventListener('click', () => selectGameCard(cardId, cardElement));
        handContainer.appendChild(cardElement);
    });
}

function selectGameCard(cardId, element) {
    const card = CARDS[cardId];
    
    if (currentElixir >= card.cost) {
        document.querySelectorAll('.hand-card').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        selectedGameCard = cardId;
    }
}

function onArenaClick(event) {
    if (!selectedGameCard || !isGameActive) return;
    
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    const intersects = raycaster.intersectObjects(scene.children);
    if (intersects.length > 0) {
        const point = intersects[0].point;
        const card = CARDS[selectedGameCard];
        
        if (card.type === 'spell' || point.z > -0.5) {
            playGameCard(selectedGameCard, point.x, point.z);
        }
    }
}

function playGameCard(cardId, x, z) {
    const card = CARDS[cardId];
    
    if (currentElixir >= card.cost) {
        currentElixir -= card.cost;
        
        if (card.type === 'troop') {
            spawnTroop(cardId, x, z);
        } else if (card.type === 'spell') {
            castSpell(cardId, x, z);
        }
        
        const cardIndex = gameHand.indexOf(cardId);
        if (cardIndex > -1) {
            gameHand.splice(cardIndex, 1);
            const availableCards = gameState.deck.filter(id => !gameHand.includes(id));
            if (availableCards.length > 0) {
                const newCard = availableCards[Math.floor(Math.random() * availableCards.length)];
                gameHand.push(newCard);
            }
        }
        
        selectedGameCard = null;
        renderGameHand();
        updateGameUI();
    }
}

function spawnTroop(cardId, x, z) {
    const card = CARDS[cardId];
    const level = gameState.cardLevels[cardId] || 1;
    const count = card.count || 1;
    
    console.log(`🚀 Invocando ${count}x ${card.name} (nível ${level}) em (${x.toFixed(1)}, ${z.toFixed(1)})`);
    
    for (let i = 0; i < count; i++) {
        const geometry = new THREE.ConeGeometry(0.2, 0.5, 4);
        const material = new THREE.MeshLambertMaterial({ color: 0x4169E1 });
        const troop = new THREE.Mesh(geometry, material);
        
        const offsetX = (i - (count - 1) / 2) * 0.5;
        troop.position.set(x + offsetX, 0.25, z);
        
        // Definir comportamento baseado no tipo de carta
        const behavior = getTroopBehavior(cardId);
        
        troop.userData = {
            type: 'troop',
            cardId: cardId,
            hp: Math.floor(card.hp * (1 + (level - 1) * 0.1)),
            maxHp: Math.floor(card.hp * (1 + (level - 1) * 0.1)),
            damage: Math.floor(card.damage * (1 + (level - 1) * 0.1)),
            speed: card.speed,
            owner: 'player',
            target: null,
            range: ['archer', 'wizard', 'dragon', 'sparky'].includes(cardId) ? 3 : 1,
            attackSpeed: 1500,
            lastAttack: 0,
            healthBar: null,
            behavior: behavior,
            isFlying: ['dragon'].includes(cardId),
            needsBridge: !['dragon'].includes(cardId) // Tropas terrestres precisam de ponte
        };
        
        scene.add(troop);
        gameObjects.push(troop);
        
        // Criar barra de vida maior
        createHealthBar(troop);
        
        console.log(`✅ ${card.name} criado com comportamento: ${behavior}`);
    }
}

function castSpell(cardId, x, z) {
    const card = CARDS[cardId];
    const level = gameState.cardLevels[cardId] || 1;
    
    console.log(`🔥 Lançando feitiço ${card.name} (nível ${level}) em (${x.toFixed(1)}, ${z.toFixed(1)})`);
    
    const geometry = new THREE.SphereGeometry(card.radius || 1, 16, 16);
    const material = new THREE.MeshBasicMaterial({ 
        color: 0xFF4500, 
        transparent: true, 
        opacity: 0.7 
    });
    const spellEffect = new THREE.Mesh(geometry, material);
    spellEffect.position.set(x, 0.5, z);
    
    scene.add(spellEffect);
    
    let targetsHit = 0;
    gameObjects.forEach(obj => {
        if (obj.userData.type === 'troop' && obj.userData.owner === 'enemy') {
            const distance = obj.position.distanceTo(spellEffect.position);
            if (distance <= (card.radius || 1)) {
                const damage = Math.floor(card.damage * (1 + (level - 1) * 0.1));
                obj.userData.hp -= damage;
                targetsHit++;
                console.log(`💥 ${card.name} causou ${damage} de dano em ${obj.userData.cardId} (HP: ${obj.userData.hp}/${obj.userData.maxHp})`);
                
                if (obj.userData.hp <= 0) {
                    console.log(`💀 ${obj.userData.cardId} foi eliminado por ${card.name}`);
                    removeGameObject(obj);
                }
            }
        }
    });
    
    console.log(`✨ ${card.name} atingiu ${targetsHit} alvos`);
    setTimeout(() => scene.remove(spellEffect), 1000);
}

function getTroopBehavior(cardId) {
    // Definir comportamentos específicos para cada carta
    const behaviors = {
        'giant': 'building_only',      // Gigante só ataca torres
        'pekka': 'building_only',      // P.E.K.K.A só ataca torres
        'knight': 'balanced',          // Cavaleiro ataca tudo
        'archer': 'troops_first',      // Arqueira prefere tropas
        'wizard': 'troops_first',      // Mago prefere tropas
        'dragon': 'troops_first',      // Dragão prefere tropas
        'goblin': 'balanced',          // Goblins atacam tudo
        'skeleton': 'balanced',        // Esqueletos atacam tudo
        'prince': 'building_only',     // Príncipe foca torres
        'sparky': 'building_only'      // Sparky foca torres
    };
    
    return behaviors[cardId] || 'balanced';
}

function canCrossRiver(troop) {
    // Verificar se a tropa pode atravessar o rio
    if (troop.userData.isFlying) {
        console.log(`🐲 ${troop.userData.cardId} pode voar sobre o rio`);
        return true;
    }
    
    // Verificar se está próximo de uma ponte
    const bridges = gameObjects.filter(obj => obj.userData.type === 'bridge');
    for (let bridge of bridges) {
        const distance = troop.position.distanceTo(bridge.position);
        if (distance < 1.2) {
            console.log(`🌉 ${troop.userData.cardId} usando ponte ${bridge.userData.side}`);
            return true;
        }
    }
    
    return false;
}

function startElixirRegen() {
    elixirTimer = setInterval(() => {
        if (currentElixir < 10 && isGameActive) {
            currentElixir++;
            updateGameUI();
        }
    }, GAME_CONFIG.ELIXIR_REGEN_RATE); // Usar configuração do jogo
}

function startGameTimer() {
    gameTimer = setInterval(() => {
        if (currentGameTime > 0 && isGameActive) {
            currentGameTime -= 1000;
            updateGameUI();
            
            if (currentGameTime <= 0) {
                endGameByTowerCount();
            }
        }
    }, 1000);
}

function countRemainingTowers() {
    const playerTowers = gameObjects.filter(obj => 
        obj.userData.type === 'tower' && 
        obj.userData.owner === 'player' && 
        obj.userData.hp > 0
    );
    
    const enemyTowers = gameObjects.filter(obj => 
        obj.userData.type === 'tower' && 
        obj.userData.owner === 'enemy' && 
        obj.userData.hp > 0
    );
    
    return {
        player: playerTowers.length,
        enemy: enemyTowers.length,
        playerTowers: playerTowers,
        enemyTowers: enemyTowers
    };
}

function endGameByTowerCount() {
    const towerCount = countRemainingTowers();
    
    console.log(`⏰ Tempo esgotado! Torres restantes - Jogador: ${towerCount.player} | Inimigo: ${towerCount.enemy}`);
    
    if (towerCount.player > towerCount.enemy) {
        console.log('🎉 Vitória por torres restantes!');
        endGame('win');
    } else if (towerCount.enemy > towerCount.player) {
        console.log('😞 Derrota por torres restantes!');
        endGame('lose');
    } else {
        // Empate real - mesmo número de torres
        // Verificar HP total das torres para desempate
        const playerTotalHP = towerCount.playerTowers.reduce((sum, tower) => sum + tower.userData.hp, 0);
        const enemyTotalHP = towerCount.enemyTowers.reduce((sum, tower) => sum + tower.userData.hp, 0);
        
        console.log(`⚖️ Empate em torres! HP total - Jogador: ${playerTotalHP} | Inimigo: ${enemyTotalHP}`);
        
        if (playerTotalHP > enemyTotalHP) {
            console.log('🎉 Vitória por HP das torres!');
            endGame('win');
        } else if (enemyTotalHP > playerTotalHP) {
            console.log('😞 Derrota por HP das torres!');
            endGame('lose');
        } else {
            console.log('🤝 Empate perfeito!');
            endGame('draw');
        }
    }
}

function updateGameUI() {
    document.getElementById('elixirCount').textContent = currentElixir;
    document.getElementById('elixirProgress').style.setProperty('--elixir-width', `${(currentElixir / 10) * 100}%`);
    
    const minutes = Math.floor(currentGameTime / 60000);
    const seconds = Math.floor((currentGameTime % 60000) / 1000);
    
    // Adicionar contagem de torres no timer
    const towerCount = countRemainingTowers();
    const timerText = `${minutes}:${seconds.toString().padStart(2, '0')} | Torres: ${towerCount.player}-${towerCount.enemy}`;
    
    document.getElementById('gameTimer').textContent = timerText;
    
    updateTowerHP();
}

function updateTowerHP() {
    // Resetar valores
    playerTowers = { left: 0, king: 0, right: 0 };
    enemyTowers = { left: 0, king: 0, right: 0 };
    
    gameObjects.forEach(obj => {
        if (obj.userData.type === 'tower') {
            const hp = Math.max(0, obj.userData.hp);
            
            if (obj.userData.owner === 'player') {
                if (obj.userData.isKing) {
                    playerTowers.king = hp;
                } else if (obj.position.x < 0) {
                    playerTowers.left = hp;
                } else {
                    playerTowers.right = hp;
                }
            } else {
                if (obj.userData.isKing) {
                    enemyTowers.king = hp;
                } else if (obj.position.x < 0) {
                    enemyTowers.left = hp;
                } else {
                    enemyTowers.right = hp;
                }
            }
        }
    });
    
    // Atualizar UI com indicação visual de torres destruídas
    document.getElementById('playerTower1').innerHTML = playerTowers.left > 0 ? 
        `🏰 <span>${playerTowers.left}</span>` : 
        `💥 <span style="color: #666;">0</span>`;
    
    document.getElementById('playerKing').innerHTML = playerTowers.king > 0 ? 
        `👑 <span>${playerTowers.king}</span>` : 
        `💀 <span style="color: #666;">0</span>`;
    
    document.getElementById('playerTower2').innerHTML = playerTowers.right > 0 ? 
        `🏰 <span>${playerTowers.right}</span>` : 
        `💥 <span style="color: #666;">0</span>`;
    
    document.getElementById('enemyTower1').innerHTML = enemyTowers.left > 0 ? 
        `🏰 <span>${enemyTowers.left}</span>` : 
        `💥 <span style="color: #666;">0</span>`;
    
    document.getElementById('enemyKing').innerHTML = enemyTowers.king > 0 ? 
        `👑 <span>${enemyTowers.king}</span>` : 
        `💀 <span style="color: #666;">0</span>`;
    
    document.getElementById('enemyTower2').innerHTML = enemyTowers.right > 0 ? 
        `🏰 <span>${enemyTowers.right}</span>` : 
        `💥 <span style="color: #666;">0</span>`;
    
    // Contar torres para debug
    const towerCount = countRemainingTowers();
    console.log(`🏰 Torres ativas - Player: ${towerCount.player}/3 | Enemy: ${towerCount.enemy}/3`);
}

function gameLoop() {
    if (!isGameActive) return;
    
    updateTroops();
    updateEnemyAI();
    
    // Atualizar barras de vida
    gameObjects.forEach(obj => {
        if (obj.userData.type === 'troop' && obj.userData.healthBar) {
            updateHealthBar(obj);
        }
    });
    
    // Debug: Verificar estado das tropas e torres a cada 5 segundos
    if (Math.floor(Date.now() / 5000) !== Math.floor((Date.now() - 16) / 5000)) {
        debugGameState();
    }
    
    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}

function debugGameState() {
    const troops = gameObjects.filter(obj => obj.userData.type === 'troop');
    const towers = gameObjects.filter(obj => obj.userData.type === 'tower');
    
    console.log(`📊 Estado do jogo - Tropas: ${troops.length} | Torres: ${towers.length} | IA Elixir: ${enemyElixir} | Estratégia: ${enemyStrategy}`);
    
    troops.forEach(troop => {
        const hasTarget = troop.userData.target ? 'SIM' : 'NÃO';
        const targetName = troop.userData.target ? 
            (troop.userData.target.userData.cardId || `torre ${troop.userData.target.userData.owner}`) : 
            'nenhum';
        const level = troop.userData.level || 1;
        console.log(`   🚶 ${troop.userData.cardId} Lv${level} (${troop.userData.owner}) - HP: ${troop.userData.hp}/${troop.userData.maxHp} | Alvo: ${targetName}`);
    });
    
    towers.forEach(tower => {
        if (tower.userData.hp > 0) {
            console.log(`   🏰 Torre ${tower.userData.owner} ${tower.userData.isKing ? 'Rei' : 'Normal'} - HP: ${tower.userData.hp}/${tower.userData.maxHp}`);
        }
    });
}

function updateTroops() {
    const currentTime = Date.now();
    
    gameObjects.forEach(obj => {
        if (obj.userData.type === 'troop' && obj.userData.hp > 0) {
            // Verificar se o alvo ainda é válido
            if (!obj.userData.target || obj.userData.target.userData.hp <= 0) {
                obj.userData.target = findNearestTarget(obj);
            }
            
            if (obj.userData.target) {
                const distance = obj.position.distanceTo(obj.userData.target.position);
                
                if (distance <= obj.userData.range) {
                    // Está no alcance - atacar
                    if (currentTime - obj.userData.lastAttack >= obj.userData.attackSpeed) {
                        console.log(`⚔️ ${obj.userData.cardId} atacando ${obj.userData.target.userData.cardId || 'torre'} (distância: ${distance.toFixed(2)})`);
                        attackTarget(obj, obj.userData.target);
                        obj.userData.lastAttack = currentTime;
                    }
                } else {
                    // Fora do alcance - mover em direção ao alvo
                    moveTroop(obj, obj.userData.target);
                }
            } else {
                // Sem alvo - mover para frente
                moveTroopForward(obj);
            }
        }
    });
    
    // Torres atacam tropas inimigas
    gameObjects.forEach(tower => {
        if (tower.userData.type === 'tower' && tower.userData.hp > 0) {
            const target = findNearestEnemyTroop(tower);
            if (target) {
                const distance = tower.position.distanceTo(target.position);
                if (distance <= tower.userData.range) {
                    if (currentTime - tower.userData.lastAttack >= tower.userData.attackSpeed) {
                        console.log(`🏰 Torre ${tower.userData.owner} atacando ${target.userData.cardId}`);
                        attackTarget(tower, target);
                        tower.userData.lastAttack = currentTime;
                    }
                }
            }
        }
    });
}

function findNearestTarget(troop) {
    let nearestTarget = null;
    let minDistance = Infinity;
    
    const behavior = troop.userData.behavior;
    const owner = troop.userData.owner;
    
    console.log(`🎯 ${troop.userData.cardId} (${owner}) procurando alvo com comportamento: ${behavior}`);
    
    // Filtrar alvos baseado no comportamento
    const potentialTargets = gameObjects.filter(obj => {
        // Não atacar aliados ou objetos mortos
        if (obj.userData.owner === owner || obj.userData.hp <= 0) return false;
        
        // Filtrar por tipo baseado no comportamento
        switch (behavior) {
            case 'building_only':
                return obj.userData.type === 'tower';
            case 'troops_first':
                return obj.userData.type === 'troop' || obj.userData.type === 'tower';
            case 'balanced':
            default:
                return obj.userData.type === 'troop' || obj.userData.type === 'tower';
        }
    });
    
    console.log(`🔍 Alvos potenciais encontrados: ${potentialTargets.length}`);
    
    // Para tropas que preferem outras tropas, priorizar tropas sobre torres
    if (behavior === 'troops_first') {
        const troops = potentialTargets.filter(obj => obj.userData.type === 'troop');
        if (troops.length > 0) {
            console.log(`👥 Priorizando ${troops.length} tropas inimigas`);
            troops.forEach(obj => {
                const distance = troop.position.distanceTo(obj.position);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestTarget = obj;
                }
            });
            
            if (nearestTarget) {
                console.log(`✅ ${troop.userData.cardId} escolheu tropa: ${nearestTarget.userData.cardId} (distância: ${minDistance.toFixed(1)})`);
                return nearestTarget;
            }
        }
    }
    
    // Buscar alvo mais próximo (incluindo torres)
    potentialTargets.forEach(obj => {
        const distance = troop.position.distanceTo(obj.position);
        if (distance < minDistance) {
            minDistance = distance;
            nearestTarget = obj;
        }
    });
    
    if (nearestTarget) {
        const targetType = nearestTarget.userData.type === 'tower' ? 
            `torre ${nearestTarget.userData.owner}` : 
            `${nearestTarget.userData.cardId}`;
        console.log(`✅ ${troop.userData.cardId} escolheu alvo: ${targetType} (distância: ${minDistance.toFixed(1)})`);
    } else {
        console.log(`❌ ${troop.userData.cardId} não encontrou alvos válidos`);
    }
    
    return nearestTarget;
}

function findNearestEnemyTroop(tower) {
    let nearestTarget = null;
    let minDistance = Infinity;
    
    gameObjects.forEach(obj => {
        if (obj.userData.type === 'troop' && obj.userData.owner !== tower.userData.owner && obj.userData.hp > 0) {
            const distance = tower.position.distanceTo(obj.position);
            if (distance < minDistance && distance <= tower.userData.range) {
                minDistance = distance;
                nearestTarget = obj;
            }
        }
    });
    
    return nearestTarget;
}

function attackTarget(attacker, target) {
    const damage = attacker.userData.damage;
    const oldHp = target.userData.hp;
    target.userData.hp -= damage;
    
    const attackerName = attacker.userData.cardId || `torre ${attacker.userData.owner}`;
    const targetName = target.userData.cardId || `torre ${target.userData.owner}`;
    
    console.log(`⚔️ ${attackerName} atacou ${targetName} causando ${damage} de dano (${oldHp} → ${target.userData.hp})`);
    
    // Atualizar barra de vida se for tropa
    if (target.userData.type === 'troop') {
        updateHealthBar(target);
    }
    
    // Atualizar UI das torres se for torre
    if (target.userData.type === 'tower') {
        updateTowerHP();
        console.log(`🏰 Torre ${target.userData.owner} HP: ${target.userData.hp}/${target.userData.maxHp}`);
    }
    
    if (target.userData.hp <= 0) {
        console.log(`💀 ${targetName} foi destruído por ${attackerName}!`);
        
        if (target.userData.type === 'tower') {
            onTowerDestroyed(target);
        }
        removeGameObject(target);
    }
}

function onTowerDestroyed(tower) {
    const towerCount = countRemainingTowers();
    
    console.log(`💥 Torre destruída! ${tower.userData.owner} ${tower.userData.isKing ? 'Rei' : 'Torre'}`);
    console.log(`🏰 Torres restantes - Jogador: ${towerCount.player} | Inimigo: ${towerCount.enemy}`);
    
    if (tower.userData.owner === 'player') {
        if (tower.userData.isKing) {
            console.log('👑 Torre do Rei do jogador destruída - Derrota imediata!');
            endGame('lose');
        } else if (towerCount.player === 0) {
            console.log('🏰 Todas as torres do jogador destruídas - Derrota!');
            endGame('lose');
        }
    } else {
        if (tower.userData.isKing) {
            console.log('👑 Torre do Rei inimigo destruída - Vitória imediata!');
            endGame('win');
        } else if (towerCount.enemy === 0) {
            console.log('🏰 Todas as torres inimigas destruídas - Vitória!');
            endGame('win');
        }
    }
    
    updateGameUI();
}

function moveTroop(troop, target) {
    const direction = new THREE.Vector3();
    direction.subVectors(target.position, troop.position);
    direction.y = 0;
    
    // Verificar se precisa atravessar o rio
    const currentZ = troop.position.z;
    const targetZ = target.position.z;
    const needsCrossRiver = (currentZ > 0.5 && targetZ < -0.5) || (currentZ < -0.5 && targetZ > 0.5);
    
    if (needsCrossRiver && troop.userData.needsBridge && !canCrossRiver(troop)) {
        // Mover em direção à ponte mais próxima
        const bridges = gameObjects.filter(obj => obj.userData.type === 'bridge');
        let nearestBridge = null;
        let minBridgeDistance = Infinity;
        
        bridges.forEach(bridge => {
            const distance = troop.position.distanceTo(bridge.position);
            if (distance < minBridgeDistance) {
                minBridgeDistance = distance;
                nearestBridge = bridge;
            }
        });
        
        if (nearestBridge) {
            direction.subVectors(nearestBridge.position, troop.position);
            direction.y = 0;
            console.log(`🚶 ${troop.userData.cardId} indo para ponte ${nearestBridge.userData.side}`);
        }
    }
    
    direction.normalize();
    const speed = troop.userData.speed * 0.02;
    troop.position.x += direction.x * speed;
    troop.position.z += direction.z * speed;
}

function moveTroopForward(troop) {
    const speed = troop.userData.speed * 0.02;
    const direction = troop.userData.owner === 'player' ? -1 : 1;
    troop.position.z += speed * direction;
}

// IA do inimigo - Sistema inteligente
let enemyElixir = 10;
let enemyLastPlay = 0;
let enemyStrategy = 'defensive';
let enemyDeck = [];

function initializeEnemyAI() {
    // Criar deck do inimigo baseado na arena
    const arena = gameState.currentArena;
    enemyDeck = generateEnemyDeck(arena);
    enemyElixir = 10;
    enemyLastPlay = Date.now();
    enemyStrategy = 'defensive';
    
    console.log(`🤖 IA inicializada - Arena ${arena}: ${enemyDeck.map(id => CARDS[id].name).join(', ')}`);
    
    // Regenerar elixir do inimigo
    setInterval(() => {
        if (enemyElixir < 10 && isGameActive) {
            enemyElixir++;
        }
    }, GAME_CONFIG.ELIXIR_REGEN_RATE);
}

function generateEnemyDeck(arena) {
    // Cartas disponíveis por arena
    const cardsByArena = {
        0: ['knight', 'archer', 'goblin', 'skeleton', 'arrows', 'giant', 'wizard', 'fireball'],
        1: ['knight', 'archer', 'goblin', 'skeleton', 'arrows', 'giant', 'wizard', 'fireball', 'dragon'],
        2: ['knight', 'archer', 'goblin', 'skeleton', 'arrows', 'giant', 'wizard', 'fireball', 'dragon', 'prince'],
        3: ['knight', 'archer', 'goblin', 'skeleton', 'arrows', 'giant', 'wizard', 'fireball', 'dragon', 'prince', 'lightning'],
        4: ['knight', 'archer', 'goblin', 'skeleton', 'arrows', 'giant', 'wizard', 'fireball', 'dragon', 'prince', 'lightning', 'pekka', 'sparky']
    };
    
    const availableCards = cardsByArena[Math.min(arena, 4)];
    
    // Criar deck balanceado
    const deck = [];
    
    // Garantir pelo menos 1 tanque, 2 tropas de suporte, 1 feitiço
    const tanks = availableCards.filter(id => ['giant', 'knight', 'pekka', 'prince'].includes(id));
    const supports = availableCards.filter(id => ['archer', 'wizard', 'goblin', 'skeleton', 'dragon'].includes(id));
    const spells = availableCards.filter(id => ['arrows', 'fireball', 'lightning'].includes(id));
    
    // Adicionar 1-2 tanques
    if (tanks.length > 0) {
        deck.push(tanks[Math.floor(Math.random() * tanks.length)]);
        if (Math.random() < 0.5 && tanks.length > 1) {
            const secondTank = tanks.filter(id => !deck.includes(id));
            if (secondTank.length > 0) {
                deck.push(secondTank[Math.floor(Math.random() * secondTank.length)]);
            }
        }
    }
    
    // Adicionar 2-3 suportes
    while (deck.length < 5 && supports.length > 0) {
        const support = supports[Math.floor(Math.random() * supports.length)];
        if (!deck.includes(support)) {
            deck.push(support);
        }
    }
    
    // Adicionar 1-2 feitiços
    if (spells.length > 0) {
        deck.push(spells[Math.floor(Math.random() * spells.length)]);
        if (Math.random() < 0.6 && spells.length > 1 && deck.length < 7) {
            const secondSpell = spells.filter(id => !deck.includes(id));
            if (secondSpell.length > 0) {
                deck.push(secondSpell[Math.floor(Math.random() * secondSpell.length)]);
            }
        }
    }
    
    // Completar deck com cartas restantes
    while (deck.length < 8) {
        const remaining = availableCards.filter(id => !deck.includes(id));
        if (remaining.length > 0) {
            deck.push(remaining[Math.floor(Math.random() * remaining.length)]);
        } else {
            break;
        }
    }
    
    return deck;
}

function getEnemyCardLevel(cardId, arena) {
    // Nível das cartas baseado na arena
    const card = CARDS[cardId];
    let baseLevel = 1;
    
    switch (card.rarity) {
        case 'common':
            baseLevel = Math.min(1 + arena, 5);
            break;
        case 'rare':
            baseLevel = Math.min(1 + Math.floor(arena / 2), 5);
            break;
        case 'epic':
            baseLevel = Math.min(1 + Math.floor(arena / 3), 4);
            break;
        case 'legendary':
            baseLevel = Math.min(1 + Math.floor(arena / 4), 3);
            break;
    }
    
    return baseLevel;
}

function analyzeGameSituation() {
    const playerTroops = gameObjects.filter(obj => obj.userData.type === 'troop' && obj.userData.owner === 'player');
    const enemyTroops = gameObjects.filter(obj => obj.userData.type === 'troop' && obj.userData.owner === 'enemy');
    const enemyTowers = gameObjects.filter(obj => obj.userData.type === 'tower' && obj.userData.owner === 'enemy');
    
    const playerPressure = playerTroops.length;
    const enemyPressure = enemyTroops.length;
    
    // Verificar torres em perigo
    const towersInDanger = enemyTowers.filter(tower => {
        return playerTroops.some(troop => {
            const distance = troop.position.distanceTo(tower.position);
            return distance < 3;
        });
    });
    
    return {
        playerPressure,
        enemyPressure,
        towersInDanger: towersInDanger.length,
        shouldDefend: towersInDanger.length > 0 || playerPressure > enemyPressure + 1,
        shouldAttack: enemyPressure === 0 && playerPressure === 0,
        shouldCounter: playerPressure > 0 && enemyPressure === 0
    };
}

function updateEnemyAI() {
    const currentTime = Date.now();
    
    // IA joga com menos frequência e mais estrategicamente
    if (currentTime - enemyLastPlay < 3000) return; // Mínimo 3 segundos entre jogadas
    
    const situation = analyzeGameSituation();
    console.log(`🧠 IA analisando situação:`, situation);
    
    // Decidir estratégia
    if (situation.shouldDefend) {
        enemyStrategy = 'defensive';
        playDefensiveCards(situation);
    } else if (situation.shouldAttack) {
        enemyStrategy = 'offensive';
        playOffensiveCards();
    } else if (situation.shouldCounter) {
        enemyStrategy = 'counter';
        playCounterCards();
    }
    
    enemyLastPlay = currentTime;
}

function playDefensiveCards(situation) {
    console.log('🛡️ IA jogando defensivamente');
    
    // Priorizar cartas defensivas baratas
    const defensiveCards = enemyDeck.filter(cardId => {
        const card = CARDS[cardId];
        return card.cost <= enemyElixir && 
               (card.type === 'spell' || 
                ['archer', 'wizard', 'skeleton', 'goblin'].includes(cardId));
    });
    
    if (defensiveCards.length > 0) {
        const cardId = defensiveCards[Math.floor(Math.random() * defensiveCards.length)];
        const card = CARDS[cardId];
        
        if (enemyElixir >= card.cost) {
            // Posicionar defensivamente (perto das torres)
            const x = (Math.random() - 0.5) * 3;
            const z = Math.random() * 2 - 4;
            
            if (card.type === 'spell') {
                // Feitiços em tropas do jogador
                const playerTroops = gameObjects.filter(obj => 
                    obj.userData.type === 'troop' && obj.userData.owner === 'player'
                );
                if (playerTroops.length > 0) {
                    const target = playerTroops[0];
                    castEnemySpell(cardId, target.position.x, target.position.z);
                }
            } else {
                spawnEnemyTroop(cardId, x, z);
            }
            
            enemyElixir -= card.cost;
            console.log(`🛡️ IA jogou ${card.name} defensivamente (Elixir: ${enemyElixir})`);
        }
    }
}

function playOffensiveCards() {
    console.log('⚔️ IA jogando ofensivamente');
    
    // Escolher lado para atacar (esquerda ou direita)
    const attackLeft = Math.random() < 0.5;
    const bridgeX = attackLeft ? -2.5 : 2.5;
    
    // Priorizar tanques seguidos de suporte
    const tanks = enemyDeck.filter(cardId => 
        ['giant', 'knight', 'pekka', 'prince'].includes(cardId) && 
        CARDS[cardId].cost <= enemyElixir
    );
    
    if (tanks.length > 0) {
        const tankId = tanks[Math.floor(Math.random() * tanks.length)];
        const tank = CARDS[tankId];
        
        // Invocar tanque na ponte
        spawnEnemyTroop(tankId, bridgeX + (Math.random() - 0.5), -2);
        enemyElixir -= tank.cost;
        
        console.log(`⚔️ IA jogou ${tank.name} ofensivamente na ${attackLeft ? 'esquerda' : 'direita'} (Elixir: ${enemyElixir})`);
        
        // Aguardar um pouco e adicionar suporte se tiver elixir
        setTimeout(() => {
            const supports = enemyDeck.filter(cardId => 
                ['archer', 'wizard', 'goblin'].includes(cardId) && 
                CARDS[cardId].cost <= enemyElixir
            );
            
            if (supports.length > 0) {
                const supportId = supports[Math.floor(Math.random() * supports.length)];
                const support = CARDS[supportId];
                
                spawnEnemyTroop(supportId, bridgeX + (Math.random() - 0.5), -1.5);
                enemyElixir -= support.cost;
                
                console.log(`🎯 IA adicionou suporte: ${support.name} (Elixir: ${enemyElixir})`);
            }
        }, 2000);
    }
}

function playCounterCards() {
    console.log('🔄 IA fazendo contra-ataque');
    
    // Contra-atacar no lado oposto
    const playerTroops = gameObjects.filter(obj => 
        obj.userData.type === 'troop' && obj.userData.owner === 'player'
    );
    
    let counterSide = 0;
    if (playerTroops.length > 0) {
        const avgX = playerTroops.reduce((sum, troop) => sum + troop.position.x, 0) / playerTroops.length;
        counterSide = avgX > 0 ? -2.5 : 2.5; // Lado oposto
    } else {
        counterSide = Math.random() < 0.5 ? -2.5 : 2.5;
    }
    
    // Usar cartas rápidas para contra-ataque
    const counterCards = enemyDeck.filter(cardId => {
        const card = CARDS[cardId];
        return card.cost <= enemyElixir && 
               ['goblin', 'skeleton', 'prince', 'dragon'].includes(cardId);
    });
    
    if (counterCards.length > 0) {
        const cardId = counterCards[Math.floor(Math.random() * counterCards.length)];
        const card = CARDS[cardId];
        
        spawnEnemyTroop(cardId, counterSide + (Math.random() - 0.5), -2);
        enemyElixir -= card.cost;
        
        console.log(`🔄 IA contra-atacou com ${card.name} (Elixir: ${enemyElixir})`);
    }
}

function spawnEnemyTroop(cardId, x, z) {
    const card = CARDS[cardId];
    
    if (card && card.type === 'troop') {
        const arena = gameState.currentArena;
        const level = getEnemyCardLevel(cardId, arena);
        
        console.log(`🤖 IA invocando ${card.name} nível ${level} em (${x.toFixed(1)}, ${z.toFixed(1)})`);
        
        const geometry = new THREE.ConeGeometry(0.2, 0.5, 4);
        const material = new THREE.MeshLambertMaterial({ color: 0xDC143C });
        const troop = new THREE.Mesh(geometry, material);
        
        troop.position.set(x, 0.25, z);
        
        // IA também usa comportamentos específicos
        const behavior = getTroopBehavior(cardId);
        
        // Estatísticas baseadas no nível
        const hp = Math.floor(card.hp * (1 + (level - 1) * 0.1));
        const damage = Math.floor(card.damage * (1 + (level - 1) * 0.1));
        
        troop.userData = {
            type: 'troop',
            cardId: cardId,
            hp: hp,
            maxHp: hp,
            damage: damage,
            speed: card.speed,
            owner: 'enemy',
            target: null,
            range: ['archer', 'wizard', 'dragon'].includes(cardId) ? 3 : 1,
            attackSpeed: 1500,
            lastAttack: 0,
            healthBar: null,
            behavior: behavior,
            isFlying: ['dragon'].includes(cardId),
            needsBridge: !['dragon'].includes(cardId),
            level: level
        };
        
        scene.add(troop);
        gameObjects.push(troop);
        
        // Criar barra de vida
        createHealthBar(troop);
        
        console.log(`✅ IA criou ${card.name} nível ${level} (HP: ${hp}, Dano: ${damage}) com comportamento: ${behavior}`);
    }
}

function castEnemySpell(cardId, x, z) {
    const card = CARDS[cardId];
    const arena = gameState.currentArena;
    const level = getEnemyCardLevel(cardId, arena);
    
    console.log(`🔥 IA lançando feitiço ${card.name} nível ${level} em (${x.toFixed(1)}, ${z.toFixed(1)})`);
    
    const geometry = new THREE.SphereGeometry(card.radius || 1, 16, 16);
    const material = new THREE.MeshBasicMaterial({ 
        color: 0xFF4500, 
        transparent: true, 
        opacity: 0.7 
    });
    const spellEffect = new THREE.Mesh(geometry, material);
    spellEffect.position.set(x, 0.5, z);
    
    scene.add(spellEffect);
    
    let targetsHit = 0;
    gameObjects.forEach(obj => {
        if (obj.userData.type === 'troop' && obj.userData.owner === 'player') {
            const distance = obj.position.distanceTo(spellEffect.position);
            if (distance <= (card.radius || 1)) {
                const damage = Math.floor(card.damage * (1 + (level - 1) * 0.1));
                obj.userData.hp -= damage;
                targetsHit++;
                console.log(`💥 Feitiço inimigo ${card.name} causou ${damage} de dano em ${obj.userData.cardId} (HP: ${obj.userData.hp}/${obj.userData.maxHp})`);
                
                if (obj.userData.hp <= 0) {
                    console.log(`💀 ${obj.userData.cardId} foi eliminado por feitiço inimigo`);
                    removeGameObject(obj);
                }
            }
        }
    });
    
    console.log(`✨ Feitiço inimigo ${card.name} atingiu ${targetsHit} alvos`);
    setTimeout(() => scene.remove(spellEffect), 1000);
}

function createHealthBar(unit) {
    if (unit.userData.type !== 'troop') return;
    
    // Barras de vida maiores e mais visíveis
    const barWidth = 1.0;  // Aumentado de 0.6 para 1.0
    const barHeight = 0.12; // Aumentado de 0.08 para 0.12
    
    // Criar grupo para a barra de vida
    const healthBarGroup = new THREE.Group();
    
    // Fundo da barra (vermelho escuro)
    const bgGeometry = new THREE.PlaneGeometry(barWidth, barHeight);
    const bgMaterial = new THREE.MeshBasicMaterial({ color: 0x8B0000 });
    const bgBar = new THREE.Mesh(bgGeometry, bgMaterial);
    
    // Barra de vida (verde)
    const healthGeometry = new THREE.PlaneGeometry(barWidth, barHeight);
    const healthMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00 });
    const healthBar = new THREE.Mesh(healthGeometry, healthMaterial);
    
    // Borda da barra (mais espessa)
    const borderGeometry = new THREE.PlaneGeometry(barWidth + 0.04, barHeight + 0.04);
    const borderMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const border = new THREE.Mesh(borderGeometry, borderMaterial);
    
    healthBarGroup.add(border);
    healthBarGroup.add(bgBar);
    healthBarGroup.add(healthBar);
    
    // Posicionar acima da unidade (mais alto)
    healthBarGroup.position.copy(unit.position);
    healthBarGroup.position.y += 1.0; // Aumentado de 0.8 para 1.0
    
    scene.add(healthBarGroup);
    unit.userData.healthBar = healthBarGroup;
    unit.userData.healthBarFill = healthBar;
    
    updateHealthBar(unit);
    
    console.log(`❤️ Barra de vida criada para ${unit.userData.cardId}`);
}

function updateHealthBar(unit) {
    if (!unit.userData.healthBar || !unit.userData.healthBarFill) return;
    
    const healthPercent = Math.max(0, unit.userData.hp / unit.userData.maxHp);
    const barWidth = 1.0; // Atualizado para nova largura
    
    // Atualizar largura da barra sem piscar
    unit.userData.healthBarFill.scale.x = healthPercent;
    unit.userData.healthBarFill.position.x = -(barWidth * (1 - healthPercent)) / 2;
    
    // Mudar cor baseada na vida
    if (healthPercent > 0.6) {
        unit.userData.healthBarFill.material.color.setHex(0x00FF00); // Verde
    } else if (healthPercent > 0.3) {
        unit.userData.healthBarFill.material.color.setHex(0xFFFF00); // Amarelo
    } else {
        unit.userData.healthBarFill.material.color.setHex(0xFF0000); // Vermelho
    }
    
    // Posicionar barra acima da unidade de forma suave
    const targetPosition = unit.position.clone();
    targetPosition.y += 1.0;
    
    // Interpolação suave para evitar piscar
    unit.userData.healthBar.position.lerp(targetPosition, 0.8);
    
    // Fazer a barra sempre olhar para a câmera
    unit.userData.healthBar.lookAt(camera.position);
}

function removeGameObject(obj) {
    const index = gameObjects.indexOf(obj);
    if (index > -1) {
        gameObjects.splice(index, 1);
        scene.remove(obj);
        
        // Remover barra de vida se existir
        if (obj.userData.healthBar) {
            scene.remove(obj.userData.healthBar);
        }
    }
}

function endGame(result) {
    console.log(`🏁 === FIM DE JOGO: ${result.toUpperCase()} ===`);
    
    isGameActive = false;
    clearInterval(elixirTimer);
    clearInterval(gameTimer);
    
    // Contar torres finais
    const finalTowerCount = countRemainingTowers();
    console.log(`🏰 Torres finais - Jogador: ${finalTowerCount.player}/3 | Inimigo: ${finalTowerCount.enemy}/3`);
    
    let trophyChange = 0;
    let goldEarned = 0;
    let resultTitle = '';
    let chestReward = null;
    
    switch (result) {
        case 'win':
            resultTitle = 'VITÓRIA!';
            trophyChange = 30;
            goldEarned = 50;
            gameState.wins++;
            
            const chestChance = Math.random();
            if (chestChance < 0.4) chestReward = 'common';
            else if (chestChance < 0.55) chestReward = 'rare';
            else if (chestChance < 0.60) chestReward = 'epic';
            
            console.log('🎉 Vitória conquistada!');
            break;
        case 'lose':
            resultTitle = 'DERROTA!';
            trophyChange = -20;
            goldEarned = 10;
            gameState.losses++;
            console.log('😞 Derrota sofrida...');
            break;
        case 'draw':
            resultTitle = 'EMPATE!';
            trophyChange = 5;
            goldEarned = 20;
            console.log('🤝 Empate alcançado (muito raro!)');
            break;
    }
    
    const oldTrophies = gameState.trophies;
    const oldArena = gameState.currentArena;
    
    gameState.trophies = Math.max(0, gameState.trophies + trophyChange);
    gameState.gold += goldEarned;
    
    if (chestReward) {
        gameState.ownedChests.push(chestReward);
        console.log(`🎁 Baú recompensa: ${CHEST_CONFIG[chestReward].name}`);
    }
    
    gameState.currentArena = gameState.calculateArena();
    
    // Log das mudanças
    console.log(`🏆 Troféus: ${oldTrophies} → ${gameState.trophies} (${trophyChange > 0 ? '+' : ''}${trophyChange})`);
    console.log(`💰 Ouro ganho: +${goldEarned}`);
    console.log(`📊 Estatísticas: ${gameState.wins}V/${gameState.losses}D`);
    
    if (gameState.currentArena !== oldArena) {
        if (gameState.currentArena > oldArena) {
            console.log(`🎊 SUBIU DE ARENA! ${GAME_CONFIG.ARENA_NAMES[oldArena]} → ${GAME_CONFIG.ARENA_NAMES[gameState.currentArena]}`);
        } else {
            console.log(`📉 Desceu de arena: ${GAME_CONFIG.ARENA_NAMES[oldArena]} → ${GAME_CONFIG.ARENA_NAMES[gameState.currentArena]}`);
        }
    }
    
    gameState.save();
    
    // Mostrar resultado com informação das torres
    let resultText = resultTitle;
    if (result !== 'draw') {
        resultText += `\nTorres: ${finalTowerCount.player} x ${finalTowerCount.enemy}`;
    }
    
    document.getElementById('resultTitle').textContent = resultTitle;
    document.getElementById('trophyChange').textContent = `${trophyChange > 0 ? '+' : ''}${trophyChange} 🏆`;
    
    let goldText = `+${goldEarned} 💰`;
    if (chestReward) {
        goldText += ` + ${CHEST_CONFIG[chestReward].icon}`;
    }
    document.getElementById('goldEarned').textContent = goldText;
    
    setTimeout(() => {
        document.getElementById('gameScreen').classList.remove('active');
        document.getElementById('resultScreen').classList.add('active');
    }, 2000);
    
    console.log('📋 Resultado salvo e tela de resultado exibida');
}

function startGameLoop() {
    gameLoop();
}