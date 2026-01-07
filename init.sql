-- Criação do banco de dados e tabelas

-- Tabela de Jogadores
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Tabela de Perfil do Jogador
CREATE TABLE IF NOT EXISTS player_profiles (
    id SERIAL PRIMARY KEY,
    player_id INTEGER UNIQUE NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    display_name VARCHAR(50),
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    total_kills INTEGER DEFAULT 0,
    total_deaths INTEGER DEFAULT 0,
    total_rounds_completed INTEGER DEFAULT 0,
    highest_round INTEGER DEFAULT 0,
    total_playtime_seconds INTEGER DEFAULT 0,
    avatar_url VARCHAR(255),
    -- Battle Royale Stats
    br_wins INTEGER DEFAULT 0,
    br_games_played INTEGER DEFAULT 0,
    br_total_kills INTEGER DEFAULT 0,
    br_best_position INTEGER DEFAULT 0,
    -- Tactical 5v5 Stats (CS-like competitive mode)
    tactical_wins INTEGER DEFAULT 0,
    tactical_games_played INTEGER DEFAULT 0,
    tactical_total_kills INTEGER DEFAULT 0,
    tactical_best_rank INTEGER DEFAULT 0,
    -- Customization
    skin_body VARCHAR(50) DEFAULT '#ff0000',
    skin_head VARCHAR(50) DEFAULT '#ff0000',
    skin_texture TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Recordes
CREATE TABLE IF NOT EXISTS high_scores (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    round_reached INTEGER NOT NULL,
    kills INTEGER DEFAULT 0,
    accuracy DECIMAL(5,2) DEFAULT 0.00,
    playtime_seconds INTEGER DEFAULT 0,
    map_name VARCHAR(100) DEFAULT 'Default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_player FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Tabela de Estatísticas por Arma
CREATE TABLE IF NOT EXISTS weapon_stats (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    weapon_name VARCHAR(50) NOT NULL,
    game_mode VARCHAR(20) NOT NULL DEFAULT 'survival',
    total_shots INTEGER DEFAULT 0,
    total_hits INTEGER DEFAULT 0,
    total_kills INTEGER DEFAULT 0,
    total_headshots INTEGER DEFAULT 0,
    accuracy DECIMAL(5,2) DEFAULT 0.00,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, weapon_name, game_mode)
);

-- Tabela de Conquistas/Achievements
CREATE TABLE IF NOT EXISTS achievements (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon_url VARCHAR(255),
    points INTEGER DEFAULT 0,
    requirement_type VARCHAR(50), -- 'kills', 'rounds', 'headshots', 'level', etc.
    requirement_value INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Conquistas Desbloqueadas
CREATE TABLE IF NOT EXISTS player_achievements (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, achievement_id)
);

-- Tabela de Sessões de Jogo
CREATE TABLE IF NOT EXISTS game_sessions (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    rounds_completed INTEGER DEFAULT 0,
    final_round INTEGER DEFAULT 1,
    total_kills INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    map_name VARCHAR(100) DEFAULT 'Default',
    game_mode VARCHAR(20) DEFAULT 'survival' CHECK (game_mode IN ('survival', 'battleroyale', 'tactical'))
);

ALTER TABLE game_sessions
    ADD COLUMN IF NOT EXISTS game_mode VARCHAR(20) DEFAULT 'survival' CHECK (game_mode IN ('survival', 'battleroyale', 'tactical'));

-- Tabela de partidas por modo (Survival/BR/Tactical)
CREATE TABLE IF NOT EXISTS mode_matches (
    id BIGSERIAL PRIMARY KEY,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('survival', 'battleroyale', 'tactical')),
    map_name VARCHAR(100) DEFAULT 'Default',
    queue_type VARCHAR(32) DEFAULT 'ranked',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INTEGER DEFAULT 0,
    rounds_played INTEGER DEFAULT 0,
    max_rounds INTEGER DEFAULT 0,
    winning_team VARCHAR(16),
    season VARCHAR(16),
    notes TEXT,
    created_by INTEGER REFERENCES players(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Participantes por partida (1 linha por jogador)
CREATE TABLE IF NOT EXISTS mode_match_participants (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES mode_matches(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    team VARCHAR(16),
    result VARCHAR(8) CHECK (result IN ('win', 'loss', 'draw')),
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    rounds_won INTEGER DEFAULT 0,
    rounds_lost INTEGER DEFAULT 0,
    plants INTEGER DEFAULT 0,
    defuses INTEGER DEFAULT 0,
    first_bloods INTEGER DEFAULT 0,
    adr NUMERIC(6,2) DEFAULT 0,
    economy_spent INTEGER DEFAULT 0,
    mmr_before INTEGER DEFAULT 1000,
    mmr_after INTEGER DEFAULT 1000,
    mmr_delta INTEGER DEFAULT 0,
    placement INTEGER,
    damage_done INTEGER DEFAULT 0,
    damage_taken INTEGER DEFAULT 0,
    was_mvp BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Detalhes opcionais por round (útil para 5v5 tático)
CREATE TABLE IF NOT EXISTS mode_match_rounds (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES mode_matches(id) ON DELETE CASCADE,
    round_number SMALLINT NOT NULL,
    winning_team VARCHAR(16),
    win_condition VARCHAR(24),
    alpha_economy JSONB,
    bravo_economy JSONB,
    clutches JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(match_id, round_number)
);

-- Tabela de estatísticas agregadas por modo (deve ser criada após mode_matches)
CREATE TABLE IF NOT EXISTS player_mode_stats (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('survival', 'battleroyale', 'tactical')),
    matches_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    win_rate NUMERIC(5,2) DEFAULT 0,
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    damage_done INTEGER DEFAULT 0,
    damage_taken INTEGER DEFAULT 0,
    rounds_played INTEGER DEFAULT 0,
    best_score INTEGER DEFAULT 0,
    best_round INTEGER DEFAULT 0,
    best_position INTEGER DEFAULT 0,
    mmr_rating INTEGER DEFAULT 1000,
    rank_tier VARCHAR(32) DEFAULT 'PROVISIONAL',
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    top5_finishes INTEGER DEFAULT 0,
    clutches INTEGER DEFAULT 0,
    last_match_id BIGINT REFERENCES mode_matches(id),
    last_played_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, mode)
);

-- Tabela de Mapas da Comunidade
CREATE TABLE IF NOT EXISTS community_maps (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    author_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    map_data JSONB NOT NULL,
    downloads INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para melhor performance
CREATE INDEX idx_players_username ON players(username);
CREATE INDEX idx_players_email ON players(email);
CREATE INDEX idx_high_scores_player ON high_scores(player_id);
CREATE INDEX idx_high_scores_score ON high_scores(score DESC);
CREATE INDEX idx_weapon_stats_player ON weapon_stats(player_id);
CREATE INDEX idx_weapon_stats_mode ON weapon_stats(game_mode);
CREATE INDEX idx_player_achievements ON player_achievements(player_id);
CREATE INDEX idx_game_sessions_player ON game_sessions(player_id);
CREATE INDEX idx_player_profiles_tactical_wins ON player_profiles(tactical_wins);
CREATE INDEX IF NOT EXISTS idx_mode_matches_mode ON mode_matches(mode, ended_at DESC NULLS LAST, id DESC);
CREATE INDEX IF NOT EXISTS idx_mode_match_participants_match ON mode_match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_mode_match_participants_player ON mode_match_participants(player_id, match_id DESC);
CREATE INDEX IF NOT EXISTS idx_player_mode_stats_mode_rank ON player_mode_stats(mode, mmr_rating DESC, wins DESC);

-- Inserir conquistas padrão
INSERT INTO achievements (name, description, icon_url, points, requirement_type, requirement_value) VALUES
('Primeiro Sangue', 'Elimine seu primeiro inimigo', NULL, 10, 'kills', 1),
('Exterminador', 'Elimine 100 inimigos', NULL, 50, 'kills', 100),
('Lenda', 'Elimine 1000 inimigos', NULL, 200, 'kills', 1000),
('Sobrevivente', 'Complete o Round 5', NULL, 25, 'rounds', 5),
('Veterano', 'Complete o Round 10', NULL, 75, 'rounds', 10),
('Imortal', 'Complete o Round 20', NULL, 150, 'rounds', 20),
('Atirador de Elite', 'Consiga 50 headshots', NULL, 40, 'headshots', 50),
('Sniper Master', 'Consiga 200 headshots', NULL, 100, 'headshots', 200),
('Novato', 'Alcance o nível 5', NULL, 15, 'level', 5),
('Experiente', 'Alcance o nível 10', NULL, 30, 'level', 10),
('Mestre', 'Alcance o nível 25', NULL, 100, 'level', 25),
('Lendário', 'Alcance o nível 50', NULL, 250, 'level', 50)
ON CONFLICT (name) DO NOTHING;

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at em player_profiles
CREATE TRIGGER update_player_profiles_updated_at
BEFORE UPDATE ON player_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger para atualizar updated_at em weapon_stats
CREATE TRIGGER update_weapon_stats_updated_at
BEFORE UPDATE ON weapon_stats
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger para atualizar updated_at em player_mode_stats
CREATE TRIGGER update_player_mode_stats_updated_at
BEFORE UPDATE ON player_mode_stats
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Função para calcular nível baseado na experiência (Progressão mais lenta)
CREATE OR REPLACE FUNCTION calculate_level(exp INTEGER)
RETURNS INTEGER AS $$
BEGIN
    -- Fórmula antiga: level = floor(sqrt(exp / 100)) + 1
    -- Nova Fórmula: Progressão mais lenta
    -- Nível 2: ~1.5k XP
    -- Nível 10: ~70k XP
    RETURN FLOOR(POWER(exp / 1500.0, 0.6)) + 1;
END;
$$ LANGUAGE plpgsql;

-- View para Leaderboard Global
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
    p.username,
    pp.display_name,
    pp.level,
    pp.experience,
    pp.total_kills,
    pp.highest_round,
    MAX(hs.score) as best_score,
    RANK() OVER (ORDER BY MAX(hs.score) DESC) as rank
FROM players p
JOIN player_profiles pp ON p.id = pp.player_id
LEFT JOIN high_scores hs ON p.id = hs.player_id
WHERE p.is_active = TRUE
GROUP BY p.id, p.username, pp.display_name, pp.level, pp.experience, pp.total_kills, pp.highest_round
ORDER BY best_score DESC NULLS LAST
LIMIT 100;

-- View para leaderboard por modo
CREATE OR REPLACE VIEW mode_leaderboard_view AS
SELECT 
    p.id AS player_id,
    p.username,
    pp.display_name,
    pp.level,
    pms.mode,
    pms.matches_played,
    pms.wins,
    pms.losses,
    pms.win_rate,
    pms.kills,
    pms.deaths,
    pms.assists,
    pms.damage_done,
    pms.damage_taken,
    pms.rounds_played,
    pms.best_score,
    pms.best_round,
    pms.best_position,
    pms.mmr_rating,
    pms.rank_tier,
    pms.current_streak,
    pms.longest_streak,
    pms.top5_finishes,
    pms.clutches,
    pms.last_match_id,
    pms.last_played_at
FROM player_mode_stats pms
JOIN players p ON p.id = pms.player_id
JOIN player_profiles pp ON pp.player_id = pms.player_id
WHERE p.is_active = TRUE;

-- View para Estatísticas do Jogador
CREATE OR REPLACE VIEW player_stats_summary AS
SELECT 
    p.id as player_id,
    p.username,
    pp.level,
    pp.experience,
    pp.total_kills,
    pp.total_deaths,
    CASE 
        WHEN pp.total_deaths > 0 THEN ROUND(pp.total_kills::NUMERIC / pp.total_deaths, 2)
        ELSE pp.total_kills
    END as kd_ratio,
    pp.highest_round,
    pp.total_rounds_completed,
    pp.total_playtime_seconds,
    COUNT(DISTINCT pa.achievement_id) as achievements_unlocked,
    MAX(hs.score) as best_score
FROM players p
JOIN player_profiles pp ON p.id = pp.player_id
LEFT JOIN player_achievements pa ON p.id = pa.player_id
LEFT JOIN high_scores hs ON p.id = hs.player_id
GROUP BY p.id, p.username, pp.level, pp.experience, pp.total_kills, pp.total_deaths, 
         pp.highest_round, pp.total_rounds_completed, pp.total_playtime_seconds;
