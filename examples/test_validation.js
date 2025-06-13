const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuração da API
const API_URL = 'http://localhost:3000/api/v1/media/render';

// Lê os arquivos de exemplo
const validExample = JSON.parse(fs.readFileSync(path.join(__dirname, 'simple_video.json'), 'utf8'));
const invalidExample = JSON.parse(fs.readFileSync(path.join(__dirname, 'invalid_request.json'), 'utf8'));

// Testa a requisição válida
async function testValidRequest() {
  try {
    console.log('\n--- TESTANDO REQUISIÇÃO VÁLIDA ---');
    const response = await axios.post(API_URL, validExample);
    
    console.log('✅ Requisição válida aceita com sucesso');
    console.log('Resposta:', response.data);
    
    return response.data.data.jobId;
  } catch (error) {
    console.error('❌ Erro na requisição válida:', error.message);
    if (error.response) {
      console.error('Detalhes do erro:', error.response.data);
    }
  }
}

// Testa a requisição inválida
async function testInvalidRequest() {
  try {
    console.log('\n--- TESTANDO REQUISIÇÃO INVÁLIDA ---');
    await axios.post(API_URL, invalidExample);
    
    console.error('❌ ERRO: A requisição inválida foi aceita');
  } catch (error) {
    if (error.response && error.response.status === 422) {
      console.log('✅ Requisição inválida rejeitada corretamente');
      console.log('Erros de validação:');
      
      error.response.data.errors.forEach(err => {
        console.log(`- Campo: ${err.field}, Mensagem: ${err.message}`);
      });
    } else {
      console.error('❌ Erro inesperado:', error.message);
      if (error.response) {
        console.error('Detalhes do erro:', error.response.data);
      }
    }
  }
}

// Executa os testes
async function runTests() {
  try {
    // Testa primeiro a requisição inválida
    await testInvalidRequest();
    
    // Depois testa a requisição válida
    const jobId = await testValidRequest();
    
    // Se tiver um jobId, checa o status
    if (jobId) {
      console.log('\n--- VERIFICANDO STATUS DO JOB ---');
      try {
        const statusResponse = await axios.get(`http://localhost:3000/api/v1/media/render/${jobId}`);
        console.log('Status do job:', statusResponse.data);
      } catch (error) {
        console.error('Erro ao verificar status:', error.message);
      }
    }
    
    console.log('\n--- TESTES CONCLUÍDOS ---');
  } catch (error) {
    console.error('Erro durante os testes:', error);
  }
}

runTests(); 