import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as fs from 'fs'
import * as streamPromises from 'stream/promises'
import * as stream from 'stream'

const clusterConfig = new pulumi.Config("cluster")

const up = async () => {
  const bucket = new gcp.storage.Bucket("talos", {
    location: gcp.config.region!
  });

  await ensureTalosImageAsset(bucket);

  return {
    bucket: {
      name: bucket.url,
    },
    clusterCfg: clusterConfig
  };
}


export default up().then(res => res)

async function ensureTalosImageAsset(bucket: gcp.storage.Bucket) {
  const talosReleaseAssetName = "gcp-amd64.raw.tar.gz";
  const talosFileName = "talos" + clusterConfig.require("talosVersion") + talosReleaseAssetName;
  const talosFilePath = __dirname + "/assets/" + talosFileName;
  const imageFileExists = fs.existsSync(talosFilePath);

  if (!imageFileExists) {
    console.log("no talos image found on disk");
    console.log("downloading talos " + talosFileName);
    const release = `https://github.com/siderolabs/talos/releases/download/${clusterConfig.require("talosVersion")}/${talosReleaseAssetName}`;
    const resp = await fetch(release);
    if (resp.ok && resp.body) {
      const writeStream = fs.createWriteStream(talosFilePath);
      await streamPromises.finished(stream.Readable.fromWeb(resp.body as any).pipe(writeStream));
    }
  }
  const talosImageBucketObject = new gcp.storage.BucketObject("talosImage", {
    name: talosFileName,
    source: new pulumi.asset.FileAsset(talosFilePath),
    bucket: bucket.name,
  });

  const talosImage = new gcp.compute.Image("talos", {
    rawDisk: {
      source: talosImageBucketObject.selfLink
    },
    guestOsFeatures: [{ type: "VIRTIO_SCSI_MULTIQUEUE" }]
  })
}

