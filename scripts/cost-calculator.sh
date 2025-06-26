#!/bin/bash

# 💰 Calculadora de Custo de Renderização FFmpeg
# Calcula o custo por vídeo baseado em tempo de processamento e recursos

API_BASE=${1:-"http://localhost:3000"}
VIDEO_DURATION=${2:-60}  # Duração do vídeo em segundos
COMPLEXITY=${3:-"medium"}  # low, medium, high

echo "💰 CALCULADORA DE CUSTO - RENDERIZAÇÃO FFMPEG"
echo "================================================"
echo "🎬 Duração do vídeo: ${VIDEO_DURATION}s ($(($VIDEO_DURATION / 60))min $(($VIDEO_DURATION % 60))s)"
echo "🔧 Complexidade: $COMPLEXITY"
echo "================================================"

# Fatores de renderização baseados na complexidade
case $COMPLEXITY in
    "low")
        RENDER_FACTOR=0.5    # Vídeo simples: 0.5x tempo real
        CPU_USAGE=30         # 30% CPU por job
        DESCRIPTION="Vídeo simples (texto + imagem estática)"
        ;;
    "medium")
        RENDER_FACTOR=1.5    # Vídeo médio: 1.5x tempo real
        CPU_USAGE=60         # 60% CPU por job
        DESCRIPTION="Vídeo médio (transições + efeitos básicos)"
        ;;
    "high")
        RENDER_FACTOR=3.0    # Vídeo complexo: 3x tempo real
        CPU_USAGE=90         # 90% CPU por job
        DESCRIPTION="Vídeo complexo (múltiplas camadas + efeitos)"
        ;;
    *)
        echo "❌ Complexidade inválida. Use: low, medium, high"
        exit 1
        ;;
esac

# Calcular tempo de renderização
RENDER_TIME=$(echo "$VIDEO_DURATION * $RENDER_FACTOR" | bc -l)
RENDER_TIME_INT=$(printf "%.0f" "$RENDER_TIME")

echo "📊 ANÁLISE DE PROCESSAMENTO"
echo "─────────────────────────────────────────────"
echo "🎯 $DESCRIPTION"
echo "⏱️  Tempo de renderização estimado: ${RENDER_TIME_INT}s ($(($RENDER_TIME_INT / 60))min $(($RENDER_TIME_INT % 60))s)"
echo "🔄 Fator de renderização: ${RENDER_FACTOR}x tempo real"
echo "💻 Uso de CPU por job: ${CPU_USAGE}%"
echo ""

# Especificações de servidor para diferentes cenários
echo "💰 CUSTOS POR CENÁRIO DE SERVIDOR"
echo "─────────────────────────────────────────────"

# Função para calcular custo
calculate_cost() {
    local server_name=$1
    local hourly_cost=$2
    local max_concurrent=$3
    local cpu_cores=$4
    
    # Custo por segundo
    local cost_per_second=$(echo "$hourly_cost / 3600" | bc -l)
    
    # Custo do processamento
    local processing_cost=$(echo "$cost_per_second * $RENDER_TIME_INT" | bc -l)
    
    # Custo com overhead (storage, rede, etc.)
    local overhead_cost=$(echo "$processing_cost * 0.2" | bc -l)
    local total_cost=$(echo "$processing_cost + $overhead_cost" | bc -l)
    
    # Throughput (vídeos por hora)
    local videos_per_hour=$(echo "3600 / $RENDER_TIME_INT * $max_concurrent" | bc -l)
    
    printf "🖥️  %-20s | \$%.4f | %2d jobs | %.1f vídeos/h\n" \
        "$server_name" "$total_cost" "$max_concurrent" "$videos_per_hour"
}

echo "Servidor                 | Custo/vídeo | Max Jobs | Throughput"
echo "─────────────────────────────────────────────────────────────"

# DigitalOcean CPU-Optimized
calculate_cost "DO 8GB" 0.119 8 4
calculate_cost "DO 16GB" 0.238 16 8
calculate_cost "DO 32GB" 0.476 32 16
calculate_cost "DO 64GB" 1.190 64 32

echo ""

# AWS
calculate_cost "AWS c5.large" 0.085 4 2
calculate_cost "AWS c5.xlarge" 0.170 8 4
calculate_cost "AWS c5.2xlarge" 0.340 16 8
calculate_cost "AWS c5.4xlarge" 0.680 32 16

echo ""

# Google Cloud
calculate_cost "GCP n2-standard-4" 0.155 8 4
calculate_cost "GCP n2-standard-8" 0.310 16 8
calculate_cost "GCP n2-standard-16" 0.620 32 16

echo ""

# Análise detalhada para vídeo específico
echo "🎯 ANÁLISE DETALHADA - VÍDEO DE ${VIDEO_DURATION}s"
echo "─────────────────────────────────────────────"

# Recursos utilizados
MEMORY_PER_JOB=512  # MB por job
STORAGE_TEMP=100    # MB temporário
STORAGE_OUTPUT=50   # MB output

echo "📊 Recursos por vídeo:"
echo "   💾 RAM: ${MEMORY_PER_JOB}MB"
echo "   📁 Storage temp: ${STORAGE_TEMP}MB"
echo "   📤 Storage output: ${STORAGE_OUTPUT}MB"
echo "   ⏱️  Tempo CPU: ${RENDER_TIME_INT}s"
echo ""

# Custos detalhados para servidor médio (DO 16GB)
SERVER_HOURLY=0.238
COST_PER_SECOND=$(echo "$SERVER_HOURLY / 3600" | bc -l)

CPU_COST=$(echo "$COST_PER_SECOND * $RENDER_TIME_INT" | bc -l)
STORAGE_COST=$(echo "($STORAGE_TEMP + $STORAGE_OUTPUT) * 0.00001" | bc -l)  # $0.10/GB/mês
BANDWIDTH_COST=$(echo "$STORAGE_OUTPUT * 0.00005" | bc -l)  # $0.05/GB transferência
OVERHEAD_COST=$(echo "$CPU_COST * 0.15" | bc -l)  # 15% overhead

TOTAL_COST=$(echo "$CPU_COST + $STORAGE_COST + $BANDWIDTH_COST + $OVERHEAD_COST" | bc -l)

echo "💰 Breakdown de custos (Servidor DO 16GB):"
printf "   🔄 Processamento CPU: \$%.6f\n" "$CPU_COST"
printf "   📁 Storage: \$%.6f\n" "$STORAGE_COST"
printf "   🌐 Bandwidth: \$%.6f\n" "$BANDWIDTH_COST"
printf "   ⚙️  Overhead (Redis, etc): \$%.6f\n" "$OVERHEAD_COST"
echo "   ─────────────────────────"
printf "   💰 TOTAL POR VÍDEO: \$%.6f\n" "$TOTAL_COST"
echo ""

# Projeções de volume
echo "📈 PROJEÇÕES DE VOLUME MENSAL"
echo "─────────────────────────────────────────────"

for videos in 1000 5000 10000 50000; do
    monthly_cost=$(echo "$TOTAL_COST * $videos" | bc -l)
    printf "📊 %6d vídeos/mês: \$%8.2f\n" "$videos" "$monthly_cost"
done

echo ""

# Recomendações de otimização
echo "🚀 OTIMIZAÇÕES PARA REDUZIR CUSTOS"
echo "─────────────────────────────────────────────"
echo "1. 🎯 Pré-processamento:"
echo "   - Validar assets antes da renderização"
echo "   - Usar cache para assets reutilizados"
echo "   - Otimizar resolução/qualidade baseado no uso"
echo ""
echo "2. ⚡ Otimização de recursos:"
echo "   - Usar instâncias spot/preemptible (50-90% desconto)"
echo "   - Implementar auto-scaling baseado na demanda"
echo "   - Configurar limpeza agressiva de arquivos temp"
echo ""
echo "3. 🔧 Otimização técnica:"
echo "   - Usar hardware encoding quando disponível"
echo "   - Implementar queue prioritária (vídeos simples primeiro)"
echo "   - Batch processing para vídeos similares"
echo ""

# Comparação com concorrentes
echo "🏆 COMPARAÇÃO COM SERVIÇOS TERCEIROS"
echo "─────────────────────────────────────────────"
echo "Serviço               | Custo/min | Custo vídeo ${VIDEO_DURATION}s"
echo "─────────────────────────────────────────────"

VIDEO_MINUTES=$(echo "$VIDEO_DURATION / 60" | bc -l)

# Preços aproximados de concorrentes (2024)
printf "Cloudinary            | \$0.0200  | \$%.4f\n" $(echo "$VIDEO_MINUTES * 0.02" | bc -l)
printf "AWS MediaConvert      | \$0.0150  | \$%.4f\n" $(echo "$VIDEO_MINUTES * 0.015" | bc -l)
printf "Google Video AI       | \$0.0250  | \$%.4f\n" $(echo "$VIDEO_MINUTES * 0.025" | bc -l)
printf "Azure Media Services  | \$0.0180  | \$%.4f\n" $(echo "$VIDEO_MINUTES * 0.018" | bc -l)
echo "─────────────────────────────────────────────"
printf "SUA API (otimizada)   | \$%.4f  | \$%.4f\n" $(echo "$TOTAL_COST * 60 / $VIDEO_DURATION" | bc -l) "$TOTAL_COST"

# Economia potencial
COMPETITOR_AVG=$(echo "($VIDEO_MINUTES * 0.02 + $VIDEO_MINUTES * 0.015 + $VIDEO_MINUTES * 0.025 + $VIDEO_MINUTES * 0.018) / 4" | bc -l)
SAVINGS=$(echo "$COMPETITOR_AVG - $TOTAL_COST" | bc -l)
SAVINGS_PERCENT=$(echo "$SAVINGS / $COMPETITOR_AVG * 100" | bc -l)

echo ""
if (( $(echo "$SAVINGS > 0" | bc -l) )); then
    printf "💰 ECONOMIA: \$%.6f por vídeo (%.1f%% mais barato)\n" "$SAVINGS" "$SAVINGS_PERCENT"
else
    EXTRA_COST=$(echo "$TOTAL_COST - $COMPETITOR_AVG" | bc -l)
    EXTRA_PERCENT=$(echo "$EXTRA_COST / $COMPETITOR_AVG * 100" | bc -l)
    printf "💸 CUSTO EXTRA: \$%.6f por vídeo (%.1f%% mais caro)\n" "$EXTRA_COST" "$EXTRA_PERCENT"
fi

echo ""
echo "🏁 Cálculo concluído!"
echo "================================================" 