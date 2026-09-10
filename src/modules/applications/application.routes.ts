import { Router } from 'express';
import { ApplicationController } from './application.controller.js';
import { authenticateGatewayAssertion } from '../../middleware/gateway-assertion.js';

export const applicationRouter = Router();
const controller = new ApplicationController();

applicationRouter.use(authenticateGatewayAssertion(true));

applicationRouter.post('/', controller.createDraft);
applicationRouter.get('/my-active', controller.getMyActive);
applicationRouter.get('/:id', controller.getDetail);
applicationRouter.put('/:id/program', controller.updateProgram);
applicationRouter.put('/:id/sections/personal', controller.updatePersonal);
applicationRouter.put('/:id/sections/education', controller.updateEducation);
applicationRouter.put('/:id/sections/consent', controller.updateConsent);
applicationRouter.post('/:id/document-reservations', controller.createReservation);
applicationRouter.post('/:id/reservations', controller.createReservation);
applicationRouter.post('/:id/submit', controller.submit);
applicationRouter.post('/:id/resubmit', controller.resubmit);
applicationRouter.post('/:id/confirmation', controller.confirm);
