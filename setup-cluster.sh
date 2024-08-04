#!/bin/sh

kubectl --context admin@gcp-talos --namespace default create secret docker-registry gcr-secret --docker-server eu.gcr.io --docker-username _json_key --docker-password "$(/bin/cat secrets/gar-access-key)"

