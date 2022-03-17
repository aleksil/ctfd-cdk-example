import * as constructs from "constructs";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elasticache from "aws-cdk-lib/aws-elasticache";

export interface RedisProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class Redis extends constructs.Construct {
  readonly securityGroup: ec2.SecurityGroup;
  readonly cacheAddress: cdk.Reference;
  readonly cachePort: cdk.Reference;

  constructor(scope: constructs.Construct, id: string, props: RedisProps) {
    super(scope, id);

    this.securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc: props.vpc,
      description: "Redis security group",
    });

    const subnetGroup = new elasticache.CfnSubnetGroup(this, "SubnetGroup", {
      description: "Redis Subnet",
      subnetIds: props.vpc.isolatedSubnets.map((it) => it.subnetId),
    });

    const redis = new elasticache.CfnCacheCluster(this, "CacheCluster", {
      cacheNodeType: "cache.t4g.micro",
      engine: "redis",
      numCacheNodes: 1,
      vpcSecurityGroupIds: [this.securityGroup.securityGroupId],
      cacheSubnetGroupName: subnetGroup.ref,
    });

    this.cacheAddress = redis.getAtt("RedisEndpoint.Address");
    this.cachePort = redis.getAtt("RedisEndpoint.Port");
  }
}
