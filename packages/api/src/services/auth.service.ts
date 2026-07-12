import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  AuthFlowType,
  ConfirmSignUpCommand,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { db } from '../db/client.js';
import { tenants, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';

export interface SignUpInput {
  email: string;
  password: string;
  tenantName: string;
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

export async function signUp(input: SignUpInput): Promise<{ userId: string; tenantId: string }> {
  // Create user in Cognito
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

  // Create tenant in our database
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

  // Create user in our database
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    tenantId,
    email: input.email,
    role: 'admin', // First user in a tenant is always admin
    cognitoSub,
  });

  return { userId, tenantId };
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
    refreshToken, // Refresh token doesn't change
    expiresIn: authResult.AuthenticationResult.ExpiresIn || 3600,
  };
}

export async function signOut(accessToken: string): Promise<void> {
  await cognitoClient.send(
    new GlobalSignOutCommand({
      AccessToken: accessToken,
    })
  );
}

export async function getUserByCognitoSub(cognitoSub: string) {
  const result = await db.select().from(users).where(eq(users.cognitoSub, cognitoSub)).limit(1);
  return result[0] || null;
}
