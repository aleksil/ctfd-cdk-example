import * as cdk from "aws-cdk-lib";
import { accountId, applyTags } from "./config";
import { CtfdStack } from "./stacks/ctfd-stack";

const app = new cdk.App();

applyTags(app);

new CtfdStack(app, "ctfd-stack", {
  env: {
    account: accountId,
    region: "eu-west-1",
  },
});
