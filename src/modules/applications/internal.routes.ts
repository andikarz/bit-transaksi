import { Router } from 'express';
import { ApplicationController } from './application.controller.js';
import { authenticateGatewayAssertion } from '../../middleware/gateway-assertion.js';

export const internalRouter = Router();
const controller = new ApplicationController();

internalRouter.use(authenticateGatewayAssertion(false));

// Internal endpoints called by other services via Gateway :9080
internalRouter.get('/document-reservations/:id/validate', controller.validateReservation);
internalRouter.post('/document-reservations/:id/commit', controller.commitReservation);
internalRouter.get('/applications/:id', controller.getDetail);
