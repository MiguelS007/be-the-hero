const express = require('express')

const OngController = require('./controllers/OngController');
const IncidentController = require('./controllers/IncidentController');
const ProfileController = require('./controllers/ProfileController');
const SessionController = require('./controllers/SessionController');
const buildHealthModule = require('./health');
const dbConnection = require('./database/connection');

const routes = express.Router();

// --- Health probes (US-005 / T001-BE) ---
// No authentication: load balancers and orchestrators need to probe freely.
// Liveness: cheap, in-process. Readiness: deep, checks dependencies.
const { controller: healthController } = buildHealthModule({ dbConnection });
routes.get('/health', healthController.liveness);
routes.get('/health/ready', healthController.readiness);

routes.post('/sessions', SessionController.create);

routes.get('/ongs', OngController.index);
routes.post('/ongs', OngController.create);

routes.get('/profile', ProfileController.index);

routes.get('/incidents', IncidentController.index);
routes.post('/incidents', IncidentController.create);
routes.delete('/incidents/:id', IncidentController.delete)//pra saber qual o incident que a ong quer deletar eu vou receber um holtparam com o id do incident
                                                    //que é pra deletar

module.exports = routes;
