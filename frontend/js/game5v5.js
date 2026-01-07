let MAP_HALF_EXTENT = 85;
        const MINIMAP_SIZE = 200;
        const MINIMAP_PADDING = 12;
        let MINIMAP_SCALE = (MINIMAP_SIZE - MINIMAP_PADDING * 2) / (MAP_HALF_EXTENT * 2);
        const TACTICAL_STORAGE_KEY = 'tacticalCustomMaps';
        const TACTICAL_SELECTED_KEY = 'tacticalSelectedMap';
        const SESSION_PARAMS = new URLSearchParams(window.location.search);
        const CURRENT_QUEUE_TYPE = SESSION_PARAMS.get('queue') || 'casual';
        let REQUESTED_CUSTOM_MAP_ID = SESSION_PARAMS.get('mapId');
        let ACTIVE_CUSTOM_MAP = null;
        let CUSTOM_SKY_COLOR = null;
        let customSceneMeshes = [];
        let customMapLoadError = null;
        // Decorative or walkable object types that should not generate blocking colliders
        const NON_BLOCKING_OBJECT_TYPES = new Set(['ground', 'floor', 'terrain', 'decor', 'prop']);

        if (!REQUESTED_CUSTOM_MAP_ID) {
            try {
                REQUESTED_CUSTOM_MAP_ID = localStorage.getItem(TACTICAL_SELECTED_KEY);
            } catch (storageError) {
                console.warn('[TACTICAL 5V5] Não foi possível ler o mapa selecionado.', storageError);
            }
        }

        window.CURRENT_QUEUE_TYPE = CURRENT_QUEUE_TYPE;

        function safeParseNumber(value, fallback = 0) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        }

        function normalizeObjectType(value) {
            return typeof value === 'string' ? value.trim().toLowerCase() : '';
        }

        function objectIsBlocking(obj) {
            if (!obj) return true;
            if (typeof obj.blocking === 'boolean') {
                return obj.blocking;
            }
            const normalized = normalizeObjectType(obj.type);
            if (!normalized) return true;
            if (NON_BLOCKING_OBJECT_TYPES.has(normalized)) {
                return false;
            }
            return true;
        }

        function vectorFromPayloadPosition(position, defaultY = 0) {
            if (!position || typeof position !== 'object') {
                return new THREE.Vector3(0, defaultY, 0);
            }
            return new THREE.Vector3(
                safeParseNumber(position.x, 0),
                safeParseNumber(position.y, defaultY),
                safeParseNumber(position.z, 0)
            );
        }

        function parseColorToHex(colorValue, fallback = 0x2c3145) {
            if (typeof colorValue === 'number' && Number.isFinite(colorValue)) {
                return colorValue;
            }
            if (typeof colorValue === 'string') {
                const trimmed = colorValue.trim();
                if (trimmed.startsWith('#')) {
                    const hex = parseInt(trimmed.slice(1), 16);
                    return Number.isNaN(hex) ? fallback : hex;
                }
                if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
                    const hex = parseInt(trimmed.slice(2), 16);
                    return Number.isNaN(hex) ? fallback : hex;
                }
                const hex = parseInt(trimmed, 16);
                return Number.isNaN(hex) ? fallback : hex;
            }
            return fallback;
        }

        function loadCustomMapPayload(mapId) {
            if (!mapId) return null;
            try {
                const stored = localStorage.getItem(TACTICAL_STORAGE_KEY);
                if (!stored) return null;
                const parsed = JSON.parse(stored);
                if (!Array.isArray(parsed)) return null;
                return parsed.find(entry => entry.id === mapId) || null;
            } catch (error) {
                console.warn('[TACTICAL 5V5] Erro ao carregar mapas custom.', error);
                return null;
            }
        }

        const CLIENT_LOG_SCOPE = 'TACTICAL_5V5';

        function emitGameLog(level = 'info', message = '', meta = {}) {
            const fallback = () => {
                const prefix = '[TACTICAL 5V5]';
                if (level === 'error') console.error(prefix, message, meta);
                else if (level === 'warn') console.warn(prefix, message, meta);
                else console.log(prefix, message, meta);
            };
            try {
                if (window.clientLogs && typeof window.clientLogs[level] === 'function') {
                    window.clientLogs[level](CLIENT_LOG_SCOPE, message, meta);
                } else {
                    fallback();
                }
            } catch (logError) {
                console.warn('[TACTICAL 5V5] Falha ao emitir log', logError, { originalMessage: message, meta });
                fallback();
            }
        }

        const gameLog = {
            info: (message, meta) => emitGameLog('info', message, meta),
            warn: (message, meta) => emitGameLog('warn', message, meta),
            error: (message, meta) => emitGameLog('error', message, meta)
        };

        const STRATEGIC_MAP = {
            perimeter: 180,
            bombSites: [
                { id: 'A', label: 'SITE A', position: new THREE.Vector3(-28, 0, 18), color: 0x4fa3ff },
                { id: 'B', label: 'SITE B', position: new THREE.Vector3(32, 0, -22), color: 0xff7a7a }
            ],
            laneWalls: [
                { size: [4, 8, 70], position: [-55, 4, 0] },
                { size: [4, 8, 70], position: [55, 4, 0] },
                { size: [70, 8, 4], position: [0, 4, 55] },
                { size: [70, 8, 4], position: [0, 4, -55] }
            ],
            coverBlocks: [
                { size: [10, 5, 4], position: [-22, 2.5, -8] },
                { size: [10, 5, 4], position: [-24, 2.5, 26] },
                { size: [10, 5, 4], position: [22, 2.5, -6] },
                { size: [10, 5, 4], position: [26, 2.5, -30] },
                { size: [8, 5, 4], position: [0, 2.5, 8] },
                { size: [8, 5, 4], position: [0, 2.5, -14] }
            ],
            connectorSlabs: [
                { size: [28, 2, 6], position: [-34, 1, 16], rotation: Math.PI / 8 },
                { size: [30, 2, 6], position: [20, 1, -14], rotation: -Math.PI / 8 }
            ]
        };

        const TEAM_CONFIG = {
            alpha: {
                name: 'VANGUARD',
                color: 0x00c6ff,
                accent: '#00ffd5',
                spawns: [
                    new THREE.Vector3(-70, 0, -35),
                    new THREE.Vector3(-68, 0, -28),
                    new THREE.Vector3(-66, 0, -22),
                    new THREE.Vector3(-62, 0, -30),
                    new THREE.Vector3(-60, 0, -18)
                ]
            },
            bravo: {
                name: 'LEGION',
                color: 0xff4d4d,
                accent: '#ff8585',
                spawns: [
                    new THREE.Vector3(70, 0, 35),
                    new THREE.Vector3(68, 0, 28),
                    new THREE.Vector3(66, 0, 22),
                    new THREE.Vector3(62, 0, 30),
                    new THREE.Vector3(60, 0, 18)
                ]
            }
        };

        const MATCH_CONFIG = {
            teamSize: 5,
            roundsToWin: 9,
            buyPhaseSeconds: 12,
            roundDuration: 110,
            overtimeRounds: 3,
            postRoundSeconds: 6
        };

        function applyRoundConfigOverrides(roundConfig = {}) {
            if (!roundConfig || typeof roundConfig !== 'object') return;
            if (Number.isFinite(roundConfig.roundsToWin)) {
                MATCH_CONFIG.roundsToWin = Math.max(1, roundConfig.roundsToWin);
            }
            if (Number.isFinite(roundConfig.roundTime)) {
                MATCH_CONFIG.roundDuration = Math.max(30, roundConfig.roundTime);
            } else if (Number.isFinite(roundConfig.roundDuration)) {
                MATCH_CONFIG.roundDuration = Math.max(30, roundConfig.roundDuration);
            }
            if (Number.isFinite(roundConfig.buyTime)) {
                MATCH_CONFIG.buyPhaseSeconds = Math.max(5, roundConfig.buyTime);
            } else if (Number.isFinite(roundConfig.buyPhaseSeconds)) {
                MATCH_CONFIG.buyPhaseSeconds = Math.max(5, roundConfig.buyPhaseSeconds);
            }
            if (Number.isFinite(roundConfig.overtimeRounds)) {
                MATCH_CONFIG.overtimeRounds = Math.max(0, roundConfig.overtimeRounds);
            }
        }

        function recalcMapDerivedValues() {
            const perimeter = Number(STRATEGIC_MAP.perimeter) || 180;
            MAP_HALF_EXTENT = perimeter / 2;
            MINIMAP_SCALE = (MINIMAP_SIZE - MINIMAP_PADDING * 2) / (MAP_HALF_EXTENT * 2);
        }

        function applyCustomMapOverrides(payload) {
            if (!payload || !payload.tactical) return;
            const tactical = payload.tactical;
            if (payload.perimeter) {
                const perimeterValue = safeParseNumber(payload.perimeter, STRATEGIC_MAP.perimeter);
                if (perimeterValue > 60) STRATEGIC_MAP.perimeter = perimeterValue;
            } else if (tactical.perimeter) {
                const perimeterValue = safeParseNumber(tactical.perimeter, STRATEGIC_MAP.perimeter);
                if (perimeterValue > 60) STRATEGIC_MAP.perimeter = perimeterValue;
            }

            ['A', 'B'].forEach((siteId, index) => {
                const sitePayload = tactical.bombSites?.[siteId];
                const targetSite = STRATEGIC_MAP.bombSites[index];
                if (sitePayload && targetSite) {
                    targetSite.position.copy(vectorFromPayloadPosition(sitePayload.position, 0.4));
                    targetSite.id = siteId;
                    targetSite.label = `SITE ${siteId}`;
                }
            });

            if (Array.isArray(tactical.teamSpawns?.allies) && tactical.teamSpawns.allies.length) {
                TEAM_CONFIG.alpha.spawns = tactical.teamSpawns.allies.map(spawn => vectorFromPayloadPosition(spawn.position, 0));
            }
            if (Array.isArray(tactical.teamSpawns?.enemies) && tactical.teamSpawns.enemies.length) {
                TEAM_CONFIG.bravo.spawns = tactical.teamSpawns.enemies.map(spawn => vectorFromPayloadPosition(spawn.position, 0));
            }

            applyRoundConfigOverrides(tactical.roundConfig);

            if (payload.skyColor) {
                CUSTOM_SKY_COLOR = payload.skyColor;
            }

            if (Array.isArray(payload.objects) && payload.objects.length) {
                STRATEGIC_MAP.laneWalls = [];
                STRATEGIC_MAP.coverBlocks = [];
                STRATEGIC_MAP.connectorSlabs = [];
            }

            recalcMapDerivedValues();
        }

        if (CURRENT_QUEUE_TYPE === 'custom') {
            ACTIVE_CUSTOM_MAP = loadCustomMapPayload(REQUESTED_CUSTOM_MAP_ID);
            if (!ACTIVE_CUSTOM_MAP) {
                customMapLoadError = 'Mapa custom não encontrado. Abra o lobby e selecione outro mapa.';
                gameLog.warn(customMapLoadError, { mapId: REQUESTED_CUSTOM_MAP_ID });
                recalcMapDerivedValues();
            } else {
                applyCustomMapOverrides(ACTIVE_CUSTOM_MAP);
            }
        } else {
            recalcMapDerivedValues();
        }

        // Bomb/Objective config (simple plant/defuse)
        const BOMB_CONFIG = {
            plantSites: [],
            plantTime: 3.0, // seconds to plant
            defuseTime: 6.0, // seconds to defuse
            explodeTime: 15.0 // seconds from plant to explosion
        };

        function syncBombConfigWithMap() {
            BOMB_CONFIG.plantSites = STRATEGIC_MAP.bombSites.map(site => site.position.clone());
        }

        syncBombConfigWithMap();

        const BOMB_SITE_LOOKUP = STRATEGIC_MAP.bombSites;

        function normalizeSiteIndex(index = 0) {
            const total = STRATEGIC_MAP.bombSites.length || 1;
            return ((index % total) + total) % total;
        }

        function getSiteByIndex(index = 0) {
            const normalized = normalizeSiteIndex(index);
            return STRATEGIC_MAP.bombSites[normalized] || null;
        }

        const spectatorState = {
            active: false,
            target: new THREE.Vector3(),
            cameraHeight: 55
        };

        let minimapCanvas = null;
        let minimapCtx = null;
        const tempVec = new THREE.Vector3();
        const tempVec2 = new THREE.Vector3();
        const tempVec3 = new THREE.Vector3();
        const losRaycaster = new THREE.Raycaster();
        const losRayOrigin = new THREE.Vector3();
        const losRayDirection = new THREE.Vector3();
        const spectatorOverlayEl = document.getElementById('spectatorOverlay');
        const colliderBoxBuffer = new THREE.Box3();
        const expandedColliderBox = new THREE.Box3();

        let bombState = {
            planted: false,
            siteIndex: null,
            plantedBy: null,
            plantProgress: 0,
            defuseProgress: 0,
            timer: 0
        };

        function resetBombState() {
            bombState.planted = false;
            bombState.siteIndex = null;
            bombState.plantedBy = null;
            bombState.plantProgress = 0;
            bombState.defuseProgress = 0;
            bombState.timer = 0;
        }

        function completeBombPlant(siteIndex, planterTeam, options = {}) {
            const { author = 'desconhecido', awardCash = false } = options;
            bombState.planted = true;
            bombState.siteIndex = siteIndex;
            bombState.plantedBy = planterTeam;
            bombState.timer = BOMB_CONFIG.explodeTime;
            bombState.defuseProgress = 0;
            bombState.plantProgress = 1;
            const siteMeta = STRATEGIC_MAP.bombSites[siteIndex];
            const label = siteMeta ? siteMeta.label : `Site ${siteIndex + 1}`;
            document.getElementById('objectiveInfo').textContent = `Bomba plantada em ${label}`;
            if (awardCash) {
                grantCash(ECONOMY_CONFIG.plantReward);
            }
            gameLog.info('Bomba plantada', { site: label, autor: author });
        }

        function completeBombDefuse(defuserTeam, options = {}) {
            const { author = 'desconhecido', awardCash = false } = options;
            const siteMeta = typeof bombState.siteIndex === 'number' ? STRATEGIC_MAP.bombSites[bombState.siteIndex] : null;
            const label = siteMeta ? siteMeta.label : 'Site';
            resetBombState();
            document.getElementById('objectiveInfo').textContent = `Bomba desarmada em ${label}!`;
            if (awardCash) {
                grantCash(ECONOMY_CONFIG.defuseReward);
            }
            endRound(defuserTeam, 'Bomba desarmada');
            gameLog.info('Bomba desarmada', { site: label, autor: author });
        }

        const ECONOMY_CONFIG = {
            startCash: 650,
            maxCash: 13000,
            winReward: 2850,
            lossRewardBase: 1050,
            lossRewardIncrement: 400,
            killReward: 220,
            plantReward: 250,
            defuseReward: 250,
            surviveBonus: 320
        };

        const SHOP_CATEGORIES = [
            { id: 'sidearms', label: 'Pistolas', items: ['pistol'] },
            { id: 'smgs', label: 'SMGs', items: ['smg'] },
            { id: 'rifles', label: 'Rifles', items: ['rifle'] },
            { id: 'shotguns', label: 'Shotguns', items: ['shotgun'] },
            { id: 'snipers', label: 'Snipers', items: ['sniper'] }
        ];

        const SHOP_ITEMS = {
            pistol: { key: 'pistol', name: 'Pistola Padrão', description: 'Arma secundária equilibrada.', cost: 0 },
            smg: { key: 'smg', name: 'SMG Spectre', description: 'Alta cadência para controle próximo.', cost: 1200 },
            rifle: { key: 'rifle', name: 'Rifle Phantom', description: 'Rifle tático versátil.', cost: 2900 },
            shotgun: { key: 'shotgun', name: 'Shotgun Bucky', description: 'Explosiva em curta distância.', cost: 1800 },
            sniper: { key: 'sniper', name: 'Sniper Operator', description: 'Abates de longa distância.', cost: 4750 }
        };

        let currentBuyCategory = SHOP_CATEGORIES[0].id;

        const weaponsData = {
            pistol: { name: 'Pistola', damage: 24, fireRate: 240, clipSize: 12, maxAmmo: 60, auto: false, recoil: { pitch: 0.6, yaw: 0.3 } },
            smg: { name: 'SMG', damage: 14, fireRate: 110, clipSize: 30, maxAmmo: 120, auto: true, recoil: { pitch: 0.4, yaw: 0.4 } },
            rifle: { name: 'Rifle', damage: 32, fireRate: 180, clipSize: 30, maxAmmo: 120, auto: true, recoil: { pitch: 0.85, yaw: 0.5 } },
            sniper: { name: 'Sniper', damage: 90, fireRate: 1450, clipSize: 5, maxAmmo: 20, auto: false, recoil: { pitch: 2.5, yaw: 1.2 } },
            shotgun: { name: 'Shotgun', damage: 12, pellets: 8, fireRate: 900, clipSize: 8, maxAmmo: 32, auto: false, recoil: { pitch: 1.4, yaw: 0.7 } }
        };

        let scene, camera, renderer, clock;
        let worldColliders = [];
        let worldColliderBounds = [];
        let pointerLocked = false;
        let keys = {};
        let playerAgent = null;
        let teams = {
            alpha: { agents: [], score: 0 },
            bravo: { agents: [], score: 0 }
        };
        let matchState = {
            phase: 'pregame',
            round: 1,
            alphaWins: 0,
            bravoWins: 0,
            buyTimer: MATCH_CONFIG.buyPhaseSeconds,
            roundTimer: MATCH_CONFIG.roundDuration,
            postTimer: 0,
            message: '',
            winner: null
        };
        let tracers = [];
        let killFeed = [];
        let playerStats = { kills: 0, deaths: 0 };
        let currentRound = 1;
        let playerEconomy = {
            cash: ECONOMY_CONFIG.startCash,
            ownedWeapons: new Set(['pistol']),
            purchasedThisRound: new Set(),
            canBuy: false,
            buyPanelOpen: false,
            lossStreak: 0,
            aliveThisRound: true
        };

        const playerConfig = {
            position: TEAM_CONFIG.alpha.spawns[0].clone().setY(2),
            velocity: new THREE.Vector3(),
            height: 1.8,
            radius: 0.6,
            speed: 7.2,
            baseSpeed: 7.2,
            jumpPower: 8.5,
            gravity: 24,
            onGround: true,
            health: 100,
            maxHealth: 100,
            weapons: {
                pistol: { ...weaponsData.pistol, ammo: weaponsData.pistol.clipSize, reserve: weaponsData.pistol.maxAmmo },
                smg: { ...weaponsData.smg, ammo: weaponsData.smg.clipSize, reserve: weaponsData.smg.maxAmmo },
                rifle: { ...weaponsData.rifle, ammo: weaponsData.rifle.clipSize, reserve: weaponsData.rifle.maxAmmo },
                sniper: { ...weaponsData.sniper, ammo: weaponsData.sniper.clipSize, reserve: weaponsData.sniper.maxAmmo },
                shotgun: { ...weaponsData.shotgun, ammo: weaponsData.shotgun.clipSize, reserve: weaponsData.shotgun.maxAmmo }
            },
            currentWeapon: 'pistol',
            lastShot: 0,
            isReloading: false,
            isShooting: false
        };

        const recoilState = { yaw: 0, pitch: 0, sustained: 0 };
        const previousPlayerPosition = new THREE.Vector3();
        const mouseSensitivity = 0.0022;
        let yaw = 0, pitch = 0;

        function init() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0a0f1b);
            if (CUSTOM_SKY_COLOR) {
                scene.background.set(parseColorToHex(CUSTOM_SKY_COLOR, 0x0a0f1b));
            }
            clock = new THREE.Clock();

            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 600);
            camera.position.copy(playerConfig.position);

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            document.body.appendChild(renderer.domElement);

            const ambient = new THREE.AmbientLight(0xffffff, 0.5);
            scene.add(ambient);
            const dir = new THREE.DirectionalLight(0xffffff, 0.8);
            dir.position.set(60, 120, 40);
            dir.castShadow = true;
            scene.add(dir);

            buildMap();
            setupControls();
            animate();
            gameLog.info('Engine inicializada', { renderer: 'three.js r128' });
        }

        function clearCustomSceneMeshes() {
            if (!customSceneMeshes.length) return;
            customSceneMeshes.forEach(mesh => {
                if (!mesh) return;
                scene?.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) {
                    if (Array.isArray(mesh.material)) {
                        mesh.material.forEach(mat => mat.dispose());
                    } else {
                        mesh.material.dispose();
                    }
                }
            });
            customSceneMeshes = [];
        }

        function spawnCustomSceneObjects(objectList = []) {
            if (!Array.isArray(objectList) || !objectList.length) return;
            objectList.forEach(obj => {
                const width = Math.max(0.25, safeParseNumber(obj.width, 4));
                const height = Math.max(0.5, safeParseNumber(obj.height, 4));
                const depth = Math.max(0.25, safeParseNumber(obj.depth, 4));
                const geometry = new THREE.BoxGeometry(width, height, depth);
                const material = new THREE.MeshStandardMaterial({ color: parseColorToHex(obj.color, 0x2c3145) });
                const mesh = new THREE.Mesh(geometry, material);
                const pos = obj.position || {};
                mesh.position.set(
                    safeParseNumber(pos.x, 0),
                    safeParseNumber(pos.y, height / 2),
                    safeParseNumber(pos.z, 0)
                );
                const rot = obj.rotation || {};
                mesh.rotation.set(
                    safeParseNumber(rot.x, 0),
                    safeParseNumber(rot.y, 0),
                    safeParseNumber(rot.z, 0)
                );
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                scene.add(mesh);
                if (objectIsBlocking(obj)) {
                    worldColliders.push(mesh);
                }
                customSceneMeshes.push(mesh);
            });
        }

        function buildMap() {
            clearCustomSceneMeshes();
            worldColliders.forEach(mesh => scene.remove(mesh));
            worldColliders = [];
            worldColliderBounds = [];

            const hasCustomGeometry = Boolean(ACTIVE_CUSTOM_MAP?.objects?.length);

            const groundGeo = new THREE.PlaneGeometry(STRATEGIC_MAP.perimeter, STRATEGIC_MAP.perimeter);
            const groundMat = new THREE.MeshStandardMaterial({ color: 0x101626 });
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.rotation.x = -Math.PI / 2;
            ground.receiveShadow = true;
            scene.add(ground);

            const wallMat = new THREE.MeshStandardMaterial({ color: 0x1d2334 });
            const wallGeo = new THREE.BoxGeometry(STRATEGIC_MAP.perimeter, 12, 2);
            const north = new THREE.Mesh(wallGeo, wallMat);
            north.position.set(0, 6, -STRATEGIC_MAP.perimeter / 2);
            const south = north.clone();
            south.position.z = STRATEGIC_MAP.perimeter / 2;
            const east = new THREE.Mesh(new THREE.BoxGeometry(2, 12, STRATEGIC_MAP.perimeter), wallMat);
            east.position.set(STRATEGIC_MAP.perimeter / 2, 6, 0);
            const west = east.clone();
            west.position.x = -STRATEGIC_MAP.perimeter / 2;
            scene.add(north, south, east, west);
            worldColliders.push(north, south, east, west);

            if (!hasCustomGeometry) {
                const blockMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3145 });
                const connectorMaterial = new THREE.MeshStandardMaterial({ color: 0x2f3c54 });

                const createBlock = ({ size, position, rotation = 0 }, material) => {
                    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
                    const mesh = new THREE.Mesh(geo, material);
                    mesh.position.set(position[0], position[1], position[2]);
                    mesh.rotation.y = rotation;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    scene.add(mesh);
                    worldColliders.push(mesh);
                };

                STRATEGIC_MAP.laneWalls.forEach(block => createBlock(block, blockMaterial));
                STRATEGIC_MAP.coverBlocks.forEach(block => createBlock(block, blockMaterial));
                STRATEGIC_MAP.connectorSlabs.forEach(block => createBlock(block, connectorMaterial));
            } else {
                spawnCustomSceneObjects(ACTIVE_CUSTOM_MAP.objects);
            }

            STRATEGIC_MAP.bombSites.forEach(site => {
                const markerGeo = new THREE.CylinderGeometry(3.5, 3.5, 0.6, 32);
                const markerMat = new THREE.MeshStandardMaterial({ color: site.color, transparent: true, opacity: 0.55 });
                const marker = new THREE.Mesh(markerGeo, markerMat);
                marker.position.copy(site.position.clone().setY(0.3));
                marker.rotation.x = Math.PI / 2;
                marker.receiveShadow = true;
                scene.add(marker);

                const pillarGeo = new THREE.CylinderGeometry(0.6, 0.6, 3, 16);
                const pillarMat = new THREE.MeshStandardMaterial({ color: site.color });
                const pillar = new THREE.Mesh(pillarGeo, pillarMat);
                pillar.position.copy(site.position.clone().setY(1.5));
                pillar.castShadow = true;
                scene.add(pillar);
                worldColliders.push(pillar);
            });

            gameLog.info('Mapa tático carregado', {
                bombSites: STRATEGIC_MAP.bombSites.length,
                covers: STRATEGIC_MAP.coverBlocks.length
            });

            rebuildColliderBounds();
        }

        function rebuildColliderBounds() {
            worldColliderBounds = worldColliders.map(mesh => new THREE.Box3().setFromObject(mesh));
        }

        function clampPositionToPerimeter(position, margin = 1.5) {
            const limit = STRATEGIC_MAP.perimeter / 2 - margin;
            position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
            position.z = THREE.MathUtils.clamp(position.z, -limit, limit);
        }

        function positionHitsWorld(position, radius = 0.8) {
            for (let i = 0; i < worldColliderBounds.length; i++) {
                colliderBoxBuffer.copy(worldColliderBounds[i]);
                colliderBoxBuffer.min.y -= 2;
                colliderBoxBuffer.max.y += 2;
                expandedColliderBox.copy(colliderBoxBuffer);
                expandedColliderBox.min.x -= radius;
                expandedColliderBox.max.x += radius;
                expandedColliderBox.min.z -= radius;
                expandedColliderBox.max.z += radius;
                if (expandedColliderBox.containsPoint(position)) {
                    return true;
                }
            }
            return false;
        }

        function resolvePositionAgainstWorld(position, previousPosition, radius = 0.8) {
            clampPositionToPerimeter(position, radius * 1.5);
            if (positionHitsWorld(position, radius)) {
                position.copy(previousPosition);
            }
        }

        function hasLineOfSight(origin, target, tolerance = 0.35) {
            if (!origin || !target) return false;
            losRayOrigin.copy(origin);
            losRayDirection.copy(target);
            losRayOrigin.y += 1.5;
            losRayDirection.y += 1.5;
            losRayDirection.sub(losRayOrigin);
            const distance = losRayDirection.length();
            if (distance <= 0.1) return true;
            losRayDirection.normalize();
            losRaycaster.set(losRayOrigin, losRayDirection);
            losRaycaster.far = distance;
            const hits = losRaycaster.intersectObjects(worldColliders, true);
            if (!hits.length) return true;
            return hits[0].distance >= distance - tolerance;
        }

        function handleBotObjectiveActions(agent, delta) {
            if (matchState.phase !== 'action') {
                agent.currentAction = null;
                agent.actionProgress = 0;
                return;
            }
            const siteMeta = getSiteByIndex(agent.objectiveSiteIndex || 0);
            if (!bombState.planted && agent.team === 'alpha' && agent.role === 'planter' && siteMeta) {
                if (agent.mesh.position.distanceTo(siteMeta.position) < 3.2) {
                    if (agent.currentAction !== 'plant') {
                        agent.actionProgress = 0;
                        gameLog.info('IA iniciou plant', { agente: agent.name, site: siteMeta.label });
                    }
                    agent.currentAction = 'plant';
                    agent.actionProgress += delta / BOMB_CONFIG.plantTime;
                    if (agent.actionProgress >= 1) {
                        completeBombPlant(normalizeSiteIndex(agent.objectiveSiteIndex || 0), agent.team, { author: agent.name, awardCash: false });
                        agent.currentAction = null;
                        agent.actionProgress = 0;
                    }
                    return;
                }
            }
            if (bombState.planted && agent.team !== bombState.plantedBy) {
                const plantedSite = getSiteByIndex(bombState.siteIndex || 0);
                if (plantedSite && agent.mesh.position.distanceTo(plantedSite.position) < 3.2) {
                    if (agent.currentAction !== 'defuse') {
                        agent.actionProgress = 0;
                        gameLog.info('IA iniciou defuse', { agente: agent.name, site: plantedSite.label });
                    }
                    agent.currentAction = 'defuse';
                    agent.actionProgress += delta / BOMB_CONFIG.defuseTime;
                    if (agent.actionProgress >= 1) {
                        completeBombDefuse(agent.team, { author: agent.name, awardCash: false });
                        agent.currentAction = null;
                        agent.actionProgress = 0;
                    }
                    return;
                }
            }
            if (agent.currentAction) {
                agent.currentAction = null;
                agent.actionProgress = 0;
            }
        }

        function determineBotGoal(agent, enemyPos, enemyDistance, enemyVisible) {
            const lastKnown = agent.lastKnownEnemyPosition;
            if (bombState.planted) {
                const plantedSite = getSiteByIndex(bombState.siteIndex || 0);
                if (!plantedSite) return enemyPos;
                if (agent.team !== bombState.plantedBy) {
                    return plantedSite.position;
                }
                if (enemyVisible && enemyPos && enemyDistance < 24) {
                    return enemyPos;
                }
                if (!enemyVisible && lastKnown) {
                    return lastKnown;
                }
                return plantedSite.position;
            }
            if (agent.team === 'alpha' && agent.role === 'planter') {
                const site = getSiteByIndex(agent.objectiveSiteIndex || 0);
                if (site) {
                    return site.position;
                }
            }
            if (enemyVisible && enemyPos && enemyDistance < 28) {
                return enemyPos;
            }
            if (lastKnown) {
                return lastKnown;
            }
            if (agent.team === 'bravo') {
                const site = getSiteByIndex(agent.objectiveSiteIndex || 0);
                if (site) {
                    return site.position;
                }
            }
            return enemyPos;
        }

        function setupControls() {
            window.addEventListener('resize', onResize);
            document.addEventListener('keydown', (e) => {
                keys[e.code] = true;
                if (['Digit1','Digit2','Digit3','Digit4','Digit5'].includes(e.code)) {
                    const map = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'rifle', Digit4: 'shotgun', Digit5: 'sniper' };
                    switchWeapon(map[e.code]);
                }
                if (e.code === 'KeyE') {
                    attemptInteract();
                }
                if (e.code === 'KeyB') {
                    toggleBuyPanel();
                }
                if (e.code === 'Space' && playerConfig.onGround && canMove()) {
                    playerConfig.velocity.y = playerConfig.jumpPower;
                    playerConfig.onGround = false;
                }
                if (e.code === 'KeyR') reloadWeapon();
            });
            document.addEventListener('keyup', (e) => keys[e.code] = false);
            document.addEventListener('mousemove', (e) => {
                if (!pointerLocked) return;
                yaw -= e.movementX * mouseSensitivity;
                pitch -= e.movementY * mouseSensitivity;
                pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
            });
            document.addEventListener('mousedown', (e) => {
                if (e.button === 0) {
                    playerConfig.isShooting = true;
                    shoot();
                } else if (e.button === 2) {
                    playerConfig.speed = playerConfig.baseSpeed * 0.7;
                }
            });
            document.addEventListener('mouseup', (e) => {
                if (e.button === 0) playerConfig.isShooting = false;
                if (e.button === 2) playerConfig.speed = playerConfig.baseSpeed;
            });
            document.addEventListener('pointerlockchange', () => {
                pointerLocked = document.pointerLockElement === renderer.domElement;
            });
        }

        function updateMoneyHUD() {
            const cashText = `$ ${playerEconomy.cash.toLocaleString('en-US')}`;
            const cashEl = document.getElementById('cashDisplay');
            if (cashEl) cashEl.textContent = cashText;
            const buyCash = document.getElementById('buyCash');
            if (buyCash) buyCash.textContent = cashText;
        }

        function modifyCash(delta) {
            playerEconomy.cash = Math.max(0, Math.min(ECONOMY_CONFIG.maxCash, playerEconomy.cash + delta));
            updateMoneyHUD();
        }

        function grantCash(amount) {
            if (amount > 0) {
                modifyCash(amount);
                gameLog.info('Créditos concedidos', { amount, total: playerEconomy.cash });
            }
        }

        function spendCash(amount) {
            if (playerEconomy.cash < amount) {
                gameLog.warn('Compra negada - fundos insuficientes', { cost: amount, total: playerEconomy.cash });
                return false;
            }
            modifyCash(-amount);
            gameLog.info('Créditos gastos', { amount, restante: playerEconomy.cash });
            return true;
        }

        function buildBuyMenu() {
            const tabs = document.getElementById('buyTabs');
            const grid = document.getElementById('buyItems');
            if (!tabs || !grid) return;
            tabs.innerHTML = '';
            SHOP_CATEGORIES.forEach(cat => {
                const tab = document.createElement('div');
                tab.className = `buy-tab${cat.id === currentBuyCategory ? ' active' : ''}`;
                tab.textContent = cat.label;
                tab.addEventListener('click', () => setBuyCategory(cat.id));
                tabs.appendChild(tab);
            });
            renderBuyItems();
        }

        function setBuyCategory(categoryId) {
            currentBuyCategory = categoryId;
            renderBuyItems();
        }

        function renderBuyItems() {
            const grid = document.getElementById('buyItems');
            if (!grid) return;
            grid.innerHTML = '';
            const category = SHOP_CATEGORIES.find(cat => cat.id === currentBuyCategory);
            if (!category) return;
            category.items.forEach(key => {
                const item = SHOP_ITEMS[key];
                if (!item) return;
                const card = document.createElement('div');
                card.className = 'buy-card';
                if (playerEconomy.cash < item.cost) card.classList.add('disabled');
                if (playerEconomy.ownedWeapons.has(item.key)) card.classList.add('owned');
                card.innerHTML = `
                    <h4>${item.name}</h4>
                    <p>${item.description}</p>
                    <div class="cost">$ ${item.cost}</div>
                `;
                card.addEventListener('click', () => attemptPurchase(item.key));
                grid.appendChild(card);
            });
            updateMoneyHUD();
        }

        function attemptPurchase(key) {
            if (!playerEconomy.canBuy) {
                gameLog.warn('Compra bloqueada fora da fase de compra', { item: key });
                return;
            }
            const item = SHOP_ITEMS[key];
            if (!item) {
                gameLog.error('Item inexistente no menu de compra', { itemKey: key });
                return;
            }
            if (playerEconomy.ownedWeapons.has(key)) {
                gameLog.warn('Item já possuído', { item: key });
                return;
            }
            if (!spendCash(item.cost)) return;
            playerEconomy.ownedWeapons.add(key);
            playerEconomy.purchasedThisRound.add(key);
            refillWeapon(key);
            switchWeapon(key);
            renderBuyItems();
            gameLog.info('Compra realizada', { item: key, cost: item.cost });
        }

        function refillWeapon(key) {
            const weapon = playerConfig.weapons[key];
            if (!weapon) return;
            weapon.ammo = weapon.clipSize;
            weapon.reserve = weapon.maxAmmo;
        }

        function showBuyPanel() {
            if (!playerEconomy.canBuy) return;
            const panel = document.getElementById('buyPanel');
            if (panel) {
                panel.style.display = 'block';
                buildBuyMenu();
                playerEconomy.buyPanelOpen = true;
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
            }
        }

        function hideBuyPanel() {
            const panel = document.getElementById('buyPanel');
            if (panel) {
                panel.style.display = 'none';
                playerEconomy.buyPanelOpen = false;
                if (!pointerLocked && renderer && renderer.domElement) {
                    renderer.domElement.requestPointerLock();
                }
            }
        }

        function toggleBuyPanel() {
            if (matchState.phase !== 'buy' || matchState.matchOver) return;
            if (!playerEconomy.canBuy) return;
            if (playerEconomy.buyPanelOpen) {
                hideBuyPanel();
            } else {
                showBuyPanel();
            }
        }

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        function prepareTeams() {
            teams.alpha.agents = [];
            teams.bravo.agents = [];
            playerAgent = createAgent('VOCÊ', 'alpha', true);
            teams.alpha.agents.push(playerAgent);

            for (let i = 1; i < MATCH_CONFIG.teamSize; i++) {
                teams.alpha.agents.push(createAgent(`VGD-${i}`, 'alpha'));
            }
            for (let i = 0; i < MATCH_CONFIG.teamSize; i++) {
                teams.bravo.agents.push(createAgent(`LEG-${i}`, 'bravo'));
            }
            resetAgentsForRound();
            gameLog.info('Agentes preparados', {
                alphaBots: teams.alpha.agents.length - 1,
                bravoBots: teams.bravo.agents.length
            });
        }

        function createAgent(name, teamKey, isPlayer = false) {
            const config = TEAM_CONFIG[teamKey];
            const group = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 1), new THREE.MeshStandardMaterial({ color: config.color, emissive: config.color, emissiveIntensity: 0.18 }));
            body.position.y = 0.9;
            body.castShadow = true;
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
            head.position.y = 1.9;
            head.userData.isHead = true;
            head.castShadow = true;
            const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.12), new THREE.MeshStandardMaterial({ color: config.accent || '#ffffff', emissive: config.accent || '#ffffff', emissiveIntensity: 0.1 }));
            visor.position.set(0, 1.85, 0.35);
            group.add(body);
            group.add(head);
            group.add(visor);
            scene.add(group);

            head.userData.agent = body.userData.agent = group.userData.agent = {
                name,
                team: teamKey,
                mesh: group,
                hitboxes: [body, head],
                health: 100,
                maxHealth: 100,
                alive: true,
                weapon: ['rifle','smg','pistol'][Math.floor(Math.random()*3)],
                fireCooldown: 0,
                target: null,
                accuracy: THREE.MathUtils.randFloat(0.55, 0.8),
                aggression: THREE.MathUtils.randFloat(0.5, 1.1),
                isPlayer,
                suppression: 0,
                role: teamKey === 'alpha' ? (Math.random() < 0.45 ? 'planter' : 'assault') : (Math.random() < 0.5 ? 'site-defense' : 'hunter'),
                objectiveSiteIndex: Math.floor(Math.random() * Math.max(1, STRATEGIC_MAP.bombSites.length)),
                actionProgress: 0,
                currentAction: null,
                lastKnownEnemyPosition: null,
                lastKnownEnemyAt: 0
            };
            return group.userData.agent;
        }

        function resetAgentsForRound() {
            teams.alpha.agents.forEach((agent, idx) => {
                const spawn = TEAM_CONFIG.alpha.spawns[idx % TEAM_CONFIG.alpha.spawns.length];
                resetAgent(agent, spawn);
            });
            teams.bravo.agents.forEach((agent, idx) => {
                const spawn = TEAM_CONFIG.bravo.spawns[idx % TEAM_CONFIG.bravo.spawns.length];
                resetAgent(agent, spawn);
            });
            playerConfig.position.copy(TEAM_CONFIG.alpha.spawns[0]);
            playerConfig.position.y = 2;
            camera.position.copy(playerConfig.position);
            playerConfig.velocity.set(0, 0, 0);
            playerConfig.health = playerConfig.maxHealth;
            playerConfig.isReloading = false;
            Object.entries(playerConfig.weapons).forEach(([key, weapon]) => {
                if (playerEconomy.ownedWeapons.has(key)) {
                    weapon.ammo = weapon.clipSize;
                    weapon.reserve = weapon.maxAmmo;
                } else {
                    weapon.ammo = 0;
                    weapon.reserve = 0;
                }
            });
            if (!playerEconomy.ownedWeapons.has(playerConfig.currentWeapon)) {
                playerConfig.currentWeapon = 'pistol';
            }
            exitSpectatorView();
            updateHUD();
        }

        function resetAgent(agent, spawn) {
            agent.health = agent.maxHealth;
            agent.alive = true;
            agent.mesh.visible = true;
            agent.mesh.position.set(spawn.x, 0, spawn.z);
            agent.mesh.rotation.y = agent.team === 'alpha' ? Math.PI / 4 : -Math.PI / 4;
            agent.weapon = agent.isPlayer ? playerConfig.currentWeapon : agent.weapon;
            if (agent.isPlayer) {
                agent.hitboxes.forEach(mesh => {
                    if (mesh.material) {
                        mesh.material.transparent = true;
                        mesh.material.opacity = 0;
                    }
                });
            } else {
                agent.hitboxes.forEach(mesh => {
                    if (mesh.material) {
                        mesh.material.transparent = false;
                        mesh.material.opacity = 1;
                    }
                });
            }
            agent.actionProgress = 0;
            agent.currentAction = null;
        }

        function canMove() {
            return pointerLocked && matchState.phase === 'action' && !matchState.matchOver && !spectatorState.active;
        }

        function handleMovement(delta) {
            const move = new THREE.Vector3();
            if (keys['KeyW']) move.z -= 1;
            if (keys['KeyS']) move.z += 1;
            if (keys['KeyA']) move.x -= 1;
            if (keys['KeyD']) move.x += 1;
            if (move.lengthSq() > 0) move.normalize();

            const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
            const right = new THREE.Vector3(forward.z, 0, -forward.x);
            const desired = new THREE.Vector3();
            desired.addScaledVector(forward, move.z);
            desired.addScaledVector(right, move.x);
            if (desired.lengthSq() > 0) desired.normalize();

            previousPlayerPosition.copy(playerConfig.position);
            playerConfig.velocity.x = desired.x * playerConfig.speed;
            playerConfig.velocity.z = desired.z * playerConfig.speed;
            playerConfig.velocity.y -= playerConfig.gravity * delta;
            playerConfig.position.addScaledVector(playerConfig.velocity, delta);
            resolvePositionAgainstWorld(playerConfig.position, previousPlayerPosition, playerConfig.radius || 0.6);

            if (playerConfig.position.y <= 2) {
                playerConfig.position.y = 2;
                playerConfig.velocity.y = 0;
                playerConfig.onGround = true;
            }

            camera.position.copy(playerConfig.position);
            if (playerAgent) {
                playerAgent.mesh.position.set(playerConfig.position.x, 0, playerConfig.position.z);
            }
            camera.rotation.set(pitch, yaw, 0, 'YXZ');
        }

        function switchWeapon(key) {
            if (!playerConfig.weapons[key]) return;
            if (!playerEconomy.ownedWeapons.has(key)) {
                gameLog.warn('Tentativa de usar arma não comprada', { weapon: key });
                return;
            }
            playerConfig.currentWeapon = key;
            updateHUD();
            gameLog.info('Troca de arma', { weapon: key });
        }

        function reloadWeapon() {
            const weapon = playerConfig.weapons[playerConfig.currentWeapon];
            if (weapon.ammo === weapon.clipSize || weapon.reserve <= 0) {
                gameLog.warn('Recarregamento ignorado', { weapon: playerConfig.currentWeapon, ammo: weapon.ammo, reserve: weapon.reserve });
                return;
            }
            playerConfig.isReloading = true;
            setTimeout(() => {
                const needed = weapon.clipSize - weapon.ammo;
                const used = Math.min(needed, weapon.reserve);
                weapon.ammo += used;
                weapon.reserve -= used;
                playerConfig.isReloading = false;
                updateHUD();
                gameLog.info('Arma recarregada', { weapon: playerConfig.currentWeapon, ammo: weapon.ammo, reserve: weapon.reserve });
            }, 1200);
        }

        function canShoot() {
            if (!pointerLocked || spectatorState.active) return false;
            if (playerConfig.isReloading) return false;
            if (matchState.phase !== 'action') return false;
            const weapon = playerConfig.weapons[playerConfig.currentWeapon];
            if (!weapon || weapon.ammo <= 0) return false;
            return true;
        }

        function shoot() {
            if (!playerAgent) return;
            if (!canShoot()) return;
            const now = performance.now();
            const weapon = playerConfig.weapons[playerConfig.currentWeapon];
            if (now - playerConfig.lastShot < weapon.fireRate) return;

            playerConfig.lastShot = now;
            weapon.ammo--;
            updateHUD();
            if (typeof trackShot === 'function') trackShot(playerConfig.currentWeapon);

            const origin = camera.position.clone();
            const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const spread = playerConfig.currentWeapon === 'rifle' ? 0.01 : 0.02;
            direction.x += THREE.MathUtils.randFloatSpread(spread);
            direction.y += THREE.MathUtils.randFloatSpread(spread * 0.6);
            direction.z += THREE.MathUtils.randFloatSpread(spread);
            direction.normalize();

            performShot({ origin, direction, damage: weapon.damage, shooter: playerAgent, weaponKey: playerConfig.currentWeapon });
            applyRecoil(weapon.recoil);
            if (weapon.auto && playerConfig.isShooting) {
                setTimeout(shoot, weapon.fireRate);
            }
        }

        function applyRecoil(recoil) {
            recoilState.pitch += recoil.yaw * 0.01;
            recoilState.yaw += recoil.pitch * THREE.MathUtils.randFloatSpread(0.5);
        }

        function performShot({ origin, direction, damage, shooter, weaponKey }) {
            // Use a muzzle/start position slightly forward of the origin to avoid self-intersections
            const startPos = origin.clone().add(direction.clone().multiplyScalar(0.6));
            // Slight upward offset when the shooter is the player to match camera height
            if (shooter && shooter.isPlayer) startPos.y += (playerConfig.height || 1.8) * 0.35;

            const ray = new THREE.Raycaster(startPos, direction);
            const enemyMeshes = getEnemyHitboxes(shooter.team);
            // Use recursive intersects to catch nested meshes inside Groups
            const hits = enemyMeshes.length ? ray.intersectObjects(enemyMeshes, true) : [];
            const wallHits = worldColliders.length ? ray.intersectObjects(worldColliders, true) : [];
            let impactPoint = startPos.clone().add(direction.clone().multiplyScalar(120));

            const wallDistance = wallHits.length ? wallHits[0].distance : Infinity;
            const enemyDistance = hits.length ? hits[0].distance : Infinity;

            if (wallDistance < enemyDistance) {
                // Wall blocks the shot before reaching an enemy
                impactPoint = wallHits[0].point;
            } else if (hits.length) {
                const hit = hits[0];
                impactPoint = hit.point;
                const agent = hit.object.userData.agent;
                if (agent && agent.alive) {
                    const finalDamage = hit.object.userData.isHead ? damage * 1.8 : damage;
                    applyDamage(agent, finalDamage, shooter);
                    if (typeof trackHit === 'function') trackHit(weaponKey, hit.object.userData.isHead);
                }
            } else if (wallHits.length) {
                // No enemy hit, but hit a wall
                impactPoint = wallHits[0].point;
            }

            // Draw tracer from muzzle/start position to the actual impact
            createTracer(startPos, impactPoint, shooter.team === 'alpha' ? 0x00ffd5 : 0xff6b6b);
        }

        function getEnemyHitboxes(teamKey) {
            const enemyTeam = teamKey === 'alpha' ? teams.bravo : teams.alpha;
            return enemyTeam.agents.filter(a => a.alive).flatMap(agent => agent.hitboxes);
        }

        function applyDamage(agent, amount, attacker) {
            agent.health -= amount;
            if (agent.isPlayer) {
                playerConfig.health = Math.max(0, agent.health);
                updateHUD();
                gameLog.warn('Jogador recebeu dano', {
                    amount,
                    restante: Math.max(0, agent.health),
                    atacante: attacker ? attacker.name : 'desconhecido'
                });
            }
            if (agent.health <= 0) {
                agent.alive = false;
                if (!agent.isPlayer) agent.mesh.visible = false;
                if (agent.isPlayer) {
                    playerEconomy.aliveThisRound = false;
                    playerConfig.currentWeapon = 'pistol';
                    playerConfig.velocity.set(0, 0, 0);
                    playerConfig.isReloading = false;
                    playerConfig.isShooting = false;
                    agent.mesh.visible = false;
                    enterSpectatorView();
                    gameLog.error('Jogador eliminado', {
                        round: matchState.round,
                        atacante: attacker ? attacker.name : 'desconhecido'
                    });
                }
                registerKill(attacker, agent);
            }
        }

        function registerKill(attacker, victim) {
            const entry = `${attacker.name} ▸ ${victim.name}`;
            killFeed.unshift({ text: entry, color: TEAM_CONFIG[attacker.team].accent, time: performance.now() });
            if (killFeed.length > 6) killFeed.pop();
            if (attacker.isPlayer) {
                if (typeof trackKill === 'function') trackKill(false);
                grantCash(ECONOMY_CONFIG.killReward);
            }
            if (!victim.isPlayer && attacker.isPlayer) playerStats.kills++;
            if (victim.isPlayer) playerStats.deaths++;
            updateKillfeed();
            checkRoundEnd();
            gameLog.info('Abate registrado', {
                atacante: attacker ? attacker.name : 'desconhecido',
                vitima: victim ? victim.name : 'desconhecido',
                atacanteTime: attacker ? attacker.team : 'n/a'
            });
        }

        function checkRoundEnd() {
            const alphaAlive = teams.alpha.agents.filter(a => a.alive).length;
            const bravoAlive = teams.bravo.agents.filter(a => a.alive).length;
            if (alphaAlive === 0) {
                endRound('bravo', 'Alpha eliminada');
            } else if (bravoAlive === 0) {
                endRound('alpha', 'Bravo eliminada');
            }
        }

        function endRound(winner, reason) {
            if (matchState.phase === 'post' || matchState.matchOver) return;
            resetBombState();
            playerEconomy.canBuy = false;
            hideBuyPanel();
            matchState.phase = 'post';
            matchState.message = `${TEAM_CONFIG[winner].name} venceu • ${reason}`;
            matchState.postTimer = MATCH_CONFIG.postRoundSeconds;
            teams[winner].score++;
            matchState.round++;
            currentRound = matchState.round;
            showRoundMessage(true);
            updateHUD();
            resolveEconomyAfterRound(winner);
            if (teams[winner].score >= MATCH_CONFIG.roundsToWin) {
                declareWinner(winner);
            }
            gameLog.info('Round encerrado', {
                winner,
                reason,
                alphaScore: teams.alpha.score,
                bravoScore: teams.bravo.score
            });
        }

        function resolveEconomyAfterRound(winningTeam) {
            if (!playerAgent) return;
            const playerWon = playerAgent.team === winningTeam;
            if (playerWon) {
                grantCash(ECONOMY_CONFIG.winReward);
                playerEconomy.lossStreak = 0;
            } else {
                const lossReward = ECONOMY_CONFIG.lossRewardBase + (ECONOMY_CONFIG.lossRewardIncrement * playerEconomy.lossStreak);
                grantCash(lossReward);
                playerEconomy.lossStreak = Math.min(playerEconomy.lossStreak + 1, 4);
            }
            if (playerEconomy.aliveThisRound) {
                grantCash(ECONOMY_CONFIG.surviveBonus);
            } else {
                playerEconomy.ownedWeapons = new Set(['pistol']);
            }
            playerEconomy.aliveThisRound = true;
        }

        function showRoundMessage(show) {
            const el = document.getElementById('roundMessage');
            if (!el) return;
            el.style.display = show ? 'block' : 'none';
            el.textContent = matchState.message;
        }

        function declareWinner(teamKey) {
            matchState.matchOver = true;
            matchState.winner = teamKey;
            matchState.message = `${TEAM_CONFIG[teamKey].name} venceu a partida!`;
            showRoundMessage(true);
            playerEconomy.canBuy = false;
            hideBuyPanel();
            exitSpectatorView();
            if (typeof gameOver === 'function') {
                gameOver(teamKey === 'alpha');
            }
            gameLog.info('Partida concluída', { winner: teamKey, roundsPlayed: matchState.round });
        }

        function enterSpectatorView() {
            if (spectatorState.active) return;
            spectatorState.active = true;
            spectatorState.target.set(playerConfig.position.x, 0, playerConfig.position.z);
            spectatorOverlayEl?.classList.add('visible');
            playerConfig.isShooting = false;
            camera.position.set(spectatorState.target.x, spectatorState.cameraHeight, spectatorState.target.z);
            camera.lookAt(spectatorState.target);
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            gameLog.info('Visão aérea ativada', { round: matchState.round });
        }

        function exitSpectatorView() {
            if (!spectatorState.active) return;
            spectatorState.active = false;
            spectatorOverlayEl?.classList.remove('visible');
            gameLog.info('Visão aérea desativada');
        }

        function updateSpectatorCamera(delta) {
            if (!spectatorState.active) return;
            const focus = playerAgent ? playerAgent.mesh.position : tempVec.set(0, 0, 0);
            spectatorState.target.lerp(tempVec.set(focus.x, 0, focus.z), 0.08);
            const desired = tempVec.set(spectatorState.target.x, spectatorState.cameraHeight, spectatorState.target.z);
            camera.position.lerp(desired, 0.08);
            camera.lookAt(spectatorState.target);
        }

        function startRound() {
            matchState.phase = 'buy';
            matchState.buyTimer = MATCH_CONFIG.buyPhaseSeconds;
            matchState.roundTimer = MATCH_CONFIG.roundDuration;
            matchState.message = '';
            showRoundMessage(false);
            resetAgentsForRound();
            resetBombState();
            playerEconomy.canBuy = true;
            playerEconomy.ownedWeapons.add('pistol');
            playerEconomy.purchasedThisRound = new Set();
            playerEconomy.aliveThisRound = true;
            showBuyPanel();
            updateHUD();
            gameLog.info('Nova rodada', {
                round: matchState.round,
                alphaScore: teams.alpha.score,
                bravoScore: teams.bravo.score
            });
        }

        function updateMatchTimers(delta) {
            if (matchState.matchOver) return;
            if (matchState.phase === 'buy') {
                matchState.buyTimer -= delta;
                if (matchState.buyTimer <= 0) {
                    matchState.phase = 'action';
                    playerEconomy.canBuy = false;
                    hideBuyPanel();
                }
            } else if (matchState.phase === 'action') {
                matchState.roundTimer -= delta;
                // update bomb timer
                if (bombState.planted) {
                    bombState.timer = Math.max(0, bombState.timer - delta);
                    if (bombState.timer <= 0) {
                        // bomb exploded - winning team is the one who planted
                        endRound(bombState.plantedBy, 'Bomba explodiu');
                        gameLog.warn('Bomba explodiu', { siteIndex: bombState.siteIndex });
                    }
                }
                if (matchState.roundTimer <= 0 && !bombState.planted) {
                    endRound('bravo', 'Tempo esgotado');
                    gameLog.warn('Round encerrado por tempo');
                }
            } else if (matchState.phase === 'post') {
                matchState.postTimer -= delta;
                if (matchState.postTimer <= 0 && !matchState.matchOver) {
                    nextRound();
                }
            }
            updateHUD();
        }

        function attemptInteract() {
            if (matchState.phase !== 'action') return;
            const playerPos = playerConfig.position;
            // check for plant
            for (let i = 0; i < BOMB_CONFIG.plantSites.length; i++) {
                const site = BOMB_CONFIG.plantSites[i];
                const siteMeta = STRATEGIC_MAP.bombSites[i];
                const siteLabel = siteMeta ? siteMeta.label : `Site ${i + 1}`;
                const horizontalDist = Math.hypot(playerPos.x - site.x, playerPos.z - site.z);
                if (horizontalDist < 3) {
                    // if not planted, begin plant as Alpha team player
                    if (!bombState.planted && playerAgent && playerAgent.team === 'alpha') {
                        bombState.plantProgress = 0.01;
                        bombState.plantedBy = 'alpha';
                        gameLog.info('Plant iniciada', { site: siteLabel });
                        // start incremental planting over time
                        const interval = setInterval(() => {
                            if (matchState.phase !== 'action' || bombState.planted) { clearInterval(interval); return; }
                            bombState.plantProgress += 0.2;
                            document.getElementById('objectiveInfo').textContent = `Plantando ${siteLabel}... ${Math.floor(bombState.plantProgress * 100)}%`;
                            if (bombState.plantProgress >= 1) {
                                completeBombPlant(i, playerAgent.team, { author: playerAgent.name, awardCash: true });
                                clearInterval(interval);
                            }
                        }, BOMB_CONFIG.plantTime * 200);
                        return;
                    }
                    // if bomb planted and opponent near, attempt defuse
                    if (bombState.planted && playerAgent && playerAgent.team !== bombState.plantedBy) {
                        bombState.defuseProgress = 0.01;
                        gameLog.info('Defuse iniciado', { site: siteLabel });
                        const interval = setInterval(() => {
                            if (!bombState.planted) { clearInterval(interval); return; }
                            bombState.defuseProgress += 0.1;
                            document.getElementById('objectiveInfo').textContent = `Desarmando ${siteLabel}... ${Math.floor(bombState.defuseProgress * 100)}%`;
                            if (bombState.defuseProgress >= 1) {
                                // defuse successful
                                completeBombDefuse(playerAgent.team, { author: playerAgent.name, awardCash: true });
                                clearInterval(interval);
                            }
                        }, BOMB_CONFIG.defuseTime * 100);
                        return;
                    }
                }
            }
        }

        function updateBots(delta) {
            if (matchState.phase !== 'action') return;
            const allAgents = [...teams.alpha.agents, ...teams.bravo.agents]
                .filter(agent => agent.alive && !agent.isPlayer);
            const now = performance.now();
            allAgents.forEach(agent => {
                if (matchState.phase !== 'action') {
                    return;
                }
                if (!agent.target || !agent.target.alive) {
                    agent.target = pickTarget(agent);
                }
                const pos = agent.mesh.position;
                tempVec2.copy(pos);
                let enemyPos = null;
                let enemyDistance = Infinity;
                let enemyVisible = false;
                if (agent.target) {
                    enemyPos = agent.target.isPlayer ? playerConfig.position.clone() : agent.target.mesh.position.clone();
                    enemyDistance = enemyPos.distanceTo(pos);
                    enemyVisible = hasLineOfSight(pos, enemyPos);
                }

                if (enemyVisible && enemyPos) {
                    agent.lastKnownEnemyPosition = enemyPos.clone();
                    agent.lastKnownEnemyAt = now;
                } else if (agent.lastKnownEnemyPosition && now - (agent.lastKnownEnemyAt || 0) > 8000) {
                    agent.lastKnownEnemyPosition = null;
                }

                const goal = determineBotGoal(agent, enemyPos, enemyDistance, enemyVisible);
                if (goal) {
                    tempVec3.copy(goal).sub(pos);
                    const goalDistance = tempVec3.length();
                    if (goalDistance > 0.1) {
                        tempVec3.normalize();
                        const moveSpeed = (agent.team === 'alpha' ? 4.3 : 3.9) * agent.aggression;
                        pos.addScaledVector(tempVec3, moveSpeed * delta);
                    }
                } else if (enemyPos && enemyDistance < 18 && enemyVisible) {
                    const strafeDir = new THREE.Vector3(-(enemyPos.z - pos.z), 0, enemyPos.x - pos.x).normalize();
                    pos.addScaledVector(strafeDir, delta * 2.5);
                }

                pos.y = 0;
                resolvePositionAgainstWorld(pos, tempVec2, 0.8);
                handleBotObjectiveActions(agent, delta);
                if (enemyPos) {
                    attemptAIShoot(agent, now, enemyPos, enemyDistance, enemyVisible);
                }
            });
        }

        function pickTarget(agent) {
            const enemies = agent.team === 'alpha' ? teams.bravo.agents : teams.alpha.agents;
            const alive = enemies.filter(e => e.alive);
            if (alive.length === 0) return null;
            alive.sort((a, b) => a.mesh.position.distanceTo(agent.mesh.position) - b.mesh.position.distanceTo(agent.mesh.position));
            return alive[0];
        }

        function attemptAIShoot(agent, now, targetPos, distance, targetVisible) {
            if (!targetPos) return;
            const weapon = weaponsData[agent.weapon] || weaponsData.rifle;
            const cadence = weapon.fireRate * THREE.MathUtils.randFloat(0.9, 1.2);
            if (now - agent.fireCooldown < cadence) return;
            if (distance > 60) return;
            if (!targetVisible && distance > 5) return;

            const spread = THREE.MathUtils.lerp(0.01, 0.04, Math.min(distance / 60, 1));
            const muzzle = agent.mesh.position.clone().add(new THREE.Vector3(0, 1.6, 0));
            const aimPoint = targetPos.clone();
            aimPoint.y += agent.target && agent.target.isPlayer ? 0.2 : 1.2;
            if (!hasLineOfSight(muzzle, aimPoint)) {
                return;
            }
            const direction = aimPoint.sub(muzzle).normalize();
            direction.x += THREE.MathUtils.randFloatSpread(spread);
            direction.y += THREE.MathUtils.randFloatSpread(spread * 0.25);
            direction.z += THREE.MathUtils.randFloatSpread(spread);
            direction.y = THREE.MathUtils.clamp(direction.y, -0.35, 0.35);
            direction.normalize();
            agent.fireCooldown = now;
            performShot({ origin: muzzle, direction, damage: weapon.damage, shooter: agent, weaponKey: agent.weapon });
        }

        function updateTracers(delta) {
            tracers = tracers.filter(tracer => {
                tracer.life -= delta;
                if (tracer.life <= 0) {
                    scene.remove(tracer.mesh);
                    return false;
                }
                return true;
            });
        }

        function createTracer(start, end, color) {
            const material = new THREE.LineBasicMaterial({ color, linewidth: 2, transparent: true, opacity: 0.8 });
            const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
            const line = new THREE.Line(geometry, material);
            scene.add(line);
            tracers.push({ mesh: line, life: 0.08 });
        }

        function updateHUD() {
            updateMoneyHUD();
            document.getElementById('alphaScore').textContent = teams.alpha.score;
            document.getElementById('bravoScore').textContent = teams.bravo.score;
            document.getElementById('roundInfo').textContent = `ROUND ${matchState.round} • ${matchState.phase.toUpperCase()}`;
            let timerValue;
            if (bombState.planted && matchState.phase === 'action') {
                timerValue = bombState.timer;
            } else if (matchState.phase === 'buy') {
                timerValue = matchState.buyTimer;
            } else if (matchState.phase === 'post') {
                timerValue = matchState.postTimer;
            } else {
                timerValue = matchState.roundTimer;
            }
            if (matchState.matchOver) {
                timerValue = 0;
            }
            document.getElementById('phaseTimer').textContent = formatTimer(timerValue);
            let objectiveText = '';
            if (bombState.planted) {
                const siteMeta = typeof bombState.siteIndex === 'number' ? STRATEGIC_MAP.bombSites[bombState.siteIndex] : null;
                const label = siteMeta ? siteMeta.label : 'Site';
                objectiveText = `Bomba plantada em ${label} • ${formatTimer(bombState.timer)}`;
            } else if (matchState.phase === 'buy') {
                objectiveText = 'Compra liberada — prepare seu plano';
            } else if (matchState.phase === 'action') {
                objectiveText = 'Elimine o time inimigo ou garanta o objetivo';
            } else {
                objectiveText = matchState.matchOver ? 'Partida encerrada' : 'Próxima rodada em breve';
            }
            document.getElementById('objectiveInfo').textContent = objectiveText;
            const hpPercent = Math.max(0, playerConfig.health) / playerConfig.maxHealth * 100;
            document.getElementById('healthFill').style.width = `${hpPercent}%`;
            const weapon = playerConfig.weapons[playerConfig.currentWeapon];
            document.getElementById('weapon').textContent = weapon.name;
            document.getElementById('ammo').textContent = `${weapon.ammo} / ${weapon.reserve}`;
        }

        function formatTimer(value) {
            const clamped = Math.max(0, value);
            const minutes = Math.floor(clamped / 60).toString().padStart(2, '0');
            const seconds = Math.floor(clamped % 60).toString().padStart(2, '0');
            return `${minutes}:${seconds}`;
        }

        function updateKillfeed() {
            const now = performance.now();
            killFeed = killFeed.filter(entry => now - entry.time < 6000);
            const feed = document.getElementById('killfeed');
            feed.innerHTML = '';
            killFeed.forEach(entry => {
                const div = document.createElement('div');
                div.className = 'killfeed-entry';
                div.style.color = entry.color;
                div.textContent = entry.text;
                feed.appendChild(div);
            });
        }

        function initMinimap() {
            minimapCanvas = document.getElementById('minimap');
            minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
        }

        function worldToMinimap(vec) {
            const x = MINIMAP_PADDING + (vec.x + MAP_HALF_EXTENT) * MINIMAP_SCALE;
            const y = MINIMAP_PADDING + (MAP_HALF_EXTENT - vec.z) * MINIMAP_SCALE;
            return { x, y };
        }

        function renderMinimap() {
            if (!minimapCtx) return;
            minimapCtx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
            minimapCtx.fillStyle = 'rgba(6, 10, 18, 0.85)';
            minimapCtx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
            minimapCtx.strokeStyle = 'rgba(255,255,255,0.12)';
            minimapCtx.strokeRect(MINIMAP_PADDING, MINIMAP_PADDING, MINIMAP_SIZE - MINIMAP_PADDING * 2, MINIMAP_SIZE - MINIMAP_PADDING * 2);

            STRATEGIC_MAP.bombSites.forEach(site => {
                const pos = worldToMinimap(site.position);
                minimapCtx.fillStyle = `rgba(${(site.color >> 16) & 255}, ${(site.color >> 8) & 255}, ${site.color & 255}, 0.6)`;
                minimapCtx.beginPath();
                minimapCtx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
                minimapCtx.fill();
                minimapCtx.fillStyle = '#0f111a';
                minimapCtx.font = '10px Space Grotesk, sans-serif';
                minimapCtx.textAlign = 'center';
                minimapCtx.fillText(site.id, pos.x, pos.y + 3);
            });

            if (bombState.planted && typeof bombState.siteIndex === 'number') {
                const plantedSite = STRATEGIC_MAP.bombSites[bombState.siteIndex];
                if (plantedSite) {
                    const pos = worldToMinimap(plantedSite.position);
                    minimapCtx.strokeStyle = '#ffdf5d';
                    minimapCtx.lineWidth = 2;
                    minimapCtx.beginPath();
                    minimapCtx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
                    minimapCtx.stroke();
                }
            }

            const playerPos = worldToMinimap(playerConfig.position);
            minimapCtx.fillStyle = '#00ffd5';
            minimapCtx.beginPath();
            minimapCtx.arc(playerPos.x, playerPos.y, 5, 0, Math.PI * 2);
            minimapCtx.fill();
            const dirX = Math.sin(yaw);
            const dirY = Math.cos(yaw);
            minimapCtx.strokeStyle = '#00ffd5';
            minimapCtx.beginPath();
            minimapCtx.moveTo(playerPos.x, playerPos.y);
            minimapCtx.lineTo(playerPos.x + dirX * 12, playerPos.y - dirY * 12);
            minimapCtx.stroke();

            const drawAgents = (agents, color) => {
                minimapCtx.fillStyle = color;
                agents.filter(a => a.alive).forEach(agent => {
                    const pos = worldToMinimap(agent.mesh.position);
                    minimapCtx.beginPath();
                    minimapCtx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
                    minimapCtx.fill();
                });
            };

            drawAgents(teams.alpha.agents.filter(a => !a.isPlayer), '#5ad0ff');
            drawAgents(teams.bravo.agents, '#ff6464');
        }

        function animate() {
            requestAnimationFrame(animate);
            const delta = clock.getDelta();
            updateMatchTimers(delta);
            if (canMove()) handleMovement(delta);
            if (pointerLocked) camera.rotation.set(pitch + recoilState.pitch, yaw + recoilState.yaw, 0, 'YXZ');
            recoilState.pitch = THREE.MathUtils.lerp(recoilState.pitch, 0, 0.1);
            recoilState.yaw = THREE.MathUtils.lerp(recoilState.yaw, 0, 0.1);
            updateBots(delta);
            updateTracers(delta);
            if (spectatorState.active) {
                updateSpectatorCamera(delta);
            }
            renderMinimap();
            renderer.render(scene, camera);
        }

        function startMatchSession() {
            if (typeof startGameSession === 'function') {
                gameLog.info('Solicitando início de sessão no backend');
                startGameSession('Tático 5v5');
            }
        }

        function endMatchSession() {
            const score = teams.alpha.score * 1500 + playerStats.kills * 150;
            console.log('Resumo da partida', { round: matchState.round, score, kills: playerStats.kills });
            gameLog.info('Resumo da partida enviado', { round: matchState.round, score, kills: playerStats.kills });
        }

        function gameOver(playerWon = false) {
            endMatchSession();
            matchState.matchOver = true;
            gameLog.info('gameOver chamado', { playerWon });
        }

        function nextRound() {
            startRound();
        }

        function showDamageNumber() { }
        function checkDeadEnemies() { }

        function calculateScore() {
            return teams.alpha.score * 1500 + playerStats.kills * 100;
        }

        function validateCustomMapReady() {
            if (CURRENT_QUEUE_TYPE !== 'custom') return true;
            if (ACTIVE_CUSTOM_MAP) return true;
            const message = customMapLoadError || 'Não foi possível carregar o mapa custom. Retorne ao launcher e selecione outro mapa.';
            alert(message);
            gameLog.error('Tentativa de iniciar custom sem payload', { mapId: REQUESTED_CUSTOM_MAP_ID });
            return false;
        }

        const startButton = document.getElementById('startButton');
        if (startButton) {
            startButton.addEventListener('click', () => {
                if (!validateCustomMapReady()) return;
                document.getElementById('startScreen').style.display = 'none';
                gameLog.info('Partida tática iniciada via botão', {
                    queue: CURRENT_QUEUE_TYPE || 'unknown',
                    mapId: ACTIVE_CUSTOM_MAP?.id || null
                });
                playerEconomy.cash = ECONOMY_CONFIG.startCash;
                playerEconomy.ownedWeapons = new Set(['pistol']);
                playerEconomy.lossStreak = 0;
                playerEconomy.canBuy = false;
                playerEconomy.buyPanelOpen = false;
                playerEconomy.aliveThisRound = true;
                updateMoneyHUD();
                renderer.domElement.requestPointerLock();
                prepareTeams();
                startMatchSession();
                nextRound();
            });
        }

        updateMoneyHUD();
        initMinimap();
        init();

        window.addEventListener('error', (event) => {
            gameLog.error('Erro JS não tratado', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            gameLog.error('Promise rejeitada sem tratamento', {
                reason: event.reason ? (event.reason.message || String(event.reason)) : 'unknown'
            });
        });

console.log('Modo tático 5v5 carregado');
