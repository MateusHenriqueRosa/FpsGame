#!/bin/bash

# Script de Gerenciamento do FPS Game
# Uso: ./manage.sh [comando]

set -e

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

function print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

function print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

function print_error() {
    echo -e "${RED}✗ $1${NC}"
}

function show_help() {
    cat << EOF
🎮 FPS Game - Sistema de Gerenciamento

USO:
    ./manage.sh [comando]

COMANDOS:
    start           Inicia todos os serviços
    stop            Para todos os serviços
    restart         Reinicia todos os serviços
    rebuild         Reconstrói as imagens Docker
    logs            Mostra logs em tempo real
    status          Mostra status dos containers
    backup          Cria backup do banco de dados
    restore [file]  Restaura backup do banco
    db              Acessa o console do PostgreSQL
    clean           Remove containers e volumes (CUIDADO!)
    update          Atualiza o sistema
    health          Verifica saúde dos serviços
    stats           Mostra estatísticas de uso
    
EXEMPLOS:
    ./manage.sh start
    ./manage.sh logs
    ./manage.sh backup
    ./manage.sh restore backup_20240101.sql

EOF
}

function check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker não está instalado!"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose não está instalado!"
        exit 1
    fi
    
    print_success "Docker está instalado"
}

function start_services() {
    print_warning "Iniciando serviços..."
    docker-compose up -d
    print_success "Serviços iniciados!"
    echo ""
    echo "Acesse:"
    echo "  - Frontend: http://localhost"
    echo "  - API: http://localhost:3000"
    echo "  - PostgreSQL: localhost:5432"
}

function stop_services() {
    print_warning "Parando serviços..."
    docker-compose down
    print_success "Serviços parados!"
}

function restart_services() {
    print_warning "Reiniciando serviços..."
    docker-compose restart
    print_success "Serviços reiniciados!"
}

function rebuild_services() {
    print_warning "Reconstruindo imagens..."
    docker-compose down
    docker-compose build --no-cache
    docker-compose up -d
    print_success "Imagens reconstruídas e serviços iniciados!"
}

function show_logs() {
    print_warning "Mostrando logs (Ctrl+C para sair)..."
    docker-compose logs -f --tail=100
}

function show_status() {
    print_warning "Status dos containers:"
    docker-compose ps
}

function create_backup() {
    BACKUP_DIR="./backups"
    mkdir -p $BACKUP_DIR
    
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"
    
    print_warning "Criando backup..."
    docker exec fps_postgres pg_dump -U fps_admin fps_game > $BACKUP_FILE
    
    if [ $? -eq 0 ]; then
        print_success "Backup criado: $BACKUP_FILE"
        
        # Compactar backup
        gzip $BACKUP_FILE
        print_success "Backup compactado: ${BACKUP_FILE}.gz"
    else
        print_error "Erro ao criar backup!"
        exit 1
    fi
}

function restore_backup() {
    if [ -z "$1" ]; then
        print_error "Especifique o arquivo de backup!"
        echo "Uso: ./manage.sh restore <arquivo.sql>"
        exit 1
    fi
    
    if [ ! -f "$1" ]; then
        print_error "Arquivo não encontrado: $1"
        exit 1
    fi
    
    print_warning "Restaurando backup de $1..."
    read -p "Isso vai sobrescrever o banco atual. Confirma? (s/n): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        if [[ $1 == *.gz ]]; then
            gunzip -c $1 | docker exec -i fps_postgres psql -U fps_admin fps_game
        else
            cat $1 | docker exec -i fps_postgres psql -U fps_admin fps_game
        fi
        
        if [ $? -eq 0 ]; then
            print_success "Backup restaurado com sucesso!"
        else
            print_error "Erro ao restaurar backup!"
            exit 1
        fi
    else
        print_warning "Restauração cancelada."
    fi
}

function access_database() {
    print_warning "Acessando PostgreSQL (digite \q para sair)..."
    docker exec -it fps_postgres psql -U fps_admin fps_game
}

function clean_system() {
    print_warning "ATENÇÃO: Isso vai remover TODOS os containers e dados!"
    read -p "Tem certeza? (s/n): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        print_warning "Removendo containers e volumes..."
        docker-compose down -v
        print_success "Sistema limpo!"
    else
        print_warning "Operação cancelada."
    fi
}

function update_system() {
    print_warning "Atualizando sistema..."
    
    # Backup antes de atualizar
    print_warning "Criando backup de segurança..."
    create_backup
    
    # Atualizar código
    if [ -d .git ]; then
        print_warning "Atualizando código do repositório..."
        git pull
    fi
    
    # Reconstruir e reiniciar
    print_warning "Reconstruindo containers..."
    docker-compose build
    docker-compose up -d
    
    print_success "Sistema atualizado!"
}

function check_health() {
    print_warning "Verificando saúde dos serviços..."
    
    echo ""
    echo "PostgreSQL:"
    if docker exec fps_postgres pg_isready -U fps_admin &> /dev/null; then
        print_success "PostgreSQL está rodando"
    else
        print_error "PostgreSQL não está respondendo"
    fi
    
    echo ""
    echo "Backend API:"
    if curl -s http://localhost:3000/health &> /dev/null; then
        print_success "Backend está rodando"
    else
        print_error "Backend não está respondendo"
    fi
    
    echo ""
    echo "Frontend:"
    if curl -s http://localhost/health &> /dev/null; then
        print_success "Frontend está rodando"
    else
        print_error "Frontend não está respondendo"
    fi
}

function show_stats() {
    print_warning "Estatísticas de uso:"
    docker stats --no-stream
}

# Main
case "$1" in
    start)
        check_docker
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    rebuild)
        rebuild_services
        ;;
    logs)
        show_logs
        ;;
    status)
        show_status
        ;;
    backup)
        create_backup
        ;;
    restore)
        restore_backup "$2"
        ;;
    db)
        access_database
        ;;
    clean)
        clean_system
        ;;
    update)
        update_system
        ;;
    health)
        check_health
        ;;
    stats)
        show_stats
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        if [ -z "$1" ]; then
            show_help
        else
            print_error "Comando desconhecido: $1"
            echo ""
            show_help
        fi
        exit 1
        ;;
esac

exit 0
