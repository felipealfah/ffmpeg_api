#!/bin/sh
set -e

# Garantir que os diretórios existam
mkdir -p /app/storage/temp /app/storage/output

# Ajustar permissões dos diretórios
chown -R appuser:appuser /app/storage

# Executar o comando original (npm start)
exec "$@" 