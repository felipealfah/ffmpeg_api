const express = require('express');
const cors = require('cors');
const path = require('path');
const swagger = require('./swagger');
const mediaRoutes = require('./routes/mediaRoutes');

// Inicializa o aplicativo Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsing de JSON e URL-encoded
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Habilita CORS
app.use(cors());

// Configura diretório para arquivos estáticos
app.use('/static', express.static(path.join(__dirname, '../public')));

// Configura o Swagger UI
swagger.setup(app);

// Rota de verificação de saúde
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas da API
app.use('/api/v1/media', mediaRoutes);

// Middleware para tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  const statusCode = err.statusCode || 500;
  const errorResponse = {
    type: `https://api.example.com/errors/${statusCode}`,
    title: err.name || 'Internal Server Error',
    status: statusCode,
    detail: err.message || 'Ocorreu um erro interno no servidor',
    instance: req.originalUrl
  };
  
  res.status(statusCode).json(errorResponse);
});

// Middleware para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({
    type: 'https://api.example.com/errors/404',
    title: 'Not Found',
    status: 404,
    detail: 'O recurso solicitado não foi encontrado',
    instance: req.originalUrl
  });
});

// Inicia o servidor
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`Documentação da API disponível em http://localhost:${PORT}/api-docs`);
  });
}

module.exports = app;
