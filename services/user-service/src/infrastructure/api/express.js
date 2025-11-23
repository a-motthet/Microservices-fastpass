import express from "express";
import { CreateUserCommand } from "../../domain/commands/CreateUserCommand.js";
import { CreateUserCommandHandler } from "../../application/handlers/command-handlers/CreateUserCommandHandler.js";
import { SupabaseEventStore, RabbitMQAdapter } from "@parking-reservation/common";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

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

app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("user_read_model")
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
  console.log(`User Service running on port ${PORT}`);
});
