const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000/api/v1/media';

async function monitorMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  console.log(`Uso de memória atual: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
  console.log(`Limite de memória: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`);
  console.log(`Porcentagem utilizada: ${Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)}%`);
  return memoryUsage;
}

async function waitForJobCompletion(jobId) {
  let status = 'queued';
  let attempts = 0;
  const maxAttempts = 60; // 5 minutos (5s * 60)

  while (status !== 'completed' && status !== 'failed' && attempts < maxAttempts) {
    try {
      const response = await axios.get(`${API_URL}/job/${jobId}/status`);
      status = response.data.status;
      console.log(`Status do job ${jobId}: ${status}`);

      if (status === 'failed') {
        throw new Error(`Job falhou: ${response.data.error}`);
      }

      if (status !== 'completed') {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Espera 5s
        attempts++;
      }
    } catch (error) {
      console.error('Erro ao verificar status do job:', error.message);
      throw error;
    }
  }

  if (attempts >= maxAttempts) {
    throw new Error('Timeout aguardando conclusão do job');
  }

  return status;
}

async function testMemoryUsage() {
  try {
    // Monitorar uso de memória inicial
    console.log('Uso de memória inicial:');
    await monitorMemoryUsage();

    // Criar requisição de renderização
    const renderRequest = {
      timeline: {
        tracks: [
          {
            clips: [
              {
                asset: {
                  type: "video",
                  source: "url",
                  src: "https://drive.google.com/uc?id=1UciduHpndWbuh834ZFgVIiWgo6YVAeWU&export=download"
                },
                start: 0,
                length: "auto"
              },
              {
                asset: {
                  type: "video",
                  source: "url",
                  src: "https://drive.google.com/uc?id=1UciduHpndWbuh834ZFgVIiWgo6YVAeWU&export=download"
                },
                start: 0,
                length: "auto"
              },
              {
                asset: {
                  type: "video",
                  source: "url",
                  src: "https://drive.google.com/uc?id=1UciduHpndWbuh834ZFgVIiWgo6YVAeWU&export=download"
                },
                start: 0,
                length: "auto"
              }
            ]
          }
        ]
      },
      output: {
        format: "mp4",
        width: 1280,
        height: 720,
        quality: "medium",
        fps: 30
      }
    };

    // Iniciar renderização
    console.log('Iniciando renderização...');
    const response = await axios.post(`${API_URL}/render`, renderRequest);
    const jobId = response.data.jobId;
    console.log(`Job iniciado: ${jobId}`);

    // Aguardar conclusão do job
    await waitForJobCompletion(jobId);

    // Monitorar uso de memória final
    console.log('Uso de memória final:');
    await monitorMemoryUsage();

    console.log('Teste concluído com sucesso!');
  } catch (error) {
    console.error('Erro no teste:', error.message);
    if (error.response) {
      console.error('Detalhes do erro:', error.response.data);
    }
    process.exit(1);
  }
}

// Executar teste
testMemoryUsage(); 