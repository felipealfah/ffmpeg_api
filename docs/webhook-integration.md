# 🔔 Integração com Webhook - n8n

## Visão Geral

O sistema de webhook permite que você seja notificado automaticamente quando a renderização de um vídeo for concluída ou falhar. Isso é perfeito para integração com n8n e outros sistemas de automação.

## Como Funciona

1. **Envie uma requisição de renderização** incluindo o campo `webhook` com a URL do seu endpoint
2. **A API processa o vídeo** em segundo plano
3. **Quando a renderização terminar** (sucesso ou erro), a API fará um POST para sua URL webhook
4. **Seu n8n recebe a notificação** com todos os dados do job

## Payload do Webhook

### ✅ Sucesso

```json
{
  "jobId": "70af79f0-ea11-422d-9584-ea3cd645e036",
  "status": "completed",
  "outputUrl": "https://storage.googleapis.com/ffmpeg-api/renders/70af79f0-ea11-422d-9584-ea3cd645e036/2025-06-16T12-28-56-109Z_output.mp4",
  "metadata": {
    "format": "mp4",
    "resolution": "1280x720",
    "quality": "medium",
    "fps": 30,
    "storageType": "gcs"
  },
  "completedAt": "2025-06-16T12:29:45.123Z"
}
```

### ❌ Erro

```json
{
  "jobId": "70af79f0-ea11-422d-9584-ea3cd645e036",
  "status": "failed",
  "error": "Error during video processing: Invalid input format",
  "failedAt": "2025-06-16T12:29:45.123Z"
}
```

## Exemplo de Uso

### Requisição com Webhook

```bash
curl -X POST http://localhost:3000/api/v1/media/render \
  -H "Content-Type: application/json" \
  -d '{
    "timeline": {
      "tracks": [{
        "clips": [{
          "asset": {
            "type": "image",
            "source": "url",
            "src": "https://picsum.photos/800/600"
          },
          "start": 0,
          "length": 5
        }]
      }]
    },
    "output": {
      "format": "mp4",
      "resolution": "1280x720",
      "quality": "medium",
      "fps": 30
    },
    "webhook": "https://webhook.site/your-unique-url"
  }'
```

### Resposta Imediata

```json
{
  "data": {
    "jobId": "70af79f0-ea11-422d-9584-ea3cd645e036",
    "status": "queued"
  }
}
```

## Configuração no n8n

### 1. Webhook Trigger

1. **Adicione um nó "Webhook"** no seu workflow n8n
2. **Configure o método**: POST
3. **Configure o endpoint**: `/webhook/ffmpeg-complete` (ou qualquer path que você preferir)
4. **Copie a URL gerada** pelo n8n

### 2. Processamento da Resposta

Exemplo de workflow n8n:

```
[Webhook Trigger] → [Switch] → [Email/Slack/Database]
                      ↓
                   status == "completed" → Processo sucesso
                   status == "failed"    → Processo erro
```

### 3. Exemplo de Switch Node

```javascript
// Expressão para o Switch
$json.status === "completed"
```

### 4. Nó de Sucesso

Quando `status === "completed"`, você tem acesso a:

- `$json.jobId` - ID do job
- `$json.outputUrl` - URL pública do vídeo
- `$json.metadata.format` - Formato do vídeo
- `$json.metadata.resolution` - Resolução
- `$json.completedAt` - Timestamp de conclusão

### 5. Nó de Erro

Quando `status === "failed"`, você tem acesso a:

- `$json.jobId` - ID do job
- `$json.error` - Mensagem de erro
- `$json.failedAt` - Timestamp da falha

## Configurações Avançadas

### Timeout

O webhook tem um timeout de **10 segundos**. Se o seu endpoint n8n não responder em 10 segundos, a tentativa falhará (mas o job principal não será afetado).

### Headers

O webhook envia os seguintes headers:

```
Content-Type: application/json
User-Agent: FFmpeg-API-Webhook/1.0
```

### Retry

Atualmente, não há retry automático. Se o webhook falhar, apenas um log de erro será registrado.

## Testando o Webhook

### 1. Use webhook.site

1. Vá para [https://webhook.site](https://webhook.site)
2. Copie a URL única gerada
3. Use essa URL no campo `webhook` da sua requisição
4. Veja as requisições chegando em tempo real

### 2. Use ngrok para teste local

```bash
# Instale ngrok se não tiver
npm install -g ngrok

# Exponha seu n8n local
ngrok http 5678

# Use a URL gerada pelo ngrok no webhook
```

## Segurança

### Verificação de Origem

Para verificar se o webhook veio realmente da sua API, você pode:

1. **Verificar o User-Agent**: `FFmpeg-API-Webhook/1.0`
2. **Implementar assinatura HMAC** (futuro enhancement)
3. **Usar HTTPS** sempre em produção

### Exemplo de Verificação no n8n

```javascript
// No seu workflow n8n, adicione um nó "If" para verificar:
$headers["user-agent"] === "FFmpeg-API-Webhook/1.0"
```

## Troubleshooting

### Webhook não dispara

1. **Verifique os logs** do servidor FFmpeg API
2. **Teste a URL** manualmente com curl
3. **Verifique se o n8n está rodando** e acessível

### Webhook dispara mas n8n não processa

1. **Verifique o formato** do payload
2. **Teste com webhook.site** primeiro
3. **Verifique os logs** do n8n

### Timeout no webhook

1. **Verifique se o endpoint responde rapidamente**
2. **Considere processamento assíncrono** no n8n
3. **Use um webhook intermediário** se necessário

## Exemplo Completo de Workflow n8n

```json
{
  "name": "FFmpeg Video Processing",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "httpMethod": "POST",
        "path": "ffmpeg-complete"
      }
    },
    {
      "name": "Check Status",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.status}}",
              "operation": "equal",
              "value2": "completed"
            }
          ]
        }
      }
    },
    {
      "name": "Send Success Email",
      "type": "n8n-nodes-base.emailSend",
      "parameters": {
        "subject": "Video Ready!",
        "text": "Your video is ready: {{$json.outputUrl}}"
      }
    },
    {
      "name": "Log Error",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "console.log('Video processing failed:', $json.error);\nreturn $json;"
      }
    }
  ]
}
```

---

## 🚀 Próximos Passos

Com o webhook implementado, você pode:

1. **Automatizar notificações** via email/Slack quando vídeos ficarem prontos
2. **Atualizar bancos de dados** com o status e URL do vídeo
3. **Disparar outros processos** baseados na conclusão da renderização
4. **Implementar retry logic** no n8n para falhas
5. **Criar dashboards** de monitoramento dos jobs

O sistema está pronto para integração completa com seu workflow n8n! 🎉 