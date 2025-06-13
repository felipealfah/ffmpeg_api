const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

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
module.exports = {
  /**
   * Configura o Swagger UI no aplicativo Express
   * @param {Express} app - Aplicativo Express
   */
  setup: (app) => {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, swaggerOptions));
    app.get('/api-docs.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(openApiDocument);
    });
    
    console.log('Swagger UI configurado em /api-docs');
  }
}; 