let scene, camera, renderer, controls;
let mapObjects = [];
let selectedObject = null;
let selectedColor = 0x8b7355;
let raycaster, mouse;
let enemySpawns = [];
let addingEnemySpawn = false;
let editorMode = 'survival';
let placingObjective = null;
let placingTeamSpawn = null;
let placingX1Spawn = null; // Para colocar spawns de X1
let mapConfig = {
    totalRounds: 10,
    enemiesPerRound: 5,
    enemyIncrement: 2,
    difficulty: 'normal',
    musicData: null,
    musicName: null
};
// Configuração X1
const x1Data = {
    spawns: {
        player1: null, // Host
        player2: null  // Cliente
    },
    config: {
        health: 120,
        respawnTime: 5,
        arenaSize: 'medium',
        weapons: {
            pistol: true,
            smg: true,
            rifle: true,
            sniper: true,
            shotgun: true,
            bazooka: false
        }
    }
};
function createDefaultBattleConfig() {
    return {
        planePath: {
            start: { x: -180, y: 90, z: 140 },
            end: { x: 180, y: 65, z: -140 },
            speed: 45
        },
        safeZone: {
            initialRadius: 120,
            shrinkRatio: 0.75,
            shrinkInterval: 90,
            delayBeforeStorm: 45,
            damagePerSecond: 5
        },
        loot: {
            weaponDensity: 1.0,
            healDensity: 1.0,
            ammoDensity: 1.2,
            supplyDrops: 2
        },
        populations: {
            maxPlayers: 12,
            aiOpponents: 9
        }
    };
}
let battleConfig = createDefaultBattleConfig();
let battleLootZones = [];
let battleDropSpawns = [];
let placingBattleMarker = null;
let battleEditorActivated = false;
const tacticalData = {
    bombSites: {
        A: null,
        B: null
    },
    teamSpawns: {
        allies: [],
        enemies: []
    },
    roundConfig: {
        roundsToWin: 9,
        roundTime: 110,
        buyTime: 12,
        overtimeRounds: 3
    }
};
let currentEditorTab = 'objects';
let backgroundMusic = null;
let interactionPlane = null;
const textureLoader = new THREE.TextureLoader();
const TACTICAL_STORAGE_KEY = 'tacticalCustomMaps';
const TACTICAL_SELECTED_KEY = 'tacticalSelectedMap';
const TACTICAL_REQUIRED_SPAWNS = 5;
let toastTimeout = null;
// Simple heuristic so decorative/ground objects remain non-blocking in-game
const NON_BLOCKING_OBJECT_TYPES = new Set(['ground', 'floor']);

function determineObjectBlocking(type) {
    const normalized = typeof type === 'string' ? type.trim().toLowerCase() : '';
    if (!normalized) return true;
    if (NON_BLOCKING_OBJECT_TYPES.has(normalized)) return false;
    return true;
}

function getViewportDimensions() {
    const viewportStage = document.getElementById('viewportStage');
    if (viewportStage) {
        const styles = window.getComputedStyle(viewportStage);
        const paddingX = parseFloat(styles.paddingLeft || 0) + parseFloat(styles.paddingRight || 0);
        const paddingY = parseFloat(styles.paddingTop || 0) + parseFloat(styles.paddingBottom || 0);
        return {
            width: Math.max(320, viewportStage.clientWidth - paddingX),
            height: Math.max(320, viewportStage.clientHeight - paddingY)
        };
    }

    const sidebar = document.getElementById('sidebar');
    const sidebarWidth = sidebar ? sidebar.offsetWidth : 350;
    return {
        width: Math.max(320, window.innerWidth - sidebarWidth),
        height: window.innerHeight
    };
}

/**
 * Converte um arquivo de imagem em DataURL
 * @param {File} file - Arquivo de imagem
 * @returns {Promise<string>}
 */
function imageToDataURL(file) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            reject(new Error('Arquivo inválido'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

function applyTextureToMesh(mesh, textureDataURL) {
    if (!mesh || !textureDataURL) return;
    textureLoader.load(textureDataURL, texture => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        mesh.material.map = texture;
        mesh.material.color.setHex(0xffffff);
        mesh.material.needsUpdate = true;
    }, undefined, err => console.error('Erro ao carregar textura personalizada:', err));
}

function resetMeshMaterial(mesh, colorHex) {
    if (!mesh) return;
    mesh.material.map = null;
    if (typeof colorHex === 'number') {
        mesh.material.color.setHex(colorHex);
    } else if (typeof colorHex === 'string') {
        mesh.material.color.set(colorHex);
    }
    mesh.material.needsUpdate = true;
}

function disposeMesh(mesh) {
    if (!mesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => {
                if (mat.map) mat.map.dispose();
                mat.dispose();
            });
        } else {
            if (mesh.material.map) mesh.material.map.dispose();
            mesh.material.dispose();
        }
    }
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 10, 150);

    const { width: viewportWidth, height: viewportHeight } = getViewportDimensions();
    camera = new THREE.PerspectiveCamera(75, viewportWidth / viewportHeight, 0.1, 1000);
    camera.position.set(30, 30, 30);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(viewportWidth, viewportHeight);
    renderer.shadowMap.enabled = true;
    const viewportTarget = document.getElementById('viewportStage') || document.getElementById('viewport');
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    viewportTarget.appendChild(renderer.domElement);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Iluminação
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(150, 30, 0x000000, 0x444444);
    scene.add(gridHelper);

    // Eixos helper
    const axesHelper = new THREE.AxesHelper(20);
    scene.add(axesHelper);

    const planeGeom = new THREE.PlaneGeometry(2000, 2000);
    const planeMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: true, side: THREE.DoubleSide });
    interactionPlane = new THREE.Mesh(planeGeom, planeMat);
    interactionPlane.rotation.x = -Math.PI / 2;
    interactionPlane.position.y = 0;
    interactionPlane.receiveShadow = false;
    scene.add(interactionPlane);

    setupControls();
    animate();
}

function setEditorMode(mode) {
    const normalized = mode === 'tactical'
        ? 'tactical'
        : mode === 'x1'
            ? 'x1'
            : ((mode === 'battle' || mode === 'battleRoyale') ? 'battleRoyale' : 'survival');
    editorMode = normalized;

    const modeButtons = {
        survival: document.getElementById('modeSurvival'),
        x1: document.getElementById('modeX1'),
        tactical: document.getElementById('modeTactical'),
        battleRoyale: document.getElementById('modeBattle')
    };
    Object.entries(modeButtons).forEach(([key, btn]) => {
        if (btn) btn.classList.toggle('active', key === normalized);
    });

    const survivalTools = document.getElementById('survivalEnemyTools');
    const x1Tools = document.getElementById('x1Tools');
    const tacticalTools = document.getElementById('tacticalTools');
    const battleTools = document.getElementById('battleTools');
    if (survivalTools) survivalTools.style.display = normalized === 'survival' ? 'block' : 'none';
    if (x1Tools) x1Tools.style.display = normalized === 'x1' ? 'block' : 'none';
    if (tacticalTools) tacticalTools.style.display = normalized === 'tactical' ? 'block' : 'none';
    if (battleTools) battleTools.style.display = normalized === 'battleRoyale' ? 'block' : 'none';

    const survivalConfig = document.getElementById('roundConfig');
    const x1Config = document.getElementById('x1Config');
    const tacConfig = document.getElementById('tacticalRoundConfig');
    const battleConfig = document.getElementById('battleConfigSection');
    if (survivalConfig) survivalConfig.style.display = normalized === 'survival' ? 'block' : 'none';
    if (x1Config) x1Config.style.display = normalized === 'x1' ? 'block' : 'none';
    if (tacConfig) tacConfig.style.display = normalized === 'tactical' ? 'block' : 'none';
    if (battleConfig) battleConfig.style.display = normalized === 'battleRoyale' ? 'block' : 'none';

    const saveBtn = document.getElementById('saveToLauncher');
    if (saveBtn) saveBtn.style.display = normalized === 'tactical' ? 'block' : 'none';

    if (normalized === 'battleRoyale') {
        battleEditorActivated = true;
    }

    cancelPlacementModes();
}

function switchEditorTab(tab) {
    currentEditorTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.editor-tab').forEach(t => t.style.display = 'none');

    if (tab === 'objects') {
        document.querySelectorAll('.tab')[0].classList.add('active');
        document.getElementById('tabObjects').style.display = 'block';
    } else if (tab === 'enemies') {
        document.querySelectorAll('.tab')[1].classList.add('active');
        document.getElementById('tabEnemies').style.display = 'block';
    } else if (tab === 'config') {
        document.querySelectorAll('.tab')[2].classList.add('active');
        document.getElementById('tabConfig').style.display = 'block';
    }
}

function cancelPlacementModes() {
    placingObjective = null;
    placingTeamSpawn = null;
    addingEnemySpawn = false;
    placingBattleMarker = null;
    placingX1Spawn = null;
}

// ==================== FUNÇÕES X1 ====================
function startX1SpawnPlacement(playerNum) {
    if (editorMode !== 'x1') {
        alert('Troque para o modo Duelo X1 para posicionar spawns.');
        return;
    }
    cancelPlacementModes();
    placingX1Spawn = playerNum;
    showMessage(`Clique no mapa para posicionar o spawn do Jogador ${playerNum}. Pressione ESC para cancelar.`, 3000);
}

function placeX1Spawn(position, playerNum) {
    const spawnKey = playerNum === 1 ? 'player1' : 'player2';

    // Remover marcador antigo se existir
    if (x1Data.spawns[spawnKey]?.marker) {
        scene.remove(x1Data.spawns[spawnKey].marker);
        disposeMesh(x1Data.spawns[spawnKey].marker);
    }

    // Criar marcador visual
    const color = playerNum === 1 ? 0x00ff00 : 0x00c6ff;
    const marker = new THREE.Group();

    // Base do marcador
    const baseMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.3, 32), baseMat);
    base.position.y = 0.15;
    marker.add(base);

    // Indicador de direção
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 8), baseMat);
    arrow.position.set(0, 2, 0);
    marker.add(arrow);

    // Label
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = playerNum === 1 ? '#00ff00' : '#00c6ff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`P${playerNum}`, 64, 40);
    const texture = new THREE.CanvasTexture(canvas);
    const labelMat = new THREE.SpriteMaterial({ map: texture });
    const label = new THREE.Sprite(labelMat);
    label.position.set(0, 3.5, 0);
    label.scale.set(2, 1, 1);
    marker.add(label);

    marker.position.copy(position);
    scene.add(marker);

    x1Data.spawns[spawnKey] = {
        position: { x: position.x, y: position.y, z: position.z },
        marker
    };

    updateX1SpawnInfo();
    showMessage(`✅ Spawn do Jogador ${playerNum} definido!`, 2000);
}

function removeX1Spawn(playerNum) {
    const spawnKey = playerNum === 1 ? 'player1' : 'player2';
    if (x1Data.spawns[spawnKey]?.marker) {
        scene.remove(x1Data.spawns[spawnKey].marker);
        disposeMesh(x1Data.spawns[spawnKey].marker);
    }
    x1Data.spawns[spawnKey] = null;
    updateX1SpawnInfo();
}

function updateX1SpawnInfo() {
    const info1 = document.getElementById('x1Spawn1Info');
    const info2 = document.getElementById('x1Spawn2Info');

    if (info1) {
        if (x1Data.spawns.player1) {
            const p = x1Data.spawns.player1.position;
            info1.textContent = `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
            info1.style.color = '#00ff00';
        } else {
            info1.textContent = 'Não definido';
            info1.style.color = '#ff6666';
        }
    }

    if (info2) {
        if (x1Data.spawns.player2) {
            const p = x1Data.spawns.player2.position;
            info2.textContent = `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
            info2.style.color = '#00c6ff';
        } else {
            info2.textContent = 'Não definido';
            info2.style.color = '#ff6666';
        }
    }
}

function serializeX1Settings() {
    // Ler configurações do HTML
    const healthInput = document.getElementById('x1Health');
    const respawnInput = document.getElementById('x1RespawnTime');
    const arenaSizeInput = document.getElementById('x1ArenaSize');

    x1Data.config.health = healthInput ? parseInt(healthInput.value) || 120 : 120;
    x1Data.config.respawnTime = respawnInput ? parseInt(respawnInput.value) || 5 : 5;
    x1Data.config.arenaSize = arenaSizeInput ? arenaSizeInput.value : 'medium';

    // Armas
    x1Data.config.weapons = {
        pistol: document.getElementById('x1WeaponPistol')?.checked ?? true,
        smg: document.getElementById('x1WeaponSmg')?.checked ?? true,
        rifle: document.getElementById('x1WeaponRifle')?.checked ?? true,
        sniper: document.getElementById('x1WeaponSniper')?.checked ?? true,
        shotgun: document.getElementById('x1WeaponShotgun')?.checked ?? true,
        bazooka: document.getElementById('x1WeaponBazooka')?.checked ?? false
    };

    return {
        spawns: {
            player1: x1Data.spawns.player1?.position || null,
            player2: x1Data.spawns.player2?.position || null
        },
        config: { ...x1Data.config }
    };
}

function loadX1Settings(data) {
    if (!data) return;

    // Carregar spawns
    if (data.spawns?.player1) {
        const pos = new THREE.Vector3(data.spawns.player1.x, data.spawns.player1.y, data.spawns.player1.z);
        placeX1Spawn(pos, 1);
    }
    if (data.spawns?.player2) {
        const pos = new THREE.Vector3(data.spawns.player2.x, data.spawns.player2.y, data.spawns.player2.z);
        placeX1Spawn(pos, 2);
    }

    // Carregar configuração
    if (data.config) {
        x1Data.config = { ...x1Data.config, ...data.config };

        const healthInput = document.getElementById('x1Health');
        const respawnInput = document.getElementById('x1RespawnTime');
        const arenaSizeInput = document.getElementById('x1ArenaSize');

        if (healthInput) healthInput.value = data.config.health || 120;
        if (respawnInput) respawnInput.value = data.config.respawnTime || 5;
        if (arenaSizeInput) arenaSizeInput.value = data.config.arenaSize || 'medium';

        if (data.config.weapons) {
            Object.entries(data.config.weapons).forEach(([weapon, enabled]) => {
                const checkbox = document.getElementById(`x1Weapon${weapon.charAt(0).toUpperCase() + weapon.slice(1)}`);
                if (checkbox) checkbox.checked = enabled;
            });
        }
    }

    updateX1SpawnInfo();
}

function clearX1Elements() {
    removeX1Spawn(1);
    removeX1Spawn(2);
    placingX1Spawn = null;
}
// ==================== FIM FUNÇÕES X1 ====================

function clearTacticalElements() {
    removeObjectiveMarker('A');
    removeObjectiveMarker('B');
    clearTeamSpawns('allies');
    clearTeamSpawns('enemies');
    placingTeamSpawn = null;
    placingObjective = null;
    addingEnemySpawn = false;
}

function startObjectivePlacement(siteId) {
    if (editorMode !== 'tactical') {
        alert('Troque para o modo Tático 5v5 para posicionar objetivos.');
        return;
    }
    cancelPlacementModes();
    placingObjective = siteId;
    showMessage(`Clique no mapa para posicionar o Site ${siteId}. Pressione ESC para cancelar.`, 3000);
}

function removeObjectiveMarker(siteId) {
    const site = tacticalData.bombSites[siteId];
    if (site?.marker) {
        scene.remove(site.marker);
        disposeMesh(site.marker);
    }
    tacticalData.bombSites[siteId] = null;
    updateObjectiveInfo();
}

function updateObjectiveInfo() {
    const aInfo = document.getElementById('objectiveAInfo');
    const bInfo = document.getElementById('objectiveBInfo');
    if (aInfo) {
        aInfo.textContent = tacticalData.bombSites.A ? `(${tacticalData.bombSites.A.position.x.toFixed(1)}, ${tacticalData.bombSites.A.position.z.toFixed(1)})` : 'Não definido';
    }
    if (bInfo) {
        bInfo.textContent = tacticalData.bombSites.B ? `(${tacticalData.bombSites.B.position.x.toFixed(1)}, ${tacticalData.bombSites.B.position.z.toFixed(1)})` : 'Não definido';
    }
}

function placeObjectiveMarker(siteId, position) {
    if (!position) return;
    removeObjectiveMarker(siteId);
    const markerGeo = new THREE.CylinderGeometry(2.5, 2.5, 0.6, 24);
    const markerMat = new THREE.MeshStandardMaterial({ color: siteId === 'A' ? 0x4fa3ff : 0xff7a7a, opacity: 0.7, transparent: true });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.rotation.x = Math.PI / 2;
    const targetX = Number.isFinite(position.x) ? position.x : 0;
    const targetZ = Number.isFinite(position.z) ? position.z : 0;
    marker.position.set(targetX, 0.4, targetZ);
    marker.receiveShadow = true;
    scene.add(marker);
    tacticalData.bombSites[siteId] = {
        position: { x: marker.position.x, y: marker.position.y, z: marker.position.z },
        marker
    };
    updateObjectiveInfo();
}

function startTeamSpawnPlacement(team) {
    if (editorMode !== 'tactical') {
        alert('Troque para o modo Tático 5v5 para adicionar spawns.');
        return;
    }
    cancelPlacementModes();
    placingTeamSpawn = team === 'enemies' ? 'enemies' : 'allies';
    showMessage(`Clique no mapa para adicionar spawn ${placingTeamSpawn === 'allies' ? 'aliado' : 'inimigo'}. Continue clicando para adicionar vários pontos ou pressione ESC para sair.`, 3200);
}

function placeTeamSpawn(team, position, options = {}) {
    if (!position) return;
    const color = team === 'allies' ? 0x00ffd5 : 0xff6b6b;
    const markerGeo = new THREE.SphereGeometry(0.6, 12, 12);
    const markerMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    const spawnX = Number.isFinite(position.x) ? position.x : 0;
    const spawnZ = Number.isFinite(position.z) ? position.z : 0;
    marker.position.set(spawnX, 0.8, spawnZ);
    marker.castShadow = true;
    scene.add(marker);
    tacticalData.teamSpawns[team].push({
        position: { x: marker.position.x, y: marker.position.y, z: marker.position.z },
        marker
    });
    updateTeamSpawnList(team);
    if (!options.silent) {
        showMessage(`Spawn ${team === 'allies' ? 'aliado' : 'inimigo'} adicionado.`, 2000);
    }
}

function clearTeamSpawns(team) {
    tacticalData.teamSpawns[team].forEach(entry => {
        scene.remove(entry.marker);
        disposeMesh(entry.marker);
    });
    tacticalData.teamSpawns[team] = [];
    updateTeamSpawnList(team);
}

function updateTeamSpawnList(team) {
    const listId = team === 'allies' ? 'allySpawnList' : 'enemyTeamSpawnList';
    const container = document.getElementById(listId);
    if (!container) return;
    container.innerHTML = '';
    tacticalData.teamSpawns[team].forEach((entry, index) => {
        const div = document.createElement('div');
        div.className = 'object-item';
        div.textContent = `#${index + 1} (${entry.position.x.toFixed(1)}, ${entry.position.z.toFixed(1)})`;
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '🗑️';
        removeBtn.className = 'danger';
        removeBtn.onclick = () => {
            scene.remove(entry.marker);
            disposeMesh(entry.marker);
            tacticalData.teamSpawns[team].splice(index, 1);
            updateTeamSpawnList(team);
        };
        div.appendChild(removeBtn);
        container.appendChild(div);
    });
}

function updateBattleLootList() {
    const list = document.getElementById('battleLootList');
    if (!list) return;
    list.innerHTML = '';
    if (!battleLootZones.length) {
        list.innerHTML = '<p style="font-size:12px;color:#777;">Nenhuma zona cadastrada.</p>';
        return;
    }
    battleLootZones.forEach((zone, index) => {
        const item = document.createElement('div');
        item.className = 'object-item';
        item.innerHTML = `#${index + 1} • Raio ${zone.radius}m<br><small>(${zone.position.x.toFixed(1)}, ${zone.position.z.toFixed(1)})</small>`;
        const btn = document.createElement('button');
        btn.textContent = '🗑️';
        btn.className = 'danger';
        btn.onclick = () => {
            scene.remove(zone.marker);
            disposeMesh(zone.marker);
            battleLootZones.splice(index, 1);
            updateBattleLootList();
        };
        item.appendChild(btn);
        list.appendChild(item);
    });
}

function updateBattleDropList() {
    const list = document.getElementById('battleDropList');
    if (!list) return;
    list.innerHTML = '';
    if (!battleDropSpawns.length) {
        list.innerHTML = '<p style="font-size:12px;color:#777;">Nenhum ponto configurado.</p>';
        return;
    }
    battleDropSpawns.forEach((drop, index) => {
        const item = document.createElement('div');
        item.className = 'object-item';
        item.innerHTML = `#${index + 1} • Alt ${drop.altitude}m<br><small>(${drop.position.x.toFixed(1)}, ${drop.position.z.toFixed(1)})</small>`;
        const btn = document.createElement('button');
        btn.textContent = '🗑️';
        btn.className = 'danger';
        btn.onclick = () => {
            scene.remove(drop.marker);
            disposeMesh(drop.marker);
            if (drop.beam) {
                scene.remove(drop.beam);
                disposeMesh(drop.beam);
            }
            battleDropSpawns.splice(index, 1);
            updateBattleDropList();
        };
        item.appendChild(btn);
        list.appendChild(item);
    });
}

function syncTacticalRoundConfigFromInputs() {
    const roundsToWin = parseInt(document.getElementById('tacticalRoundsToWin').value, 10);
    const roundTime = parseInt(document.getElementById('tacticalRoundTime').value, 10);
    const buyTime = parseInt(document.getElementById('tacticalBuyTime').value, 10);
    const overtimeRounds = parseInt(document.getElementById('tacticalOTRounds').value, 10);

    tacticalData.roundConfig.roundsToWin = Number.isFinite(roundsToWin) ? roundsToWin : tacticalData.roundConfig.roundsToWin;
    tacticalData.roundConfig.roundTime = Number.isFinite(roundTime) ? roundTime : tacticalData.roundConfig.roundTime;
    tacticalData.roundConfig.buyTime = Number.isFinite(buyTime) ? buyTime : tacticalData.roundConfig.buyTime;
    tacticalData.roundConfig.overtimeRounds = Number.isFinite(overtimeRounds) ? overtimeRounds : tacticalData.roundConfig.overtimeRounds;
}

function applyTacticalRoundConfigToInputs(config) {
    if (!config) return;
    document.getElementById('tacticalRoundsToWin').value = config.roundsToWin ?? tacticalData.roundConfig.roundsToWin;
    document.getElementById('tacticalRoundTime').value = config.roundTime ?? tacticalData.roundConfig.roundTime;
    document.getElementById('tacticalBuyTime').value = config.buyTime ?? tacticalData.roundConfig.buyTime;
    document.getElementById('tacticalOTRounds').value = config.overtimeRounds ?? tacticalData.roundConfig.overtimeRounds;
    syncTacticalRoundConfigFromInputs();
}

function formatColorHex(color) {
    if (typeof color === 'number') {
        return '0x' + color.toString(16).padStart(6, '0');
    }
    if (typeof color === 'string' && color.trim().length > 0) {
        const trimmed = color.trim();
        if (trimmed.startsWith('0x')) return trimmed;
        if (trimmed.startsWith('#')) return '0x' + trimmed.substring(1);
        return '0x' + trimmed;
    }
    return '0xffffff';
}

function clonePosition(position, defaultY = 0) {
    return {
        x: Number.isFinite(position?.x) ? position.x : 0,
        y: Number.isFinite(position?.y) ? position.y : defaultY,
        z: Number.isFinite(position?.z) ? position.z : 0
    };
}

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el !== null && el !== undefined) {
        el.value = value;
    }
}

function readNumberInput(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const value = parseFloat(el.value);
    return Number.isFinite(value) ? value : fallback;
}

function syncSurvivalConfigFromInputs() {
    const totalRounds = parseInt(document.getElementById('totalRounds').value, 10);
    const enemiesPerRound = parseInt(document.getElementById('enemiesPerRound').value, 10);
    const enemyIncrement = parseInt(document.getElementById('enemyIncrement').value, 10);
    const difficulty = document.getElementById('difficulty').value;

    mapConfig.totalRounds = Number.isFinite(totalRounds) ? totalRounds : mapConfig.totalRounds;
    mapConfig.enemiesPerRound = Number.isFinite(enemiesPerRound) ? enemiesPerRound : mapConfig.enemiesPerRound;
    mapConfig.enemyIncrement = Number.isFinite(enemyIncrement) ? enemyIncrement : mapConfig.enemyIncrement;
    mapConfig.difficulty = difficulty || mapConfig.difficulty;
}

function serializeSurvivalSettings() {
    syncSurvivalConfigFromInputs();
    return {
        config: { ...mapConfig },
        enemySpawns: serializeEnemySpawnPoints()
    };
}

function syncBattleConfigFromInputs() {
    battleConfig.planePath.start.x = readNumberInput('planeStartX', battleConfig.planePath.start.x);
    battleConfig.planePath.start.y = readNumberInput('planeStartY', battleConfig.planePath.start.y);
    battleConfig.planePath.start.z = readNumberInput('planeStartZ', battleConfig.planePath.start.z);
    battleConfig.planePath.end.x = readNumberInput('planeEndX', battleConfig.planePath.end.x);
    battleConfig.planePath.end.y = readNumberInput('planeEndY', battleConfig.planePath.end.y);
    battleConfig.planePath.end.z = readNumberInput('planeEndZ', battleConfig.planePath.end.z);
    battleConfig.planePath.speed = readNumberInput('planeSpeed', battleConfig.planePath.speed);

    battleConfig.safeZone.initialRadius = readNumberInput('stormInitialRadius', battleConfig.safeZone.initialRadius);
    const shrinkPercent = readNumberInput('stormShrinkRatio', battleConfig.safeZone.shrinkRatio * 100);
    battleConfig.safeZone.shrinkRatio = Math.max(0.2, Math.min(0.95, shrinkPercent / 100));
    battleConfig.safeZone.shrinkInterval = readNumberInput('stormInterval', battleConfig.safeZone.shrinkInterval);
    battleConfig.safeZone.delayBeforeStorm = readNumberInput('stormDelay', battleConfig.safeZone.delayBeforeStorm);
    battleConfig.safeZone.damagePerSecond = readNumberInput('stormDamage', battleConfig.safeZone.damagePerSecond);

    const weaponDensityPercent = readNumberInput('lootWeaponDensity', battleConfig.loot.weaponDensity * 100);
    battleConfig.loot.weaponDensity = weaponDensityPercent / 100;
    const healDensityPercent = readNumberInput('lootHealDensity', battleConfig.loot.healDensity * 100);
    battleConfig.loot.healDensity = healDensityPercent / 100;
    const ammoDensityPercent = readNumberInput('lootAmmoDensity', battleConfig.loot.ammoDensity * 100);
    battleConfig.loot.ammoDensity = ammoDensityPercent / 100;
    battleConfig.loot.supplyDrops = readNumberInput('lootSupplyDrops', battleConfig.loot.supplyDrops);

    battleConfig.populations.maxPlayers = readNumberInput('battleMaxPlayers', battleConfig.populations.maxPlayers);
    battleConfig.populations.aiOpponents = readNumberInput('battleAiOpponents', battleConfig.populations.aiOpponents);
}

function applyBattleConfigToInputs(config = battleConfig) {
    if (!config) return;
    setInputValue('planeStartX', config.planePath.start.x);
    setInputValue('planeStartY', config.planePath.start.y);
    setInputValue('planeStartZ', config.planePath.start.z);
    setInputValue('planeEndX', config.planePath.end.x);
    setInputValue('planeEndY', config.planePath.end.y);
    setInputValue('planeEndZ', config.planePath.end.z);
    setInputValue('planeSpeed', config.planePath.speed);

    setInputValue('stormInitialRadius', config.safeZone.initialRadius);
    setInputValue('stormShrinkRatio', Math.round(config.safeZone.shrinkRatio * 100));
    setInputValue('stormInterval', config.safeZone.shrinkInterval);
    setInputValue('stormDelay', config.safeZone.delayBeforeStorm);
    setInputValue('stormDamage', config.safeZone.damagePerSecond);

    setInputValue('lootWeaponDensity', Math.round(config.loot.weaponDensity * 100));
    setInputValue('lootHealDensity', Math.round(config.loot.healDensity * 100));
    setInputValue('lootAmmoDensity', Math.round(config.loot.ammoDensity * 100));
    setInputValue('lootSupplyDrops', config.loot.supplyDrops);
    setInputValue('battleMaxPlayers', config.populations.maxPlayers);
    setInputValue('battleAiOpponents', config.populations.aiOpponents);
}

function normalizeBattleConfig(source) {
    const defaults = createDefaultBattleConfig();
    if (!source) return defaults;
    return {
        planePath: {
            start: {
                x: Number.isFinite(source?.planePath?.start?.x) ? source.planePath.start.x : defaults.planePath.start.x,
                y: Number.isFinite(source?.planePath?.start?.y) ? source.planePath.start.y : defaults.planePath.start.y,
                z: Number.isFinite(source?.planePath?.start?.z) ? source.planePath.start.z : defaults.planePath.start.z
            },
            end: {
                x: Number.isFinite(source?.planePath?.end?.x) ? source.planePath.end.x : defaults.planePath.end.x,
                y: Number.isFinite(source?.planePath?.end?.y) ? source.planePath.end.y : defaults.planePath.end.y,
                z: Number.isFinite(source?.planePath?.end?.z) ? source.planePath.end.z : defaults.planePath.end.z
            },
            speed: Number.isFinite(source?.planePath?.speed ?? source?.planeSpeed)
                ? (source.planePath?.speed ?? source.planeSpeed)
                : defaults.planePath.speed
        },
        safeZone: {
            initialRadius: Number.isFinite(source?.safeZone?.initialRadius) ? source.safeZone.initialRadius : defaults.safeZone.initialRadius,
            shrinkRatio: Number.isFinite(source?.safeZone?.shrinkRatio)
                ? source.safeZone.shrinkRatio
                : (Number.isFinite(source?.safeZone?.shrinkPercent) ? source.safeZone.shrinkPercent / 100 : defaults.safeZone.shrinkRatio),
            shrinkInterval: Number.isFinite(source?.safeZone?.shrinkInterval) ? source.safeZone.shrinkInterval : defaults.safeZone.shrinkInterval,
            delayBeforeStorm: Number.isFinite(source?.safeZone?.delayBeforeStorm) ? source.safeZone.delayBeforeStorm : defaults.safeZone.delayBeforeStorm,
            damagePerSecond: Number.isFinite(source?.safeZone?.damagePerSecond) ? source.safeZone.damagePerSecond : defaults.safeZone.damagePerSecond
        },
        loot: {
            weaponDensity: Number.isFinite(source?.loot?.weaponDensity)
                ? source.loot.weaponDensity
                : (Number.isFinite(source?.loot?.weaponPercent) ? source.loot.weaponPercent / 100 : defaults.loot.weaponDensity),
            healDensity: Number.isFinite(source?.loot?.healDensity)
                ? source.loot.healDensity
                : (Number.isFinite(source?.loot?.healPercent) ? source.loot.healPercent / 100 : defaults.loot.healDensity),
            ammoDensity: Number.isFinite(source?.loot?.ammoDensity)
                ? source.loot.ammoDensity
                : (Number.isFinite(source?.loot?.ammoPercent) ? source.loot.ammoPercent / 100 : defaults.loot.ammoDensity),
            supplyDrops: Number.isFinite(source?.loot?.supplyDrops) ? source.loot.supplyDrops : defaults.loot.supplyDrops
        },
        populations: {
            maxPlayers: Number.isFinite(source?.populations?.maxPlayers) ? source.populations.maxPlayers : defaults.populations.maxPlayers,
            aiOpponents: Number.isFinite(source?.populations?.aiOpponents) ? source.populations.aiOpponents : defaults.populations.aiOpponents
        }
    };
}

function serializeBattleSettings() {
    syncBattleConfigFromInputs();
    const shouldInclude = battleEditorActivated || battleLootZones.length > 0 || battleDropSpawns.length > 0;
    if (!shouldInclude) return null;
    const configClone = JSON.parse(JSON.stringify(battleConfig));
    return {
        config: configClone,
        lootZones: battleLootZones.map(zone => ({
            position: clonePosition(zone.position, 0.2),
            radius: zone.radius
        })),
        dropSpawns: battleDropSpawns.map(drop => ({
            position: clonePosition(drop.position, drop.position?.y ?? 1),
            altitude: drop.altitude
        }))
    };
}

function serializeSceneObjects() {
    return mapObjects.map(obj => ({
        type: obj.type,
        width: obj.width,
        height: obj.height,
        depth: obj.depth,
        color: formatColorHex(obj.color),
        texture: obj.texture,
        blocking: typeof obj.blocking === 'boolean' ? obj.blocking : determineObjectBlocking(obj.type),
        position: {
            x: obj.mesh?.position.x ?? 0,
            y: obj.mesh?.position.y ?? 0,
            z: obj.mesh?.position.z ?? 0
        },
        rotation: {
            x: obj.mesh?.rotation.x ?? 0,
            y: obj.mesh?.rotation.y ?? 0,
            z: obj.mesh?.rotation.z ?? 0
        }
    }));
}

function serializeEnemySpawnPoints() {
    return enemySpawns.map(spawn => ({
        position: clonePosition(spawn.position, 1),
        type: spawn.type,
        round: spawn.round
    }));
}

function serializeTacticalSnapshot(includeEmpty = false) {
    syncTacticalRoundConfigFromInputs();
    const hasBombSites = Boolean(tacticalData.bombSites.A || tacticalData.bombSites.B);
    const hasTeamSpawns = tacticalData.teamSpawns.allies.length > 0 || tacticalData.teamSpawns.enemies.length > 0;

    if (!includeEmpty && !hasBombSites && !hasTeamSpawns) return null;

    return {
        bombSites: {
            A: tacticalData.bombSites.A ? { position: clonePosition(tacticalData.bombSites.A.position, 0.4) } : null,
            B: tacticalData.bombSites.B ? { position: clonePosition(tacticalData.bombSites.B.position, 0.4) } : null
        },
        teamSpawns: {
            allies: tacticalData.teamSpawns.allies.map(entry => ({ position: clonePosition(entry.position, 0.8) })),
            enemies: tacticalData.teamSpawns.enemies.map(entry => ({ position: clonePosition(entry.position, 0.8) }))
        },
        roundConfig: { ...tacticalData.roundConfig }
    };
}

function validateTacticalSnapshot(snapshot) {
    if (!snapshot) {
        return { valid: false, message: 'Nenhum dado tático disponível para salvar.' };
    }
    const errors = [];
    if (!snapshot.bombSites.A || !snapshot.bombSites.B) {
        errors.push('Defina os objetivos A e B.');
    }
    if (snapshot.teamSpawns.allies.length < TACTICAL_REQUIRED_SPAWNS) {
        errors.push(`Adicione pelo menos ${TACTICAL_REQUIRED_SPAWNS} spawns para a Vanguarda (Aliados).`);
    }
    if (snapshot.teamSpawns.enemies.length < TACTICAL_REQUIRED_SPAWNS) {
        errors.push(`Adicione pelo menos ${TACTICAL_REQUIRED_SPAWNS} spawns para a Legion (Inimigos).`);
    }
    return {
        valid: errors.length === 0,
        message: errors.join('\n')
    };
}

function generateMapId() {
    return (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `map_${Date.now()}`;
}

function saveTacticalMap() {
    if (editorMode !== 'tactical') {
        alert('Troque para o modo Tático 5v5 antes de salvar no launcher.');
        return;
    }

    const mapNameInput = document.getElementById('mapName');
    const mapName = (mapNameInput?.value || '').trim();
    if (!mapName) {
        alert('Informe um nome para o mapa.');
        mapNameInput?.focus();
        return;
    }

    const tacticalSnapshot = serializeTacticalSnapshot(true);
    const validation = validateTacticalSnapshot(tacticalSnapshot);
    if (!validation.valid) {
        alert(validation.message);
        return;
    }

    const payload = {
        id: generateMapId(),
        name: mapName,
        version: 'tactical-v1',
        gameMode: 'tactical',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        skyColor: document.getElementById('skyColor').value || '0x87ceeb',
        objects: serializeSceneObjects(),
        tactical: tacticalSnapshot,
        stats: {
            objects: mapObjects.length,
            allySpawns: tacticalSnapshot.teamSpawns.allies.length,
            enemySpawns: tacticalSnapshot.teamSpawns.enemies.length
        }
    };

    try {
        const stored = JSON.parse(localStorage.getItem(TACTICAL_STORAGE_KEY) || '[]');
        const existingIndex = stored.findIndex(entry => entry.name?.toLowerCase() === mapName.toLowerCase());
        if (existingIndex >= 0) {
            payload.id = stored[existingIndex].id || payload.id;
            payload.createdAt = stored[existingIndex].createdAt || payload.createdAt;
            stored[existingIndex] = payload;
        } else {
            stored.push(payload);
        }
        localStorage.setItem(TACTICAL_STORAGE_KEY, JSON.stringify(stored));
        localStorage.setItem(TACTICAL_SELECTED_KEY, payload.id);
        alert(`✅ ${mapName} salvo para partidas Custom 5v5!\n\n- Spawns Aliados: ${payload.stats.allySpawns}\n- Spawns Inimigos: ${payload.stats.enemySpawns}`);
        showMessage('Mapa enviado para o launcher tático!', 2500);
    } catch (error) {
        console.error('Erro ao salvar mapa tático', error);
        alert('❌ Não foi possível salvar o mapa. Verifique o console para mais detalhes.');
    }
}

function loadTacticalMapData(tacticalPayload) {
    clearTacticalElements();
    if (!tacticalPayload) {
        updateObjectiveInfo();
        updateTeamSpawnList('allies');
        updateTeamSpawnList('enemies');
        return;
    }

    setEditorMode('tactical');
    applyTacticalRoundConfigToInputs(tacticalPayload.roundConfig);
    if (tacticalPayload.bombSites?.A) {
        placeObjectiveMarker('A', tacticalPayload.bombSites.A.position);
    }
    if (tacticalPayload.bombSites?.B) {
        placeObjectiveMarker('B', tacticalPayload.bombSites.B.position);
    }
    tacticalPayload.teamSpawns?.allies?.forEach(spawn => placeTeamSpawn('allies', spawn.position, { silent: true }));
    tacticalPayload.teamSpawns?.enemies?.forEach(spawn => placeTeamSpawn('enemies', spawn.position, { silent: true }));
    placingTeamSpawn = null;
    placingObjective = null;
}

function loadSurvivalSettings(payload) {
    const config = payload?.config || {};
    setInputValue('totalRounds', config.totalRounds ?? 10);
    setInputValue('enemiesPerRound', config.enemiesPerRound ?? 5);
    setInputValue('enemyIncrement', config.enemyIncrement ?? 2);
    setInputValue('difficulty', config.difficulty ?? 'normal');

    mapConfig.musicData = config.musicData || null;
    mapConfig.musicName = config.musicName || null;
    const musicInfo = document.getElementById('musicInfo');
    if (musicInfo) {
        musicInfo.textContent = mapConfig.musicName ? `🎵 ${mapConfig.musicName}` : '';
    }
    const audio = document.getElementById('backgroundMusic');
    if (audio) {
        audio.src = mapConfig.musicData || '';
        const volumeSlider = document.getElementById('volumeSlider');
        audio.volume = volumeSlider ? (volumeSlider.value / 100) : 0.5;
    }

    syncSurvivalConfigFromInputs();

    clearEnemySpawns(true);
    if (Array.isArray(payload?.enemySpawns)) {
        payload.enemySpawns.forEach(spawnData => {
            const spawn = {
                position: clonePosition(spawnData.position, 1),
                type: spawnData.type || 'melee',
                round: spawnData.round ?? 1
            };
            const markerGeometry = new THREE.SphereGeometry(0.5, 16, 16);
            const markerMaterial = new THREE.MeshStandardMaterial({
                color: spawn.type === 'ranged' ? 0xff6600 : 0xff0000,
                emissive: spawn.type === 'ranged' ? 0xff6600 : 0xff0000,
                emissiveIntensity: 0.5
            });
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.set(spawn.position.x, spawn.position.y, spawn.position.z);
            scene.add(marker);
            spawn.marker = marker;
            enemySpawns.push(spawn);
        });
    }
    updateEnemySpawnsList();
}

function loadBattleSettings(payload) {
    clearBattleLootZones(true);
    clearBattleDropSpawns(true);
    battleConfig = normalizeBattleConfig(payload?.config || payload);
    battleEditorActivated = Boolean(payload);
    applyBattleConfigToInputs(battleConfig);

    const lootSource = payload?.lootZones || payload?.config?.lootZones || [];
    lootSource.forEach(zone => createLootZoneMarker(zone));
    const dropSource = payload?.dropSpawns || payload?.config?.dropSpawns || [];
    dropSource.forEach(drop => createDropSpawnMarker(drop));
    updateBattleLootList();
    updateBattleDropList();
}

function addPresetObject(type) {
    const presets = {
        house: [
            { w: 14, h: 0.4, d: 14, x: 0, y: 0.2, z: 0, c: 0x8b7355, type: 'ground' }, // piso
            { w: 4.5, h: 6, d: 0.5, x: -4.75, y: 3, z: -7, c: 0xd2b48c, type: 'wall' },
            { w: 4.5, h: 6, d: 0.5, x: 4.75, y: 3, z: -7, c: 0xd2b48c, type: 'wall' },
            { w: 3, h: 2, d: 0.5, x: 0, y: 6, z: -7, c: 0xc49a6c, type: 'wall' }, // vergas da porta
            { w: 14, h: 6, d: 0.5, x: 0, y: 3, z: 7, c: 0xd2b48c, type: 'wall' },
            { w: 0.5, h: 6, d: 14, x: -7, y: 3, z: 0, c: 0xd2b48c, type: 'wall' },
            { w: 0.5, h: 6, d: 14, x: 7, y: 3, z: 0, c: 0xd2b48c, type: 'wall' },
            { w: 3, h: 2, d: 0.5, x: -7, y: 4.2, z: 0, c: 0xcfb997, type: 'wall' }, // janela lateral
            { w: 3, h: 2, d: 0.5, x: 7, y: 4.2, z: 0, c: 0xcfb997, type: 'wall' },
            { w: 15, h: 0.6, d: 15, x: 0, y: 6.5, z: 0, c: 0x6b4c2a, type: 'platform' }, // teto
            { w: 4, h: 0.3, d: 2.5, x: 0, y: 0.4, z: -8.5, c: 0x4a3622, type: 'platform' }, // varanda
            { w: 0.6, h: 4.5, d: 0.6, x: 3.2, y: 2.3, z: 3.2, c: 0x9c6b3f, type: 'wall' }, // pilar interno
            { w: 0.6, h: 4.5, d: 0.6, x: -3.2, y: 2.3, z: -3.2, c: 0x9c6b3f, type: 'wall' }
        ],
        tower: [
            { w: 6, h: 18, d: 6, x: 0, y: 9, z: 0, c: 0x666666, type: 'wall' },
            { w: 8, h: 1, d: 8, x: 0, y: 18.5, z: 0, c: 0x444444, type: 'platform' },
            { w: 2, h: 0.4, d: 4, x: 4, y: 0.5, z: 0, c: 0x8b7355, type: 'platform' },
            { w: 2, h: 0.4, d: 4, x: 4, y: 1.5, z: 2, c: 0x8b7355, type: 'platform' },
            { w: 2, h: 0.4, d: 4, x: 2, y: 2.5, z: 4, c: 0x8b7355, type: 'platform' },
            { w: 2, h: 0.4, d: 4, x: 0, y: 3.5, z: 4, c: 0x8b7355, type: 'platform' },
            { w: 2, h: 0.4, d: 4, x: -2, y: 4.5, z: 4, c: 0x8b7355, type: 'platform' },
            { w: 2, h: 0.4, d: 4, x: -4, y: 5.5, z: 2, c: 0x8b7355, type: 'platform' },
            { w: 2, h: 0.4, d: 4, x: -4, y: 6.5, z: 0, c: 0x8b7355, type: 'platform' },
            { w: 2, h: 0.4, d: 4, x: -4, y: 7.5, z: -2, c: 0x8b7355, type: 'platform' },
            { w: 2, h: 0.4, d: 4, x: -2, y: 8.5, z: -4, c: 0x8b7355, type: 'platform' },
            { w: 2, h: 0.4, d: 4, x: 0, y: 9.5, z: -4, c: 0x8b7355, type: 'platform' },
            { w: 2, h: 0.4, d: 4, x: 2, y: 10.5, z: -4, c: 0x8b7355, type: 'platform' },
            { w: 2, h: 0.4, d: 4, x: 4, y: 11.5, z: -2, c: 0x8b7355, type: 'platform' },
            { w: 2, h: 0.4, d: 3.5, x: 4, y: 12.5, z: 0.5, c: 0x8b7355, type: 'platform' },
            { w: 2.2, h: 0.4, d: 3.5, x: 3, y: 13.5, z: 2.5, c: 0x8b7355, type: 'platform' },
            { w: 2.2, h: 0.4, d: 3.5, x: 1.5, y: 14.5, z: 4, c: 0x8b7355, type: 'platform' },
            { w: 3, h: 0.4, d: 3.5, x: 0, y: 15.5, z: 4.5, c: 0x8b7355, type: 'platform' },
            { w: 3, h: 0.4, d: 3.5, x: 0, y: 16.5, z: 2.5, c: 0x8b7355, type: 'platform' },
            { w: 3, h: 0.4, d: 3.5, x: 0, y: 17.5, z: 0.5, c: 0x8b7355, type: 'platform' }
        ],
        barricade: [
            { w: 10, h: 2, d: 0.5, x: 0, y: 1, z: 0, c: 0x8b7355, type: 'wall' },
            { w: 0.5, h: 2.5, d: 0.5, x: -5, y: 1.25, z: 0, c: 0x654321, type: 'wall' },
            { w: 0.5, h: 2.5, d: 0.5, x: 5, y: 1.25, z: 0, c: 0x654321, type: 'wall' },
        ],
        bunker: [
            { w: 12, h: 5, d: 12, x: 0, y: 2.5, z: 0, c: 0x555555, type: 'wall' }, // Base
            { w: 13, h: 0.5, d: 13, x: 0, y: 5.5, z: 0, c: 0x444444, type: 'platform' }, // Teto
            { w: 3, h: 4, d: 0.5, x: 0, y: 2, z: -6, c: 0x222222, type: 'wall' }, // Entrada
        ],
        wall: [
            { w: 15, h: 4, d: 1, x: 0, y: 2, z: 0, c: 0x8b7355, type: 'wall' },
        ],
        crate: [
            { w: 2, h: 2, d: 2, x: 0, y: 1, z: 0, c: 0x8b4513, type: 'box' },
        ]
    };

    const preset = presets[type];
    if (!preset) return;

    preset.forEach(p => {
        const geometry = new THREE.BoxGeometry(p.w, p.h, p.d);
        const material = new THREE.MeshStandardMaterial({
            color: p.c,
            roughness: 0.7,
            metalness: 0.1
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(p.x, p.y, p.z);
        if (p.rotation) {
            mesh.rotation.set(
                p.rotation.x || 0,
                p.rotation.y || 0,
                p.rotation.z || 0
            );
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        scene.add(mesh);

        mapObjects.push({
            mesh: mesh,
            type: p.type,
            width: p.w,
            height: p.h,
            depth: p.d,
            color: p.c,
            position: { x: p.x, y: p.y, z: p.z },
            rotation: {
                x: mesh.rotation.x,
                y: mesh.rotation.y,
                z: mesh.rotation.z
            },
            texture: null,
            blocking: determineObjectBlocking(p.type)
        });
    });

    updateObjectsList();
}

function addEnemySpawn() {
    if (editorMode !== 'survival') {
        alert('Spawns de inimigos pertencem ao modo Survival. Altere o modo para adicionar.');
        return;
    }
    addingEnemySpawn = true;
    showMessage('Clique no mapa para posicionar o spawn de inimigo', 3000);
}

function placeEnemySpawn(position) {
    const enemyType = document.getElementById('enemyType').value;
    const spawnRound = parseInt(document.getElementById('spawnRound').value);

    const spawn = {
        position: { x: position.x, y: position.y + 1, z: position.z },
        type: enemyType,
        round: spawnRound
    };

    enemySpawns.push(spawn);

    // Criar marcador visual
    const markerGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const markerMaterial = new THREE.MeshStandardMaterial({
        color: enemyType === 'ranged' ? 0xff6600 : 0xff0000,
        emissive: enemyType === 'ranged' ? 0xff6600 : 0xff0000,
        emissiveIntensity: 0.5
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(spawn.position);
    scene.add(marker);
    spawn.marker = marker;

    updateEnemySpawnsList();
    addingEnemySpawn = false;
    showMessage('Spawn de inimigo adicionado!', 2000);
}

function updateEnemySpawnsList() {
    const list = document.getElementById('enemySpawnsList');
    list.innerHTML = '';

    enemySpawns.forEach((spawn, index) => {
        const item = document.createElement('div');
        item.className = 'object-item';
        item.style.fontSize = '12px';

        const typeIcon = spawn.type === 'ranged' ? '🔫' : '⚔️';
        const typeName = spawn.type === 'ranged' ? 'Distância' : 'Corpo-a-corpo';

        const info = document.createElement('span');
        info.textContent = `${typeIcon} ${typeName} - Round ${spawn.round}`;

        const btnDelete = document.createElement('button');
        btnDelete.textContent = '🗑️';
        btnDelete.className = 'danger';
        btnDelete.style.width = 'auto';
        btnDelete.style.padding = '4px 8px';
        btnDelete.onclick = () => {
            scene.remove(spawn.marker);
            spawn.marker.geometry.dispose();
            spawn.marker.material.dispose();
            enemySpawns.splice(index, 1);
            updateEnemySpawnsList();
        };

        item.appendChild(info);
        item.appendChild(btnDelete);
        list.appendChild(item);
    });
}

function clearEnemySpawns(skipConfirmation = false) {
    if (editorMode === 'survival' && !skipConfirmation && !confirm('Tem certeza que deseja limpar todos os spawns de inimigos?')) return;

    enemySpawns.forEach(spawn => {
        scene.remove(spawn.marker);
        spawn.marker.geometry.dispose();
        spawn.marker.material.dispose();
    });
    enemySpawns = [];
    updateEnemySpawnsList();
    addingEnemySpawn = false;
}

function clearBattleLootZones(skipConfirmation = false) {
    if (!battleLootZones.length) {
        updateBattleLootList();
        return;
    }
    if (!skipConfirmation && !confirm('Deseja remover todas as zonas de loot?')) {
        return;
    }
    battleLootZones.forEach(zone => {
        scene.remove(zone.marker);
        disposeMesh(zone.marker);
    });
    battleLootZones = [];
    updateBattleLootList();
}

function clearBattleDropSpawns(skipConfirmation = false) {
    if (!battleDropSpawns.length) {
        updateBattleDropList();
        return;
    }
    if (!skipConfirmation && !confirm('Deseja remover todos os pontos de drop?')) {
        return;
    }
    battleDropSpawns.forEach(drop => {
        scene.remove(drop.marker);
        disposeMesh(drop.marker);
        if (drop.beam) {
            scene.remove(drop.beam);
            disposeMesh(drop.beam);
        }
    });
    battleDropSpawns = [];
    updateBattleDropList();
}

function startBattlePlacement(type) {
    if (editorMode !== 'battleRoyale') {
        alert('Troque para o modo Battle Royale para usar esta ferramenta.');
        return;
    }
    cancelPlacementModes();
    placingBattleMarker = type === 'drop' ? 'drop' : 'loot';
    const message = placingBattleMarker === 'drop'
        ? 'Clique no mapa para definir o ponto de drop.'
        : 'Clique no mapa para criar uma zona de loot.';
    showMessage(message + ' Pressione ESC para cancelar.', 3200);
}

function placeBattleMarker(kind, point) {
    if (!point) return;
    if (kind === 'loot') {
        const radiusRaw = parseFloat(document.getElementById('lootZoneRadius')?.value);
        const radius = Number.isFinite(radiusRaw) ? Math.max(4, radiusRaw) : 12;
        createLootZoneMarker({ position: point, radius });
        updateBattleLootList();
        showMessage('Zona de loot adicionada!', 1800);
    } else if (kind === 'drop') {
        const altitudeRaw = parseFloat(document.getElementById('dropAltitude')?.value);
        const altitude = Number.isFinite(altitudeRaw) ? Math.max(10, altitudeRaw) : 60;
        createDropSpawnMarker({ position: point, altitude });
        updateBattleDropList();
        showMessage('Ponto de drop adicionado!', 1800);
    }
    battleEditorActivated = true;
    placingBattleMarker = null;
}

function createLootZoneMarker(zoneData) {
    const radius = Number.isFinite(zoneData?.radius) ? zoneData.radius : 12;
    const markerGeo = new THREE.CylinderGeometry(radius, radius, 0.4, 28, 1, true);
    const markerMat = new THREE.MeshStandardMaterial({ color: 0x00ffbf, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.rotation.x = Math.PI / 2;
    const targetPos = zoneData?.position || { x: 0, y: 0.2, z: 0 };
    marker.position.set(targetPos.x, 0.2, targetPos.z);
    scene.add(marker);
    battleLootZones.push({
        position: { x: marker.position.x, y: marker.position.y, z: marker.position.z },
        radius,
        marker
    });
}

function createDropSpawnMarker(dropData) {
    const altitude = Number.isFinite(dropData?.altitude) ? dropData.altitude : 60;
    const targetPos = dropData?.position || { x: 0, y: 1.2, z: 0 };
    const beaconGeo = new THREE.ConeGeometry(1.3, 2.5, 12);
    const beaconMat = new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffc107, emissiveIntensity: 0.6 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(targetPos.x, 1.2, targetPos.z);

    const beamGeo = new THREE.CylinderGeometry(0.35, 0.35, altitude, 12, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff59d, transparent: true, opacity: 0.35 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(targetPos.x, altitude / 2 + 1.2, targetPos.z);

    scene.add(beacon);
    scene.add(beam);

    battleDropSpawns.push({
        position: { x: beacon.position.x, y: beacon.position.y, z: beacon.position.z },
        altitude,
        marker: beacon,
        beam
    });
}

function rotateSelectedObject() {
    if (!selectedObject) return;
    const degrees = parseFloat(document.getElementById('rotationY').value);
    const radians = THREE.MathUtils.degToRad(Number.isNaN(degrees) ? 0 : degrees);
    selectedObject.rotation.y = radians;
    persistSelectedObjectTransform();
    refreshSelectedObjectInputs();
}

function updateVolume(value) {
    document.getElementById('volumeValue').textContent = value + '%';
    const audio = document.getElementById('backgroundMusic');
    if (audio) {
        audio.volume = value / 100;
    }
}

function toggleMusic() {
    const audio = document.getElementById('backgroundMusic');
    const btn = document.getElementById('toggleMusic');

    if (audio.paused) {
        audio.play();
        btn.textContent = '⏸️ PAUSAR';
    } else {
        audio.pause();
        btn.textContent = '▶️ REPRODUZIR';
    }
}

function showMessage(text, duration = 2000) {
    const toast = document.getElementById('toastMessage');
    if (!toast) {
        console.log(text);
        return;
    }
    toast.textContent = text;
    toast.classList.add('visible');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('visible');
    }, duration);
}

function setupControls() {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    renderer.domElement.addEventListener('mousedown', (e) => {
        if (e.button === 2) { // Right click
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
        } else if (e.button === 0) { // Left click
            if (addingEnemySpawn || placingObjective || placingTeamSpawn) {
                onMapClick(e);
            } else {
                onMouseClick(e);
            }
        }
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;

            const rotationSpeed = 0.005;
            const phi = Math.atan2(camera.position.z, camera.position.x);
            const theta = Math.acos(camera.position.y / camera.position.length());

            const newPhi = phi - deltaX * rotationSpeed;
            const newTheta = Math.max(0.1, Math.min(Math.PI - 0.1, theta + deltaY * rotationSpeed));

            const radius = camera.position.length();
            camera.position.x = radius * Math.sin(newTheta) * Math.cos(newPhi);
            camera.position.y = radius * Math.cos(newTheta);
            camera.position.z = radius * Math.sin(newTheta) * Math.sin(newPhi);
            camera.lookAt(0, 0, 0);

            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });

    renderer.domElement.addEventListener('mouseup', () => {
        isDragging = false;
    });

    renderer.domElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.1;
        const direction = camera.position.clone().normalize();
        if (e.deltaY < 0) {
            camera.position.sub(direction.multiplyScalar(zoomSpeed * camera.position.length()));
        } else {
            camera.position.add(direction.multiplyScalar(zoomSpeed * camera.position.length()));
        }
        camera.position.setLength(Math.max(10, Math.min(100, camera.position.length())));
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (addingEnemySpawn || placingObjective || placingTeamSpawn || placingBattleMarker) {
                cancelPlacementModes();
                showMessage('Modos de posicionamento cancelados.', 1500);
                return;
            }
        }

        if (!selectedObject) return;

        const moveSpeed = 0.5;
        let transformChanged = false;
        switch (e.key.toLowerCase()) {
            case 'w': selectedObject.position.z -= moveSpeed; transformChanged = true; break;
            case 's': selectedObject.position.z += moveSpeed; transformChanged = true; break;
            case 'a': selectedObject.position.x -= moveSpeed; transformChanged = true; break;
            case 'd': selectedObject.position.x += moveSpeed; transformChanged = true; break;
            case 'q': selectedObject.position.y -= moveSpeed; transformChanged = true; break;
            case 'e': selectedObject.position.y += moveSpeed; transformChanged = true; break;
            case 'r':
                selectedObject.rotation.y += Math.PI / 4;
                transformChanged = true;
                break;
            case 'delete':
                removeSelectedObject();
                return;
        }
        if (transformChanged) {
            persistSelectedObjectTransform();
            refreshSelectedObjectInputs();
            updateObjectsList();
        }
    });

    document.getElementById('musicFileInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                mapConfig.musicData = event.target.result;
                mapConfig.musicName = file.name;
                document.getElementById('musicInfo').textContent = `🎵 ${file.name}`;

                const audio = document.getElementById('backgroundMusic');
                audio.src = mapConfig.musicData;
                audio.volume = 0.5;
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('addObject').addEventListener('click', addObject);
    document.getElementById('clearAll').addEventListener('click', () => clearAll());
    document.getElementById('exportMap').addEventListener('click', exportMap);
    document.getElementById('importMap').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', importMap);
    document.getElementById('saveToLauncher').addEventListener('click', saveTacticalMap);
    document.getElementById('testMap').addEventListener('click', testMap);

    document.getElementById('addTextureBtn').addEventListener('click', () => {
        document.getElementById('textureInput').click();
    });

    document.getElementById('textureInput').addEventListener('change', async (e) => {
        if (!selectedObject) return;
        const file = e.target.files[0];
        if (file) {
            try {
                const dataURL = await imageToDataURL(file);
                const objData = mapObjects.find(o => o.mesh === selectedObject);
                if (objData) {
                    objData.texture = dataURL;
                    applyTextureToMesh(selectedObject, dataURL);
                    updateSelectedObjectPanel();
                }
            } catch (error) {
                alert('Erro ao processar imagem: ' + error.message);
            }
        }
    });

    document.getElementById('removeTextureBtn').addEventListener('click', () => {
        if (!selectedObject) return;
        const objData = mapObjects.find(o => o.mesh === selectedObject);
        if (objData) {
            delete objData.texture;
            resetMeshMaterial(selectedObject, objData.color);
            updateSelectedObjectPanel();
        }
    });

    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', (e) => {
            document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            selectedColor = parseInt(option.dataset.color);
        });
    });

    window.addEventListener('resize', onWindowResize);
    setupBattleConfigInputs();
}

function setupBattleConfigInputs() {
    const ids = [
        'planeStartX', 'planeStartY', 'planeStartZ',
        'planeEndX', 'planeEndY', 'planeEndZ',
        'planeSpeed', 'stormInitialRadius', 'stormShrinkRatio',
        'stormInterval', 'stormDelay', 'stormDamage',
        'lootWeaponDensity', 'lootHealDensity', 'lootAmmoDensity',
        'lootSupplyDrops', 'battleMaxPlayers', 'battleAiOpponents'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => syncBattleConfigFromInputs());
            el.addEventListener('input', () => syncBattleConfigFromInputs());
        }
    });
}

function onMouseClick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(mapObjects.map(obj => obj.mesh));

    if (intersects.length > 0) {
        selectObject(intersects[0].object);
    } else {
        deselectObject();
    }
}

function onMapClick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    let targets = mapObjects.map(obj => obj.mesh);
    if (interactionPlane) targets = [...targets, interactionPlane];
    const intersects = raycaster.intersectObjects(targets, false);

    if (!intersects.length) {
        if (addingEnemySpawn) addingEnemySpawn = false;
        if (placingX1Spawn) placingX1Spawn = null;
        showMessage('Não foi possível posicionar neste ponto.', 2000);
        return;
    }

    const point = intersects[0].point;

    // X1 Spawn placement
    if (placingX1Spawn) {
        placeX1Spawn(point, placingX1Spawn);
        placingX1Spawn = null;
        return;
    }

    if (placingBattleMarker) {
        placeBattleMarker(placingBattleMarker, point);
        return;
    }

    if (addingEnemySpawn) {
        placeEnemySpawn(point);
    }
}

function updateSelectedObjectPanel() {
    const panel = document.getElementById('selectedObjectPanel');
    const texturePreview = document.getElementById('texturePreview');
    const removeTextureBtn = document.getElementById('removeTextureBtn');

    if (!selectedObject) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    refreshSelectedObjectInputs();
    const objData = mapObjects.find(o => o.mesh === selectedObject);

    if (objData && objData.texture) {
        texturePreview.style.backgroundImage = `url(${objData.texture})`;
        removeTextureBtn.style.display = 'inline-block';
    } else {
        texturePreview.style.backgroundImage = 'none';
        removeTextureBtn.style.display = 'none';
    }
}

function refreshSelectedObjectInputs() {
    if (!selectedObject) return;
    const rotationInput = document.getElementById('rotationY');
    if (rotationInput) {
        const degrees = THREE.MathUtils.radToDeg(selectedObject.rotation.y);
        const normalized = ((degrees % 360) + 360) % 360;
        rotationInput.value = Number(normalized.toFixed(2));
    }

    const posXInput = document.getElementById('selectedPosX');
    const posYInput = document.getElementById('selectedPosY');
    const posZInput = document.getElementById('selectedPosZ');
    if (posXInput) posXInput.value = selectedObject.position.x.toFixed(2);
    if (posYInput) posYInput.value = selectedObject.position.y.toFixed(2);
    if (posZInput) posZInput.value = selectedObject.position.z.toFixed(2);
}

function persistSelectedObjectTransform() {
    if (!selectedObject) return;
    const objData = mapObjects.find(o => o.mesh === selectedObject);
    if (!objData) return;
    if (!objData.position) objData.position = { x: 0, y: 0, z: 0 };
    objData.position.x = selectedObject.position.x;
    objData.position.y = selectedObject.position.y;
    objData.position.z = selectedObject.position.z;
    objData.rotation.y = selectedObject.rotation.y;
}

function updateSelectedObjectPosition() {
    if (!selectedObject) return;
    const posXInput = document.getElementById('selectedPosX');
    const posYInput = document.getElementById('selectedPosY');
    const posZInput = document.getElementById('selectedPosZ');
    const x = parseFloat(posXInput?.value);
    const y = parseFloat(posYInput?.value);
    const z = parseFloat(posZInput?.value);

    if ([x, y, z].some(val => Number.isNaN(val))) {
        showMessage('Insira valores válidos para posição.', 1500);
        refreshSelectedObjectInputs();
        return;
    }

    selectedObject.position.set(x, y, z);
    persistSelectedObjectTransform();
    refreshSelectedObjectInputs();
    updateObjectsList();
}

function selectObject(mesh) {
    deselectObject();
    selectedObject = mesh;
    mesh.material.emissive.setHex(0x00ff00);
    mesh.material.emissiveIntensity = 0.3;

    updateObjectsList();
    updateSelectedObjectPanel();
}

function deselectObject() {
    if (selectedObject) {
        selectedObject.material.emissive.setHex(0x000000);
        selectedObject.material.emissiveIntensity = 0;
        selectedObject = null;
        updateObjectsList();
        updateSelectedObjectPanel();
    }
}

function addObject() {
    const type = document.getElementById('objectType').value;
    const width = parseFloat(document.getElementById('width').value);
    const height = parseFloat(document.getElementById('height').value);
    const depth = parseFloat(document.getElementById('depth').value);
    const posX = parseFloat(document.getElementById('posX').value);
    const posY = parseFloat(document.getElementById('posY').value);
    const posZ = parseFloat(document.getElementById('posZ').value);

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
        color: selectedColor,
        roughness: 0.7,
        metalness: 0.1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(posX, posY, posZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    scene.add(mesh);

    const blocking = determineObjectBlocking(type);

    const objectData = {
        mesh: mesh,
        type: type,
        width: width,
        height: height,
        depth: depth,
        color: selectedColor,
        position: { x: posX, y: posY, z: posZ },
        rotation: { x: 0, y: 0, z: 0 },
        texture: null,
        blocking
    };

    mapObjects.push(objectData);
    updateObjectsList();
}

function removeSelectedObject() {
    if (!selectedObject) return;

    const index = mapObjects.findIndex(obj => obj.mesh === selectedObject);
    if (index !== -1) {
        scene.remove(selectedObject);
        disposeMesh(selectedObject);
        mapObjects.splice(index, 1);
        selectedObject = null;
        updateObjectsList();
        updateSelectedObjectPanel();
    }
}

function clearAll(skipConfirmation = false) {
    if (!skipConfirmation && !confirm('Tem certeza que deseja limpar todos os objetos?')) return;

    mapObjects.forEach(obj => {
        scene.remove(obj.mesh);
        disposeMesh(obj.mesh);
    });
    mapObjects = [];
    selectedObject = null;
    clearTacticalElements();
    clearEnemySpawns(true);
    clearBattleLootZones(true);
    clearBattleDropSpawns(true);
    battleConfig = createDefaultBattleConfig();
    battleEditorActivated = false;
    applyBattleConfigToInputs(battleConfig);
    updateBattleLootList();
    updateBattleDropList();
    updateObjectsList();
    updateSelectedObjectPanel();
}

function updateObjectsList() {
    const list = document.getElementById('objectsList');
    list.innerHTML = '';

    mapObjects.forEach((obj, index) => {
        const item = document.createElement('div');
        item.className = 'object-item';
        if (obj.mesh === selectedObject) item.classList.add('selected');

        const info = document.createElement('span');
        info.textContent = `${obj.type} [${obj.mesh.position.x.toFixed(1)}, ${obj.mesh.position.y.toFixed(1)}, ${obj.mesh.position.z.toFixed(1)}]`;

        const btnSelect = document.createElement('button');
        btnSelect.textContent = '👁️';
        btnSelect.onclick = () => selectObject(obj.mesh);

        const btnDelete = document.createElement('button');
        btnDelete.textContent = '🗑️';
        btnDelete.className = 'danger';
        btnDelete.onclick = () => {
            if (obj.mesh === selectedObject) selectedObject = null;
            scene.remove(obj.mesh);
            disposeMesh(obj.mesh);
            mapObjects.splice(index, 1);
            updateObjectsList();
        };

        item.appendChild(info);
        item.appendChild(btnSelect);
        item.appendChild(btnDelete);
        list.appendChild(item);
    });
}

function exportMap() {
    const mapName = document.getElementById('mapName').value || 'Meu Mapa';
    const skyColor = document.getElementById('skyColor').value || '0x87ceeb';

    const survivalSettings = serializeSurvivalSettings();
    const battleSettings = serializeBattleSettings();
    const tacticalSnapshot = serializeTacticalSnapshot();
    const x1Settings = serializeX1Settings();

    const modeSettings = {};
    if (survivalSettings) modeSettings.survival = survivalSettings;
    if (battleSettings) modeSettings.battleRoyale = battleSettings;
    if (tacticalSnapshot) modeSettings.tactical = tacticalSnapshot;
    if (x1Settings) modeSettings.x1 = x1Settings;

    const mapData = {
        name: mapName,
        skyColor,
        version: '3.0',
        gameMode: editorMode,
        objects: serializeSceneObjects()
    };

    if (Object.keys(modeSettings).length > 0) {
        mapData.modeSettings = modeSettings;
    }

    if (survivalSettings) {
        mapData.config = survivalSettings.config;
        mapData.enemySpawns = survivalSettings.enemySpawns;
    }
    if (battleSettings) {
        mapData.battleRoyale = battleSettings;
    }
    if (tacticalSnapshot) {
        mapData.tactical = tacticalSnapshot;
    }
    if (x1Settings) {
        mapData.x1 = x1Settings;
    }

    const json = JSON.stringify(mapData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mapName.replace(/\s+/g, '_')}_v3.json`;
    a.click();
    URL.revokeObjectURL(url);

    const lootCount = battleLootZones.length;
    const dropCount = battleDropSpawns.length;
    const x1Info = editorMode === 'x1' ? `\n- Spawns X1: ${x1Data.spawns.player1 ? '✓' : '✗'} P1, ${x1Data.spawns.player2 ? '✓' : '✗'} P2` : '';
    alert(`✅ Mapa exportado com sucesso!\n\n📊 Estatísticas:\n- ${mapObjects.length} objetos\n- ${enemySpawns.length} spawns (Survival)\n- ${lootCount} zonas de loot / ${dropCount} drops (Battle)${x1Info}\n- Música: ${mapConfig.musicName || 'Nenhuma'}`);
}

function testMap() {
    const mapName = document.getElementById('mapName').value || 'Meu Mapa';
    const skyColor = document.getElementById('skyColor').value || '0x87ceeb';

    const survivalSettings = serializeSurvivalSettings();
    const battleSettings = serializeBattleSettings();
    const tacticalSnapshot = serializeTacticalSnapshot();
    const x1Settings = serializeX1Settings();

    const modeSettings = {};
    if (survivalSettings) modeSettings.survival = survivalSettings;
    if (battleSettings) modeSettings.battleRoyale = battleSettings;
    if (tacticalSnapshot) modeSettings.tactical = tacticalSnapshot;
    if (x1Settings) modeSettings.x1 = x1Settings;

    const mapData = {
        name: mapName,
        skyColor,
        version: '3.0',
        gameMode: editorMode,
        objects: serializeSceneObjects()
    };

    if (Object.keys(modeSettings).length > 0) {
        mapData.modeSettings = modeSettings;
    }

    if (survivalSettings) {
        mapData.config = survivalSettings.config;
        mapData.enemySpawns = survivalSettings.enemySpawns;
    }
    if (battleSettings) {
        mapData.battleRoyale = battleSettings;
    }
    if (tacticalSnapshot) {
        mapData.tactical = tacticalSnapshot;
    }
    if (x1Settings) {
        mapData.x1 = x1Settings;
    }

    // Salvar no localStorage para o jogo carregar
    localStorage.setItem('customMapData', JSON.stringify(mapData));

    // Determinar qual página abrir baseado no modo
    let gamePage = 'game.html';
    let modeParam = '';

    if (editorMode === 'x1') {
        // Para X1, precisa abrir com parâmetros de duelo (coopMode=x1&coopRole=host)
        modeParam = '?coopMode=x1&coopRole=host';

        if (confirm(`🎮 Testar mapa "${mapName}"?\n\nModo: ${editorMode.toUpperCase()}${x1Info}\nObjetos: ${mapObjects.length}\n\nO mapa será salvo e o jogo será aberto.`)) {
            window.open(gamePage + modeParam, '_blank');
        }
    }

    function importMap(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const mapData = JSON.parse(e.target.result);

                clearAll(true);

                document.getElementById('mapName').value = mapData.name || 'Mapa Importado';
                document.getElementById('skyColor').value = mapData.skyColor || '0x87ceeb';

                scene.background = new THREE.Color(parseInt(mapData.skyColor));
                scene.fog = new THREE.Fog(parseInt(mapData.skyColor), 10, 150);

                mapData.objects?.forEach(objData => {
                    const geometry = new THREE.BoxGeometry(objData.width, objData.height, objData.depth);
                    const material = new THREE.MeshStandardMaterial({
                        color: parseInt(objData.color),
                        roughness: 0.7,
                        metalness: 0.1
                    });
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.set(objData.position.x, objData.position.y, objData.position.z);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;

                    if (objData.rotation) {
                        mesh.rotation.set(objData.rotation.x, objData.rotation.y, objData.rotation.z);
                    }

                    if (objData.texture) {
                        applyTextureToMesh(mesh, objData.texture);
                    }

                    scene.add(mesh);
                    const blocking = typeof objData.blocking === 'boolean' ? objData.blocking : determineObjectBlocking(objData.type);

                    mapObjects.push({
                        mesh: mesh,
                        type: objData.type,
                        width: objData.width,
                        height: objData.height,
                        depth: objData.depth,
                        color: parseInt(objData.color),
                        texture: objData.texture,
                        position: objData.position,
                        rotation: objData.rotation || { x: 0, y: 0, z: 0 },
                        blocking
                    });
                });

                const survivalPayload = mapData.modeSettings?.survival || { config: mapData.config, enemySpawns: mapData.enemySpawns };
                loadSurvivalSettings(survivalPayload);
                loadTacticalMapData(mapData.modeSettings?.tactical || mapData.tactical);
                loadBattleSettings(mapData.modeSettings?.battleRoyale || mapData.battleRoyale);
                loadX1Settings(mapData.modeSettings?.x1 || mapData.x1);

                // Detectar modo do mapa e atualizar UI
                if (mapData.gameMode) {
                    setEditorMode(mapData.gameMode);
                }

                updateObjectsList();

                const x1Info = x1Data.spawns.player1 || x1Data.spawns.player2 ?
                    `\n- Spawns X1: ${x1Data.spawns.player1 ? '✓' : '✗'} P1, ${x1Data.spawns.player2 ? '✓' : '✗'} P2` : '';

                alert(`✅ Mapa importado com sucesso!\n\n📊 Carregado:\n- ${mapObjects.length} objetos\n- ${enemySpawns.length} spawns de inimigos\n- ${mapConfig.totalRounds} rounds\n- Música: ${mapConfig.musicName || 'Nenhuma'}${x1Info}`);
            } catch (error) {
                alert('❌ Erro ao importar mapa: ' + error.message);
            }
        };
        reader.readAsText(file);
    }

    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }

    function onWindowResize() {
        const { width: viewportWidth, height: viewportHeight } = getViewportDimensions();
        camera.aspect = viewportWidth / viewportHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(viewportWidth, viewportHeight);
    }

    init();
    applyBattleConfigToInputs(battleConfig);
    updateBattleLootList();
    updateBattleDropList();
    setEditorMode('survival');
    updateObjectiveInfo();
    updateTeamSpawnList('allies');
    updateTeamSpawnList('enemies');
