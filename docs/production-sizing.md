# 🚀 Dimensionamento para Produção - FFmpeg API

## 📊 Análise Arquitetural Atual

### 🔧 **Configurações Atuais Detectadas:**

#### **Sistema de Filas (Bull/Redis):**
- ✅ **Bull Queue** sem limite de concorrência (ilimitado)
- ✅ **Tentativas**: 3 por job com backoff exponencial
- ✅ **Timeout**: 5 minutos por job
- ✅ **Limpeza automática**: A cada 1 hora (jobs > 24h)
- ✅ **Retenção**: 5 jobs completos, 3 jobs falhados

#### **Processamento de Mídia:**
- ✅ **FFmpeg** com fluent-ffmpeg wrapper
- ✅ **Assets**: Suporte para imagem, vídeo, áudio, texto e legendas
- ✅ **Download**: Assets baixados via HTTP/HTTPS
- ✅ **Storage**: Local + Google Cloud Storage
- ✅ **Limpeza**: Arquivos temp removidos automaticamente

#### **Infraestrutura Docker:**
- ✅ **Redis**: 7-alpine com persistência
- ✅ **Node.js**: 20-slim com FFmpeg, curl, jq
- ✅ **Volumes**: Storage compartilhado com host
- ✅ **Health checks**: API e Redis monitorados

---

## 🎯 Cenários de Dimensionamento

### **📈 Cenário 1: 20 Jobs Simultâneos**

#### **🖥️ Servidor Recomendado:**
```yaml
Especificações Mínimas:
  CPU: 8 cores (3.0+ GHz)
  RAM: 16 GB
  Storage: 500 GB SSD
  Network: 1 Gbps
  
Provisionamento Sugerido:
  - AWS: c5.2xlarge (8 vCPU, 16 GB RAM)
  - GCP: c2-standard-8 (8 vCPU, 32 GB RAM)
  - Azure: F8s_v2 (8 vCPU, 16 GB RAM)
  - DigitalOcean: CPU-Optimized 8 vCPUs
```

#### **⚙️ Configurações de Código:**
```typescript
// src/services/queueService.ts
const renderQueue = new Queue('video-render', {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 5,
    attempts: 3,
    timeout: 300000, // 5 minutos
  }
});

// Limitar concorrência
renderQueue.process(8, async (job) => { // MAX 8 jobs simultâneos
  // processamento...
});
```

#### **🐳 Docker Adjustments:**
```yaml
# docker-compose.yml
services:
  ffmpeg-api:
    deploy:
      resources:
        limits:
          cpus: '7.0'
          memory: 14G
        reservations:
          cpus: '4.0'
          memory: 8G
  
  redis:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 2G
```

---

### **📈 Cenário 2: 30 Jobs Simultâneos**

#### **🖥️ Servidor Recomendado:**
```yaml
Especificações Recomendadas:
  CPU: 12 cores (3.0+ GHz)
  RAM: 32 GB
  Storage: 1 TB NVMe SSD
  Network: 2-5 Gbps
  
Provisionamento Sugerido:
  - AWS: c5.4xlarge (16 vCPU, 32 GB RAM)
  - GCP: c2-standard-16 (16 vCPU, 64 GB RAM)
  - Azure: F16s_v2 (16 vCPU, 32 GB RAM)
  - DigitalOcean: CPU-Optimized 16 vCPUs
```

#### **⚙️ Configurações de Código:**
```typescript
// Concorrência aumentada
renderQueue.process(12, async (job) => { // MAX 12 jobs simultâneos
  // processamento...
});

// Timeout reduzido para maior throughput
defaultJobOptions: {
  timeout: 240000, // 4 minutos
  attempts: 2, // Menos tentativas para falhar mais rápido
}
```

---

### **📈 Cenário 3: 50+ Jobs Simultâneos**

#### **🖥️ Servidor High-Performance:**
```yaml
Especificações de Alto Desempenho:
  CPU: 20+ cores (3.2+ GHz) - Xeon/Ryzen 9/Threadripper
  RAM: 64+ GB
  Storage: 2+ TB NVMe SSD RAID 0
  Network: 10+ Gbps
  
Provisionamento Sugerido:
  - AWS: c5.9xlarge ou c5.12xlarge
  - GCP: c2-standard-30 ou c2-standard-60
  - Azure: F32s_v2 ou F48s_v2
  - Bare Metal: Dell/HP/Supermicro workstations
```

#### **⚙️ Configurações Avançadas:**
```typescript
// Múltiplas instâncias ou clustering
const concurrencyPerInstance = 16;
renderQueue.process(concurrencyPerInstance, async (job) => {
  // processamento otimizado...
});

// Configurações otimizadas
defaultJobOptions: {
  timeout: 180000, // 3 minutos
  attempts: 2,
  backoff: {
    type: 'fixed',
    delay: 500 // Retry mais rápido
  }
}
```

---

## 🔧 Otimizações de Código Recomendadas

### **1. Implementar Limite de Concorrência:**
```typescript
// src/services/queueService.ts
const MAX_CONCURRENT_JOBS = process.env.MAX_CONCURRENT_JOBS ? 
  parseInt(process.env.MAX_CONCURRENT_JOBS) : 8;

renderQueue.process(MAX_CONCURRENT_JOBS, async (job) => {
  // processamento...
});
```

### **2. Rate Limiting na API:**
```typescript
// src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';

export const renderLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // máximo 30 requests por minuto
  message: 'Muitas solicitações, tente novamente em breve'
});
```

### **3. Configurações de Environment:**
```bash
# .env para produção
NODE_ENV=production
MAX_CONCURRENT_JOBS=16
FFMPEG_THREADS=2  # Threads por job FFmpeg
REDIS_MAXMEMORY=2gb
CLEANUP_INTERVAL=3600000  # 1 hora
JOB_TIMEOUT=300000  # 5 minutos
```

### **4. Monitoramento Avançado:**
```typescript
// src/middleware/metrics.ts
import { createPrometheusMetrics } from './prometheus';

export const metricsMiddleware = createPrometheusMetrics({
  activeJobs: 'gauge',
  completedJobs: 'counter',
  failedJobs: 'counter',
  processingTime: 'histogram'
});
```

---

## 🐳 Configurações Docker Otimizadas

### **Arquivo docker-compose.production.yml:**
```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    command: >
      redis-server 
      --maxmemory 4gb
      --maxmemory-policy allkeys-lru
      --save 900 1
      --appendonly yes
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
    volumes:
      - redis-data:/data
      - ./redis.conf:/usr/local/etc/redis/redis.conf

  ffmpeg-api:
    image: ffmpeg-api:latest
    deploy:
      replicas: 2  # Múltiplas instâncias
      resources:
        limits:
          cpus: '14.0'
          memory: 28G
        reservations:
          cpus: '8.0'
          memory: 16G
      restart_policy:
        condition: on-failure
        max_attempts: 3
    environment:
      - MAX_CONCURRENT_JOBS=16
      - FFMPEG_THREADS=2
      - NODE_OPTIONS=--max-old-space-size=4096
    volumes:
      - storage-data:/app/storage
      - ./logs:/app/logs

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - ffmpeg-api

volumes:
  redis-data:
  storage-data:
```

---

## 📊 Benchmarks Esperados

### **Performance Estimada por Configuração:**

| Configuração | Jobs/min | Throughput | Latência Média | Uso CPU | Uso RAM |
|--------------|----------|------------|---------------|---------|---------|
| **8 cores, 16GB** | 15-25 | 0.3-0.4 jobs/s | 20-30s | 70-85% | 60-75% |
| **16 cores, 32GB** | 30-45 | 0.5-0.7 jobs/s | 15-25s | 65-80% | 50-65% |
| **24+ cores, 64GB** | 50-80 | 0.8-1.3 jobs/s | 10-20s | 60-75% | 40-60% |

### **Fatores que Afetam Performance:**
- **Complexidade do job**: Múltiplas tracks, efeitos, resolução
- **Asset size**: Downloads de arquivos grandes
- **Storage I/O**: SSD vs HDD, network storage
- **Network bandwidth**: Download de assets externos
- **FFmpeg settings**: Codec, bitrate, threads por job

---

## 🚨 Alertas e Monitoramento

### **Métricas Críticas para Monitorar:**
```yaml
Alerts:
  - Queue backlog > 50 jobs
  - CPU usage > 90% por 5+ minutos
  - Memory usage > 85%
  - Disk usage > 80%
  - Job failure rate > 10%
  - Average job time > 5 minutos
  
Logs:
  - Error rates por endpoint
  - Job completion times
  - Resource utilization
  - Redis memory usage
```

### **Dashboards Recomendados:**
- **Grafana** com Prometheus metrics
- **Bull Dashboard** para visualização de filas
- **Docker stats** para containers
- **Application logs** centralizados (ELK stack)

---

## 🔄 Estratégias de Scaling

### **Horizontal Scaling:**
```bash
# Múltiplas instâncias da API
docker-compose -f docker-compose.production.yml up --scale ffmpeg-api=3

# Load balancer (nginx)
upstream ffmpeg_api {
    server ffmpeg-api_1:3000;
    server ffmpeg-api_2:3000;
    server ffmpeg-api_3:3000;
}
```

### **Vertical Scaling:**
- Aumentar CPU/RAM do servidor
- Usar storage mais rápido (NVMe)
- Otimizar configurações Redis
- Ajustar concorrência Bull Queue

### **Auto-scaling (Cloud):**
```yaml
# Kubernetes HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ffmpeg-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ffmpeg-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

## 🧪 Scripts de Teste

### **Usar o Script de Performance:**
```bash
# Teste básico local (10 jobs)
./scripts/performance-analysis.sh

# Teste de carga (30 jobs, 120s)
./scripts/performance-analysis.sh http://localhost:3000 30 120

# Apenas análise (sem executar testes)
./scripts/performance-analysis.sh http://localhost:3000 0 0 --analysis-only

# Teste em produção
./scripts/performance-analysis.sh https://sua-api.com 50 300
```

### **Interpretação dos Resultados:**
- **Taxa de sucesso > 95%**: Configuração adequada
- **Tempo médio < 30s**: Performance aceitável
- **Throughput**: Comparar com necessidades do negócio
- **Uso de recursos**: CPU/RAM abaixo de 80% sustentável

---

## 💰 Análise de Custos

### **Custos Mensais Estimados (Cloud):**

| Provider | Configuração | Custo/mês | Performance |
|----------|--------------|-----------|-------------|
| **AWS** | c5.2xlarge | ~$250 | 20 jobs simultâneos |
| **AWS** | c5.4xlarge | ~$500 | 30 jobs simultâneos |
| **AWS** | c5.9xlarge | ~$1,100 | 50+ jobs simultâneos |
| **GCP** | c2-standard-8 | ~$200 | 20 jobs simultâneos |
| **GCP** | c2-standard-16 | ~$400 | 30 jobs simultâneos |
| **DigitalOcean** | CPU-Opt 16 vCPU | ~$320 | 30 jobs simultâneos |

*Custos não incluem storage, bandwidth e outros serviços*

---

## 🎯 Recomendação Final

### **Para começar (desenvolvimento/teste):**
- **Local/VPS**: 8 cores, 16GB RAM, SSD
- **Concorrência**: 8-12 jobs simultâneos
- **Custo**: $100-200/mês

### **Para produção (20-30 jobs):**
- **Cloud**: c5.4xlarge (AWS) ou equivalente
- **Concorrência**: 12-16 jobs simultâneos
- **Custo**: $400-600/mês

### **Para alta demanda (50+ jobs):**
- **Bare metal** ou instâncias high-compute
- **Clustering**: Múltiplas instâncias + load balancer
- **Custo**: $800-1500/mês

**A configuração atual do seu projeto já está bem otimizada para escalar horizontalmente!** 🚀 