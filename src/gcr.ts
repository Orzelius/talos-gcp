import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { writeFileSync } from "fs";
import { secretsPath } from "./util";

// Create a service account for the google artifacts registry
export function createGARSVCAcc() {
  const repo = new gcp.artifactregistry.Repository("docker-repo", {
    location: gcp.config.region!,
    repositoryId: gcp.config.project!,
    format: "DOCKER",
});
  const svcAcc = new gcp.serviceaccount.Account("gar-access", { accountId: "garaccess" })

  const svcAccWriterRoleBinding = new gcp.projects.IAMBinding("gar-write-access", {
    project: gcp.config.project!,
    members: [pulumi.interpolate`serviceAccount:${svcAcc.email}`],
    role: "roles/artifactregistry.writer",
  });
  const key = new gcp.serviceaccount.Key("gar-access-key", {
    serviceAccountId: svcAcc.id,
    publicKeyType: "TYPE_X509_PEM_FILE",
  });

  key.privateKey.apply(data => writeFileSync(secretsPath + "gar-access-key", Buffer.from(data, 'base64')))

  return { svcAcc, repo, svcAccWriterRoleBinding }
}
