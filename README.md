# FFmpeg API

API para processamento de vídeos usando FFmpeg, com documentação Swagger integrada.

## Funcionalidades

- Renderização de vídeos com múltiplas trilhas e clipes
- Suporte para diferentes formatos de saída (MP4, MOV, GIF, HLS)
- Sobreposição de texto e imagens
- Aplicação de filtros e efeitos
- Informações detalhadas sobre arquivos de mídia

## Requisitos

- Node.js 18+
- FFmpeg instalado no sistema
- Redis (para o sistema de filas)

## Instalação

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/ffmpeg-api.git
cd ffmpeg-api
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente (crie um arquivo `.env`):
```
PORT=3000
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
REDIS_URL=redis://localhost:6379
```

4. Compile o TypeScript:
```bash
npm run build
```

## Uso

### Iniciar o servidor

```bash
npm start
```

Para desenvolvimento com reinicialização automática:
```bash
npm run dev
```

Para iniciar apenas a documentação Swagger:
```bash
npm run docs
```

### Acessar a documentação

Acesse a documentação Swagger em:
```
http://localhost:3000/api-docs
```

## Endpoints da API

### Renderização de Vídeos

- `POST /api/v1/media/render` - Criar um job de renderização
- `GET /api/v1/media/render/{jobId}` - Verificar status de um job
- `GET /api/v1/media/render/{jobId}/result` - Obter resultado de um job
- `GET /api/v1/media/render/{jobId}/file` - Baixar arquivo de saída

### Informações de Mídia

- `POST /api/v1/media/info` - Obter informações de mídia

## Exemplos

### Criar um job de renderização

```bash
curl -X POST http://localhost:3000/api/v1/media/render \
  -H "Content-Type: application/json" \
  -d '{
    "timeline": {
      "tracks": [
        {
          "clips": [
            {
              "asset": {
                "type": "video",
                "source": "url",
                "src": "https://example.com/video.mp4"
              },
              "start": 0,
              "length": 10
            }
          ]
        }
      ]
    },
    "output": {
      "format": "mp4",
      "resolution": "1280x720",
      "quality": "high"
    }
  }'
```

### Verificar status de um job

```bash
curl http://localhost:3000/api/v1/media/render/123e4567-e89b-12d3-a456-426614174000
```

### Obter informações de mídia

```bash
curl -X POST http://localhost:3000/api/v1/media/info \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/video.mp4"
  }'
```

## Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes. 