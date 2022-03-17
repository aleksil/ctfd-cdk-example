import * as constructs from "constructs";
import * as cdk from "aws-cdk-lib";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecspatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import { CfnOutput, StackProps } from "aws-cdk-lib";
import { Redis } from "../constructs/redis-construct";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface CtfdStackProps extends StackProps {}

export class CtfdStack extends cdk.Stack {
  constructor(scope: constructs.Construct, id: string, props: CtfdStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Vpc", {
      // OBS: Dette betyr at private subnett ikke har internett-tilgang,
      // kan f.eks. ikke spinne opp ECS-tasks i private subnett
      // siden de ikke kan hente ECR-bilder
      natGateways: 0,
    });

    const database = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.mariaDb({
        version: rds.MariaDbEngineVersion.VER_10_5,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO,
      ),
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      credentials: rds.Credentials.fromGeneratedSecret("ctfd"),
      databaseName: "ctfd",
      multiAz: false,
      allocatedStorage: 8,
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: false,
    });

    const dbSecret = database.secret!;
    const databasePassword = dbSecret
      .secretValueFromJson("password")
      .toString();

    const databaseUrlSecret = new sm.Secret(this, "DatabaseUrlSecret", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      secretStringBeta1: sm.SecretStringValueBeta1.fromToken(
        JSON.stringify({
          url: `mysql+pymysql://ctfd:${databasePassword}@${database.dbInstanceEndpointAddress}/ctfd`,
        }),
      ),
    });

    const redis = new Redis(this, "Redis", { vpc });

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc: vpc,
    });

    const uploadsBucket = new s3.Bucket(this, "UploadsBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const secretKey = new sm.Secret(this, "Secret", {
      description: "Secret key for ctfd",
    });

    const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
      description: "Security group for CTFd ECS task",
    });

    redis.securityGroup.connections.allowFrom(
      securityGroup,
      ec2.Port.tcp(6379),
    );

    database.connections.allowFrom(securityGroup, ec2.Port.tcp(3306));

    const service = new ecspatterns.ApplicationLoadBalancedFargateService(
      this,
      "Service",
      {
        cluster,
        memoryLimitMiB: 2048,
        desiredCount: 1,
        cpu: 512,
        securityGroups: [securityGroup],
        assignPublicIp: true,
        taskImageOptions: {
          image: ecs.ContainerImage.fromAsset("ctfd-docker"),
          containerPort: 8000,
          environment: {
            REVERSE_PROXY: "True",
            AWS_S3_BUCKET: uploadsBucket.bucketName,
            REDIS_URL: `redis://${redis.cacheAddress.toString()}:${redis.cachePort.toString()}`,
          },
          secrets: {
            SECRET_KEY: ecs.Secret.fromSecretsManager(secretKey),
            DATABASE_URL: ecs.Secret.fromSecretsManager(
              databaseUrlSecret,
              "url",
            ),
          },
        },
      },
    );

    uploadsBucket.grantReadWrite(service.taskDefinition.taskRole);

    new CfnOutput(this, "CtfdUrl", {
      value: service.loadBalancer.loadBalancerDnsName,
    });
  }
}
