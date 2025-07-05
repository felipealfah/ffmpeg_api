import express from 'express';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

// Carrega o arquivo YAML da documentação OpenAPI
const openApiDocument = yaml.load(
  fs.readFileSync(path.join(__dirname, '../openapi.yaml'), 'utf8')
) as swaggerUi.JsonObject;

// CSS customizado para melhorar o visual do Swagger UI
const customCss = `
  .swagger-ui .topbar { display: none }
  .swagger-ui .info { margin: 50px 0; }
  .swagger-ui .info .title {
    font-size: 36px;
    color: #ff6b35;
    margin-bottom: 10px;
  }
  .swagger-ui .info .description {
    font-size: 16px;
    color: #666;
    line-height: 1.6;
  }
  .swagger-ui .scheme-container {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 8px;
    margin: 20px 0;
  }
  .swagger-ui .opblock.opblock-post {
    border-color: #ff6b35;
    background: rgba(255, 107, 53, 0.1);
  }
  .swagger-ui .opblock.opblock-get {
    border-color: #17a2b8;
    background: rgba(23, 162, 184, 0.1);
  }
  .swagger-ui .opblock.opblock-put {
    border-color: #ffc107;
    background: rgba(255, 193, 7, 0.1);
  }
  .swagger-ui .opblock.opblock-delete {
    border-color: #dc3545;
    background: rgba(220, 53, 69, 0.1);
  }
  .swagger-ui .btn.execute {
    background-color: #ff6b35;
    border-color: #ff6b35;
  }
  .swagger-ui .btn.execute:hover {
    background-color: #e55a2b;
    border-color: #e55a2b;
  }
`;

// Configurações do Swagger UI
const swaggerOptions = {
  customCss,
  customSiteTitle: 'FFmpeg API - Documentação',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    filter: true,
    displayRequestDuration: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true
  }
};

// Exporta as funções para configurar o Swagger no Express
export default {
  /**
   * Configura a documentação no aplicativo Express
   * @param {Express} app - Aplicativo Express
   */
  setup: (app: express.Application): void => {
    // Swagger UI principal
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, swaggerOptions));
    
    // Endpoint para o JSON da documentação
    app.get('/api-docs.json', (req: express.Request, res: express.Response) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(openApiDocument);
    });

    console.log('📚 Swagger UI configurado em /api-docs');
    console.log('🔧 Documentação JSON disponível em /api-docs.json');
    console.log('🎨 Documentação Mintlify disponível em http://localhost:3001/introduction');
  }
}; 