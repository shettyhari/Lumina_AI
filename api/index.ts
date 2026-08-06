export default async function handler(req: any, res: any) {
  // @ts-ignore
  const appModule = await import("../artifacts/api-server/dist/app.mjs");
  const app = appModule.default || appModule;
  return app(req, res);
}
