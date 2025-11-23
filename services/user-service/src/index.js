// /services/user-service/src/index.js

// No need to import dotenv if using --env-file flag
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { CreateUserCommand } from "./domain/commands/CreateUserCommand.js";
import { CreateUserCommandHandler } from "./application/handlers/command-handlers/CreateUserCommandHandler.js";
import { SupabaseEventStore, RabbitMQAdapter } from "@parking-reservation/common";
// Correct the import path for EventConsumer
import { EventConsumer } from "./infrastructure/projections/EventConsumer.js";

const app = express();
app.use(express.json());

// --- Dependency Injection & Setup ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
const eventStore = new SupabaseEventStore(supabase);
const messageBroker = new RabbitMQAdapter();
const createUserHandler = new CreateUserCommandHandler(
  eventStore,
  messageBroker
);

// --- API Endpoints ---

// Health Check
app.get("/health", (req, res) => res.status(200).send("User Service is OK"));

// Command Endpoint: Create User
app.post("/users", async (req, res) => {
  console.log("[User Service] Received POST /users request");
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required." });
    }
    const command = new CreateUserCommand(name, email);
    const result = await createUserHandler.handle(command);
    res.status(201).json(result);
  } catch (error) {
    console.error("[User Service] Error in POST /users:", error); // Log the full error
    res.status(400).json({ error: error.message });
  }
});

// Query Endpoint: Get User by ID
app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("user_read_model")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data)
      return res.status(404).json({ message: "User not found" });
    res.status(200).json(data);
  } catch (error) {
    console.error(
      `[User Service] Error in GET /users/${req.params.id}:`,
      error
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Server Startup ---
const PORT = process.env.PORT || 3001;

// Use async function for proper startup sequence
const startServer = async () => {
  try {
    // 1. Connect to Message Broker first
    await messageBroker.connect();
    console.log("✅ Message Broker connected successfully.");

    // --- 🔽 Added Channel Check 🔽 ---
    if (!messageBroker.getChannel()) {
      console.error(
        "❌ CRITICAL: Message Broker connected but channel is NULL immediately after connect!"
      );
      throw new Error("Channel not created after connect.");
    }
    console.log("✅ Channel is available immediately after connect.");
    // --- 🔼 End Channel Check 🔼 ---

    // 2. Start Event Consumer (needs messageBroker)
    // Pass both supabase and messageBroker to the consumer
    const consumer = new EventConsumer(supabase, messageBroker);
    await consumer.start(); // Assuming EventConsumer has an async start method
    console.log("🎧 Event Consumer is running and listening for events.");

    // 3. Start Express server after dependencies are ready
    app.listen(PORT, () => {
      console.log(`\n🚀 User Service is running on http://localhost:${PORT}`);
    }).on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          `❌ Port ${PORT} is already in use. Please:\n` +
          `   1. Stop the process using port ${PORT}\n` +
          `   2. Or change PORT in .env file\n` +
          `   3. On Windows, find process: netstat -ano | findstr :${PORT}\n` +
          `   4. Kill process: taskkill /F /PID <PID>`
        );
      } else {
        console.error(`❌ Failed to start server on port ${PORT}:`, error);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error("❌ Failed to start the User service:", error);
    process.exit(1); // Exit if critical services fail to start
  }
};

startServer();
