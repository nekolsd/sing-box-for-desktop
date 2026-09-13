# sing-box-nekolsd

sing-box 的 Windows 和 Linux 桌面客户端，基于 [SagerNet/sing-box-for-desktop](https://github.com/SagerNet/sing-box-for-desktop)
修改，使用 [nekolsd/sing-box](https://github.com/nekolsd/sing-box) 内核构建。

它使用独立的应用名称、安装目录、数据目录和后台服务，可以和原版 sing-box 客户端同时安装、同时运行，
互不影响，也不会读取或迁移原版的配置。

## 下载

前往 [Releases](https://github.com/nekolsd/sing-box-for-desktop/releases) 下载最新版本。

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `SFW-<版本>-x64.exe` | 普通 Intel/AMD 电脑 |
| Windows | `SFW-<版本>-arm64.exe` | Windows on ARM 设备 |
| Linux | `SFL-<版本>-x64.deb` / `.rpm` / `.pkg.tar.zst` | Intel/AMD 电脑，按发行版选择 |
| Linux | `SFL-<版本>-arm64.deb` / `.rpm` / `.pkg.tar.zst` | ARM 设备，按发行版选择 |

每个版本附带 `SHA256SUMS-*.txt`，可用于校验下载的文件。

## 安装

### Windows

运行下载的安装程序，按提示完成安装。安装程序使用自签名证书签名，
Windows 可能显示 SmartScreen 提示，选择「更多信息」后仍可继续安装。

### Linux

**Arch Linux** 推荐通过软件源安装，包会随版本自动更新，并由软件源的密钥签名：

1. 按 [nekolsd 软件源说明](https://git.lsd.moe/nekolsd/pkgbuilds) 安装 keyring 并把 `repo.lsd.moe` 加入 `pacman.conf`。
2. 安装：`sudo pacman -S sing-box-nekolsd-desktop-bin`

软件源里这个包的构建脚本在 [pkgbuilds 仓库](https://git.lsd.moe/nekolsd/pkgbuilds/src/branch/main/packages/sing-box-nekolsd-desktop-bin)。
Releases 页面里的 `SFL-<版本>-<架构>.pkg.tar.zst` 也可以直接用 `sudo pacman -U` 安装，
但它没有签名，也不会跟随软件源更新。

**Debian / Ubuntu**：`sudo apt install ./SFL-<版本>-<架构>.deb`

**Fedora / openSUSE**：`sudo dnf install ./SFL-<版本>-<架构>.rpm` 或 `sudo zypper install ./SFL-<版本>-<架构>.rpm`

安装后后台服务 `sing-box-daemon-nekolsd` 会自动启动，应用名称为 `sing-box-nekolsd`。

## 更新

Windows 版可以在设置中检查更新，也可以开启自动检查。
更新来源为本仓库的 Releases，每个新发布的版本都会作为更新提示，包括预发布版本。

Linux 版没有内置更新功能。Arch Linux 通过软件源随系统一起更新，
其他发行版请下载新版本后通过包管理器升级。

## 配置文件

应用注册 `sing-box-nekolsd://` 链接和 `.nbpf` 配置文件。
其他 sing-box 客户端分享的 `sing-box://` 链接和 `.bpf` 文件仍然可以导入，格式相同。

## 反馈

遇到问题请提交 [Issue](https://github.com/nekolsd/sing-box-for-desktop/issues)，
附上应用版本、操作系统、处理器架构以及脱敏后的错误日志。

## License

```
Copyright (C) 2022 by nekohasekai <contact-sagernet@sekai.icu>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <http://www.gnu.org/licenses/>.
```
