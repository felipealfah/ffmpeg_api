#!/bin/bash

# Script para build da imagem Docker FFmpeg API
# Uso: ./build-image.sh [tag]

# Definir tag (padrão: latest)
TAG=${1:-latest}
IMAGE_NAME="ffmpeg-api"

echo "🚀 Iniciando build da imagem Docker..."
echo "📦 Imagem: $IMAGE_NAME:$TAG"
echo ""

# Build da imagem
echo "🔨 Executando docker build..."
docker build -t $IMAGE_NAME:$TAG .

# Verificar se o build foi bem-sucedido
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build concluído com sucesso!"
    echo "📋 Imagem criada: $IMAGE_NAME:$TAG"
    echo ""
    echo "🔍 Informações da imagem:"
    docker images | grep $IMAGE_NAME
    echo ""
    echo "🚀 Para usar em produção:"
    echo "   docker-compose up -d"
    echo ""
    echo "📤 Para enviar para registry (opcional):"
    echo "   docker tag $IMAGE_NAME:$TAG seu-usuario/$IMAGE_NAME:$TAG"
    echo "   docker push seu-usuario/$IMAGE_NAME:$TAG"
else
    echo ""
    echo "❌ Erro no build da imagem!"
    exit 1
fi 