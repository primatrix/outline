import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { spawnSync } from "child_process";
import { afterEach, describe, expect, test } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts/ci/release.sh");

let temporaryDirectory: string | undefined;

afterEach(() => {
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { force: true, recursive: true });
    temporaryDirectory = undefined;
  }
});

function createTemporaryDirectory(): string {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "outline-release-test-"));

  return temporaryDirectory;
}

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents, "utf8");
  chmodSync(path, 0o755);
}

function runRelease(
  command: string,
  environment: NodeJS.ProcessEnv
): ReturnType<typeof spawnSync> {
  return spawnSync("bash", [scriptPath, command], {
    encoding: "utf8",
    env: environment,
  });
}

describe("release.sh", () => {
  test("pipeline isolates build and manual production deployment jobs", () => {
    const pipeline = readFileSync(
      resolve(process.cwd(), ".gitlab-ci.yml"),
      "utf8"
    );

    expect(pipeline).toContain("outline-build");
    expect(pipeline).toContain("outline-deploy");
    expect(pipeline).toContain("artifacts:");
    expect(pipeline).toContain("dotenv: release.env");
    expect(pipeline).toContain("when: manual");
    expect(pipeline).toContain("$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH");
    expect(pipeline).toContain(
      "BUILDKITD_FLAGS: --oci-worker-no-process-sandbox"
    );
    expect(pipeline).toContain("KUBECTL_VERSION: v1.34.7");
    expect(pipeline).toContain("KUBECTL_SHA256:");
    expect(pipeline).not.toContain("bitnami/kubectl");
    expect(pipeline).toContain("access: developer");
    expect(pipeline).not.toContain("access: maintainer");
    expect(pipeline).toContain("test-client");
    expect(pipeline).toContain("test-server");
    expect(pipeline).toContain("name: postgres:14.2");
    expect(pipeline).toContain("yarn sequelize db:migrate");
    expect(pipeline).toContain("yarn test:server --maxWorkers=2");
  });

  test("deployment runner RBAC cannot read secrets or update other deployments", () => {
    const rbac = readFileSync(
      resolve(process.cwd(), "k8s/ci/outline-deployer-rbac.yaml"),
      "utf8"
    );

    expect(rbac).toContain("name: outline-ci-deployer");
    expect(rbac).toContain("kind: Namespace");
    expect(rbac).toContain("name: gitlab-ci");
    expect(rbac).toContain("namespace: outline");
    expect(rbac).toContain("resourceNames:");
    expect(rbac).toContain("- outline");
    expect(rbac).not.toContain("- secrets");
  });

  test("runner values keep build and deployment service accounts separate", () => {
    const buildRunner = readFileSync(
      resolve(process.cwd(), "k8s/ci/outline-build-runner-values.yaml"),
      "utf8"
    );
    const deployRunner = readFileSync(
      resolve(process.cwd(), "k8s/ci/outline-deploy-runner-values.yaml"),
      "utf8"
    );

    expect(buildRunner).toContain('service_account = "outline-ci-builder"');
    expect(deployRunner).toContain('service_account = "outline-ci-deployer"');
    expect(deployRunner).toContain('allowed_images = ["alpine:3.21.3"]');
    expect(buildRunner).toContain("privileged = false");
    expect(deployRunner).toContain("privileged = false");
    expect(buildRunner).toContain('runnerToken: ""');
    expect(deployRunner).toContain('runnerToken: ""');
  });

  test("build publishes the immutable TCR digest as a release artifact", () => {
    const directory = createTemporaryDirectory();
    const binaryDirectory = join(directory, "bin");
    const commandLog = join(directory, "commands.log");
    const releaseEnvironment = join(directory, "build.env");
    const dockerConfig = join(directory, "docker-config");
    const metadataFile = join(directory, "image-metadata.json");

    mkdirSync(binaryDirectory);

    writeExecutable(
      join(binaryDirectory, "buildctl-daemonless.sh"),
      `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$COMMAND_LOG"
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--metadata-file" ]; then
    printf '%s' '{"containerimage.config.digest":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","containerimage.digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' > "$2"
    exit 0
  fi
  shift
done
exit 1
`
    );

    const result = runRelease("build", {
      ...process.env,
      CI_COMMIT_SHA: "a".repeat(40),
      CI_COMMIT_SHORT_SHA: "aaaaaaaa",
      COMMAND_LOG: commandLog,
      BUILD_METADATA_FILE: metadataFile,
      DOCKER_CONFIG: dockerConfig,
      PATH: `${binaryDirectory}:${process.env.PATH}`,
      RELEASE_ENV_FILE: releaseEnvironment,
      TCR_IMAGE: "outline-prod-tcr.tencentcloudcr.com/outline/outline",
      TCR_PUSH_PASSWORD: "password",
      TCR_PUSH_USERNAME: "tcr$outline-ci-push",
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(readFileSync(commandLog, "utf8")).toContain(
      "type=image,name=outline-prod-tcr.tencentcloudcr.com/outline/outline:git-aaaaaaaa,push=true"
    );
    expect(readFileSync(releaseEnvironment, "utf8")).toContain(
      "IMAGE_REF=outline-prod-tcr.tencentcloudcr.com/outline/outline@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
  });

  test("deploy records the prior image before rolling out the release digest", () => {
    const directory = createTemporaryDirectory();
    const binaryDirectory = join(directory, "bin");
    const commandLog = join(directory, "commands.log");
    const releaseEnvironment = join(directory, "deploy.env");
    const previousImage =
      "outline-prod-tcr.tencentcloudcr.com/outline/outline@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const image =
      "outline-prod-tcr.tencentcloudcr.com/outline/outline@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    mkdirSync(binaryDirectory);

    writeExecutable(
      join(binaryDirectory, "kubectl"),
      `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$COMMAND_LOG"
case "$*" in
  *"get deployment outline"*) printf '%s' "$PREVIOUS_IMAGE_REF" ;;
esac
`
    );

    const result = runRelease("deploy", {
      ...process.env,
      COMMAND_LOG: commandLog,
      IMAGE_REF: image,
      KUBE_CONTAINER: "outline",
      KUBE_DEPLOYMENT: "outline",
      KUBE_NAMESPACE: "outline",
      PATH: `${binaryDirectory}:${process.env.PATH}`,
      PREVIOUS_IMAGE_REF: previousImage,
      RELEASE_ENV_FILE: releaseEnvironment,
      ROLLOUT_TIMEOUT: "10m",
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(readFileSync(commandLog, "utf8")).toContain(
      `set image deployment/outline outline=${image}`
    );
    expect(readFileSync(commandLog, "utf8")).toContain(
      "rollout status deployment/outline --timeout=10m"
    );
    expect(readFileSync(releaseEnvironment, "utf8")).toContain(
      `PREVIOUS_IMAGE_REF=${previousImage}`
    );
  });
});
