// /services/slot-service/src/index.js

import express from "express";
import { createClient } from "@supabase/supabase-js";

// Infrastructure
import { SupabaseEventStore, RabbitMQAdapter, createLogger, AppError, errorHandler, VEHICLE_TYPE } from "@parking-reservation/common";
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
 * ดึงข้อมูลช่องจอดทั้งหมด (รองรับการกรองด้วย parkingSiteId และ floorId)
 */
app.get("/slots", async (req, res) => {
  const { parkingSiteId, floorId, status } = req.query;
  console.log(`[SlotSvc] GET /slots query:`, req.query);

  try {
    // 🔽 แก้ไข: เพิ่ม zone_id และ join zones 🔽
    let query = supabase
      .from("slots")
      .select("id, name, floor_id, details, status, parking_site_id, zone_id, zones(name)");

    // กรองตามสาขา
    if (parkingSiteId) {
      query = query.eq("parking_site_id", parkingSiteId);
    }

    // กรองตามชั้น
    if (floorId) {
      let fIds = [];
      if (Array.isArray(floorId)) {
          fIds = floorId;
      } else {
          fIds = floorId.split(',');
      }
      fIds = fIds.map(f => f.trim()).filter(f => f); // Trim and remove empty
      
      if (fIds.length > 0) {
          query = query.in("floor_id", fIds);
      }
    }

    // กรองตามประเภทรถ (vehicle_type_code)
    const { type } = req.query;
    let targetTypeCode = 1; // Default = Car
    if (type !== undefined) {
       if (!isNaN(type)) {
          targetTypeCode = parseInt(type);
       } else {
          targetTypeCode = VEHICLE_TYPE[type.toUpperCase()] !== undefined ? VEHICLE_TYPE[type.toUpperCase()] : 1;
       }
    }
    query = query.eq('vehicle_type_code', targetTypeCode);
    
    // กรองตามสถานะ
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error(`[SlotSvc] Error in GET /slots:`, error);
    res.status(500).json({ error: "Internal server error" });
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
    const { name, floor, details, parkingSiteId, floorId, slotNumber, vehicleType, zoneId } = req.body;

    if (!parkingSiteId) {
      return next(new AppError("parkingSiteId is required.", 400));
    }

    const command = new CreateSlotCommand(name, floor, details, parkingSiteId, floorId, slotNumber, vehicleType, zoneId);
    const result = await createSlotHandler.handle(command);
    res.status(201).json(result);
  } catch (error) {
    logger.error(`[SlotSvc] Error in POST /slots: ${error.message}`);
    next(error);
  }
});

// GET /sites/:id/structure
app.get('/sites/:id/structure', async (req, res, next) => {
  const { id } = req.params;
  logger.info(`[SlotSvc] GET /sites/${id}/structure`);

  try {
    // 1. ดึงข้อมูล Flat จาก View
    const { data: rows, error } = await supabase
      .from('site_structure_view')
      .select('*')
      .eq('site_id', id);

    if (error) throw error;
    if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Site not found or no structure defined." });
    }

    // 2. แปลง Flat Data -> Nested JSON (Building -> Floor -> Zone)
    const siteStructure = {
      id: rows[0]?.site_id,
      name: rows[0]?.site_name,
      buildings: []
    };

    // Helper เพื่อหา object ใน array
    const findOrAdd = (array, id, name, template) => {
      let item = array.find(x => x.id === id);
      if (!item) {
        item = { id, name, ...template };
        array.push(item);
      }
      return item;
    };

    rows.forEach(row => {
      // Level 1: Building
      const building = findOrAdd(siteStructure.buildings, row.building_id, row.building_name, { floors: [] });
      
      // Level 2: Floor
      const floor = findOrAdd(building.floors, row.floor_id, row.floor_name, { zones: [] });
      
      // Level 3: Zone
      floor.zones.push({
        id: row.zone_id,
        name: row.zone_name,
        supportedVehicleTypes: row.supported_vehicle_types // [0, 1] or similar
      });
    });

    res.json(siteStructure);
  } catch (error) {
    logger.error(`[SlotSvc] Error in GET /sites/${id}/structure: ${error.message}`);
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
