// /services/slot-service/src/index.js

import express from "express";
import { createClient } from "@supabase/supabase-js";

// Infrastructure
import { SupabaseEventStore, RabbitMQAdapter, createLogger, AppError, errorHandler } from "@parking-reservation/common";
// (SnapshotStore ถูกคัดลอกมาด้วย แต่เรายังไม่ได้ใช้ใน CreateSlot)

// Projections
import { EventConsumer } from "./infrastructure/projections/EventConsumer.js";

// Domain/Application
import { CreateSlotCommand } from "./domain/commands/CreateSlotCommand.js";
import { CreateSlotCommandHandler } from "./application/handlers/command-handlers/CreateSlotCommandHandler.js";

const logger = createLogger('slot-service');

const app = express();
app.use(express.json());

// --- Setup Dependencies ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
const eventStore = new SupabaseEventStore(supabase);
const messageBroker = new RabbitMQAdapter();
const createSlotHandler = new CreateSlotCommandHandler(
  eventStore,
  messageBroker
);

// ===================================
// === API Endpoints
// ===================================

/**
 * GET /slots
 * ดึงข้อมูลช่องจอดทั้งหมด (รองรับการกรองด้วย parkingSiteId)
 * API นี้ถูกเรียกใช้โดย user-car-service เพื่อคำนวณ Capacity
 */
app.get("/slots", async (req, res, next) => {
  const { parkingSiteId, status, floorId } = req.query;

  try {
    let query = supabase.from("slots").select("id, name, floor, details, status, parking_site_id, floor_id");

    if (parkingSiteId) query = query.eq("parking_site_id", parkingSiteId);
    if (status) query = query.eq("status", status);
    
    if (floorId) {
      query = query.eq("floor_id", floorId);
    }
    const { data, error } = await query;

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    logger.error(`[SlotSvc] Error in GET /slots: ${error.message}`);
    next(new AppError("Internal server error", 500));
  }
});

/**
 * POST /slots
 * (Admin) สร้างช่องจอดใหม่
 */
app.post("/slots", async (req, res, next) => {
  logger.info("[SlotSvc] Received POST /slots request");
  try {
    // รับ parkingSiteId เพิ่มเติม
    const { name, floor, details, parkingSiteId } = req.body;

    if (!parkingSiteId) {
      return next(new AppError("parkingSiteId is required.", 400));
    }

    // หมายเหตุ: ต้องแน่ใจว่า CreateSlotCommand ของคุณรองรับ parkingSiteId แล้ว
    const command = new CreateSlotCommand(name, floor, details, parkingSiteId);
    const result = await createSlotHandler.handle(command);
    res.status(201).json(result);
  } catch (error) {
    logger.error(`[SlotSvc] Error in POST /slots: ${error.message}`);
    next(error);
  }
});

// Global Error Handler
app.use(errorHandler);

// ===================================
// === Server Startup
// ===================================

const PORT = process.env.PORT || 3006;

const startServer = async () => {
  try {
    // 1. เชื่อมต่อ Message Broker
    await messageBroker.connect();
    logger.info("✅ [SlotSvc] Message Broker connected.");

    // 2. เริ่มต้น Event Consumer
    const consumer = new EventConsumer(supabase, messageBroker);
    await consumer.start();
    logger.info("🎧 [SlotSvc] Event Consumer is running.");

    // 3. เริ่ม Express Server
    app.listen(PORT, () => {
      logger.info(`\n🚀 Slot Service is running on http://localhost:${PORT}`);
    }).on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        logger.error(
          `❌ Port ${PORT} is already in use. Please:\n` +
          `   1. Stop the process using port ${PORT}\n` +
          `   2. Or change PORT in .env file\n` +
          `   3. On Windows, find process: netstat -ano | findstr :${PORT}\n` +
          `   4. Kill process: taskkill /F /PID <PID>`
        );
      } else {
        logger.error(`❌ Failed to start server on port ${PORT}:`, error);
      }
      process.exit(1);
    });
  } catch (error) {
    logger.error("❌ Failed to start the Slot service:", error);
    process.exit(1);
  }
};

startServer();
