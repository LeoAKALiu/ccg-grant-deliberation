#!/bin/sh
if command -v node >/dev/null 2>&1; then
  node ./scripts/doctor.mjs --hook 2>/dev/null || echo "CCG 课题论证插件已加载。先运行: node scripts/setup.mjs"
else
  echo "CCG 课题论证插件已加载。请先安装 Node.js 18+，然后运行: node scripts/setup.mjs"
fi
