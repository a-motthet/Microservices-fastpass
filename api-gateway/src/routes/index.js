// src/routes/index.js
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import services from "./services.js";

const router = express.Router();

// วนลูปสร้าง Proxy สำหรับทุก Service ที่เราตั้งค่าไว้ใน services.js
services.forEach(({ route, target }) => {
  // แปลง path prefix ให้เป็น pattern ที่ใช้ได้กับ URL
  // เช่น /users  ->  /users/*
  const proxyRoute = `${route}`;

  console.log(`[Gateway] Creating proxy for ${proxyRoute} -> ${target}`);

  // สร้าง Proxy Middleware
  router.use(
    proxyRoute,
    createProxyMiddleware({
      target: target,
      changeOrigin: true, // จำเป็นสำหรับทำให้ microservice ปลายทางทำงานถูกต้อง
      pathRewrite: (path, req) => {
        // ตัดสินใจว่าจะ rewrite path หรือไม่
        // ตัวอย่างนี้เราส่ง path ไปตรงๆ เพราะ microservice ของเรารับ path เต็ม
        // เช่น /users/1234 ก็จะถูกส่งไปที่ http://user-service/users/1234
        return path;
      },
      onProxyReq: (proxyReq, req, res) => {
        console.log(
          `[Gateway] Proxying request to: ${target}${req.originalUrl}`
        );
      },
      onError: (err, req, res) => {
        console.error("[Gateway] Proxy error:", err);
        res.status(500).send("Proxy Error");
      },
    })
  );
});

export default router;
