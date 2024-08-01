import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const tcpPort = {
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


export function createNetwork(controlTag: string) {
  const network = new gcp.compute.Network("talos-network", {
    autoCreateSubnetworks: false,
  });
  const subnet = new gcp.compute.Subnetwork("talos-subnet", {
    ipCidrRange: "10.0.1.0/24",
    network: network.id,
  });

  const { talosctlFirewall, controlplaneFirewall, httpFirewall } = createFirewallRules(network.selfLink, controlTag);

  const instanceGroup = new gcp.compute.InstanceGroup("talos-ig", {
    namedPorts: [tcpPort, httpPort],
    network: network.id,
  })

  const healthCheck = new gcp.compute.HealthCheck("talos-hc", {
    logConfig: { enable: true },
    tcpHealthCheck: { port: tcpPort.port }
  })

  const backendServiceTCP = new gcp.compute.BackendService("talos-be-tcp", {
    portName: tcpPort.name,
    timeoutSec: 300,
    healthChecks: healthCheck.selfLink,
    logConfig: { enable: true },
    protocol: "TCP",
    backends: [{ group: instanceGroup.selfLink }]
  })

  const targetTCPProxy = new gcp.compute.TargetTCPProxy("talos-tcp-proxy", {
    backendService: backendServiceTCP.name,
  })

  const LoadBalancerIP = new gcp.compute.GlobalAddress("talos-lb-ip")

  const tcp443FwdRule = new gcp.compute.GlobalForwardingRule("talos-fwd-rule", {
    portRange: "443",
    ipAddress: LoadBalancerIP.address,
    target: targetTCPProxy.selfLink
  })

  return {
    tcpPort,
    resources: {
      instanceGroup,
      healthCheck,
      backendService: backendServiceTCP,
      targetTCPProxy,
      LoadBalancerIP,
      tcp443FwdRule,
      talosctlFirewall,
      controlplaneFirewall,
      httpFirewall,
      network,
      subnet
    }
  }
}

function createFirewallRules(network: pulumi.Output<string>, controlTag: string) {
  const controlplaneFirewall = new gcp.compute.Firewall("talos-controlplane-firewall", {
    network,
    allows: [{
      protocol: "tcp",
      ports: [tcpPort.port.toString()],
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
  const httpFirewall = new gcp.compute.Firewall("talos-http-firewall", {
    network,
    allows: [{
      protocol: "tcp",
      ports: [httpPort.port.toString(), httpsPort.port.toString()],
    }],
    sourceRanges: ["0.0.0.0/0"],
    targetTags: [controlTag],
  });
  return { talosctlFirewall, controlplaneFirewall, httpFirewall };
}
