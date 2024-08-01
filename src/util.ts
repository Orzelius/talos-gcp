import { Instance } from "@pulumi/gcp/compute";

export const repoRoot = __dirname + "/../"
export const assetsPath = repoRoot + "assets/"

export const getNatIp = (inst: Instance) => inst.networkInterfaces.apply(nIs => nIs[0].accessConfigs![0].natIp)

