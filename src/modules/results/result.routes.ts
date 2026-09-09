import { Router } from 'express';
import { ResultController } from './result.controller.js';
import { authenticateGatewayAssertion, requireRole } from '../../middleware/gateway-assertion.js';

export const resultRouter = Router();
const controller = new ResultController();

// Require Gateway Assertion + ADMIN role
resultRouter.use(authenticateGatewayAssertion(true));
resultRouter.use(requireRole(['ADMIN']));

resultRouter.get('/stats', controller.getFunnelStats);
resultRouter.get('/list', controller.getResultsList);
resultRouter.get('/export', controller.exportResults);
