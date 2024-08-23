import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const k8sAapiTCPPort = {
  name: "tcp6443",
  port: 6443 // Kubernetes API server port
}
const httpPort = {
  name: "http80",
  port: 80
}
const httpsPort = {
  name: "https443",
  port: 443
}


export function createNetwork(controlTag: string, domainName: string, nodeportHttp: string) {
  const network = new gcp.compute.Network("talos-network", {
    autoCreateSubnetworks: false,
  });
  const subnet = new gcp.compute.Subnetwork("talos-subnet", {
    ipCidrRange: "10.0.0.0/8",
    network: network.id,
  });

  const firewallRules = createFirewallRules(network.selfLink, controlTag, nodeportHttp);
  const namedNodeportHttp = { name: "nodeporthttp", port: parseInt(nodeportHttp) }

  const instanceGroup = new gcp.compute.InstanceGroup("talos-ig", {
    namedPorts: [k8sAapiTCPPort, namedNodeportHttp],
    network: network.id,
  })

  const healthCheck = new gcp.compute.HealthCheck("talos-hc", {
    logConfig: { enable: true },
    tcpHealthCheck: { port: k8sAapiTCPPort.port }
  })

  const pubIp = new gcp.compute.GlobalAddress("talos-lb-ip")

  const backendServiceK8sApi = new gcp.compute.BackendService("talos-be-tcp", {
    portName: k8sAapiTCPPort.name,
    timeoutSec: 300,
    healthChecks: healthCheck.selfLink,
    logConfig: { enable: true },
    protocol: "TCP",
    backends: [{ group: instanceGroup.selfLink }]
  })

  const k8sApiTargetTCPProxy = new gcp.compute.TargetTCPProxy("kapi-proxy", {
    backendService: backendServiceK8sApi.name,
  })
  const k8sApiFwdRule = new gcp.compute.GlobalForwardingRule("kapi-fwd-rule", {
    portRange: k8sAapiTCPPort.port.toString(),
    ipAddress: pubIp.address,
    target: k8sApiTargetTCPProxy.selfLink,
    loadBalancingScheme: "EXTERNAL"
  })

  const backendServicePublicTCP = new gcp.compute.BackendService("public-tcp-be", {
    portName: namedNodeportHttp.name,
    timeoutSec: 300,
    healthChecks: healthCheck.selfLink,
    logConfig: { enable: true },
    protocol: "TCP",
    backends: [{ group: instanceGroup.selfLink }]
  })
  const k8sPublicTCPProxy = new gcp.compute.TargetTCPProxy("public-tcp-proxy", {
    backendService: backendServicePublicTCP.name,
  })
  const k8sPublicFwdRule = new gcp.compute.GlobalForwardingRule("public-tcp-fwd-rule", {
    portRange: httpPort.port.toString(),
    ipAddress: pubIp.address,
    target: k8sPublicTCPProxy.selfLink,
    loadBalancingScheme: "EXTERNAL"
  })

  const dnsZone = new gcp.dns.ManagedZone("talos-dns-zone", {
    dnsName: `${domainName}.`,
    visibility: "public",
    dnssecConfig: {
      state: "off"
    }
  })
  const aRecordRoot = new gcp.dns.RecordSet("talos-dns-a-record-root", {
    managedZone: dnsZone.name,
    name: dnsZone.dnsName,
    type: "A",
    ttl: 50,
    rrdatas: [pubIp.address]
  })
  const aRecordWWW = new gcp.dns.RecordSet("talos-dns-a-record-www", {
    managedZone: dnsZone.name,
    name: pulumi.interpolate`www.${dnsZone.dnsName}`,
    type: "A",
    ttl: 50,
    rrdatas: [pubIp.address]
  })
  const aRecordWildcard= new gcp.dns.RecordSet("talos-dns-a-record-wildcard", {
    managedZone: dnsZone.name,
    name: pulumi.interpolate`*.${dnsZone.dnsName}`,
    type: "A",
    ttl: 50,
    rrdatas: [pubIp.address]
  })

  return {
    k8sAapiTCPPort,
    resources: {
      pubIp: pubIp,
      k8sApiNetwork: {
        backend: backendServiceK8sApi,
        tcpProxy: k8sApiTargetTCPProxy,
        fwdRule: k8sApiFwdRule,
      },
      HttpTcpPublicNetwork: {
        fwdRule: k8sPublicFwdRule,
        tcpProxy: k8sPublicTCPProxy,
        backend: backendServicePublicTCP,
      },
      firewallRules,
      instanceGroup,
      healthCheck,
      network,
      subnet,
      dns: {
        aRecordRoot,
        aRecordWWW,
        aRecordWildcard,
        dnsZone,
      }
    }
  }
}

function createFirewallRules(network: pulumi.Output<string>, controlTag: string, nodeportHttp: string) {
  const controlplaneFirewall = new gcp.compute.Firewall("talos-controlplane-firewall", {
    network,
    allows: [{
      protocol: "tcp",
      ports: [k8sAapiTCPPort.port.toString(), nodeportHttp],
    }],
    // gcp lb ranges
    sourceRanges: ["130.211.0.0/22", "35.191.0.0/16"],
    targetTags: [controlTag],
  });
  const talosctlFirewall = new gcp.compute.Firewall("talosctl-firewall", {
    network,
    allows: [{
      protocol: "tcp",
      ports: ["50000"],
    }],
    sourceRanges: ["0.0.0.0/0"],
    targetTags: [controlTag],
  });

  const allowInternalTcp = new gcp.compute.Firewall("allow-internal-tcp", {
    network,
    allows: [{
      protocol: "tcp",
      ports: ["0-65535"],
    }],
    sourceRanges: ["10.0.0.0/8"],
  });
  const allowInternalUdp = new gcp.compute.Firewall("allow-internal-udp", {
    network,
    allows: [{
      protocol: "udp",
      ports: ["0-65535"],
    }],
    sourceRanges: ["10.0.0.0/8"],
  });
  return { talosctlFirewall, controlplaneFirewall, allowInternalTcp, allowInternalUdp };
}
