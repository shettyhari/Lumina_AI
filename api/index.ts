export default async function handler(req: any, res: any) {
  // Dynamic import avoids ERR_REQUIRE_ESM in Vercel CommonJS serverless function wrapper
  // @ts-ignore
  const appModule = await import("../artifacts/api-server/dist/app.mjs");
  const app = appModule.default || appModule;
  return app(req, res);
}
