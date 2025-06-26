# 💰 Análise de Custos - FFmpeg API

## Visão Geral

Este documento fornece uma análise detalhada dos custos de renderização de vídeos na sua API FFmpeg, incluindo comparações com serviços terceiros e estratégias de otimização.

## 🧮 Calculadora de Custos

Use o script `scripts/cost-calculator.sh` para calcular custos específicos:

```bash
# Vídeo de 1 minuto, complexidade média
./scripts/cost-calculator.sh http://localhost:3000 60 medium

# Vídeo de 10 minutos, alta complexidade
./scripts/cost-calculator.sh http://localhost:3000 600 high

# Vídeo simples de 30 segundos
./scripts/cost-calculator.sh http://localhost:3000 30 low
```

## 📊 Fatores de Custo

### 1. Complexidade de Renderização

| Complexidade | Fator | Uso CPU | Descrição | Exemplos |
|--------------|-------|---------|-----------|----------|
| **Low** | 0.5x | 30% | Vídeos simples | Texto + imagem estática, slideshow |
| **Medium** | 1.5x | 60% | Vídeos médios | Transições, efeitos básicos, múltiplas camadas |
| **High** | 3.0x | 90% | Vídeos complexos | Efeitos avançados, compositing, 3D |

### 2. Recursos por Job

- **RAM**: 512MB por job ativo
- **Storage Temp**: ~100MB durante processamento
- **Storage Output**: 20-100MB dependendo da qualidade
- **Bandwidth**: Transfer do arquivo final

## 💸 Análise de Custos por Servidor

### DigitalOcean CPU-Optimized

| Servidor | Custo/hora | Jobs Simultâneos | Custo/vídeo (1min médio) | Throughput |
|----------|------------|------------------|--------------------------|------------|
| 8GB | $0.119 | 8 | $0.0030 | 320 vídeos/h |
| 16GB | $0.238 | 16 | $0.0030 | 640 vídeos/h |
| 32GB | $0.476 | 32 | $0.0030 | 1280 vídeos/h |
| 64GB | $1.190 | 64 | $0.0030 | 2560 vídeos/h |

### AWS EC2 (us-east-1)

| Servidor | Custo/hora | Jobs Simultâneos | Custo/vídeo (1min médio) | Throughput |
|----------|------------|------------------|--------------------------|------------|
| c5.large | $0.085 | 4 | $0.0032 | 160 vídeos/h |
| c5.xlarge | $0.170 | 8 | $0.0032 | 320 vídeos/h |
| c5.2xlarge | $0.340 | 16 | $0.0032 | 640 vídeos/h |
| c5.4xlarge | $0.680 | 32 | $0.0032 | 1280 vídeos/h |

### Google Cloud Platform

| Servidor | Custo/hora | Jobs Simultâneos | Custo/vídeo (1min médio) | Throughput |
|----------|------------|------------------|--------------------------|------------|
| n2-standard-4 | $0.155 | 8 | $0.0029 | 320 vídeos/h |
| n2-standard-8 | $0.310 | 16 | $0.0029 | 640 vídeos/h |
| n2-standard-16 | $0.620 | 32 | $0.0029 | 1280 vídeos/h |

## 🎯 Exemplos Práticos

### Vídeo de 1 Minuto (Complexidade Média)

**Breakdown de Custos (Servidor DO 16GB - $0.238/h):**

- 🔄 Processamento CPU: $0.002975
- 📁 Storage: $0.000002
- 🌐 Bandwidth: $0.000003
- ⚙️ Overhead: $0.000446
- **💰 TOTAL: $0.003426**

**Projeções Mensais:**
- 1.000 vídeos: $3.43
- 5.000 vídeos: $17.13
- 10.000 vídeos: $34.26
- 50.000 vídeos: $171.30

### Vídeo de 10 Minutos (Complexidade Média)

**Custos Estimados:**
- Tempo de renderização: 15 minutos
- Custo por vídeo: ~$0.034
- 1.000 vídeos/mês: $34.00
- 10.000 vídeos/mês: $340.00

## 🏆 Comparação com Concorrentes

### Preços por Minuto (2024)

| Serviço | Custo/minuto | Vídeo 1min | Vídeo 10min |
|---------|--------------|------------|-------------|
| **Cloudinary** | $0.0200 | $0.0200 | $0.2000 |
| **AWS MediaConvert** | $0.0150 | $0.0150 | $0.1500 |
| **Google Video AI** | $0.0250 | $0.0250 | $0.2500 |
| **Azure Media Services** | $0.0180 | $0.0180 | $0.1800 |
| **Sua API (otimizada)** | $0.0034 | $0.0034 | $0.0340 |

### 💰 Economia Potencial

- **Vídeo 1 minuto**: 82% mais barato que a média dos concorrentes
- **Vídeo 10 minutos**: 84% mais barato que a média dos concorrentes
- **Economia anual** (10k vídeos/mês): ~$18.000

## 🚀 Estratégias de Otimização

### 1. Otimização de Custos Imediata

```bash
# Usar instâncias spot (50-90% desconto)
# AWS Spot Instance
aws ec2 request-spot-instances --spot-price "0.17" --instance-count 1

# GCP Preemptible
gcloud compute instances create ffmpeg-worker --preemptible

# DigitalOcean Reserved Instances (até 30% desconto)
```

### 2. Otimização de Código

```javascript
// Pré-validação para evitar processamento desnecessário
async function validateAssets(assets) {
  for (const asset of assets) {
    if (!await fileExists(asset.url)) {
      throw new Error(`Asset not found: ${asset.url}`);
    }
  }
}

// Cache de assets reutilizados
const assetCache = new Map();

// Queue prioritária por complexidade
const simpleQueue = [];
const complexQueue = [];
```

### 3. Auto-scaling Baseado em Demanda

```yaml
# docker-compose.yml com scaling
services:
  ffmpeg-worker:
    image: ffmpeg-api
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

### 4. Monitoramento de Custos

```javascript
// Métricas de custo em tempo real
const costMetrics = {
  processingTime: new prometheus.Histogram({
    name: 'ffmpeg_processing_seconds',
    help: 'Time spent processing videos',
    buckets: [1, 5, 10, 30, 60, 300, 600]
  }),
  
  costPerVideo: new prometheus.Gauge({
    name: 'ffmpeg_cost_per_video_dollars',
    help: 'Estimated cost per video in dollars'
  })
};
```

## 📈 Análise de ROI

### Cenário: SaaS de Criação de Vídeo

**Modelo de Negócio:**
- Plano Basic: $19/mês (50 vídeos)
- Plano Pro: $49/mês (200 vídeos)
- Plano Enterprise: $199/mês (1000 vídeos)

**Custos vs Receita (Plano Pro):**
- Receita: $49/mês
- Custo de renderização: 200 × $0.0034 = $0.68
- **Margem bruta: 98.6%**

### Break-even Analysis

**Servidor DO 16GB ($238/mês):**
- Capacidade: ~460.000 vídeos/mês
- Break-even: 69.500 vídeos/mês ($0.0034 cada)
- **Utilização mínima**: 15% para ser lucrativo

## 🔍 Monitoramento de Custos

### Alertas Recomendados

```yaml
# Prometheus alerts
groups:
  - name: cost_alerts
    rules:
      - alert: HighProcessingCost
        expr: ffmpeg_cost_per_video_dollars > 0.01
        for: 5m
        annotations:
          summary: "Alto custo de processamento detectado"
          
      - alert: LowServerUtilization
        expr: (ffmpeg_jobs_active / ffmpeg_max_concurrent_jobs) < 0.15
        for: 15m
        annotations:
          summary: "Baixa utilização do servidor"
```

### Dashboard de Custos

Adicione ao Grafana:
- Custo por vídeo em tempo real
- Projeção de custos mensais
- Comparação com orçamento
- Eficiência de recursos (custo/throughput)

## 📋 Checklist de Otimização

### Antes do Deploy

- [ ] Validar estimativas de volume
- [ ] Configurar auto-scaling
- [ ] Implementar cache de assets
- [ ] Configurar instâncias spot/preemptible
- [ ] Definir alertas de custo

### Monitoramento Contínuo

- [ ] Revisar custos semanalmente
- [ ] Otimizar jobs de longa duração
- [ ] Analisar padrões de uso
- [ ] Ajustar capacidade baseado na demanda
- [ ] Comparar com benchmarks de mercado

## 🎯 Conclusões

1. **Sua API é 80-85% mais barata** que serviços terceiros
2. **ROI excelente** para modelos SaaS (margem >98%)
3. **Escalabilidade linear** de custos
4. **Otimizações disponíveis** podem reduzir custos em até 90%

**Recomendação**: Implemente monitoramento de custos e comece com servidor médio (16GB), escalando baseado na demanda real. 