let scene, camera, renderer, player, enemies = [], lootItems = [], collidableObjects = [];
        const worldObstacles = [];
        const houseInteriorZones = [];
        let introPlane = null;
        let planeActive = false;
        let planeDirection = null;
        const planeConfig = {
            start: new THREE.Vector3(-220, 90, 140),
            end: new THREE.Vector3(220, 60, -140),
            speed: 45
        };
        let gameStarted = false, pointerLocked = false, keys = {}, yaw = 0, pitch = 0;
        let targetYaw = 0, targetPitch = 0; // Rotação suavizada
        let playersAlive = 10, playerKills = 0, gameTime = 0, gameTimer;
        let mouseSensitivity = 0.002;
        const cameraSmoothing = 0.5; // Fator de suavização (menor = mais suave)
        
        // Controle de FPS para evitar pulos de câmera em monitores de alta taxa
        const TARGET_FPS = 60;
        const FRAME_TIME = 1000 / TARGET_FPS;
        let lastFrameTime = 0;
        let frameAccumulator = 0;

        const playerConfig = {
            position: new THREE.Vector3(Math.random() * 150 - 75, 10, Math.random() * 150 - 75),
            height: 2.0,
            radius: 0.5,
            speed: 20.0,
            jumpPower: 12.0,
            gravity: 25.0,
            velocity: new THREE.Vector3(),
            onGround: false,
            health: 100,
            maxHealth: 100,
            weapons: {
                pistol: { name: 'Pistola', ammo: 0, maxAmmo: 60, clipSize: 12, damage: 20, fireRate: 250, auto: false, hasWeapon: false, recoil: { v_kick: 0.012, h_kick: 0.006 } },
                smg: { name: 'SMG', ammo: 0, maxAmmo: 120, clipSize: 30, damage: 12, fireRate: 100, auto: true, hasWeapon: false, recoil: { v_kick: 0.030, h_kick: 0.016 } },
                rifle: { name: 'Rifle', ammo: 0, maxAmmo: 120, clipSize: 30, damage: 25, fireRate: 150, auto: true, hasWeapon: false, recoil: { v_kick: 0.040, h_kick: 0.020 } },
                sniper: { name: 'Sniper', ammo: 0, maxAmmo: 25, clipSize: 5, damage: 100, fireRate: 1200, auto: false, hasWeapon: false, recoil: { v_kick: 0.18, h_kick: 0.06 } },
                shotgun: { name: 'Shotgun', ammo: 0, maxAmmo: 32, clipSize: 8, damage: 15, fireRate: 900, auto: false, hasWeapon: false, pellets: 8, recoil: { v_kick: 0.10, h_kick: 0.030 } },
                bazooka: { name: 'Bazuca', ammo: 0, maxAmmo: 5, clipSize: 1, damage: 150, fireRate: 2500, auto: false, hasWeapon: false, recoil: { v_kick: 0.24, h_kick: 0.08 } }
            },
            currentWeapon: null,
            lastShot: 0,
            isReloading: false,
            isShooting: false
        };
        const PLAYER_TARGET = { position: playerConfig.position, userData: playerConfig, isPlayer: true };

        const recoilConfig = { recoverySpeed: 5, dampening: 0.92, sustainedFireGrowth: 1.4, maxSustainedFireMultiplier: 2 };
        const recoilState = { pitch: 0, yaw: 0, sustainedFireMultiplier: 0.6 };
        const AI_BALANCE = {
            accuracyRange: [0.35, 0.6],
            closeRangeSpread: 0.08,
            longRangeSpread: 0.02,
            reactionDelayMs: [250, 600],
            burstDurationMs: [800, 1500],
            burstPauseMs: [900, 1600]
        };

        // AI Players data
        const aiPlayers = [];
        const playerNames = ['Bot_Alpha', 'Bot_Bravo', 'Bot_Charlie', 'Bot_Delta', 'Bot_Echo', 'Bot_Foxtrot', 'Bot_Golf', 'Bot_Hotel', 'Bot_India'];

        function init() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x87ceeb);
            scene.fog = new THREE.Fog(0x87ceeb, 50, 300);

            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.copy(playerConfig.position);

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            document.body.appendChild(renderer.domElement);

            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            scene.add(ambientLight);

            const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(50, 100, 50);
            dirLight.castShadow = true;
            dirLight.shadow.camera.left = -150;
            dirLight.shadow.camera.right = 150;
            dirLight.shadow.camera.top = 150;
            dirLight.shadow.camera.bottom = -150;
            dirLight.shadow.mapSize.width = 2048;
            dirLight.shadow.mapSize.height = 2048;
            scene.add(dirLight);

            createBattleRoyaleMap();
            setupControls();
            updateHUD();
            updateLeaderboard();

            document.getElementById('startButton').addEventListener('click', startGame);
            document.getElementById('restartButton').addEventListener('click', () => location.reload());

            animate();
        }

        function createBattleRoyaleMap() {
            // Chão grande
            const groundGeo = new THREE.BoxGeometry(200, 1, 200);
            const groundMat = new THREE.MeshStandardMaterial({ color: 0x228b22 });
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.position.set(0, -0.5, 0);
            ground.receiveShadow = true;
            scene.add(ground);
            const groundBox = new THREE.Box3().setFromObject(ground);
            collidableObjects.push(groundBox);
            worldObstacles.push(ground);

            // Criar 8 casas espalhadas pelo mapa
            const housePositions = [
                { x: -60, z: -60 }, { x: 60, z: -60 }, { x: -60, z: 60 }, { x: 60, z: 60 },
                { x: 0, z: -70 }, { x: -70, z: 0 }, { x: 70, z: 0 }, { x: 0, z: 70 }
            ];

            housePositions.forEach((pos, idx) => {
                createHouse(pos.x, pos.z, idx);
            });

            // Muros no perímetro
            const wallHeight = 10;
            const wallThickness = 2;
            
            // Parede Norte
            createWall(0, wallHeight / 2, -100, 200, wallHeight, wallThickness);
            // Parede Sul
            createWall(0, wallHeight / 2, 100, 200, wallHeight, wallThickness);
            // Parede Leste
            createWall(100, wallHeight / 2, 0, wallThickness, wallHeight, 200);
            // Parede Oeste
            createWall(-100, wallHeight / 2, 0, wallThickness, wallHeight, 200);
        }

        function createHouse(x, z, houseId) {
            const houseSize = 15;
            const wallHeight = 8;
            const wallThickness = 0.5;

            // Piso da casa
            const floorGeo = new THREE.BoxGeometry(houseSize, 0.5, houseSize);
            const floorMat = new THREE.MeshStandardMaterial({ color: 0x8b7355 });
            const floor = new THREE.Mesh(floorGeo, floorMat);
            floor.position.set(x, 0.25, z);
            floor.receiveShadow = true;
            scene.add(floor);

            // Paredes externas
            const wallMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c });
            
            // Parede frontal (com porta)
            createWallSegment(x - houseSize/4, wallHeight/2, z - houseSize/2, houseSize/2 - 2, wallHeight, wallThickness, wallMat);
            createWallSegment(x + houseSize/4, wallHeight/2, z - houseSize/2, houseSize/2 - 2, wallHeight, wallThickness, wallMat);
            createWallSegment(x, wallHeight - 1, z - houseSize/2, 4, 2, wallThickness, wallMat);
            
            // Parede traseira
            createWallSegment(x, wallHeight/2, z + houseSize/2, houseSize, wallHeight, wallThickness, wallMat);
            
            // Paredes laterais
            createWallSegment(x - houseSize/2, wallHeight/2, z, wallThickness, wallHeight, houseSize, wallMat);
            createWallSegment(x + houseSize/2, wallHeight/2, z, wallThickness, wallHeight, houseSize, wallMat);

            // Teto
            const roofGeo = new THREE.BoxGeometry(houseSize + 1, 0.5, houseSize + 1);
            const roofMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
            const roof = new THREE.Mesh(roofGeo, roofMat);
            roof.position.set(x, wallHeight, z);
            roof.castShadow = true;
            roof.receiveShadow = true;
            scene.add(roof);
            collidableObjects.push(new THREE.Box3().setFromObject(roof));
            worldObstacles.push(roof);

            const interiorBounds = new THREE.Box3(
                new THREE.Vector3(x - houseSize / 2 + 0.8, 0, z - houseSize / 2 + 0.8),
                new THREE.Vector3(x + houseSize / 2 - 0.8, wallHeight, z + houseSize / 2 - 0.8)
            );
            const doorExit = new THREE.Vector3(x, 0, z - houseSize / 2 - 2);
            houseInteriorZones.push({ bounds: interiorBounds, doorExit });

            // Spawnar armas e itens dentro das casas
            if (Math.random() < 0.8) {
                const weaponTypes = ['pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'bazooka'];
                const weaponType = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
                spawnLoot(weaponType, new THREE.Vector3(x + (Math.random() - 0.5) * 10, 1, z + (Math.random() - 0.5) * 10));
            }
            
            // Spawnar itens de saúde e munição
            for (let i = 0; i < 2; i++) {
                const itemType = Math.random() < 0.5 ? 'health' : 'ammo';
                spawnLoot(itemType, new THREE.Vector3(x + (Math.random() - 0.5) * 10, 1, z + (Math.random() - 0.5) * 10));
            }
        }

        function createWallSegment(x, y, z, width, height, depth, material) {
            const wallGeo = new THREE.BoxGeometry(width, height, depth);
            const wall = new THREE.Mesh(wallGeo, material);
            wall.position.set(x, y, z);
            wall.castShadow = true;
            wall.receiveShadow = true;
            scene.add(wall);
            const wallBox = new THREE.Box3().setFromObject(wall);
            collidableObjects.push(wallBox);
            worldObstacles.push(wall);
        }

        function createWall(x, y, z, width, height, depth) {
            const wallGeo = new THREE.BoxGeometry(width, height, depth);
            const wallMat = new THREE.MeshStandardMaterial({ color: 0x808080 });
            const wall = new THREE.Mesh(wallGeo, wallMat);
            wall.position.set(x, y, z);
            wall.castShadow = true;
            wall.receiveShadow = true;
            scene.add(wall);
            const wallBox = new THREE.Box3().setFromObject(wall);
            collidableObjects.push(wallBox);
            worldObstacles.push(wall);
        }

        function createIntroPlane() {
            const planeGroup = new THREE.Group();
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd0d7e2, metalness: 0.6, roughness: 0.3 });
            const trimMat = new THREE.MeshStandardMaterial({ color: 0x0b64ff, emissive: 0x0b64ff, emissiveIntensity: 0.2, metalness: 0.5, roughness: 0.3 });

            const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 10, 12), bodyMat);
            fuselage.rotation.z = Math.PI / 2;
            planeGroup.add(fuselage);

            const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2, 12), trimMat);
            nose.rotation.z = Math.PI / 2;
            nose.position.x = 5;
            planeGroup.add(nose);

            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 8), trimMat);
            tail.rotation.z = -Math.PI / 2;
            tail.position.x = -5;
            planeGroup.add(tail);

            const wingGeo = new THREE.BoxGeometry(0.5, 5.5, 1.4);
            const leftWing = new THREE.Mesh(wingGeo, trimMat);
            leftWing.rotation.z = Math.PI / 2;
            leftWing.position.set(0, 0, 2.2);
            planeGroup.add(leftWing);
            const rightWing = leftWing.clone();
            rightWing.position.z = -2.2;
            planeGroup.add(rightWing);

            const stabilizerGeo = new THREE.BoxGeometry(0.3, 3, 0.8);
            const topStab = new THREE.Mesh(stabilizerGeo, trimMat);
            topStab.rotation.z = Math.PI / 2;
            topStab.position.set(-4.5, 1.2, 0);
            planeGroup.add(topStab);
            const bottomStab = topStab.clone();
            bottomStab.position.y = -1.2;
            planeGroup.add(bottomStab);

            planeGroup.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            return planeGroup;
        }

        function launchIntroPlane() {
            if (!scene) return;
            if (introPlane) {
                scene.remove(introPlane);
            }

            introPlane = createIntroPlane();
            introPlane.position.copy(planeConfig.start);
            planeDirection = new THREE.Vector3().subVectors(planeConfig.end, planeConfig.start).normalize();
            introPlane.lookAt(planeConfig.end.clone().setY(planeConfig.start.y));
            introPlane.userData = {
                distance: planeConfig.start.distanceTo(planeConfig.end),
                traveled: 0,
                swayOffset: Math.random() * Math.PI * 2
            };
            scene.add(introPlane);
            planeActive = true;
            showMessage('Avião sobrevoando o mapa!', 2500);
        }

        function updateIntroPlane(delta) {
            if (!planeActive || !introPlane || !planeDirection) return;

            const step = planeConfig.speed * delta;
            introPlane.position.add(planeDirection.clone().multiplyScalar(step));
            introPlane.userData.traveled += step;

            const swayTime = performance.now() * 0.002 + introPlane.userData.swayOffset;
            introPlane.position.y += Math.sin(swayTime) * 0.2;
            introPlane.rotation.x = Math.sin(swayTime * 0.8) * 0.05;
            introPlane.rotation.z = Math.cos(swayTime * 0.5) * 0.03;

            if (introPlane.userData.traveled >= introPlane.userData.distance + 60) {
                scene.remove(introPlane);
                introPlane = null;
                planeActive = false;
                planeDirection = null;
            }
        }

        const weaponPickupPalette = {
            default: { primary: 0x555555, accent: 0xffffff },
            pistol: { primary: 0x111111, accent: 0xffd27f },
            smg: { primary: 0x0f4c81, accent: 0x66fff3 },
            rifle: { primary: 0x174f2c, accent: 0x4cff00 },
            sniper: { primary: 0x1a1a40, accent: 0x88a4ff },
            shotgun: { primary: 0x5b1b00, accent: 0xffa94d },
            bazooka: { primary: 0x2d2d2d, accent: 0xff00ff }
        };

        function createWeaponPickup(type) {
            const palette = weaponPickupPalette[type] || weaponPickupPalette.default;
            const primaryMaterial = new THREE.MeshStandardMaterial({ color: palette.primary, metalness: 0.55, roughness: 0.35 });
            const accentMaterial = new THREE.MeshStandardMaterial({ color: palette.accent, emissive: palette.accent, emissiveIntensity: 0.25, metalness: 0.5, roughness: 0.25 });
            const group = new THREE.Group();

            if (type === 'pistol') {
                const grip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.15), primaryMaterial);
                grip.position.set(-0.1, -0.15, 0);
                const slide = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.18), primaryMaterial);
                slide.position.set(0.15, 0.05, 0);
                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 12), accentMaterial);
                barrel.rotation.z = Math.PI / 2;
                barrel.position.set(0.35, 0.05, 0);
                group.add(grip, slide, barrel);
            } else if (type === 'smg') {
                const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.2), primaryMaterial);
                const stock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.2), primaryMaterial);
                stock.position.set(-0.65, -0.05, 0);
                const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.15), accentMaterial);
                magazine.position.set(0, -0.35, 0);
                magazine.rotation.z = Math.PI / 10;
                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 12), accentMaterial);
                barrel.rotation.z = Math.PI / 2;
                barrel.position.set(0.5, 0.05, 0);
                group.add(body, stock, magazine, barrel);
            } else if (type === 'rifle') {
                const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.25), primaryMaterial);
                const stock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.25), primaryMaterial);
                stock.position.set(-0.9, -0.05, 0);
                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 12), accentMaterial);
                barrel.rotation.z = Math.PI / 2;
                barrel.position.set(0.4, 0.05, 0);
                const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.15), accentMaterial);
                magazine.position.set(0.1, -0.3, 0);
                group.add(body, stock, barrel, magazine);
            } else if (type === 'sniper') {
                const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.2), primaryMaterial);
                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 16), accentMaterial);
                barrel.rotation.z = Math.PI / 2;
                barrel.position.set(0.5, 0.1, 0);
                const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 12), accentMaterial);
                scope.rotation.z = Math.PI / 2;
                scope.position.set(0.2, 0.3, 0);
                const stock = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.25), primaryMaterial);
                stock.position.set(-0.9, -0.05, 0);
                group.add(body, barrel, scope, stock);
            } else if (type === 'shotgun') {
                const pump = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.25), primaryMaterial);
                pump.position.set(0.1, 0, 0);
                const grip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.25), primaryMaterial);
                grip.position.set(-0.6, -0.05, 0);
                const upperBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 12), accentMaterial);
                upperBarrel.rotation.z = Math.PI / 2;
                upperBarrel.position.set(0.4, 0.15, 0.1);
                const lowerBarrel = upperBarrel.clone();
                lowerBarrel.position.z = -0.1;
                group.add(pump, grip, upperBarrel, lowerBarrel);
            } else if (type === 'bazooka') {
                const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 16), primaryMaterial);
                tube.rotation.z = Math.PI / 2;
                const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 12), accentMaterial);
                warhead.rotation.z = Math.PI / 2;
                warhead.position.x = 0.9;
                const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.4, 12), accentMaterial);
                exhaust.rotation.z = Math.PI / 2;
                exhaust.position.x = -0.9;
                const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), primaryMaterial);
                handle.position.set(0, -0.4, 0);
                group.add(tube, warhead, exhaust, handle);
            } else {
                const fallback = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.4), primaryMaterial);
                fallback.material = new THREE.MeshStandardMaterial({ color: palette.primary, emissive: palette.accent, emissiveIntensity: 0.3 });
                group.add(fallback);
            }

            if (group.children.length === 0) {
                const fallback = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.4), primaryMaterial);
                group.add(fallback);
            }

            group.scale.setScalar(1.3);
            group.rotation.y = Math.random() * Math.PI * 2;
            group.position.y = 0;
            group.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            return group;
        }

        function spawnLoot(type, position) {
            let loot;
            
            if (type === 'health') {
                const group = new THREE.Group();
                const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.4 });
                const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.4), mat);
                const horizontal = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.4), mat);
                group.add(vertical, horizontal);
                loot = group;
            } else if (type === 'ammo') {
                const mat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 0.25 });
                loot = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), mat);
            } else {
                loot = createWeaponPickup(type);
            }

            loot.position.copy(position);
            loot.castShadow = true;
            loot.userData.type = type;
            loot.userData.collected = false;
            scene.add(loot);
            lootItems.push(loot);

            const animateLoot = () => {
                if (loot.parent && !loot.userData.collected) {
                    loot.rotation.y += 0.02;
                    requestAnimationFrame(animateLoot);
                }
            };
            animateLoot();
        }

        function startGame() {
            document.getElementById('startScreen').style.display = 'none';
            gameStarted = true;
            renderer.domElement.requestPointerLock();
            launchIntroPlane();
            
            // Spawnar armas pelo mapa (fora das casas)
            const weaponTypes = ['pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'bazooka'];
            for (let i = 0; i < 15; i++) {
                const weaponType = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
                const pos = new THREE.Vector3(
                    Math.random() * 180 - 90,
                    1,
                    Math.random() * 180 - 90
                );
                spawnLoot(weaponType, pos);
            }

            // Spawnar itens de saúde e munição
            for (let i = 0; i < 20; i++) {
                const itemType = Math.random() < 0.5 ? 'health' : 'ammo';
                const pos = new THREE.Vector3(
                    Math.random() * 180 - 90,
                    1,
                    Math.random() * 180 - 90
                );
                spawnLoot(itemType, pos);
            }

            // Criar inimigos AI
            for (let i = 0; i < 9; i++) {
                const aiData = {
                    name: playerNames[i],
                    kills: 0,
                    alive: true,
                    isPlayer: false
                };
                aiPlayers.push(aiData);
                
                const spawnPos = new THREE.Vector3(
                    Math.random() * 150 - 75,
                    2,
                    Math.random() * 150 - 75
                );
                spawnEnemy(spawnPos, aiData);
            }

            // Adicionar player ao leaderboard
            aiPlayers.push({
                name: 'VOCÊ',
                kills: 0,
                alive: true,
                isPlayer: true
            });

            playersAlive = 10;
            updateHUD();
            updateLeaderboard();

            // Iniciar timer
            gameTimer = setInterval(() => {
                gameTime++;
            }, 1000);
        }

        function spawnEnemy(position, aiData) {
            const enemyGroup = new THREE.Group();
            const spawnPos = position.clone();
            spawnPos.y = 0;
            enemyGroup.position.copy(spawnPos);

            // Corpo - cor laranja para inimigos ranged
            const bodyGeo = new THREE.BoxGeometry(1, 1.8, 1);
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xffa500, emissiveIntensity: 0.2 });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = 0.9;
            body.castShadow = true;
            body.userData.isHead = false;
            enemyGroup.add(body);

            // Cabeça - cor laranja
            const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
            const headMat = new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xffa500, emissiveIntensity: 0.2 });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.y = 2.1;
            head.castShadow = true;
            head.userData.isHead = true;
            enemyGroup.add(head);

            enemyGroup.userData.health = 100;
            enemyGroup.userData.health = 100;
            enemyGroup.userData.maxHealth = 100;
            enemyGroup.userData.speed = 8 + Math.random() * 4;
            enemyGroup.userData.aiData = aiData;
            enemyGroup.userData.hasWeapon = false;
            enemyGroup.userData.weapon = null;
            enemyGroup.userData.lastShot = 0;
            enemyGroup.userData.target = null;
            enemyGroup.userData.targetLockStarted = 0;
            enemyGroup.userData.searchTimer = 0;
            enemyGroup.userData.isRanged = true; // Marcar como inimigo ranged
            enemyGroup.userData.aimDirection = new THREE.Vector3(0, 0, -1);
            enemyGroup.userData.accuracy = THREE.MathUtils.randFloat(AI_BALANCE.accuracyRange[0], AI_BALANCE.accuracyRange[1]);
            enemyGroup.userData.reactionDelay = THREE.MathUtils.randFloat(AI_BALANCE.reactionDelayMs[0], AI_BALANCE.reactionDelayMs[1]);
            enemyGroup.userData.isBursting = false;
            enemyGroup.userData.nextBurstToggle = 0;
            enemyGroup.userData.burstDuration = THREE.MathUtils.randFloat(AI_BALANCE.burstDurationMs[0], AI_BALANCE.burstDurationMs[1]);
            enemyGroup.userData.burstPause = THREE.MathUtils.randFloat(AI_BALANCE.burstPauseMs[0], AI_BALANCE.burstPauseMs[1]);
            scene.add(enemyGroup);
            enemies.push(enemyGroup);
        }

        function updateAI(delta) {
            const now = performance.now();
            for (const enemy of enemies) {
                if (enemy.userData.health <= 0) continue;

                keepEnemyGrounded(enemy);

                const escapeTarget = getHouseEscapeTarget(enemy.position);
                if (escapeTarget) {
                    moveTowards(enemy, escapeTarget, delta);
                    keepEnemyGrounded(enemy);
                    continue;
                }

                // Aquisição de alvo gradual
                enemy.userData.searchTimer += delta;
                if (enemy.userData.searchTimer > 1.5) {
                    enemy.userData.searchTimer = 0;
                    const candidate = findNearestEnemy(enemy);
                    if (enemy.userData.target !== candidate) {
                        enemy.userData.target = candidate;
                        enemy.userData.targetLockStarted = candidate ? now : 0;
                    }
                }

                const target = enemy.userData.target;
                const hasValidTarget = target && target.userData.health > 0;

                if (!enemy.userData.hasWeapon) {
                    const nearestWeapon = findNearestLoot(enemy.position, ['pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'bazooka']);
                    if (nearestWeapon && nearestWeapon.distance < 30) {
                        moveTowards(enemy, nearestWeapon.item.position, delta);
                        if (nearestWeapon.distance < 2) {
                            enemy.userData.hasWeapon = true;
                            enemy.userData.weapon = nearestWeapon.item.userData.type;
                            scene.remove(nearestWeapon.item);
                            lootItems.splice(lootItems.indexOf(nearestWeapon.item), 1);
                        }
                    }
                } else if (hasValidTarget) {
                    const targetPosition = target.isPlayer ? playerConfig.position : target.position;
                    const distance = enemy.position.distanceTo(targetPosition);
                    const desiredDir = new THREE.Vector3().subVectors(targetPosition, enemy.position).normalize();
                    enemy.userData.aimDirection.lerp(desiredDir, 0.08);

                    if (distance > 20) {
                        moveTowards(enemy, targetPosition, delta);
                    } else if (distance < 8) {
                        const retreatDir = new THREE.Vector3().subVectors(enemy.position, targetPosition).normalize();
                        enemy.position.add(retreatDir.multiplyScalar(enemy.userData.speed * delta * 0.6));
                    } else if (Math.random() < 0.7) {
                        // Strafing lateral mais agressivo
                        const strafe = new THREE.Vector3(-desiredDir.z, 0, desiredDir.x).setLength(enemy.userData.speed * delta * 2.0);
                        if (Math.random() < 0.5) strafe.multiplyScalar(-1);
                        enemy.position.add(strafe);
                    }

                    if (distance < 35 && hasLineOfSight(enemy.position, targetPosition)) {
                        aiShoot(enemy, target, targetPosition, distance, now);
                    }
                } else {
                    // Patrulha leve quando sem alvo
                    if (Math.random() < 0.01) {
                        const randomDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                        enemy.position.add(randomDir.multiplyScalar(enemy.userData.speed * delta * 0.6));
                    }
                }

                // Buscar cura se necessário
                if (enemy.userData.health < 70) {
                    const nearestHealth = findNearestLoot(enemy.position, ['health']);
                    if (nearestHealth && nearestHealth.distance < 20) {
                        moveTowards(enemy, nearestHealth.item.position, delta);
                        if (nearestHealth.distance < 2) {
                            enemy.userData.health = Math.min(enemy.userData.maxHealth, enemy.userData.health + 30);
                            scene.remove(nearestHealth.item);
                            lootItems.splice(lootItems.indexOf(nearestHealth.item), 1);
                        }
                    }
                }

                // Limites do mapa e solo
                enemy.position.x = Math.max(-95, Math.min(95, enemy.position.x));
                enemy.position.z = Math.max(-95, Math.min(95, enemy.position.z));
                keepEnemyGrounded(enemy);
            }
        }

        function findNearestLoot(position, types) {
            let nearest = null;
            let minDist = Infinity;

            lootItems.forEach(item => {
                if (!item.userData.collected && types.includes(item.userData.type)) {
                    const dist = position.distanceTo(item.position);
                    if (dist < minDist) {
                        minDist = dist;
                        nearest = item;
                    }
                }
            });

            return nearest ? { item: nearest, distance: minDist } : null;
        }

        function findNearestEnemy(fromEnemy) {
            let nearest = null;
            let minDist = Infinity;

            enemies.forEach(enemy => {
                if (enemy !== fromEnemy && enemy.userData.health > 0) {
                    const dist = fromEnemy.position.distanceTo(enemy.position);
                    if (dist < minDist && hasLineOfSight(fromEnemy.position, enemy.position)) {
                        minDist = dist;
                        nearest = enemy;
                    }
                }
            });

            const playerDist = fromEnemy.position.distanceTo(playerConfig.position);
            if (playerDist < minDist && playerConfig.health > 0 && hasLineOfSight(fromEnemy.position, playerConfig.position)) {
                return PLAYER_TARGET;
            }

            return nearest;
        }

        function getHouseEscapeTarget(position) {
            for (const house of houseInteriorZones) {
                if (house.bounds.containsPoint(position)) {
                    return house.doorExit;
                }
            }
            return null;
        }

        function hasLineOfSight(from, to) {
            const direction = new THREE.Vector3().subVectors(to, from).normalize();
            const distance = from.distanceTo(to);
            const origin = from.clone().add(new THREE.Vector3(0, 1.5, 0));
            const raycaster = new THREE.Raycaster(origin, direction, 0, distance);
            // use recursive intersection so nested meshes/groups are considered
            const hits = raycaster.intersectObjects(worldObstacles, true);
            return hits.length === 0; // Retorna true se não há obstáculos
        }

        function moveTowards(enemy, targetPos, delta) {
            const direction = new THREE.Vector3().subVectors(targetPos, enemy.position).normalize();
            direction.y = 0;
            enemy.position.add(direction.multiplyScalar(enemy.userData.speed * delta));
        }

        function keepEnemyGrounded(enemy) {
            enemy.position.y = 0;
        }

        function aiShoot(enemy, target, targetPosition, distance, now) {
            if (!enemy.userData.weapon) return;

            const weaponData = {
                pistol: { fireRate: 400, damage: 12 },
                smg: { fireRate: 150, damage: 8 },
                rifle: { fireRate: 250, damage: 15 },
                sniper: { fireRate: 1800, damage: 60 },
                shotgun: { fireRate: 1200, damage: 10 },
                bazooka: { fireRate: 3500, damage: 80 }
            };

            const weapon = weaponData[enemy.userData.weapon];
            if (!weapon) return;

            if (now >= enemy.userData.nextBurstToggle) {
                enemy.userData.isBursting = !enemy.userData.isBursting;
                enemy.userData.nextBurstToggle = now + (enemy.userData.isBursting ? enemy.userData.burstDuration : enemy.userData.burstPause);
            }
            if (!enemy.userData.isBursting) return;

            if (now - enemy.userData.targetLockStarted < enemy.userData.reactionDelay) return;

            const cadenceJitter = THREE.MathUtils.randFloat(0.9, 1.2);
            if (now - enemy.userData.lastShot < weapon.fireRate * cadenceJitter) return;

            enemy.userData.lastShot = now;

            const baseSpread = THREE.MathUtils.lerp(AI_BALANCE.closeRangeSpread, AI_BALANCE.longRangeSpread, Math.min(distance / 60, 1));
            const accuracyPenalty = (1 - enemy.userData.accuracy) * 0.5;
            const spread = baseSpread + accuracyPenalty;
            const spreadVector = new THREE.Vector3(
                THREE.MathUtils.randFloatSpread(spread),
                THREE.MathUtils.randFloatSpread(spread * 0.5),
                THREE.MathUtils.randFloatSpread(spread)
            );

            const shotDir = enemy.userData.aimDirection.clone().normalize().add(spreadVector).normalize();
            const startPos = enemy.position.clone().add(new THREE.Vector3(0, 1.5, 0));
            const raycaster = new THREE.Raycaster(startPos, shotDir);

            // recursive so we hit nested meshes/groups (walls, roofs, barricades)
            const wallHits = raycaster.intersectObjects(worldObstacles, true);
            const nearestWallDistance = wallHits.length > 0 ? wallHits[0].distance : Infinity;
            if (nearestWallDistance < Infinity && nearestWallDistance <= targetPosition.distanceTo(startPos)) {
                createTracer(startPos, wallHits[0].point, 0xff8800, true);
                return;
            }

            const enemyMeshes = enemies
                .filter(e => e !== enemy && e.userData.health > 0)
                .flatMap(e => e.children.filter(child => child.isMesh).map(mesh => ({ mesh, owner: e })));
            const meshList = enemyMeshes.map(item => item.mesh);
            const enemyHits = meshList.length ? raycaster.intersectObjects(meshList, true) : [];
            const firstEnemyImpact = enemyHits.length > 0 ? enemyHits[0] : null;
            let hitPoint = startPos.clone().add(shotDir.clone().multiplyScalar(200));
            let impactHandled = false;

            if (target.isPlayer) {
                const torso = playerConfig.position.clone().add(new THREE.Vector3(0, playerConfig.height * 0.5, 0));
                const toTorso = torso.clone().sub(startPos);
                const projection = toTorso.dot(shotDir);
                if (projection > 0) {
                    const closestPoint = startPos.clone().add(shotDir.clone().multiplyScalar(projection));
                    const lateralDistance = closestPoint.distanceTo(torso);
                    const hitRadius = 0.9;
                    if (lateralDistance <= hitRadius && projection < nearestWallDistance && (!firstEnemyImpact || projection < firstEnemyImpact.distance)) {
                        playerConfig.health -= weapon.damage;
                        hitPoint = closestPoint;
                        impactHandled = true;
                        if (playerConfig.health <= 0) {
                            playerDied(enemy.userData.aiData);
                        }
                        updateHUD();
                    }
                }
            } else if (firstEnemyImpact && firstEnemyImpact.distance < nearestWallDistance) {
                const owner = enemyMeshes.find(item => item.mesh === firstEnemyImpact.object)?.owner;
                if (owner) {
                    owner.userData.health -= weapon.damage;
                    hitPoint = firstEnemyImpact.point.clone();
                    impactHandled = true;
                    if (owner.userData.health <= 0) {
                        enemyKilledByAI(owner, enemy.userData.aiData);
                    }
                }
            }

            if (!impactHandled && firstEnemyImpact && firstEnemyImpact.distance < nearestWallDistance) {
                hitPoint = firstEnemyImpact.point.clone();
            }

            createTracer(startPos, hitPoint, 0xff0000, true);
        }

        function enemyKilledByAI(deadEnemy, killerData) {
            playersAlive--;
            killerData.kills++;
            deadEnemy.userData.aiData.alive = false;
            
            scene.remove(deadEnemy);
            enemies.splice(enemies.indexOf(deadEnemy), 1);
            
            updateHUD();
            updateLeaderboard();
            
            if (playersAlive <= 1) {
                endGame(false);
            }
        }

        function playerDied(killerData) {
            playerConfig.health = 0;
            playersAlive--;
            
            if (killerData) {
                killerData.kills++;
            }
            
            const playerData = aiPlayers.find(p => p.isPlayer);
            if (playerData) {
                playerData.alive = false;
            }
            
            updateHUD();
            updateLeaderboard();
            endGame(false);
        }

        function setupControls() {
            document.addEventListener('pointerlockchange', () => {
                pointerLocked = document.pointerLockElement === renderer.domElement;
            });

            document.addEventListener('keydown', (e) => {
                keys[e.key.toLowerCase()] = true;
                if (e.key === '1') switchWeapon('pistol');
                if (e.key === '2') switchWeapon('smg');
                if (e.key === '3') switchWeapon('rifle');
                if (e.key === '4') switchWeapon('sniper');
                if (e.key === '5') switchWeapon('shotgun');
                if (e.key === '6') switchWeapon('bazooka');
                if (e.key.toLowerCase() === 'r') reload();
                if (e.key.toLowerCase() === 'e') pickupLoot();
            });

            document.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

            document.addEventListener('mousemove', (e) => {
                if (!pointerLocked) return;
                // Aplicar movimento diretamente aos targets para suavização
                targetYaw -= e.movementX * mouseSensitivity;
                
                // Se o jogador mover o mouse para baixo (compensando recuo), reduzir o recuo acumulado
                if (e.movementY > 0 && recoilState.pitch > 0) {
                    recoilState.pitch = Math.max(0, recoilState.pitch - e.movementY * mouseSensitivity * 2);
                }

                targetPitch -= e.movementY * mouseSensitivity;
                targetPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetPitch));
            });

            document.addEventListener('mousedown', (e) => {
                if (gameStarted && pointerLocked && e.button === 0) {
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
        }

        function switchWeapon(weaponName) {
            if (playerConfig.weapons[weaponName].hasWeapon) {
                playerConfig.currentWeapon = weaponName;
                updateHUD();
            }
        }

        function reload() {
            if (playerConfig.isReloading || !playerConfig.currentWeapon) return;
            
            const weapon = playerConfig.weapons[playerConfig.currentWeapon];
            if (weapon.ammo >= weapon.clipSize || weapon.maxAmmo <= 0) return;

            playerConfig.isReloading = true;
            const reloadBar = document.getElementById('reloadBar');
            const reloadFill = document.getElementById('reloadFill');
            
            reloadBar.style.display = 'block';
            reloadFill.style.width = '0%';

            const duration = 2000;
            const startTime = Date.now();

            const interval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                reloadFill.style.width = `${progress * 100}%`;

                if (progress >= 1) {
                    clearInterval(interval);
                    const needed = weapon.clipSize - weapon.ammo;
                    const available = weapon.maxAmmo;
                    const reload = Math.min(needed, available);
                    
                    weapon.ammo += reload;
                    weapon.maxAmmo -= reload;
                    
                    playerConfig.isReloading = false;
                    reloadBar.style.display = 'none';
                    updateHUD();
                }
            }, 50);
        }

        function pickupLoot() {
            const pickupRadius = 3;
            
            for (let i = lootItems.length - 1; i >= 0; i--) {
                const item = lootItems[i];
                if (item.userData.collected) continue;
                
                const distance = camera.position.distanceTo(item.position);
                if (distance < pickupRadius) {
                    const type = item.userData.type;
                    
                    if (type === 'health') {
                        playerConfig.health = Math.min(playerConfig.maxHealth, playerConfig.health + 30);
                        showMessage('+30 Vida', 1000);
                    } else if (type === 'ammo') {
                        if (playerConfig.currentWeapon) {
                            const weapon = playerConfig.weapons[playerConfig.currentWeapon];
                            weapon.maxAmmo += weapon.clipSize * 2;
                            showMessage('+Munição', 1000);
                        }
                    } else {
                        // Arma
                        const weapon = playerConfig.weapons[type];
                        if (!weapon.hasWeapon) {
                            weapon.hasWeapon = true;
                            weapon.ammo = weapon.clipSize;
                            weapon.maxAmmo = weapon.clipSize * 3;
                            playerConfig.currentWeapon = type;
                            showMessage(`${weapon.name} obtida!`, 1500);
                        } else {
                            weapon.maxAmmo += weapon.clipSize * 2;
                            showMessage('+Munição', 1000);
                        }
                    }
                    
                    item.userData.collected = true;
                    scene.remove(item);
                    lootItems.splice(i, 1);
                    updateHUD();
                    break;
                }
            }
        }

        function shoot() {
            if (playerConfig.isReloading || !playerConfig.currentWeapon) return;
            
            const weapon = playerConfig.weapons[playerConfig.currentWeapon];
            const now = Date.now();
            
            if (now - playerConfig.lastShot < weapon.fireRate || weapon.ammo <= 0) return;
            
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

            if (playerConfig.currentWeapon === 'shotgun') {
                shootShotgun(weapon);
            } else if (playerConfig.currentWeapon === 'bazooka') {
                shootBazooka();
            } else {
                shootPistolRifle(weapon.damage);
            }

            if (weapon.auto && playerConfig.isShooting) {
                setTimeout(() => {
                    if (playerConfig.isShooting && !playerConfig.isReloading) shoot();
                }, weapon.fireRate);
            }
        }

        function getAimDirection() {
            const dir = new THREE.Vector3(0, 0, -1);
            dir.applyQuaternion(camera.quaternion);
            return dir;
        }

        const MUZZLE_FORWARD_OFFSET = 0.35;

        function getMuzzlePosition(direction) {
            const dir = direction.clone();
            return camera.position.clone().add(dir.multiplyScalar(MUZZLE_FORWARD_OFFSET));
        }

        function shootPistolRifle(damage) {
            const dir = getAimDirection();
            const startPos = getMuzzlePosition(dir);
            const raycaster = new THREE.Raycaster(startPos, dir);

            // recursive intersection for world obstacles and nested meshes
            const wallHits = raycaster.intersectObjects(worldObstacles, true);

            const meshes = enemies.flatMap(e => e.children.filter(c => c instanceof THREE.Mesh).map(mesh => ({ mesh, enemy: e })));
            const meshList = meshes.map(e => e.mesh);
            const enemyHits = meshList.length ? raycaster.intersectObjects(meshList, true) : [];

            let hitPoint = startPos.clone().add(dir.clone().multiplyScalar(200));

            const wallDistance = wallHits.length > 0 ? wallHits[0].distance : Infinity;
            const enemyDistance = enemyHits.length > 0 ? enemyHits[0].distance : Infinity;

            if (wallDistance < enemyDistance) {
                hitPoint = wallHits[0].point;
            } else if (enemyHits.length > 0) {
                const { object: hitMesh, point } = enemyHits[0];
                const { enemy: hitEnemy } = meshes.find(e => e.mesh === hitMesh);
                hitPoint = point;
                
                const finalDmg = damage * (hitMesh.userData.isHead ? 3 : 1);
                hitEnemy.userData.health -= finalDmg;
                
                if (hitMesh.material && hitMesh.material.emissive) {
                    hitMesh.material.emissive.setHex(0xffffff);
                    setTimeout(() => {
                        if (hitMesh.material) hitMesh.material.emissive.setHex(0x222222);
                    }, 100);
                }

                if (hitEnemy.userData.health <= 0) {
                    playerKilledEnemy(hitEnemy);
                }
            }

            createTracer(startPos, hitPoint, 0xffffff);
        }

        function shootShotgun(weapon) {
            const baseDir = getAimDirection();
            
            for (let i = 0; i < weapon.pellets; i++) {
                const spread = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.1,
                    (Math.random() - 0.5) * 0.1,
                    (Math.random() - 0.5) * 0.1
                );
                const pelletDir = baseDir.clone().add(spread).normalize();
                const startPos = getMuzzlePosition(pelletDir);
                const raycaster = new THREE.Raycaster(startPos, pelletDir);

                const wallHits = raycaster.intersectObjects(worldObstacles, true);

                const meshes = enemies.flatMap(e => e.children.filter(c => c instanceof THREE.Mesh).map(mesh => ({ mesh, enemy: e })));
                const meshList = meshes.map(e => e.mesh);
                const enemyHits = meshList.length ? raycaster.intersectObjects(meshList, true) : [];

                let hitPoint = startPos.clone().add(pelletDir.clone().multiplyScalar(200));

                const wallDistance = wallHits.length > 0 ? wallHits[0].distance : Infinity;
                const enemyDistance = enemyHits.length > 0 ? enemyHits[0].distance : Infinity;

                if (wallDistance < enemyDistance) {
                    hitPoint = wallHits[0].point;
                } else if (enemyHits.length > 0) {
                    const { object: hitMesh, point } = enemyHits[0];
                    const { enemy: hitEnemy } = meshes.find(e => e.mesh === hitMesh);
                    hitPoint = point;
                    
                    const finalDmg = weapon.damage * (hitMesh.userData.isHead ? 3 : 1);
                    hitEnemy.userData.health -= finalDmg;

                    if (hitMesh.material && hitMesh.material.emissive) {
                        hitMesh.material.emissive.setHex(0xffffff);
                        setTimeout(() => {
                            if (hitMesh.material) hitMesh.material.emissive.setHex(0x222222);
                        }, 100);
                    }

                    if (hitEnemy.userData.health <= 0) {
                        playerKilledEnemy(hitEnemy);
                    }
                }

                createTracer(startPos, hitPoint, 0xffffff);
            }
        }

        function shootBazooka() {
            const dir = getAimDirection();
            const startPos = getMuzzlePosition(dir);
            const raycaster = new THREE.Raycaster(startPos, dir);

            const wallHits = raycaster.intersectObjects(worldObstacles, true);

            const objects = scene.children.filter(obj => obj.type === 'Mesh' || obj.type === 'Group');
            const objectHits = raycaster.intersectObjects(objects, true);

            let expPoint = startPos.clone().add(dir.clone().multiplyScalar(200));

            const wallDistance = wallHits.length > 0 ? wallHits[0].distance : Infinity;
            const objectDistance = objectHits.length > 0 ? objectHits[0].distance : Infinity;

            if (wallDistance < objectDistance && wallHits.length > 0) {
                expPoint = wallHits[0].point;
            } else if (objectHits.length > 0) {
                expPoint = objectHits[0].point;
            }

            createTracer(startPos, expPoint, 0xffa500, false, 5);
            createExplosion(expPoint, 150, 10);
        }

        function createExplosion(position, damage, radius) {
            const explosionGeo = new THREE.SphereGeometry(radius, 16, 16);
            const explosionMat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.7 });
            const explosion = new THREE.Mesh(explosionGeo, explosionMat);
            explosion.position.copy(position);
            scene.add(explosion);

            setTimeout(() => {
                scene.remove(explosion);
                explosionGeo.dispose();
                explosionMat.dispose();
            }, 500);

            enemies.forEach(enemy => {
                const dist = enemy.position.distanceTo(position);
                if (dist < radius) {
                    const dmg = damage * (1 - dist / radius);
                    enemy.userData.health -= dmg;
                    if (enemy.userData.health <= 0) {
                        playerKilledEnemy(enemy);
                    }
                }
            });
        }

        function playerKilledEnemy(enemy) {
            playersAlive--;
            playerKills++;
            
            const playerData = aiPlayers.find(p => p.isPlayer);
            if (playerData) {
                playerData.kills = playerKills;
            }
            
            enemy.userData.aiData.alive = false;
            
            scene.remove(enemy);
            enemies.splice(enemies.indexOf(enemy), 1);
            
            updateHUD();
            updateLeaderboard();
            
            if (playersAlive <= 1) {
                endGame(true);
            }
        }

        function createTracer(start, end, color, isEnemy = false, thickness = 1) {
            const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
            const mat = new THREE.LineBasicMaterial({ color, linewidth: thickness });
            const line = new THREE.Line(geo, mat);
            scene.add(line);
            setTimeout(() => {
                scene.remove(line);
                geo.dispose();
                mat.dispose();
            }, isEnemy ? 400 : 150);
        }

        function showMessage(text, duration) {
            const msg = document.getElementById('message');
            msg.textContent = text;
            msg.style.display = 'block';
            setTimeout(() => msg.style.display = 'none', duration);
        }

        function updateHUD() {
            document.getElementById('playersAlive').textContent = `Jogadores: ${playersAlive}`;
            document.getElementById('kills').textContent = `Eliminações: ${playerKills}`;
            
            const healthFill = document.getElementById('healthFill');
            const healthPercent = (playerConfig.health / playerConfig.maxHealth) * 100;
            healthFill.style.width = `${healthPercent}%`;
            document.getElementById('healthText').textContent = `${Math.max(0, Math.floor(playerConfig.health))} HP`;

            if (playerConfig.currentWeapon) {
                const weapon = playerConfig.weapons[playerConfig.currentWeapon];
                document.getElementById('weapon').textContent = `Arma: ${weapon.name}`;
                document.getElementById('ammo').textContent = `Munição: ${weapon.ammo}/${weapon.maxAmmo}`;
            } else {
                document.getElementById('weapon').textContent = `Arma: Punhos`;
                document.getElementById('ammo').textContent = `Munição: 0/0`;
            }
        }

        function updateLeaderboard() {
            const content = document.getElementById('leaderboardContent');
            const sorted = [...aiPlayers].sort((a, b) => {
                if (a.alive !== b.alive) return a.alive ? -1 : 1;
                return b.kills - a.kills;
            });

            content.innerHTML = sorted.map((player, index) => {
                const classes = ['leaderboard-entry'];
                if (player.isPlayer) classes.push('player');
                if (!player.alive) classes.push('eliminated');
                
                return `<div class="${classes.join(' ')}">
                    #${index + 1} ${player.name} - ${player.kills} 💀 ${player.alive ? '✅' : '❌'}
                </div>`;
            }).join('');
        }

        function endGame(won) {
            gameStarted = false;
            clearInterval(gameTimer);
            
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }

            const screen = document.getElementById('gameOverScreen');
            const title = document.getElementById('gameOverTitle');
            const position = won ? 1 : aiPlayers.filter(p => p.alive).length + 1;
            
            if (won) {
                title.textContent = '🏆 VITÓRIA REAL! 🏆';
                title.style.color = '#00ff00';
            } else {
                title.textContent = 'VOCÊ FOI ELIMINADO';
                title.style.color = '#ff0000';
            }

            const minutes = Math.floor(gameTime / 60);
            const seconds = gameTime % 60;
            
            document.getElementById('finalPosition').textContent = `Posição Final: #${position}`;
            document.getElementById('finalKills').textContent = `Eliminações: ${playerKills}`;
            document.getElementById('survivalTime').textContent = `Tempo: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            screen.style.display = 'flex';

            // Salvar estatísticas do Battle Royale
            if (typeof saveBattleRoyaleStats === 'function') {
                saveBattleRoyaleStats(won, position, playerKills);
            } else {
                console.warn('API integration not loaded, stats not saved to backend.');
            }
        }

        function updatePlayer(delta) {
            if (!gameStarted || playerConfig.health <= 0) return;

            const moveSpeed = playerConfig.speed * delta;
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0;
            forward.normalize();
            const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

            if (keys['w']) playerConfig.velocity.add(forward.multiplyScalar(moveSpeed));
            if (keys['s']) playerConfig.velocity.add(forward.multiplyScalar(-moveSpeed));
            if (keys['a']) playerConfig.velocity.add(right.multiplyScalar(-moveSpeed));
            if (keys['d']) playerConfig.velocity.add(right.multiplyScalar(moveSpeed));

            playerConfig.velocity.y -= playerConfig.gravity * delta;

            if (keys[' '] && playerConfig.onGround) {
                playerConfig.velocity.y = playerConfig.jumpPower;
                playerConfig.onGround = false;
            }

            const nextPos = playerConfig.position.clone().add(playerConfig.velocity.clone().multiplyScalar(delta));
            const playerBox = new THREE.Box3(
                new THREE.Vector3(nextPos.x - playerConfig.radius, nextPos.y, nextPos.z - playerConfig.radius),
                new THREE.Vector3(nextPos.x + playerConfig.radius, nextPos.y + playerConfig.height, nextPos.z + playerConfig.radius)
            );

            let collision = false;
            for (const box of collidableObjects) {
                if (playerBox.intersectsBox(box)) {
                    collision = true;
                    break;
                }
            }

            if (!collision) {
                playerConfig.position.copy(nextPos);
            } else {
                playerConfig.velocity.set(0, Math.min(0, playerConfig.velocity.y), 0);
            }

            if (playerConfig.position.y < 1) {
                playerConfig.position.y = 1;
                playerConfig.velocity.y = 0;
                playerConfig.onGround = true;
            }

            // Limites do mapa
            playerConfig.position.x = Math.max(-95, Math.min(95, playerConfig.position.x));
            playerConfig.position.z = Math.max(-95, Math.min(95, playerConfig.position.z));

            playerConfig.velocity.x *= 0.9;
            playerConfig.velocity.z *= 0.9;

            // Recuperação de recuo
            recoilState.pitch *= recoilConfig.dampening;
            recoilState.yaw *= recoilConfig.dampening;
            targetPitch -= recoilState.pitch * recoilConfig.recoverySpeed * delta;
            targetYaw -= recoilState.yaw * recoilConfig.recoverySpeed * delta;

            // Suavizar rotação da câmera (lerp)
            yaw += (targetYaw - yaw) * cameraSmoothing;
            pitch += (targetPitch - pitch) * cameraSmoothing;
            pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));

            camera.position.copy(playerConfig.position);
            camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));

            // Atualizar multiplicador de fogo sustentado
            const weapon = playerConfig.weapons[playerConfig.currentWeapon];
            if (weapon?.auto && playerConfig.isShooting) {
                recoilState.sustainedFireMultiplier += delta * recoilConfig.sustainedFireGrowth;
                recoilState.sustainedFireMultiplier = Math.min(recoilState.sustainedFireMultiplier, recoilConfig.maxSustainedFireMultiplier);
            } else {
                recoilState.sustainedFireMultiplier = 0.6;
            }
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

            updateIntroPlane(delta);
            
            if (gameStarted) {
                updatePlayer(delta);
                updateAI(delta);
            }

            renderer.render(scene, camera);
        }

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        init();
