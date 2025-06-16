# Google Cloud Storage Integration

Esta documentação explica como configurar e usar o Google Cloud Storage (GCS) para armazenar os arquivos de output da API FFmpeg.

## 📋 Pré-requisitos

1. **Conta Google Cloud Platform (GCP)**
2. **Projeto GCP criado**
3. **Billing habilitado no projeto**
4. **API Cloud Storage habilitada**

## 🔧 Configuração

### 1. Criar Service Account

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Navegue para **IAM & Admin > Service Accounts**
3. Clique em **Create Service Account**
4. Preencha os dados:
   - **Name**: `ffmpeg-api-storage`
   - **Description**: `Service account for FFmpeg API storage operations`
5. Clique em **Create and Continue**
6. Adicione as seguintes roles:
   - `Storage Object Admin`
   - `Storage Bucket Reader`
7. Clique em **Done**

### 2. Gerar Chave de Autenticação

1. Na lista de Service Accounts, clique na conta criada
2. Vá para a aba **Keys**
3. Clique em **Add Key > Create new key**
4. Selecione **JSON** e clique em **Create**
5. Salve o arquivo JSON em local seguro (ex: `config/gcp-service-account.json`)

### 3. Criar Bucket

```bash
# Via gcloud CLI
gsutil mb gs://your-ffmpeg-api-bucket

# Ou via Console Web:
# Storage > Buckets > Create Bucket
```

**Configurações recomendadas:**
- **Location**: Escolha região próxima aos usuários
- **Storage Class**: Standard
- **Access Control**: Uniform (bucket-level)
- **Public Access**: Permitir (para URLs públicas)

### 4. Configurar Variáveis de Ambiente

Copie o arquivo `.env.example` para `.env` e configure:

```bash
# Configurações do Google Cloud Storage
GOOGLE_CLOUD_STORAGE_ENABLED=true
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_KEY_FILE=./config/gcp-service-account.json
GOOGLE_CLOUD_BUCKET_NAME=your-ffmpeg-api-bucket
```

## 🚀 Como Funciona

### Fluxo de Upload

1. **Renderização**: FFmpeg processa o vídeo localmente
2. **Upload**: Arquivo é enviado para o GCS automaticamente
3. **URL Pública**: Retorna URL pública do GCS
4. **Limpeza**: Arquivo local é removido após upload bem-sucedido

### Estrutura de Arquivos no Bucket

```
your-bucket/
├── renders/
│   ├── job-id-1/
│   │   └── 2024-06-15T12-30-00-000Z_output.mp4
│   ├── job-id-2/
│   │   └── 2024-06-15T12-35-00-000Z_output.mov
│   └── ...
```

### Metadados Armazenados

Cada arquivo inclui metadados:
- `jobId`: ID do job de renderização
- `format`: Formato do arquivo (mp4, mov, etc.)
- `resolution`: Resolução do vídeo
- `quality`: Qualidade da codificação
- `createdAt`: Timestamp de criação

## 📡 API Response

### Com GCS Habilitado

```json
{
  "data": {
    "jobId": "abc123",
    "status": "completed",
    "output": "https://storage.googleapis.com/your-bucket/renders/abc123/output.mp4",
    "storage": {
      "type": "gcs",
      "url": "https://storage.googleapis.com/your-bucket/renders/abc123/output.mp4",
      "fileName": "2024-06-15T12-30-00-000Z_output.mp4",
      "size": 1048576
    }
  }
}
```

### Fallback (GCS Desabilitado)

```json
{
  "data": {
    "jobId": "abc123",
    "status": "completed",
    "output": "/storage/output/abc123/output.mp4",
    "storage": {
      "type": "local",
      "url": "/storage/output/abc123/output.mp4",
      "fileName": "output.mp4"
    }
  }
}
```

## 🔒 Segurança

### URLs Públicas vs Assinadas

**URLs Públicas** (padrão):
- Acesso direto sem autenticação
- Ideais para conteúdo público
- Configuradas automaticamente

**URLs Assinadas** (opcional):
- Acesso temporário com expiração
- Ideais para conteúdo privado
- Podem ser geradas via API

### Exemplo de URL Assinada

```typescript
import { getStorageService } from './services/storageService';

const storageService = getStorageService();
const signedUrl = await storageService.generateSignedUrl(
  'renders/abc123/output.mp4',
  24 // expira em 24 horas
);
```

## 🛠️ Operações Avançadas

### Listar Arquivos

```typescript
const files = await storageService.listFiles('renders/');
console.log('Arquivos encontrados:', files);
```

### Obter Metadados

```typescript
const metadata = await storageService.getFileMetadata('renders/abc123/output.mp4');
console.log('Metadados:', metadata);
```

### Remover Arquivo

```typescript
await storageService.deleteFile('renders/abc123/output.mp4');
```

## 🔧 Troubleshooting

### Erro: "Service account not found"

**Solução**: Verifique se o arquivo JSON da service account está no caminho correto.

### Erro: "Bucket does not exist"

**Solução**: 
1. Verifique se o bucket foi criado
2. Confirme o nome do bucket nas variáveis de ambiente
3. Verifique se a service account tem acesso ao bucket

### Erro: "Permission denied"

**Solução**: Verifique se a service account tem as roles necessárias:
- `Storage Object Admin`
- `Storage Bucket Reader`

### Upload Lento

**Soluções**:
1. Escolha região GCS próxima ao servidor
2. Considere usar upload multipart para arquivos grandes
3. Verifique largura de banda da rede

## 💰 Custos

### Estimativa de Custos (US East)

- **Storage**: ~$0.020/GB/mês
- **Operações**: ~$0.05/1000 operações
- **Egress**: ~$0.12/GB (para downloads)

### Otimização de Custos

1. **Lifecycle Policies**: Configure remoção automática após X dias
2. **Storage Classes**: Use Nearline/Coldline para arquivos antigos
3. **Compression**: Comprima arquivos antes do upload

## 📊 Monitoramento

### Logs da Aplicação

```bash
# Verificar logs de upload
grep "Upload para GCS" logs/app.log

# Verificar erros de storage
grep "Erro.*GCS" logs/app.log
```

### Google Cloud Monitoring

1. Acesse **Monitoring** no Console GCP
2. Configure alertas para:
   - Uso de storage
   - Número de operações
   - Latência de uploads

## 🔄 Migração

### De Local para GCS

1. Configure GCS conforme documentação
2. Defina `GOOGLE_CLOUD_STORAGE_ENABLED=true`
3. Reinicie a aplicação
4. Novos jobs usarão GCS automaticamente

### Backup de Arquivos Existentes

```bash
# Sincronizar arquivos locais para GCS
gsutil -m rsync -r ./storage/output gs://your-bucket/legacy/
```

## 📚 Recursos Adicionais

- [Google Cloud Storage Documentation](https://cloud.google.com/storage/docs)
- [Node.js Client Library](https://googleapis.dev/nodejs/storage/latest/)
- [Pricing Calculator](https://cloud.google.com/products/calculator)
- [Best Practices](https://cloud.google.com/storage/docs/best-practices) 