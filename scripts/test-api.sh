#!/bin/bash

# Script de teste para as funcionalidades de limpeza da API FFmpeg
# Usage: ./scripts/test-api.sh [local|server]

API_BASE=${1:-"http://localhost:3000"}

echo "🧪 Testando API FFmpeg - Base URL: $API_BASE"
echo "================================================"

# Função para teste com status HTTP
test_endpoint() {
    local method=$1
    local url=$2
    local data=$3
    local description=$4
    
    echo
    echo "🔍 $description"
    echo "📡 $method $url"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$API_BASE$url")
    else
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" "$API_BASE$url" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    http_code=$(echo $response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    body=$(echo $response | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ $http_code -eq 200 ] || [ $http_code -eq 201 ]; then
        echo "✅ Status: $http_code"
        echo "$body" | jq . 2>/dev/null || echo "$body"
    else
        echo "❌ Status: $http_code"
        echo "$body" | jq . 2>/dev/null || echo "$body"
    fi
}

# Teste 1: Health Check
test_endpoint "GET" "/health" "" "Health Check"

# Teste 2: Estatísticas de Storage
test_endpoint "GET" "/api/v1/admin/storage/stats" "" "Estatísticas de Storage"

# Teste 3: Limpeza Manual (24 horas)
test_endpoint "POST" "/api/v1/admin/cleanup" '{"maxAgeHours": 24}' "Limpeza Manual (24h)"

# Teste 4: Limpeza Manual (1 hora)
test_endpoint "POST" "/api/v1/admin/cleanup" '{"maxAgeHours": 1}' "Limpeza Manual (1h)"

# Teste 5: Limpeza Manual (0 horas - tudo)
test_endpoint "POST" "/api/v1/admin/cleanup" '{"maxAgeHours": 0}' "Limpeza Manual (tudo)"

# Teste 6: Estatísticas após limpeza
test_endpoint "GET" "/api/v1/admin/storage/stats" "" "Estatísticas após Limpeza"

echo
echo "🏁 Testes concluídos!"
echo "================================================" 