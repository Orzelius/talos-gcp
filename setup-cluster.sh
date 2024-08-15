#!/bin/sh
STACK=$(pulumi stack output -j)
REGION=$(jq -r '.default.dockerRegistry.region' <<< $STACK)
HOSTNAME=$(jq -r '.default.dockerRegistry.hostname' <<< $STACK)
echo "docker registry region: $REGION"
echo "docker registry hostname: $HOSTNAME"

kubectl --context admin@gcp-talos --namespace default create secret docker-registry gcr-secret --docker-server ${HOSTNAME} --docker-username _json_key --docker-password "$(/bin/cat secrets/gar-access-key)"

