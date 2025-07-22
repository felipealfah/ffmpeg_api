#!/bin/bash

# Criar diretórios necessários
mkdir -p grafana/provisioning/{notifiers,alerting}

# Garantir permissões corretas
chmod -R 755 grafana/provisioning

echo "✅ Diretórios de monitoramento configurados com sucesso!" 