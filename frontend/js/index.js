const API_URL = window.location.origin + '/api';
        let currentUser = null;
        let currentStatsMode = 'survival';
        let currentLeaderboardMode = 'survival';
        let currentSkinTexture = null;
        const heroDefaults = {
            eyebrow: 'FPS 3D • NEXT GEN',
            headline: 'Domine o campo de batalha com precisão cinematográfica.',
            subhead: 'Sobreviva às hordas infinitas, dispute um Battle Royale tático e projete mapas profissionais em poucos minutos. Tudo em um único launcher web-ready.',
            badge: 'Sem conta? Jogue como convidado.'
        };

        const COOP_API_URL = window.location.origin + '/coop';
        const COOP_DISCOVERY_INTERVAL = 15000;
        const COOP_INTENT_STORAGE_KEY = 'coopSessionIntent';
        const COOP_RUN_STORAGE_PREFIX = 'coopRunPayload:';
        const PLAYER_SKIN_STORAGE_KEY = 'playerSkin';
        const DEFAULT_PLAYER_SKIN = { body: '#ff0000', head: '#ff0000', texture: null };
        const MAX_SKIN_TEXTURE_BYTES = 5 * 1024 * 1024; // 5 MB limite para não saturar armazenamento/local
        const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
        const DEFAULT_COOP_MODE = 'survival';
        const COOP_MODE_CONFIG = {
            survival: {
                key: 'survival',
                label: 'Sobrevivência Co-Op',
                hostHint: 'Seu PC atua como servidor autoritativo (até 4 jogadores)',
                joinHint: 'Suporta IP direto, hostname local ou descoberta automática',
                hostLaunchLabel: '▶ Abrir Survival como Host',
                clientLaunchLabel: '▶ Entrar no Survival co-op',
                maxPlayers: 4,
                ui: {
                    serverStatusId: 'coopServerStatus',
                    onlineCountId: 'coopOnlineCount',
                    indicatorId: 'coopPresenceIndicator',
                    timestampId: 'coopPresenceTimestamp'
                }
            },
            x1: {
                key: 'x1',
                label: 'Duelo X1',
                hostHint: 'Host sincroniza movimento e armas em um duelo fechado (até 3 jogadores).',
                joinHint: 'Informe o IP/host do lobby 1v1 ou encontre via descoberta LAN.',
                hostLaunchLabel: '▶ Iniciar Duelo X1 (Host)',
                clientLaunchLabel: '▶ Entrar no Duelo X1',
                maxPlayers: 3,
                ui: {
                    serverStatusId: 'x1ServerStatus',
                    onlineCountId: 'x1OnlineCount',
                    indicatorId: 'x1PresenceIndicator',
                    timestampId: 'x1PresenceTimestamp'
                }
            }
        };
        let activeHostMode = DEFAULT_COOP_MODE;
        let activeJoinMode = DEFAULT_COOP_MODE;
        let coopPresenceTimer = null;
        let isFetchingCoopPresence = false;
        const coopPresenceState = {};
        let isScanningCoopLobbies = false;
        const lastDiscoveredLobbies = {};
        let coopAutoLaunchTimer = null;

        const leaderboardModesConfig = {
            survival: {
                icon: '🎯',
                label: 'Sobrevivência',
                metricTabs: [
                    { key: 'mmr', label: 'MMR' },
                    { key: 'wins', label: 'Vitórias' },
                    { key: 'kills', label: 'Kills' },
                    { key: 'score', label: 'Melhor Score' }
                ]
            },
            battleroyale: {
                icon: '👑',
                label: 'Battle Royale',
                metricTabs: [
                    { key: 'mmr', label: 'MMR' },
                    { key: 'wins', label: 'Top 1' },
                    { key: 'kills', label: 'Kills' },
                    { key: 'winrate', label: 'Win %' }
                ]
            },
            tactical: {
                icon: '🛡️',
                label: 'Tático 5v5',
                metricTabs: [
                    { key: 'mmr', label: 'MMR' },
                    { key: 'wins', label: 'Vitórias' },
                    { key: 'kills', label: 'Abates' },
                    { key: 'winrate', label: 'Win %' }
                ]
            }
        };

        let currentLeaderboardMetric = 'mmr';
        const queueModesConfig = {
            battleroyale: {
                icon: '👑',
                title: 'Battle Royale',
                description: 'Defina se a partida conta para o seu ranking global ou se é apenas para treinar.',
                casualCopy: 'Sem impacto no Elo. Use para testar armas, mapas e estratégias.',
                rankedCopy: 'Vale Elo. Resultado impacta Bronze, Prata, Ouro, Platina e Diamante.',
                note: 'A fila ranqueada usa os mesmos tiers exibidos no menu de ranking.'
            },
            tactical: {
                icon: '🛡️',
                title: 'Tático 5v5',
                description: 'Escolha entre treinar setups ou disputar partidas oficiais de Elo.',
                casualCopy: 'Perfeito para treinar execuções, economias e estratégias sem pressão.',
                rankedCopy: 'Placares contam pontos de Elo e alimentam o ranking Tático 5v5.',
                note: 'As partidas ranqueadas usam o mesmo sistema Prata III, Ouro, Diamante, etc.'
            }
        };
        let pendingQueueMode = null;
        const TACTICAL_STORAGE_KEY = 'tacticalCustomMaps';
        const TACTICAL_SELECTED_KEY = 'tacticalSelectedMap';
        let selectedCustomMapId = localStorage.getItem(TACTICAL_SELECTED_KEY) || null;

        // Inicialização
        document.addEventListener('DOMContentLoaded', () => {
            checkAuth();
            initLeaderboardUI();
            initCoopUI();
        });

        function getCoopModeKey(mode) {
            const key = (mode || '').toString().toLowerCase();
            return COOP_MODE_CONFIG[key] ? key : DEFAULT_COOP_MODE;
        }

        function getCoopModeConfig(mode) {
            return COOP_MODE_CONFIG[getCoopModeKey(mode)];
        }

        function getActiveCoopMode(context = 'host') {
            return context === 'join' ? activeJoinMode : activeHostMode;
        }

        function setActiveCoopMode(mode, context = 'host') {
            const normalized = getCoopModeKey(mode);
            if (context === 'join') {
                activeJoinMode = normalized;
                const joinSelect = document.getElementById('coopJoinMode');
                if (joinSelect && joinSelect.value !== normalized) {
                    joinSelect.value = normalized;
                }
                toggleCoopLaunchButton('client', false, normalized);
            } else {
                activeHostMode = normalized;
                const hostSelect = document.getElementById('coopHostMode');
                if (hostSelect && hostSelect.value !== normalized) {
                    hostSelect.value = normalized;
                }
                syncCoopHostModeUI();
                toggleCoopLaunchButton('host', false, normalized);
            }
            updateCoopModalLabels();
        }

        function syncCoopHostModeUI() {
            const mode = getActiveCoopMode('host');
            const slots = document.getElementById('coopHostSlots');
            if (!slots) return;
            if (mode === 'x1') {
                slots.value = '3';
                slots.disabled = true;
            } else {
                if (slots.disabled) slots.disabled = false;
                if (!slots.value || Number(slots.value) < 2) {
                    slots.value = '4';
                }
            }
        }

        function updateCoopModalLabels() {
            const hostMode = getCoopModeConfig(getActiveCoopMode('host'));
            const joinMode = getCoopModeConfig(getActiveCoopMode('join'));
            const hostTitle = document.getElementById('coopHostModalTitle');
            if (hostTitle) hostTitle.textContent = `Hospedar ${hostMode.label}`;
            const hostSubtitle = document.getElementById('coopHostModalSubtitle');
            if (hostSubtitle) hostSubtitle.textContent = hostMode.hostHint;
            const joinTitle = document.getElementById('coopJoinModalTitle');
            if (joinTitle) joinTitle.textContent = `Entrar em ${joinMode.label}`;
            const joinSubtitle = document.getElementById('coopJoinModalSubtitle');
            if (joinSubtitle) joinSubtitle.textContent = joinMode.joinHint;
        }

        function initCoopUI() {
            ['coopHostModal', 'coopJoinModal'].forEach(attachModalBackdropClose);
            setActiveCoopMode(DEFAULT_COOP_MODE, 'host');
            setActiveCoopMode(DEFAULT_COOP_MODE, 'join');
            startCoopPresenceWatcher();
            syncCoopHostControls();
        }

        function attachModalBackdropClose(modalId) {
            const modal = document.getElementById(modalId);
            if (!modal) return;
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }

        function checkAuth() {
            const token = localStorage.getItem('token');
            const player = localStorage.getItem('player');

            if (token && player) {
                try {
                    currentUser = JSON.parse(player);
                    renderTopBarActions(currentUser);
                    personalizeHeroSection(currentUser);
                    updateHeroLiveStats(currentUser);
                    showLoggedInView();
                    loadUserStats();

                    // Esconder links de convidado
                    const guestLinks = document.getElementById('guestLinks');
                    if (guestLinks) guestLinks.style.display = 'none';
                } catch (e) {
                    console.error('Erro ao restaurar sessão:', e);
                    logout();
                }
            }
        }

        function renderTopBarActions(user) {
            const container = document.getElementById('topBarActions');
            container.innerHTML = '';

            if (user) {
                const chip = document.createElement('div');
                chip.className = 'profile-chip';
                chip.style.cursor = 'pointer';
                chip.onclick = openUserMenu;
                chip.innerHTML = `
                    <div class="chip-avatar">${(user.display_name || user.username).charAt(0).toUpperCase()}</div>
                    <div>
                        <strong>${user.display_name || user.username}</strong>
                        <small>Nível ${user.level || 1}</small>
                    </div>
                `;

                const statsBtn = document.createElement('button');
                statsBtn.className = 'ghost';
                statsBtn.textContent = 'ESTATÍSTICAS';
                statsBtn.onclick = () => switchTab('stats');

                container.appendChild(statsBtn);
                container.appendChild(chip);
            } else {
                const loginBtn = document.createElement('button');
                loginBtn.className = 'ghost';
                loginBtn.textContent = 'LOGIN';
                loginBtn.onclick = () => switchTab('login');

                const registerBtn = document.createElement('button');
                registerBtn.className = 'primary';
                registerBtn.textContent = 'CRIAR CONTA';
                registerBtn.onclick = () => switchTab('register');

                container.appendChild(loginBtn);
                container.appendChild(registerBtn);
            }
        }

        function openUserMenu() {
            const modal = document.getElementById('userMenuModal');
            modal.style.display = 'flex';

            // Preencher dados atuais
            document.getElementById('editDisplayName').value = currentUser.display_name || currentUser.username;
            document.getElementById('editBodyColor').value = currentUser.skin_body || '#ff0000';
            document.getElementById('editHeadColor').value = currentUser.skin_head || '#ff0000';
            currentSkinTexture = currentUser.skin_texture || null;
            const textureInput = document.getElementById('skinTextureInput');
            if (textureInput) textureInput.value = '';
            updateSkinTexturePreview();

            // Listeners para preview em tempo real
            document.getElementById('editBodyColor').oninput = updateSkinPreview;
            document.getElementById('editHeadColor').oninput = updateSkinPreview;
        }

        function closeUserMenu() {
            document.getElementById('userMenuModal').style.display = 'none';
        }

        function updateSkinPreview() {
            const bodyColor = document.getElementById('editBodyColor').value || '#ff0000';
            const headColor = document.getElementById('editHeadColor').value || '#ff0000';
            const head = document.getElementById('previewHead');
            const body = document.getElementById('previewBody');
            if (!head || !body) return;

            head.style.backgroundColor = headColor;
            body.style.backgroundColor = bodyColor;

            if (currentSkinTexture) {
                head.style.backgroundImage = `url(${currentSkinTexture})`;
                body.style.backgroundImage = `url(${currentSkinTexture})`;
                head.style.backgroundSize = body.style.backgroundSize = 'cover';
            } else {
                head.style.backgroundImage = 'none';
                body.style.backgroundImage = 'none';
            }
        }

        function updateSkinTexturePreview() {
            const preview = document.getElementById('skinTexturePreview');
            const removeBtn = document.getElementById('removeSkinTextureBtn');
            if (!preview || !removeBtn) return;

            if (currentSkinTexture) {
                preview.style.backgroundImage = `url(${currentSkinTexture})`;
                preview.textContent = '';
                removeBtn.style.display = 'inline-block';
            } else {
                preview.style.backgroundImage = 'none';
                preview.textContent = 'Nenhuma textura selecionada';
                removeBtn.style.display = 'none';
            }
            updateSkinPreview();
        }

        function handleSkinTextureUpload(event) {
            const file = event.target.files?.[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                alert('Selecione um arquivo de imagem válido.');
                event.target.value = '';
                return;
            }

            if (file.size > MAX_SKIN_TEXTURE_BYTES) {
                const limitMb = (MAX_SKIN_TEXTURE_BYTES / (1024 * 1024)).toFixed(1);
                const fileMb = (file.size / (1024 * 1024)).toFixed(2);
                alert(`A textura possui ${fileMb} MB e excede o limite de ${limitMb} MB.`);
                event.target.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                currentSkinTexture = e.target.result;
                updateSkinTexturePreview();
            };
            reader.readAsDataURL(file);
        }

        async function saveDisplayName() {
            const newName = document.getElementById('editDisplayName').value;
            if (!newName) return;

            const result = await updateDisplayName(newName);
            if (result) {
                currentUser.display_name = result.display_name;
                renderTopBarActions(currentUser);
                displayUserStats({ profile: currentUser }); // Atualizar UI
                alert('Nome atualizado!');
            }
        }

        async function saveSkin() {
            const bodyColor = document.getElementById('editBodyColor').value;
            const headColor = document.getElementById('editHeadColor').value;

            const result = await updateSkin(bodyColor, headColor, currentSkinTexture);
            if (result) {
                currentUser.skin_body = result.skin_body;
                currentUser.skin_head = result.skin_head;
                currentUser.skin_texture = result.skin_texture;
                currentSkinTexture = result.skin_texture || currentSkinTexture;
                updateSkinTexturePreview();
                // Salvar no localStorage para o jogo ler
                try {
                    localStorage.setItem(PLAYER_SKIN_STORAGE_KEY, JSON.stringify({ body: bodyColor, head: headColor, texture: currentSkinTexture }));
                } catch (storageError) {
                    console.warn('Falha ao armazenar skin localmente', storageError);
                    alert('Visual salvo, mas o cache local ficou sem espaço (isso não afeta o servidor).');
                    return;
                }
                alert('Skin salva!');
            } else {
                alert('Não foi possível salvar o visual. Verifique o tamanho da textura e tente novamente.');
            }
        }

        const skinTextureInputEl = document.getElementById('skinTextureInput');
        if (skinTextureInputEl) {
            skinTextureInputEl.addEventListener('change', handleSkinTextureUpload);
        }

        const removeTextureBtn = document.getElementById('removeSkinTextureBtn');
        if (removeTextureBtn) {
            removeTextureBtn.addEventListener('click', () => {
                currentSkinTexture = null;
                updateSkinTexturePreview();
            });
        }

        const queueModeModal = document.getElementById('queueModeModal');
        if (queueModeModal) {
            queueModeModal.addEventListener('click', (event) => {
                if (event.target === queueModeModal) {
                    closeQueueModal();
                }
            });
        }

        function openCoopHostModal(event, mode = DEFAULT_COOP_MODE) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            setActiveCoopMode(mode, 'host');
            const modal = document.getElementById('coopHostModal');
            if (!modal) return;
            modal.dataset.mode = getActiveCoopMode('host');
            const nameInput = document.getElementById('coopHostName');
            if (nameInput && !nameInput.value) {
                nameInput.value = `${getDefaultCoopCodename()} Squad`;
            }
            const hostPlayerInput = document.getElementById('coopHostPlayer');
            if (hostPlayerInput && !hostPlayerInput.value) {
                hostPlayerInput.value = getDefaultCoopCodename();
            }
            const interfaceInput = document.getElementById('coopHostInterface');
            if (interfaceInput && !interfaceInput.value) {
                interfaceInput.placeholder = 'Ex: 25.xxx (Radmin)';
            }
            setCoopStatusMessage('coopHostStatus', '');
            toggleCoopLaunchButton('host', false, getActiveCoopMode('host'));
            cancelCoopAutoLaunch();
            modal.style.display = 'flex';
            syncCoopHostControls();
        }

        function openCoopJoinModal(event, mode = DEFAULT_COOP_MODE) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            setActiveCoopMode(mode, 'join');
            const modal = document.getElementById('coopJoinModal');
            if (!modal) return;
            modal.dataset.mode = getActiveCoopMode('join');
            const nameInput = document.getElementById('coopJoinPlayer');
            if (nameInput && !nameInput.value) {
                nameInput.value = getDefaultCoopCodename();
            }
            setCoopStatusMessage('coopJoinStatus', '');
            toggleCoopLaunchButton('client', false, getActiveCoopMode('join'));
            cancelCoopAutoLaunch();
            modal.style.display = 'flex';
            scanCoopLobbies(true);
        }

        function closeCoopModal(id) {
            const modal = document.getElementById(id);
            if (modal) modal.style.display = 'none';
        }

        function getDefaultCoopCodename() {
            return (currentUser?.display_name || currentUser?.username || 'Convidado');
        }

        function sanitizeSkinColorHex(value, fallback) {
            if (typeof value === 'string' && HEX_COLOR_REGEX.test(value.trim())) {
                return value.trim();
            }
            return fallback;
        }

        function resolvePlayerSkinPreference() {
            const fallback = { ...DEFAULT_PLAYER_SKIN };
            try {
                const cachedRaw = localStorage.getItem(PLAYER_SKIN_STORAGE_KEY);
                const cached = cachedRaw ? JSON.parse(cachedRaw) : null;
                const resolvedTexture = typeof (cached?.texture ?? currentUser?.skin_texture) === 'string'
                    ? (cached?.texture ?? currentUser?.skin_texture)
                    : fallback.texture;
                return {
                    body: sanitizeSkinColorHex(cached?.body || currentUser?.skin_body, fallback.body),
                    head: sanitizeSkinColorHex(cached?.head || currentUser?.skin_head, fallback.head),
                    texture: resolvedTexture
                };
            } catch (error) {
                console.warn('Skin local inválida, usando padrão.', error);
                return { ...fallback };
            }
        }

        function setCoopStatusMessage(elementId, message, tone = 'info') {
            const el = document.getElementById(elementId);
            if (!el) return;
            el.classList.remove('success', 'error');
            if (!message) {
                el.style.display = 'none';
                el.textContent = '';
                return;
            }
            if (tone === 'success' || tone === 'error') {
                el.classList.add(tone);
            }
            el.textContent = message;
            el.style.display = 'block';
        }

        function toggleCoopLaunchButton(role, enabled, mode = null) {
            const btnId = role === 'host' ? 'coopHostLaunchBtn' : 'coopJoinLaunchBtn';
            const btn = document.getElementById(btnId);
            if (!btn) return;
            const resolvedMode = getCoopModeKey(mode || (role === 'host' ? getActiveCoopMode('host') : getActiveCoopMode('join')));
            const config = getCoopModeConfig(resolvedMode);
            btn.textContent = role === 'host' ? config.hostLaunchLabel : config.clientLaunchLabel;
            btn.style.display = enabled ? 'block' : 'none';
            btn.disabled = !enabled;
        }

        function cancelCoopAutoLaunch() {
            if (coopAutoLaunchTimer) {
                clearTimeout(coopAutoLaunchTimer);
                coopAutoLaunchTimer = null;
            }
        }

        function scheduleCoopAutoLaunch(role, statusTarget) {
            cancelCoopAutoLaunch();
            coopAutoLaunchTimer = setTimeout(() => {
                coopAutoLaunchTimer = null;
                launchCoopGame(role, statusTarget);
            }, 1200);
        }

        function stashCoopLaunchPayload(intent) {
            if (!intent) return null;
            try {
                if (typeof sessionStorage === 'undefined') {
                    return null;
                }
                const payload = {
                    mode: intent.mode || DEFAULT_COOP_MODE,
                    role: intent.role,
                    player: intent.player,
                    hostPlayer: intent.hostPlayer,
                    hostToken: intent.hostToken,
                    lobbyId: intent.lobbyId,
                    lobbyName: intent.lobbyName,
                    address: intent.address,
                    interface: intent.interface,
                    port: intent.port,
                    maxPlayers: intent.maxPlayers,
                    skin: intent.skin || null,
                    timestamp: Date.now()
                };
                const key = `${COOP_RUN_STORAGE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                sessionStorage.setItem(key, JSON.stringify(payload));
                return key;
            } catch (error) {
                console.warn('Falha ao preparar sessão co-op para o jogo', error);
                return null;
            }
        }

        function launchCoopGame(expectedRole = null, statusTarget = 'coopGlobalStatus') {
            const store = getCoopIntentStore();
            const role = expectedRole || store.lastRole || (store.host ? 'host' : 'client');
            const intent = role ? getStoredCoopIntent(role) : null;
            if (!intent) {
                setCoopStatusMessage(statusTarget, 'Configure um lobby antes de iniciar o Survival.', 'error');
                return;
            }
            if (expectedRole && intent.role && intent.role !== expectedRole) {
                setCoopStatusMessage(statusTarget, 'Sessão atual não corresponde ao papel esperado. Reabra o modal.', 'error');
                return;
            }
            if (intent.role === 'host' && !intent.hostToken) {
                setCoopStatusMessage(statusTarget, 'Token de host indefinido. Gere o lobby novamente.', 'error');
                return;
            }
            if (intent.role === 'client' && !intent.address) {
                setCoopStatusMessage(statusTarget, 'Informe o IP/host do lobby antes de abrir o jogo.', 'error');
                return;
            }
            if (!intent.skin) {
                const fallbackSkin = resolvePlayerSkinPreference();
                persistCoopSessionIntent({ role: intent.role, mode: intent.mode || DEFAULT_COOP_MODE, skin: fallbackSkin }, true);
                intent.skin = fallbackSkin;
            }
            const normalizedRole = role || intent.role || 'client';
            const mode = intent.mode || DEFAULT_COOP_MODE;
            const launchPayloadKey = stashCoopLaunchPayload({ ...intent, role: normalizedRole, mode });
            const modeLabel = getCoopModeConfig(mode).label;
            setCoopStatusMessage(statusTarget, `Abrindo ${modeLabel}...`, 'success');
            closeCoopModal('coopHostModal');
            closeCoopModal('coopJoinModal');
            const destination = new URL('game.html', window.location.href);
            destination.searchParams.set('coopRole', normalizedRole);
            destination.searchParams.set('coopMode', mode);
            if (launchPayloadKey) {
                destination.searchParams.set('coopRun', launchPayloadKey);
            }
            if (mode === 'survival') {
                destination.searchParams.set('survivalVariant', 'coop');
            }
            window.location.href = destination.toString();
        }

        function syncCoopHostControls() {
            const shutdownBtn = document.getElementById('coopShutdownBtn');
            const hostHint = document.getElementById('coopHostHint');
            const intent = getStoredCoopIntent('host');
            const hasHostLobby = Boolean(intent?.hostToken);
            const intentMode = intent?.mode || getActiveCoopMode('host');
            const modeConfig = getCoopModeConfig(intentMode);

            if (shutdownBtn) {
                shutdownBtn.disabled = !hasHostLobby;
                shutdownBtn.title = hasHostLobby
                    ? 'Encerrar lobby atual para liberar slots'
                    : 'Hospede um lobby para liberar esta ação';
            }
            toggleCoopLaunchButton('host', hasHostLobby, intentMode);

            if (hostHint) {
                if (hasHostLobby) {
                    const ipLabel = intent?.interface || intent?.address || 'IP não informado';
                    const slotsLabel = intent?.maxPlayers ? `${intent.maxPlayers} vagas` : 'vagas indefinidas';
                    const lobbyLabel = intent?.lobbyName ? `${intent.lobbyName} • ` : '';
                    hostHint.textContent = `${modeConfig.label}: ${lobbyLabel}${ipLabel}:${intent?.port || 7777} • ${slotsLabel}.`;
                } else {
                    hostHint.textContent = 'Nenhum lobby local ativo.';
                }
            }
        }

        async function handleCoopHostSubmit(event) {
            event.preventDefault();
            const mode = getActiveCoopMode('host');
            const lobbyName = document.getElementById('coopHostName').value.trim();
            const port = Number(document.getElementById('coopHostPort').value) || 7777;
            const maxPlayers = Number(document.getElementById('coopHostSlots').value) || 4;
            const preferredInterface = document.getElementById('coopHostInterface').value.trim();
            const hostPlayer = document.getElementById('coopHostPlayer').value.trim() || getDefaultCoopCodename();
            const announce = document.getElementById('coopHostAnnounce').checked;
            const skin = resolvePlayerSkinPreference();

            if (!lobbyName) {
                setCoopStatusMessage('coopHostStatus', 'Defina um nome de lobby.', 'error');
                return;
            }

            const payload = {
                mode,
                lobbyName,
                port,
                maxPlayers: mode === 'x1' ? 3 : maxPlayers,
                interface: preferredInterface,
                announce,
                hostPlayer
            };

            setCoopStatusMessage('coopHostStatus', 'Preparando servidor local co-op...', 'info');
            persistCoopSessionIntent({ role: 'host', player: hostPlayer, skin, ...payload });

            try {
                const response = await fetch(`${COOP_API_URL}/host`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, skin })
                });

                if (!response.ok) {
                    throw new Error('Host endpoint indisponível');
                }

                const data = await response.json().catch(() => ({}));
                if (data?.lobby) {
                    persistCoopSessionIntent({
                        role: 'host',
                        mode,
                        lobbyId: data.lobby.id,
                        port: data.lobby.port,
                        interface: data.lobby.interface,
                        hostToken: data.lobby.hostToken,
                        maxPlayers: data.lobby.maxPlayers,
                        lobbyName: data.lobby.name || lobbyName,
                        skin: data.lobby.hostSkin || skin
                    }, true);
                }
                const label = data?.message || 'Lobby configurado! Abra o jogo para carregar o host.';
                setCoopStatusMessage('coopHostStatus', label, 'success');
                toggleCoopLaunchButton('host', true, mode);
            } catch (error) {
                console.warn('Co-Op host error', error);
                setCoopStatusMessage('coopHostStatus', 'Falha ao iniciar lobby. Verifique se o servidor co-op Node está rodando.', 'error');
                toggleCoopLaunchButton('host', false, mode);
                cancelCoopAutoLaunch();
            } finally {
                refreshCoopPresence();
            }
        }

        async function handleCoopJoinSubmit(event) {
            event.preventDefault();
            const mode = getActiveCoopMode('join');
            const codename = document.getElementById('coopJoinPlayer').value.trim();
            const address = document.getElementById('coopJoinAddress').value.trim();
            const port = Number(document.getElementById('coopJoinPort').value) || 7777;
            const skin = resolvePlayerSkinPreference();

            if (!address) {
                setCoopStatusMessage('coopJoinStatus', 'Informe o IP/host do lobby.', 'error');
                return;
            }

            const payload = { mode, player: codename || getDefaultCoopCodename(), address, port };
            setCoopStatusMessage('coopJoinStatus', 'Validando disponibilidade do lobby...', 'info');
            persistCoopSessionIntent({ role: 'client', player: payload.player, skin, ...payload });

            try {
                const response = await fetch(`${COOP_API_URL}/join`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, skin })
                });

                if (!response.ok) {
                    throw new Error('Join endpoint indisponível');
                }

                const data = await response.json().catch(() => ({}));
                if (data?.lobby) {
                    persistCoopSessionIntent({
                        role: 'client',
                        mode,
                        lobbyId: data.lobby.id,
                        port: data.lobby.port,
                        interface: data.lobby.interface,
                        maxPlayers: data.lobby.maxPlayers,
                        lobbyName: data.lobby.name,
                        skin
                    }, true);
                }
                const label = data?.message || 'Lobby encontrado! Clique em "Jogar Agora" para carregar o cliente.';
                setCoopStatusMessage('coopJoinStatus', label, 'success');
                toggleCoopLaunchButton('client', true, mode);
                scheduleCoopAutoLaunch('client', 'coopJoinStatus');
            } catch (error) {
                console.warn('Co-Op join error', error);
                setCoopStatusMessage('coopJoinStatus', 'Não foi possível conectar. Confirme se o host abriu a porta e está anunciando na LAN.', 'error');
                toggleCoopLaunchButton('client', false, mode);
                cancelCoopAutoLaunch();
            }
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
                console.warn('Falha ao carregar intenção co-op', error);
                return {};
            }
        }

        function saveCoopIntentStore(store) {
            try {
                const hasHost = Boolean(store.host);
                const hasClient = Boolean(store.client);
                if (!hasHost && !hasClient) {
                    localStorage.removeItem(COOP_INTENT_STORAGE_KEY);
                } else {
                    const payload = { ...store };
                    if (!hasHost) delete payload.host;
                    if (!hasClient) delete payload.client;
                    if (!payload.lastRole || !payload[payload.lastRole]) {
                        payload.lastRole = hasHost ? 'host' : 'client';
                    }
                    localStorage.setItem(COOP_INTENT_STORAGE_KEY, JSON.stringify(payload));
                }
                syncCoopHostControls();
            } catch (error) {
                console.warn('Falha ao salvar intenção co-op', error);
            }
        }

        function getStoredCoopIntent(role = null) {
            const store = getCoopIntentStore();
            if (role) {
                return store[role] || null;
            }
            if (store.lastRole && store[store.lastRole]) {
                return store[store.lastRole];
            }
            return store.host || store.client || null;
        }

        function persistCoopSessionIntent(intent, merge = false) {
            try {
                const store = getCoopIntentStore();
                const role = intent?.role || store.lastRole || 'client';
                const base = merge ? (store[role] || {}) : {};
                const mode = getCoopModeKey(intent?.mode || base.mode || (role === 'host' ? activeHostMode : activeJoinMode));
                store[role] = { ...base, ...intent, mode, role, timestamp: Date.now() };
                store.lastRole = role;
                saveCoopIntentStore(store);
            } catch (error) {
                console.warn('Falha ao salvar intenção co-op', error);
            }
        }

        function clearCoopHostIntent() {
            try {
                const store = getCoopIntentStore();
                if (!store.host) {
                    saveCoopIntentStore(store);
                    return;
                }
                delete store.host;
                if (store.lastRole === 'host') {
                    store.lastRole = store.client ? 'client' : null;
                }
                saveCoopIntentStore(store);
            } catch (error) {
                console.warn('Falha ao limpar intenção de host co-op', error);
            }
        }

        async function handleCoopShutdown(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }

            const intent = getStoredCoopIntent('host');
            if (!intent?.hostToken) {
                setCoopStatusMessage('coopGlobalStatus', 'Nenhum lobby local para encerrar.', 'error');
                return;
            }

            setCoopStatusMessage('coopGlobalStatus', 'Encerrando lobby atual...', 'info');

            try {
                const response = await fetch(`${COOP_API_URL}/lobby`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hostToken: intent.hostToken, mode: intent.mode || DEFAULT_COOP_MODE })
                });

                if (!response.ok) {
                    throw new Error('DELETE /coop/lobby falhou');
                }

                clearCoopHostIntent();
                setCoopStatusMessage('coopGlobalStatus', 'Lobby encerrado com sucesso.', 'success');
            } catch (error) {
                console.warn('Co-Op shutdown error', error);
                setCoopStatusMessage('coopGlobalStatus', 'Não foi possível encerrar o lobby. Verifique se você ainda é o host.', 'error');
            } finally {
                syncCoopHostControls();
                refreshCoopPresence();
            }
        }

        async function scanCoopLobbies(force = false) {
            if (isScanningCoopLobbies && !force) return;
            const mode = getActiveCoopMode('join');
            const list = document.getElementById('coopLobbyList');
            if (!list) return;
            list.innerHTML = '<small class="coop-inline-hint">Procurando broadcast UDP...</small>';
            isScanningCoopLobbies = true;

            try {
                const response = await fetch(`${COOP_API_URL}/discovery?mode=${mode}`, { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error('Discovery indisponível');
                }
                const data = await response.json().catch(() => ({}));
                const lobbies = Array.isArray(data?.lobbies) ? data.lobbies : [];
                lastDiscoveredLobbies[mode] = lobbies;
                renderCoopDiscoveryList(mode, lobbies);
            } catch (error) {
                console.warn('Discovery error', error);
                renderCoopDiscoveryList(mode, []);
            } finally {
                isScanningCoopLobbies = false;
            }
        }

        function renderCoopDiscoveryList(mode, lobbies) {
            const list = document.getElementById('coopLobbyList');
            if (!list) return;
            const config = getCoopModeConfig(mode);

            if (!lobbies.length) {
                list.innerHTML = `<small class="coop-inline-hint">Nenhum lobby ${config.label} detectado via broadcast. Cole o IP manualmente.</small>`;
                return;
            }

            list.innerHTML = '';
            lobbies.forEach((lobby, index) => {
                const item = document.createElement('div');
                item.className = 'coop-discovery-item';
                const name = lobby.name || `Lobby ${index + 1}`;
                const ip = lobby.interface || lobby.address || lobby.ip || '—';
                const port = lobby.port || 7777;
                const players = lobby.players ?? '?';
                const maxPlayers = lobby.maxPlayers ?? 4;
                const lobbyMode = getCoopModeKey(lobby.mode || mode);
                const lobbyConfig = getCoopModeConfig(lobbyMode);
                item.innerHTML = `
                    <div>
                        <strong>${name}</strong>
                        <small>${ip}:${port} • ${players}/${maxPlayers} jogadores • Host: ${lobby.hostPlayer || 'Desconhecido'} • ${lobbyConfig.label}</small>
                    </div>
                `;
                const joinBtn = document.createElement('button');
                joinBtn.type = 'button';
                joinBtn.textContent = 'Selecionar';
                joinBtn.addEventListener('click', () => applyDiscoveredLobby(lobbyMode, ip, port, name));
                item.appendChild(joinBtn);
                list.appendChild(item);
            });
        }

        function applyDiscoveredLobby(mode, ip, port, name) {
            const addressInput = document.getElementById('coopJoinAddress');
            const portInput = document.getElementById('coopJoinPort');
            if (mode) {
                setActiveCoopMode(mode, 'join');
            }
            if (addressInput && ip && ip !== '—') {
                addressInput.value = ip;
            }
            if (portInput && port) {
                portInput.value = port;
            }
            const config = getCoopModeConfig(mode);
            setCoopStatusMessage('coopJoinStatus', `Lobby "${name}" (${config.label}) selecionado. Pressione Entrar para conectar.`, 'info');
        }

        async function pasteClipboardInto(inputId) {
            if (!navigator.clipboard) {
                alert('Clipboard API indisponível neste navegador.');
                return;
            }
            try {
                const text = await navigator.clipboard.readText();
                const input = document.getElementById(inputId);
                if (input && text) {
                    input.value = text.trim();
                }
            } catch (error) {
                alert('Não foi possível acessar a área de transferência.');
            }
        }

        function startCoopPresenceWatcher() {
            if (coopPresenceTimer) {
                clearInterval(coopPresenceTimer);
            }
            refreshCoopPresence();
            coopPresenceTimer = setInterval(refreshCoopPresence, COOP_DISCOVERY_INTERVAL);
        }

        async function refreshCoopPresence() {
            if (isFetchingCoopPresence) return;
            isFetchingCoopPresence = true;
            try {
                const modes = Object.keys(COOP_MODE_CONFIG);
                const results = await Promise.all(modes.map(async mode => {
                    try {
                        const response = await fetch(`${COOP_API_URL}/presence?mode=${mode}`, { cache: 'no-store' });
                        if (!response.ok) throw new Error('presence offline');
                        const payload = await response.json().catch(() => null);
                        return { mode, payload };
                    } catch (error) {
                        return { mode, payload: null };
                    }
                }));
                results.forEach(({ mode, payload }) => {
                    coopPresenceState[mode] = payload;
                    updateCoopPresenceUI(mode, payload);
                });
            } catch (error) {
                Object.keys(COOP_MODE_CONFIG).forEach(mode => updateCoopPresenceUI(mode, null));
            } finally {
                isFetchingCoopPresence = false;
            }
        }

        function updateCoopPresenceUI(mode, payload) {
            const config = getCoopModeConfig(mode);
            const statusEl = document.getElementById(config.ui.serverStatusId);
            const countEl = document.getElementById(config.ui.onlineCountId);
            const indicator = document.getElementById(config.ui.indicatorId);
            const timestamp = config.ui.timestampId ? document.getElementById(config.ui.timestampId) : null;

            const serverOnline = Boolean(payload);
            const lobbyOnline = Boolean(payload?.online);
            const playersOnline = lobbyOnline ? (payload.players_online ?? 0) : 0;

            if (statusEl) {
                statusEl.textContent = serverOnline
                    ? (lobbyOnline ? 'Online' : 'Standby')
                    : 'Offline';
            }
            if (countEl) countEl.textContent = playersOnline;

            if (indicator) {
                indicator.dataset.state = serverOnline ? 'online' : 'offline';
                const label = indicator.querySelector('div');
                if (label) {
                    if (!serverOnline) {
                        label.textContent = `${config.label}: servidor indisponível.`;
                    } else if (!lobbyOnline) {
                        label.textContent = `${config.label}: nenhum lobby ativo.`;
                    } else {
                        const lobbyName = payload?.lobby?.name || 'Lobby LAN';
                        label.textContent = `${config.label}: ${lobbyName} ativo.`;
                    }
                }
            }

            if (timestamp) {
                const date = payload?.timestamp ? new Date(payload.timestamp) : new Date();
                timestamp.textContent = date.toLocaleTimeString('pt-BR');
            }
        }



        function selectGameMode(mode, queueType = null, options = {}) {
            const normalized = (mode || '').toLowerCase();
            const requiresQueue = normalized === 'battleroyale' || normalized === 'tactical';

            if (requiresQueue && !queueType) {
                openQueueModal(normalized);
                return;
            }

            let target = null;
            if (normalized === 'survival') {
                target = 'game.html';
            } else if (normalized === 'battleroyale') {
                target = 'gamebt.html';
            } else if (normalized === 'tactical') {
                target = 'game5v5.html';
            }

            if (!target) return;

            const destination = new URL(target, window.location.href);

            if (queueType) {
                destination.searchParams.set('queue', queueType);
                if (queueType === 'custom' && options.mapId) {
                    destination.searchParams.set('mapId', options.mapId);
                }
                window.location.href = destination.toString();
                return;
            }

            if (normalized === 'survival') {
                const variant = (options.variant || 'solo').toLowerCase();
                destination.searchParams.set('survivalVariant', variant);
            }

            if (options.params && typeof options.params === 'object') {
                Object.entries(options.params).forEach(([key, value]) => {
                    if (typeof value !== 'undefined' && value !== null) {
                        destination.searchParams.set(key, value);
                    }
                });
            }

            window.location.href = destination.toString();
        }


        function resolveQueueRankLabel() {
            if (!currentUser || typeof calculateRank !== 'function') {
                return 'Rank Atual: -';
            }
            const info = calculateRank(currentUser) || {};
            return `Rank Atual: ${info.rank || '-'}`;
        }

        function openQueueModal(mode) {
            const normalized = queueModesConfig[mode] ? mode : 'battleroyale';
            pendingQueueMode = normalized;
            const config = queueModesConfig[normalized];

            const iconEl = document.getElementById('queueModalIcon');
            const titleEl = document.getElementById('queueModalTitle');
            const descEl = document.getElementById('queueModalDescription');
            const casualEl = document.getElementById('queueCasualCopy');
            const rankedEl = document.getElementById('queueRankedCopy');
            const noteEl = document.getElementById('queueModalNote');
            const rankEl = document.getElementById('queueModalRank');

            if (iconEl) iconEl.textContent = config.icon;
            if (titleEl) titleEl.textContent = config.title;
            if (descEl) descEl.textContent = config.description;
            if (casualEl) casualEl.textContent = config.casualCopy;
            if (rankedEl) rankedEl.textContent = config.rankedCopy;
            if (noteEl) noteEl.textContent = config.note;
            if (rankEl) rankEl.textContent = resolveQueueRankLabel();

            const modal = document.getElementById('queueModeModal');
            if (modal) modal.style.display = 'flex';
            renderCustomMapOptions();
        }

        function closeQueueModal() {
            const modal = document.getElementById('queueModeModal');
            if (modal) modal.style.display = 'none';
            pendingQueueMode = null;
            renderCustomMapOptions();
        }

        function confirmQueueSelection(queueType) {
            if (!pendingQueueMode) return;
            const normalizedQueue = queueType === 'ranked' ? 'ranked' : 'casual';
            const mode = pendingQueueMode;
            closeQueueModal();
            selectGameMode(mode, normalizedQueue);
        }

        function getStoredTacticalMaps() {
            try {
                const data = localStorage.getItem(TACTICAL_STORAGE_KEY);
                if (!data) return [];
                const parsed = JSON.parse(data);
                return Array.isArray(parsed) ? parsed : [];
            } catch (error) {
                console.warn('Não foi possível carregar mapas táticos locais.', error);
                return [];
            }
        }

        function renderCustomMapOptions() {
            const section = document.getElementById('customMapSection');
            const list = document.getElementById('customMapList');
            const empty = document.getElementById('customMapEmpty');
            const actionBtn = document.getElementById('playCustomMapBtn');
            if (!section || !list || !empty || !actionBtn) return;

            const shouldDisplay = pendingQueueMode === 'tactical';
            section.style.display = shouldDisplay ? 'block' : 'none';
            if (!shouldDisplay) return;

            const maps = getStoredTacticalMaps();
            if (!selectedCustomMapId && maps.length) {
                selectedCustomMapId = maps[0].id;
                localStorage.setItem(TACTICAL_SELECTED_KEY, selectedCustomMapId);
            }

            list.innerHTML = '';
            if (!maps.length) {
                empty.style.display = 'block';
                actionBtn.disabled = true;
                return;
            }

            empty.style.display = 'none';
            actionBtn.disabled = !selectedCustomMapId;

            maps.forEach(map => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `custom-map-card${map.id === selectedCustomMapId ? ' active' : ''}`;
                const ally = map.stats?.allySpawns ?? map.tactical?.teamSpawns?.allies?.length ?? 0;
                const enemy = map.stats?.enemySpawns ?? map.tactical?.teamSpawns?.enemies?.length ?? 0;
                const rounds = map.tactical?.roundConfig?.roundsToWin ?? 9;
                const updated = map.updatedAt ? new Date(map.updatedAt).toLocaleDateString('pt-BR') : '';
                button.innerHTML = `
                    <div style="text-align:left;flex:1;">
                        <div style="font-weight:600;">${map.name}</div>
                        <small>${ally} spawns Vanguard • ${enemy} spawns Legion</small>
                    </div>
                    <div style="text-align:right;">
                        <small>${rounds} rounds</small>
                        ${updated ? `<small>${updated}</small>` : ''}
                    </div>
                `;
                button.addEventListener('click', () => selectCustomMap(map.id));
                list.appendChild(button);
            });
        }

        function selectCustomMap(mapId) {
            selectedCustomMapId = mapId;
            localStorage.setItem(TACTICAL_SELECTED_KEY, mapId);
            renderCustomMapOptions();
        }

        function launchCustomTacticalMatch() {
            if (pendingQueueMode !== 'tactical') return;
            const maps = getStoredTacticalMaps();
            if (!maps.length) {
                alert('Nenhum mapa custom encontrado. Salve um mapa no editor primeiro.');
                return;
            }
            if (!selectedCustomMapId) {
                selectedCustomMapId = maps[0].id;
                localStorage.setItem(TACTICAL_SELECTED_KEY, selectedCustomMapId);
            }
            closeQueueModal();
            selectGameMode('tactical', 'custom', { mapId: selectedCustomMapId });
        }

        function showMessage(text, type = 'error') {
            const msg = document.getElementById('message');
            if (msg) {
                msg.textContent = text;
                msg.className = `message ${type}`;
                msg.style.display = 'block';
            } else {
                alert(text);
            }
        }

        function hideMessage() {
            const msg = document.getElementById('message');
            if (msg) msg.style.display = 'none';
        }

        function showLoading(show = true) {
            const loading = document.getElementById('loading');
            if (loading) loading.classList.toggle('active', show);
            document.querySelectorAll('button').forEach(btn => btn.disabled = show);
        }

        async function handleLogin(event) {
            event.preventDefault();
            hideMessage();

            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;

            showLoading(true);

            try {
                const response = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('player', JSON.stringify(data.player));
                    currentUser = data.player;
                    showMessage('Login realizado com sucesso!', 'success');
                    renderTopBarActions(currentUser);
                    personalizeHeroSection(currentUser);
                    updateHeroLiveStats(currentUser);
                    showLoggedInView();
                    loadUserStats();

                    // Esconder links de convidado
                    const guestLinks = document.getElementById('guestLinks');
                    if (guestLinks) guestLinks.style.display = 'none';
                } else {
                    showMessage(data.error || 'Erro ao fazer login');
                }
            } catch (error) {
                console.error('Erro:', error);
                showMessage('Erro de conexão com o servidor');
            } finally {
                showLoading(false);
            }
        }

        async function handleRegister(event) {
            event.preventDefault();
            hideMessage();

            const username = document.getElementById('regUsername').value;
            const email = document.getElementById('regEmail').value;
            const displayName = document.getElementById('regDisplayName').value;
            const password = document.getElementById('regPassword').value;
            const confirmPassword = document.getElementById('regConfirmPassword').value;

            if (password !== confirmPassword) {
                showMessage('As senhas não coincidem');
                return;
            }

            if (password.length < 6) {
                showMessage('A senha deve ter no mínimo 6 caracteres');
                return;
            }

            showLoading(true);

            try {
                const response = await fetch(`${API_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, displayName, password })
                });

                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('player', JSON.stringify(data.player));
                    currentUser = data.player;
                    showMessage('Conta criada com sucesso!', 'success');
                    renderTopBarActions(currentUser);
                    personalizeHeroSection(currentUser);
                    updateHeroLiveStats(currentUser);
                    showLoggedInView();
                    loadUserStats();

                    // Esconder links de convidado
                    const guestLinks = document.getElementById('guestLinks');
                    if (guestLinks) guestLinks.style.display = 'none';
                } else {
                    showMessage(data.error || 'Erro ao criar conta');
                }
            } catch (error) {
                console.error('Erro:', error);
                showMessage('Erro de conexão com o servidor');
            } finally {
                showLoading(false);
            }
        }

        function logout() {
            localStorage.removeItem('token');
            localStorage.removeItem('player');
            currentUser = null;
            renderTopBarActions(null);
            personalizeHeroSection(null);
            updatePlayerRankCard(null, null);
            switchTab('login');

            // Mostrar links de convidado
            const guestLinks = document.getElementById('guestLinks');
            if (guestLinks) guestLinks.style.display = 'block';
        }

        function showLoggedInView() {
            // Unhide tabs
            document.getElementById('tabModeSelect').classList.remove('hidden');
            document.getElementById('tabStats').classList.remove('hidden');
            document.getElementById('tabLeaderboard').classList.remove('hidden');
            document.getElementById('tabMaps').classList.remove('hidden');

            switchTab('modeSelect');
        }

        function switchStatsMode(mode, button) {
            currentStatsMode = mode;

            document.querySelectorAll('.stats-mode-selector button').forEach(btn => btn.classList.remove('active'));
            const activeBtn = button || document.querySelector(`.stats-mode-selector button[data-mode="${mode}"]`);
            if (activeBtn) activeBtn.classList.add('active');

            const sections = {
                survival: document.getElementById('survivalStats'),
                battleroyale: document.getElementById('battleRoyaleStats'),
                tactical: document.getElementById('tacticalStats')
            };

            Object.entries(sections).forEach(([key, section]) => {
                if (section) section.style.display = key === mode ? 'block' : 'none';
            });

            if (mode === 'battleroyale') {
                loadBattleRoyaleStats();
            } else if (mode === 'tactical') {
                loadTacticalStats();
            }
        }

        async function loadModeStats(profileOverride = null) {
            const token = localStorage.getItem('token');
            if (!token) {
                resetModeCards();
                return;
            }

            try {
                let profile = profileOverride;
                if (!profile) {
                    const response = await fetch(`${API_URL}/stats`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (!response.ok) return;
                    const data = await response.json();
                    profile = data?.profile;
                    if (!profile) return;
                }

                document.getElementById('survivalBestRound').textContent = profile.highest_round || 0;
                document.getElementById('survivalBestScore').textContent = profile.best_score || 0;
                document.getElementById('survivalTotalKills').textContent = profile.total_kills || 0;

                updateBattleRoyaleCard(profile);
                updateTacticalCard(profile);

                currentUser = { ...(currentUser || {}), ...profile };
                loadBattleRoyaleStats();
                loadTacticalStats();
            } catch (err) {
                console.error('Erro ao carregar stats dos modos:', err);
            }
        }

        function resetModeCards() {
            ['survivalBestRound', 'survivalBestScore', 'survivalTotalKills', 'brWins', 'brBestPosition', 'brTotalKills', 'tacticalWins', 'tacticalMatches', 'tacticalWinRate', 'tacticalKills', 'tacticalBestRank']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '-';
                });
        }

        function updateBattleRoyaleCard(profile) {
            const winsEl = document.getElementById('brWins');
            const posEl = document.getElementById('brBestPosition');
            const killsEl = document.getElementById('brTotalKills');

            if (winsEl) winsEl.textContent = profile.br_wins || 0;
            if (posEl) posEl.textContent = profile.br_best_position && profile.br_best_position > 0
                ? profile.br_best_position
                : '-';
            if (killsEl) killsEl.textContent = profile.br_total_kills || 0;
        }

        function updateTacticalCard(profile) {
            const wins = profile.tactical_wins || 0;
            const matches = profile.tactical_games_played || 0;
            const kills = profile.tactical_total_kills || 0;
            const bestRankValue = profile.tactical_best_rank || 0;
            const winRate = matches > 0 ? `${((wins / matches) * 100).toFixed(1)}%` : '0%';
            const bestRankLabel = bestRankValue > 0 ? `Top ${bestRankValue}` : '-';

            const winsEl = document.getElementById('tacticalWins');
            const matchesEl = document.getElementById('tacticalMatches');
            const rateEl = document.getElementById('tacticalWinRate');
            const killsEl = document.getElementById('tacticalKills');
            const rankEl = document.getElementById('tacticalBestRank');

            if (winsEl) winsEl.textContent = wins;
            if (matchesEl) matchesEl.textContent = matches;
            if (rateEl) rateEl.textContent = winRate;
            if (killsEl) killsEl.textContent = kills;
            if (rankEl) rankEl.textContent = bestRankLabel;
        }

        async function loadUserStats() {
            const token = localStorage.getItem('token');
            if (!token) return;

            try {
                const response = await fetch(`${API_URL}/stats`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    currentUser = { ...(currentUser || {}), ...data.profile };
                    currentSkinTexture = currentUser.skin_texture || null;
                    renderTopBarActions(currentUser);
                    displayUserStats(data);
                } else if (response.status === 403) {
                    logout();
                }
            } catch (error) {
                console.error('Erro ao carregar stats:', error);
            }
        }

        function calculateRank(profile = {}) {
            const tiers = [
                { name: 'Bronze I', min: 0 },
                { name: 'Bronze II', min: 500 },
                { name: 'Bronze III', min: 1200 },
                { name: 'Prata I', min: 2500 },
                { name: 'Prata II', min: 4000 },
                { name: 'Prata III', min: 6000 },
                { name: 'Ouro I', min: 8500 },
                { name: 'Ouro II', min: 11500 },
                { name: 'Ouro III', min: 15000 },
                { name: 'Platina I', min: 20000 },
                { name: 'Platina II', min: 26000 },
                { name: 'Platina III', min: 32000 },
                { name: 'Diamante', min: 40000 }
            ];

            const score =
                (profile.level || 0) * 150 +
                (profile.highest_round || 0) * 120 +
                (profile.total_kills || 0) * 2 +
                (profile.br_wins || 0) * 800 +
                (profile.br_total_kills || 0) * 5;

            let currentTier = tiers[0];
            let nextTier = null;

            for (let i = 0; i < tiers.length; i++) {
                if (score >= tiers[i].min) {
                    currentTier = tiers[i];
                    nextTier = tiers[i + 1] || null;
                } else {
                    break;
                }
            }

            return {
                rank: currentTier.name,
                nextRank: nextTier?.name || null,
                pointsToNext: nextTier ? Math.max(0, nextTier.min - score) : 0,
                score
            };
        }

        function displayUserStats(data) {
            const profile = data.profile;
            const rankInfo = calculateRank(profile);

            // Atualizar cabeçalho do perfil
            document.getElementById('profileName').textContent = profile.display_name || profile.username;
            document.getElementById('profileDetails').textContent = `Nível ${profile.level} • ${Math.floor(profile.experience)} XP`;

            updatePlayerRankCard(profile, rankInfo);

            // Estatísticas de sobrevivência
            const survivalStats = profile.survival_stats || {};
            document.getElementById('statLevel').textContent = profile.level || 0;
            document.getElementById('statXP').textContent = profile.experience || 0;
            document.getElementById('statKills').textContent = profile.total_kills || 0;
            document.getElementById('statKD').textContent = profile.kd_ratio || 0;
            document.getElementById('statRound').textContent = profile.highest_round || 0;
            document.getElementById('statScore').textContent = profile.best_score || 0;

            // Atualizar cards dos modos usando dados já carregados
            loadModeStats(profile);

            const weaponStats = Array.isArray(data.weapons) ? data.weapons : [];
            const survivalWeapons = weaponStats.filter(w => (w.game_mode || 'survival') === 'survival');
            const brWeapons = weaponStats.filter(w => (w.game_mode || 'survival') === 'battleroyale');

            renderWeaponStats(survivalWeapons, 'weaponStats');
            renderWeaponStats(brWeapons, 'brWeaponStats', 'Battle Royale');
        }

        function renderWeaponStats(weapons, elementId, modeLabel = '') {
            const container = document.getElementById(elementId);
            if (!container) return;

            container.innerHTML = '';
            if (!weapons || weapons.length === 0) {
                const label = modeLabel ? ` no modo ${modeLabel}` : '';
                container.innerHTML = `<p style="color:#aaa;">Nenhuma estatística de arma registrada${label}.</p>`;
                return;
            }

            weapons.forEach(w => {
                const card = document.createElement('div');
                card.className = 'weapon-card';
                card.innerHTML = `
                    <div class="weapon-name">${w.weapon_name}</div>
                    <div class="weapon-detail">Kills: ${w.total_kills}</div>
                    <div class="weapon-detail">Precisão: ${w.accuracy}%</div>
                    <div class="weapon-detail">Headshots: ${w.total_headshots}</div>
                `;
                container.appendChild(card);
            });
        }

        function getRankColor(rank) {
            if (rank.includes('Bronze')) return '#cd7f32';
            if (rank.includes('Prata')) return '#c0c0c0';
            if (rank.includes('Ouro')) return '#ffd700';
            if (rank.includes('Platina')) return '#e5e4e2';
            if (rank.includes('Diamante')) return '#b9f2ff';
            return '#ffffff';
        }

        function updatePlayerRankCard(profile, rankInfo) {
            const tierEl = document.getElementById('playerRankTier');
            const progressEl = document.getElementById('playerRankProgress');
            const scoreEl = document.getElementById('playerRankScore');
            const nextEl = document.getElementById('playerRankNext');
            if (!tierEl) return;

            if (!rankInfo) {
                tierEl.textContent = '-';
                tierEl.style.color = '#ffffff';
                if (progressEl) progressEl.textContent = 'Complete partidas ranqueadas para desbloquear seu tier.';
                if (scoreEl) scoreEl.textContent = '-';
                if (nextEl) nextEl.textContent = '-';
                return;
            }

            const color = getRankColor(rankInfo.rank);
            tierEl.textContent = rankInfo.rank;
            tierEl.style.color = color;

            if (progressEl) {
                const formatted = rankInfo.pointsToNext?.toLocaleString('pt-BR') ?? '0';
                progressEl.textContent = rankInfo.nextRank
                    ? `Faltam ${formatted} pts para ${rankInfo.nextRank}`
                    : 'Você atingiu o topo desta temporada.';
            }
            if (scoreEl) scoreEl.textContent = (rankInfo.score ?? 0).toLocaleString('pt-BR');
            if (nextEl) nextEl.textContent = rankInfo.nextRank || 'Rank Máximo';
        }

        function loadBattleRoyaleStats() {
            if (!currentUser) return;

            const totalGames = currentUser.br_games_played || 0;
            const totalKills = currentUser.br_total_kills || 0;

            document.getElementById('statBRWins').textContent = currentUser.br_wins || 0;
            document.getElementById('statBRGames').textContent = totalGames;

            const winRate = totalGames > 0
                ? ((currentUser.br_wins / totalGames) * 100).toFixed(1) + '%'
                : '0%';
            document.getElementById('statBRWinRate').textContent = winRate;

            document.getElementById('statBRBestPos').textContent = currentUser.br_best_position || '-';
            document.getElementById('statBRKills').textContent = totalKills;

            const avgKills = totalGames > 0
                ? (totalKills / totalGames).toFixed(1)
                : '0';
            document.getElementById('statBRAvgKills').textContent = avgKills;
        }

        function loadTacticalStats() {
            if (!currentUser) return;

            const wins = currentUser.tactical_wins || 0;
            const matches = currentUser.tactical_games_played || 0;
            const kills = currentUser.tactical_total_kills || 0;
            const bestRank = currentUser.tactical_best_rank || 0;
            const winRate = matches > 0 ? `${((wins / matches) * 100).toFixed(1)}%` : '0%';
            const avgKills = matches > 0 ? (kills / matches).toFixed(1) : '0';

            const winsEl = document.getElementById('statTacticalWins');
            const gamesEl = document.getElementById('statTacticalGames');
            const winRateEl = document.getElementById('statTacticalWinRate');
            const killsEl = document.getElementById('statTacticalKills');
            const bestRankEl = document.getElementById('statTacticalBestRank');
            const avgKillsEl = document.getElementById('statTacticalAvgKills');

            if (winsEl) winsEl.textContent = wins;
            if (gamesEl) gamesEl.textContent = matches;
            if (winRateEl) winRateEl.textContent = winRate;
            if (killsEl) killsEl.textContent = kills;
            if (bestRankEl) bestRankEl.textContent = bestRank > 0 ? `Top ${bestRank}` : '-';
            if (avgKillsEl) avgKillsEl.textContent = avgKills;
        }

        function initLeaderboardUI() {
            renderLeaderboardTabs(currentLeaderboardMode);
            loadLeaderboardType('mmr');
            loadModeMatches(currentLeaderboardMode);
        }

        function switchLeaderboardMode(mode, button) {
            const normalized = (mode || 'survival').toLowerCase();
            if (!leaderboardModesConfig[normalized]) return;

            currentLeaderboardMode = normalized;
            currentLeaderboardMetric = 'mmr';

            document.querySelectorAll('#leaderboardSection .stats-mode-selector button').forEach(btn => {
                const matches = btn === button || btn.dataset.mode === normalized;
                btn.classList.toggle('active', matches);
            });

            renderLeaderboardTabs(normalized);
            loadLeaderboardType(currentLeaderboardMetric);
            loadModeMatches(normalized);
        }

        function renderLeaderboardTabs(mode) {
            const container = document.getElementById('leaderboardTabs');
            const config = leaderboardModesConfig[mode];
            if (!container || !config) return;

            container.innerHTML = '';
            config.metricTabs.forEach(tab => {
                const btn = document.createElement('button');
                btn.textContent = tab.label;
                btn.dataset.metric = tab.key;
                btn.classList.toggle('active', tab.key === currentLeaderboardMetric);
                btn.onclick = () => loadLeaderboardType(tab.key);
                container.appendChild(btn);
            });

            const modeLabelEl = document.getElementById('leaderboardModeLabel');
            if (modeLabelEl) modeLabelEl.textContent = `${config.icon} ${config.label}`;

            const metricLabelEl = document.getElementById('leaderboardMetricLabel');
            const activeTab = config.metricTabs.find(tab => tab.key === currentLeaderboardMetric) || config.metricTabs[0];
            if (metricLabelEl && activeTab) metricLabelEl.textContent = activeTab.label;
        }

        function getMetricLabel(mode, metric) {
            const config = leaderboardModesConfig[mode];
            if (!config) return 'Valor';
            const tab = config.metricTabs.find(t => t.key === metric);
            return tab ? tab.label : 'Valor';
        }

        function formatWinRate(value) {
            const numeric = typeof value === 'number' ? value : parseFloat(value);
            if (Number.isNaN(numeric)) return '0%';
            return `${numeric.toFixed(1)}%`;
        }

        function formatMetricValue(entry, metric) {
            switch (metric) {
                case 'wins':
                    return entry.wins ?? entry.score ?? 0;
                case 'kills':
                    return entry.kills ?? entry.total_kills ?? entry.br_total_kills ?? 0;
                case 'winrate':
                    return formatWinRate(entry.win_rate || 0);
                case 'score':
                    return entry.best_score ?? entry.score ?? 0;
                case 'mmr':
                default:
                    return entry.mmr_rating ?? entry.score ?? 0;
            }
        }

        function getEntryRankLabel(entry, mode = currentLeaderboardMode) {
            if (!entry) return '-';
            const directLabel = entry.rank_label || entry.rankName || entry.rank_name || entry.rankTier || entry.ranking;
            if (directLabel) return directLabel;

            const estimatedProfile = {
                level: entry.level ?? entry.player_level ?? entry.profile_level ?? 0,
                highest_round: entry.highest_round ?? entry.best_round ?? entry.round ?? entry.wins ?? 0,
                total_kills: entry.total_kills ?? entry.kills ?? entry.br_total_kills ?? 0,
                br_wins: entry.br_wins ?? (mode === 'battleroyale' ? (entry.wins ?? 0) : 0),
                br_total_kills: entry.br_total_kills ?? (mode === 'battleroyale' ? (entry.kills ?? 0) : 0)
            };

            const rankInfo = calculateRank(estimatedProfile);
            return rankInfo?.rank || '-';
        }

        async function loadLeaderboardType(metric = 'mmr') {
            currentLeaderboardMetric = metric;
            const tbody = document.getElementById('leaderboardBody');
            const tabs = document.querySelectorAll('#leaderboardTabs button');
            tabs.forEach(btn => btn.classList.toggle('active', btn.dataset.metric === metric));

            const metricLabel = getMetricLabel(currentLeaderboardMode, metric);
            const metricHeader = document.getElementById('leaderboardMetric');
            if (metricHeader) metricHeader.textContent = metricLabel;
            const metricPill = document.getElementById('leaderboardMetricLabel');
            if (metricPill) metricPill.textContent = metricLabel;

            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#aaa;">Carregando...</td></tr>';

            try {
                const rawData = await fetchModeLeaderboard({ mode: currentLeaderboardMode, metric, limit: 100 });
                const data = Array.isArray(rawData)
                    ? rawData
                    : Array.isArray(rawData?.rows) ? rawData.rows : [];
                tbody.innerHTML = '';

                if (data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#aaa;">Nenhum registro encontrado</td></tr>';
                    return;
                }

                data.forEach((entry, index) => {
                    const tr = document.createElement('tr');
                    const metricValue = formatMetricValue(entry, metric);
                    const playerName = entry.display_name || entry.username || 'Operador';
                    const rankLabel = getEntryRankLabel(entry, currentLeaderboardMode);
                    tr.innerHTML = `
                        <td>#${entry.rank || index + 1}</td>
                        <td>${playerName}</td>
                        <td>${rankLabel}</td>
                        <td>${metricValue}</td>
                    `;
                    tbody.appendChild(tr);
                });
            } catch (error) {
                console.error('Erro ao carregar leaderboard:', error);
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:red;">Erro ao carregar</td></tr>';
            }
        }

        async function loadModeMatches(mode = currentLeaderboardMode) {
            const container = document.getElementById('matchFeed');
            if (!container) return;
            container.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);">Carregando partidas...</p>';

            try {
                const matches = await fetchModeMatches({ mode, limit: 6 });
                renderMatchCards(matches);
            } catch (error) {
                console.error('Erro ao carregar partidas:', error);
                container.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:red;">Erro ao carregar partidas</p>';
            }
        }

        function renderMatchCards(matches) {
            const container = document.getElementById('matchFeed');
            if (!container) return;

            container.innerHTML = '';
            if (!matches || matches.length === 0) {
                container.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);">Nenhuma partida registrada neste modo ainda.</p>';
                return;
            }

            matches.forEach(match => {
                const card = document.createElement('div');
                card.className = 'match-card';
                let parsedParticipants = match.participants;
                if (typeof match.participants === 'string') {
                    try {
                        parsedParticipants = JSON.parse(match.participants || '[]');
                    } catch (err) {
                        parsedParticipants = [];
                    }
                }
                const participants = Array.isArray(parsedParticipants) ? parsedParticipants : [];
                const topParticipants = participants.slice(0, 3);
                const resultLabel = match.winning_team ? `Vitória ${match.winning_team.toUpperCase()}` : 'Concluído';
                const resultClass = match.winning_team ? 'win' : 'loss';

                card.innerHTML = `
                    <header>
                        <span>${(match.mode || '').toUpperCase() || 'MODO'}</span>
                        <span class="match-result ${resultClass}">${resultLabel}</span>
                    </header>
                    <div class="match-meta">
                        <span>Mapa: ${match.map_name || 'Default'}</span>
                        <span>${formatDuration(match.duration_seconds || 0)}</span>
                        <span>${formatMatchTimestamp(match.ended_at || match.started_at)}</span>
                    </div>
                    ${topParticipants.map(p => `
                        <div class="participant-row">
                            <strong>${p.displayName || p.username || 'Operador'}</strong>
                            <span>${p.kills || 0}K • ${p.deaths || 0}D • ${p.score ?? p.mmrDelta ?? 0}</span>
                        </div>
                    `).join('')}
                `;

                container.appendChild(card);
            });
        }

        function refreshMatchFeed() {
            loadModeMatches(currentLeaderboardMode);
        }

        function formatMatchTimestamp(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            if (Number.isNaN(date.getTime())) return '';
            return date.toLocaleString('pt-BR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        function formatDuration(seconds) {
            const totalSeconds = parseInt(seconds, 10) || 0;
            const minutes = Math.floor(totalSeconds / 60);
            const leftover = totalSeconds % 60;
            return `${minutes}m ${leftover}s`;
        }

        function personalizeHeroSection(profile) {
            if (!profile) {
                resetHeroSection();
                return;
            }

            const name = profile.display_name || profile.username || 'Operador';
            document.getElementById('sessionEyebrow').textContent = 'OPERADOR ONLINE';
            document.getElementById('sessionHeadline').textContent = `${name}, o lobby está pronto.`;
            document.getElementById('sessionSubhead').textContent = `Nível ${profile.level || 1} • ${profile.experience || 0} XP. Retome sua progressão e desbloqueie novas armas.`;
            document.getElementById('sessionBadge').textContent = `Melhor round: ${profile.highest_round || 0}`;
            document.getElementById('heroPrimaryBtn').textContent = 'Continuar Campanha';
            document.getElementById('heroSecondaryBtn').textContent = 'Ver Estatísticas';
        }

        function resetHeroSection() {
            document.getElementById('sessionEyebrow').textContent = heroDefaults.eyebrow;
            document.getElementById('sessionHeadline').textContent = heroDefaults.headline;
            document.getElementById('sessionSubhead').textContent = heroDefaults.subhead;
            document.getElementById('sessionBadge').textContent = heroDefaults.badge;
            document.getElementById('heroPrimaryBtn').textContent = 'Criar Conta';
            document.getElementById('heroSecondaryBtn').textContent = 'Explorar Modos';
        }

        function updateHeroLiveStats(profile) {
            const online = 180 + Math.floor(Math.random() * 140);
            document.getElementById('heroPlayersOnline').textContent = online;

            if (profile) {
                document.getElementById('heroMaps').textContent = `${Math.max((profile.level || 1) * 2, 2)}+`;
                document.getElementById('heroFavorite').textContent = (profile.favorite_mode || 'Survival').toUpperCase();
                document.getElementById('heroMatches').textContent = profile.matches_played || profile.highest_round || 0;
            } else {
                document.getElementById('heroMaps').textContent = '320+';
                document.getElementById('heroFavorite').textContent = 'SURVIVAL';
                document.getElementById('heroMatches').textContent = '1.2K';
            }
        }

        function attachHeroActions() {
            const primary = document.getElementById('heroPrimaryBtn');
            const secondary = document.getElementById('heroSecondaryBtn');

            if (primary) {
                primary.addEventListener('click', () => {
                    if (currentUser) {
                        switchTab('modeSelect');
                    } else {
                        switchTab('register');
                        document.getElementById('regUsername').focus();
                    }
                });
            }

            if (secondary) {
                secondary.addEventListener('click', () => {
                    if (currentUser) {
                        switchTab('stats');
                    } else {
                        document.getElementById('guestLinks').scrollIntoView({ behavior: 'smooth' });
                    }
                });
            }
        }

        function switchTab(tab = 'login') {
            hideMessage();

            if (!currentUser && ['modeSelect', 'stats', 'maps'].includes(tab)) {
                showMessage('Crie uma conta para acessar o hub completo.', 'error');
                tab = 'login';
            }

            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.form-section').forEach(f => f.classList.remove('active'));

            if (tab === 'login') {
                document.querySelector('.tab').classList.add('active');
                document.getElementById('loginForm').classList.add('active');
            } else if (tab === 'register') {
                document.querySelectorAll('.tab')[1].classList.add('active');
                document.getElementById('registerForm').classList.add('active');
            } else if (tab === 'modeSelect') {
                const tabEl = document.getElementById('tabModeSelect');
                if (tabEl) tabEl.classList.add('active');
                document.getElementById('modeSelectSection').classList.add('active');
                loadModeStats();
            } else if (tab === 'stats') {
                const tabEl = document.getElementById('tabStats');
                if (tabEl) tabEl.classList.add('active');
                document.getElementById('statsSection').classList.add('active');
                loadUserStats();
            } else if (tab === 'leaderboard') {
                const tabEl = document.getElementById('tabLeaderboard');
                if (tabEl) tabEl.classList.add('active');
                document.getElementById('leaderboardSection').classList.add('active');
                loadLeaderboardType(currentLeaderboardMetric || 'mmr');
            } else if (tab === 'maps') {
                const tabEl = document.getElementById('tabMaps');
                if (tabEl) tabEl.classList.add('active');
                document.getElementById('mapsSection').classList.add('active');
                loadMaps();
            }
        }

        // --- Community Maps Logic ---

        async function loadMaps() {
            const container = document.getElementById('mapsList');
            container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #aaa;">Carregando mapas...</p>';

            try {
                const response = await fetch(`${API_URL}/maps`);
                const maps = await response.json();

                container.innerHTML = '';
                if (maps.length === 0) {
                    container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #aaa;">Nenhum mapa encontrado. Seja o primeiro a criar um!</p>';
                    return;
                }

                maps.forEach(map => {
                    const card = document.createElement('div');
                    card.className = 'stat-card';
                    card.style.textAlign = 'left';
                    card.innerHTML = `
                        <h3 style="color:var(--primary); margin-bottom:5px;">${map.name}</h3>
                        <p style="color:var(--muted); font-size:12px; margin-bottom:10px;">por ${map.author_name}</p>
                        <p style="font-size:14px; margin-bottom:15px; height:40px; overflow:hidden;">${map.description || 'Sem descrição'}</p>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <span style="font-size:12px; color:var(--muted);">⬇️ ${map.downloads}</span>
                            <span style="font-size:12px; color:var(--muted);">📅 ${new Date(map.created_at).toLocaleDateString()}</span>
                        </div>
                        <button class="primary" style="width:100%;" onclick="downloadMap(${map.id}, '${map.name}')">Baixar / Jogar</button>
                    `;
                    container.appendChild(card);
                });
            } catch (error) {
                console.error('Erro ao carregar mapas:', error);
                container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: red;">Erro ao carregar mapas.</p>';
            }
        }

        function openUploadMapModal() {
            if (!currentUser) {
                showMessage('Faça login para publicar mapas.', 'error');
                return;
            }
            document.getElementById('uploadMapModal').style.display = 'flex';
        }

        function closeUploadMapModal() {
            document.getElementById('uploadMapModal').style.display = 'none';
        }

        async function uploadMap() {
            const name = document.getElementById('uploadMapName').value;
            const desc = document.getElementById('uploadMapDesc').value;
            const fileInput = document.getElementById('uploadMapFile');
            const file = fileInput.files[0];

            if (!name || !file) {
                alert('Nome e arquivo são obrigatórios.');
                return;
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const mapData = JSON.parse(e.target.result);
                    const token = localStorage.getItem('token');

                    const response = await fetch(`${API_URL}/maps`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            name: name,
                            description: desc,
                            map_data: mapData
                        })
                    });

                    if (response.ok) {
                        alert('Mapa publicado com sucesso!');
                        closeUploadMapModal();
                        loadMaps();
                    } else {
                        const err = await response.json();
                        alert('Erro ao publicar: ' + err.error);
                    }
                } catch (error) {
                    alert('Arquivo inválido. Certifique-se de que é um JSON válido.');
                }
            };
            reader.readAsText(file);
        }

        function buildCommunityTacticalPayload(mapData, serverMeta = {}) {
            const tacticalSnapshot = mapData?.tactical;
            if (!tacticalSnapshot) return null;

            const allies = Array.isArray(tacticalSnapshot.teamSpawns?.allies) ? tacticalSnapshot.teamSpawns.allies : [];
            const enemies = Array.isArray(tacticalSnapshot.teamSpawns?.enemies) ? tacticalSnapshot.teamSpawns.enemies : [];
            const objects = Array.isArray(mapData.objects) ? mapData.objects : [];

            return {
                id: `community-${serverMeta.id || Date.now()}`,
                name: mapData.name || serverMeta.name || 'Mapa da Comunidade',
                version: mapData.version || 'tactical-community',
                gameMode: 'tactical',
                createdAt: mapData.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                skyColor: mapData.skyColor || '0x87ceeb',
                objects,
                tactical: tacticalSnapshot,
                stats: {
                    objects: objects.length,
                    allySpawns: allies.length,
                    enemySpawns: enemies.length,
                    source: 'community'
                }
            };
        }

        function persistCommunityTacticalMap(payload) {
            if (!payload) return null;
            let stored = [];
            try {
                stored = JSON.parse(localStorage.getItem(TACTICAL_STORAGE_KEY) || '[]');
                if (!Array.isArray(stored)) stored = [];
            } catch (error) {
                console.warn('Não foi possível ler mapas táticos locais, redefinindo.', error);
                stored = [];
            }
            stored = stored.filter(entry => entry.id !== payload.id);
            stored.push(payload);
            localStorage.setItem(TACTICAL_STORAGE_KEY, JSON.stringify(stored));
            localStorage.setItem(TACTICAL_SELECTED_KEY, payload.id);
            return payload.id;
        }

        async function downloadMap(id, name) {
            try {
                // Incrementar contador
                await fetch(`${API_URL}/maps/${id}/download`, { method: 'POST' });

                // Buscar dados
                const response = await fetch(`${API_URL}/maps/${id}`);
                const map = await response.json();

                let mapData = map.map_data;
                if (!mapData) {
                    alert('Mapa retornou dados vazios.');
                    return;
                }

                if (typeof mapData === 'string') {
                    try {
                        mapData = JSON.parse(mapData);
                    } catch (parseError) {
                        console.error('Erro ao converter mapa salvo:', parseError);
                        alert('Não foi possível carregar o mapa (JSON inválido).');
                        return;
                    }
                }

                const isTacticalMap = (mapData.gameMode === 'tactical') || Boolean(mapData.tactical);

                if (isTacticalMap) {
                    const payload = buildCommunityTacticalPayload(mapData, { id, name });
                    if (!payload) {
                        alert('Este mapa foi marcado como 5v5 mas não possui dados táticos válidos.');
                        return;
                    }
                    const storedId = persistCommunityTacticalMap(payload);
                    const shouldLaunch = confirm(`Mapa 5v5 "${payload.name}" pronto! Deseja iniciar o modo Tático agora?`);
                    if (shouldLaunch && storedId) {
                        selectGameMode('tactical', 'custom', { mapId: storedId });
                    } else {
                        showMessage('Mapa salvo no editor Tático. Abra o modo 5v5 para jogar.', 'success');
                    }
                } else {
                    // Salvar no localStorage para o modo sobrevivência carregar
                    localStorage.setItem('customMapData', JSON.stringify(mapData));
                    if (confirm(`Mapa "${name}" carregado! Deseja jogar agora?`)) {
                        window.location.href = 'game.html?map=custom';
                    }
                }
            } catch (error) {
                console.error('Erro ao baixar mapa:', error);
                alert('Erro ao baixar mapa.');
            }
        }
