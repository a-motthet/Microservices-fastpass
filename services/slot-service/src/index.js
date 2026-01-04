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

// Helper Function (Mock)
function calculateDistance(lat1, lon1, lat2, lon2) {
    // In a real app, use Haversine formula
    if (!lat1 || !lat2) return 0;
    return 50; // Mock distance
}

/**
 * GET /sites/:siteId/buildings
 * ดึงข้อมูลตึกใน Site พร้อมสถานะที่จอดรถ (Capacity/Available) แยกตามประเภทรถ
 */
app.get('/sites/:siteId/buildings', async (req, res, next) => {
  try {
    const { siteId } = req.params;
    const userId = req.headers['x-user-id'] || null; // สมมติว่า Gateway ส่ง Header มาให้
    const { lat, lng } = req.query; 

    logger.info(`[SlotSvc] GET /sites/${siteId}/buildings`);

    // 1. ดึงข้อมูลตึก + Bookmark + Floors
    // หมายเหตุ: user_bookmarks อยู่ใน service นี้หรือไม่? 
    // ถ้าแยก service เราอาจต้องยิงไปถาม user-service หรือ recently-service 
    // แต่ใน SQL ที่เห็น user_bookmarks อยู่ใน public schema เดียวกัน ถือว่า query ได้เลยถ้าต่อ DB เดียวกัน
    // ถ้าแยก DB ต้องแก้ logic นี้. สมมติว่าใช้ Shared DB ตาม SQL ที่เห็น.
    const { data: buildings, error } = await supabase
      .from('buildings')
      .select(`
        *,
        floors (id, name),
        user_bookmarks (user_id)
      `)
      .eq('parking_site_id', siteId);

    if (error) throw error;

    if (!buildings) return res.status(200).json([]);

    // 2. วนลูปคำนวณยอดว่าง (Dynamic Calculation)
    const result = await Promise.all(buildings.map(async (b) => {
      
      // Query นับจำนวน Slot แยกตามประเภท
      const { data: slots, error: slotError } = await supabase
        .from('slots')
        .select('vehicle_type_code, status')
        .like('floor_id', `${b.id}%`); // Convention: floor_id starts with building_id

      if (slotError) {
          logger.error(`[SlotSvc] Error fetching slots for building ${b.id}:`, slotError);
          // Don't fail entire request, just return 0
      }

      // เริ่มนับยอด
      const stats = {
        capacity: { car: 0, motorcycle: 0, ev: 0 },
        available: { car: 0, motorcycle: 0, ev: 0 }
      };

      if (slots) {
          slots.forEach(s => {
            let type = 'car';
            if (s.vehicle_type_code === 0) type = 'motorcycle';
            else if (s.vehicle_type_code === 2) type = 'ev';
            // Default 1 = car
    
            stats.capacity[type]++;
            if (s.status === 'available') stats.available[type]++;
          });
      }

      // คำนวณระยะทาง (Mock)
      const distance = calculateDistance(lat, lng, b.lat, b.lng);
      
      // Check Bookmarked
      const isBookmarked = b.user_bookmarks && userId 
          ? b.user_bookmarks.some(ub => ub.user_id === userId)
          : false;

      // Status Logic
      const totalAvailable = stats.available.car + stats.available.ev + stats.available.motorcycle;
      const status = totalAvailable > 0 ? "available" : "full";

        // Schedule Logic with Cron
        let schedule = b.schedule_config;
        if (!schedule || schedule.length === 0) {
           const openTime = b.open_time || '08:00';
           const closeTime = b.close_time || '20:00';
           
           // Helper to get cron string "min hour * * *"
           const toCron = (timeStr) => {
               if(!timeStr) return "0 0 * * *";
               const [h, m] = timeStr.split(':').map(Number);
               return `${m} ${h} * * *`;
           };

           schedule = [{
               days: [],
               open_time: openTime.substring(0, 5),
               close_time: closeTime.substring(0, 5),
               cron: {
                   open: toCron(openTime),
                   close: toCron(closeTime)
               }
           }];
        }
        
        // ... (return object) ...

      // Mapping เข้า JSON Format
      return {
        id: b.id,
        name: b.name,
        capacity: {
            normal: stats.capacity.car,
            ev: stats.capacity.ev,
            motorcycle: stats.capacity.motorcycle
        },
        available: {
            normal: stats.available.car,
            ev: stats.available.ev,
            motorcycle: stats.available.motorcycle
        },
        floors: b.floors || [],
        mapX: b.map_x,
        mapY: b.map_y,
        lat: b.lat,
        lng: b.lng,
        status: status,
        isBookmarked: isBookmarked,
        distance: distance, 
        hours: `เปิด ${b.open_time || '08:00'} - ${b.close_time || '20:00'}`,
        hasEVCharger: stats.capacity.ev > 0, 
        userTypes: b.allowed_user_types ? b.allowed_user_types.join(', ') : '',
        price: b.price_per_hour || 0,
        priceUnit: (b.price_per_hour || 0) === 0 ? "ฟรี" : "บาท/ชม.",
        supportedTypes: Object.keys(stats.capacity).filter(k => {
             if (k === 'car') return stats.capacity.car > 0 ? 'normal' : false; // Frontend uses 'normal'
             return stats.capacity[k] > 0 ? k : false;
        }).filter(Boolean).map(k => k === 'car' ? 'normal' : k),
        
        schedule: schedule, // 👈 New Schedule
        images: b.images || []
      };
    }));
    
    // Fix supportedTypes mapping in the loop above to match requirement precisely:
    // stats keys: car, motorcycle, ev
    // desired output types: normal, motorcycle, ev
    result.forEach(r => {
        const types = [];
        if (r.capacity.normal > 0) types.push('normal');
        if (r.capacity.ev > 0) types.push('ev');
        if (r.capacity.motorcycle > 0) types.push('motorcycle');
        r.supportedTypes = types;
    });

    res.json(result);

  } catch (err) {
     logger.error(`[SlotSvc] Error in GET /sites/${req.params.siteId}/buildings: ${err.message}`);
     next(err);
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
