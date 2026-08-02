# Changelog — v3.0.0 全面修复

## 修复日期：2026年7月10日

---

## 1. 🔒 安全修复

### 1.1 默认 HOST 改为 localhost
- **文件**: `app.py`, `.env.example`, `modules/config.py`
- **变更**: `0.0.0.0` → `127.0.0.1`
- **原因**: 防止服务意外暴露到公网

### 1.2 添加 API 认证（可选）
- **新增文件**: `modules/auth.py`
- **功能**: 设置 `API_SECRET_KEY` 环境变量后，所有 `/gen` 和 `/api/*` 写入端点需要 Bearer token
- **默认**: 未设置时为本地开发模式，无需认证

### 1.3 添加输入验证
- **文件**: `app.py`
- **变更**: 所有 POST 端点添加空请求体检查和 prompt 长度限制（200000字符）

---

## 2. 🏗️ 架构改进

### 2.1 统一版本号（单一数据源）
- **新增文件**: `modules/config.py`
- **统一版本**: `APP_VERSION = "3.0.0"`
- **修复文件**:
  - `app.py`: 使用 `APP_VERSION` 常量
  - `templates/docs.html`: `v2.1.0` → `v3.0.0`（3处）
  - `static/style.css`: 注释头更新
  - `static/app.js`: 注释头更新

### 2.2 消除猴子补丁（Monkey-Patching）
- **文件**: `modules/memory.py`
- **变更**:
  - `SemanticIndex.search()` 增强版直接内建到类中（不再外部替换）
  - `HierarchicalMemory` 的 `auto_consolidate`、`get_memory_stats`、`compress_context` 方法直接定义在类中
- **移除**: `_enhanced_search` 独立函数和 `SemanticIndex.search = _enhanced_search` 补丁

### 2.3 统一禁用词列表（单一数据源）
- **新增**: `modules/config.py` 中定义 `BANNED_WORDS`、`AI_TRANSITION_WORDS`、`AI_WORD_MAPPINGS`
- **修改**: `modules/quality.py` 从 `config.py` 导入（不再重复定义）
- **新增 API**: `/api/anti-ai/config` — 前端启动时从此接口同步配置

### 2.4 前端反AI味配置同步
- **文件**: `static/app.js`
- **新增**: `syncAntiAIConfig()` 函数
- **功能**: 启动时从后端 `/api/anti-ai/config` 同步最新禁用词和映射表

---

## 3. 🐛 Bug 修复

### 3.1 中文正则表达式范围修复
- **文件**: `modules/memory.py`, `modules/quality.py`
- **变更**: `[一-鿿]` → `[一-龥]`
- **原因**: `鿿`(U+9FFF) 是 CJK 统一表意文字区块结尾，但常用中文字符到 `龥`(U+9FA5)

---

## 4. 🆕 新增功能

### 4.1 可选 SQLite 数据库持久化
- **新增文件**: `modules/database.py`
- **功能**: 设置 `ENABLE_DATABASE=true` 后，项目数据同时保存到浏览器和 SQLite
- **表结构**:
  - `projects`: 项目元数据和完整状态
  - `chapters`: 章节内容、摘要、评分
  - `memories`: 语义记忆条目
  - `config_snapshots`: 配置快照
- **新增 API**: `/api/db/sync` — 前端同步数据到数据库

### 4.2 健康检查增强
- **文件**: `app.py` → `/api/health`
- **新增字段**: `version`（使用统一版本号）、`auth_enabled`

---

## 5. 📁 文件变更清单

### 新增文件
| 文件 | 用途 |
|------|------|
| `modules/config.py` | 集中配置：版本、禁用词、默认设置 |
| `modules/auth.py` | API 认证模块 |
| `modules/database.py` | SQLite 持久化模块 |
| `CHANGELOG_v3.md` | 本变更日志 |

### 修改文件
| 文件 | 主要变更 |
|------|----------|
| `app.py` | 使用集中配置、添加认证装饰器、输入验证、新API端点 |
| `modules/__init__.py` | 导出新模块 |
| `modules/memory.py` | 修复正则、消除猴子补丁 |
| `modules/quality.py` | 从config导入禁用词、修复正则 |
| `templates/docs.html` | 版本号 v2.1.0 → v3.0.0 |
| `static/app.js` | 添加配置同步函数、更新版本注释 |
| `static/style.css` | 更新版本注释 |
| `.env.example` | 添加新配置项说明 |
| `STARTUP.txt` | 添加新功能说明 |
| `requirements.txt` | 保持依赖（无新增） |

---

## 6. 🔄 升级指南

### 从 v2.x 升级到 v3.0

1. **无需修改 .env** — 所有新功能默认关闭，向后兼容
2. **可选启用认证**:
   ```env
   API_SECRET_KEY=your-secret-key-here
   ```
3. **可选启用数据库**:
   ```env
   ENABLE_DATABASE=true
   DATABASE_PATH=kealin_data.db
   ```
4. **重启服务**:
   ```bash
   stop.bat
   start.bat
   ```

### 验证升级
```bash
curl http://localhost:20000/api/health
# 应返回 version: "3.0.0"
```
