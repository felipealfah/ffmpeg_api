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