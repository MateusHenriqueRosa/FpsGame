let scene, camera, renderer, clock;
let enemies = [], lootItems = [], collidableObjects = [], wallMeshes = [];
let lootIdCounter = 0; // Contador para IDs únicos de loots
let keys = {}, currentRound = 1, enemiesRemaining = 0;
let gameStarted = false, pointerLocked = false, mapLoaded = false;
let customMapData = null;
let mapEnemySpawns = []; // Spawns de inimigos do mapa customizado
let maxRounds = 50; // Máximo de rounds (configurável pelo mapa)
let baseEnemiesPerRound = 5; // Base de inimigos por round
let enemyIncrement = 2; // Incremento de inimigos por round
let backgroundMusic = null;
let hasJumped = false, isChecking = false;
let weaponUnlockQueue = [];
const UNLOCK_INTERVAL = 2;
const SUPER_SHOTGUN_EXPLOSION_DAMAGE = 60;
const X1_DEFAULT_HEALTH = 120;
const X1_RESPAWN_DELAY_MS = 5000;
const x1MatchState = {
    active: false,
    started: false,
    winner: null,
    players: {},
    arenaLoaded: false,
    respawnTimer: null,
    respawnInterval: null,
    pendingRespawnFor: null,
    killLedger: Object.create(null)
};
const SUPER_SHOTGUN_EXPLOSION_RADIUS = 2.5;
let lastUnlockRoundServed = 0;
const recoilConfig = { recoverySpeed: 5, dampening: 0.92, sustainedFireGrowth: 1.4, maxSustainedFireMultiplier: 2 };
const recoilState = { pitch: 0, yaw: 0, sustainedFireMultiplier: 0.6 };
let yaw = 0, pitch = 0;
let targetYaw = 0, targetPitch = 0; // Rotação suavizada
let mouseSensitivityHipfire = 0.002;
let mouseSensitivityAds = 0.0012;
const cameraSmoothing = 0.5; // Fator de suavização (menor = mais suave)

// Controle de FPS para evitar pulos de câmera em monitores de alta taxa
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS;
let lastFrameTime = 0;
let frameAccumulator = 0;
let graphicsQuality = { shadows: true };
let crosshairSettings = { size: 20, thickness: 2, opacity: 0.8, color: '#ffffff' };
let weaponScene, weaponRenderer, weaponObject3D;
let fpsWeaponGroup; // Grupo da arma em primeira pessoa
let isAiming = false;
function getCurrentMouseSensitivity() {
    return isAiming ? mouseSensitivityAds : mouseSensitivityHipfire;
}

function updateSensitivityLabels() {
    const hipfireLabel = document.getElementById('hipfireSensitivityLabel');
    const adsLabel = document.getElementById('adsSensitivityLabel');
    if (hipfireLabel) hipfireLabel.textContent = (mouseSensitivityHipfire * 1000).toFixed(1);
    if (adsLabel) adsLabel.textContent = (mouseSensitivityAds * 1000).toFixed(1);
}

function syncSensitivityControls() {
    const hipfireSlider = document.getElementById('hipfireSensitivity');
    const adsSlider = document.getElementById('adsSensitivity');
    if (hipfireSlider) {
        const hipfireValue = Math.min(4, Math.max(0.5, mouseSensitivityHipfire * 1000));
        hipfireSlider.value = hipfireValue.toFixed(1);
    }
    if (adsSlider) {
        const adsValue = Math.min(3, Math.max(0.3, mouseSensitivityAds * 1000));
        adsSlider.value = adsValue.toFixed(1);
    }
    updateSensitivityLabels();
}
const baseFov = 75;
let currentSpread = 0;
const SURVIVAL_RUNNING_SPREAD = Object.freeze({
    speedRatio: 0.55,
    lateralMultiplier: 2.25,
    minJitter: 0.012
});
let weaponSway = { x: 0, y: 0 };
const textureCache = {};
const textureLoader = new THREE.TextureLoader();
const PLAYER_SKIN_STORAGE_KEY = 'playerSkin';
const DEFAULT_PLAYER_SKIN = Object.freeze({ body: '#ff0000', head: '#ff0000', texture: null });
const TEXTURED_SKIN_DEFAULT = '#ffffff';
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SOLO_PLAYER_ID = 'solo-player';
const enemyRegistry = new Map();
const remoteEnemyReplicas = new Map();
const remoteSkinTextureCache = new Map();
let enemyIdCounter = 0;
const REMOTE_ENEMY_INTERP_SPEED = 6;
const REMOTE_ENEMY_STALE_MS = 2500;
const MAX_ENEMY_STATE_EXPORT = 80;

const BASE_UPGRADE_LEVELS = Object.freeze({
    pistolDamage: 0,
    smgDamage: 0,
    smgSpeed: 0,
    rifleDamage: 0,
    rifleSpeed: 0,
    sniperDamage: 0,
    shotgunDamage: 0,
    shotgunPellets: 0,
    bazookaDamage: 0,
    bazookaRadius: 0,
    ammoCapacity: 0,
    moveSpeed: 0
});

const BASE_SUPER_UPGRADES = Object.freeze({
    superPistol: false,
    superRifleSpeed: false,
    superAmmo: false,
    superSpeed: false,
    superRegen: false,
    superShotgun: false,
    superBazooka: false
});
const SUPER_UPGRADE_KEYS = Object.keys(BASE_SUPER_UPGRADES);
const SUPER_UPGRADE_COSTS = Object.freeze({
    superPistol: 15,
    superRifleSpeed: 17,
    superAmmo: 20,
    superSpeed: 15,
    superRegen: 13,
    superShotgun: 18,
    superBazooka: 22
});
const UPGRADE_LABEL_MAP = Object.freeze({
    pistolDamage: 'Pistola Dano',
    smgDamage: 'SMG Dano',
    smgSpeed: 'SMG Cadência',
    rifleDamage: 'Rifle Dano',
    rifleSpeed: 'Rifle Cadência',
    sniperDamage: 'Sniper Dano',
    shotgunDamage: 'Shotgun Dano',
    shotgunPellets: 'Shotgun Projéteis',
    bazookaDamage: 'Bazuca Dano',
    bazookaRadius: 'Bazuca Raio',
    ammoCapacity: 'Munição Extra',
    moveSpeed: 'Velocidade'
});
const SUPER_UPGRADE_LABEL_MAP = Object.freeze({
    superPistol: 'Destruidor',
    superRifleSpeed: 'Rajada',
    superAmmo: 'Munição Inf',
    superSpeed: 'Sonic',
    superRegen: 'Regen',
    superShotgun: 'Explosiva',
    superBazooka: 'Cluster'
});

const playerProgressionLedger = Object.create(null);
const playerCombatLedger = Object.create(null);
const playerSkinLedger = Object.create(null);
const remotePlayers = new Map();
let remotePlayersRoot = null;
const REMOTE_FALLBACK_RADIUS = 4.5;
const REMOTE_INTERP_SPEED = 8;
const REMOTE_STATE_STALE_MS = 2000;
let coopCombatScore = 0;

function cloneUpgradeLevels() {
    return { ...BASE_UPGRADE_LEVELS };
}

function cloneSuperUpgrades() {
    return { ...BASE_SUPER_UPGRADES };
}

function rememberPlayerSkin(playerId, skin, isNormalized = false) {
    if (playerId === null || playerId === undefined || !skin) return;
    const key = String(playerId).trim();
    if (!key) return;
    const payload = isNormalized ? skin : normalizeRemoteSkin(skin);
    playerSkinLedger[key] = {
        body: payload.body,
        head: payload.head,
        texture: payload.texture
    };
}

function getCachedSkinForPlayer(playerId) {
    if (playerId === null || playerId === undefined) return null;
    const key = String(playerId).trim();
    if (!key) return null;
    const localId = String(getLocalPlayerId()).trim();
    if (key === localId) {
        const currentSkin = playerConfig?.skin || localPlayerSkin;
        return currentSkin ? { ...currentSkin } : null;
    }
    const cached = playerSkinLedger[key];
    return cached ? { ...cached } : null;
}

function getLocalPlayerId() {
    return coopRuntime.intent?.player || SOLO_PLAYER_ID;
}

function ensureUpgradeState(playerId = getLocalPlayerId()) {
    if (!playerId) return null;
    if (!playerProgressionLedger[playerId]) {
        playerProgressionLedger[playerId] = {
            playerId,
            points: 10,
            upgrades: cloneUpgradeLevels(),
            super: cloneSuperUpgrades(),
            lastUpdatedAt: Date.now(),
            timestamp: Date.now()
        };
    }
    return playerProgressionLedger[playerId];
}

function getLocalUpgradeState() {
    return ensureUpgradeState(getLocalPlayerId());
}

function getLocalUpgradeLevels() {
    return getLocalUpgradeState().upgrades;
}

function getLocalSuperUpgrades() {
    return getLocalUpgradeState().super;
}

function getLocalUpgradePoints() {
    return getLocalUpgradeState().points;
}

function normalizeProgressionPayload(playerId, progression) {
    if (!playerId || !progression || typeof progression !== 'object') {
        return null;
    }
    const normalized = {
        playerId,
        points: typeof progression.points === 'number' ? Math.max(0, Math.floor(progression.points)) : 0,
        upgrades: cloneUpgradeLevels(),
        super: cloneSuperUpgrades(),
        timestamp: typeof progression.timestamp === 'number' ? progression.timestamp : Date.now()
    };
    Object.keys(normalized.upgrades).forEach(key => {
        const value = progression.upgrades?.[key];
        if (typeof value === 'number') {
            normalized.upgrades[key] = Math.max(0, Math.floor(value));
        }
    });
    SUPER_UPGRADE_KEYS.forEach(key => {
        if (typeof progression.super?.[key] === 'boolean') {
            normalized.super[key] = progression.super[key];
        }
    });
    return normalized;
}

function cloneProgressionShape(source, playerId) {
    if (!source) return null;
    return {
        playerId,
        points: typeof source.points === 'number' ? source.points : 0,
        upgrades: source.upgrades ? { ...source.upgrades } : cloneUpgradeLevels(),
        super: source.super ? { ...source.super } : cloneSuperUpgrades(),
        timestamp: source.timestamp || source.lastUpdatedAt || Date.now()
    };
}

function getCachedProgressionForPlayer(playerId) {
    if (!playerId) return null;
    if (playerId === getLocalPlayerId()) {
        return cloneProgressionShape(getLocalUpgradeState(), playerId);
    }
    const cached = playerProgressionLedger[playerId];
    if (!cached) return null;
    return cloneProgressionShape(cached, playerId);
}

function updatePlayerCombatState(playerId, combat = {}) {
    if (!playerId || !combat) return;
    playerCombatLedger[playerId] = {
        ...(playerCombatLedger[playerId] || {}),
        ...combat,
        playerId
    };
}

function getPlayerCombatState(playerId = getLocalPlayerId()) {
    if (!playerId) return null;
    return playerCombatLedger[playerId] || null;
}

function setUpgradePoints(value, playerId = getLocalPlayerId()) {
    const state = ensureUpgradeState(playerId);
    state.points = Math.max(0, value);
    state.lastUpdatedAt = Date.now();
    state.timestamp = state.lastUpdatedAt;
    if (playerId === getLocalPlayerId()) {
        scheduleProgressionSync('set');
    }
}

function addUpgradePoints(amount = 1, playerId = getLocalPlayerId()) {
    const state = ensureUpgradeState(playerId);
    state.points = Math.max(0, state.points + amount);
    state.lastUpdatedAt = Date.now();
    state.timestamp = state.lastUpdatedAt;
    updateUpgradeMenu();
    updateHUD();
    if (playerId === getLocalPlayerId()) {
        scheduleProgressionSync('add');
    }
    return state.points;
}

function spendUpgradePoints(cost = 1, playerId = getLocalPlayerId()) {
    const state = ensureUpgradeState(playerId);
    if (state.points < cost) {
        return false;
    }
    state.points -= cost;
    state.lastUpdatedAt = Date.now();
    state.timestamp = state.lastUpdatedAt;
    updateUpgradeMenu();
    updateHUD();
    if (playerId === getLocalPlayerId()) {
        scheduleProgressionSync('spend');
    }
    return true;
}

function sanitizeHexColor(value, fallback) {
    if (typeof value === 'string' && HEX_COLOR_REGEX.test(value.trim())) {
        return value.trim();
    }
    return fallback;
}

function loadLocalPlayerSkin() {
    const fallback = { ...DEFAULT_PLAYER_SKIN };
    try {
        const cachedRaw = localStorage.getItem(PLAYER_SKIN_STORAGE_KEY);
        const cached = cachedRaw ? JSON.parse(cachedRaw) : null;
        const profileRaw = localStorage.getItem('player');
        const profile = profileRaw ? JSON.parse(profileRaw) : null;
        const textureCandidate = typeof (cached?.texture ?? profile?.skin_texture) === 'string'
            ? (cached?.texture ?? profile?.skin_texture).trim()
            : '';
        const resolvedTexture = textureCandidate || fallback.texture;
        const hasTexture = Boolean(resolvedTexture);
        const bodyFallback = hasTexture ? TEXTURED_SKIN_DEFAULT : fallback.body;
        const headFallback = hasTexture ? TEXTURED_SKIN_DEFAULT : fallback.head;
        return {
            body: sanitizeHexColor(cached?.body || profile?.skin_body, bodyFallback),
            head: sanitizeHexColor(cached?.head || profile?.skin_head, headFallback),
            texture: resolvedTexture
        };
    } catch (error) {
        console.warn('Skin local inválida no runtime do jogo.', error);
        return { ...fallback };
    }
}

function hexToRgba(hex, alpha = 1) {
    const normalized = sanitizeHexColor(hex, '#ffffff').replace('#', '');
    const full = normalized.length === 3
        ? normalized.split('').map(ch => ch + ch).join('')
        : normalized;
    const value = parseInt(full, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyLocalSkinToHud(skin) {
    const resolved = skin || localPlayerSkin;
    const crosshairColor = hexToRgba(resolved.head, 0.9);
    document.querySelectorAll('.crosshair-line').forEach(line => {
        line.style.background = crosshairColor;
    });
    const healthFill = document.getElementById('healthFill');
    if (healthFill) {
        healthFill.style.background = `linear-gradient(90deg, ${resolved.body}, ${resolved.head})`;
    }
    const ammoEl = document.getElementById('ammo');
    if (ammoEl) ammoEl.style.color = resolved.head;
    const weaponEl = document.getElementById('weapon');
    if (weaponEl) weaponEl.style.color = resolved.body;
}

const localPlayerSkin = loadLocalPlayerSkin();

const playerConfig = {
    position: new THREE.Vector3(0, 10, 0), height: 2.0, radius: 0.5, speed: 7.0, baseSpeed: 7.0, jumpPower: 9.0, gravity: 25.0,
    velocity: new THREE.Vector3(), onGround: false, health: 100, maxHealth: 100,
    weapons: {
        pistol: { name: 'Pistola', ammo: 12, maxAmmo: 60, clipSize: 12, damage: 20, fireRate: 250, auto: false, unlocked: true, recoil: { v_kick: 0.010, h_kick: 0.005 } },
        smg: { name: 'SMG', ammo: 30, maxAmmo: 0, clipSize: 30, damage: 12, fireRate: 100, auto: true, unlocked: false, recoil: { v_kick: 0.025, h_kick: 0.015 } },
        rifle: { name: 'Rifle', ammo: 30, maxAmmo: 0, clipSize: 30, damage: 25, fireRate: 150, auto: true, unlocked: false, recoil: { v_kick: 0.035, h_kick: 0.018 } },
        sniper: { name: 'Sniper', ammo: 5, maxAmmo: 0, clipSize: 5, damage: 100, fireRate: 1200, auto: false, unlocked: false, recoil: { v_kick: 0.15, h_kick: 0.05 } },
        shotgun: { name: 'Shotgun', ammo: 8, maxAmmo: 0, clipSize: 8, damage: 15, fireRate: 900, auto: false, unlocked: false, pellets: 8, recoil: { v_kick: 0.08, h_kick: 0.025 } },
        bazooka: { name: 'Bazuca', ammo: 1, maxAmmo: 0, clipSize: 1, damage: 150, fireRate: 2500, auto: false, unlocked: false, recoil: { v_kick: 0.20, h_kick: 0.06 } }
    },
    currentWeapon: 'pistol', lastShot: 0, isReloading: false, isShooting: false,
    isRespawning: false,
    skin: { ...localPlayerSkin }
};
rememberPlayerSkin(SOLO_PLAYER_ID, playerConfig.skin, true);

const WEAPON_DAMAGE_PROFILE_SURVIVAL = Object.freeze({
    pistol: 20,
    smg: 12,
    rifle: 25,
    sniper: 100,
    shotgun: 15,
    bazooka: 150
});

const WEAPON_DAMAGE_PROFILE_X1 = Object.freeze({
    pistol: 20,
    smg: 12,
    rifle: 25,
    sniper: 100,
    shotgun: 15,
    bazooka: 150
});

function getWeaponDamageProfile() {
    return IS_X1_MODE ? WEAPON_DAMAGE_PROFILE_X1 : WEAPON_DAMAGE_PROFILE_SURVIVAL;
}

function getBaseWeaponDamage(weaponKey, fallback = 10) {
    const profile = getWeaponDamageProfile();
    return profile[weaponKey] ?? fallback;
}

function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x87ceeb, 10, 150);
    scene.background = new THREE.Color(0x87ceeb);
    clock = new THREE.Clock();
    camera = new THREE.PerspectiveCamera(baseFov, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.copy(playerConfig.position);

    // FPS Weapon Group
    fpsWeaponGroup = new THREE.Group();
    fpsWeaponGroup.position.set(0.3, -0.3, -0.5); // Posição inicial da arma
    camera.add(fpsWeaponGroup);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.left = directionalLight.shadow.camera.bottom = -80;
    directionalLight.shadow.camera.right = directionalLight.shadow.camera.top = 80;
    scene.add(directionalLight);

    // Adicionar câmera à cena para que a arma seja renderizada
    scene.add(camera);
    remotePlayersRoot = new THREE.Group();
    remotePlayersRoot.name = 'RemotePlayersRoot';
    scene.add(remotePlayersRoot);

    applyLocalSkinToHud(playerConfig.skin || localPlayerSkin);

    setupMapSelector();
    restoreCustomMapFromStorage();
    setupControls();
    setupStartButton();
    createWeapon3D(); // HUD weapon
    setupAiming(); // Aiming logic

    // Inicializar arma FPS
    updateFPSWeaponModel();

    window.addEventListener('resize', onWindowResize);
    animate();
}

function setupAiming() {
    document.addEventListener('mousedown', (e) => {
        if (e.button !== 2) return;
        if (!pointerLocked) return;
        e.preventDefault();
        isAiming = true;
    });
    document.addEventListener('mouseup', (e) => {
        if (e.button === 2) {
            isAiming = false;
        }
    });
}

function updateAiming(delta) {
    const weaponKey = playerConfig.currentWeapon || 'pistol';
    let targetFov = baseFov;
    let zoomFactor = 1.0;

    if (isAiming && pointerLocked) {
        if (weaponKey === 'pistol' || weaponKey === 'shotgun' || weaponKey === 'bazooka') {
            zoomFactor = 1.2; // Mira leve para armas curtas
        } else if (weaponKey === 'smg' || weaponKey === 'rifle') {
            zoomFactor = 1.75;
        } else if (weaponKey === 'sniper') {
            zoomFactor = 2.5;
        }
        targetFov = baseFov / zoomFactor;
        playerConfig.speed = playerConfig.baseSpeed * 0.5;
        currentSpread = 0.001;
    } else {
        playerConfig.speed = playerConfig.baseSpeed;
        const moveSpeed = Math.hypot(playerConfig.velocity.x, playerConfig.velocity.z);
        currentSpread = 0.02 + (moveSpeed * 0.01);
    }

    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, delta * 10);
    camera.updateProjectionMatrix();
}

function updateWeaponSway(delta) {
    if (!fpsWeaponGroup) return;

    const time = Date.now() * 0.005;
    const isMoving = Math.sqrt(playerConfig.velocity.x ** 2 + playerConfig.velocity.z ** 2) > 0.1;

    let targetX = 0.3; // Posição base X
    let targetY = -0.3; // Posição base Y
    let targetZ = -0.5;

    if (isAiming) {
        targetX = 0; // Centralizar mira
        targetY = -0.24; // Ajustar altura para mira
        targetZ = -0.4; // Aproximar um pouco
    } else if (isMoving) {
        targetX += Math.sin(time * 2) * 0.05;
        targetY += Math.abs(Math.cos(time * 2)) * 0.05;
    }

    fpsWeaponGroup.position.x = THREE.MathUtils.lerp(fpsWeaponGroup.position.x, targetX, delta * 10);
    fpsWeaponGroup.position.y = THREE.MathUtils.lerp(fpsWeaponGroup.position.y, targetY, delta * 10);
    fpsWeaponGroup.position.z = THREE.MathUtils.lerp(fpsWeaponGroup.position.z, targetZ, delta * 10);
}

function updateFPSWeaponModel() {
    while (fpsWeaponGroup.children.length > 0) {
        fpsWeaponGroup.remove(fpsWeaponGroup.children[0]);
    }

    const type = playerConfig.currentWeapon;
    const activeSkin = playerConfig.skin || localPlayerSkin;
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(activeSkin.body || '#333333'), roughness: 0.5, metalness: 0.8 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(activeSkin.head || '#ffcc88'), roughness: 0.3, metalness: 0.9 });
    let mesh;

    if (type === 'pistol') {
        // Pistola: Bloco simples + cano
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.3), material);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4), accentMaterial);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = -0.2;
        barrel.position.y = 0.05;
        group.add(body);
        group.add(barrel);
        mesh = group;
    } else if (type === 'shotgun') {
        // Shotgun: Cano longo e grosso
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.6), material);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2), accentMaterial);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = -0.6;
        barrel.position.y = 0.05;
        group.add(body);
        group.add(barrel);
        mesh = group;
    } else if (type === 'smg') {
        // SMG: Compacta
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.4), material);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), accentMaterial);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = -0.3;
        group.add(body);
        group.add(barrel);
        mesh = group;
    } else if (type === 'rifle') {
        // Rifle: Longo
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.5), material);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0), accentMaterial);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = -0.6;
        barrel.position.y = 0.05;
        group.add(body);
        group.add(barrel);
        mesh = group;
    } else if (type === 'sniper') {
        // Sniper: Muito longo com mira
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.6), material);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5), accentMaterial);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = -0.9;
        barrel.position.y = 0.05;
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3), accentMaterial);
        scope.rotation.x = Math.PI / 2;
        scope.position.y = 0.12;
        scope.position.z = -0.1;
        group.add(body);
        group.add(barrel);
        group.add(scope);
        mesh = group;
    } else if (type === 'bazooka') {
        // Bazooka: Tubo grande
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.5), material);
        tube.rotation.x = Math.PI / 2;
        tube.position.z = -0.2;
        mesh = tube;
    }

    if (mesh) {
        fpsWeaponGroup.add(mesh);
    }
}

function createWeapon3D() {
    const canvas = document.getElementById('weaponDisplay');
    weaponScene = new THREE.Scene();
    const weaponCamera = new THREE.PerspectiveCamera(75, 300 / 300, 0.1, 1000);
    weaponRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    weaponRenderer.setSize(300, 300);
    weaponRenderer.setClearColor(0x000000, 0);
    canvas.appendChild(weaponRenderer.domElement);
    const activeSkin = playerConfig.skin || localPlayerSkin;
    const weaponPrimaryMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(activeSkin.body || '#444444'), metalness: 0.5, roughness: 0.4 });
    const weaponAccentMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(activeSkin.head || '#ffcb77'), metalness: 0.4, roughness: 0.3 });

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 10, 10);
    weaponScene.add(light);
    const ambLight = new THREE.AmbientLight(0xffffff, 0.5);
    weaponScene.add(ambLight);

    weaponCamera.position.z = 5;

    function renderWeapon() {
        if (weaponObject3D) weaponScene.remove(weaponObject3D);
        const weaponName = playerConfig.currentWeapon;
        weaponObject3D = new THREE.Group();

        if (weaponName === 'pistol') {
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.5, 8), weaponAccentMaterial);
            barrel.position.z = 0.75;
            const grip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.3), weaponPrimaryMaterial);
            grip.position.z = -0.2;
            weaponObject3D.add(barrel);
            weaponObject3D.add(grip);
        } else if (weaponName === 'rifle') {
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2, 8), weaponAccentMaterial);
            barrel.position.z = 1;
            const stock = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.5), weaponPrimaryMaterial);
            stock.position.z = -0.5;
            const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.4), weaponAccentMaterial);
            magazine.position.z = -0.1;
            weaponObject3D.add(barrel);
            weaponObject3D.add(stock);
            weaponObject3D.add(magazine);
        } else if (weaponName === 'shotgun') {
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.2, 8), weaponAccentMaterial);
            barrel.position.z = 0.6;
            const pump = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.3), weaponPrimaryMaterial);
            pump.position.z = 0.2;
            const grip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), weaponPrimaryMaterial);
            grip.position.z = -0.3;
            weaponObject3D.add(barrel);
            weaponObject3D.add(pump);
            weaponObject3D.add(grip);
        } else if (weaponName === 'bazooka') {
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 8), weaponPrimaryMaterial);
            barrel.position.z = 0.9;
            const breech = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), weaponAccentMaterial);
            breech.position.z = -0.2;
            const stock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.6), weaponPrimaryMaterial);
            stock.position.z = -0.6;
            weaponObject3D.add(barrel);
            weaponObject3D.add(breech);
            weaponObject3D.add(stock);
        }

        weaponObject3D.rotation.y = Math.PI / 4;
        weaponObject3D.rotation.x = -Math.PI / 6;
        weaponScene.add(weaponObject3D);
        weaponRenderer.render(weaponScene, weaponCamera);
    }

    renderWeapon();

    // Atualizar arma quando trocar
    window.addEventListener('weaponSwitched', renderWeapon);
    window.addEventListener('playerSkinUpdated', renderWeapon);
}

function setupMapSelector() {
    updateModeVariantBanner();
    const defaultBtn = document.getElementById('defaultMapBtn');
    const customBtn = document.getElementById('customMapBtn');
    const fileInput = document.getElementById('mapFileInput');
    if (!defaultBtn || !customBtn || !fileInput) return;

    defaultBtn.addEventListener('click', () => {
        customMapData = null;
        localStorage.removeItem('customMapData');
        showMapSelectionInfo('Mapa padrão selecionado');
        logAuditEvent('MAP_SELECTOR', 'Jogador selecionou o mapa padrão', {
            source: 'button'
        }, { dedupeKey: 'map:default', debounceMs: 2000 });
    });

    customBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                customMapData = JSON.parse(event.target.result);
                localStorage.setItem('customMapData', JSON.stringify(customMapData));
                const mapName = customMapData.name || 'Customizado';
                showMapSelectionInfo(`Mapa customizado: ${mapName}`);
                logAuditEvent('MAP_SELECTOR', 'Mapa customizado carregado', {
                    mapName,
                    fileName: file.name,
                    fileSize: file.size
                });
            } catch (error) {
                alert('Erro ao carregar mapa: ' + error.message);
                customMapData = null;
                localStorage.removeItem('customMapData');
                showMapSelectionInfo('Mapa padrão selecionado');
                logAuditEvent('MAP_SELECTOR', 'Falha ao carregar mapa customizado', {
                    error: error.message || String(error),
                    fileName: file.name
                }, { level: 'warn', dedupeKey: `map-error:${file.name}` });
            }
        };
        reader.readAsText(file);
    });

    showMapSelectionInfo('Mapa padrão selecionado');
}

function restoreCustomMapFromStorage() {
    const storedMap = localStorage.getItem('customMapData');
    if (!storedMap) return;

    try {
        customMapData = JSON.parse(storedMap);
        if (!customMapData) {
            localStorage.removeItem('customMapData');
            showMapSelectionInfo('Mapa padrão selecionado');
            logAuditEvent('MAP_SELECTOR', 'Mapa customizado inválido removido do armazenamento', {
                source: 'restore'
            }, { level: 'warn', dedupeKey: 'map:restore:invalid' });
            return;
        }
        const mapName = customMapData.name || 'Customizado';
        showMapSelectionInfo(`Mapa customizado: ${mapName}`);
        logAuditEvent('MAP_SELECTOR', 'Mapa customizado restaurado do armazenamento', {
            mapName
        }, { dedupeKey: `map:restore:${mapName}` });
    } catch (error) {
        console.error('Erro ao restaurar mapa personalizado:', error);
        customMapData = null;
        localStorage.removeItem('customMapData');
        showMapSelectionInfo('Mapa padrão selecionado');
        logAuditEvent('MAP_SELECTOR', 'Falha ao restaurar mapa customizado', {
            error: error.message || String(error)
        }, { level: 'warn', dedupeKey: 'map:restore:error' });
    }
}

function getModeVariantLabel() {
    if (IS_X1_MODE) return 'DUELO X1';
    return IS_COOP_SURVIVAL ? 'SOBREVIVÊNCIA CO-OP' : 'SOBREVIVÊNCIA SOLO';
}

function getModeVariantAccentColor() {
    if (IS_X1_MODE) return '#ff9d00';
    return IS_COOP_SURVIVAL ? '#00cfff' : '#00ff00';
}

function updateModeVariantBanner(mapLabel = null) {
    const badge = document.getElementById('modeVariantBadge');
    const copy = document.getElementById('modeVariantCopy');
    const accent = getModeVariantAccentColor();
    if (badge) {
        badge.textContent = getModeVariantLabel();
        badge.style.borderColor = accent;
        badge.style.color = accent;
    }
    if (copy) {
        copy.textContent = mapLabel
            || (customMapData
                ? `Mapa customizado: ${customMapData.name || 'Customizado'}`
                : 'Mapa padrão pronto para carregar');
    }
}

function showMapSelectionInfo(label) {
    const infoElement = document.getElementById('selectedMapInfo');
    if (!infoElement) return;
    infoElement.style.display = 'block';
    infoElement.textContent = `${getModeVariantLabel()} • ${label}`;
    updateModeVariantBanner(label);
    logAuditEvent('MAP_SELECTOR', 'Seleção de mapa atualizada', {
        label,
        usingCustomMap: Boolean(customMapData),
        customName: customMapData?.name || null
    }, { dedupeKey: `map:${label}`, debounceMs: 2500 });
}

function applyModeBootstraps() {
    if (IS_X1_MODE) {
        x1MatchState.active = true;
        if (!x1MatchState.killLedger) {
            x1MatchState.killLedger = Object.create(null);
        }
        ensureX1KillEntry(getLocalPlayerId());
        prepareX1Loadout();
        applyX1SpawnPreset();
    } else {
        x1MatchState.active = false;
        x1MatchState.killLedger = Object.create(null);
    }
    updateX1KillLeaderboard();
}

function resetX1KillLedger() {
    x1MatchState.killLedger = Object.create(null);
}

function ensureX1KillEntry(playerId) {
    if (!IS_X1_MODE || !playerId) return 0;
    if (!x1MatchState.killLedger) {
        resetX1KillLedger();
    }
    if (typeof x1MatchState.killLedger[playerId] !== 'number') {
        x1MatchState.killLedger[playerId] = 0;
    }
    return x1MatchState.killLedger[playerId];
}

function incrementX1KillCount(playerId) {
    if (!IS_X1_MODE || !playerId) return;
    ensureX1KillEntry(playerId);
    x1MatchState.killLedger[playerId] += 1;
    updateX1KillLeaderboard();
}

function applyX1KillSnapshot(snapshot = {}) {
    if (!snapshot || typeof snapshot !== 'object') return;
    x1MatchState.killLedger = { ...snapshot };
    updateX1KillLeaderboard();
}

function resolveX1PlayerLabel(playerId) {
    if (!playerId) return 'Desconhecido';
    if (playerId === getLocalPlayerId()) {
        return coopRuntime.intent?.player || 'Você';
    }
    const remote = remotePlayers.get(playerId);
    if (remote?.name) {
        return remote.name;
    }
    const roster = coopRuntime.playersSnapshot || [];
    for (const entry of roster) {
        const key = entry?.playerId || entry?.name;
        if (key === playerId) {
            return entry.name || entry.playerId || playerId;
        }
    }
    return playerId;
}

function getX1KillLedgerEntries() {
    if (!x1MatchState.killLedger) return [];
    return Object.entries(x1MatchState.killLedger)
        .map(([playerId, kills]) => ({
            playerId,
            kills: Number(kills) || 0,
            label: resolveX1PlayerLabel(playerId)
        }))
        .sort((a, b) => {
            if (b.kills !== a.kills) return b.kills - a.kills;
            return a.label.localeCompare(b.label);
        });
}

function updateX1KillLeaderboard() {
    const board = document.getElementById('x1KillLeaderboard');
    const list = document.getElementById('x1KillLeaderboardList');
    if (!board || !list) return;
    const shouldShow = IS_X1_MODE && x1MatchState.started;
    board.classList.toggle('hidden', !shouldShow);
    if (!shouldShow) {
        list.innerHTML = '';
        return;
    }
    const entries = getX1KillLedgerEntries();
    if (!entries.length) {
        list.innerHTML = '<div class="x1-kill-empty">Sem eliminações registradas</div>';
        return;
    }
    list.innerHTML = entries.map((entry, index) => {
        const leaderClass = index === 0 ? ' leader' : '';
        const selfClass = entry.playerId === getLocalPlayerId() ? ' self' : '';
        return `<div class="x1-kill-row${leaderClass}${selfClass}"><span class="x1-kill-name">${escapeHtml(entry.label)}</span><span class="x1-kill-value">${entry.kills}</span></div>`;
    }).join('');
}

function ensureX1PlayerState(playerId) {
    if (!playerId) return null;
    if (!x1MatchState.players[playerId]) {
        x1MatchState.players[playerId] = {
            playerId,
            health: X1_DEFAULT_HEALTH,
            maxHealth: X1_DEFAULT_HEALTH,
            isGhost: false
        };
        ensureX1KillEntry(playerId);
        updateX1KillLeaderboard();
    }
    return x1MatchState.players[playerId];
}

function prepareX1Loadout() {
    if (!IS_X1_MODE) return;
    Object.values(playerConfig.weapons).forEach(weapon => {
        weapon.unlocked = true;
        weapon.maxAmmo = Number.POSITIVE_INFINITY;
        weapon.ammo = weapon.clipSize;
    });
    playerConfig.currentWeapon = 'rifle';
    playerConfig.maxHealth = X1_DEFAULT_HEALTH;
    playerConfig.health = X1_DEFAULT_HEALTH;
    ensureX1PlayerState(getLocalPlayerId()).maxHealth = playerConfig.maxHealth;
    ensureX1PlayerState(getLocalPlayerId()).health = playerConfig.health;
}

function applyX1SpawnPreset() {
    if (!IS_X1_MODE) return;
    const offset = INITIAL_COOP_ROLE === 'client' ? 14 : -14;
    playerConfig.position.set(offset, 5, 0);
    playerConfig.velocity.set(0, 0, 0);
}

function setLocalPlayerGhostState(isGhost) {
    playerConfig.isRespawning = Boolean(isGhost);
    if (fpsWeaponGroup) fpsWeaponGroup.visible = !isGhost;
    if (isGhost) {
        playerConfig.velocity.set(0, 0, 0);
        playerConfig.onGround = true;
    }
}

function setRemotePlayerGhostState(playerId, isGhost) {
    if (!playerId || playerId === getLocalPlayerId()) return;
    const remote = remotePlayers.get(playerId);
    if (remote?.group) {
        remote.group.visible = !isGhost;
    }
}

function setPlayerGhostState(playerId, isGhost) {
    if (!playerId) return;
    if (playerId === getLocalPlayerId()) {
        setLocalPlayerGhostState(isGhost);
    } else {
        setRemotePlayerGhostState(playerId, isGhost);
    }
}

function clearX1RespawnCountdown() {
    if (x1MatchState.respawnTimer) {
        clearTimeout(x1MatchState.respawnTimer);
        x1MatchState.respawnTimer = null;
    }
    if (x1MatchState.respawnInterval) {
        clearInterval(x1MatchState.respawnInterval);
        x1MatchState.respawnInterval = null;
    }
    x1MatchState.pendingRespawnFor = null;
}

function scheduleX1Respawn(message, delayMs = X1_RESPAWN_DELAY_MS, targetId = getLocalPlayerId(), options = {}) {
    const targetPlayerId = targetId || getLocalPlayerId();
    const entry = ensureX1PlayerState(targetPlayerId);
    if (!entry) return;
    const isLocalTarget = targetPlayerId === getLocalPlayerId();
    const clampedDelay = Math.max(1000, delayMs || X1_RESPAWN_DELAY_MS);
    const shouldShowCountdown = isLocalTarget && options.showMessage !== false;
    const shouldBroadcast = options.broadcast !== false && coopRuntime.intent?.role === 'host';
    entry.isGhost = true;
    entry.health = 0;
    setPlayerGhostState(targetPlayerId, true);
    if (isLocalTarget) {
        playerConfig.health = 0;
        updateHUD();
    }
    clearX1RespawnCountdown();
    x1MatchState.pendingRespawnFor = targetPlayerId;
    if (shouldShowCountdown) {
        let remaining = Math.ceil(clampedDelay / 1000);
        const emitMessage = () => {
            const suffix = remaining > 0 ? ` Respawn em ${remaining}s...` : '';
            const baseMessage = message || (isLocalTarget ? 'Você foi derrotado.' : 'Aguardando respawn.');
            showMessage(`${baseMessage}${suffix}`, 1200);
        };
        emitMessage();
        x1MatchState.respawnInterval = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                clearX1RespawnCountdown();
                return;
            }
            emitMessage();
        }, 1000);
    }
    if (options.awaitHostSignal === true) {
        x1MatchState.respawnTimer = null;
    } else {
        x1MatchState.respawnTimer = setTimeout(() => {
            clearX1RespawnCountdown();
            respawnX1Player(targetPlayerId, options);
        }, clampedDelay);
    }
    if (shouldBroadcast) {
        sendCoopEvent('x1-respawn', {
            playerId: targetPlayerId,
            phase: 'scheduled',
            delayMs: clampedDelay,
            message: message || null,
            resetWinnerOnRespawn: options.resetWinnerOnRespawn !== false,
            winnerId: options.winnerId || null
        });
    }
}

function respawnX1Player(playerId, options = {}) {
    const targetPlayerId = playerId || getLocalPlayerId();
    const entry = ensureX1PlayerState(targetPlayerId);
    if (!entry) return;
    const isLocalTarget = targetPlayerId === getLocalPlayerId();
    clearX1RespawnCountdown();
    x1MatchState.pendingRespawnFor = null;
    entry.isGhost = false;
    entry.health = entry.maxHealth;
    setPlayerGhostState(targetPlayerId, false);
    if (isLocalTarget) {
        playerConfig.maxHealth = entry.maxHealth;
        playerConfig.health = playerConfig.maxHealth;
        applyX1SpawnPreset();
        updateHUD();
        if (options.showRespawnMessage !== false) {
            showMessage(options.respawnCompleteMessage || 'Você reapareceu no duelo.', 1800);
        }
    }
    if (options.resetWinnerOnRespawn !== false) {
        x1MatchState.winner = null;
    }
    if (coopRuntime.intent?.role === 'host' && options.broadcast !== false) {
        sendCoopEvent('x1-respawn', {
            playerId: targetPlayerId,
            phase: 'completed',
            health: entry.health,
            maxHealth: entry.maxHealth,
            resetWinnerOnRespawn: options.resetWinnerOnRespawn !== false,
            winnerId: options.winnerId || null
        });
    }
}

function getX1OpponentId() {
    if (!IS_X1_MODE) return null;
    const localId = getLocalPlayerId();
    let opponentId = null;
    remotePlayers.forEach(remote => {
        if (remote?.playerId && remote.playerId !== localId) {
            opponentId = remote.playerId;
        }
    });
    if (opponentId) {
        return opponentId;
    }
    const roster = coopRuntime.playersSnapshot || [];
    for (const entry of roster) {
        const pid = entry?.playerId || entry?.name;
        if (pid && pid !== localId) {
            opponentId = pid;
            break;
        }
    }
    return opponentId;
}

function registerX1Damage(targetId, damage, meta = {}) {
    if (!IS_X1_MODE || !targetId || damage <= 0 || x1MatchState.winner) return;
    const attackerId = meta.attackerId || getLocalPlayerId();
    if (coopRuntime.intent?.role === 'host') {
        applyX1DamageLocally(targetId, damage, attackerId, meta);
    } else {
        sendCoopInput({
            action: 'player-hit',
            targetId,
            damage,
            headshot: Boolean(meta.headshot),
            weapon: playerConfig.currentWeapon,
            attackerId,
            source: meta.source || null
        });
    }
}

function applyX1DamageLocally(targetId, damage, attackerId = null, meta = {}) {
    if (!IS_X1_MODE || !targetId || damage <= 0 || x1MatchState.winner) return;
    const entry = ensureX1PlayerState(targetId);
    if (!entry) return;
    entry.health = Math.max(0, entry.health - damage);
    if (targetId === getLocalPlayerId()) {
        playerConfig.health = entry.health;
    }
    updateHUD();
    if (coopRuntime.intent?.role === 'host') {
        sendCoopEvent('x1-hit', {
            targetId,
            attackerId: attackerId || getLocalPlayerId(),
            damage,
            headshot: Boolean(meta.headshot),
            remaining: entry.health,
            maxHealth: entry.maxHealth
        });
    }
    if (entry.health <= 0) {
        finishX1Match(attackerId || getLocalPlayerId(), targetId);
    }
}

function startX1Match() {
    if (!IS_X1_MODE || x1MatchState.started) return;
    x1MatchState.started = true;
    currentRound = 1;
    enemiesRemaining = 0;
    const localId = getLocalPlayerId();
    const opponentId = getX1OpponentId();
    resetX1KillLedger();
    ensureX1KillEntry(localId);
    if (opponentId) ensureX1KillEntry(opponentId);
    ensureX1PlayerState(localId).health = playerConfig.maxHealth;
    ensureX1PlayerState(localId).maxHealth = playerConfig.maxHealth;
    if (opponentId) ensureX1PlayerState(opponentId);
    updateX1KillLeaderboard();
    showMessage('Duelo X1 iniciado! Boa sorte.', 2500);
    updateHUD();
    logAuditEvent('X1_MATCH', 'Duelo X1 iniciado', {
        opponentId,
        role: coopRuntime.intent?.role || 'solo'
    });
}

function finishX1Match(winnerId, loserId = null) {
    if (!IS_X1_MODE || x1MatchState.winner) return;
    const resolvedWinner = winnerId || getLocalPlayerId();
    const resolvedLoser = loserId
        || (resolvedWinner === getLocalPlayerId() ? getX1OpponentId() : getLocalPlayerId());
    x1MatchState.winner = resolvedWinner;
    incrementX1KillCount(resolvedWinner);
    const localWinner = resolvedWinner === getLocalPlayerId();
    const bannerMessage = localWinner ? '🎯 Você venceu o duelo!' : '💀 Você foi derrotado no duelo.';
    showMessage(bannerMessage, 2500);
    if (coopRuntime.intent?.role === 'host') {
        sendCoopEvent('x1-finish', {
            winnerId: resolvedWinner,
            loserId: resolvedLoser,
            killLedger: { ...x1MatchState.killLedger }
        });
    }
    if (resolvedLoser) {
        const respawnMessage = resolvedLoser === getLocalPlayerId()
            ? '💀 Você foi derrotado no duelo.'
            : 'Seu oponente foi derrotado no duelo.';
        scheduleX1Respawn(respawnMessage, X1_RESPAWN_DELAY_MS, resolvedLoser, {
            winnerId: resolvedWinner,
            resetWinnerOnRespawn: true,
            showMessage: resolvedLoser === getLocalPlayerId()
        });
    }
    logAuditEvent('X1_MATCH', 'Resultado do duelo X1 registrado', {
        winnerId: resolvedWinner,
        loserId: resolvedLoser,
        localWinner
    });
}

function handleX1HitEvent(data = {}) {
    if (!IS_X1_MODE || !data.targetId) return;
    const entry = ensureX1PlayerState(data.targetId);
    if (!entry) return;
    if (typeof data.remaining === 'number') {
        entry.health = Math.max(0, data.remaining);
    } else {
        entry.health = Math.max(0, entry.health - (Number(data.damage) || 0));
    }
    entry.maxHealth = typeof data.maxHealth === 'number' ? data.maxHealth : entry.maxHealth;
    if (data.targetId === getLocalPlayerId()) {
        playerConfig.health = entry.health;
    }
    updateHUD();
}

function handleX1FinishEvent(data = {}) {
    if (!IS_X1_MODE || x1MatchState.winner) return;
    x1MatchState.winner = data.winnerId || null;
    const localWinner = x1MatchState.winner === getLocalPlayerId();
    const message = localWinner ? '🎯 Você venceu o duelo!' : '💀 Você foi derrotado no duelo.';
    showMessage(message, 2500);
    if (data.killLedger) {
        applyX1KillSnapshot(data.killLedger);
    } else if (data.winnerId) {
        incrementX1KillCount(data.winnerId);
    }
    logAuditEvent('X1_MATCH', 'Host informou término do duelo', {
        winnerId: data.winnerId,
        loserId: data.loserId,
        localWinner
    });
}

function handleX1RespawnEvent(data = {}) {
    if (!IS_X1_MODE || !data.playerId) return;
    if (coopRuntime.intent?.role === 'host') return;
    const phase = data.phase || 'scheduled';
    if (phase === 'scheduled') {
        const delayMs = data.delayMs || X1_RESPAWN_DELAY_MS;
        scheduleX1Respawn(data.message, delayMs, data.playerId, {
            broadcast: false,
            showMessage: data.playerId === getLocalPlayerId(),
            resetWinnerOnRespawn: data.resetWinnerOnRespawn !== false,
            winnerId: data.winnerId || null,
            awaitHostSignal: true
        });
        return;
    }
    if (phase === 'completed') {
        respawnX1Player(data.playerId, {
            broadcast: false,
            showRespawnMessage: data.playerId === getLocalPlayerId(),
            resetWinnerOnRespawn: data.resetWinnerOnRespawn !== false,
            winnerId: data.winnerId || null,
            respawnCompleteMessage: data.respawnCompleteMessage || null
        });
        if (typeof data.health === 'number') {
            const entry = ensureX1PlayerState(data.playerId);
            entry.health = data.health;
            entry.maxHealth = typeof data.maxHealth === 'number' ? data.maxHealth : entry.maxHealth;
            if (data.playerId === getLocalPlayerId()) {
                playerConfig.health = entry.health;
                playerConfig.maxHealth = entry.maxHealth;
                updateHUD();
            }
        }
    }
}

function attemptPointerLock() {
    if (!renderer || !renderer.domElement) return false;
    try {
        if (document.pointerLockElement !== renderer.domElement) {
            renderer.domElement.requestPointerLock();
        }
        return true;
    } catch (error) {
        console.warn('Pointer lock indisponível:', error);
        return false;
    }
}

function maybeStartGameplay() {
    if (pointerLocked && mapLoaded && !gameStarted) {
        gameStarted = true;
        startRound();
    }
}

function setupStartButton() {
    const startBtn = document.getElementById('startButton');
    if (!startBtn) return;

    const handleStartClick = async () => {
        if (startBtn.disabled) return;
        logAuditEvent('SESSION', 'Botão de iniciar acionado', {
            usingCustomMap: Boolean(customMapData)
        });

        // Solicitar captura do mouse imediatamente para manter o gesto do usuário
        const lockRequested = attemptPointerLock();
        if (!lockRequested) {
            alert('Clique dentro da janela e permita o uso do mouse para iniciar o jogo.');
            logAuditEvent('POINTER_LOCK', 'Browser bloqueou pointer lock ao iniciar', {
                reason: 'requestFailed'
            }, { level: 'warn', dedupeKey: 'pointer-lock:request-failed' });
            return;
        }

        startBtn.disabled = true;
        document.getElementById('startScreen').style.display = 'none';
        mapLoaded = false;

        try {
            await createMap();
            logAuditEvent('SESSION', 'Mapa carregado após clique em iniciar', {
                usingCustomMap: Boolean(customMapData)
            });
        } catch (error) {
            console.error('Erro ao gerar mapa:', error);
            alert('Falha ao carregar o mapa. Veja o console para detalhes.');
            mapLoaded = false;
            startBtn.disabled = false;
            document.getElementById('startScreen').style.display = 'flex';
            logAuditEvent('SESSION', 'Falha ao gerar mapa no início da partida', {
                error: error.message || String(error)
            }, { level: 'error', dedupeKey: 'start:map-failure' });
            return;
        }

        // Iniciar música se houver
        if (backgroundMusic) {
            backgroundMusic.play().catch(e => console.log("Erro ao tocar música:", e));
        }

        maybeStartGameplay();
    };

    startBtn.addEventListener('click', handleStartClick);

    document.addEventListener('pointerlockchange', () => {
        pointerLocked = renderer && renderer.domElement
            ? document.pointerLockElement === renderer.domElement
            : false;
        if (!pointerLocked) {
            isAiming = false;
            logAuditEvent('POINTER_LOCK', 'Pointer lock perdido durante a sessão', {}, {
                level: 'warn',
                dedupeKey: 'pointer-lock:lost',
                debounceMs: 8000
            });
        } else {
            logAuditEvent('POINTER_LOCK', 'Pointer lock concedido', {}, {
                dedupeKey: 'pointer-lock:granted',
                debounceMs: 8000
            });
        }
        maybeStartGameplay();
    });

    document.addEventListener('pointerlockerror', () => {
        alert('Não foi possível capturar o mouse. Clique novamente no botão e aceite o pedido do navegador.');
        startBtn.disabled = false;
        document.getElementById('startScreen').style.display = 'flex';
        logAuditEvent('POINTER_LOCK', 'Erro do navegador ao tentar pointer lock', {}, {
            level: 'warn',
            dedupeKey: 'pointer-lock:error'
        });
    });
}

async function loadCustomTexture(textureUrl) {
    if (textureCache[textureUrl]) {
        return textureCache[textureUrl];
    }

    return new Promise((resolve, reject) => {
        textureLoader.load(
            textureUrl,
            (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(1, 1);

                textureCache[textureUrl] = texture;
                resolve(texture);
            },
            undefined,
            (error) => {
                console.error('Erro ao carregar textura:', error);
                reject(error);
            }
        );
    });
}

/**
 * Cria material com textura personalizada
 */
async function createMaterialWithTexture(objData) {
    const baseColor = parseInt(objData.color);

    if (objData.texture) {
        try {
            const texture = await loadCustomTexture(objData.texture);

            return new THREE.MeshStandardMaterial({
                map: texture,
                color: 0xffffff,
                roughness: objData.roughness || 0.7,
                metalness: objData.metalness || 0.1
            });
        } catch (error) {
            console.warn('Falha ao carregar textura, usando cor sólida');
            return new THREE.MeshStandardMaterial({
                color: baseColor,
                roughness: 0.7
            });
        }
    }

    return new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: objData.roughness || 0.7,
        metalness: objData.metalness || 0.1
    });
}

async function createMap() {
    collidableObjects = [];
    wallMeshes = [];
    enemies = [];
    lootItems = [];
    lootIdCounter = 0; // Reset contador de loots
    mapEnemySpawns = [];
    enemyRegistry.clear();
    clearRemoteEnemyReplicas();

    if (customMapData) {
        // Atualizar cor do céu
        if (customMapData.skyColor) {
            const skyColor = parseInt(customMapData.skyColor);
            scene.background = new THREE.Color(skyColor);
            scene.fog = new THREE.Fog(skyColor, 10, 150);
        }

        // Carregar configurações do mapa v2.0
        if (customMapData.config) {
            maxRounds = customMapData.config.totalRounds || 50;
            baseEnemiesPerRound = customMapData.config.enemiesPerRound || 5;
            enemyIncrement = customMapData.config.enemyIncrement || 2;

            // Aplicar dificuldade
            const difficultyMultipliers = {
                easy: 0.7,
                normal: 1.0,
                hard: 1.5,
                extreme: 2.0
            };
            const diffMult = difficultyMultipliers[customMapData.config.difficulty] || 1.0;
            baseEnemiesPerRound = Math.ceil(baseEnemiesPerRound * diffMult);
            enemyIncrement = Math.ceil(enemyIncrement * diffMult);

            // Carregar música de fundo
            if (customMapData.config.musicData) {
                if (backgroundMusic) {
                    backgroundMusic.pause();
                    backgroundMusic = null;
                }
                const audio = new Audio(customMapData.config.musicData);
                audio.loop = true;
                audio.volume = 0.3;
                backgroundMusic = audio;
                console.log(`🎵 Música carregada: ${customMapData.config.musicName}`);
            }
        }

        // Carregar spawns de inimigos customizados
        if (customMapData.enemySpawns) {
            mapEnemySpawns = customMapData.enemySpawns;
            console.log(`👾 ${mapEnemySpawns.length} spawns de inimigos carregados`);
        }

        // Criar objetos com texturas personalizadas
        for (const objData of customMapData.objects) {
            const geo = new THREE.BoxGeometry(objData.width, objData.height, objData.depth);

            // Criar material (com ou sem textura)
            const mat = await createMaterialWithTexture(objData);

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(objData.position.x, objData.position.y, objData.position.z);
            mesh.castShadow = mesh.receiveShadow = true;

            // Adicionar rotação se especificada
            if (objData.rotation) {
                mesh.rotation.set(
                    objData.rotation.x || 0,
                    objData.rotation.y || 0,
                    objData.rotation.z || 0
                );
            }

            scene.add(mesh);
            collidableObjects.push(new THREE.Box3().setFromObject(mesh));
            wallMeshes.push(mesh);
        }

        console.log(`✅ Mapa carregado: ${customMapData.objects.length} objetos, ${maxRounds} rounds, ${mapEnemySpawns.length} spawns`);
    } else if (IS_X1_MODE) {
        createX1Arena();
    } else {
        createDefaultMap();
    }

    mapLoaded = true;
    maybeStartGameplay();
}


function createX1Arena() {
    const arenaSize = 70;
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0f1115, metalness: 0.1, roughness: 0.85 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(arenaSize, 1, arenaSize), floorMat);
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    scene.add(floor);
    collidableObjects.push(new THREE.Box3().setFromObject(floor));
    wallMeshes.push(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x192642, emissive: 0x071427, emissiveIntensity: 0.35 });
    const wallThickness = 1.5;
    const wallHeight = 6;
    const wallSegments = [
        { x: 0, z: arenaSize / 2, w: arenaSize, d: wallThickness },
        { x: 0, z: -arenaSize / 2, w: arenaSize, d: wallThickness },
        { x: arenaSize / 2, z: 0, w: wallThickness, d: arenaSize },
        { x: -arenaSize / 2, z: 0, w: wallThickness, d: arenaSize }
    ];
    wallSegments.forEach(segment => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(segment.w, wallHeight, segment.d), wallMat);
        wall.position.set(segment.x, wallHeight / 2, segment.z);
        wall.castShadow = wall.receiveShadow = true;
        scene.add(wall);
        collidableObjects.push(new THREE.Box3().setFromObject(wall));
        wallMeshes.push(wall);
    });

    const coverMat = new THREE.MeshStandardMaterial({ color: 0x3a4f7a, roughness: 0.4, metalness: 0.2 });
    const coverLayout = [
        { x: -18, z: 0, w: 6, h: 3, d: 12 },
        { x: 18, z: 0, w: 6, h: 3, d: 12 },
        { x: 0, z: -15, w: 10, h: 4, d: 4 },
        { x: 0, z: 15, w: 10, h: 4, d: 4 },
        { x: -8, z: -22, w: 4, h: 3, d: 6 },
        { x: 8, z: 22, w: 4, h: 3, d: 6 }
    ];
    coverLayout.forEach(cover => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(cover.w, cover.h, cover.d), coverMat);
        mesh.position.set(cover.x, cover.h / 2, cover.z);
        mesh.castShadow = mesh.receiveShadow = true;
        scene.add(mesh);
        collidableObjects.push(new THREE.Box3().setFromObject(mesh));
        wallMeshes.push(mesh);
    });

    const light = new THREE.PointLight(0x00c6ff, 0.4, 200);
    light.position.set(0, 12, 0);
    scene.add(light);
    const ambient = new THREE.HemisphereLight(0x1f3b68, 0x060606, 0.6);
    scene.add(ambient);

    x1MatchState.arenaLoaded = true;
}

function createDefaultMap() {
    const groundGeo = new THREE.BoxGeometry(150, 1, 150);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d5016, roughness: 0.8 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);
    collidableObjects.push(new THREE.Box3().setFromObject(ground));
    wallMeshes.push(ground);

    const gridHelper = new THREE.GridHelper(150, 30, 0x000000, 0x444444);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    const geometries = [
        { x: 20, z: 20, w: 10, h: 2, d: 10 }, { x: -20, z: 20, w: 10, h: 2, d: 10 },
        { x: 20, z: -20, w: 10, h: 2, d: 10 }, { x: -20, z: -20, w: 10, h: 2, d: 10 },
        { x: 0, z: 30, w: 8, h: 3, d: 8 }, { x: 0, z: -30, w: 8, h: 3, d: 8 },
        { x: 30, z: 0, w: 8, h: 3, d: 8 }, { x: -30, z: 0, w: 8, h: 3, d: 8 },
        { x: 0, z: 75, w: 150, h: 5, d: 1 }, { x: 0, z: -75, w: 150, h: 5, d: 1 },
        { x: 75, z: 0, w: 1, h: 5, d: 150 }, { x: -75, z: 0, w: 1, h: 5, d: 150 }
    ];

    const platformMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.7 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8 });

    geometries.forEach(g => {
        const isWall = g.w === 1 || g.d === 1;
        const geo = new THREE.BoxGeometry(g.w, g.h, g.d);
        const mesh = new THREE.Mesh(geo, isWall ? wallMat : platformMat);
        mesh.position.set(g.x, g.h / 2, g.z);
        mesh.castShadow = mesh.receiveShadow = true;
        scene.add(mesh);
        collidableObjects.push(new THREE.Box3().setFromObject(mesh));
        wallMeshes.push(mesh);
    });

    const boxMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 });
    for (let i = 0; i < 15; i++) {
        const size = Math.random() * 1.5 + 1;
        const box = new THREE.Mesh(new THREE.BoxGeometry(size, size * 2, size), boxMat);
        box.position.set((Math.random() - 0.5) * 120, size, (Math.random() - 0.5) * 120);
        box.castShadow = box.receiveShadow = true;
        scene.add(box);
        collidableObjects.push(new THREE.Box3().setFromObject(box));
        wallMeshes.push(box);
    }
}

function spawnLoot(type, position, options = {}) {
    if (IS_X1_MODE) return null;
    const { lootId = null, replica = false } = options;
    let lootMesh;
    if (type === 'health') {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 });
        group.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), mat));
        group.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.3), mat));
        lootMesh = group;
    } else if (type === 'ammo') {
        lootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x8b7355, emissive: 0xffff00, emissiveIntensity: 0.3 }));
    } else if (type === 'upgrade') {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.6 });
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.6, 3), mat);
        tip.position.y = 0.5;
        tip.rotation.x = Math.PI;
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), mat);
        shaft.position.y = -0.2;
        group.add(tip);
        group.add(shaft);
        lootMesh = group;
    } else {
        const colors = { rifle: 0x00ff00, shotgun: 0xffa500, bazooka: 0xff00ff };
        lootMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: colors[type], emissive: colors[type], emissiveIntensity: 0.4 }));
    }
    lootMesh.position.copy(position);

    // Ajuste de altura para evitar spawn no chão em mapas customizados
    // Se a posição Y for muito baixa (perto de 0), subimos um pouco
    if (customMapData && lootMesh.position.y < 0.5) {
        lootMesh.position.y += 1.0;
    }

    lootMesh.userData = {
        id: lootId || `loot-${++lootIdCounter}`,
        type,
        rotation: 0,
        replica
    };
    lootMesh.castShadow = true;
    scene.add(lootMesh);
    lootItems.push(lootMesh);
    return lootMesh;
}

function spawnEnemy(position, isRanged = false, options = {}) {
    const { enemyId = null, replica = false, skipTracking = false } = options;
    const enemyGroup = new THREE.Group();
    const color = isRanged ? 0xffa500 : 0xff0000;
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 1), mat);
    body.position.y = 0.9;
    body.castShadow = true;
    body.userData.isHead = false;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat);
    head.position.y = 2.1;
    head.castShadow = true;
    head.userData.isHead = true;
    enemyGroup.add(body);
    enemyGroup.add(head);
    enemyGroup.position.copy(position);

    // Balanceamento de inimigos
    const baseDamage = isRanged ? 15 : 20;
    const maxDamage = 30;
    let damage = baseDamage + currentRound * 2;
    if (damage > maxDamage) damage = maxDamage;

    enemyGroup.userData = {
        id: enemyId || `enemy-${++enemyIdCounter}`,
        health: isRanged ? 40 + currentRound * 8 : 50 + currentRound * 10,
        maxHealth: isRanged ? 40 + currentRound * 8 : 50 + currentRound * 10,
        speed: isRanged ? 3.0 + currentRound * 0.2 : 3.5 + currentRound * 0.25,
        damage: damage,
        lastAttack: 0,
        attackCooldown: 2000, // 2 segundos fixo
        isRanged,
        velocity: new THREE.Vector3(),
        onGround: false,
        replica
    };
    scene.add(enemyGroup);
    if (!replica) {
        enemyRegistry.set(enemyGroup.userData.id, enemyGroup);
    }
    if (!skipTracking) {
        enemies.push(enemyGroup);
    }
    return enemyGroup;
}

function startRound() {
    if (isChecking || !mapLoaded) return;
    if (IS_X1_MODE) {
        startX1Match();
        isChecking = false;
        return;
    }
    if (coopRuntime.intent?.role === 'client') {
        // Clientes aguardam o host transmitir o estado do round.
        return;
    }
    isChecking = true;

    // Verificar se atingiu o máximo de rounds
    if (currentRound > maxRounds) {
        showMessage(`🏆 VOCÊ VENCEU! Completou todos os ${maxRounds} rounds!`, 5000);
        setTimeout(() => gameOver(), 5000);
        isChecking = false;
        logAuditEvent('SURVIVAL_ROUND', 'Final da campanha de sobrevivência alcançado', {
            maxRounds
        });
        return;
    }

    // Determinar spawns customizados ou padrão
    const customSpawns = mapEnemySpawns.filter(s => s.round === currentRound);
    const spawnedEnemies = [];
    let total = 0;

    if (customSpawns.length > 0) {
        total = customSpawns.length;
        customSpawns.forEach(spawn => {
            const isRanged = spawn.type === 'ranged';
            const pos = new THREE.Vector3(spawn.position.x, spawn.position.y, spawn.position.z);
            spawnEnemy(pos, isRanged);
            spawnedEnemies.push(pos);
        });
    } else {
        const maxHeight = collidableObjects.reduce((max, box) => Math.max(max, box.max.y), 5);
        total = baseEnemiesPerRound + (currentRound - 1) * enemyIncrement;
        for (let i = 0; i < total; i++) {
            const angle = (i / total) * Math.PI * 2;
            const radius = 35 + Math.random() * 10;
            const pos = new THREE.Vector3(
                Math.cos(angle) * radius,
                maxHeight + 2,
                Math.sin(angle) * radius
            );
            const isRanged = currentRound >= 3 && Math.random() < 0.3;
            spawnEnemy(pos, isRanged);
            spawnedEnemies.push(pos);
        }
    }

    enemiesRemaining = total;
    document.getElementById('round').textContent = `ROUND ${currentRound}/${maxRounds}`;
    logAuditEvent('SURVIVAL_ROUND', 'Novo round iniciado', {
        round: currentRound,
        maxRounds,
        enemies: total,
        spawnStrategy: customSpawns.length > 0 ? 'custom' : 'auto'
    });

    // Mostrar escolha de arma bloqueada apenas no modo sobrevivência (este arquivo) a cada 3 rounds
    const lockedWeapons = Object.keys(playerConfig.weapons).filter(w => !playerConfig.weapons[w].unlocked && w !== 'pistol');
    if (
        lockedWeapons.length > 0 &&
        currentRound >= UNLOCK_INTERVAL &&
        currentRound % UNLOCK_INTERVAL === 0 &&
        lastUnlockRoundServed !== currentRound
    ) {
        lastUnlockRoundServed = currentRound;
        showWeaponUnlockMenu();
        sendCoopEvent('weapon-offer', { round: currentRound });
    }

    // Loot de sobrevivência não entrega armas diretamente
    const lootPool = ['health', 'ammo', 'upgrade', 'upgrade'];

    const maxHeightForLoot = collidableObjects.reduce((max, box) => Math.max(max, box.max.y), 5);
    for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 15 + Math.random() * 30;
        const pos = new THREE.Vector3(
            Math.cos(angle) * radius,
            maxHeightForLoot + 0.5,
            Math.sin(angle) * radius
        );
        const lootType = lootPool[Math.floor(Math.random() * lootPool.length)];
        spawnLoot(lootType, pos);
    }

    console.assert(
        enemiesRemaining === total,
        'Inconsistência de round: quantidade de inimigos não bate',
        { round: currentRound, esperado: total, restante: enemiesRemaining, spawns: spawnedEnemies.length }
    );

    showMessage(`ROUND ${currentRound}!`, 2000);
    updateHUD();
    isChecking = false;
}

function setupControls() {
    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (e.key === '1') switchWeapon('pistol');
        if (e.key === '2') switchWeapon('smg');
        if (e.key === '3') switchWeapon('rifle');
        if (e.key === '4') switchWeapon('sniper');
        if (e.key === '5') switchWeapon('shotgun');
        if (e.key === '6') switchWeapon('bazooka');
        if (e.key.toLowerCase() === 'r') reload();
        if (e.key.toLowerCase() === 'z') toggleUpgradeMenu();
        if (e.key.toLowerCase() === 'e') pickupLoot();
        if (e.key.toLowerCase() === 'm') {
            e.preventDefault();
            if (gameStarted && pointerLocked) {
                document.getElementById('mainMenu').style.display === 'block' ? closeMainMenu() : openMainMenu();
            }
        }
    });
    document.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);
    document.addEventListener('mousemove', (e) => {
        if (!pointerLocked) return;
        // Aplicar movimento diretamente aos targets para suavização
        const sensitivity = getCurrentMouseSensitivity();
        targetYaw -= e.movementX * sensitivity;

        // Se o jogador mover o mouse para baixo (compensando recuo), reduzir o recuo acumulado
        if (e.movementY > 0 && recoilState.pitch > 0) {
            recoilState.pitch = Math.max(0, recoilState.pitch - e.movementY * sensitivity * 2);
        }

        targetPitch -= e.movementY * sensitivity;
        targetPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetPitch));
    });
    document.addEventListener('mousedown', (e) => {
        if (gameStarted && pointerLocked && e.button === 0 && document.getElementById('upgradeMenu').style.display !== 'block' && document.getElementById('mainMenu').style.display !== 'block') {
            playerConfig.isShooting = true;
            recoilState.sustainedFireMultiplier = 0.6;
            shoot();
        }
    });
    document.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            playerConfig.isShooting = false;
            recoilState.sustainedFireMultiplier = 0.6;
        }
    });

    // Upgrade buttons - mapeamento correto para cada botão específico
    document.getElementById('btnPistolDmg')?.addEventListener('click', () => upgradeWeapon('pistolDamage'));
    document.getElementById('btnSmgDmg')?.addEventListener('click', () => upgradeWeapon('smgDamage'));
    document.getElementById('btnSmgSpeed')?.addEventListener('click', () => upgradeWeapon('smgSpeed'));
    document.getElementById('btnRifleDmg')?.addEventListener('click', () => upgradeWeapon('rifleDamage'));
    document.getElementById('btnRifleSpeed')?.addEventListener('click', () => upgradeWeapon('rifleSpeed'));
    document.getElementById('btnSniperDmg')?.addEventListener('click', () => upgradeWeapon('sniperDamage'));
    document.getElementById('btnShotgunDmg')?.addEventListener('click', () => upgradeWeapon('shotgunDamage'));
    document.getElementById('btnShotgunPellets')?.addEventListener('click', () => upgradeWeapon('shotgunPellets'));
    document.getElementById('btnBazookaDmg')?.addEventListener('click', () => upgradeWeapon('bazookaDamage'));
    document.getElementById('btnBazookaRadius')?.addEventListener('click', () => upgradeWeapon('bazookaRadius'));
    document.getElementById('btnAmmoCap')?.addEventListener('click', () => upgradeWeapon('ammoCapacity'));
    document.getElementById('btnSpeed')?.addEventListener('click', () => upgradeWeapon('moveSpeed'));

    ['SuperPistol', 'SuperRifleSpeed', 'SuperAmmo', 'SuperSpeed', 'SuperRegen', 'SuperShotgun', 'SuperBazooka'].forEach((id, i) => {
        const btn = document.getElementById('btn' + id);
        if (btn) btn.addEventListener('click', () => buySuperUpgrade(SUPER_UPGRADE_KEYS[i]));
    });

    document.getElementById('closeUpgrade').addEventListener('click', toggleUpgradeMenu);
    document.getElementById('tabNormal').addEventListener('click', () => switchTab('normal'));
    document.getElementById('tabSuper').addEventListener('click', () => switchTab('super'));

    // Menu principal
    document.getElementById('btnResume').addEventListener('click', closeMainMenu);
    document.getElementById('btnGraphics').addEventListener('click', () => switchMenuSection('graphics'));
    document.getElementById('btnCrosshair').addEventListener('click', () => switchMenuSection('crosshair'));
    document.getElementById('btnSensitivity').addEventListener('click', () => {
        syncSensitivityControls();
        switchMenuSection('sensitivity');
    });
    document.getElementById('btnChangeMap').addEventListener('click', () => location.reload());
    document.getElementById('btnRestart').addEventListener('click', () => {
        gameStarted = false;
        location.reload();
    });
    document.getElementById('btnQuit').addEventListener('click', async () => {
        if (confirm('Deseja sair do jogo?')) {
            // Salvar estatísticas antes de sair
            if (gameStarted && typeof checkAuthentication !== 'undefined' && checkAuthentication() && typeof currentSessionId !== 'undefined' && currentSessionId) {
                try {
                    await saveHighScore(currentRound, calculateScore(), sessionStats.kills);
                    await endGameSession(currentRound, calculateScore());
                    await saveWeaponStats();
                } catch (e) {
                    console.warn('Erro ao salvar stats ao sair:', e);
                }
            }
            // Voltar para tela de login
            window.location.href = 'index.html';
        }
    });
    document.getElementById('toggleShadows').addEventListener('change', toggleGraphics);
    document.getElementById('crosshairSize').addEventListener('input', (e) => {
        document.getElementById('sizeValue').textContent = e.target.value;
        updateCrosshairPreview();
    });
    document.getElementById('crosshairThickness').addEventListener('input', (e) => {
        document.getElementById('thicknessValue').textContent = e.target.value;
        updateCrosshairPreview();
    });
    document.getElementById('crosshairOpacity').addEventListener('input', (e) => {
        document.getElementById('opacityValue').textContent = e.target.value;
        updateCrosshairPreview();
    });
    document.getElementById('crosshairColor').addEventListener('input', updateCrosshairPreview);

    const hipfireSlider = document.getElementById('hipfireSensitivity');
    const adsSlider = document.getElementById('adsSensitivity');
    if (hipfireSlider) {
        hipfireSlider.addEventListener('input', (e) => {
            mouseSensitivityHipfire = parseFloat(e.target.value) / 1000;
            updateSensitivityLabels();
        });
    }
    if (adsSlider) {
        adsSlider.addEventListener('input', (e) => {
            mouseSensitivityAds = parseFloat(e.target.value) / 1000;
            updateSensitivityLabels();
        });
    }
    updateSensitivityLabels();
}

function updateCrosshairPreview() {
    const size = parseInt(document.getElementById('crosshairSize').value);
    const thickness = parseInt(document.getElementById('crosshairThickness').value);
    const opacity = parseFloat(document.getElementById('crosshairOpacity').value);
    const color = document.getElementById('crosshairColor').value;

    const preview = document.getElementById('crosshairPreview');
    const h = preview.querySelector('.crosshair-h');
    const v = preview.querySelector('.crosshair-v');
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${opacity})` : `rgba(255, 255, 255, ${opacity})`;
    };

    // Centralizar usando transform
    h.style.width = size + 'px';
    h.style.height = thickness + 'px';
    h.style.top = '50%';
    h.style.left = '50%';
    h.style.transform = 'translate(-50%, -50%)';
    h.style.background = hexToRgb(color);

    v.style.width = thickness + 'px';
    v.style.height = size + 'px';
    v.style.top = '50%';
    v.style.left = '50%';
    v.style.transform = 'translate(-50%, -50%)';
    v.style.background = hexToRgb(color);
}

function switchMenuSection(section) {
    document.querySelectorAll('#mainMenu .menu-section').forEach(el => el.classList.remove('active'));
    if (section === 'main') document.getElementById('menuMain').classList.add('active');
    else if (section === 'graphics') document.getElementById('menuGraphics').classList.add('active');
    else if (section === 'crosshair') document.getElementById('menuCrosshair').classList.add('active');
    else if (section === 'sensitivity') {
        document.getElementById('menuSensitivity').classList.add('active');
        syncSensitivityControls();
    }
}

function openMainMenu() {
    const menu = document.getElementById('mainMenu');
    if (menu) {
        menu.style.display = 'block';
        switchMenuSection('main');
    }
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }

    // Pausar música
    if (backgroundMusic && !backgroundMusic.paused) {
        backgroundMusic.pause();
    }
}

function closeMainMenu() {
    const menu = document.getElementById('mainMenu');
    if (menu) menu.style.display = 'none';
    if (gameStarted && !document.pointerLockElement && renderer && renderer.domElement) {
        setTimeout(() => renderer.domElement.requestPointerLock(), 100);
    }

    // Retomar música
    if (backgroundMusic && backgroundMusic.paused && gameStarted) {
        backgroundMusic.play().catch(e => console.log('Erro ao reproduzir música:', e));
    }
}

function applyCrosshairSettings() {
    const size = parseInt(document.getElementById('crosshairSize').value);
    const thickness = parseInt(document.getElementById('crosshairThickness').value);
    const opacity = parseFloat(document.getElementById('crosshairOpacity').value);
    const color = document.getElementById('crosshairColor').value;

    crosshairSettings = { size, thickness, opacity, color };
    updateCrosshairVisuals();
    showMessage('Crosshair atualizado!', 1000);
    switchMenuSection('main'); // Voltar para o menu principal
}

function updateCrosshairVisuals() {
    const crosshair = document.getElementById('crosshair');
    const h = crosshair.querySelector('.crosshair-h');
    const v = crosshair.querySelector('.crosshair-v');

    crosshair.style.width = crosshairSettings.size + 'px';
    crosshair.style.height = crosshairSettings.size + 'px';

    // Centralizar linhas dentro do container do crosshair
    h.style.width = crosshairSettings.size + 'px';
    h.style.height = crosshairSettings.thickness + 'px';
    h.style.top = '50%';
    h.style.left = '50%';
    h.style.transform = 'translate(-50%, -50%)';
    h.style.background = hexToRgb(crosshairSettings.color); // Usar função auxiliar se disponível ou recalcular

    v.style.width = crosshairSettings.thickness + 'px';
    v.style.height = crosshairSettings.size + 'px';
    v.style.top = '50%';
    v.style.left = '50%';
    v.style.transform = 'translate(-50%, -50%)';
    v.style.background = hexToRgb(crosshairSettings.color);

    // Atualizar função hexToRgb localmente se necessário, ou garantir que as linhas usem a cor correta
    const lines = crosshair.querySelectorAll('.crosshair-line');
    const rgbColor = hexToRgb(crosshairSettings.color);
    lines.forEach(line => line.style.background = rgbColor);
}

// Função auxiliar para converter hex para rgb com opacidade (reutilizada)
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${crosshairSettings.opacity})` : `rgba(255, 255, 255, ${crosshairSettings.opacity})`;
}

function toggleGraphics() {
    graphicsQuality.shadows = !graphicsQuality.shadows;
    renderer.shadowMap.enabled = graphicsQuality.shadows;
    document.getElementById('toggleShadows').checked = graphicsQuality.shadows;
    showMessage(graphicsQuality.shadows ? 'Sombras ATIVADAS' : 'Sombras DESATIVADAS', 1000);
}

function switchTab(tab) {
    document.getElementById('tabNormal').classList.toggle('active', tab === 'normal');
    document.getElementById('tabSuper').classList.toggle('active', tab === 'super');
    document.getElementById('normalUpgrades').classList.toggle('active', tab === 'normal');
    document.getElementById('superUpgrades').classList.toggle('active', tab === 'super');
}

function updatePlayer(delta) {
    const upgrades = getLocalUpgradeLevels();
    const superUpgrades = getLocalSuperUpgrades();
    if (!playerConfig.isRespawning) {
        const moveDir = new THREE.Vector3();
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() === 0) forward.set(0, 0, -1);
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        if (keys['w']) moveDir.add(forward);
        if (keys['s']) moveDir.sub(forward);
        if (keys['a']) moveDir.sub(right);
        if (keys['d']) moveDir.add(right);

        let speed = playerConfig.speed + upgrades.moveSpeed * 0.8;
        if (superUpgrades.superSpeed) speed *= 2;
        if (moveDir.lengthSq() > 0) {
            moveDir.normalize();
            playerConfig.velocity.x = moveDir.x * speed;
            playerConfig.velocity.z = moveDir.z * speed;
        } else {
            playerConfig.velocity.x = 0;
            playerConfig.velocity.z = 0;
        }

        playerConfig.velocity.y -= playerConfig.gravity * delta;
        if (keys[' '] && playerConfig.onGround) {
            playerConfig.velocity.y = playerConfig.jumpPower;
            playerConfig.onGround = false;
            hasJumped = false;
        } else if (keys[' '] && superUpgrades.superSpeed && !hasJumped && !playerConfig.onGround) {
            playerConfig.velocity.y = playerConfig.jumpPower;
            hasJumped = true;
        }

        const displacement = playerConfig.velocity.clone().multiplyScalar(delta);

        // Sub-stepping para evitar atravessar paredes (tunneling)
        const steps = Math.ceil(displacement.length() / 0.2); // 0.2 é um tamanho seguro menor que o raio
        const stepDisplacement = displacement.clone().divideScalar(steps);

        for (let i = 0; i < steps; i++) {
            playerConfig.position.add(stepDisplacement);
            playerConfig.onGround = false;

            const playerBox = new THREE.Box3().setFromCenterAndSize(
                playerConfig.position.clone(),
                new THREE.Vector3(playerConfig.radius * 2, playerConfig.height, playerConfig.radius * 2)
            );

            collidableObjects.forEach(box => {
                if (!playerBox.intersectsBox(box)) return;
                const intersection = playerBox.clone().intersect(box);
                const pen = new THREE.Vector3();
                intersection.getSize(pen);
                const center = box.getCenter(new THREE.Vector3());
                if (pen.x < pen.y && pen.x < pen.z) {
                    playerConfig.position.x += pen.x * Math.sign(playerConfig.position.x - center.x);
                    playerConfig.velocity.x = 0;
                } else if (pen.y < pen.z) {
                    const sign = Math.sign(playerConfig.position.y - center.y);
                    playerConfig.position.y += pen.y * sign;
                    if (sign > 0) {
                        playerConfig.onGround = true;
                        hasJumped = false;
                    }
                    playerConfig.velocity.y = 0;
                } else {
                    playerConfig.position.z += pen.z * Math.sign(playerConfig.position.z - center.z);
                    playerConfig.velocity.z = 0;
                }
                // Atualizar box para próxima verificação
                playerBox.setFromCenterAndSize(
                    playerConfig.position.clone(),
                    new THREE.Vector3(playerConfig.radius * 2, playerConfig.height, playerConfig.radius * 2)
                );
            });
        }
    } else {
        playerConfig.velocity.set(0, 0, 0);
        playerConfig.onGround = true;
    }

    recoilState.pitch *= recoilConfig.dampening;
    recoilState.yaw *= recoilConfig.dampening;
    targetPitch -= recoilState.pitch * recoilConfig.recoverySpeed * delta;
    targetYaw -= recoilState.yaw * recoilConfig.recoverySpeed * delta;

    yaw += (targetYaw - yaw) * cameraSmoothing;
    pitch += (targetPitch - pitch) * cameraSmoothing;
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));

    camera.position.copy(playerConfig.position);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    const weapon = playerConfig.weapons[playerConfig.currentWeapon];
    if (weapon?.auto && playerConfig.isShooting) {
        recoilState.sustainedFireMultiplier += delta * recoilConfig.sustainedFireGrowth;
        recoilState.sustainedFireMultiplier = Math.min(recoilState.sustainedFireMultiplier, recoilConfig.maxSustainedFireMultiplier);
    }

    if (superUpgrades.superRegen && playerConfig.health < playerConfig.maxHealth) {
        playerConfig.health = Math.min(playerConfig.maxHealth, playerConfig.health + 5 * delta);
    }
}



function buildCoopThreatTargets() {
    const targets = [
        {
            playerId: getLocalPlayerId(),
            position: playerConfig.position.clone(),
            isLocal: true
        }
    ];
    if (coopRuntime.intent?.role === 'host' && remotePlayers.size) {
        remotePlayers.forEach(remote => {
            if (!remote?.group?.position || !remote.playerId) return;
            const combatState = getPlayerCombatState(remote.playerId);
            if (combatState && typeof combatState.health === 'number' && combatState.health <= 0) {
                return;
            }
            targets.push({
                playerId: remote.playerId,
                position: remote.group.position.clone(),
                isLocal: false
            });
        });
    }
    return targets;
}

function pickClosestTarget(origin, targets = []) {
    if (!origin || !targets.length) return null;
    let closest = null;
    let minDistance = Infinity;
    targets.forEach(target => {
        if (!target?.position) return;
        const dist = origin.distanceTo(target.position);
        if (dist < minDistance) {
            minDistance = dist;
            closest = { ...target, distance: dist };
        }
    });
    return closest;
}

function applyEnemyDamageToTarget(target, damage, meta = {}) {
    if (!target || damage <= 0) return;
    if (target.playerId === getLocalPlayerId()) {
        playerConfig.health = Math.max(0, playerConfig.health - damage);
        updatePlayerCombatState(target.playerId, {
            ...(getPlayerCombatState(target.playerId) || {}),
            playerId: target.playerId,
            health: playerConfig.health,
            maxHealth: playerConfig.maxHealth,
            lastHit: Date.now()
        });
        updateHUD();
        if (playerConfig.health <= 0) {
            // No modo X1, usar sistema de respawn com cooldown
            if (IS_X1_MODE) {
                scheduleX1Respawn('Você foi derrotado!', X1_RESPAWN_DELAY_MS, getLocalPlayerId(), {
                    showMessage: true,
                    broadcast: true
                });
            } else {
                gameOver();
            }
        }
        return;
    }
    if (coopRuntime.intent?.role !== 'host') return;
    const combatState = getPlayerCombatState(target.playerId) || {
        playerId: target.playerId,
        health: 100,
        maxHealth: 100
    };
    const previousHealth = typeof combatState.health === 'number'
        ? combatState.health
        : combatState.maxHealth || 100;
    const remaining = Math.max(0, previousHealth - damage);
    updatePlayerCombatState(target.playerId, {
        ...combatState,
        playerId: target.playerId,
        health: remaining,
        lastHit: Date.now()
    });
    sendCoopEvent('coop-player-hit', {
        targetId: target.playerId,
        damage,
        remaining,
        enemyId: meta.enemyId || null,
        attackType: meta.attackType || (meta.ranged ? 'ranged' : 'melee'),
        source: meta.source || 'enemy'
    });
}

function updateEnemies(delta) {
    if (coopRuntime.intent?.role === 'client') {
        updateRemoteEnemyVisuals(delta);
        return;
    }
    const now = Date.now();
    const targets = buildCoopThreatTargets();
    
    // Garantir que o mapa esteja carregado antes de mover inimigos
    if (!mapLoaded || collidableObjects.length === 0) return;
    
    enemies.forEach(enemy => {
        const d = enemy.userData;
        
        // Aplicar gravidade
        if (!d.onGround) {
            d.velocity.y -= playerConfig.gravity * delta;
            // Limitar velocidade de queda para evitar atravessar o chão
            d.velocity.y = Math.max(d.velocity.y, -50);
        }
        
        const preferredTarget = pickClosestTarget(enemy.position, targets) || {
            playerId: getLocalPlayerId(),
            position: playerConfig.position.clone(),
            distance: enemy.position.distanceTo(playerConfig.position)
        };
        const targetPos = preferredTarget.position.clone();
        const dist = preferredTarget.distance ?? enemy.position.distanceTo(targetPos);
        let moveDir = new THREE.Vector3();
        if (d.isRanged) {
            if (dist > 8) moveDir = targetPos.clone().sub(enemy.position).normalize();
            enemy.lookAt(targetPos);
        } else {
            if (dist > 1.5) {
                moveDir = targetPos.clone().sub(enemy.position).normalize();
                enemy.lookAt(targetPos);
            }
        }
        d.velocity.x = moveDir.x * d.speed;
        d.velocity.z = moveDir.z * d.speed;
        
        // Sub-stepping para evitar atravessar o chão (tunneling)
        const displacement = d.velocity.clone().multiplyScalar(delta);
        const steps = Math.max(1, Math.ceil(displacement.length() / 0.5));
        const stepDisplacement = displacement.clone().divideScalar(steps);
        
        for (let step = 0; step < steps; step++) {
            enemy.position.add(stepDisplacement);
            d.onGround = false;
            
            const enemyBox = new THREE.Box3().setFromCenterAndSize(
                enemy.position.clone().add(new THREE.Vector3(0, 1, 0)),
                new THREE.Vector3(1, 2, 1)
            );
            
            collidableObjects.forEach(box => {
                if (enemyBox.intersectsBox(box)) {
                    const intersection = enemyBox.clone().intersect(box);
                    const pen = new THREE.Vector3();
                    intersection.getSize(pen);
                    const center = box.getCenter(new THREE.Vector3());
                    
                    if (pen.x < pen.y && pen.x < pen.z) {
                        enemy.position.x += pen.x * Math.sign(enemy.position.x - center.x);
                        d.velocity.x = 0;
                    } else if (pen.y < pen.z) {
                        const sign = Math.sign(enemy.position.y - center.y);
                        enemy.position.y += pen.y * sign;
                        if (sign > 0) {
                            d.onGround = true;
                            d.velocity.y = 0;
                        } else {
                            d.velocity.y = 0;
                        }
                    } else {
                        enemy.position.z += pen.z * Math.sign(enemy.position.z - center.z);
                        d.velocity.z = 0;
                    }
                }
            });
        }
        
        // Floor clamping de segurança: garantir que inimigos nunca fiquem abaixo de Y=0
        if (enemy.position.y < 0) {
            enemy.position.y = 0.1;
            d.velocity.y = 0;
            d.onGround = true;
        }
        if (d.isRanged) {
            if (now - d.lastAttack > d.attackCooldown) {
                d.lastAttack = now;
                // Raycast from enemy to target so walls block shots
                const startPos = enemy.position.clone().add(new THREE.Vector3(0, 1.5, 0));
                const dirToPlayer = targetPos.clone().sub(startPos).normalize();
                const maxDist = startPos.distanceTo(targetPos);
                const ray = new THREE.Raycaster(startPos, dirToPlayer, 0, maxDist);
                const wallHits = ray.intersectObjects(wallMeshes, true);
                if (wallHits.length > 0 && wallHits[0].distance < maxDist) {
                    // wall blocks the shot
                    createTracer(startPos, wallHits[0].point, 0xff8800, true);
                } else {
                    createTracer(startPos, targetPos, 0xffa500, true);
                    if (dist < 8 && Math.random() < 0.01) {
                        applyEnemyDamageToTarget(preferredTarget, d.damage, {
                            enemyId: d.id,
                            ranged: true
                        });
                    }
                }
            }
        } else {
            if (dist < 2.5 && now - d.lastAttack > d.attackCooldown) {
                d.lastAttack = now;
                applyEnemyDamageToTarget(preferredTarget, d.damage, {
                    enemyId: d.id,
                    attackType: 'melee'
                });
            }
        }
    });
}

function updateLoot() {
    lootItems.forEach(loot => {
        loot.userData.rotation += 0.02;
        loot.rotation.y = loot.userData.rotation;
        loot.position.y = 1.5 + Math.sin(loot.userData.rotation * 2) * 0.2;
    });
}

function buildNameplateSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(0, 1.8, 0);
    sprite.scale.set(2.6, 0.65, 1);

    function updateLabel(labelText, color = '#ffffff') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 28px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.fillText(String(labelText || ''), canvas.width / 2, 42);
        texture.needsUpdate = true;
    }

    updateLabel(text);
    return { sprite, canvas, ctx, texture, material, update: updateLabel };
}

function createRemoteAvatarMesh(skin, displayName, playerId = null) {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(skin.body || DEFAULT_PLAYER_SKIN.body),
        roughness: 0.65,
        metalness: 0.15,
        emissive: new THREE.Color(0x000000)
    });
    const headMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(skin.head || DEFAULT_PLAYER_SKIN.head),
        roughness: 0.4,
        metalness: 0.2
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 1.4, 18), bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData = { isHead: false, playerId };
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 18), headMaterial);
    head.position.y = 1.0;
    head.castShadow = true;
    head.receiveShadow = true;
    head.userData = { isHead: true, playerId };
    const nameplate = buildNameplateSprite(displayName || 'Aliado');
    group.add(body);
    group.add(head);
    if (nameplate?.sprite) {
        group.add(nameplate.sprite);
    }
    group.visible = true;

    return {
        group,
        body,
        head,
        label: nameplate,
        skin,
        targetPosition: new THREE.Vector3(),
        targetYaw: 0,
        hasLiveState: false,
        lastStateAt: 0
    };
}

function ensureRemoteAvatar(playerId, data = {}) {
    if (!playerId || playerId === getLocalPlayerId()) return null;
    if (remotePlayers.has(playerId)) {
        const cached = remotePlayers.get(playerId);
        if (data.name) cached.name = data.name;
        cached.playerId = playerId;
        if (cached.body) {
            cached.body.userData = { ...(cached.body.userData || {}), playerId, isHead: false };
        }
        if (cached.head) {
            cached.head.userData = { ...(cached.head.userData || {}), playerId, isHead: true };
        }
        return cached;
    }
    if (!remotePlayersRoot && scene) {
        remotePlayersRoot = new THREE.Group();
        remotePlayersRoot.name = 'RemotePlayersRoot';
        scene.add(remotePlayersRoot);
    }
    if (!remotePlayersRoot) return null;
    const skin = normalizeRemoteSkin(data.skin || {});
    const avatar = createRemoteAvatarMesh(skin, data.name || playerId, playerId);
    avatar.playerId = playerId;
    avatar.name = data.name || playerId;
    avatar.group.position.copy(playerConfig.position.clone());
    avatar.targetPosition.copy(avatar.group.position);
    remotePlayersRoot.add(avatar.group);
    remotePlayers.set(playerId, avatar);
    return avatar;
}

function getRemotePlayerHitEntries() {
    const meshes = [];
    const lookup = new Map();
    remotePlayers.forEach(remote => {
        if (!remote?.group?.visible) return;
        if (remote.body) {
            meshes.push(remote.body);
            lookup.set(remote.body.uuid, { playerId: remote.playerId, isHead: false });
        }
        if (remote.head) {
            meshes.push(remote.head);
            lookup.set(remote.head.uuid, { playerId: remote.playerId, isHead: true });
        }
    });
    return { meshes, lookup };
}

function applyTextureToMesh(targetMesh, textureSource) {
    if (!targetMesh?.material) return;
    if (!textureSource) {
        if (targetMesh.material.map) {
            targetMesh.material.map = null;
            targetMesh.material.needsUpdate = true;
        }
        return;
    }
    if (remoteSkinTextureCache.has(textureSource)) {
        const cached = remoteSkinTextureCache.get(textureSource);
        if (cached) {
            targetMesh.material.map = cached;
            targetMesh.material.needsUpdate = true;
        }
        return;
    }
    textureLoader.load(textureSource,
        (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            remoteSkinTextureCache.set(textureSource, texture);
            targetMesh.material.map = texture;
            targetMesh.material.needsUpdate = true;
        },
        undefined,
        (error) => {
            console.warn('Falha ao carregar textura de skin remota', error);
            remoteSkinTextureCache.set(textureSource, null);
        }
    );
}

function applySkinToRemoteAvatar(remote, skin) {
    if (!remote) return;
    const normalized = normalizeRemoteSkin(skin);
    remote.skin = normalized;
    const playerKey = remote.playerId || remote.name;
    if (playerKey) {
        rememberPlayerSkin(playerKey, normalized, true);
    }
    if (remote.body?.material) {
        remote.body.material.color.set(normalized.body);
        applyTextureToMesh(remote.body, normalized.texture);
    }
    if (remote.head?.material) {
        remote.head.material.color.set(normalized.head);
        applyTextureToMesh(remote.head, normalized.texture);
    }
}

function updateRemoteNameplate(remote, data = {}) {
    if (!remote?.label?.update) return;
    const name = data.name || remote.name || 'Aliado';
    if (data.progression) {
        remote.progression = data.progression;
    } else if (!remote.progression) {
        const cached = getCachedProgressionForPlayer(remote.playerId);
        if (cached) {
            remote.progression = cached;
        }
    }
    const resolvedProgression = remote.progression;
    const pts = typeof resolvedProgression?.points === 'number' ? ` (${Math.floor(resolvedProgression.points)} pts)` : '';
    const hasSupers = countUnlockedSupers(resolvedProgression?.super);
    const accent = hasSupers ? '#00fff7' : '#ffffff';
    remote.label.update(name + pts, accent);
}

function applyUpgradeStyleToRemoteAvatar(remote, progression) {
    if (!remote || !progression) return;
    const moveUpgrades = progression.upgrades?.moveSpeed || 0;
    const scale = 1 + Math.min(moveUpgrades * 0.025, 0.5);
    remote.group.scale.set(scale, scale, scale);
}

function updateRemotePlayerVisuals(delta) {
    const lerpFactor = Math.min(1, delta * REMOTE_INTERP_SPEED);
    remotePlayers.forEach(remote => {
        if (!remote.group) return;
        remote.group.position.lerp(remote.targetPosition, lerpFactor);
        remote.group.rotation.y = THREE.MathUtils.lerp(remote.group.rotation.y, remote.targetYaw || 0, lerpFactor);
    });
}

function applyRemoteProgressionSnapshot(playerId, progression) {
    if (!playerId || !progression) return null;
    const normalized = normalizeProgressionPayload(playerId, progression);
    if (!normalized) return null;
    if (playerId !== getLocalPlayerId()) {
        playerProgressionLedger[playerId] = {
            playerId,
            points: normalized.points,
            upgrades: { ...normalized.upgrades },
            super: { ...normalized.super },
            lastUpdatedAt: normalized.timestamp
        };
    }
    return normalized;
}

function updateRemotePlayersFromState(playersState) {
    if (!playersState) return;
    const nowTs = Date.now();
    const localId = getLocalPlayerId();
    const entries = Array.isArray(playersState)
        ? playersState
        : Object.entries(playersState).map(([playerId, payload]) => ({ ...(payload || {}), playerId }));
    const updatedPlayers = new Set();
    entries.forEach(entry => {
        const playerId = entry.playerId || entry.name;
        if (!playerId || playerId === localId) return;
        updatedPlayers.add(playerId);
        const remote = ensureRemoteAvatar(playerId, entry);
        if (!remote) return;
        remote.lastStateAt = nowTs;
        if (Array.isArray(entry.position) && entry.position.length === 3) {
            remote.targetPosition.set(entry.position[0], entry.position[1], entry.position[2]);
            if (!remote.hasLiveState) {
                remote.group.position.copy(remote.targetPosition);
            }
            remote.hasLiveState = true;
        }
        if (entry.rotation && typeof entry.rotation.yaw === 'number') {
            remote.targetYaw = entry.rotation.yaw;
        }
        if (entry.skin) {
            applySkinToRemoteAvatar(remote, entry.skin);
        }
        if (entry.combat) {
            updatePlayerCombatState(playerId, entry.combat);
            remote.combat = entry.combat;
        }
        let progressionSnapshot = null;
        if (entry.progression) {
            progressionSnapshot = applyRemoteProgressionSnapshot(playerId, entry.progression);
        }
        if (!progressionSnapshot) {
            progressionSnapshot = getCachedProgressionForPlayer(playerId);
        }
        if (progressionSnapshot) {
            applyUpgradeStyleToRemoteAvatar(remote, progressionSnapshot);
        }
        updateRemoteNameplate(remote, { name: entry.name || remote.name, progression: progressionSnapshot });
    });
    remotePlayers.forEach((remote, key) => {
        if (updatedPlayers.has(key)) return;
        if (!remote.lastStateAt) return;
        if (nowTs - remote.lastStateAt > REMOTE_STATE_STALE_MS) {
            remote.hasLiveState = false;
        }
    });
    applyRemoteFallbackLayout();
}

function applyHostStatePayload(message) {
    if (!message?.payload) return;
    const statePayload = message.payload;
    updateRemotePlayersFromState(statePayload.players || statePayload);
    if (statePayload.enemies && coopRuntime.intent?.role === 'client') {
        syncRemoteEnemiesFromSnapshot(statePayload.enemies);
    }
    if (statePayload.loot && coopRuntime.intent?.role === 'client') {
        syncRemoteLootFromSnapshot(statePayload.loot);
    }
    if (statePayload.meta) {
        applyRemoteMetaState(statePayload.meta);
    }
}

function applyRemoteMetaState(meta = {}) {
    coopRuntime.remoteMeta = { ...meta, receivedAt: Date.now() };
    if (!coopRuntime.intent || coopRuntime.intent.role === 'host') return;
    if (typeof meta.round === 'number') {
        currentRound = meta.round;
    }
    if (typeof meta.round === 'number') {
        const roundEl = document.getElementById('round');
        if (roundEl) {
            roundEl.textContent = `ROUND ${meta.round}/${maxRounds}`;
        }
    }
    if (typeof meta.enemiesRemaining === 'number') {
        enemiesRemaining = meta.enemiesRemaining;
        const enemiesEl = document.getElementById('enemies');
        if (enemiesEl) {
            enemiesEl.textContent = `Inimigos: ${meta.enemiesRemaining}`;
        }
    }
}

function applyRemoteFallbackLayout() {
    if (!remotePlayers.size) return;
    const basePos = playerConfig?.position || new THREE.Vector3();
    let index = 0;
    remotePlayers.forEach(remote => {
        if (remote.hasLiveState) {
            index += 1;
            return;
        }
        const angle = (index / Math.max(1, remotePlayers.size)) * Math.PI * 2;
        remote.targetPosition.set(
            basePos.x + Math.cos(angle) * REMOTE_FALLBACK_RADIUS,
            basePos.y,
            basePos.z + Math.sin(angle) * REMOTE_FALLBACK_RADIUS
        );
        remote.group.position.copy(remote.targetPosition);
        remote.targetYaw = angle + Math.PI;
        index += 1;
    });
}

function ensureRemoteEnemyReplica(state) {
    if (!state?.id) return null;
    let replica = remoteEnemyReplicas.get(state.id);
    if (replica) {
        return replica;
    }
    const spawnPos = Array.isArray(state.position) && state.position.length === 3
        ? new THREE.Vector3(state.position[0], state.position[1], state.position[2])
        : playerConfig.position.clone();
    const mesh = spawnEnemy(spawnPos, Boolean(state.isRanged), {
        enemyId: state.id,
        replica: true
    });
    if (!mesh) return null;
    replica = {
        id: state.id,
        mesh,
        targetPosition: spawnPos.clone(),
        lastUpdate: Date.now(),
        state
    };
    remoteEnemyReplicas.set(state.id, replica);
    return replica;
}

function removeRemoteEnemyReplica(enemyId) {
    const replica = remoteEnemyReplicas.get(enemyId);
    if (!replica) return;
    const mesh = replica.mesh;
    if (mesh) {
        scene.remove(mesh);
        const idx = enemies.indexOf(mesh);
        if (idx >= 0) {
            enemies.splice(idx, 1);
        }
    }
    remoteEnemyReplicas.delete(enemyId);
}

function clearRemoteEnemyReplicas() {
    Array.from(remoteEnemyReplicas.keys()).forEach(removeRemoteEnemyReplica);
    remoteEnemyReplicas.clear();
}

function syncRemoteEnemiesFromSnapshot(list = []) {
    const nowTs = Date.now();
    const seen = new Set();
    list.forEach(state => {
        if (!state || !state.id) return;
        if (state.alive === false) {
            removeRemoteEnemyReplica(state.id);
            return;
        }
        seen.add(state.id);
        const replica = ensureRemoteEnemyReplica(state);
        if (!replica) return;
        replica.lastUpdate = nowTs;
        replica.state = state;
        if (!replica.targetPosition) {
            replica.targetPosition = new THREE.Vector3();
        }
        if (Array.isArray(state.position) && state.position.length === 3) {
            replica.targetPosition.set(state.position[0], state.position[1], state.position[2]);
        }
        const mesh = replica.mesh;
        mesh.userData.health = state.health ?? mesh.userData.health;
        mesh.userData.maxHealth = state.maxHealth ?? mesh.userData.maxHealth;
        mesh.userData.isRanged = Boolean(state.isRanged);
        mesh.visible = state.alive !== false;
        mesh.userData.hasLiveState = true;
    });
    remoteEnemyReplicas.forEach((replica, id) => {
        if (seen.has(id)) return;
        if (nowTs - replica.lastUpdate > REMOTE_ENEMY_STALE_MS) {
            removeRemoteEnemyReplica(id);
        }
    });
}

function syncRemoteLootFromSnapshot(list = []) {
    if (coopRuntime.intent?.role !== 'client') return;
    if (!Array.isArray(list)) return;
    
    const hostLootIds = new Set(list.map(l => l.id));

    // Remover loots que não existem mais no host (foram coletados)
    for (let i = lootItems.length - 1; i >= 0; i--) {
        const loot = lootItems[i];
        if (!hostLootIds.has(loot.userData.id)) {
            scene.remove(loot);
            lootItems.splice(i, 1);
        }
    }

    // Adicionar/atualizar loots do host
    const localLootIds = new Set(lootItems.map(l => l.userData.id));
    list.forEach(state => {
        if (!state || !state.id || !state.type) return;
        if (!Array.isArray(state.position) || state.position.length !== 3) return;

        if (!localLootIds.has(state.id)) {
            // Criar novo loot para o cliente
            const pos = new THREE.Vector3(state.position[0], state.position[1], state.position[2]);
            const newLoot = spawnLoot(state.type, pos, { lootId: state.id, replica: true });
            if (newLoot) {
                console.log(`[Co-Op Cliente] Loot ${state.id} (${state.type}) sincronizado`);
            }
        } else {
            // Atualizar posição se necessário (loots geralmente são estáticos)
            const existing = lootItems.find(l => l.userData.id === state.id);
            if (existing) {
                existing.position.set(state.position[0], state.position[1], state.position[2]);
            }
        }
    });
}

function updateRemoteEnemyVisuals(delta) {
    if (!remoteEnemyReplicas.size) return;
    const lerpFactor = Math.min(1, delta * REMOTE_ENEMY_INTERP_SPEED);
    remoteEnemyReplicas.forEach(replica => {
        if (!replica?.mesh || !replica.targetPosition) return;
        replica.mesh.position.lerp(replica.targetPosition, lerpFactor);
    });
}

function removeRemoteAvatar(playerId) {
    const remote = remotePlayers.get(playerId);
    if (!remote) return;
    if (remote.group && remotePlayersRoot) {
        remotePlayersRoot.remove(remote.group);
    }
    if (remote.body?.material) remote.body.material.dispose();
    if (remote.head?.material) remote.head.material.dispose();
    if (remote.label?.material) remote.label.material.dispose();
    if (remote.label?.texture) remote.label.texture.dispose();
    remotePlayers.delete(playerId);
    delete playerProgressionLedger[playerId];
    delete playerCombatLedger[playerId];
}

function clearRemotePlayers() {
    Array.from(remotePlayers.keys()).forEach(removeRemoteAvatar);
}

function syncRemoteAvatarRoster(list = []) {
    if (!list.length) {
        clearRemotePlayers();
        return;
    }
    const desired = new Set();
    const localId = getLocalPlayerId();
    list.forEach(player => {
        const key = player.playerId || player.name;
        if (!key || key === localId) return;
        desired.add(key);
        const remote = ensureRemoteAvatar(key, player);
        if (!remote) return;
        applySkinToRemoteAvatar(remote, player.skin || remote.skin);
        let progressionSnapshot = null;
        if (player.progression) {
            progressionSnapshot = applyRemoteProgressionSnapshot(key, player.progression);
        }
        if (!progressionSnapshot) {
            progressionSnapshot = getCachedProgressionForPlayer(key);
        }
        if (progressionSnapshot) {
            applyUpgradeStyleToRemoteAvatar(remote, progressionSnapshot);
        }
        updateRemoteNameplate(remote, { name: player.name, progression: progressionSnapshot });
    });
    remotePlayers.forEach((_, key) => {
        if (!desired.has(key)) {
            removeRemoteAvatar(key);
        }
    });
    applyRemoteFallbackLayout();
}

function applySnapshotProgression(list = []) {
    list.forEach(player => {
        const key = player?.playerId || player?.name;
        if (!key) return;
        if (player?.skin) {
            rememberPlayerSkin(key, player.skin);
        } else {
            const cachedSkin = getCachedSkinForPlayer(key);
            if (cachedSkin) {
                player.skin = { ...cachedSkin };
            }
        }
        if (player?.progression) {
            const normalized = applyRemoteProgressionSnapshot(key, player.progression);
            if (normalized) {
                player.progression = normalized;
                const remote = remotePlayers.get(key);
                if (remote && key !== getLocalPlayerId()) {
                    applyUpgradeStyleToRemoteAvatar(remote, normalized);
                    updateRemoteNameplate(remote, { name: player.name || remote.name, progression: normalized });
                }
                return;
            }
        }
        if (key === getLocalPlayerId()) {
            player.progression = cloneProgressionShape(getLocalUpgradeState(), key);
        } else {
            player.progression = getCachedProgressionForPlayer(key);
        }
    });
}

function applyDamageToEnemy(enemy, damage, isHeadshot = false, extraMeta = {}) {
    if (!enemy || damage <= 0) return;
    if (coopRuntime.intent?.role === 'client') {
        showDamageNumber(damage, enemy.position, isHeadshot);
        sendCoopInput({
            action: 'enemy-hit',
            enemyId: enemy.userData?.id,
            damage,
            headshot: Boolean(isHeadshot),
            weapon: playerConfig.currentWeapon,
            ...extraMeta
        });
    } else {
        enemy.userData.health -= damage;
        showDamageNumber(damage, enemy.position, isHeadshot);
    }
}

function shoot() {
    const upgrades = getLocalUpgradeLevels();
    const superUpgrades = getLocalSuperUpgrades();
    if (playerConfig.isRespawning) return;
    if (playerConfig.isReloading) return;
    const weapon = playerConfig.weapons[playerConfig.currentWeapon];
    const now = Date.now();
    const weaponKey = playerConfig.currentWeapon;
    let damage = getBaseWeaponDamage(weaponKey, weapon.damage);
    let fireRate = weapon.fireRate;
    if (playerConfig.currentWeapon === 'pistol') {
        damage = superUpgrades.superPistol ? 500 : damage + upgrades.pistolDamage * 5;
    } else if (playerConfig.currentWeapon === 'smg') {
        damage += upgrades.smgDamage * 3;
        fireRate = fireRate - upgrades.smgSpeed * 10;
    } else if (playerConfig.currentWeapon === 'rifle') {
        damage += upgrades.rifleDamage * 5;
        fireRate = superUpgrades.superRifleSpeed ? 100 : fireRate - upgrades.rifleSpeed * 20;
    } else if (playerConfig.currentWeapon === 'sniper') {
        damage += upgrades.sniperDamage * 15;
    } else if (playerConfig.currentWeapon === 'shotgun') {
        damage += upgrades.shotgunDamage * 2;
        weapon.pellets = 8 + upgrades.shotgunPellets;
    } else if (playerConfig.currentWeapon === 'bazooka') {
        damage += upgrades.bazookaDamage * 25;
    }
    if (now - playerConfig.lastShot < fireRate || weapon.ammo <= 0) return;
    playerConfig.lastShot = now;
    weapon.ammo--;
    updateHUD();
    const recoil = weapon.recoil;
    const mult = weapon.auto ? recoilState.sustainedFireMultiplier : 1.0;
    targetPitch += recoil.v_kick * mult;
    recoilState.pitch += recoil.v_kick * mult;
    const hKick = (Math.random() - 0.5) * 2 * recoil.h_kick * mult;
    targetYaw += hKick;
    recoilState.yaw += hKick;
    if (playerConfig.currentWeapon === 'shotgun') shootShotgun(weapon, damage);
    else if (playerConfig.currentWeapon === 'bazooka') shootBazooka(damage);
    else shootPistolRifle(damage);
    if (weapon.auto && playerConfig.isShooting) {
        setTimeout(() => { if (playerConfig.isShooting && !playerConfig.isReloading) shoot(); }, fireRate);
    }
}

function switchWeapon(weaponName) {
    if (playerConfig.isRespawning) return;
    if (!playerConfig.weapons[weaponName].unlocked) {
        showMessage("Arma bloqueada!", 1000);
        return;
    }

    if (playerConfig.currentWeapon === weaponName) return;

    playerConfig.currentWeapon = weaponName;
    playerConfig.isReloading = false;
    document.getElementById('reloadBar').style.display = 'none';

    // Resetar estado de tiro
    playerConfig.isShooting = false;

    updateHUD();

    // Disparar evento para atualizar visualização da arma 3D
    window.dispatchEvent(new Event('weaponSwitched'));

    updateFPSWeaponModel(); // Atualizar modelo FPS

    // Som de troca (opcional)
    // playSound('switch');
}

function shouldAmplifySpreadForRunning() {
    if (IS_X1_MODE) return false;
    if (!IS_COOP_SURVIVAL && !IS_SOLO_SURVIVAL) return false;
    if (!playerConfig?.velocity) return false;
    const horizontalSpeed = Math.hypot(playerConfig.velocity.x, playerConfig.velocity.z);
    const threshold = Math.max(1.25, (playerConfig.baseSpeed || 1) * SURVIVAL_RUNNING_SPREAD.speedRatio);
    return horizontalSpeed >= threshold;
}

function applySurvivalRunningLateralSpread(dir, forwardDir) {
    if (!shouldAmplifySpreadForRunning()) return dir;
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forwardDir, worldUp);
    if (!right.lengthSq()) return dir;
    right.normalize();
    const jitter = (currentSpread + SURVIVAL_RUNNING_SPREAD.minJitter) * SURVIVAL_RUNNING_SPREAD.lateralMultiplier;
    const lateralOffset = (Math.random() - 0.5) * jitter;
    dir.add(right.multiplyScalar(lateralOffset));
    dir.normalize();
    return dir;
}

function getAimDirection() {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const dir = forward.clone();

    // Aplicar spread
    if (currentSpread > 0) {
        const spreadX = (Math.random() - 0.5) * currentSpread;
        const spreadY = (Math.random() - 0.5) * currentSpread;
        const spreadZ = (Math.random() - 0.5) * currentSpread;
        dir.x += spreadX;
        dir.y += spreadY;
        dir.z += spreadZ;
        dir.normalize();
    }

    return applySurvivalRunningLateralSpread(dir, forward);
}

function shootShotgun(weapon, damage) {
    const superUpgrades = getLocalSuperUpgrades();
    const baseDir = getAimDirection();
    for (let i = 0; i < weapon.pellets; i++) {
        const spread = new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
        const pelletDir = baseDir.clone().add(spread).normalize();
        const startPos = camera.position.clone().add(pelletDir.clone().multiplyScalar(0.6));
        const raycaster = new THREE.Raycaster(startPos, pelletDir);

        // Verificar colisão com paredes (recursivo)
        const wallHits = raycaster.intersectObjects(wallMeshes, true);

        // Verificar colisão com inimigos
        const meshes = enemies.flatMap(e => e.children.filter(c => c instanceof THREE.Mesh).map(mesh => ({ mesh, enemy: e })));
        const meshList = meshes.map(e => e.mesh);
        const enemyHits = meshList.length ? raycaster.intersectObjects(meshList, true) : [];
        const remoteEntries = IS_X1_MODE ? getRemotePlayerHitEntries() : null;
        const remoteHits = remoteEntries && remoteEntries.meshes.length
            ? raycaster.intersectObjects(remoteEntries.meshes, true)
            : [];

        let hitPoint = startPos.clone().add(pelletDir.clone().multiplyScalar(200));

        // Determinar qual hit está mais próximo
        const wallDistance = wallHits.length > 0 ? wallHits[0].distance : Infinity;
        const enemyDistance = enemyHits.length > 0 ? enemyHits[0].distance : Infinity;
        const remoteDistance = remoteHits.length > 0 ? remoteHits[0].distance : Infinity;

        if (IS_X1_MODE && remoteDistance < wallDistance && remoteDistance <= enemyDistance) {
            const { object: remoteMesh, point } = remoteHits[0];
            hitPoint = point;
            const meta = remoteEntries.lookup.get(remoteMesh.uuid);
            if (meta?.playerId) {
                const finalDmg = damage * (meta.isHead ? 3 : 1) / weapon.pellets;
                showDamageNumber(finalDmg, hitPoint, meta.isHead);
                registerX1Damage(meta.playerId, finalDmg, { headshot: meta.isHead });
            }
        } else if (wallDistance < enemyDistance) {
            // Parede bloqueou o tiro
            hitPoint = wallHits[0].point;
        } else if (enemyHits.length > 0) {
            // Inimigo atingido
            const { object: hitMesh, point } = enemyHits[0];
            const { enemy: hitEnemy } = meshes.find(e => e.mesh === hitMesh);
            hitPoint = point;
            if (superUpgrades.superShotgun) {
                createExplosion(hitPoint, SUPER_SHOTGUN_EXPLOSION_DAMAGE, SUPER_SHOTGUN_EXPLOSION_RADIUS);
            } else {
                const finalDmg = damage * (hitMesh.userData.isHead ? 3 : 1);
                applyDamageToEnemy(hitEnemy, finalDmg, hitMesh.userData.isHead);
            }
            if (hitMesh.material && hitMesh.material.emissive) {
                hitMesh.material.emissive.setHex(0xffffff);
                setTimeout(() => { if (hitMesh.material) hitMesh.material.emissive.setHex(hitEnemy.userData.isRanged ? 0xffa500 : 0xff0000); }, 100);
            }
        } else if (IS_X1_MODE && remoteHits.length > 0) {
            const { object: remoteMesh, point } = remoteHits[0];
            hitPoint = point;
            const meta = remoteEntries.lookup.get(remoteMesh.uuid);
            if (meta?.playerId) {
                const finalDmg = damage * (meta.isHead ? 3 : 1) / weapon.pellets;
                showDamageNumber(finalDmg, hitPoint, meta.isHead);
                registerX1Damage(meta.playerId, finalDmg, { headshot: meta.isHead });
            }
        }
        createTracer(startPos, hitPoint, 0xffffff);
    }
    if (coopRuntime.intent?.role !== 'client') {
        checkDeadEnemies();
    }
}

function shootBazooka(damage) {
    const upgrades = getLocalUpgradeLevels();
    const superUpgrades = getLocalSuperUpgrades();
    const dir = getAimDirection();
    const startPos = camera.position.clone().add(dir.clone().multiplyScalar(0.6));
    const raycaster = new THREE.Raycaster(startPos, dir);

    // Verificar colisão com paredes primeiro (recursivo)
    const wallHits = raycaster.intersectObjects(wallMeshes, true);

    // Verificar colisão com outros objetos
    const objects = scene.children.filter(obj => obj.type === 'Mesh' || obj.type === 'Group');
    const objectHits = raycaster.intersectObjects(objects, true);

    // Usar o hit mais próximo (parede ou objeto)
    let expPoint = startPos.clone().add(dir.clone().multiplyScalar(200));

    const wallDistance = wallHits.length > 0 ? wallHits[0].distance : Infinity;
    const objectDistance = objectHits.length > 0 ? objectHits[0].distance : Infinity;

    if (wallDistance < objectDistance && wallHits.length > 0) {
        expPoint = wallHits[0].point;
    } else if (objectHits.length > 0) {
        expPoint = objectHits[0].point;
    }

    createTracer(startPos, expPoint, 0xffa500, false, 5);
    const radius = 10 + upgrades.bazookaRadius;
    createExplosion(expPoint, damage, radius, false);
    if (superUpgrades.superBazooka) {
        setTimeout(() => {
            for (let i = 0; i < 3; i++) {
                const clusterPos = expPoint.clone().add(new THREE.Vector3((Math.random() - 0.5) * radius, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * radius));
                createExplosion(clusterPos, damage / 3, radius / 2, false);
            }
            if (coopRuntime.intent?.role !== 'client') {
                checkDeadEnemies();
            }
        }, 200);
    } else if (coopRuntime.intent?.role !== 'client') {
        checkDeadEnemies();
    }
}

function shootPistolRifle(damage) {
    const dir = getAimDirection();
    const startPos = camera.position.clone().add(dir.clone().multiplyScalar(0.6));
    const raycaster = new THREE.Raycaster(startPos, dir);

    // Primeiro, verificar colisão com paredes (recursivo)
    const wallHits = raycaster.intersectObjects(wallMeshes, true);

    // Depois, verificar colisão com inimigos
    const meshes = enemies.flatMap(e => e.children.filter(c => c instanceof THREE.Mesh).map(mesh => ({ mesh, enemy: e })));
    const meshList = meshes.map(e => e.mesh);
    const enemyHits = meshList.length ? raycaster.intersectObjects(meshList, true) : [];
    const nearestEnemyDistance = enemyHits.length > 0 ? enemyHits[0].distance : Infinity;

    const remoteHitEntries = IS_X1_MODE ? getRemotePlayerHitEntries() : null;
    const remoteHits = remoteHitEntries && remoteHitEntries.meshes.length
        ? raycaster.intersectObjects(remoteHitEntries.meshes, true)
        : [];

    let hitPoint = startPos.clone().add(dir.clone().multiplyScalar(200));
    let hitWall = false;

    // Se atingiu parede E inimigo, verificar qual está mais perto
    if (wallHits.length > 0) {
        const wallDistance = wallHits[0].distance;
        const remoteDistance = remoteHits.length > 0 ? remoteHits[0].distance : Infinity;

        if (IS_X1_MODE && remoteDistance < wallDistance && remoteDistance <= nearestEnemyDistance) {
            const { object: hitMesh, point } = remoteHits[0];
            hitPoint = point;
            const meta = remoteHitEntries.lookup.get(hitMesh.uuid);
            if (meta?.playerId) {
                const finalDmg = damage * (meta.isHead ? 3 : 1);
                showDamageNumber(finalDmg, hitPoint, meta.isHead);
                registerX1Damage(meta.playerId, finalDmg, { headshot: meta.isHead });
            }
        } else if (enemyHits.length > 0) {
            const enemyDistance = enemyHits[0].distance;

            // Se parede está mais perto que inimigo, não danifica inimigo
            if (wallDistance < enemyDistance) {
                hitWall = true;
                hitPoint = wallHits[0].point;
            } else {
                // Inimigo está mais perto, processar dano
                const { object: hitMesh, point } = enemyHits[0];
                const { enemy: hitEnemy } = meshes.find(e => e.mesh === hitMesh);
                hitPoint = point;
                const finalDmg = damage * (hitMesh.userData.isHead ? 3 : 1);
                applyDamageToEnemy(hitEnemy, finalDmg, hitMesh.userData.isHead);
                if (hitMesh.material.emissive) {
                    hitMesh.material.emissive.setHex(0xffffff);
                    setTimeout(() => { if (hitMesh.material) hitMesh.material.emissive.setHex(hitEnemy.userData.isRanged ? 0xffa500 : 0xff0000); }, 100);
                }
            }
        } else {
            // Apenas parede atingida
            hitWall = true;
            hitPoint = wallHits[0].point;
        }
    } else if (IS_X1_MODE && remoteHits.length > 0) {
        const { object: hitMesh, point } = remoteHits[0];
        hitPoint = point;
        const meta = remoteHitEntries.lookup.get(hitMesh.uuid);
        if (meta?.playerId) {
            const finalDmg = damage * (meta.isHead ? 3 : 1);
            showDamageNumber(finalDmg, hitPoint, meta.isHead);
            registerX1Damage(meta.playerId, finalDmg, { headshot: meta.isHead });
        }
    } else if (enemyHits.length > 0) {
        // Apenas inimigo atingido (sem parede no caminho)
        const { object: hitMesh, point } = enemyHits[0];
        const { enemy: hitEnemy } = meshes.find(e => e.mesh === hitMesh);
        hitPoint = point;
        const finalDmg = damage * (hitMesh.userData.isHead ? 3 : 1);
        applyDamageToEnemy(hitEnemy, finalDmg, hitMesh.userData.isHead);
        if (hitMesh.material.emissive) {
            hitMesh.material.emissive.setHex(0xffffff);
            setTimeout(() => { if (hitMesh.material) hitMesh.material.emissive.setHex(hitEnemy.userData.isRanged ? 0xffa500 : 0xff0000); }, 100);
        }
    }

    createTracer(startPos, hitPoint, 0xffffff);
    if (coopRuntime.intent?.role !== 'client') {
        checkDeadEnemies();
    }
}

function checkDeadEnemies() {
    if (coopRuntime.intent?.role === 'client') {
        return;
    }
    if (IS_X1_MODE) {
        isChecking = false;
        return;
    }
    if (isChecking) return;
    isChecking = true;
    let enemiesDied = false;
    for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].userData.health <= 0) {
            enemyRegistry.delete(enemies[i].userData.id);
            scene.remove(enemies[i]);
            enemies.splice(i, 1);
            enemiesRemaining--;
            coopCombatScore = Math.max(0, coopCombatScore + 100);
            enemiesDied = true;
        }
    }

    // Garantir que o contador não fique negativo
    if (enemiesRemaining < 0) enemiesRemaining = 0;

    document.getElementById('enemies').textContent = `Inimigos: ${enemiesRemaining}`;

    if (enemiesRemaining <= 0 && gameStarted && enemiesDied) {
        // Pequeno delay para garantir que o último inimigo "morreu" visualmente antes de iniciar o próximo round
        setTimeout(() => {
            if (enemiesRemaining <= 0) nextRound();
        }, 1000);
    }
    isChecking = false;
}

function createTracer(start, end, color, isEnemy = false, thickness = 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({ color, linewidth: thickness });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    setTimeout(() => { scene.remove(line); geo.dispose(); mat.dispose(); }, isEnemy ? 400 : 150);
}

function showDamageNumber(damage, position, isHeadshot) {
    const elem = document.createElement('div');
    elem.className = 'damage-number';
    elem.textContent = Math.round(damage);
    document.body.appendChild(elem);
    const screenPos = position.clone().project(camera);
    elem.style.left = ((screenPos.x + 1) / 2 * window.innerWidth) + 'px';
    elem.style.top = ((-screenPos.y + 1) / 2 * window.innerHeight) + 'px';
    if (isHeadshot) {
        elem.style.color = '#ffd700';
        elem.style.fontSize = '40px';
        elem.textContent = `HEADSHOT! ${Math.round(damage)}`;
    }
    setTimeout(() => elem.remove(), 1000);
}

function createExplosion(position, maxDamage, radius, doCheck = true) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.8 }));
    mesh.position.copy(position);
    scene.add(mesh);
    let scale = 0.1;
    const interval = setInterval(() => {
        scale += 0.2;
        mesh.scale.set(scale, scale, scale);
        mesh.material.opacity -= 0.16;
        if (mesh.material.opacity <= 0) {
            clearInterval(interval);
            scene.remove(mesh);
        }
    }, 20);

    // Usar um Set para evitar danificar o mesmo inimigo múltiplas vezes na mesma explosão
    const damagedEnemies = new Set();

    enemies.forEach(enemy => {
        if (enemy.userData.health <= 0 || damagedEnemies.has(enemy)) return;

        const dist = enemy.position.distanceTo(position);
        if (dist < radius) {
            const falloff = 1 - (dist / radius);
            const finalDmg = maxDamage * falloff;
            applyDamageToEnemy(enemy, finalDmg, false, { source: 'explosion' });
            damagedEnemies.add(enemy);

            enemy.children.forEach(child => {
                if (child.material && child.material.emissive) {
                    child.material.emissive.setHex(0xffffff);
                    setTimeout(() => { if (child.material) child.material.emissive.setHex(enemy.userData.isRanged ? 0xffa500 : 0xff0000); }, 100);
                }
            });
        }
    });
    if (doCheck && coopRuntime.intent?.role !== 'client') {
        checkDeadEnemies();
    }
}

function pickupLoot() {
    if (IS_X1_MODE) return;
    for (let i = lootItems.length - 1; i >= 0; i--) {
        const loot = lootItems[i];
        if (loot.position.distanceTo(playerConfig.position) < 3) {
            const type = loot.userData.type;
            const lootId = loot.userData.id;
            let collected = true;
            switch (type) {
                case 'health': playerConfig.health = Math.min(playerConfig.maxHealth, playerConfig.health + 50); showMessage('+50 HP', 1000); break;
                case 'ammo': Object.values(playerConfig.weapons).forEach(w => w.maxAmmo = Math.min(w.maxAmmo + 60, 300)); showMessage('+60 AMMO', 1000); break;
                case 'rifle':
                    if (playerConfig.weapons.rifle.unlocked) { addUpgradePoints(); showMessage('+1 PT', 1000); }
                    else { playerConfig.weapons.rifle.unlocked = true; playerConfig.weapons.rifle.maxAmmo = 180; switchWeapon('rifle'); }
                    break;
                case 'shotgun':
                    if (playerConfig.weapons.shotgun.unlocked) { addUpgradePoints(); showMessage('+1 PT', 1000); }
                    else { playerConfig.weapons.shotgun.unlocked = true; playerConfig.weapons.shotgun.maxAmmo = 40; switchWeapon('shotgun'); }
                    break;
                case 'bazooka':
                    if (playerConfig.weapons.bazooka.unlocked) { addUpgradePoints(); showMessage('+1 PT', 1000); }
                    else { playerConfig.weapons.bazooka.unlocked = true; playerConfig.weapons.bazooka.maxAmmo = 15; switchWeapon('bazooka'); }
                    break;
                case 'upgrade': addUpgradePoints(); showMessage('+1 PT', 1000); break;
                default: collected = false;
            }
            if (collected) {
                scene.remove(loot);
                lootItems.splice(i, 1);
                updateHUD();

                // Se for cliente, notificar o host que coletamos
                if (coopRuntime.intent?.role === 'client') {
                    sendClientCoopEvent('loot-collected', {
                        lootId,
                        type,
                        playerId: getLocalPlayerId()
                    });
                }
            }
        }
    }
}

function nextRound() {
    if (IS_X1_MODE) return;
    currentRound++;
    showMessage(`ROUND ${currentRound - 1} COMPLETO!`, 3000);
    setTimeout(startRound, 3000);
}

function toggleUpgradeMenu() {
    const menu = document.getElementById('upgradeMenu');
    if (!menu) return;
    const isOpen = menu.style.display === 'block';
    menu.style.display = isOpen ? 'none' : 'block';

    if (!isOpen) {
        // Abrindo menu
        updateUpgradeMenu();
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    } else {
        // Fechando menu
        if (gameStarted && !document.pointerLockElement && renderer && renderer.domElement) {
            setTimeout(() => renderer.domElement.requestPointerLock(), 100);
        }
    }
}

function showWeaponUnlockMenu() {
    // Listar armas não desbloqueadas
    const lockedWeapons = Object.keys(playerConfig.weapons).filter(w => !playerConfig.weapons[w].unlocked && w !== 'pistol');
    if (lockedWeapons.length === 0) {
        showMessage('Todas as armas desbloqueadas!', 2000);
        return;
    }

    // Escolher 2 armas aleatórias para oferecer
    const shuffled = lockedWeapons.sort(() => 0.5 - Math.random());
    const choices = shuffled.slice(0, Math.min(2, lockedWeapons.length));

    const menu = document.getElementById('weaponUnlockMenu');
    const choicesDiv = document.getElementById('weaponChoices');
    choicesDiv.innerHTML = '';

    choices.forEach(weaponKey => {
        const weapon = playerConfig.weapons[weaponKey];
        const btn = document.createElement('button');
        btn.style.cssText = 'padding: 20px 40px; background: linear-gradient(135deg, #00ff00, #00aa00); border: 3px solid #00ff00; border-radius: 10px; color: black; font-size: 22px; font-weight: bold; cursor: pointer; transition: all 0.3s; box-shadow: 0 0 20px rgba(0,255,0,0.5);';
        btn.innerHTML = `
                    <div style="text-align: center;">
                        <div style="font-size: 28px; margin-bottom: 10px;">${weapon.name}</div>
                        <div style="font-size: 16px; color: #003300;">Dano: ${weapon.damage}</div>
                        <div style="font-size: 16px; color: #003300;">Cadência: ${weapon.fireRate}ms</div>
                        <div style="font-size: 16px; color: #003300;">Pente: ${weapon.clipSize}</div>
                    </div>
                `;
        btn.onmouseover = () => {
            btn.style.background = 'linear-gradient(135deg, #00ff88, #00dd00)';
            btn.style.transform = 'scale(1.1)';
        };
        btn.onmouseout = () => {
            btn.style.background = 'linear-gradient(135deg, #00ff00, #00aa00)';
            btn.style.transform = 'scale(1)';
        };
        btn.onclick = () => {
            unlockWeapon(weaponKey);
            menu.style.display = 'none';
            if (gameStarted && !document.pointerLockElement && renderer && renderer.domElement) {
                setTimeout(() => renderer.domElement.requestPointerLock(), 100);
            }
        };
        choicesDiv.appendChild(btn);
    });

    menu.style.display = 'block';
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
}

function unlockWeapon(weaponKey) {
    playerConfig.weapons[weaponKey].unlocked = true;
    // Iniciar com apenas 1 pente de munição
    playerConfig.weapons[weaponKey].ammo = playerConfig.weapons[weaponKey].clipSize;
    showMessage(`${playerConfig.weapons[weaponKey].name} Desbloqueada!`, 3000);
}

function updateUpgradeMenu() {
    const state = getLocalUpgradeState();
    const upgrades = state.upgrades;
    const superUpgrades = state.super;

    document.getElementById('upgradePoints').textContent = `Pontos: ${state.points}`;
    document.getElementById('smgDmgLevel').textContent = `${upgrades.smgDamage}/10`;
    document.getElementById('smgSpeedLevel').textContent = `${upgrades.smgSpeed}/5`;
    document.getElementById('pistolDmgLevel').textContent = `${upgrades.pistolDamage}/10`;
    document.getElementById('rifleDmgLevel').textContent = `${upgrades.rifleDamage}/10`;
    document.getElementById('rifleSpeedLevel').textContent = `${upgrades.rifleSpeed}/8`;
    document.getElementById('sniperDmgLevel').textContent = `${upgrades.sniperDamage}/10`;
    document.getElementById('shotgunDmgLevel').textContent = `${upgrades.shotgunDamage}/10`;
    document.getElementById('shotgunPelletsLevel').textContent = `${upgrades.shotgunPellets}/6`;
    document.getElementById('bazookaDmgLevel').textContent = `${upgrades.bazookaDamage}/10`;
    document.getElementById('bazookaRadiusLevel').textContent = `${upgrades.bazookaRadius}/5`;
    document.getElementById('ammoCapLevel').textContent = `${upgrades.ammoCapacity}/10`;
    document.getElementById('speedLevel').textContent = `${upgrades.moveSpeed}/10`;

    SUPER_UPGRADE_KEYS.forEach(id => {
        const elem = document.getElementById(`${id}Level`);
        if (elem) elem.textContent = superUpgrades[id] ? 'OK' : `${SUPER_UPGRADE_COSTS[id]}pts`;
        const btn = document.getElementById(`btn${id.charAt(0).toUpperCase() + id.slice(1)}`);
        if (btn) btn.disabled = superUpgrades[id];
    });
}

function upgradeWeapon(type) {
    const upgrades = getLocalUpgradeLevels();
    const state = getLocalUpgradeState();
    if (state.points <= 0) { showMessage('Sem pontos!', 1000); return; }
    const maxLevels = { smgDamage: 10, smgSpeed: 5, pistolDamage: 10, rifleDamage: 10, rifleSpeed: 8, sniperDamage: 10, shotgunDamage: 10, shotgunPellets: 6, bazookaDamage: 10, bazookaRadius: 5, ammoCapacity: 10, moveSpeed: 10 };
    if (upgrades[type] >= maxLevels[type]) { showMessage('Máximo!', 1000); return; }
    if (!spendUpgradePoints(1)) { showMessage('Sem pontos!', 1000); return; }
    upgrades[type]++;
    state.lastUpdatedAt = Date.now();
    state.timestamp = state.lastUpdatedAt;
    if (type === 'ammoCapacity') {
        playerConfig.weapons.pistol.clipSize = 12 + upgrades.ammoCapacity * 5;
        playerConfig.weapons.smg.clipSize = 30 + upgrades.ammoCapacity * 5;
        playerConfig.weapons.rifle.clipSize = 30 + upgrades.ammoCapacity * 5;
        playerConfig.weapons.sniper.clipSize = 5 + upgrades.ammoCapacity * 2;
        playerConfig.weapons.shotgun.clipSize = 8 + upgrades.ammoCapacity * 3;
        playerConfig.weapons.bazooka.clipSize = 1 + Math.floor(upgrades.ammoCapacity / 2);
    }
    updateUpgradeMenu();
    scheduleProgressionSync(`upgrade:${type}`);
    showMessage('Upgrade!', 1000);
}

function buySuperUpgrade(type) {
    const superUpgrades = getLocalSuperUpgrades();
    const state = getLocalUpgradeState();
    const cost = SUPER_UPGRADE_COSTS[type];
    if (!cost) return;
    if (superUpgrades[type]) { showMessage('Adquirido!', 1000); return; }
    if (state.points < cost) {
        showMessage(`Faltam ${cost - state.points}!`, 1000);
        return;
    }
    if (!spendUpgradePoints(cost)) {
        showMessage('Sem pontos!', 1000);
        return;
    }
    superUpgrades[type] = true;
    state.lastUpdatedAt = Date.now();
    state.timestamp = state.lastUpdatedAt;
    if (type === 'superAmmo') {
        Object.values(playerConfig.weapons).forEach(w => { w.clipSize = 999; w.ammo = 999; });
    } else if (type === 'superRegen') {
        playerConfig.maxHealth = 200;
        playerConfig.health = 200;
    } else if (type === 'superShotgun') {
        const w = playerConfig.weapons.shotgun;
        if (w) {
            w.auto = true; // automatic fire
            w.fireRate = 350; // ms between shots
        }
    }
    scheduleProgressionSync(`super:${type}`);
    showMessage('Super Ativado!', 2000);
    updateUpgradeMenu();
    updateHUD();
    scheduleProgressionSync('super');
}

function updateHUD() {
    const weapon = playerConfig.weapons[playerConfig.currentWeapon];
    const ammoCap = !Number.isFinite(weapon.maxAmmo) || IS_X1_MODE ? '∞' : weapon.maxAmmo;
    document.getElementById('weapon').textContent = `Arma: ${weapon.name}`;
    document.getElementById('ammo').textContent = `Munição: ${weapon.ammo}/${ammoCap}`;
    document.getElementById('healthFill').style.width = `${(playerConfig.health / playerConfig.maxHealth) * 100}%`;
    document.getElementById('healthText').textContent = `${Math.floor(playerConfig.health)}/${playerConfig.maxHealth}`;
    if (IS_X1_MODE) {
        const opponentId = getX1OpponentId();
        const opponentState = opponentId ? ensureX1PlayerState(opponentId) : null;
        const opponentLabel = opponentState
            ? `Adversário: ${Math.max(0, Math.floor(opponentState.health))}/${opponentState.maxHealth}`
            : 'Adversário: aguardando';
        document.getElementById('round').textContent = 'DUELO X1';
        document.getElementById('enemies').textContent = opponentLabel;
    } else {
        document.getElementById('round').textContent = `ROUND ${currentRound}/${maxRounds}`;
        document.getElementById('enemies').textContent = `Inimigos: ${enemiesRemaining}`;
    }
    document.getElementById('upgradePointsHUD').textContent = `Pontos: ${getLocalUpgradePoints()}`;
}

function reload() {
    if (playerConfig.isRespawning || playerConfig.isReloading) return;
    const weapon = playerConfig.weapons[playerConfig.currentWeapon];
    if (!weapon || weapon.ammo === weapon.clipSize || weapon.maxAmmo <= 0) return;
    playerConfig.isReloading = true;
    const reloadTime = weapon.reloadTime || 2000;
    const startTime = Date.now();
    const bar = document.getElementById('reloadBar');
    const fill = document.getElementById('reloadFill');
    if (bar) bar.style.display = 'block';
    const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, (elapsed / reloadTime) * 100);
        if (fill) fill.style.width = `${progress}%`;
        if (progress >= 100) clearInterval(interval);
    }, 50);
    setTimeout(() => {
        const needed = weapon.clipSize - weapon.ammo;
        const available = Math.min(needed, weapon.maxAmmo);
        weapon.ammo += available;
        weapon.maxAmmo -= available;
        playerConfig.isReloading = false;
        if (bar) bar.style.display = 'none';
        updateHUD();
    }, reloadTime);
}

function showMessage(text, duration) {
    const msg = document.getElementById('message');
    msg.textContent = text;
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', duration);
}

function gameOver() {
    showMessage('GAME OVER!', 5000);
    setTimeout(() => location.reload(), 5000);
}

function animate(currentTime = 0) {
    requestAnimationFrame(animate);

    // Limitar FPS para evitar pulos em monitores de alta taxa
    const deltaTime = currentTime - lastFrameTime;
    frameAccumulator += deltaTime;

    if (frameAccumulator < FRAME_TIME) {
        return; // Pular frame se muito rápido
    }

    lastFrameTime = currentTime;
    const delta = Math.min(frameAccumulator / 1000, 0.1); // Cap delta para evitar grandes saltos
    frameAccumulator = 0;

    const menuOpen = document.getElementById('upgradeMenu').style.display === 'block';
    const mainMenuOpen = document.getElementById('mainMenu').style.display === 'block';
    if (gameStarted && pointerLocked && !menuOpen && !mainMenuOpen) {
        updatePlayer(delta);
        updateEnemies(delta);
        updateAiming(delta);
        updateWeaponSway(delta);
    }
    updateLoot();
    updateRemotePlayerVisuals(delta);
    updateHUD();
    updateAiming(delta);
    updateWeaponSway(delta);
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

const COOP_API_URL = window.location.origin + '/coop';
const COOP_WS_PATH = '/coop/socket';
const COOP_INTENT_STORAGE_KEY = 'coopSessionIntent';
const COOP_URL_PARAMS = new URLSearchParams(window.location.search);
const DEFAULT_COOP_MODE = 'survival';
const COOP_MODE_CONFIG = {
    survival: {
        key: 'survival',
        label: 'Sobrevivência Co-Op',
        shortLabel: 'Survival',
        panelTitle: 'SURVIVAL CO-OP (PREVIEW)',
        maxPlayers: 4
    },
    x1: {
        key: 'x1',
        label: 'Duelo X1',
        shortLabel: 'Duelo X1',
        panelTitle: 'DUELO X1 (BETA)',
        maxPlayers: 3
    }
};

function normalizeCoopMode(mode) {
    const key = (mode || '').toString().toLowerCase();
    return COOP_MODE_CONFIG[key] ? key : DEFAULT_COOP_MODE;
}

function getCoopModeConfig(mode) {
    return COOP_MODE_CONFIG[normalizeCoopMode(mode)] || COOP_MODE_CONFIG[DEFAULT_COOP_MODE];
}

const COOP_RUN_PARAM = COOP_URL_PARAMS.get('coopRun');
const COOP_LAUNCH_PAYLOAD = consumeCoopRunPayload(COOP_RUN_PARAM);
const INITIAL_COOP_MODE = normalizeCoopMode(COOP_URL_PARAMS.get('coopMode') || COOP_LAUNCH_PAYLOAD?.mode || null);
const INITIAL_COOP_ROLE = COOP_URL_PARAMS.get('coopRole') || COOP_LAUNCH_PAYLOAD?.role || null;
const SURVIVAL_VARIANT_PARAM = (COOP_URL_PARAMS.get('survivalVariant') || '').toLowerCase();
const HAS_INITIAL_COOP_CONTEXT = Boolean(INITIAL_COOP_ROLE);

function deriveSurvivalVariant(baseMode, overrideVariant) {
    if (baseMode === 'x1') return 'x1';
    const normalizedVariant = (overrideVariant ?? SURVIVAL_VARIANT_PARAM ?? '').toLowerCase();
    if (normalizedVariant === 'coop' || normalizedVariant === 'solo') {
        return normalizedVariant;
    }
    if (HAS_INITIAL_COOP_CONTEXT && baseMode === 'survival') {
        return 'coop';
    }
    return 'solo';
}

let ACTIVE_COOP_MODE = INITIAL_COOP_MODE;
let CURRENT_SURVIVAL_VARIANT = deriveSurvivalVariant(ACTIVE_COOP_MODE, SURVIVAL_VARIANT_PARAM);
let IS_X1_MODE = ACTIVE_COOP_MODE === 'x1';
let IS_COOP_SURVIVAL = CURRENT_SURVIVAL_VARIANT === 'coop';
let IS_SOLO_SURVIVAL = CURRENT_SURVIVAL_VARIANT === 'solo';
const COOP_HEARTBEAT_INTERVAL = 12000;
const COOP_PRESENCE_INTERVAL = 20000;
const COOP_WS_RECONNECT_INTERVAL = 8000;
const coopRuntime = {
    intent: null,
    heartbeatTimer: null,
    presenceTimer: null,
    lastPresence: null,
    uiBound: false,
    socket: null,
    socketStatus: 'idle',
    socketAttempts: 0,
    socketError: null,
    reconnectTimer: null,
    manualReady: false,
    playersSnapshot: [],
    lastHostState: null,
    lastHostSync: 0,
    lastHeartbeatAt: null,
    remoteMeta: null
};
const CLIENT_LOG_ENDPOINT = '/api/logs/client';
const CLIENT_LOG_RECENTS = new Map();

function buildAuditMeta(extra = {}) {
    let playerId = SOLO_PLAYER_ID;
    try {
        if (typeof getLocalPlayerId === 'function') {
            playerId = getLocalPlayerId() || SOLO_PLAYER_ID;
        }
    } catch (error) {
        playerId = SOLO_PLAYER_ID;
    }
    return {
        mode: ACTIVE_COOP_MODE,
        variant: CURRENT_SURVIVAL_VARIANT,
        isX1Mode: IS_X1_MODE,
        coopRole: coopRuntime.intent?.role || null,
        playerId,
        ...extra
    };
}

function logAuditEvent(scope, message, meta = {}, options = {}) {
    if (typeof fetch !== 'function') return;
    const level = (options.level || 'info').toUpperCase();
    const dedupeKey = options.dedupeKey || null;
    const debounceMs = typeof options.debounceMs === 'number' ? options.debounceMs : 2000;
    const nowTs = Date.now();
    if (dedupeKey) {
        const lastSeen = CLIENT_LOG_RECENTS.get(dedupeKey) || 0;
        if (nowTs - lastSeen < debounceMs) {
            return;
        }
        CLIENT_LOG_RECENTS.set(dedupeKey, nowTs);
    }
    const payload = {
        level,
        scope,
        message,
        meta: buildAuditMeta(meta)
    };
    const body = JSON.stringify(payload);
    const canBeacon = typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function';
    if (canBeacon) {
        try {
            const blob = new Blob([body], { type: 'application/json' });
            navigator.sendBeacon(CLIENT_LOG_ENDPOINT, blob);
            return;
        } catch (_) {
            // fallback para fetch abaixo
        }
    }
    fetch(CLIENT_LOG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true
    }).catch(error => {
        if (options.verbose) {
            console.warn('Falha ao enviar log do cliente', error);
        }
    });
}

function refreshModeFlags(options = {}) {
    const previousMode = ACTIVE_COOP_MODE;
    const previousVariant = CURRENT_SURVIVAL_VARIANT;
    const resolvedMode = normalizeCoopMode(coopRuntime.intent?.mode || INITIAL_COOP_MODE || DEFAULT_COOP_MODE);
    const variantOverride = coopRuntime.intent?.survivalVariant || SURVIVAL_VARIANT_PARAM;
    ACTIVE_COOP_MODE = resolvedMode;
    CURRENT_SURVIVAL_VARIANT = deriveSurvivalVariant(resolvedMode, variantOverride);
    IS_X1_MODE = ACTIVE_COOP_MODE === 'x1';
    IS_COOP_SURVIVAL = CURRENT_SURVIVAL_VARIANT === 'coop';
    IS_SOLO_SURVIVAL = CURRENT_SURVIVAL_VARIANT === 'solo';
    x1MatchState.active = IS_X1_MODE;
    const modeChanged = previousMode !== ACTIVE_COOP_MODE;
    if (modeChanged && IS_X1_MODE) {
        applyModeBootstraps();
    } else if (modeChanged && !IS_X1_MODE && previousMode === 'x1') {
        x1MatchState.started = false;
        x1MatchState.winner = null;
    }
    if (modeChanged) {
        logAuditEvent('COOP_MODE', `Modo ajustado para ${ACTIVE_COOP_MODE.toUpperCase()}`, {
            previousMode,
            variant: CURRENT_SURVIVAL_VARIANT
        }, { dedupeKey: `mode:${ACTIVE_COOP_MODE}`, debounceMs: 4000 });
    }
    if (!modeChanged && previousVariant !== CURRENT_SURVIVAL_VARIANT) {
        logAuditEvent('COOP_VARIANT', `Variante atualizada para ${CURRENT_SURVIVAL_VARIANT}`, {
            previousVariant
        }, { dedupeKey: `variant:${CURRENT_SURVIVAL_VARIANT}`, debounceMs: 3000 });
    }
    const shouldUpdateBanner = !options.skipBanner && (options.forceBanner || modeChanged || previousVariant !== CURRENT_SURVIVAL_VARIANT);
    if (shouldUpdateBanner) {
        updateModeVariantBanner();
    }
    updateX1KillLeaderboard();
}

const PROGRESSION_SYNC_DEBOUNCE = 350;
const COOP_STATE_BROADCAST_INTERVAL = 150;
let progressionSyncTimer = null;
let coopStateBroadcastTimer = null;
let coopSyncIndicatorTimer = null;

function serializeLocalProgressionSnapshot() {
    const state = getLocalUpgradeState();
    const snapshot = {
        playerId: getLocalPlayerId(),
        points: state.points,
        upgrades: { ...state.upgrades },
        super: { ...state.super },
        timestamp: Date.now()
    };
    state.lastUpdatedAt = snapshot.timestamp;
    return snapshot;
}

function scheduleProgressionSync(reason = 'auto') {
    if (!coopRuntime.intent) return;
    if (progressionSyncTimer) return;
    progressionSyncTimer = setTimeout(() => {
        progressionSyncTimer = null;
        sendLocalProgressionUpdate(reason);
    }, PROGRESSION_SYNC_DEBOUNCE);
}

function sendLocalProgressionUpdate(reason = 'auto') {
    if (!coopRuntime.intent) return;
    if (!coopRuntime.socket || coopRuntime.socket.readyState !== WebSocket.OPEN) return;
    const payload = {
        type: 'progression',
        reason,
        playerId: getLocalPlayerId(),
        progression: serializeLocalProgressionSnapshot()
    };
    try {
        coopRuntime.socket.send(JSON.stringify(payload));
    } catch (error) {
        console.warn('Falha ao enviar progressão co-op', error);
    }
}

function serializeLocalPlayerState() {
    const progression = serializeLocalProgressionSnapshot();
    const combat = {
        health: playerConfig.health,
        maxHealth: playerConfig.maxHealth,
        round: currentRound,
        enemiesRemaining,
        score: coopCombatScore,
        timestamp: Date.now()
    };
    updatePlayerCombatState(getLocalPlayerId(), combat);
    const snapshot = {
        playerId: getLocalPlayerId(),
        name: coopRuntime.intent?.player || 'Jogador',
        position: [playerConfig.position.x, playerConfig.position.y, playerConfig.position.z],
        rotation: { yaw, pitch },
        weapon: playerConfig.currentWeapon,
        skin: playerConfig.skin || localPlayerSkin,
        progression,
        combat,
        timestamp: combat.timestamp
    };
    rememberPlayerSkin(snapshot.playerId, snapshot.skin, true);
    return snapshot;
}

function buildHostCoopMeta() {
    return {
        round: currentRound,
        enemiesRemaining,
        enemiesAlive: enemies.length,
        lootOnField: lootItems.length,
        score: coopCombatScore,
        timestamp: Date.now()
    };
}

function buildEnemyStatePayload() {
    if (!enemies.length) return [];
    return enemies.slice(0, MAX_ENEMY_STATE_EXPORT).map(enemy => ({
        id: enemy.userData.id,
        position: [enemy.position.x, enemy.position.y, enemy.position.z],
        velocity: enemy.userData.velocity
            ? [enemy.userData.velocity.x, enemy.userData.velocity.y, enemy.userData.velocity.z]
            : null,
        health: Math.max(0, enemy.userData.health),
        maxHealth: Math.max(1, enemy.userData.maxHealth || enemy.userData.health || 1),
        isRanged: Boolean(enemy.userData.isRanged),
        alive: enemy.userData.health > 0
    }));
}

function buildLootStatePayload() {
    if (!lootItems.length) return [];
    return lootItems.map(loot => ({
        id: loot.userData.id,
        type: loot.userData.type,
        position: [loot.position.x, loot.position.y, loot.position.z]
    }));
}

function broadcastLocalCoopState() {
    if (!coopRuntime.intent) return;
    if (!coopRuntime.socket || coopRuntime.socket.readyState !== WebSocket.OPEN) return;
    const playerState = serializeLocalPlayerState();
    if (coopRuntime.intent?.role !== 'host') {
        const payload = {
            type: 'client-state',
            player: playerState
        };
        try {
            coopRuntime.socket.send(JSON.stringify(payload));
        } catch (error) {
            console.warn('Falha ao transmitir estado do cliente co-op', error);
        }
        return;
    }
    const payload = {
        type: 'state',
        payload: {
            meta: buildHostCoopMeta(),
            players: {
                [playerState.playerId]: playerState
            },
            enemies: buildEnemyStatePayload(),
            loot: buildLootStatePayload()
        }
    };
    try {
        coopRuntime.socket.send(JSON.stringify(payload));
    } catch (error) {
        console.warn('Falha ao transmitir estado co-op', error);
    }
}

function startCoopStateBroadcast() {
    if (coopStateBroadcastTimer || !coopRuntime.intent) return;
    coopStateBroadcastTimer = setInterval(() => {
        broadcastLocalCoopState();
    }, COOP_STATE_BROADCAST_INTERVAL);
}

function stopCoopStateBroadcast() {
    if (coopStateBroadcastTimer) {
        clearInterval(coopStateBroadcastTimer);
        coopStateBroadcastTimer = null;
    }
}

function updateCoopStateBroadcastLoop() {
    if (coopRuntime.intent) {
        startCoopStateBroadcast();
    } else {
        stopCoopStateBroadcast();
    }
}

function initCoopRuntime() {
    if (COOP_LAUNCH_PAYLOAD?.role) {
        mergeCoopIntent({ ...COOP_LAUNCH_PAYLOAD });
    }
    coopRuntime.intent = loadCoopIntent(INITIAL_COOP_ROLE);
    refreshModeFlags({ forceBanner: true });
    if (coopRuntime.intent && !coopRuntime.intent.skin) {
        coopRuntime.intent.skin = { ...localPlayerSkin };
        mergeCoopIntent({ skin: coopRuntime.intent.skin });
    }
    if (coopRuntime.intent?.skin) {
        playerConfig.skin = { ...coopRuntime.intent.skin };
        applyLocalSkinToHud(coopRuntime.intent.skin);
        updateFPSWeaponModel();
        window.dispatchEvent(new Event('playerSkinUpdated'));
        rememberPlayerSkin(getLocalPlayerId(), playerConfig.skin, true);
    }
    updateCoopUI();
    bindCoopUIEvents();
    if (!coopRuntime.intent) return;
    sendCoopHeartbeat(true);
    fetchCoopPresence();
    startCoopTimers();
    connectCoopSocket();
    updateCoopStateBroadcastLoop();
}

function bindCoopUIEvents() {
    if (coopRuntime.uiBound) return;
    coopRuntime.uiBound = true;
    const toggleBtn = document.getElementById('coopRuntimeToggle');
    const refreshBtn = document.getElementById('coopRuntimeRefreshBtn');
    const leaveBtn = document.getElementById('coopRuntimeLeaveBtn');
    const readyBtn = document.getElementById('coopRuntimeReadyBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => toggleCoopPanel());
    }
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            sendCoopHeartbeat(true);
            fetchCoopPresence();
            connectCoopSocket(true);
        });
    }
    if (leaveBtn) {
        leaveBtn.addEventListener('click', leaveCoopMode);
    }
    if (readyBtn) {
        readyBtn.addEventListener('click', () => {
            coopRuntime.manualReady = !coopRuntime.manualReady;
            updateCoopReadyButton();
            sendCoopReadySignal();
        });
    }
    window.addEventListener('storage', (event) => {
        if (event.key === COOP_INTENT_STORAGE_KEY) {
            const activeRole = coopRuntime.intent?.role || INITIAL_COOP_ROLE;
            coopRuntime.intent = loadCoopIntent(activeRole);
            refreshModeFlags({ forceBanner: true });
            updateCoopStateBroadcastLoop();
            if (coopRuntime.intent?.skin) {
                playerConfig.skin = { ...coopRuntime.intent.skin };
                applyLocalSkinToHud(coopRuntime.intent.skin);
                updateFPSWeaponModel();
                window.dispatchEvent(new Event('playerSkinUpdated'));
                rememberPlayerSkin(getLocalPlayerId(), playerConfig.skin, true);
            }
            if (coopRuntime.intent) {
                updateCoopUI();
                startCoopTimers();
                fetchCoopPresence();
                connectCoopSocket(true);
            } else {
                stopCoopTimers();
                coopRuntime.lastPresence = null;
                coopRuntime.playersSnapshot = [];
                coopRuntime.manualReady = false;
                disconnectCoopSocket('storage_cleared');
                updateCoopUI();
            }
        }
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopCoopTimers();
        } else if (coopRuntime.intent) {
            startCoopTimers();
            sendCoopHeartbeat(true);
            fetchCoopPresence();
            connectCoopSocket();
        }
    });
}

function toggleCoopPanel(forceState) {
    const panel = document.getElementById('coopRuntimePanel');
    if (!panel) return;
    const show = typeof forceState === 'boolean' ? forceState : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !show);
    if (show && document.pointerLockElement) {
        document.exitPointerLock();
    } else if (!show && gameStarted && renderer && renderer.domElement && !document.pointerLockElement) {
        setTimeout(() => renderer.domElement.requestPointerLock(), 100);
    }
}

function startCoopTimers() {
    stopCoopTimers();
    coopRuntime.heartbeatTimer = setInterval(() => {
        if (!document.hidden) {
            sendCoopHeartbeat();
        }
    }, COOP_HEARTBEAT_INTERVAL);
    coopRuntime.presenceTimer = setInterval(() => {
        if (!document.hidden) {
            fetchCoopPresence();
        }
    }, COOP_PRESENCE_INTERVAL);
}

function stopCoopTimers() {
    if (coopRuntime.heartbeatTimer) {
        clearInterval(coopRuntime.heartbeatTimer);
        coopRuntime.heartbeatTimer = null;
    }
    if (coopRuntime.presenceTimer) {
        clearInterval(coopRuntime.presenceTimer);
        coopRuntime.presenceTimer = null;
    }
    if (coopRuntime.reconnectTimer) {
        clearTimeout(coopRuntime.reconnectTimer);
        coopRuntime.reconnectTimer = null;
    }
}

function getCoopWsBaseUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${COOP_WS_PATH}`;
}

function connectCoopSocket(force = false) {
    if (!coopRuntime.intent || typeof WebSocket === 'undefined') return;
    if (coopRuntime.socket) {
        if (coopRuntime.socket.readyState === WebSocket.OPEN || coopRuntime.socket.readyState === WebSocket.CONNECTING) {
            if (!force) return;
            try { coopRuntime.socket.close(4100, 'reiniciando canal'); } catch (_) { }
        }
    }
    const mode = coopRuntime.intent.mode || INITIAL_COOP_MODE || DEFAULT_COOP_MODE;
    const query = new URLSearchParams({
        role: coopRuntime.intent.role || 'client',
        player: coopRuntime.intent.player || coopRuntime.intent.hostPlayer || 'Jogador',
        ready: coopRuntime.manualReady ? 'true' : 'false'
    });
    query.set('mode', mode);
    const skinQuery = coopRuntime.intent.skin || localPlayerSkin;
    if (skinQuery?.body) {
        query.set('skinBody', skinQuery.body);
    }
    if (skinQuery?.head) {
        query.set('skinHead', skinQuery.head);
    }
    if ((coopRuntime.intent.role || 'client') === 'host' && coopRuntime.intent.hostToken) {
        query.set('hostToken', coopRuntime.intent.hostToken);
    }
    if (coopRuntime.intent.interface) {
        query.set('interface', coopRuntime.intent.interface);
    }
    const socketUrl = `${getCoopWsBaseUrl()}?${query.toString()}`;
    try {
        const socket = new WebSocket(socketUrl);
        coopRuntime.socket = socket;
        coopRuntime.socketStatus = 'connecting';
        coopRuntime.socketAttempts += 1;
        coopRuntime.socketError = null;
        updateCoopSocketStatusDisplay();
        socket.addEventListener('open', () => {
            coopRuntime.socketStatus = 'open';
            coopRuntime.socketError = null;
            updateCoopSocketStatusDisplay();
            sendCoopReadySignal();
            sendLocalProgressionUpdate('initial');
            broadcastLocalCoopState();
        });
        socket.addEventListener('message', handleCoopSocketMessage);
        socket.addEventListener('close', (event) => {
            coopRuntime.socket = null;
            coopRuntime.socketStatus = 'closed';
            coopRuntime.playersSnapshot = [];
            coopRuntime.socketError = event?.reason || null;
            updateCoopSocketStatusDisplay();
            renderCoopPlayers([]);
            if (!event.wasClean && coopRuntime.intent) {
                scheduleCoopReconnect();
            }
        });
        socket.addEventListener('error', (error) => {
            coopRuntime.socketStatus = 'error';
            coopRuntime.socketError = error?.message || 'Falha no canal WS';
            updateCoopSocketStatusDisplay();
        });
    } catch (error) {
        coopRuntime.socketStatus = 'error';
        coopRuntime.socketError = error.message;
        updateCoopSocketStatusDisplay();
        scheduleCoopReconnect();
    }
}

function scheduleCoopReconnect() {
    if (!coopRuntime.intent || coopRuntime.reconnectTimer) return;
    coopRuntime.reconnectTimer = setTimeout(() => {
        coopRuntime.reconnectTimer = null;
        if (coopRuntime.intent) {
            connectCoopSocket();
        }
    }, COOP_WS_RECONNECT_INTERVAL);
}

function disconnectCoopSocket(reason = 'user-left') {
    if (coopRuntime.reconnectTimer) {
        clearTimeout(coopRuntime.reconnectTimer);
        coopRuntime.reconnectTimer = null;
    }
    if (coopRuntime.socket) {
        try {
            coopRuntime.socket.close(4000, reason);
        } catch (_) { }
    }
    coopRuntime.socket = null;
    coopRuntime.socketStatus = 'idle';
    clearRemoteEnemyReplicas();
    updateCoopSocketStatusDisplay();
}

function handleCoopSocketMessage(event) {
    let payload;
    try {
        payload = JSON.parse(event.data);
    } catch (error) {
        console.warn('Payload inválido recebido do WS co-op', error);
        return;
    }
    if (!payload || typeof payload !== 'object') {
        return;
    }
    switch (payload.type) {
        case 'welcome':
            if (payload.lobby) {
                coopRuntime.lastPresence = {
                    name: payload.lobby.name,
                    players: payload.players?.length ?? payload.lobby.players,
                    maxPlayers: payload.lobby.maxPlayers,
                    port: payload.lobby.port
                };
                mergeCoopIntent({
                    lobbyId: payload.lobby.id,
                    port: payload.lobby.port,
                    interface: payload.lobby.interface
                });
            }
            if (payload.players) {
                coopRuntime.playersSnapshot = payload.players;
                applySnapshotProgression(payload.players);
                refreshCoopPlayersList();
            }
            updateCoopPresenceFields();
            logCoopSync('WELCOME', { players: payload.players?.length || 0 });
            break;
        case 'players':
            coopRuntime.playersSnapshot = payload.players || [];
            applySnapshotProgression(coopRuntime.playersSnapshot);
            refreshCoopPlayersList();
            if (coopRuntime.lastPresence) {
                coopRuntime.lastPresence.players = coopRuntime.playersSnapshot.length;
            }
            updateCoopPresenceFields();
            logCoopSync('PLAYERS', {
                count: coopRuntime.playersSnapshot.length,
                reason: payload.reason || null
            });
            break;
        case 'state':
            coopRuntime.lastHostState = payload;
            applyHostStatePayload(payload);
            logCoopSync('STATE', { tick: payload.tick || null });
            break;
        case 'event':
            handleCoopRuntimeEvent(payload);
            break;
        case 'chat':
            pushCoopChatMessage(payload);
            break;
        case 'input':
            applyRemoteInput(payload);
            break;
        case 'client-event':
            handleClientCoopEvent(payload);
            break;
        case 'lobby-closed':
            handleCoopLobbyMissing();
            disconnectCoopSocket('lobby_closed');
            coopRuntime.playersSnapshot = [];
            refreshCoopPlayersList();
            clearCoopIntentStorage();
            coopRuntime.intent = null;
            refreshModeFlags({ forceBanner: true });
            updateCoopStateBroadcastLoop();
            updateCoopUI();
            break;
        case 'error':
            coopRuntime.socketError = payload.message || payload.code || 'Erro no canal';
            updateCoopSocketStatusDisplay();
            break;
        default:
            console.debug('WS co-op', payload);
    }
}

function handleCoopRuntimeEvent(payload) {
    if (!payload?.event) return;
    const data = payload.data || {};
    switch (payload.event) {
        case 'x1-hit':
            if (IS_X1_MODE && coopRuntime.intent?.role !== 'host') {
                handleX1HitEvent(data);
            }
            break;
        case 'x1-finish':
            if (IS_X1_MODE && coopRuntime.intent?.role !== 'host') {
                handleX1FinishEvent(data);
            }
            break;
        case 'x1-respawn':
            if (IS_X1_MODE) {
                handleX1RespawnEvent(data);
            }
            break;
        case 'weapon-offer': {
            const targetRound = typeof data.round === 'number' ? data.round : currentRound;
            if (targetRound && lastUnlockRoundServed === targetRound) break;
            lastUnlockRoundServed = targetRound;
            showWeaponUnlockMenu();
            break;
        }
        case 'coop-player-hit':
            handleRemotePlayerDamageEvent(data);
            break;
        default:
            console.log('[Co-Op Evento]', payload.event, data);
    }
}

function handleClientCoopEvent(payload) {
    if (coopRuntime.intent?.role !== 'host') return;
    if (!payload?.event) return;
    const data = payload.data || {};
    switch (payload.event) {
        case 'loot-collected': {
            // Cliente coletou um loot, remover do array do host
            const lootId = data.lootId;
            if (!lootId) break;
            const idx = lootItems.findIndex(l => l.userData.id === lootId);
            if (idx !== -1) {
                scene.remove(lootItems[idx]);
                lootItems.splice(idx, 1);
                console.log(`[Co-Op] Loot ${lootId} coletado pelo jogador ${data.playerId}`);
            }
            break;
        }
        default:
            console.log('[Co-Op Evento de Cliente]', payload.event, data);
    }
}

function handleRemotePlayerDamageEvent(data = {}) {
    const targetId = data.targetId;
    const damage = Number(data.damage) || 0;
    if (!targetId || damage <= 0) return;
    const combatState = getPlayerCombatState(targetId) || {
        playerId: targetId,
        health: targetId === getLocalPlayerId() ? playerConfig.health : 100,
        maxHealth: targetId === getLocalPlayerId() ? playerConfig.maxHealth : 100
    };
    const remaining = typeof data.remaining === 'number'
        ? Math.max(0, data.remaining)
        : Math.max(0, (combatState.health ?? combatState.maxHealth ?? 100) - damage);
    updatePlayerCombatState(targetId, {
        ...combatState,
        playerId: targetId,
        health: remaining,
        lastHit: Date.now()
    });
    if (targetId === getLocalPlayerId()) {
        playerConfig.health = Math.min(playerConfig.maxHealth, remaining);
        updateHUD();
        if (playerConfig.health <= 0) {
            // No modo X1, usar sistema de respawn com cooldown de 5 segundos
            if (IS_X1_MODE) {
                scheduleX1Respawn('Você foi derrotado!', X1_RESPAWN_DELAY_MS, getLocalPlayerId(), {
                    showMessage: true,
                    broadcast: true
                });
            } else {
                gameOver();
            }
        }
    }
}

function applyRemoteInput(message) {
    if (coopRuntime.intent?.role !== 'host') return;
    const action = message?.payload?.action;
    if (!action) return;
    switch (action) {
        case 'enemy-hit': {
            const enemyId = message.payload.enemyId;
            const damage = Number(message.payload.damage) || 0;
            if (!enemyId || damage <= 0) return;
            const target = enemyRegistry.get(enemyId);
            if (!target) return;
            target.userData.health = Math.max(0, (target.userData.health || 0) - damage);
            showDamageNumber(damage, target.position, Boolean(message.payload.headshot));
            checkDeadEnemies();
            break;
        }
        case 'player-hit': {
            if (!IS_X1_MODE) break;
            const targetId = message.payload.targetId;
            const damage = Number(message.payload.damage) || 0;
            if (!targetId || damage <= 0) break;
            const attackerId = message.payload.attackerId || null;
            const meta = {
                headshot: Boolean(message.payload.headshot),
                weapon: message.payload.weapon || null,
                source: message.payload.source || 'remote'
            };
            applyX1DamageLocally(targetId, damage, attackerId, meta);
            break;
        }
        default:
            break;
    }
}

function pushCoopChatMessage(payload) {
    if (!payload?.message) return;
    console.log(`[CO-OP][${payload.role}] ${payload.from}: ${payload.message}`);
}

function sendCoopReadySignal() {
    if (!coopRuntime.socket || coopRuntime.socket.readyState !== WebSocket.OPEN) return;
    coopRuntime.socket.send(JSON.stringify({ type: 'ready', ready: coopRuntime.manualReady }));
}

function sendCoopInput(payload) {
    if (!payload || !coopRuntime.socket || coopRuntime.socket.readyState !== WebSocket.OPEN) return;
    try {
        coopRuntime.socket.send(JSON.stringify({ type: 'input', payload }));
    } catch (error) {
        console.warn('Falha ao enviar input co-op', error);
    }
}

function sendCoopEvent(eventName, data = {}) {
    if (!eventName || coopRuntime.intent?.role !== 'host') return;
    if (!coopRuntime.socket || coopRuntime.socket.readyState !== WebSocket.OPEN) return;
    try {
        coopRuntime.socket.send(JSON.stringify({
            type: 'event',
            event: eventName,
            data,
            tick: Date.now()
        }));
    } catch (error) {
        console.warn('Falha ao enviar evento co-op', error);
    }
}

function sendClientCoopEvent(eventName, data = {}) {
    if (!eventName || coopRuntime.intent?.role !== 'client') return;
    if (!coopRuntime.socket || coopRuntime.socket.readyState !== WebSocket.OPEN) return;
    try {
        coopRuntime.socket.send(JSON.stringify({
            type: 'client-event',
            event: eventName,
            data,
            tick: Date.now()
        }));
    } catch (error) {
        console.warn('Falha ao enviar evento de cliente co-op', error);
    }
}

function updateCoopSocketStatusDisplay() {
    const el = document.getElementById('coopRuntimeSocketStateValue');
    if (!el) return;
    let label = 'Offline';
    switch (coopRuntime.socketStatus) {
        case 'connecting':
            label = 'Conectando...';
            break;
        case 'open':
            label = 'Canal ativo';
            break;
        case 'error':
            label = 'Erro no canal';
            break;
        case 'closed':
            label = 'Desconectado';
            break;
        default:
            label = 'Offline';
    }
    if (coopRuntime.socketError) {
        label += ` (${coopRuntime.socketError})`;
    }
    el.textContent = label;
}

function updateCoopReadyButton() {
    const btn = document.getElementById('coopRuntimeReadyBtn');
    if (!btn) return;
    if (!coopRuntime.intent) {
        btn.disabled = true;
        btn.textContent = 'Modo solo';
        btn.classList.remove('ready-active');
        return;
    }
    btn.disabled = false;
    btn.classList.toggle('ready-active', coopRuntime.manualReady);
    btn.textContent = coopRuntime.manualReady ? 'Marcar como não pronto' : 'Marcar como pronto';
}

function flashCoopSyncIndicator(label = 'SYNC') {
    const indicator = document.getElementById('coopSyncIndicator');
    if (!indicator) return;
    indicator.textContent = `SYNC: ${label}`;
    indicator.classList.add('visible');
    if (coopSyncIndicatorTimer) {
        clearTimeout(coopSyncIndicatorTimer);
    }
    coopSyncIndicatorTimer = setTimeout(() => {
        indicator.classList.remove('visible');
    }, 1200);
}

function logCoopSync(eventLabel, meta = {}) {
    console.info(`[CO-OP][SYNC] ${eventLabel}`, meta);
    flashCoopSyncIndicator(eventLabel);
}

function refreshCoopPlayersList() {
    renderCoopPlayers(coopRuntime.playersSnapshot);
    updateX1KillLeaderboard();
}

function resolveRosterProgressionEntry(player) {
    if (!player) return null;
    const playerId = player.playerId || player.name;
    if (!playerId) return null;
    if (player.progression) {
        const normalized = normalizeProgressionPayload(playerId, player.progression);
        if (normalized) {
            return normalized;
        }
    }
    return getCachedProgressionForPlayer(playerId);
}

function countUnlockedSupers(superState = {}) {
    return SUPER_UPGRADE_KEYS.reduce((total, key) => total + (superState?.[key] ? 1 : 0), 0);
}

function getUnlockedSuperNames(superState = {}) {
    return SUPER_UPGRADE_KEYS.filter(key => superState?.[key]).map(key => SUPER_UPGRADE_LABEL_MAP[key] || key);
}

function getTopUpgradeDescriptor(upgrades = {}) {
    let bestKey = null;
    let bestValue = 0;
    Object.entries(upgrades || {}).forEach(([key, value]) => {
        if (typeof value === 'number' && value > bestValue) {
            bestKey = key;
            bestValue = value;
        }
    });
    if (!bestKey || bestValue <= 0) return '';
    const label = UPGRADE_LABEL_MAP[bestKey] || bestKey;
    return `${label} ${bestValue}`;
}

function buildProgressionChipMarkup(progression) {
    if (!progression) return '';
    const chips = [];
    const points = Math.max(0, Math.floor(progression.points || 0));
    chips.push(`<span class="progression-chip">Pts ${points}</span>`);
    const focus = getTopUpgradeDescriptor(progression.upgrades);
    if (focus) {
        chips.push(`<span class="progression-chip">${escapeHtml(focus)}</span>`);
    }
    const superCount = countUnlockedSupers(progression.super);
    if (superCount > 0) {
        chips.push(`<span class="progression-chip super">${superCount} Supers</span>`);
    }
    return chips.length ? `<div class="progression-metrics">${chips.join('')}</div>` : '';
}

function buildProgressionTooltip(progression) {
    if (!progression) return '';
    const parts = [];
    parts.push(`Pontos: ${Math.max(0, Math.floor(progression.points || 0))}`);
    const focus = getTopUpgradeDescriptor(progression.upgrades);
    if (focus) {
        parts.push(`Foco: ${focus}`);
    }
    const supers = getUnlockedSuperNames(progression.super);
    parts.push(supers.length ? `Supers: ${supers.join(', ')}` : 'Supers: nenhum');
    return parts.join(' | ');
}

function renderCoopPlayers(list = []) {
    const container = document.getElementById('coopRuntimePlayersList');
    if (!container) return;
    if (!list.length) {
        container.innerHTML = '<div class="coop-runtime-empty">Aguardando jogadores conectarem...</div>';
        syncRemoteAvatarRoster([]);
        return;
    }
    const html = list.map(player => {
        const roleLabel = player.role === 'host' ? 'HOST' : 'CLIENTE';
        const readyLabel = player.ready ? 'Pronto' : 'Aguardando';
        const readyClass = player.ready ? 'ready' : 'pending';
        const safeName = escapeHtml(player.name || 'Jogador');
        const playerKey = player.playerId || player.name || null;
        if (IS_X1_MODE && playerKey) {
            ensureX1KillEntry(playerKey);
        }
        if (!player.skin && playerKey) {
            const cachedSkin = getCachedSkinForPlayer(playerKey);
            if (cachedSkin) {
                player.skin = { ...cachedSkin };
            }
        }
        const skinSource = player.skin || (playerKey ? getCachedSkinForPlayer(playerKey) : null) || {};
        const skin = normalizeRemoteSkin(skinSource);
        if (playerKey) {
            rememberPlayerSkin(playerKey, skin, true);
        }
        player.skin = { ...skin };
        const progression = resolveRosterProgressionEntry(player);
        if (progression) {
            player.progression = progression;
        }
        const chips = buildProgressionChipMarkup(progression);
        const tooltip = progression ? buildProgressionTooltip(progression) : '';
        const tooltipAttr = tooltip ? ` title="${escapeHtml(tooltip)}"` : '';
        return `
                    <div class="coop-runtime-player ${readyClass}"${tooltipAttr}>
                        <div>
                            <strong>${safeName}</strong>
                            <small>${roleLabel}</small>
                            <div class="skin-chip-row">
                                <span class="skin-chip" title="Cor do corpo" style="background:${skin.body};"></span>
                                <span class="skin-chip head" title="Cor da cabeça" style="background:${skin.head};"></span>
                            </div>
                            ${chips}
                        </div>
                        <span class="status ${readyClass}">${readyLabel}</span>
                    </div>
                `;
    }).join('');
    container.innerHTML = html;
    syncRemoteAvatarRoster(list);
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeRemoteSkin(raw) {
    const isObject = raw && typeof raw === 'object';
    const textureValue = isObject && typeof raw.texture === 'string'
        ? raw.texture.trim()
        : null;
    const hasTexture = Boolean(textureValue);
    const bodyFallback = hasTexture ? TEXTURED_SKIN_DEFAULT : DEFAULT_PLAYER_SKIN.body;
    const headFallback = hasTexture ? TEXTURED_SKIN_DEFAULT : DEFAULT_PLAYER_SKIN.head;
    if (!isObject) {
        return { body: bodyFallback, head: headFallback, texture: null };
    }
    return {
        body: sanitizeHexColor(raw.body, bodyFallback),
        head: sanitizeHexColor(raw.head, headFallback),
        texture: hasTexture ? textureValue : null
    };
}

function consumeCoopRunPayload(runKey) {
    if (!runKey) return null;
    try {
        if (typeof sessionStorage === 'undefined') {
            return null;
        }
        const raw = sessionStorage.getItem(runKey);
        if (!raw) {
            return null;
        }
        sessionStorage.removeItem(runKey);
        const payload = JSON.parse(raw);
        if (payload && typeof payload === 'object') {
            return payload;
        }
    } catch (error) {
        console.warn('Falha ao restaurar payload co-op temporário', error);
    }
    return null;
}

function getCoopIntentStore() {
    try {
        const raw = localStorage.getItem(COOP_INTENT_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.host || parsed.client || parsed.lastRole)) {
            return parsed;
        }
        if (parsed?.role) {
            return {
                [parsed.role]: parsed,
                lastRole: parsed.role
            };
        }
        return {};
    } catch (error) {
        console.warn('Falha ao carregar sessão co-op', error);
        return {};
    }
}

function saveCoopIntentStore(store) {
    try {
        const hasHost = Boolean(store.host);
        const hasClient = Boolean(store.client);
        if (!hasHost && !hasClient) {
            localStorage.removeItem(COOP_INTENT_STORAGE_KEY);
            return;
        }
        if (!store.lastRole || !store[store.lastRole]) {
            store.lastRole = hasHost ? 'host' : 'client';
        }
        const payload = {
            ...(hasHost ? { host: store.host } : {}),
            ...(hasClient ? { client: store.client } : {}),
            lastRole: store.lastRole
        };
        localStorage.setItem(COOP_INTENT_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Falha ao salvar sessão co-op', error);
    }
}

function loadCoopIntent(preferredRole = null) {
    try {
        const store = getCoopIntentStore();
        const role = preferredRole || coopRuntime.intent?.role || store.lastRole || 'client';
        const payload = store[role] || store.host || store.client || null;
        if (payload) {
            payload.mode = normalizeCoopMode(payload.mode || INITIAL_COOP_MODE || DEFAULT_COOP_MODE);
            if (!payload.skin) {
                payload.skin = { ...localPlayerSkin };
            }
        }
        return payload;
    } catch (error) {
        console.warn('Falha ao carregar sessão co-op', error);
        return null;
    }
}

function mergeCoopIntent(patch) {
    if (!patch) return;
    try {
        const store = getCoopIntentStore();
        const role = patch.role || coopRuntime.intent?.role || store.lastRole || 'client';
        const base = store[role] || {};
        const resolvedMode = normalizeCoopMode(patch.mode || base.mode || coopRuntime.intent?.mode || INITIAL_COOP_MODE || DEFAULT_COOP_MODE);
        const payload = { ...base, ...patch, mode: resolvedMode, role, timestamp: Date.now() };
        if (!payload.skin) {
            payload.skin = base.skin || { ...localPlayerSkin };
        }
        store[role] = payload;
        store.lastRole = role;
        saveCoopIntentStore(store);
        coopRuntime.intent = payload;
        refreshModeFlags();
        if (payload.skin) {
            playerConfig.skin = { ...payload.skin };
            applyLocalSkinToHud(payload.skin);
            updateFPSWeaponModel();
            window.dispatchEvent(new Event('playerSkinUpdated'));
            rememberPlayerSkin(getLocalPlayerId(), playerConfig.skin, true);
        }
        updateCoopStateBroadcastLoop();
    } catch (error) {
        console.warn('Falha ao atualizar sessão co-op', error);
    }
}

function clearCoopIntentStorage(role = null) {
    try {
        const store = getCoopIntentStore();
        const targetRole = role || coopRuntime.intent?.role || store.lastRole || 'client';
        if (store[targetRole]) {
            delete store[targetRole];
            if (store.lastRole === targetRole) {
                store.lastRole = store.host ? 'host' : (store.client ? 'client' : null);
            }
            saveCoopIntentStore(store);
        } else if (!store.host && !store.client) {
            localStorage.removeItem(COOP_INTENT_STORAGE_KEY);
        }
    } catch (error) {
        console.warn('Falha ao limpar sessão co-op', error);
    }
}

function updateCoopUI() {
    const badge = document.getElementById('coopRuntimeBadge');
    const panel = document.getElementById('coopRuntimePanel');
    const panelTitle = document.getElementById('coopRuntimePanelTitle');
    if (!badge || !panel) return;
    if (!coopRuntime.intent) {
        badge.classList.add('hidden');
        panel.classList.add('hidden');
        if (panelTitle) {
            const fallbackConfig = getCoopModeConfig(INITIAL_COOP_MODE);
            panelTitle.textContent = fallbackConfig.panelTitle;
        }
        updateCoopReadyButton();
        updateCoopSocketStatusDisplay();
        renderCoopPlayers([]);
        return;
    }
    const modeConfig = getCoopModeConfig(coopRuntime.intent.mode);
    const role = coopRuntime.intent.role === 'host' ? 'HOST' : 'CLIENTE';
    const endpoint = formatCoopEndpoint();
    if (panelTitle) {
        panelTitle.textContent = modeConfig.panelTitle;
    }
    document.getElementById('coopRuntimeRole').textContent = `${modeConfig.shortLabel} • ${role}`;
    const summary = coopRuntime.intent.lobbyName || endpoint || 'Lobby co-op ativo';
    document.getElementById('coopRuntimeSummary').textContent = `${modeConfig.label}: ${summary}`;
    document.getElementById('coopRuntimeRoleValue').textContent = role;
    document.getElementById('coopRuntimeEndpointValue').textContent = endpoint || '-';
    updateCoopPresenceFields();
    updateCoopReadyButton();
    updateCoopSocketStatusDisplay();
    refreshCoopPlayersList();
    badge.classList.remove('hidden');
}

function formatCoopEndpoint() {
    if (!coopRuntime.intent) return '';
    const ip = coopRuntime.intent.interface || coopRuntime.intent.address || 'LAN';
    const port = coopRuntime.intent.port || 7777;
    return `${ip}:${port}`;
}

function updateCoopPresenceFields() {
    const playersEl = document.getElementById('coopRuntimePlayersValue');
    const statusEl = document.getElementById('coopRuntimeStatusText');
    const heartbeatEl = document.getElementById('coopRuntimeHeartbeatValue');
    if (!playersEl || !statusEl || !heartbeatEl) return;
    if (!coopRuntime.intent) {
        playersEl.textContent = '-';
        statusEl.textContent = 'Sessão solo. Abra o launcher para configurar um lobby.';
        heartbeatEl.textContent = '--';
        return;
    }
    const modeConfig = getCoopModeConfig(coopRuntime.intent.mode);
    const presence = coopRuntime.lastPresence;
    const snapshotCount = coopRuntime.playersSnapshot?.length || presence?.players || 0;
    const maxPlayers = presence?.maxPlayers ?? coopRuntime.intent?.maxPlayers ?? modeConfig.maxPlayers ?? '?';
    playersEl.textContent = `${snapshotCount} / ${maxPlayers}`;
    const lobbyName = presence?.name || coopRuntime.intent?.lobbyName || 'Lobby LAN';
    statusEl.textContent = presence
        ? `${modeConfig.label}: ${lobbyName} ativo.`
        : `${modeConfig.label}: aguardando sincronização com o host.`;
    const heartbeat = coopRuntime.lastHeartbeatAt
        ? new Date(coopRuntime.lastHeartbeatAt).toLocaleTimeString('pt-BR')
        : '--';
    heartbeatEl.textContent = heartbeat;
}

async function sendCoopHeartbeat(forceLog = false) {
    if (!coopRuntime.intent) return;
    const mode = coopRuntime.intent.mode || INITIAL_COOP_MODE || DEFAULT_COOP_MODE;
    const payload = {
        mode,
        role: coopRuntime.intent.role || 'client',
        player: coopRuntime.intent.player || 'Jogador',
        port: coopRuntime.intent.port,
        interface: coopRuntime.intent.interface,
        skin: coopRuntime.intent.skin || localPlayerSkin
    };
    if (payload.role === 'host' && coopRuntime.intent.hostToken) {
        payload.hostToken = coopRuntime.intent.hostToken;
    }
    try {
        const response = await fetch(`${COOP_API_URL}/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            if (response.status === 404) {
                handleCoopLobbyMissing();
            }
            if (forceLog) console.warn('Heartbeat co-op falhou', response.status);
            return;
        }
        const data = await response.json().catch(() => null);
        if (data?.lobby) {
            coopRuntime.lastPresence = { ...data.lobby, mode };
            mergeCoopIntent({
                mode,
                lobbyId: data.lobby.id,
                port: data.lobby.port,
                interface: data.lobby.interface,
                maxPlayers: data.lobby.maxPlayers,
                ...(payload.role === 'host' && data.lobby.hostSkin ? { skin: data.lobby.hostSkin } : {})
            });
            coopRuntime.lastHeartbeatAt = Date.now();
            updateCoopPresenceFields();
        }
    } catch (error) {
        if (forceLog) console.warn('Heartbeat co-op indisponível', error);
    }
}

async function fetchCoopPresence() {
    if (!coopRuntime.intent) return;
    try {
        const mode = coopRuntime.intent.mode || INITIAL_COOP_MODE || DEFAULT_COOP_MODE;
        const response = await fetch(`${COOP_API_URL}/presence?mode=${mode}`, { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const lobby = payload?.lobby;
        if (lobby) {
            if (coopRuntime.intent.lobbyId && lobby.id && coopRuntime.intent.lobbyId !== lobby.id) {
                return;
            }
            coopRuntime.lastPresence = {
                name: lobby.name,
                players: payload.players_online,
                maxPlayers: lobby.maxPlayers,
                port: lobby.port,
                mode
            };
            updateCoopPresenceFields();
        }
    } catch (error) {
        // silencioso
    }
}

function handleCoopLobbyMissing() {
    coopRuntime.lastPresence = null;
    coopRuntime.playersSnapshot = [];
    refreshCoopPlayersList();
    const modeConfig = getCoopModeConfig(coopRuntime.intent?.mode);
    document.getElementById('coopRuntimeStatusText').textContent = `${modeConfig.label}: lobby não encontrado. Reabra o launcher para configurar.`;
    document.getElementById('coopRuntimeHeartbeatValue').textContent = '--';
    updateCoopPresenceFields();
}

async function leaveCoopMode() {
    if (coopRuntime.intent?.role === 'host' && coopRuntime.intent.hostToken) {
        try {
            await fetch(`${COOP_API_URL}/lobby`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hostToken: coopRuntime.intent.hostToken,
                    mode: coopRuntime.intent.mode || INITIAL_COOP_MODE || DEFAULT_COOP_MODE
                })
            });
        } catch (error) {
            console.warn('Falha ao encerrar lobby', error);
        }
    }
    clearCoopIntentStorage();
    coopRuntime.intent = null;
    refreshModeFlags({ forceBanner: true });
    coopRuntime.lastPresence = null;
    coopRuntime.playersSnapshot = [];
    coopRuntime.manualReady = false;
    coopRuntime.remoteMeta = null;
    coopCombatScore = 0;
    stopCoopTimers();
    disconnectCoopSocket('user_left');
    stopCoopStateBroadcast();
    clearRemotePlayers();
    updateCoopUI();
    toggleCoopPanel(false);
}

applyModeBootstraps();
init();
initCoopRuntime();

// ==========================================
// CONFIGURAÇÃO ADICIONAL (SE NECESSÁRIO)
// ==========================================
// O arquivo api-integration.js externo já contém toda a lógica de integração com a API:
// - Sistema de autenticação (checkAuthentication, logout, loadPlayerProfile)
// - Sessões de jogo (startGameSession, endGameSession)
// - Pontuação e XP (saveHighScore, calculateScore)
// - Rastreamento de estatísticas (trackKill, trackShot, trackHit)
// - Conquistas (checkAndUnlockAchievements, unlockAchievement)
// - Leaderboard (loadLeaderboard, displayLeaderboard)
// - Estatísticas de armas (saveWeaponStats)
// - Auto-save periódico
//
// O script se integra automaticamente com as funções do jogo:
// gameOver(), shoot(), nextRound(), showDamageNumber(), checkDeadEnemies(), setupStartButton()

console.log('🎮 Jogo FPS 3D carregado! Sistema de estatísticas via api-integration.js');
