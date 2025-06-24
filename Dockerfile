FROM node:20-slim

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Criar usuário não-root para segurança
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências primeiro (para cache do Docker)
COPY package*.json ./

# Instalar dependências de produção
RUN npm ci --only=production && npm cache clean --force

# Copiar código fonte
COPY . .

# Compilar TypeScript
RUN npm run build

# Criar diretórios necessários e ajustar permissões
RUN mkdir -p storage/temp storage/output && \
    chown -R appuser:appuser /app

# Mudar para usuário não-root
USER appuser

# Expor porta
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Comando para iniciar a aplicação
CMD ["npm", "start"] 