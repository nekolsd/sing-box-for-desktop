import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface VersionMetadata {
  version?: unknown;
  version_code?: unknown;
  go_version?: unknown;
}

function readVersionMetadata(): VersionMetadata {
  return JSON.parse(
    readFileSync(path.join(repositoryRoot, "version.json"), "utf-8"),
  ) as VersionMetadata;
}

export function readApplicationVersion(): string {
  const versionMetadata = readVersionMetadata();
  if (typeof versionMetadata.version !== "string" || versionMetadata.version === "") {
    throw new Error("version.json contains no application version");
  }
  return versionMetadata.version;
}

// The version code orders releases for the in-app updater. Bump it for every
// release, including rebuilds of the same upstream version.
export function readApplicationVersionCode(): number {
  const versionMetadata = readVersionMetadata();
  if (
    typeof versionMetadata.version_code !== "number" ||
    !Number.isInteger(versionMetadata.version_code) ||
    versionMetadata.version_code <= 0
  ) {
    throw new Error("version.json contains no valid application version code");
  }
  return versionMetadata.version_code;
}

export function readGoVersion(): string {
  const versionMetadata = readVersionMetadata();
  if (
    typeof versionMetadata.go_version !== "string" ||
    !/^go[0-9]+\.[0-9]+(?:\.[0-9]+)?$/u.test(versionMetadata.go_version)
  ) {
    throw new Error("version.json contains no valid Go version");
  }
  return versionMetadata.go_version;
}
