# fajia.online Member Check v1

第一版只完成：

1. `/member-check/` 内部检索页；
2. `/api/member-check` 受口令保护的查询 API；
3. `/api/member-index-upload` 受独立口令保护的索引上传 API；
4. Blob `fajia-member-index/member-index/latest.json` 保存成员索引。

## 放入仓库

把本包中的目录合并进 `just0618/fajia`：

```text
member-check/index.html
edge-functions/api/member-check.js
edge-functions/api/member-index-upload.js
tools/upload_member_index.py   # 可选，主要放服务器上使用
```

`member-index.sample.json` 仅用于测试，不建议提交真实成员数据到 GitHub。

## EdgeOne 环境变量

在 fajia.online 对应的 EdgeOne Pages 项目中增加：

```text
MEMBER_CHECK_TOKEN=<你打开 /member-check/ 搜索时输入的口令>
MEMBER_INDEX_UPLOAD_TOKEN=<服务器上传成员索引使用的另一条口令>
```

两条口令不要相同，也不要写进 GitHub。

## 部署后测试顺序

1. 打开 `https://fajia.online/api/member-check`
   - 应返回 service JSON；
2. 打开 `https://fajia.online/member-check/`
   - 页面应正常显示；
3. 在真实索引未上传前搜索：
   - 正确口令应显示“成员索引还没有上传”；
4. 用测试索引上传：

```bash
export MEMBER_INDEX_UPLOAD_TOKEN='你的上传口令'
python tools/upload_member_index.py member-index.sample.json
```

5. 在页面搜索 `测试成员A` 或 `demo_user_001`。

## 安全设计

- `/member-check/` 没有加入首页导航；
- 页面带 `noindex,nofollow,noarchive`；
- 搜索必须输入 `MEMBER_CHECK_TOKEN`；
- token 不写 localStorage；
- API 每次最多返回 20 个候选；
- 空查询和单字符枚举被拒绝；
- 完整成员索引只保存在 Blob，不放静态 JSON；
- 上传使用独立 `MEMBER_INDEX_UPLOAD_TOKEN`。

## 下一阶段

完成真实的两个豆瓣小组成员采集器，并生成同一 schema 的 `member_index.json`；
之后再把现有旧组闲聊楼数据按 `author/profile` 映射接入“最近发言”。
