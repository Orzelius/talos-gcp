import * as pulumi from "@pulumi/pulumi";
import * as talos from "@pulumiverse/talos";

export function createTalosConfig(clusterEndpoint: pulumi.Input<string>, clusterName: pulumi.Input<string>) {
  const talosSecrets = new talos.machine.Secrets("secrets", {});

  const commonTalosOpts = {
    clusterEndpoint,
    clusterName,
    machineSecrets: talosSecrets.machineSecrets,
  };
  const controlplaneCfg = talos.machine.getConfigurationOutput({
    machineType: "controlplane",
    ...commonTalosOpts
  });
  const workerCfg = talos.machine.getConfigurationOutput({
    machineType: "worker",
    ...commonTalosOpts
  });
  return {workerCfg, controlplaneCfg}
}