import * as gcp from "@pulumi/gcp";
import { ensureTalosImageAsset } from './image'
import { createNetwork } from './network'
import { createTalosConfig, MachineConfig } from './talos'
import * as pulumi from "@pulumi/pulumi";

const clusterConfig = new pulumi.Config("cluster")

const up = async () => {
  const bucket = new gcp.storage.Bucket("talos", {
    location: gcp.config.region!
  });

  const image = await ensureTalosImageAsset(bucket);
  const controlMachineTag = "controlplane"
  const workerMachineTag = "worker"
  const network = createNetwork(controlMachineTag)

  const clusterEndpoint = network.resources.tcp443FwdRule.ipAddress.apply(v => `https://${v}:443`)
  const talosMachineCfg = createTalosConfig(clusterEndpoint, clusterConfig.require("name"));

  createCompute(image.talosImage.name, controlMachineTag, workerMachineTag, talosMachineCfg, network);

  return {
    bucket: {
      name: bucket.url,
    },
    network: {
      lbIp: network.resources.LoadBalancerIP.address,
    },
    clusterCfg: clusterConfig,
  };
}


export default up().then(res => res)


function createCompute(
  imageName: pulumi.Input<string>,
  controlMachineTag: string,
  workerMachineTag: string,
  talosMachineCfg: MachineConfig,
  network: ReturnType<typeof createNetwork>
) {
  const createInstance = (name: string, isControl: boolean) => {
    return {
      inst: new gcp.compute.Instance(name, {
        bootDisk: {
          initializeParams: { image: imageName },
        },
        tags: [isControl ? controlMachineTag : workerMachineTag],
        machineType: "e2-medium",
        networkInterfaces: [{
          network: "default",
          accessConfigs: [{}]
        }],
        metadata: { "user-data": isControl ? talosMachineCfg.controlplaneCfg.apply(v => v.machineConfiguration) : talosMachineCfg.workerCfg.apply(v => v.machineConfiguration) }
      }),
      isControl,
      nodeName: name,
    };
  };


  const nodes: Array<ReturnType<typeof createInstance>> = [];
  for (let i = 0; i < parseInt(clusterConfig.require("workers")); i++) nodes.push({ ...createInstance("worker-" + i, false) });
  for (let i = 0; i < parseInt(clusterConfig.require("controls")); i++) nodes.push({ ...createInstance("control-" + i, true) });

  nodes.filter(n => n.isControl).forEach(n => new gcp.compute.InstanceGroupMembership(n.nodeName + "-instancegroup-membership", {
    instance: n.inst.name,
    instanceGroup: network.resources.instanceGroup.name,
    zone: gcp.config.zone
  }, { dependsOn: [network.resources.tcp443FwdRule] })
  );
}

