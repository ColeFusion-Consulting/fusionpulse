import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  AuthFlowType,
  ConfirmSignUpCommand,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { db } from '../db/client.js';
import { tenants, users, provisioningJobs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { startProvisioning } from './provisioning.service.js';
import type { SignUpInput as SignUpInputType } from '../types/index.js';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export interface SignUpInput {
  email: string;
  password: string;
  tenantName: string;
}

export interface RootSignInInput {
  username: string;
  password: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ProvisioningSignUpResult {
  tenantId: string;
  provisioningToken: string;
}

export async function signUp(input: SignUpInput): Promise<{ userId: string; tenantId: string }> {
  const signUpResult = await cognitoClient.send(
    new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: input.email,
      Password: input.password,
      UserAttributes: [{ Name: 'email', Value: input.email }],
    })
  );

  const cognitoSub = signUpResult.UserSub;
  if (!cognitoSub) {
    throw new Error('Failed to create user in Cognito');
  }

  const tenantId = randomUUID();
  const tenantSlug = input.tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  await db.insert(tenants).values({
    id: tenantId,
    name: input.tenantName,
    slug: tenantSlug,
    plan: 'free',
  });

  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    tenantId,
    email: input.email,
    role: 'admin',
    userType: 'user',
    cognitoSub,
  });

  return { userId, tenantId };
}

export async function provisioningSignUp(input: SignUpInputType): Promise<ProvisioningSignUpResult> {
  const tenantId = randomUUID();
  const tenantSlug = input.tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  // Create tenant in provisioning state
  await db.insert(tenants).values({
    id: tenantId,
    name: input.tenantName,
    slug: tenantSlug,
    plan: 'free',
    settings: { siteUrl: input.siteUrl, status: 'provisioning' },
  });

  // Create provisioning job
  await db.insert(provisioningJobs).values({
    id: randomUUID(),
    tenantId,
    status: 'pending',
    steps: [],
    stepsCompleted: [],
  });

  // Generate a short-lived provisioning token for SSE auth
  const provisioningToken = jwt.sign(
    { tenantId, type: 'provisioning' },
    JWT_SECRET,
    { expiresIn: '30m', algorithm: 'HS256' }
  );

  // Start async provisioning
  startProvisioning(
    tenantId,
    input.root.username,
    input.root.password,
    input.manager.name,
    input.manager.email,
    input.manager.password,
    input.siteUrl
  );

  return { tenantId, provisioningToken };
}

export async function confirmSignUp(email: string, confirmationCode: string): Promise<void> {
  await cognitoClient.send(
    new ConfirmSignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: confirmationCode,
    })
  );
}

export async function signIn(input: SignInInput): Promise<AuthTokens> {
  const authResult = await cognitoClient.send(
    new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: input.email,
        PASSWORD: input.password,
      },
    })
  );

  if (!authResult.AuthenticationResult) {
    throw new Error('Authentication failed');
  }

  return {
    accessToken: authResult.AuthenticationResult.AccessToken || '',
    idToken: authResult.AuthenticationResult.IdToken || '',
    refreshToken: authResult.AuthenticationResult.RefreshToken || '',
    expiresIn: authResult.AuthenticationResult.ExpiresIn || 3600,
  };
}

export async function rootSignIn(input: RootSignInInput): Promise<AuthTokens> {
  const result = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
  const user = result[0];

  if (!user || user.userType !== 'root' || !user.passwordHash) {
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  const accessToken = jwt.sign(
    {
      sub: user.id,
      tenant_id: user.tenantId,
      username: user.username,
      user_type: 'root',
    },
    JWT_SECRET,
    { expiresIn: '24h', algorithm: 'HS256' }
  );

  return {
    accessToken,
    idToken: accessToken,
    refreshToken: accessToken,
    expiresIn: 86400,
  };
}

export async function refreshToken(refreshToken: string): Promise<AuthTokens> {
  const authResult = await cognitoClient.send(
    new InitiateAuthCommand({
      AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
      ClientId: CLIENT_ID,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    })
  );

  if (!authResult.AuthenticationResult) {
    throw new Error('Token refresh failed');
  }

  return {
    accessToken: authResult.AuthenticationResult.AccessToken || '',
    idToken: authResult.AuthenticationResult.IdToken || '',
    refreshToken,
    expiresIn: authResult.AuthenticationResult.ExpiresIn || 3600,
  };
}

export async function signOut(accessToken: string): Promise<void> {
  try {
    await cognitoClient.send(
      new GlobalSignOutCommand({ AccessToken: accessToken })
    );
  } catch {
    // Cognito sign-out is best-effort
  }
}

export async function getUserByCognitoSub(cognitoSub: string) {
  const result = await db.select().from(users).where(eq(users.cognitoSub, cognitoSub)).limit(1);
  return result[0] || null;
}

export async function getUserById(id: string) {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] || null;
}
