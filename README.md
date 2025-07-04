# FFmpeg API

API para processamento de vídeo usando FFmpeg, com suporte a múltiplas trilhas, áudios, imagens e legendas.

## 📚 Exemplos de Composições

Aqui você encontra exemplos práticos de diferentes tipos de vídeos que podem ser criados com a API.

### 1. Apresentação com Imagem Estática e Áudio

Ideal para criar vídeos de podcast, apresentações ou conteúdo educacional.

```json
{
  "timeline": {
    "tracks": [
      {
        "clips": [
          {
            "asset": {
              "type": "image",
              "source": "url",
              "src": "https://exemplo.com/background.jpg"
            },
            "start": 0,
            "length": 300 // 5 minutos
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "audio",
              "source": "url",
              "src": "https://exemplo.com/narracao.mp3"
            },
            "start": 0,
            "length": 300
          },
          {
            "asset": {
              "type": "audio",
              "source": "url",
              "src": "https://exemplo.com/musica-fundo.mp3",
              "isBackground": true,
              "volume": 0.2
            },
            "start": 0,
            "length": 300
          }
        ]
      }
    ]
  },
  "output": {
    "format": "mp4",
    "resolution": "1920x1080",
    "quality": "high",
    "fps": 30
  }
}
```

### 2. Vídeo com Legendas e Música de Fundo

Perfeito para conteúdo internacional ou acessibilidade.

```json
{
  "timeline": {
    "tracks": [
      {
        "clips": [
          {
            "asset": {
              "type": "video",
              "source": "url",
              "src": "https://exemplo.com/video-principal.mp4"
            },
            "start": 0,
            "length": 180 // 3 minutos
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "audio",
              "source": "url",
              "src": "https://exemplo.com/ambient-music.mp3",
              "isBackground": true,
              "volume": 0.3
            },
            "start": 0,
            "length": 180
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "subtitle",
              "source": "url",
              "src": "https://exemplo.com/legendas.srt",
              "style": {
                "fontSize": 42,
                "fontColor": "#FFFFFF",
                "outlineColor": "#000000",
                "bold": true,
                "alignment": "center",
                "position": "bottom",
                "marginV": 50
              }
            },
            "start": 0,
            "length": 180
          }
        ]
      }
    ]
  },
  "output": {
    "format": "mp4",
    "resolution": "1280x720",
    "quality": "high",
    "fps": 30
  }
}
```

### 3. Concatenação de Vídeos com Transição

Útil para criar compilações ou juntar múltiplos clipes.

```json
{
  "timeline": {
    "tracks": [
      {
        "clips": [
          {
            "asset": {
              "type": "video",
              "source": "url",
              "src": "https://exemplo.com/parte1.mp4"
            },
            "start": 0,
            "length": 60
          },
          {
            "asset": {
              "type": "video",
              "source": "url",
              "src": "https://exemplo.com/parte2.mp4"
            },
            "start": 60,
            "length": 60
          },
          {
            "asset": {
              "type": "video",
              "source": "url",
              "src": "https://exemplo.com/parte3.mp4"
            },
            "start": 120,
            "length": 60
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "audio",
              "source": "url",
              "src": "https://exemplo.com/background-music.mp3",
              "isBackground": true
            },
            "start": 0,
            "length": 180
          }
        ]
      }
    ]
  },
  "output": {
    "format": "mp4",
    "resolution": "1920x1080",
    "quality": "high",
    "fps": 30
  }
}
```

### 4. Slideshow de Imagens com Narração

Ideal para apresentações, documentários ou conteúdo educacional.

```json
{
  "timeline": {
    "tracks": [
      {
        "clips": [
          {
            "asset": {
              "type": "image",
              "source": "url",
              "src": "https://exemplo.com/slide1.jpg"
            },
            "start": 0,
            "length": 10
          },
          {
            "asset": {
              "type": "image",
              "source": "url",
              "src": "https://exemplo.com/slide2.jpg"
            },
            "start": 10,
            "length": 10
          },
          {
            "asset": {
              "type": "image",
              "source": "url",
              "src": "https://exemplo.com/slide3.jpg"
            },
            "start": 20,
            "length": 10
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "audio",
              "source": "url",
              "src": "https://exemplo.com/narracao.mp3"
            },
            "start": 0,
            "length": 30
          },
          {
            "asset": {
              "type": "audio",
              "source": "url",
              "src": "https://exemplo.com/musica-suave.mp3",
              "isBackground": true,
              "volume": 0.15
            },
            "start": 0,
            "length": 30
          }
        ]
      }
    ]
  },
  "output": {
    "format": "mp4",
    "resolution": "1920x1080",
    "quality": "high",
    "fps": 30
  }
}
```

### 5. Vídeo com Texto Sobreposto

Perfeito para tutoriais, legendas personalizadas ou títulos.

```json
{
  "timeline": {
    "tracks": [
      {
        "clips": [
          {
            "asset": {
              "type": "video",
              "source": "url",
              "src": "https://exemplo.com/tutorial.mp4"
            },
            "start": 0,
            "length": 120
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "text",
              "text": "Tutorial: Como Criar Vídeos Incríveis",
              "style": {
                "fontSize": 48,
                "fontColor": "#FFFFFF",
                "outlineColor": "#000000",
                "bold": true,
                "alignment": "center",
                "position": "top",
                "marginV": 30
              }
            },
            "start": 0,
            "length": 5
          }
        ]
      },
      {
        "clips": [
          {
            "asset": {
              "type": "audio",
              "source": "url",
              "src": "https://exemplo.com/tutorial-audio.mp3"
            },
            "start": 0,
            "length": 120
          }
        ]
      }
    ]
  },
  "output": {
    "format": "mp4",
    "resolution": "1280x720",
    "quality": "high",
    "fps": 30
  }
}
```

## 💡 Dicas de Uso

1. **Áudio de Fundo**
   - Use `isBackground: true` para músicas de fundo
   - Ajuste o volume entre 0.1 e 0.3 para não interferir com o áudio principal
   - Para loops suaves, escolha músicas com início e fim que combinam bem

2. **Imagens**
   - Use imagens com resolução igual ou maior que o vídeo final
   - Formatos recomendados: JPG para fotos, PNG para gráficos com transparência
   - Para slideshows, mantenha as imagens na mesma proporção

3. **Legendas**
   - Use fonte tamanho 42 para vídeos 1080p
   - Adicione outline (contorno) para melhor legibilidade
   - Mantenha o texto centralizado para melhor experiência

4. **Vídeos**
   - Use a mesma resolução e FPS em todos os clipes para melhor qualidade
   - Para transições suaves, considere um pequeno overlap entre clipes
   - Verifique se todos os vídeos têm áudio antes de adicionar música de fundo

## 🎵 Recursos de Áudio

### Áudio de Fundo (Background Audio)

A API oferece suporte especial para áudios de fundo, que são processados com volume reduzido e podem ser automaticamente repetidos para cobrir a duração total do vídeo.

#### Como Definir um Áudio de Fundo

Existem duas formas de indicar que um áudio é de fundo:

1. **Explicitamente**: Usando a propriedade `isBackground` no asset de áudio
```json
{
  "asset": {
    "type": "audio",
    "source": "url",
    "src": "https://example.com/music.mp3",
    "isBackground": true,
    "volume": 0.3  // Opcional: ajuste fino do volume (0.0 a 1.0)
  }
}
```

2. **Implicitamente**: Incluindo palavras-chave no nome do arquivo
   - Palavras-chave suportadas: 'background', 'bg', 'fundo', 'ambient'
   - Exemplo: `music-background.mp3`, `ambient-sound.mp3`

#### Características do Áudio de Fundo

- Volume reduzido automaticamente (30% por padrão)
- Loop automático se menor que a duração do vídeo
- Transições suaves entre loops
- Mixagem balanceada com áudios principais

#### Volumes Padrão

- Áudios principais: 80% (0.8)
- Áudios de fundo: 30% (0.3)
- Você pode ajustar estes valores usando a propriedade `volume`

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