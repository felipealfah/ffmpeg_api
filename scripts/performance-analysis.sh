#!/bin/bash

# 🚀 Performance Analysis & Server Sizing Script
# Análise de Performance e Dimensionamento do Servidor FFmpeg API

API_BASE=${1:-"http://localhost:3000"}
CONCURRENT_JOBS=${2:-10}
TEST_DURATION=${3:-60}

echo "🔍 ANÁLISE DE PERFORMANCE - FFmpeg API"
echo "================================================"
echo "🔗 API Base: $API_BASE"
echo "⚡ Jobs Simultâneos: $CONCURRENT_JOBS"
echo "⏱️  Duração do Teste: ${TEST_DURATION}s"
echo "================================================"

# Função para mostrar uso de recursos
show_system_resources() {
    echo "💻 RECURSOS DO SISTEMA:"
    echo "─────────────────────────────────────────────"
    
    # CPU
    if command -v nproc &> /dev/null; then
        echo "🔄 CPU Cores: $(nproc)"
    fi
    
    # Memory
    if command -v free &> /dev/null; then
        echo "💾 Memória:"
        free -h | grep -E "Mem|Swap"
    elif command -v vm_stat &> /dev/null; then
        echo "💾 Memória (macOS):"
        vm_stat | head -4
    fi
    
    # Disk
    if command -v df &> /dev/null; then
        echo "💽 Disco:"
        df -h / | tail -1
    fi
    
    echo "─────────────────────────────────────────────"
}

# Função para criar job de teste otimizado
create_test_job() {
    local job_id="perf-test-$(date +%s)-$$"
    
    curl -s -X POST "$API_BASE/api/v1/media/render" \
        -H "Content-Type: application/json" \
        -d "{
            \"timeline\": {
                \"tracks\": [
                    {
                        \"clips\": [
                            {
                                \"asset\": {
                                    \"type\": \"image\",
                                    \"src\": \"https://picsum.photos/1280/720\",
                                    \"source\": \"url\"
                                },
                                \"start\": 0,
                                \"length\": 5
                            }
                        ]
                    },
                    {
                        \"clips\": [
                            {
                                \"asset\": {
                                    \"type\": \"audio\",
                                    \"src\": \"https://www.soundjay.com/misc/sounds/beep-07a.mp3\",
                                    \"source\": \"url\"
                                },
                                \"start\": 0,
                                \"length\": 5
                            }
                        ]
                    }
                ]
            },
            \"output\": {
                \"format\": \"mp4\",
                \"resolution\": \"1280x720\",
                \"fps\": 30,
                \"codec\": \"libx264\"
            }
        }" 2>/dev/null | jq -r '.data.jobId // empty' 2>/dev/null
}

# Função para verificar status do job
check_job_status() {
    local job_id=$1
    curl -s "$API_BASE/api/v1/media/jobs/$job_id" 2>/dev/null | \
        jq -r '.data.status // "unknown"' 2>/dev/null
}

# Função para monitorar recursos durante teste
monitor_resources() {
    local duration=$1
    local interval=5
    local end_time=$(($(date +%s) + duration))
    
    echo "📊 MONITORAMENTO DE RECURSOS (${duration}s):"
    echo "─────────────────────────────────────────────"
    
    while [ $(date +%s) -lt $end_time ]; do
        local timestamp=$(date '+%H:%M:%S')
        
        # CPU Usage
        if command -v top &> /dev/null; then
            local cpu_usage=$(top -l 1 -n 0 | grep "CPU usage" | awk '{print $3}' | sed 's/%//' 2>/dev/null || echo "N/A")
        elif command -v vmstat &> /dev/null; then
            local cpu_usage=$(vmstat 1 2 | tail -1 | awk '{print 100-$15}' 2>/dev/null || echo "N/A")
        else
            local cpu_usage="N/A"
        fi
        
        # Memory Usage
        if command -v free &> /dev/null; then
            local mem_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}' 2>/dev/null || echo "N/A")
        elif command -v vm_stat &> /dev/null; then
            local mem_usage=$(vm_stat | awk 'BEGIN{total=0; used=0} /Pages free:/{free=$3} /Pages active:/{active=$3} /Pages inactive:/{inactive=$3} /Pages speculative:/{spec=$3} /Pages wired down:/{wired=$4} END{total=(free+active+inactive+spec+wired); used=(active+inactive+wired); printf "%.1f", used/total*100}' 2>/dev/null || echo "N/A")
        else
            local mem_usage="N/A"
        fi
        
        echo "[$timestamp] 🔄 CPU: ${cpu_usage}% | 💾 RAM: ${mem_usage}%"
        
        sleep $interval
    done
}

# Função principal de teste de performance
run_performance_test() {
    local start_time=$(date +%s)
    local completed_jobs=0
    local failed_jobs=0
    local job_ids=()
    
    echo "🚀 INICIANDO TESTE DE PERFORMANCE..."
    echo "─────────────────────────────────────────────"
    
    # Mostrar recursos iniciais
    show_system_resources
    
    # Iniciar monitoramento em background
    monitor_resources $TEST_DURATION &
    local monitor_pid=$!
    
    # Criar jobs simultaneamente
    echo "📤 Criando $CONCURRENT_JOBS jobs simultâneos..."
    for i in $(seq 1 $CONCURRENT_JOBS); do
        local job_id=$(create_test_job)
        if [ -n "$job_id" ]; then
            job_ids+=("$job_id")
            echo "   ✅ Job $i criado: $job_id"
        else
            echo "   ❌ Falha ao criar job $i"
            ((failed_jobs++))
        fi
        
        # Pequeno delay para não sobrecarregar
        sleep 0.1
    done
    
    echo "⏳ Aguardando conclusão dos jobs..."
    
    # Aguardar conclusão
    local max_wait=$((TEST_DURATION + 60))
    local waited=0
    
    while [ $waited -lt $max_wait ]; do
        local running_jobs=0
        local current_completed=0
        local current_failed=0
        
        for job_id in "${job_ids[@]}"; do
            local status=$(check_job_status "$job_id")
            case "$status" in
                "completed") ((current_completed++)) ;;
                "failed") ((current_failed++)) ;;
                "processing"|"queued") ((running_jobs++)) ;;
            esac
        done
        
        completed_jobs=$current_completed
        failed_jobs=$current_failed
        
        echo "📊 [$waited/${max_wait}s] ✅ Completos: $completed_jobs | ❌ Falhados: $failed_jobs | 🔄 Executando: $running_jobs"
        
        if [ $running_jobs -eq 0 ]; then
            echo "🎉 Todos os jobs concluídos!"
            break
        fi
        
        sleep 5
        ((waited += 5))
    done
    
    # Parar monitoramento
    kill $monitor_pid 2>/dev/null || true
    
    local end_time=$(date +%s)
    local total_time=$((end_time - start_time))
    
    echo "─────────────────────────────────────────────"
    echo "📊 RESULTADOS DO TESTE:"
    echo "─────────────────────────────────────────────"
    echo "⏱️  Tempo Total: ${total_time}s"
    echo "🎯 Jobs Criados: ${#job_ids[@]}"
    echo "✅ Jobs Completos: $completed_jobs"
    echo "❌ Jobs Falhados: $failed_jobs"
    echo "📈 Taxa de Sucesso: $(echo "scale=1; $completed_jobs * 100 / ${#job_ids[@]}" | bc 2>/dev/null || echo "N/A")%"
    
    if [ $completed_jobs -gt 0 ]; then
        local avg_time=$(echo "scale=1; $total_time / $completed_jobs" | bc 2>/dev/null || echo "N/A")
        echo "⚡ Tempo Médio por Job: ${avg_time}s"
        local throughput=$(echo "scale=2; $completed_jobs / $total_time * 60" | bc 2>/dev/null || echo "N/A")
        echo "🚀 Throughput: ${throughput} jobs/minuto"
    fi
}

# Função para gerar recomendações
generate_recommendations() {
    echo ""
    echo "💡 RECOMENDAÇÕES DE DIMENSIONAMENTO:"
    echo "================================================"
    
    # Baseado no Bull Queue atual (sem limite de concorrência configurado)
    echo "🔧 CONFIGURAÇÕES ATUAIS DETECTADAS:"
    echo "   • Bull Queue: sem limite de concorrência"
    echo "   • Tentativas: 3 por job"
    echo "   • Timeout: 5 minutos"
    echo "   • Limpeza automática: 1 hora"
    echo ""
    
    echo "🎯 PARA 20-50 JOBS SIMULTÂNEOS:"
    echo "─────────────────────────────────────────────"
    echo "🖥️  SERVIDOR MÍNIMO RECOMENDADO:"
    echo "   • CPU: 8+ cores (Intel i7/Xeon ou AMD Ryzen 7+)"
    echo "   • RAM: 16-32 GB"
    echo "   • Storage: SSD 500+ GB (para temp files)"
    echo "   • Network: 1 Gbps+"
    echo ""
    
    echo "🖥️  SERVIDOR OTIMIZADO (50+ jobs):"
    echo "   • CPU: 16+ cores (Xeon/Ryzen 9/Threadripper)"
    echo "   • RAM: 64+ GB"
    echo "   • Storage: NVMe SSD 1+ TB"
    echo "   • Network: 10 Gbps"
    echo ""
    
    echo "🐳 CONFIGURAÇÕES DOCKER RECOMENDADAS:"
    echo "   • Limitar CPU por container"
    echo "   • Configurar memory limits"
    echo "   • Volume separado para storage"
    echo "   • Redis com persistência"
    echo ""
    
    echo "⚙️  CONFIGURAÇÕES DE CÓDIGO SUGERIDAS:"
    echo "   • Limitar concorrência do Bull Queue"
    echo "   • Implementar rate limiting"
    echo "   • Configurar timeouts menores"
    echo "   • Otimizar limpeza automática"
    echo ""
    
    echo "☁️  CLOUD PROVIDERS RECOMENDADOS:"
    echo "   • AWS: c5.4xlarge ou c5.9xlarge"
    echo "   • GCP: c2-standard-16 ou c2-standard-30"
    echo "   • Azure: F16s_v2 ou F32s_v2"
    echo "   • DigitalOcean: CPU Optimized 16-32 vCPUs"
}

# Verificar se API está acessível
echo "🔍 Verificando conectividade com a API..."
if ! curl -s "$API_BASE/health" > /dev/null 2>&1; then
    echo "❌ Erro: API não está acessível em $API_BASE"
    echo "   Certifique-se de que o servidor está rodando"
    exit 1
fi

echo "✅ API acessível!"
echo ""

# Executar teste se não for apenas análise
if [ "$4" != "--analysis-only" ]; then
    run_performance_test
fi

# Sempre mostrar recomendações
generate_recommendations

echo ""
echo "🏁 Análise concluída!"
echo "================================================" 