import path from "node:path";

// 在任何业务模块导入前设置测试环境变量
process.env.DATABASE_URL = `file:${path.resolve(__dirname, "../tmp/test.db")}`;
process.env.EXPORT_DIR = "tests/tmp/exports";
delete process.env.MODEL_BASE_URL;
delete process.env.MODEL_API_KEY;
delete process.env.MODEL_NAME;
delete process.env.AI_PROVIDER;
