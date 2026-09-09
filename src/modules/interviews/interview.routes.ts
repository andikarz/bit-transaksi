import { Router } from 'express';
import { InterviewController } from './interview.controller.js';
import { authenticateGatewayAssertion, requireRole } from '../../middleware/gateway-assertion.js';

export const interviewRouter = Router();
const controller = new InterviewController();

// Require Gateway Assertion + LEMBAGA_SELEKSI/ADMIN role
interviewRouter.use(authenticateGatewayAssertion(true));
interviewRouter.use(requireRole(['LEMBAGA_SELEKSI', 'ADMIN']));

interviewRouter.get('/queue', controller.getQueue);
interviewRouter.get('/stats', controller.getStats);
interviewRouter.get('/:applicationId', controller.getCandidateDetail);
interviewRouter.post('/:applicationId/score', controller.submitScore);
