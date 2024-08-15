import * as gcp from "@pulumi/gcp";
import { ensureTalosImageAsset } from './image'
import { createNetwork } from './network'
import { createTalosConfig, MachineConfig } from './talos'
import * as pulumi from "@pulumi/pulumi";
import * as talos from "@pulumiverse/talos";
import { getNatIp, secretsPath } from "./util";
import { writeFileSync } from "fs";
import { createGARSVCAcc } from './gcr'

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

  const nodes = createCompute(image.talosImage.name, controlMachineTag, workerMachineTag, talosMachineCfg, network);

  let controlNodeNatIPs = nodes.filter(n => n.isControl).map(v => getNatIp(v.inst))
  const bootstrapTaloscluster = () => {
    const talosClientCfg = talos.client.getConfigurationOutput({
      clientConfiguration: talosMachineCfg.talosSecrets.clientConfiguration,
      clusterName: clusterConfig.require("name"),
      endpoints: controlNodeNatIPs,
      nodes: [controlNodeNatIPs[0]]
    })

    new talos.machine.Bootstrap("bootstrap", {
      node: controlNodeNatIPs[0],
      clientConfiguration: talosMachineCfg.talosSecrets.clientConfiguration,
    });

    return talosClientCfg
  }

  let talosBootstrapOutputs: ReturnType<typeof bootstrapTaloscluster> | undefined
  let kubecfg: pulumi.Output<talos.cluster.GetKubeconfigResult> | undefined
  if (nodes.length > 0) {
    talosBootstrapOutputs = bootstrapTaloscluster()
    talosBootstrapOutputs.talosConfig.apply(cfg => {
      writeFileSync(secretsPath + "talosconfig", cfg)
    })
    const getKubecfgParams = pulumi.all([talosBootstrapOutputs.clientConfiguration, controlNodeNatIPs[0]])
    kubecfg = getKubecfgParams.apply(async ([clinetCfg, nodeIp]) => {
      const kubecfg = await talos.cluster.getKubeconfig({ clientConfiguration: clinetCfg, node: nodeIp })
      writeFileSync(secretsPath + "kubeconfig", kubecfg.kubeconfigRaw)
      return kubecfg
    })
  }

  const gar = createGARSVCAcc()

  return {
    bucket: {
      name: bucket.url,
    },
    network: {
      lbIp: network.resources.LoadBalancerIP.address,
      lbPubIp: network.resources.tcp443FwdRule.ipAddress,
      clusterEndpoint,
    },
    clusterCfg: {
      clusterConfig,
      talosClientConfiguration: talosBootstrapOutputs?.talosConfig,
      kubecfg,
    },
    controlNodeNatIPs,
    dockerRegistry: {
      id: gar.repo.id,
      region: gar.repo.location,
      hostname: gar.repo.location.apply(l => l  + "-docker.pkg.dev"),
      svcAcc: gar.svcAcc.accountId,
    },
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
          network: network.resources.network.id,
          subnetwork: network.resources.subnet.id,
          accessConfigs: [{}]
        }],
        metadata: {
          "user-data": isControl ?
            talosMachineCfg.controlplaneCfg.apply(v => v.machineConfiguration) :
            talosMachineCfg.workerCfg.apply(v => v.machineConfiguration)
        }
      }),
      isControl,
      nodeName: name,
    };
  };


  const nodes: Array<ReturnType<typeof createInstance>> = [];
  for (let i = 0; i < parseInt(clusterConfig.require("workers")); i++)
    nodes.push({ ...createInstance("worker-" + i, false) });
  for (let i = 0; i < parseInt(clusterConfig.require("controls")); i++)
    nodes.push({ ...createInstance("control-" + i, true) });

  nodes.filter(n => n.isControl).forEach(n =>
    new gcp.compute.InstanceGroupMembership(n.nodeName + "-instancegroup-membership", {
      instance: n.inst.name,
      instanceGroup: network.resources.instanceGroup.name,
      zone: gcp.config.zone
    }, { dependsOn: [network.resources.tcp443FwdRule] })
  );

  return nodes
}

