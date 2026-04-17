import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import studySessionsRouter from "./study-sessions";
import revisionsRouter from "./revisions";
import focusSessionsRouter from "./focus-sessions";
import brainBreaksRouter from "./brain-breaks";
import airDrawingsRouter from "./air-drawings";
import coachRouter from "./coach";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(studySessionsRouter);
router.use(revisionsRouter);
router.use(focusSessionsRouter);
router.use(brainBreaksRouter);
router.use(airDrawingsRouter);
router.use(coachRouter);
router.use(dashboardRouter);

export default router;
