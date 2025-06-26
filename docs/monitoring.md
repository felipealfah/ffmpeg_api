# 📊 Sistema de Monitoramento - FFmpeg API

## 🎯 **Visão Geral**

O sistema de monitoramento da FFmpeg API utiliza a stack **Prometheus + Grafana** para coleta, armazenamento e visualização de métricas em tempo real. O sistema é completamente containerizado e pronto para produção.

---

## 🏗️ **Arquitetura**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   FFmpeg API    │───▶│   Prometheus    │───▶│    Grafana      │
│   (Métricas)    │    │   (Coleta)      │    │ (Visualização)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
      :3000                   :9090                  :3001
```

### **Componentes:**

1. **FFmpeg API** - Expõe métricas via `/metrics`
2. **Prometheus** - Coleta métricas a cada 15 segundos
3. **Grafana** - Dashboard para visualização
4. **Redis** - Fila de jobs (métricas opcionais)

---

## 📊 **Métricas Coletadas**

### **🌐 HTTP/API Metrics:**
- `http_requests_total` - Total de requests HTTP
- `http_request_duration_seconds` - Duração dos requests
- `http_requests_active` - Requests ativos no momento

### **🎬 FFmpeg Job Metrics:**
- `ffmpeg_jobs_active` - Jobs ativos por status
- `ffmpeg_jobs_total` - Total de jobs processados
- `ffmpeg_job_duration_seconds` - Tempo de processamento
- `ffmpeg_jobs_by_age` - Jobs por faixa etária

### **💾 Storage Metrics:**
- `storage_directories_count` - Número de diretórios
- `cleanup_operations_total` - Operações de limpeza

### **⚙️ System Metrics (Node.js):**
- `process_cpu_seconds_total` - Uso de CPU
- `process_resident_memory_bytes` - Uso de memória
- `nodejs_eventloop_lag_seconds` - Lag do event loop
- `nodejs_gc_duration_seconds` - Duração do garbage collector

---

## 🚀 **Como Usar**

### **1. Iniciar Stack Completa:**

```bash
# Subir todos os serviços (API + Prometheus + Grafana)
docker-compose up -d

# Verificar status
docker-compose ps
```

### **2. Acessar Serviços:**

| Serviço | URL | Credenciais |
|---------|-----|-------------|
| **API** | http://localhost:3000 | - |
| **Métricas** | http://localhost:3000/metrics | - |
| **Prometheus** | http://localhost:9090 | - |
| **Grafana** | http://localhost:3001 | admin / admin123 |

### **3. Testar Sistema:**

```bash
# Teste completo do monitoramento
./scripts/test-monitoring.sh

# Gerar carga na API
./scripts/create-test-job.sh
./scripts/test-cleanup.sh
```

---

## 📈 **Dashboard Grafana**

### **Painéis Disponíveis:**

1. **📊 API Overview**
   - Requests por segundo
   - Jobs ativos
   - CPU e memória

2. **🌐 HTTP Metrics**
   - Taxa de requests
   - Tempos de resposta (percentis)
   - Taxa de erros

3. **🎬 FFmpeg Jobs**
   - Status dos jobs (pie chart)
   - Tempo de processamento
   - Jobs por idade

4. **💾 System Health**
   - Event loop lag
   - Garbage collection
   - Diretórios de storage

### **Configuração Automática:**
- ✅ Datasource do Prometheus configurado automaticamente
- ✅ Dashboard importado na inicialização
- ✅ Refresh automático a cada 30 segundos

---

## ⚙️ **Configuração**

### **Prometheus (`monitoring/prometheus.yml`):**

```yaml
scrape_configs:
  - job_name: 'ffmpeg-api'
    static_configs:
      - targets: ['ffmpeg-api:3000']
    scrape_interval: 15s
```

### **Grafana:**
- **Datasource:** Prometheus automático
- **Dashboard:** Importado via provisioning
- **Retenção:** 200 horas no Prometheus

### **Métricas da API:**
- **Endpoint:** `/metrics` (formato Prometheus)
- **Coleta:** Automática via middleware
- **Atualização:** Em tempo real

---

## 🔧 **Desenvolvimento**

### **Adicionar Nova Métrica:**

```typescript
// 1. Definir métrica em src/middleware/metrics.ts
export const minhaMetrica = new promClient.Counter({
  name: 'minha_metrica_total',
  help: 'Descrição da métrica',
  labelNames: ['label1', 'label2'],
});

// 2. Usar no código
minhaMetrica.inc({ label1: 'valor1', label2: 'valor2' });
```

### **Atualizar Dashboard:**
1. Editar `monitoring/grafana/dashboards/ffmpeg-api-dashboard.json`
2. Reiniciar Grafana: `docker-compose restart grafana`

---

## 📊 **Exemplos de Queries Prometheus**

### **Performance:**
```promql
# Taxa de requests por segundo
rate(http_requests_total[5m])

# Percentil 95 de tempo de resposta
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Jobs falhados na última hora
increase(ffmpeg_jobs_total{status="failed"}[1h])
```

### **Alertas Sugeridos:**
```promql
# Alta taxa de erro (>5%)
rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05

# Alto uso de CPU (>80%)
rate(process_cpu_seconds_total[5m]) * 100 > 80

# Event loop lag alto (>100ms)
nodejs_eventloop_lag_seconds > 0.1
```

---

## 🚨 **Troubleshooting**

### **Problema: Métricas não aparecem**
```bash
# Verificar endpoint
curl http://localhost:3000/metrics

# Verificar logs da API
docker-compose logs ffmpeg-api

# Verificar configuração do Prometheus
curl http://localhost:9090/targets
```

### **Problema: Grafana não carrega dashboard**
```bash
# Verificar logs
docker-compose logs grafana

# Recriar volumes
docker-compose down -v
docker-compose up -d
```

### **Problema: Prometheus não coleta métricas**
```bash
# Verificar conectividade
docker-compose exec prometheus wget -qO- http://ffmpeg-api:3000/metrics

# Verificar configuração
docker-compose exec prometheus cat /etc/prometheus/prometheus.yml
```

---

## 📋 **Checklist de Produção**

### **✅ Segurança:**
- [ ] Alterar senha padrão do Grafana
- [ ] Configurar autenticação
- [ ] Restringir acesso às portas

### **✅ Performance:**
- [ ] Configurar retenção adequada no Prometheus
- [ ] Ajustar intervalo de scrape conforme necessidade
- [ ] Monitorar uso de disco

### **✅ Backup:**
- [ ] Backup dos dashboards Grafana
- [ ] Backup das configurações Prometheus
- [ ] Configurar alertas importantes

---

## 🔗 **Links Úteis**

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Node.js prom-client](https://github.com/siimon/prom-client)
- [Prometheus Query Examples](https://prometheus.io/docs/prometheus/latest/querying/examples/)

---

## 📈 **Próximos Passos**

1. **Alerting:** Configurar Alertmanager para notificações
2. **Logs:** Integrar ELK Stack ou Loki para logs
3. **Tracing:** Adicionar Jaeger para distributed tracing
4. **APM:** Considerar New Relic/Datadog para produção enterprise

---

*Sistema de monitoramento implementado com sucesso! 🎉* 