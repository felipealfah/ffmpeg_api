#!/bin/bash

# Script para criar jobs de teste e verificar limpeza
# Usage: ./scripts/create-test-job.sh [API_BASE]

API_BASE=${1:-"http://localhost:3000"}

echo "🚀 Criando job de teste na API: $API_BASE"
echo "================================================"

# JSON do job de teste
TEST_JOB=$(cat << 'EOF'
{
  "timeline": {
    "tracks": [
      {
        "clips": [
          {
            "start": 0,
            "length": 5,
            "asset": {
              "type": "image",
              "source": "url",
              "src": "https://images.squarespace-cdn.com/content/v1/5148b380e4b0106646129f8e/1501243003297-2O5ZT6C35Z6CPAR70GY6/0001-es-la-biblia-inspirada-por-dios-parte-2.jpg"
            }
          }
        ]
      },
      {
        "clips": [
          {
            "start": 0,
            "length": 5,
            "asset": {
              "type": "audio",
              "source": "url",
              "src": "https://menshealth.expert/wp-content/uploads/2025/06/audio-6.mp3"
            }
          }
        ]
      }
    ]
  },
  "output": {
    "format": "mp4",
    "resolution": "1280x720",
    "quality": "medium"
  }
}
EOF
)

# Criar job
echo "📤 Criando job de renderização..."
response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
    -X POST "$API_BASE/api/v1/media/render" \
    -H "Content-Type: application/json" \
    -d "$TEST_JOB")

http_code=$(echo $response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
body=$(echo $response | sed -e 's/HTTPSTATUS:.*//g')

if [ $http_code -eq 201 ]; then
    echo "✅ Job criado com sucesso! Status: $http_code"
    job_id=$(echo "$body" | jq -r '.data.jobId' 2>/dev/null)
    echo "🆔 Job ID: $job_id"
    echo "$body" | jq . 2>/dev/null || echo "$body"
    
    echo
    echo "⏳ Aguardando processamento (15 segundos)..."
    sleep 15
    
    echo
    echo "📊 Verificando estatísticas após processamento..."
    curl -s "$API_BASE/api/v1/admin/storage/stats" | jq . 2>/dev/null
    
else
    echo "❌ Erro ao criar job! Status: $http_code"
    echo "$body" | jq . 2>/dev/null || echo "$body"
fi

echo
echo "🏁 Teste concluído!" 