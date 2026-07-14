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
import * as route53 from 'aws-cdk-lib/aws-route53';
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
          CONTACT_FROM_EMAIL: 'contact@colefusion.com',
          CONTACT_TO_EMAIL: 'hello@colefusion.com',
          REDIS_URL: 'redis://localhost:6379',
          SQS_QUEUE_URL: testQueue.queueUrl,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
          COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
          LOG_LEVEL: 'info',
        },
        secrets: {
          JWT_SECRET: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'JwtSecret', 'fusionpulse/jwt-secret')
          ),
          // TODO: Create and reference actual Secrets Manager secrets for these values
          OPENAI_API_KEY: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'OpenAiApiKey', 'fusionpulse/openai-api-key')
          ),
          INTERNAL_API_KEY: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'InternalApiKey', 'fusionpulse/internal-api-key')
          ),
          STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'StripeSecretKey', 'fusionpulse/stripe-secret-key')
          ),
          STRIPE_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'StripeWebhookSecret', 'fusionpulse/stripe-webhook-secret')
          ),
          STRIPE_STARTER_PRICE_ID: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'StripeStarterPriceId', 'fusionpulse/stripe-starter-price-id')
          ),
          STRIPE_PRO_PRICE_ID: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'StripeProPriceId', 'fusionpulse/stripe-pro-price-id')
          ),
          STRIPE_BUSINESS_PRICE_ID: ecs.Secret.fromSecretsManager(
            secretsmanager.Secret.fromSecretNameV2(this, 'StripeBusinessPriceId', 'fusionpulse/stripe-business-price-id')
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

    // Grant execution role access to secrets
    apiService.taskDefinition.executionRole?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          'arn:aws:secretsmanager:us-east-1:729988623719:secret:fusionpulse/jwt-secret-*',
          'arn:aws:secretsmanager:us-east-1:729988623719:secret:fusionpulse/db-password-*',
          'arn:aws:secretsmanager:us-east-1:729988623719:secret:fusionpulse/openai-api-key-*',
          'arn:aws:secretsmanager:us-east-1:729988623719:secret:fusionpulse/internal-api-key-*',
          'arn:aws:secretsmanager:us-east-1:729988623719:secret:fusionpulse/stripe-secret-key-*',
          'arn:aws:secretsmanager:us-east-1:729988623719:secret:fusionpulse/stripe-webhook-secret-*',
          'arn:aws:secretsmanager:us-east-1:729988623719:secret:fusionpulse/stripe-starter-price-id-*',
          'arn:aws:secretsmanager:us-east-1:729988623719:secret:fusionpulse/stripe-pro-price-id-*',
          'arn:aws:secretsmanager:us-east-1:729988623719:secret:fusionpulse/stripe-business-price-id-*',
        ],
      })
    );

    // Grant the API task role permission to poll SQS
    apiService.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
        resources: [testQueue.queueArn],
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

    // ─── Route 53 hosted zone for colefusion.com ──────────
    const hostedZone = new route53.PublicHostedZone(this, 'ColeFusionZone', {
      zoneName: 'colefusion.com',
    });

    // ─── Temporary CNAME records for existing infra ──────────
    // Once ACM certificates are issued for *.colefusion.com (follow-up),
    // swap these for Alias A records + add domainNames to CloudFront.
    // fusionpulse.colefusion.com → CloudFront
    new route53.CnameRecord(this, 'RootRecord', {
      zone: hostedZone,
      recordName: 'fusionpulse.colefusion.com',
      domainName: distribution.distributionDomainName,
      ttl: cdk.Duration.minutes(5),
    });

    // app.fusionpulse.colefusion.com → same CloudFront
    new route53.CnameRecord(this, 'AppRecord', {
      zone: hostedZone,
      recordName: 'app.fusionpulse.colefusion.com',
      domainName: distribution.distributionDomainName,
      ttl: cdk.Duration.minutes(5),
    });

    // api.fusionpulse.colefusion.com → ALB
    new route53.CnameRecord(this, 'ApiRecord', {
      zone: hostedZone,
      recordName: 'api.fusionpulse.colefusion.com',
      domainName: apiService.loadBalancer.loadBalancerDnsName,
      ttl: cdk.Duration.minutes(5),
    });

    // ─── Email records (Zoho Mail — mirrors colefusion.com) ──
    new route53.MxRecord(this, 'MxRecord', {
      zone: hostedZone,
      values: [
        { priority: 10, hostName: 'mx.zoho.com' },
        { priority: 20, hostName: 'mx2.zoho.com' },
        { priority: 50, hostName: 'mx3.zoho.com' },
      ],
    });

    new route53.TxtRecord(this, 'SpfRecord', {
      zone: hostedZone,
      values: ['v=spf1 include:zohomail.com ~all'],
    });

    // Zoho domain verification
    new route53.TxtRecord(this, 'ZohoVerification', {
      zone: hostedZone,
      recordName: 'colefusion.com',
      values: ['zoho-verification=zb77341378.zmverify.zoho.com'],
    });

    // ─── Outputs ──────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', { value: apiService.loadBalancer.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'FrontendUrl', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'QueueUrl', { value: testQueue.queueUrl });
    new cdk.CfnOutput(this, 'DatabaseEndpoint', { value: database.clusterEndpoint.hostname });
    new cdk.CfnOutput(this, 'HostedZoneId', { value: hostedZone.hostedZoneId });
    new cdk.CfnOutput(this, 'NameServers', {
      value: cdk.Fn.join(', ', hostedZone.hostedZoneNameServers!),
    });
  }
}
