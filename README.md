# fajia.online 专属反馈页（可并入现有仓库）

## 文件结构

```text
feedback/                    # 给两位填写者看的页面
  index.html
  style.css
  app.js
feedback-admin/              # 你自己查看提交结果的隐藏页
  index.html
edge-functions/api/
  feedback.js                # 提交 / 更新反馈
  feedback-admin.js          # 管理员读取反馈
```

## 推荐并入路径

把以上目录原样复制到 `fajia.online` 当前仓库根目录。部署后：

- `https://fajia.online/feedback/`：填写页
- `https://fajia.online/feedback-admin/`：你自己查看结果
- `/api/feedback`：提交接口
- `/api/feedback-admin`：读取接口

如果不想让 URL 这么直白，可以把 `feedback/` 改成一段只写在信里的不公开路径；JS 无需修改。

## EdgeOne KV 设置（必须）

EdgeOne Pages 的 KV 只能在 Edge Functions 中调用。因此：

1. EdgeOne Pages 控制台 → KV 存储 → 创建命名空间，例如 `fajia-feedback`。
2. 将该命名空间绑定到当前 Pages 项目。
3. **变量名填 `FEEDBACK_KV`**（必须与代码一致）。
4. 重新部署项目。

## 管理员口令（必须，用于查看答案）

在 Pages 项目环境变量中增加：

```text
FEEDBACK_ADMIN_TOKEN=你自己生成的一段长随机字符串
```

建议至少 24 个随机字符，不要提交进 GitHub。

然后重新部署。进入 `/feedback-admin/` 时输入这段口令即可读取 KV 中的反馈。

## 隐私与行为

- 不要求姓名、手机号、邮箱或社交账号。
- 填写中只写入浏览器 `localStorage`。
- 只有点击“提交反馈”后才把答案发送到 KV。
- 每台浏览器首次进入会生成随机 `submission_id`；以后再次提交会覆盖同一份记录，因此支持回来修改。
- 后端记录仅包含：随机 ID、首次时间、最后更新时间、表单答案、页面版本。
- 代码没有主动保存 IP、User-Agent 或设备指纹。
- 页面已加入 `noindex,nofollow,noarchive`。注意：noindex 不是访问控制；如果 URL 被转发，拿到链接的人仍可访问。

## 上线前要改的 2 处

1. `feedback/index.html` 最后的“联系邮箱”占位内容，替换成你的实际项目邮箱。
2. “近期讨论概览”部分目前是 CSS mockup。等另一个对话框的真实 Dashboard 调完，可把该块替换成截图或真实页面入口。

## 本地只看前端

直接打开 `feedback/index.html` 可以查看样式和本地自动保存，但提交会失败，因为 `/api/feedback` 需要 EdgeOne Functions 环境。

完整联调建议使用官方 EdgeOne CLI：

```bash
npm install -g edgeone
edgeone login
edgeone pages init
edgeone pages link
edgeone pages dev
```

然后访问 CLI 提供的本地地址测试前端与函数。
