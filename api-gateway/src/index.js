// src/index.js
import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import express from "express";
import { ApolloServer } from "apollo-server-express";

// โค้ดที่ถูกต้อง ✅
import typeDefs from "./graphql/typeDefs.js";
import resolvers from "./graphql/resolvers.js";
import apiRoutes from "./routes/index.js";

const app = express();
const PORT = process.env.GATEWAY_PORT || 4000;

app.use(cors({
  origin: "http://localhost:4200",
  credentials: true
}));

app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).send("API Gateway is running!");
});

// ใช้ REST Proxy ที่เราทำไว้ก่อนหน้า
app.use("/", apiRoutes);

// --- 🔽 เพิ่มส่วนนี้เพื่อติดตั้ง GraphQL Server 🔽 ---
async function startApolloServer() {
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();

  // กำหนดให้ GraphQL server ทำงานที่ path /graphql
  server.applyMiddleware({ app, path: "/graphql" });
  console.log(
    `🚀 GraphQL server ready at http://localhost:${PORT}${server.graphqlPath}`
  );
}

startApolloServer(); // เรียกใช้งานฟังก์ชัน
// --------------------------------------------

app.listen(PORT, () => {
  console.log(`🚀 API Gateway is running on http://localhost:${PORT}`);
});
