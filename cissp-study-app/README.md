# CISSP 本地刷题 App

本地优先（Local-First）的 CISSP 备考刷题应用，支持桌面/手机浏览器 PWA 离线使用，并可通过 Capacitor 打包为 Android APK。

## 主要功能

- 内置 5,253 道多源题库（官方大纲原创题 1,524 + CISSP-Zero-to-Hero 229 + 补充题库 3,500）与 8 大 Domain 学习笔记。
- 深色/浅色模式切换，支持移动端与桌面端自适应布局。
- 按 Domain、题库来源和关键词筛选，支持单选/多选及英文原题对照。
- 错题本自动按主题归类，配合 1 / 3 / 7 天间隔重复复习机制。
- 每个 Domain 独立正确率统计与高频错因分析。
- 支持粘贴 CSV 或 JSON 导入自定义题目，数据保存在浏览器 `localStorage`。

## 本地开发

```bash
npm install
npm run dev
```

启动后访问 `http://localhost:5173/`（局域网手机可通过本机局域网 IP + `:5173` 访问）。

## 构建生产包

```bash
npm run build
```

构建前会自动运行 `npm run prepare-data` 从上级目录读取题库与笔记并生成 `src/data/seedData.json`，最终产物输出至 `dist/`。

## Android 打包

```bash
npm run build
npx cap sync android
npx cap open android
```

也可以直接运行 `./scripts/build-apk.sh` 构建 Debug APK。若需要 Release 签名，请参考 `android/keystore.properties.example` 在本地创建 `android/keystore.properties`。
