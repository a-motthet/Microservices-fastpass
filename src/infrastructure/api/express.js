import express from "express";
import cors from "cors"; // 1. Import CORS
import { CreateUserCommand } from "../../domain/commands/CreateUserCommand.js";
import { CreateUserCommandHandler } from "../../application/handlers/command-handlers/CreateUserCommandHandler.js";
import { SupabaseEventStore } from "../persistence/SupabaseEventStore.js";
import { RabbitMQAdapter } from "../messaging/RabbitMQAdapter.js";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

// 2. ตั้งค่า CORS Options
// อนุญาตเฉพาะ Front-end (Angular) ของคุณ
const corsOptions = {
  origin: "http://localhost:4200",
};

// 3. ใช้งาน CORS Middleware (ต้องอยู่ก่อนการประกาศ Routes)
app.use(cors(corsOptions));

// --- Dependency Injection ---
const eventStore = new SupabaseEventStore();
const messageBroker = new RabbitMQAdapter();
const createUserHandler = new CreateUserCommandHandler(
  eventStore,
  messageBroker
);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// --- REST API for Commands ---
// (***Route '/users' ของคุณจะใช้งาน CORS นี้โดยอัตโนมัติ***)
app.post("/users", async (req, res) => {
  try {
    const { name, email } = req.body;
    const command = new CreateUserCommand(name, email);
    const result = await createUserHandler.execute(command);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// (***Route '/users/:id' ของคุณก็จะใช้งาน CORS นี้ด้วย***)
app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single(); // .single() เพื่อให้ได้ object เดียว ไม่ใช่ array

    if (error || !data) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- GraphQL for Queries (using Apollo Server) would be setup here ---
// ...

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  // เพิ่มข้อความบอกว่า CORS เปิดใช้งานแล้ว
  console.log(
    `User Service running on port ${PORT}. Allowing CORS for http://localhost:4200`
  );
});
