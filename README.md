# FileCat 文件整理猫

> 受够了“最终版2最终版”？让猫帮你收拾。

FileCat 是喵造实验室 009：一个 **local-first、安全优先** 的 Windows 文件整理工具。

## v0.1 MVP

- 选择一个文件夹扫描
- 只扫描当前层，不进入已有子文件夹
- 按文件类型生成整理分类
- SHA-256 真重复文件检测
- “最终版 / final / v2 / 副本 / (2)”等疑似版本家族检测
- 执行前完整预览
- 分类可取消勾选
- 整理到当前目录下的 `FileCat_整理/`
- 同名目标自动避让，不覆盖
- 一键撤销上一次整理
- 不永久删除任何文件

## 安全原则

FileCat v0.1 默认拒绝直接整理：

- 磁盘根目录
- Windows
- Program Files
- Program Files (x86)
- ProgramData
- AppData
- $Recycle.Bin
- System Volume Information

第一版建议先从 **下载 / 桌面 / 自己创建的测试目录** 开始。

## 开发

```bash
npm install
npm test
npm run check
npm start
```

Windows 安装包：

```bash
npm run dist:win
```

## 设计原则

> AI 可以建议，最终移动权永远在人。

v0.1 先把“扫描 → 预览 → 整理 → 撤销”做稳，再逐步加入更聪明的内容分类、旧文件提示和清理建议。
