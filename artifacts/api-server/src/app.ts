import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Security headers
app.use(helmet());

// Clerk proxy must be mounted before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// CORS — fail-closed: only allow explicitly configured frontend origins.
// If neither REPLIT_DEV_DOMAIN nor FRONTEND_ORIGIN is set, all cross-origin
// credentialed requests are rejected rather than silently permitted.
const _corsDev = process.env.REPLIT_DEV_DOMAIN;
const _corsAllowed = new Set<string>(
  [
    _corsDev ? `https://${_corsDev}` : null,
    process.env.FRONTEND_ORIGIN ?? null,
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:5001",
    "http://127.0.0.1:5001",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ].filter(Boolean) as string[],
);

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Allow requests with no Origin (e.g. server-to-server, curl in dev)
      if (!origin) return callback(null, true);
      // Fail-closed: reject if no allowed origins are configured OR origin isn't on the list
      if (_corsAllowed.size > 0 && _corsAllowed.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (!process.env.CLERK_SECRET_KEY) {
    return next();
  }
  try {
    return clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    }))(req, res, next);
  } catch {
    return next();
  }
});

app.use("/api", router);

// Global error handler — keeps stack traces out of API responses
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  const status = (err as any)?.status ?? (err as any)?.statusCode ?? 500;
  logger.error({ err }, message);
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

export default app;
