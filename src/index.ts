import * as gcp from "@pulumi/gcp";
import { ensureTalosImageAsset } from './image'
import * as pulumi from "@pulumi/pulumi";

const clusterConfig = new pulumi.Config("cluster")

const up = async () => {
  const bucket = new gcp.storage.Bucket("talos", {
    location: gcp.config.region!
  });

  const image = await ensureTalosImageAsset(bucket);

  return {
    bucket: {
      name: bucket.url,
    },
    clusterCfg: clusterConfig,
  };
}


export default up().then(res => res)
