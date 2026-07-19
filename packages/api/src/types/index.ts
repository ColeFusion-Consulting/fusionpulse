export interface AuthUser {
  id: string;
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  userType: 'root' | 'user';
  username?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProvisioningStep {
  key: string;
  name: string;
  weight: number;
}

export interface ProvisioningEvent {
  step: string;
  progress: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message?: string;
  error?: string;
}

export interface ProvisioningJob {
  id: string;
  tenantId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  currentStep: string;
  progress: number;
  steps: ProvisioningStep[];
  stepsCompleted: string[];
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ProvisioningCompleteEvent extends ProvisioningEvent {
  status: 'completed';
  tokens?: {
    accessToken: string;
    idToken?: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export interface RootSignUpInput {
  username: string;
  password: string;
}

export interface ManagerSignUpInput {
  name: string;
  email: string;
  password: string;
}

export interface SignUpInput {
  tenantName: string;
  siteUrl: string;
  root: RootSignUpInput;
  manager: ManagerSignUpInput;
}
