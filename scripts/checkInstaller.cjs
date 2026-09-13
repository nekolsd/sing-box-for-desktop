// Compiles the Windows installer scripts with the same NSIS toolset CI uses,
// without packaging the application, so changes to build/installer.nsh and
// electron-builder.yml can be checked locally on any platform.
//
// Usage: node scripts/checkInstaller.cjs
//
// electron-builder's script generation is reused as-is; only the packager is
// replaced by a stub that serves files from this repository. The generated
// scripts and the makensis output are written to release/installer-check.
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const projectDir = path.resolve(__dirname, "..");
const outDir = path.join(projectDir, "release", "installer-check");
// app-builder-lib is a dependency of electron-builder, so resolve it from there.
const electronBuilderDir = path.dirname(require.resolve("electron-builder/package.json", { paths: [projectDir] }));
const libDir = path.dirname(require.resolve("app-builder-lib/package.json", { paths: [electronBuilderDir] }));
const req = (name) => require(require.resolve(name, { paths: [libDir] }));
const yaml = req("js-yaml");
const { CancellationToken } = req("builder-util-runtime");
require(libDir); // load the package entry first so its internal import cycle resolves
const { NsisTarget } = require(path.join(libDir, "out/targets/nsis/NsisTarget"));
const { nsisTemplatesDir } = require(path.join(libDir, "out/targets/nsis/nsisUtil"));
const { getMakeNsisPath } = require(path.join(libDir, "out/toolsets/windows"));

const config = yaml.load(fs.readFileSync(path.join(projectDir, "electron-builder.yml"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
const { version } = JSON.parse(fs.readFileSync(path.join(projectDir, "version.json"), "utf8"));
const productName = config.productName;
const buildResourcesDir = path.join(projectDir, config.directories.buildResources);
const resourceList = fs.readdirSync(buildResourcesDir);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let tempCounter = 0;
const packager = {
  projectDir,
  compression: "normal",
  config: { toolsets: config.toolsets, fileAssociations: config.fileAssociations },
  platformSpecificBuildOptions: config.win,
  appInfo: { productName },
  info: { buildResourcesDir, cancellationToken: new CancellationToken() },
  get resourceList() {
    return Promise.resolve(resourceList);
  },
  get fileAssociations() {
    return [...(config.fileAssociations ?? []), ...(config.win.fileAssociations ?? [])];
  },
  async getTempFile(name) {
    tempCounter += 1;
    return path.join(outDir, `${tempCounter}-${name}`);
  },
  async getResource(custom, ...names) {
    if (custom === undefined) {
      for (const name of names) {
        if (resourceList.includes(name)) {
          return path.join(buildResourcesDir, name);
        }
      }
    } else if (custom != null && custom.trim() !== "") {
      if (resourceList.includes(custom)) {
        return path.join(buildResourcesDir, custom);
      }
      const resolved = path.resolve(projectDir, custom);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }
    return null;
  },
};

const target = Object.create(NsisTarget.prototype);
target.name = "nsis";
target.packager = packager;
target.options = { ...config.nsis, unicode: true };

function placeholder(name) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, "placeholder");
  return file;
}

async function main() {
  const sharedHeader = await target.computeCommonInstallerScriptHeader();
  const script = fs.readFileSync(path.join(nsisTemplatesDir, "installer.nsi"), "utf8");
  const iconPath = path.join(projectDir, "resources", "icon.ico");
  const uninstallerOut = path.join(outDir, "uninstaller.exe");
  const defines = {
    APP_ID: config.win.appId,
    APP_GUID: "00000000-0000-0000-0000-000000000000",
    UNINSTALL_APP_KEY: "00000000-0000-0000-0000-000000000000",
    PRODUCT_NAME: productName,
    PRODUCT_FILENAME: productName,
    APP_FILENAME: productName,
    APP_DESCRIPTION: pkg.description,
    VERSION: version,
    PROJECT_DIR: projectDir,
    BUILD_RESOURCES_DIR: buildResourcesDir,
    APP_PACKAGE_NAME: productName,
    UNINSTALL_URL_HELP: pkg.homepage,
    UNINSTALL_URL_INFO_ABOUT: pkg.homepage,
    UNINSTALL_URL_UPDATE_INFO: pkg.homepage,
    UNINSTALL_URL_README: pkg.homepage,
    MUI_ICON: iconPath,
    MUI_UNICON: iconPath,
    APP_64: placeholder("app-x64.nsis.7z"),
    APP_64_NAME: "app-x64.nsis.7z",
    APP_64_HASH: "00",
    APP_64_UNPACKED_SIZE: "1",
    COMPANY_NAME: pkg.author.name,
    APP_INSTALLER_STORE_FILE: `${productName}-updater\\installer.exe`,
    COMPRESSION_METHOD: "7z",
    MULTIUSER_INSTALLMODE_ALLOW_ELEVATION: null,
    INSTALL_MODE_PER_ALL_USERS: null,
    INSTALL_MODE_PER_ALL_USERS_REQUIRED: null,
    SHORTCUT_NAME: productName,
    UNINSTALL_DISPLAY_NAME: `${productName} ${version}`,
    MUI_HEADERIMAGE: null,
    MUI_HEADERIMAGE_RIGHT: null,
    MUI_HEADERIMAGE_BITMAP: path.join(buildResourcesDir, "installerHeader.bmp"),
    MUI_WELCOMEFINISHPAGE_BITMAP: path.join(buildResourcesDir, "installerSidebar.bmp"),
    MUI_UNWELCOMEFINISHPAGE_BITMAP: path.join(buildResourcesDir, "installerSidebar.bmp"),
    ESTIMATED_SIZE: "1",
    COMPRESS: "auto",
    UNINSTALLER_OUT_FILE: uninstallerOut,
  };
  const lang = "1033";
  const commands = {
    OutFile: `"${path.join(outDir, "installer.exe")}"`,
    VIProductVersion: `${version.split("-")[0]}.0`,
    VIAddVersionKey: [
      `/LANG=${lang} ProductName "${productName}"`,
      `/LANG=${lang} ProductVersion "${version}"`,
      `/LANG=${lang} LegalCopyright "${config.copyright}"`,
      `/LANG=${lang} FileDescription "${pkg.description}"`,
      `/LANG=${lang} FileVersion "${version}"`,
      `/LANG=${lang} CompanyName "${pkg.author.name}"`,
    ],
    Unicode: true,
  };
  const makensis = await getMakeNsisPath(config.toolsets?.nsis, config.nsis?.customNsisBinary);

  async function compile(label, extraDefines, isInstaller) {
    const finalScript = sharedHeader + (await target.computeFinalScript(script, isInstaller, new Map()));
    fs.writeFileSync(path.join(outDir, `${label}.nsi`), finalScript);
    const args = ["-INPUTCHARSET", "UTF8"];
    for (const [name, value] of Object.entries({ ...defines, ...extraDefines })) {
      args.push(value == null ? `-D${name}` : `-D${name}=${value}`);
    }
    for (const [name, value] of Object.entries(commands)) {
      for (const command of Array.isArray(value) ? value : [value]) {
        args.push(`-X${name} ${command}`);
      }
    }
    args.push("-");
    const result = spawnSync(makensis.path, args, {
      input: finalScript,
      cwd: nsisTemplatesDir,
      encoding: "utf8",
      maxBuffer: 64 << 20,
      env: { ...process.env, ...(makensis.env ?? {}) },
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    fs.writeFileSync(path.join(outDir, `${label}.log`), output);
    const problems = output
      .split("\n")
      .filter((line) => /error|warning/i.test(line) && !/warning 6030/.test(line));
    console.log(`${label}: makensis exited with ${result.status}`);
    for (const line of problems) {
      console.log(`  ${line.trim()}`);
    }
    return result.status;
  }

  const uninstaller = await compile("uninstaller", { BUILD_UNINSTALLER: null }, false);
  if (uninstaller !== 0) {
    process.exit(uninstaller);
  }
  // The real build embeds the uninstaller produced by the first compilation;
  // a placeholder is enough to check the installer script.
  if (!fs.existsSync(uninstallerOut)) {
    placeholder("uninstaller.exe");
  }
  process.exit(await compile("installer", {}, true));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
