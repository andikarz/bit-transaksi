import { Router } from 'express';
import { ReviewController } from './review.controller.js';
import { authenticateGatewayAssertion, requireRole } from '../../middleware/gateway-assertion.js';

export const reviewRouter = Router();
const controller = new ReviewController();

// All review routes require authenticated Gateway assertion + VERIFIKATOR/ADMIN role
reviewRouter.use(authenticateGatewayAssertion(true));
reviewRouter.use(requireRole(['VERIFIKATOR', 'ADMIN']));

// Queue & statistics
reviewRouter.get('/queue', controller.getQueue);
reviewRouter.get('/stats', controller.getStats);

// Application-level review operations
reviewRouter.post('/:applicationId/lock', controller.lockApplication);
reviewRouter.get('/:applicationId', controller.getApplicationForReview);
reviewRouter.post('/:applicationId/decision', controller.submitDecision);
reviewRouter.delete('/:applicationId/lock', controller.unlockReview);
reviewRouter.get('/:applicationId/history', controller.getReviewHistory);
