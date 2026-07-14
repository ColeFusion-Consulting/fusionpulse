import { Router } from 'express';
import { getPublicConfig } from '../services/config.service.js';

export const configRouter = Router();

configRouter.get('/', (req, res) => {
  res.json({ success: true, data: getPublicConfig() });
});
