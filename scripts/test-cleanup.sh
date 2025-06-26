#!/bin/bash

# Script principal para testar funcionalidades de limpeza
# Usage: ./scripts/test-cleanup.sh [local|server]

# Configuração
if [ "$1" = "server" ]; then
    API_BASE="http://localhost:3000"  # Para usar quando conectado no servidor
    echo "🌐 Modo: SERVIDOR"
elif [ "$1" = "remote" ]; then
    read -p "🔗 Digite o IP/URL do servidor: " SERVER_URL
    API_BASE="http://$SERVER_URL:3000"
    echo "🌐 Modo: REMOTO ($API_BASE)"
else
    API_BASE="http://localhost:3000"
    echo "🖥️  Modo: LOCAL"
fi

echo "================================================"
echo "🧪 TESTE COMPLETO DAS FUNCIONALIDADES DE LIMPEZA"
echo "🔗 API Base: $API_BASE"
echo "================================================"

# Função para aguardar e mostrar progresso
wait_with_progress() {
    local seconds=$1
    local message=$2
    echo "$message"
    for i in $(seq $seconds -1 1); do
        printf "\r⏳ Aguardando... %02d segundos restantes" $i
        sleep 1
    done
    printf "\r✅ Aguarde concluído!                    \n"
}

# Teste 1: Estado inicial
echo
echo "1️⃣ Verificando estado inicial..."
echo "─────────────────────────────────────────────"
curl -s "$API_BASE/api/v1/admin/storage/stats" | jq . 2>/dev/null || {
    echo "❌ Erro: API não está respondendo ou jq não está disponível"
    exit 1
}

# Teste 2: Criar alguns jobs de teste
echo
echo "2️⃣ Criando jobs de teste..."
echo "─────────────────────────────────────────────"

for i in {1..3}; do
    echo "📤 Criando job de teste $i/3..."
    ./scripts/create-test-job.sh "$API_BASE" > /dev/null 2>&1 &
    sleep 2
done

wait_with_progress 20 "⏳ Aguardando jobs processarem..."

# Teste 3: Verificar estatísticas após criação
echo
echo "3️⃣ Estatísticas após criação de jobs..."
echo "─────────────────────────────────────────────"
curl -s "$API_BASE/api/v1/admin/storage/stats" | jq . 2>/dev/null

# Teste 4: Testar limpeza manual
echo
echo "4️⃣ Testando limpeza manual..."
echo "─────────────────────────────────────────────"
echo "🧹 Limpeza manual (jobs > 0 horas)..."
curl -s -X POST "$API_BASE/api/v1/admin/cleanup" \
    -H "Content-Type: application/json" \
    -d '{"maxAgeHours": 0}' | jq . 2>/dev/null

# Teste 5: Verificar estatísticas após limpeza
echo
echo "5️⃣ Estatísticas após limpeza..."
echo "─────────────────────────────────────────────"
curl -s "$API_BASE/api/v1/admin/storage/stats" | jq . 2>/dev/null

# Teste 6: Testar todos os endpoints administrativos
echo
echo "6️⃣ Testando todos os endpoints administrativos..."
echo "─────────────────────────────────────────────"
./scripts/test-api.sh "$API_BASE"

echo
echo "🎉 TESTE COMPLETO FINALIZADO!"
echo "================================================"
echo "✅ Funcionalidades testadas:"
echo "   • Criação de jobs"
echo "   • Estatísticas de storage"
echo "   • Limpeza manual"
echo "   • Limpeza automática"
echo "   • Endpoints administrativos"
echo "================================================" 