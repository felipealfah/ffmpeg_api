#!/bin/bash

# 📊 Script de Teste do Sistema de Monitoramento
# Testa Prometheus + Grafana + Métricas da API

API_BASE=${1:-"http://localhost:3000"}
PROMETHEUS_URL=${2:-"http://localhost:9090"}
GRAFANA_URL=${3:-"http://localhost:3001"}

echo "📊 TESTE DO SISTEMA DE MONITORAMENTO"
echo "================================================"
echo "🔗 API Base: $API_BASE"
echo "📈 Prometheus: $PROMETHEUS_URL"
echo "📊 Grafana: $GRAFANA_URL"
echo "================================================"

# Função para verificar se um serviço está disponível
check_service() {
    local name=$1
    local url=$2
    local endpoint=$3
    
    echo -n "🔍 Verificando $name... "
    
    if curl -s "$url$endpoint" > /dev/null 2>&1; then
        echo "✅ OK"
        return 0
    else
        echo "❌ FALHOU"
        return 1
    fi
}

# Função para testar métricas específicas
test_metrics() {
    local metric_name=$1
    local description=$2
    
    echo -n "📊 Testando métrica '$metric_name'... "
    
    local response=$(curl -s "$API_BASE/metrics" | grep "^$metric_name" | head -1)
    
    if [ -n "$response" ]; then
        echo "✅ OK"
        echo "   📈 $description: $response"
        return 0
    else
        echo "❌ NÃO ENCONTRADA"
        return 1
    fi
}

# Função para gerar carga na API
generate_load() {
    local requests=$1
    echo "🚀 Gerando carga na API ($requests requests)..."
    
    for i in $(seq 1 $requests); do
        curl -s "$API_BASE/health" > /dev/null &
        curl -s "$API_BASE/api/v1/admin/storage/stats" > /dev/null &
        
        # Pequeno delay para não sobrecarregar
        if [ $((i % 5)) -eq 0 ]; then
            sleep 0.1
        fi
    done
    
    wait
    echo "✅ Carga gerada com sucesso!"
}

echo "1️⃣ VERIFICANDO DISPONIBILIDADE DOS SERVIÇOS"
echo "─────────────────────────────────────────────"

# Verificar API
check_service "API FFmpeg" "$API_BASE" "/health"
api_status=$?

# Verificar Prometheus
check_service "Prometheus" "$PROMETHEUS_URL" "/-/healthy"
prometheus_status=$?

# Verificar Grafana
check_service "Grafana" "$GRAFANA_URL" "/api/health"
grafana_status=$?

echo ""

if [ $api_status -ne 0 ]; then
    echo "❌ API não está disponível. Certifique-se de que está rodando."
    exit 1
fi

echo "2️⃣ TESTANDO ENDPOINT DE MÉTRICAS"
echo "─────────────────────────────────────────────"

# Testar endpoint /metrics
echo -n "🔍 Verificando endpoint /metrics... "
metrics_response=$(curl -s "$API_BASE/metrics")

if [ -n "$metrics_response" ]; then
    echo "✅ OK"
    
    # Contar métricas disponíveis
    metric_count=$(echo "$metrics_response" | grep -c "^[a-zA-Z]")
    echo "   📊 Total de métricas encontradas: $metric_count"
else
    echo "❌ FALHOU"
    echo "   ⚠️  Endpoint /metrics não está retornando dados"
    exit 1
fi

echo ""

echo "3️⃣ TESTANDO MÉTRICAS ESPECÍFICAS"
echo "─────────────────────────────────────────────"

# Testar métricas principais
test_metrics "http_requests_total" "Total de requests HTTP"
test_metrics "http_request_duration_seconds" "Duração de requests HTTP"
test_metrics "ffmpeg_jobs_active" "Jobs FFmpeg ativos"
test_metrics "process_cpu_seconds_total" "Uso de CPU do processo"
test_metrics "process_resident_memory_bytes" "Uso de memória"
test_metrics "nodejs_eventloop_lag_seconds" "Lag do event loop Node.js"

echo ""

echo "4️⃣ GERANDO CARGA PARA TESTE"
echo "─────────────────────────────────────────────"

# Gerar alguma carga para ter dados nas métricas
generate_load 20

echo ""

echo "5️⃣ VERIFICANDO MÉTRICAS APÓS CARGA"
echo "─────────────────────────────────────────────"

sleep 2  # Aguardar um pouco para as métricas serem atualizadas

# Verificar métricas específicas após a carga
echo "📊 Métricas atualizadas:"

# HTTP requests
requests_total=$(curl -s "$API_BASE/metrics" | grep "http_requests_total" | grep -v "#" | head -1)
if [ -n "$requests_total" ]; then
    echo "   🌐 $requests_total"
fi

# Jobs ativos
jobs_active=$(curl -s "$API_BASE/metrics" | grep "ffmpeg_jobs_active" | grep -v "#" | head -1)
if [ -n "$jobs_active" ]; then
    echo "   🎬 $jobs_active"
fi

# Uso de CPU
cpu_usage=$(curl -s "$API_BASE/metrics" | grep "process_cpu_seconds_total" | grep -v "#" | head -1)
if [ -n "$cpu_usage" ]; then
    echo "   🔄 $cpu_usage"
fi

echo ""

if [ $prometheus_status -eq 0 ]; then
    echo "6️⃣ TESTANDO INTEGRAÇÃO COM PROMETHEUS"
    echo "─────────────────────────────────────────────"
    
    echo -n "📈 Verificando se Prometheus está coletando métricas... "
    
    # Aguardar um pouco para o Prometheus fazer scrape
    sleep 5
    
    # Verificar se há dados no Prometheus
    prom_response=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=up{job=\"ffmpeg-api\"}" | grep -o '"value":\[.*\]')
    
    if [ -n "$prom_response" ]; then
        echo "✅ OK"
        echo "   📊 Prometheus está coletando métricas da API"
    else
        echo "⚠️  PARCIAL"
        echo "   ℹ️  Prometheus pode estar ainda fazendo o primeiro scrape"
    fi
    
    echo ""
fi

if [ $grafana_status -eq 0 ]; then
    echo "7️⃣ INFORMAÇÕES DO GRAFANA"
    echo "─────────────────────────────────────────────"
    
    echo "🎯 Para acessar o Grafana:"
    echo "   📍 URL: $GRAFANA_URL"
    echo "   👤 Usuário: admin"
    echo "   🔑 Senha: admin123"
    echo ""
    echo "📊 Dashboard disponível:"
    echo "   📈 'FFmpeg API Monitoring' - Dashboard completo da API"
    echo ""
fi

echo "8️⃣ RESUMO DOS TESTES"
echo "─────────────────────────────────────────────"

total_tests=7
passed_tests=0

[ $api_status -eq 0 ] && ((passed_tests++))
[ $prometheus_status -eq 0 ] && ((passed_tests++))
[ $grafana_status -eq 0 ] && ((passed_tests++))

# Verificar se métricas básicas estão funcionando
if echo "$metrics_response" | grep -q "http_requests_total"; then
    ((passed_tests++))
fi
if echo "$metrics_response" | grep -q "ffmpeg_jobs_active"; then
    ((passed_tests++))
fi
if echo "$metrics_response" | grep -q "process_cpu_seconds_total"; then
    ((passed_tests++))
fi
if echo "$metrics_response" | grep -q "nodejs_eventloop_lag_seconds"; then
    ((passed_tests++))
fi

echo "✅ Testes passaram: $passed_tests/$total_tests"

if [ $passed_tests -eq $total_tests ]; then
    echo "🎉 TODOS OS TESTES PASSARAM!"
    echo "   🚀 Sistema de monitoramento está funcionando perfeitamente!"
elif [ $passed_tests -ge 4 ]; then
    echo "⚠️  PARCIALMENTE FUNCIONAL"
    echo "   ℹ️  Sistema principal funcionando, alguns componentes podem precisar de tempo para inicializar"
else
    echo "❌ ALGUNS PROBLEMAS DETECTADOS"
    echo "   🔧 Verifique os logs dos containers: docker-compose logs"
fi

echo ""
echo "🔗 LINKS ÚTEIS:"
echo "   📍 API Health: $API_BASE/health"
echo "   📊 Métricas: $API_BASE/metrics"
echo "   📈 Prometheus: $PROMETHEUS_URL"
echo "   📊 Grafana: $GRAFANA_URL"
echo ""
echo "🏁 Teste de monitoramento concluído!"
echo "================================================" 