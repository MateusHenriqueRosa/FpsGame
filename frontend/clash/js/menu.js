// Menu Principal
function initMenu() {
    console.log('🎮 Inicializando Menu...');
    
    // Event listeners dos botões
    document.getElementById('playButton').addEventListener('click', () => {
        showScreen('gameScreen');
        if (window.initGameScreen) initGameScreen();
    });
    
    document.getElementById('cardsButton').addEventListener('click', () => {
        showScreen('cardsScreen');
        if (window.initCardsScreen) initCardsScreen();
    });
    
    document.getElementById('chestsButton').addEventListener('click', () => {
        showScreen('chestsScreen');
        if (window.initChestsScreen) initChestsScreen();
    });
    
    document.getElementById('resetButton').addEventListener('click', () => {
        resetGameProgress();
    });
    
    updateMenuUI();
    console.log('🎮 Menu inicializado!');
}

function showScreen(screenId) {
    console.log(`📱 Mostrando tela: ${screenId}`);
    
    // Esconder todas as telas
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Mostrar tela solicitada
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    } else {
        console.error(`❌ Tela ${screenId} não encontrada!`);
    }
}

function updateMenuUI() {
    const trophyCount = document.getElementById('trophyCount');
    const arenaName = document.getElementById('arenaName');
    const goldCountMenu = document.getElementById('goldCountMenu');
    const winsCount = document.getElementById('winsCount');
    const lossesCount = document.getElementById('lossesCount');
    const cardCount = document.getElementById('cardCount');
    
    if (trophyCount) trophyCount.textContent = gameState.trophies;
    if (arenaName) arenaName.textContent = GAME_CONFIG.ARENA_NAMES[gameState.currentArena];
    if (goldCountMenu) goldCountMenu.textContent = gameState.gold;
    if (winsCount) winsCount.textContent = gameState.wins;
    if (lossesCount) lossesCount.textContent = gameState.losses;
    if (cardCount) cardCount.textContent = Object.keys(CARDS).length;
}

function resetGameProgress() {
    const confirmReset = confirm(
        '⚠️ ATENÇÃO!\n\n' +
        'Isso irá apagar TODOS os seus dados:\n' +
        '• Troféus e arena\n' +
        '• Ouro acumulado\n' +
        '• Níveis das cartas\n' +
        '• Cartas coletadas\n' +
        '• Baús guardados\n' +
        '• Histórico de vitórias/derrotas\n\n' +
        'Tem certeza que deseja continuar?'
    );
    
    if (confirmReset) {
        const doubleConfirm = confirm(
            '🚨 ÚLTIMA CHANCE!\n\n' +
            'Esta ação NÃO PODE ser desfeita!\n' +
            'Todos os seus dados serão perdidos permanentemente.\n\n' +
            'Confirma o reset completo?'
        );
        
        if (doubleConfirm) {
            console.log('🗑️ Resetando progresso do jogo...');
            
            // Limpar localStorage
            localStorage.removeItem('trophies');
            localStorage.removeItem('gold');
            localStorage.removeItem('wins');
            localStorage.removeItem('losses');
            localStorage.removeItem('cardLevels');
            localStorage.removeItem('cardCounts');
            localStorage.removeItem('ownedChests');
            
            console.log('🗑️ Dados removidos do localStorage');
            
            // Recriar gameState
            gameState = new GameState();
            
            // Atualizar UI
            updateMenuUI();
            
            console.log('✅ Progresso resetado com sucesso!');
            
            alert('✅ Progresso resetado!\n\nTodos os dados foram apagados e o jogo foi reiniciado.');
        }
    }
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initMenu);