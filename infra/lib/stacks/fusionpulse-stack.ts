import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class FusionPulseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── VPC ────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, 'FusionPulseVPC', {
      maxAzs: 2,
      natGateways: 1,
    });

    // ─── Aurora PostgreSQL ──────────────────────────────────
    const database = new rds.DatabaseCluster(this, 'FusionPulseDB', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2,
      writer: rds.ClusterInstance.serverlessV2('writer'),
      readers: [
        rds.ClusterInstance.serverlessV2('reader', { scaleWithWriter: true }),
      ],
      vpc,
      defaultDatabaseName: 'fusionpulse',
      storageEncrypted: true,
      deletionProtection: true,
    });

    // ─── Redis (ElastiCache) ────────────────────────────────
    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSG', { vpc });
    // Placeholder — add ElastiCache serverless cache in production
    // For now, use a simple security group reference

    // ─── SQS for test runners ──────────────────────────────
    const testQueue = new sqs.Queue(this, 'TestRunnerQueue', {
      visibilityTimeout: cdk.Duration.minutes(10),
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'TestRunnerDLQ', {
          retentionPeriod: cdk.Duration.days(14),
        }),
        maxReceiveCount: 3,
      },
    });

    // ─── Cognito ───────────────────────────────────────────
    const userPool = new cognito.UserPool(this, 'FusionPulseUserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: { minLength: 8 },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: { userPassword: true, userSrp: true },
      oAuth: { scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE] },
    });

    // ─── ECS Cluster ──────────────────────────────────────
    const cluster = new ecs.Cluster(this, 'FusionPulseCluster', {
      vpc,
      containerInsights: true,
    });

    // ─── API Service (Fargate) ─────────────────────────────
    const apiService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'ApiService', {
      cluster,
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(
          ecr.Repository.fromRepositoryName(this, 'ApiRepo', 'fusionpulse-api')
        ),
        containerPort: 3001,
        environment: {
          NODE_ENV: 'production',
          DATABASE_URL: `postgresql://postgres:postgres@${database.clusterEndpoint.hostname}:5432/fusionpulse`,
          AWS_REGION: this.region,
          CONTACT_FROM_EMAIL: 'contact@colefusion.net',
          CONTACT_TO_EMAIL: 'colemcmannus@gmail.com',
        },
        secrets: {
          JWT_SECRET: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'JwtSecret', 'fusionpulse/jwt-secret')
          ),
        },
      },
      publicLoadBalancer: true,
      certificate: acm.Certificate.fromCertificateArn(
        this, 'FusionPulseCert',
        'arn:aws:acm:us-east-1:729988623719:certificate/9df45806-7cac-4bb0-b5a1-f6669503620e'
      ),
    });

    apiService.targetGroup.configureHealthCheck({
      path: '/api/health',
      healthyHttpCodes: '200',
    });

    // Grant execution role access to manually-created secrets
    apiService.taskDefinition.executionRole?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          'arn:aws:secretsmanager:us-east-1:729988623719:secret:fusionpulse/jwt-secret-*',
          'arn:aws:secretsmanager:us-east-1:729988623719:secret:fusionpulse/db-password-*',
        ],
      })
    );

    // Grant the API task role permission to send contact-form email via SES —
    // no static keys needed in production, unlike the Proxmox dev/staging envs.
    apiService.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      })
    );

    // ─── S3 + CloudFront for frontend ──────────────────────
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // ─── Outputs ──────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', { value: apiService.loadBalancer.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'FrontendUrl', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'QueueUrl', { value: testQueue.queueUrl });
    new cdk.CfnOutput(this, 'DatabaseEndpoint', { value: database.clusterEndpoint.hostname });
  }
}
