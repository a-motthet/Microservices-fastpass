// /services/user-car-service/src/index.js

import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// --- Reservation Imports (ส่วนที่เพิ่มเข้ามาใหม่) ---
import { UpdateParkingStatusCommand } from "./domain/commands/UpdateParkingStatusCommand.js";
import { UpdateParkingStatusCommandHandler } from "./application/handlers/command-handlers/UpdateParkingStatusCommandHandler.js";

// --- Infrastructure Imports ---
import { SupabaseEventStore } from "./infrastructure/persistence/SupabaseEventStore.js";
import { RabbitMQAdapter } from "./infrastructure/messaging/RabbitMQAdapter.js";
import { EventConsumer } from "./infrastructure/projections/EventConsumer.js";

import { CheckInByLicensePlateCommand } from "./domain/commands/CheckInByLicensePlateCommand.js";
import { CheckInByLicensePlateCommandHandler } from "./application/handlers/command-handlers/CheckInByLicensePlateCommandHandler.js";

import { CreateReservationCommand } from "./domain/commands/CreateReservationCommand.js";
import { CreateReservationCommandHandler } from "./application/handlers/command-handlers/CreateReservationCommandHandler.js";

dotenv.config();
console.log("[DEBUG] Loaded SUPABASE_URL:", process.env.SUPABASE_URL);
const app = express();
app.use(express.json());

// =================================================================
//  Dependency Injection & Setup
// =================================================================
// สร้าง instance ของ dependencies ที่จะใช้ร่วมกัน
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const eventStore = new SupabaseEventStore(supabase);
const messageBroker = new RabbitMQAdapter();
const updateParkingStatusHandler = new UpdateParkingStatusCommandHandler(
  eventStore,
  messageBroker,
  supabase
);
const checkInByLicensePlateHandler = new CheckInByLicensePlateCommandHandler(
  eventStore,
  messageBroker,
  supabase
);
const createReservationHandler = new CreateReservationCommandHandler(
  eventStore,
  messageBroker
);

// =================================================================
//  DEBUG ENDPOINT (เพิ่มส่วนนี้เข้าไป)
// =================================================================
app.get("/debug-connection", (req, res) => {
  res.status(200).json({
    message: "This is the configuration my application is currently using.",
    supabase_url: process.env.SUPABASE_URL,
    port: process.env.PORT,
  });
});

// =================================================================
//  API Endpoints
// =================================================================
// --- Reservation Endpoints ---
app.post("/reservations", async (req, res) => {
  const { userId, slotId, startTime, endTime } = req.body;

  console.log(`[API] Received POST /reservations for user: ${userId}`);

  try {
    const command = new CreateReservationCommand(
      userId,
      slotId,
      startTime,
      endTime
    );
    const result = await createReservationHandler.handle(command);
    res.status(201).json(result);
  } catch (error) {
    // console.error(`[Error] in POST /reservations:`, error);
    res.status(400).json({ error: error.message });
  }
});
// Command: อัปเดตสถานะการจอดรถ
app.post("/reservations/:id/status", async (req, res) => {
  const reservationId = req.params.id;
  const { status } = req.body;
  console.log(
    `[API] Received POST /reservations/${reservationId}/status with status: ${status}`
  );

  try {
    if (!status) {
      return res
        .status(400)
        .json({ error: "Status is required in the request body." });
    }
    const command = new UpdateParkingStatusCommand(reservationId, status);
    // ส่ง command ไปให้ handler ที่ถูกต้องจัดการ
    await updateParkingStatusHandler.handle(command);
    res.status(200).json({
      message: `Reservation ${reservationId} status updated to ${status}`,
    });
  } catch (error) {
    console.error(
      `[Error] in POST /reservations/${reservationId}/status:`,
      error.message
    );
    res.status(400).json({ error: error.message });
  }
});

// Query: ดึงข้อมูล Reservation จาก Read Model
app.get("/reservations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("reservations")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: "Reservation not found" });
    }
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =================================================================
//  เพิ่ม Check-in Endpoint ใหม่
// =================================================================
app.post("/check-ins", async (req, res) => {
  const { license_plate } = req.body;
  console.log(
    `[API] Received POST /check-ins with license plate: ${license_plate}`
  );

  try {
    const command = new CheckInByLicensePlateCommand(license_plate);
    const result = await checkInByLicensePlateHandler.handle(command);
    res.status(200).json(result);
  } catch (error) {
    console.error(`[Error] in POST /check-ins:`, error.message);
    // ใช้ status 404 ถ้าไม่พบข้อมูล, 400 สำหรับ error อื่นๆ
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    res.status(400).json({ error: error.message });
  }
});

// =================================================================
//  Server Startup
// =================================================================

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    // 1. เชื่อมต่อกับ Message Broker ก่อน
    await messageBroker.connect();
    console.log("✅ Message Broker connected successfully.");

    // 2. เริ่มต้น Event Consumer เพื่อรอรับ Event
    const consumer = new EventConsumer(supabase, messageBroker);
    await consumer.start();
    console.log("🎧 Event Consumer is running and listening for events.");

    // 3. เมื่อทุกอย่างพร้อม ก็เริ่มรัน Express server
    app.listen(PORT, () => {
      console.log(
        `\n🚀 User-Car Service is running on http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error("❌ Failed to start the service:", error);
    process.exit(1); // ออกจากโปรแกรมถ้าไม่สามารถเริ่มระบบได้
  }
};

startServer();
