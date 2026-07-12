import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as authService from '../services/auth.service.js';

export const authRouter = Router();

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenantName: z.string().min(1).max(100),
});

const provisioningSignUpSchema = z.object({
  tenantName: z.string().min(1).max(100),
  siteUrl: z.string().url(),
  root: z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(8),
  }),
  manager: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const rootSignInSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const confirmSchema = z.object({
  email: z.string().email(),
  confirmationCode: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

// POST /auth/signup — regular Cognito signup (existing)
authRouter.post('/signup', validate(signUpSchema), async (req, res) => {
  try {
    const { userId, tenantId } = await authService.signUp(req.body);
    res.status(201).json({
      success: true,
      data: { userId, tenantId, message: 'User created. Please check your email to confirm your account.' },
    });
  } catch (err: any) {
    console.error('Signup error:', err);
    res.status(400).json({ success: false, error: err.message || 'Signup failed' });
  }
});

// POST /auth/provisioning-signup — new tenant signup with async provisioning
authRouter.post('/provisioning-signup', validate(provisioningSignUpSchema), async (req, res) => {
  try {
    const result = await authService.provisioningSignUp(req.body);
    res.status(202).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error('Provisioning signup error:', err);
    res.status(400).json({ success: false, error: err.message || 'Signup failed' });
  }
});

// POST /auth/confirm
authRouter.post('/confirm', validate(confirmSchema), async (req, res) => {
  try {
    await authService.confirmSignUp(req.body.email, req.body.confirmationCode);
    res.json({ success: true, data: { message: 'Account confirmed. You can now sign in.' } });
  } catch (err: any) {
    console.error('Confirm error:', err);
    res.status(400).json({ success: false, error: err.message || 'Confirmation failed' });
  }
});

// POST /auth/login — Cognito login (manager / regular users)
authRouter.post('/login', validate(signInSchema), async (req, res) => {
  try {
    const tokens = await authService.signIn(req.body);
    res.json({ success: true, data: tokens });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// POST /auth/root-login — Root user login (DB-backed, no Cognito)
authRouter.post('/root-login', validate(rootSignInSchema), async (req, res) => {
  try {
    const tokens = await authService.rootSignIn(req.body);
    res.json({ success: true, data: tokens });
  } catch (err: any) {
    console.error('Root login error:', err);
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// POST /auth/refresh
authRouter.post('/refresh', validate(refreshSchema), async (req, res) => {
  try {
    const tokens = await authService.refreshToken(req.body.refreshToken);
    res.json({ success: true, data: tokens });
  } catch (err: any) {
    console.error('Refresh error:', err);
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
});

// POST /auth/logout
authRouter.post('/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing access token' });
    return;
  }

  const accessToken = authHeader.slice(7);
  try {
    await authService.signOut(accessToken);
    res.json({ success: true, data: { message: 'Signed out successfully' } });
  } catch {
    res.json({ success: true, data: { message: 'Signed out' } });
  }
});
