import * as constructs from "constructs";
import { tagResources } from "./tags";

export function applyTags(scope: constructs.Construct): void {
  tagResources(scope, (stack) => ({
    StackName: stack.stackName,
    Project: "alu-private",
    SourceRepo: "github/aleksil/private-infra",
  }));
}

export const accountId = "670656330697";
