#!/usr/bin/env bash

set -euo pipefail

require_value() {
  local name="$1"

  if [ -z "${!name:-}" ]; then
    printf '%s is required\n' "$name" >&2
    exit 1
  fi
}

require_immutable_image() {
  local image="$1"

  if [[ ! "$image" =~ @sha256:[0-9a-f]{64}$ ]]; then
    printf 'IMAGE_REF must use an immutable sha256 digest\n' >&2
    exit 1
  fi
}

write_release_environment() {
  local path="$1"
  local previous_image="${2:-}"

  {
    printf 'SOURCE_COMMIT=%s\n' "$CI_COMMIT_SHA"
    printf 'IMAGE_TAG=%s\n' "$IMAGE_TAG"
    printf 'IMAGE_REF=%s\n' "$IMAGE_REF"

    if [ -n "$previous_image" ]; then
      printf 'PREVIOUS_IMAGE_REF=%s\n' "$previous_image"
    fi
  } > "$path"
}

build_image() {
  require_value CI_COMMIT_SHA
  require_value CI_COMMIT_SHORT_SHA
  require_value TCR_IMAGE
  require_value TCR_PUSH_USERNAME
  require_value TCR_PUSH_PASSWORD

  IMAGE_TAG="git-${CI_COMMIT_SHORT_SHA}"
  local registry="${TCR_IMAGE%%/*}"
  local metadata_file="${BUILD_METADATA_FILE:-image-metadata.json}"
  local release_environment="${RELEASE_ENV_FILE:-release.env}"
  local docker_config="${DOCKER_CONFIG:-$PWD/.docker}"
  local encoded_credentials

  mkdir -p "$docker_config"
  encoded_credentials="$(printf '%s:%s' "$TCR_PUSH_USERNAME" "$TCR_PUSH_PASSWORD" | base64 | tr -d '\n')"
  printf '{"auths":{"%s":{"auth":"%s"}}}\n' "$registry" "$encoded_credentials" > "$docker_config/config.json"

  buildctl-daemonless.sh build \
    --frontend dockerfile.v0 \
    --local context=. \
    --local dockerfile=. \
    --opt filename=Dockerfile.tcr \
    --opt platform=linux/amd64 \
    --opt "label:org.opencontainers.image.revision=${CI_COMMIT_SHA}" \
    --opt "label:org.opencontainers.image.source=${CI_PROJECT_URL:-}" \
    --output "type=image,name=${TCR_IMAGE}:${IMAGE_TAG},push=true" \
    --metadata-file "$metadata_file"

  local image_digest
  image_digest="$(sed -n 's/.*"containerimage.digest":"\(sha256:[0-9a-f]\{64\}\)".*/\1/p' "$metadata_file" | head -n 1)"
  IMAGE_REF="${TCR_IMAGE}@${image_digest}"
  require_immutable_image "$IMAGE_REF"
  write_release_environment "$release_environment"
}

deploy_image() {
  require_value IMAGE_REF
  require_value KUBE_NAMESPACE
  require_value KUBE_DEPLOYMENT
  require_value KUBE_CONTAINER
  require_immutable_image "$IMAGE_REF"

  IMAGE_TAG="${IMAGE_REF##*@}"
  CI_COMMIT_SHA="${CI_COMMIT_SHA:-unknown}"
  local rollout_timeout="${ROLLOUT_TIMEOUT:-10m}"
  local release_environment="${RELEASE_ENV_FILE:-release.env}"
  local previous_image

  previous_image="$(kubectl -n "$KUBE_NAMESPACE" get deployment "$KUBE_DEPLOYMENT" -o "jsonpath={.spec.template.spec.containers[?(@.name=='${KUBE_CONTAINER}')].image}")"

  if [ -z "$previous_image" ]; then
    printf 'Unable to determine the currently deployed image\n' >&2
    exit 1
  fi

  kubectl -n "$KUBE_NAMESPACE" set image "deployment/${KUBE_DEPLOYMENT}" "${KUBE_CONTAINER}=${IMAGE_REF}"
  kubectl -n "$KUBE_NAMESPACE" rollout status "deployment/${KUBE_DEPLOYMENT}" --timeout="$rollout_timeout"
  write_release_environment "$release_environment" "$previous_image"
}

verify_release() {
  require_value IMAGE_REF
  require_value KUBE_NAMESPACE
  require_value KUBE_DEPLOYMENT
  require_value KUBE_CONTAINER
  require_immutable_image "$IMAGE_REF"

  local actual_image
  actual_image="$(kubectl -n "$KUBE_NAMESPACE" get deployment "$KUBE_DEPLOYMENT" -o "jsonpath={.spec.template.spec.containers[?(@.name=='${KUBE_CONTAINER}')].image}")"

  if [ "$actual_image" != "$IMAGE_REF" ]; then
    printf 'Deployment image does not match IMAGE_REF\n' >&2
    exit 1
  fi

  local ready_replicas
  ready_replicas="$(kubectl -n "$KUBE_NAMESPACE" get deployment "$KUBE_DEPLOYMENT" -o 'jsonpath={.status.readyReplicas}')"

  if [ -z "$ready_replicas" ] || [ "$ready_replicas" = "0" ]; then
    printf 'Deployment has no ready replicas\n' >&2
    exit 1
  fi

  local service_url="${OUTLINE_INTERNAL_URL:-http://${KUBE_DEPLOYMENT}.${KUBE_NAMESPACE}.svc.cluster.local}"
  curl --fail --silent --show-error --max-time 20 "${service_url%/}/_health" | grep -q 'OK'
  curl --fail --silent --show-error --max-time 20 \
    --request POST \
    --header 'Content-Type: application/json' \
    --data '{}' \
    "${service_url%/}/api/auth.config" > /dev/null
}

rollback_image() {
  require_value PREVIOUS_IMAGE_REF
  require_value KUBE_NAMESPACE
  require_value KUBE_DEPLOYMENT
  require_value KUBE_CONTAINER
  require_immutable_image "$PREVIOUS_IMAGE_REF"

  local rollout_timeout="${ROLLOUT_TIMEOUT:-10m}"

  kubectl -n "$KUBE_NAMESPACE" set image "deployment/${KUBE_DEPLOYMENT}" "${KUBE_CONTAINER}=${PREVIOUS_IMAGE_REF}"
  kubectl -n "$KUBE_NAMESPACE" rollout status "deployment/${KUBE_DEPLOYMENT}" --timeout="$rollout_timeout"
}

case "${1:-}" in
  build)
    build_image
    ;;
  deploy)
    deploy_image
    ;;
  verify)
    verify_release
    ;;
  rollback)
    rollback_image
    ;;
  *)
    printf 'Usage: %s {build|deploy|verify|rollback}\n' "$0" >&2
    exit 1
    ;;
esac
