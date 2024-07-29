import * as gcp from "@pulumi/gcp";
import { ensureTalosImageAsset } from './image'
import { createNetwork } from './network'
import { createTalosConfig } from './talos'
import * as pulumi from "@pulumi/pulumi";

const clusterConfig = new pulumi.Config("cluster")

const up = async () => {
  const bucket = new gcp.storage.Bucket("talos", {
    location: gcp.config.region!
  });

  const image = await ensureTalosImageAsset(bucket);
  const controlTag = "controlplane"
  const network = createNetwork(controlTag)

  const clusterEndpoint = network.resources.tcp443FwdRule.ipAddress.apply(v => `https://${v}:443`)
  const talosMachineCfg = createTalosConfig(clusterEndpoint, clusterConfig.require("name"));

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
