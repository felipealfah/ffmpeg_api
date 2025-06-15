# FFmpeg API

API para processamento de mídia usando FFmpeg com suporte a composições de vídeo, áudio, imagens e legendas.

## Recursos

- ✅ Renderização de vídeos com múltiplas trilhas
- ✅ Suporte a imagens, vídeos, áudios e legendas
- ✅ Mixagem automática de áudio
- ✅ Cálculo automático de duração
- ✅ Processamento assíncrono com filas
- ✅ Suporte a legendas SRT com estilos customizáveis

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

## Uso Básico

### Renderização com Legendas

```bash
curl -X POST http://localhost:3000/api/v1/media/render \
  -H "Content-Type: application/json" \
  -d '{
    "timeline": {
      "tracks": [
        {
          "clips": [{
            "asset": {
              "type": "image",
              "source": "url",
              "src": "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1280&h=720&fit=crop"
            },
            "start": 0,
            "length": 30
          }]
        },
        {
          "clips": [{
            "asset": {
              "type": "audio",
              "source": "url",
              "src": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
            },
            "start": 0,
            "length": 30
          }]
        },
        {
          "clips": [{
            "asset": {
              "type": "subtitle",
              "source": "url",
              "src": "https://example.com/subtitles.srt",
              "style": {
                "fontSize": 36,
                "fontColor": "#FFFFFF",
                "outlineColor": "#000000",
                "bold": true,
                "alignment": "center",
                "position": "bottom"
              }
            },
            "start": 0,
            "length": 30
          }]
        }
      ]
    },
    "output": {
      "format": "mp4",
      "resolution": "1280x720",
      "quality": "medium",
      "fps": 30
    }
  }'
```

### Tipos de Assets Suportados

#### Legendas (SRT)
```json
{
  "asset": {
    "type": "subtitle",
    "source": "url",
    "src": "https://example.com/subtitles.srt",
    "style": {
      "fontFamily": "DejaVu Serif",
      "fontSize": 42,
      "fontColor": "#FFFFFF",
      "outlineColor": "#404040",
      "backgroundColor": "#000000",
      "alignment": "center",
      "position": "bottom",
      "marginV": 100,
      "outline": 3,
      "shadow": 1,
      "bold": true,
      "italic": false
    }
  },
  "start": 0,
  "length": 30
}
```

#### Opções de Estilo para Legendas

- `fontFamily`: Família da fonte (padrão: "DejaVu Serif")
- `fontSize`: Tamanho da fonte em pixels (padrão: 42)
- `fontColor`: Cor da fonte em hex (padrão: "#FFFFFF")
- `outlineColor`: Cor do contorno em hex (padrão: "#404040")
- `backgroundColor`: Cor de fundo (opcional)
- `alignment`: Alinhamento horizontal - "left", "center", "right" (padrão: "center")
- `position`: Posição vertical - "top", "center", "bottom" (padrão: "bottom")
- `marginV`: Margem vertical em pixels (padrão: 100)
- `outline`: Espessura do contorno (padrão: 3)
- `shadow`: Offset da sombra (padrão: 1)
- `bold`: Texto em negrito (padrão: false)
- `italic`: Texto em itálico (padrão: false)

### Exemplo de Arquivo SRT

```srt
1
00:00:00,000 --> 00:00:05,000
Primeira legenda do vídeo

2
00:00:05,000 --> 00:00:10,000
Segunda legenda com mais texto
para demonstrar quebras de linha

3
00:00:10,000 --> 00:00:15,000
Terceira e última legenda
```

## Endpoints

- `POST /api/v1/media/render` - Renderizar vídeo
- `GET /api/v1/media/{jobId}/status` - Status do job
- `GET /api/v1/media/{jobId}/result` - Download do vídeo
- `GET /health` - Health check

## Integração com n8n

Para usar com n8n via Docker, use `host.docker.internal:3000` como URL da API.

## Recursos Avançados

- Múltiplas imagens com transições automáticas
- Mixagem automática de múltiplos áudios
- Cálculo automático de duração baseado nos clips
- Suporte a legendas SRT com estilos customizáveis
- Processamento assíncrono com Bull Queue

## Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes. 