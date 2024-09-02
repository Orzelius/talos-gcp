# talos-gcp

A talos cluster via Pulumi and GCP (typescript)

A fully running cluster and networking setup using Talos linux and gcp.

This project is based on the [Sidero Labs' cloud-platforms/gcp guide](https://www.talos.dev/v1.6/talos-guides/install/cloud-platforms/gcp/), but goes beyond it and also set ups SSL and DNS.
Unlike the guide, a separate network from the default is also created and utilized.

## Instructions

### Prerequisites

* [talosctl installed](https://www.talos.dev/v1.7/talos-guides/install/talosctl/)
* [pulumi installed](https://www.pulumi.com/docs/clouds/azure/get-started/begin/#install-pulumi)

### Setup

1. Change the values in [./Pulumi.dev.yaml](./Pulumi.dev.yaml) appropriately.

2. The domain is not initialized with pulumi, so you'll need to bring your own and configure it
to work with gcp DNS. If the domain is managed through gcp, make sure to change the dns zone to the one
created by pulumi.

1. Apply the pulumi project.

2. Run the [./setup-cluster.sh](./setup-cluster.sh) script.
