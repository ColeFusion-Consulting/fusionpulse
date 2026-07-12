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

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const confirmSchema = z.object({
  email: z.string().email(),
  confirmationCode: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

// POST /auth/signup
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

// POST /auth/login
authRouter.post('/login', validate(signInSchema), async (req, res) => {
  try {
    const tokens = await authService.signIn(req.body);
    res.json({ success: true, data: tokens });
  } catch (err: any) {
    console.error('Login error:', err);
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
  } catch (err: any) {
    console.error('Logout error:', err);
    // Even if Cognito signout fails, we consider the user logged out on our end
    res.json({ success: true, data: { message: 'Signed out' } });
  }
});
