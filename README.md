# FFmpeg API

API moderna e escalável para processamento de vídeo usando FFmpeg, construída com Node.js e TypeScript.

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/felipefull/ffmpeg_api)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/felipefull/ffmpeg_api)
[![License](https://img.shields.io/badge/license-MIT-green)](https://github.com/felipefull/ffmpeg_api)

## 🚀 Stack Tecnológica

- **Backend**: Node.js 18+ com TypeScript
- **Processamento**: FFmpeg 6.1+ com hardware acceleration
- **Fila**: Redis 7+ com Bull Queue
- **Banco de Dados**: File-based storage + Google Cloud Storage
- **Monitoramento**: Prometheus + Grafana
- **Documentação**: Mintlify
- **Deploy**: Docker + Docker Compose

## 📁 Estrutura do Projeto

```
ffmpeg_api/
├── src/                    # Código fonte da API
│   ├── controllers/        # Controladores REST
│   ├── services/          # Lógica de negócio
│   ├── middleware/        # Middlewares (auth, validation, metrics)
│   ├── routes/            # Definição de rotas
│   ├── config/            # Configurações da aplicação
│   └── types/             # Definições TypeScript
├── docs-site/             # Documentação Mintlify
│   ├── api-reference/     # Referência da API
│   ├── concepts/          # Conceitos e guias
│   └── examples/          # Exemplos de uso
├── monitoring/            # Configurações de monitoramento
│   ├── prometheus.yml     # Config do Prometheus
│   └── grafana/           # Dashboards do Grafana
├── storage/               # Armazenamento local
│   ├── temp/              # Arquivos temporários
│   └── output/            # Arquivos processados
└── scripts/               # Scripts de automação
```

## 🛠️ Configuração do Ambiente

### Pré-requisitos

- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Node.js**: 18+ (para desenvolvimento local)
- **FFmpeg**: 6.1+ (incluído no Docker)

### Instalação Rápida

```bash
# Clone o repositório
git clone https://github.com/felipefull/ffmpeg_api.git
cd ffmpeg_api

# Configure as variáveis de ambiente
cp env.example .env

# Suba todos os serviços
docker-compose up -d

# Verifique se todos os serviços estão rodando
docker-compose ps
```

### Configuração de Variáveis de Ambiente

```bash
# Configurações básicas
NODE_ENV=production
PORT=3000

# Redis (usado automaticamente pelo Docker Compose)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=secure_redis_password_2025

# Google Cloud Storage (opcional)
GOOGLE_CLOUD_STORAGE_ENABLED=true
GOOGLE_CLOUD_PROJECT_ID=seu-projeto-id
GOOGLE_CLOUD_BUCKET_NAME=seu-bucket
GOOGLE_CLOUD_KEY_FILE=src/config/gcp-service-account.json

# Limites de performance
MAX_CONCURRENT_JOBS=2
NODE_OPTIONS=--max-old-space-size=2048
```

## 🐳 Serviços Docker

O sistema roda 5 serviços principais:

| Serviço | Porta | Descrição | URL |
|---------|-------|-----------|-----|
| **API** | 3000 | API principal do FFmpeg | http://localhost:3000 |
| **Docs** | 3002 | Documentação interativa | http://localhost:3002 |
| **Grafana** | 3001 | Dashboard de monitoramento | http://localhost:3001 |
| **Prometheus** | 9090 | Coleta de métricas | http://localhost:9090 |
| **Redis** | - | Fila de processamento | (interno) |

### Comandos Docker Compose

```bash
# Subir todos os serviços
docker-compose up -d

# Ver logs de todos os serviços
docker-compose logs -f

# Ver logs de um serviço específico
docker-compose logs -f ffmpeg-api

# Parar todos os serviços
docker-compose down

# Rebuild e restart
docker-compose up -d --build

# Ver status dos serviços
docker-compose ps
```

## 📖 Documentação

### Acesso à Documentação

- **Documentação Completa**: http://localhost:3002
- **API Reference**: http://localhost:3000/api-docs (Swagger)
- **Monitoramento**: http://localhost:3001 (Grafana)

### Endpoints Principais

```bash
# Renderizar vídeo
POST /api/v1/media/render

# Status do job
GET /api/v1/media/status/:jobId

# Download do resultado
GET /api/v1/media/download/:jobId

# Informações do arquivo
GET /api/v1/media/info/:jobId

# Health check
GET /health
```

## 🎬 Exemplos de Uso

### 1. Renderização Básica

```bash
curl -X POST http://localhost:3000/api/v1/media/render \
  -H "Content-Type: application/json" \
  -d '{
    "timeline": {
      "clips": [
        {
          "type": "video",
          "src": "https://example.com/video.mp4",
          "start": 0,
          "duration": 10
        }
      ]
    },
    "output": {
      "format": "mp4",
      "resolution": "1920x1080"
    }
  }'
```

### 2. Verificar Status

```bash
curl http://localhost:3000/api/v1/media/status/job-id-123
```

### 3. Download do Resultado

```bash
curl -O http://localhost:3000/api/v1/media/download/job-id-123
```

## 🔧 Desenvolvimento

### Setup Local

```bash
# Instalar dependências
npm install

# Rodar em modo desenvolvimento
npm run dev

# Executar testes
npm test

# Build para produção
npm run build
```

### Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev          # Servidor com hot-reload
npm run build        # Build TypeScript
npm run start        # Servidor produção

# Testes
npm test            # Executar todos os testes
npm run test:watch  # Testes em modo watch

# Linting
npm run lint        # ESLint
npm run lint:fix    # Corrigir problemas automaticamente

# Documentação
cd docs-site && npm run dev  # Servidor de documentação
```

## 📊 Monitoramento

### Métricas Disponíveis

- **Jobs**: Total, ativos, completados, falhas
- **Performance**: Tempo de processamento, uso de CPU/memória
- **FFmpeg**: Processos, SIGKILL, recursos
- **Sistema**: Uptime, health checks

### Dashboards Grafana

1. **Overview**: Visão geral do sistema
2. **Jobs**: Métricas de processamento
3. **Performance**: CPU, memória, I/O
4. **Errors**: Logs de erro e alertas

### Acesso ao Grafana

- **URL**: http://localhost:3001
- **Usuário**: admin
- **Senha**: admin123

## 🚀 Deploy em Produção

### Configurações de Produção

```bash
# Variáveis de ambiente obrigatórias
NODE_ENV=production
REDIS_PASSWORD=senha-segura-redis
GOOGLE_CLOUD_PROJECT_ID=seu-projeto
GOOGLE_CLOUD_BUCKET_NAME=seu-bucket

# Limites de recursos
MAX_CONCURRENT_JOBS=4
NODE_OPTIONS=--max-old-space-size=4096
```

### Recursos Docker

```yaml
deploy:
  resources:
    limits:
      cpus: '4.0'
      memory: 3G
    reservations:
      cpus: '2.0'
      memory: 1G
```

## 🔒 Segurança

- **Redis**: Protegido com senha, não exposto externamente
- **CORS**: Configurado para domínios específicos
- **Rate Limiting**: Implementado para todas as rotas
- **Validation**: Validação rigorosa de inputs
- **Logs**: Monitoramento de segurança ativo

## 🐛 Troubleshooting

### Problemas Comuns

1. **SIGKILL no FFmpeg**: Verifique limites de memória
2. **Jobs travados**: Reinicie o serviço Redis
3. **Erro de upload**: Verifique configuração do Google Cloud
4. **Performance lenta**: Ajuste MAX_CONCURRENT_JOBS

### Logs Úteis

```bash
# Logs da API
docker-compose logs -f ffmpeg-api

# Logs do Redis
docker-compose logs -f redis

# Logs do sistema
docker-compose logs -f
```

### Health Checks

```bash
# API
curl http://localhost:3000/health

# Prometheus
curl http://localhost:9090/-/healthy

# Grafana
curl http://localhost:3001/api/health
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🔗 Links Úteis

- [Documentação Completa](http://localhost:3002)
- [API Reference](http://localhost:3000/api-docs)
- [Monitoramento](http://localhost:3001)
- [GitHub](https://github.com/felipefull/ffmpeg_api)

---

**Desenvolvido com ❤️ por Felipe Full** 