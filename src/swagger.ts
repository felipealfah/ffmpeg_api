import express from 'express';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

// Carrega o arquivo YAML da documentação OpenAPI
const openApiDocument = yaml.load(
  fs.readFileSync(path.join(__dirname, '../openapi.yaml'), 'utf8')
);

// Configurações do Swagger UI
const swaggerOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'FFmpeg API - Documentação',
  customfavIcon: '/favicon.ico'
};

// Exporta as funções para configurar o Swagger no Express
export default {
  /**
   * Configura o Swagger UI no aplicativo Express
   * @param {Express} app - Aplicativo Express
   */
  setup: (app: express.Application): void => {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, swaggerOptions));
    app.get('/api-docs.json', (req: express.Request, res: express.Response) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(openApiDocument);
    });
    
    console.log('Swagger UI configurado em /api-docs');
  }
}; 