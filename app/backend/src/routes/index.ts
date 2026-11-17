// Every /api route, grouped by the part of the app that uses it

import { Router } from 'express';
import { dashboardRouter } from './dashboard.js';
import { devicesRouter } from './devices.js';
import { historyRouter } from './history.js';
import { roomModelRouter } from './roomModel.js';

export const router = Router();

router.use(devicesRouter); // sensor picker
router.use(dashboardRouter); // Consumer Dashboard
router.use(historyRouter); // Data Analysis: charts and statistics
router.use(roomModelRouter); // Data Analysis: λ, G_est and its labels
