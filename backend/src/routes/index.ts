import { Router } from 'express';
import {
  feedbackController,
  healthController,
  reportController,
  sessionController,
  statsController,
} from '../controllers/index.js';
import {
  apiRateLimiter,
  reportRateLimiter,
  sessionRateLimiter,
} from '../middleware/rateLimiter.js';

const router = Router();

router.use(apiRateLimiter);

router.get('/health', healthController.getHealth);
router.get('/stats', statsController.getStats);

router.post('/start-session', sessionRateLimiter, sessionController.startSession);
router.post('/end-session', sessionController.endSession);
router.post('/report', reportRateLimiter, reportController.submitReport);
router.post('/feedback', feedbackController.submitFeedback);

export default router;
