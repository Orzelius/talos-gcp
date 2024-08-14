#!/bin/sh
STACK=$(pulumi stack output -j)
REGION=$(jq -r '.default.dockerRegistry.region' <<< $STACK)
echo "docker registry region: $REGION"

kubectl --context admin@gcp-talos --namespace default create secret docker-registry gcr-secret --docker-server ${REGION} --docker-username _json_key --docker-password "$(/bin/cat secrets/gar-access-key)"

