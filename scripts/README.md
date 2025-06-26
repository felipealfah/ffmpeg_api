# 🧪 Scripts de Teste - FFmpeg API

Scripts para testar as funcionalidades de limpeza automática da API FFmpeg.

## 📋 **Pré-requisitos**

- `curl` instalado
- `jq` instalado (para formatação JSON)
- API FFmpeg rodando (local ou servidor)

### **Instalar jq (se necessário):**

**macOS:**
```bash
brew install jq
```

**Ubuntu/Debian:**
```bash
apt update && apt install -y jq
```

**CentOS/RHEL:**
```bash
yum install -y jq
```

## 🚀 **Scripts Disponíveis**

### **1. `test-api.sh` - Testa Endpoints Administrativos**
```bash
# Teste local
./scripts/test-api.sh

# Teste em servidor remoto
./scripts/test-api.sh http://SEU_SERVER_IP:3000
```

**Funcionalidades testadas:**
- ✅ Health check
- 📊 Estatísticas de storage
- 🧹 Limpeza manual (24h, 1h, 0h)

### **2. `create-test-job.sh` - Cria Jobs de Teste**
```bash
# Criar job local
./scripts/create-test-job.sh

# Criar job no servidor
./scripts/create-test-job.sh http://SEU_SERVER_IP:3000
```

**O que faz:**
- 📤 Cria job de renderização de teste
- ⏳ Aguarda processamento (15s)
- 📊 Mostra estatísticas após processamento

### **3. `test-cleanup.sh` - Teste Completo**
```bash
# Teste local completo
./scripts/test-cleanup.sh

# Teste no servidor (quando conectado via SSH)
./scripts/test-cleanup.sh server

# Teste em servidor remoto
./scripts/test-cleanup.sh remote
```

**Sequência de testes:**
1. 🔍 Estado inicial
2. 📤 Criação de 3 jobs de teste
3. 📊 Estatísticas após criação
4. 🧹 Limpeza manual
5. 📊 Estatísticas após limpeza
6. 🧪 Teste completo de endpoints

## 📊 **Exemplo de Saída**

### **Estatísticas de Storage:**
```json
{
  "data": {
    "storage": {
      "jobs": {
        "total": 3,
        "queued": 0,
        "processing": 0,
        "completed": 3,
        "failed": 0,
        "byAge": {
          "last1h": 3,
          "last24h": 0,
          "older": 0
        }
      },
      "directories": {
        "temp": 0,
        "output": 3
      }
    }
  }
}
```

### **Limpeza Manual:**
```json
{
  "data": {
    "message": "Limpeza manual executada com sucesso",
    "results": {
      "removedJobs": 3,
      "remainingJobs": 0,
      "maxAgeHours": 0
    }
  }
}
```

## 🛠️ **Uso no Servidor**

### **1. Copiar Scripts para o Servidor:**
```bash
# No servidor, criar diretório
mkdir -p ~/ffmpeg_api/scripts

# Copiar scripts (via scp ou git)
scp scripts/* root@SEU_SERVER:/root/ffmpeg_api/scripts/
```

### **2. Instalar jq no Servidor:**
```bash
# Ubuntu/Debian
apt update && apt install -y jq

# CentOS/RHEL
yum install -y jq
```

### **3. Dar Permissões:**
```bash
chmod +x scripts/*.sh
```

### **4. Executar Testes:**
```bash
# No servidor, via SSH
./scripts/test-cleanup.sh server
```

## 🔧 **Personalização**

### **Alterar URLs de Teste:**
Edite `create-test-job.sh` para usar suas próprias URLs de assets:

```bash
# Linha ~15-40 no create-test-job.sh
"src": "https://SUA_URL_DE_IMAGEM.jpg"
"src": "https://SUA_URL_DE_AUDIO.mp3"
```

### **Alterar Tempos de Teste:**
```bash
# Em test-cleanup.sh, linha ~50
wait_with_progress 20 "⏳ Aguardando jobs processarem..."
```

## 🚨 **Resolução de Problemas**

### **Erro: `jq: command not found`**
```bash
# Instalar jq ou usar alternativa
curl -s URL | python3 -m json.tool
```

### **Erro: `curl: command not found`**
```bash
# Instalar curl
apt install -y curl  # Ubuntu/Debian
yum install -y curl  # CentOS/RHEL
```

### **Erro: API não responde**
```bash
# Verificar se API está rodando
curl -s http://localhost:3000/health
docker-compose ps
docker-compose logs ffmpeg-api
```

## 🚀 **Análise de Performance**

### **Script de Dimensionamento:**
```bash
# Análise completa (sem executar testes)
./scripts/performance-analysis.sh http://localhost:3000 0 0 --analysis-only

# Teste de carga local (10 jobs simultâneos)
./scripts/performance-analysis.sh

# Teste de produção (30 jobs, 2 minutos)
./scripts/performance-analysis.sh https://sua-api.com 30 120
```

### **Documentação Completa:**
- 📊 **Dimensionamento**: Ver `docs/production-sizing.md`
- 🎯 **Cenários**: 20, 30, 50+ jobs simultâneos
- 💰 **Custos**: Análise por provider cloud
- ⚙️ **Otimizações**: Configurações de código e Docker

## 📊 **Monitoramento (Prometheus + Grafana)**

### **Testar Sistema de Monitoramento:**
```bash
# Teste completo do stack de monitoramento
./scripts/test-monitoring.sh

# Subir stack completa (API + Prometheus + Grafana)
docker-compose up -d

# Acessar serviços
# - API: http://localhost:3000
# - Métricas: http://localhost:3000/metrics
# - Prometheus: http://localhost:9090
# - Grafana: http://localhost:3001 (admin/admin123)
```

### **Documentação de Monitoramento:**
- 📈 **Setup Completo**: Ver `docs/monitoring.md`
- 📊 **Dashboard Grafana**: Importado automaticamente
- 🎯 **Métricas**: HTTP, Jobs FFmpeg, Storage, Sistema
- ⚠️ **Alertas**: Queries Prometheus para produção

## 📝 **Logs e Debug**

Para ver logs detalhados durante os testes:
```bash
# Remover redirecionamento em test-cleanup.sh
./scripts/create-test-job.sh "$API_BASE"  # Sem > /dev/null 2>&1
```

## 💰 **Análise de Custos**

### **`cost-calculator.sh`**
Calculadora completa de custos de renderização:

```bash
# Sintaxe
./scripts/cost-calculator.sh [API_BASE] [DURATION_SECONDS] [COMPLEXITY]

# Exemplos
./scripts/cost-calculator.sh http://localhost:3000 60 medium    # 1 minuto, médio
./scripts/cost-calculator.sh http://localhost:3000 600 high    # 10 minutos, alto
./scripts/cost-calculator.sh http://localhost:3000 30 low      # 30 segundos, simples
```

**Recursos da Calculadora:**
- ✅ Análise por complexidade (low/medium/high)
- ✅ Comparação entre provedores cloud (DO, AWS, GCP)
- ✅ Breakdown detalhado de custos (CPU, storage, bandwidth)
- ✅ Projeções de volume mensal
- ✅ Comparação com concorrentes (Cloudinary, AWS MediaConvert, etc.)
- ✅ Recomendações de otimização
- ✅ Análise de ROI e break-even

## 🎯 **Exemplos de Uso**

### **Teste Completo da API**
```bash
# 1. Testar funcionalidades básicas
./scripts/test-api.sh

# 2. Verificar sistema de limpeza
./scripts/test-cleanup.sh

# 3. Validar monitoramento
./scripts/test-monitoring.sh

# 4. Analisar custos para vídeo de 5 minutos
./scripts/cost-calculator.sh http://localhost:3000 300 medium
```

### **Análise de Produção**
```bash
# Análise de performance detalhada
./scripts/performance-analysis.sh

# Cálculo de custos para diferentes cenários
./scripts/cost-calculator.sh http://localhost:3000 60 low      # Vídeos simples
./scripts/cost-calculator.sh http://localhost:3000 300 medium  # Vídeos médios
./scripts/cost-calculator.sh http://localhost:3000 600 high    # Vídeos complexos
```

## 📊 **Interpretação dos Resultados**

### **Custos por Complexidade**

| Complexidade | Fator Renderização | Uso CPU | Exemplo de Conteúdo |
|--------------|-------------------|---------|---------------------|
| **Low** | 0.5x tempo real | 30% | Slideshow, texto sobre imagem |
| **Medium** | 1.5x tempo real | 60% | Transições, efeitos básicos |
| **High** | 3.0x tempo real | 90% | Compositing, efeitos 3D |

### **Custos Estimados (Servidor DO 16GB)**

| Duração | Complexidade | Custo/vídeo | 1k vídeos/mês | 10k vídeos/mês |
|---------|--------------|-------------|---------------|----------------|
| 1 min | Low | $0.0054 | $5.40 | $54.00 |
| 1 min | Medium | $0.0108 | $10.80 | $108.00 |
| 1 min | High | $0.0217 | $21.70 | $217.00 |
| 10 min | Medium | $0.0724 | $72.40 | $724.00 |

### **Comparação com Concorrentes**

**Sua API vs Mercado (vídeo 1 minuto):**
- Cloudinary: $0.0200 vs Sua API: $0.0108 (**46% mais barato**)
- AWS MediaConvert: $0.0150 vs Sua API: $0.0108 (**28% mais barato**)
- Google Video AI: $0.0250 vs Sua API: $0.0108 (**57% mais barato**)

## 🚀 **Otimizações Recomendadas**

### **Para Reduzir Custos**
1. **Instâncias Spot/Preemptible**: 50-90% de desconto
2. **Cache de Assets**: Reutilizar recursos comuns
3. **Pré-validação**: Evitar processamento de jobs inválidos
4. **Queue Prioritária**: Processar vídeos simples primeiro

### **Para Aumentar Performance**
1. **Hardware Encoding**: Usar aceleração de GPU quando disponível
2. **Batch Processing**: Agrupar jobs similares
3. **Auto-scaling**: Ajustar recursos baseado na demanda
4. **CDN**: Otimizar entrega de assets

## 📈 **Métricas de Monitoramento**

Os scripts coletam e validam estas métricas essenciais:

### **Métricas da API**
- `http_requests_total` - Total de requests HTTP
- `http_request_duration_seconds` - Latência das requisições
- `http_requests_active` - Requests ativas

### **Métricas FFmpeg**
- `ffmpeg_jobs_active` - Jobs ativos por status
- `ffmpeg_job_duration_seconds` - Tempo de processamento
- `ffmpeg_jobs_total` - Total de jobs processados

### **Métricas de Sistema**
- `process_cpu_seconds_total` - Uso de CPU
- `process_resident_memory_bytes` - Uso de memória
- `nodejs_eventloop_lag_seconds` - Event loop lag

### **Métricas de Storage**
- `storage_directories_total` - Contadores de diretórios
- `cleanup_operations_total` - Operações de limpeza

## 🔍 **Troubleshooting**

### **Problemas Comuns**

**Script não executa:**
```bash
chmod +x scripts/*.sh
```

**API não responde:**
```bash
# Verificar se a API está rodando
curl http://localhost:3000/health
```

**Métricas não aparecem:**
```bash
# Verificar endpoint de métricas
curl http://localhost:3000/metrics
```

**Docker não sobe:**
```bash
# Rebuild dos containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## 📚 **Documentação Relacionada**

- [`../docs/monitoring.md`](../docs/monitoring.md) - Sistema de monitoramento completo
- [`../docs/cost-analysis.md`](../docs/cost-analysis.md) - Análise detalhada de custos
- [`../docs/production-sizing.md`](../docs/production-sizing.md) - Dimensionamento para produção
- [`../README.md`](../README.md) - Documentação principal da API 