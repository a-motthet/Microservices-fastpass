// /services/user-car-service/src/index.js

import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";

import { UpdateParkingStatusCommand } from "./domain/commands/UpdateParkingStatusCommand.js";
import { UpdateParkingStatusCommandHandler } from "./application/handlers/command-handlers/UpdateParkingStatusCommandHandler.js";
import { CheckInByLicensePlateCommand } from "./domain/commands/CheckInByLicensePlateCommand.js";
import { CheckInByLicensePlateCommandHandler } from "./application/handlers/command-handlers/CheckInByLicensePlateCommandHandler.js";
import { CreateReservationCommandHandler } from "./application/handlers/command-handlers/CreateReservationCommandHandler.js";
import { CreateReservationCommand } from "./domain/commands/CreateReservationCommand.js";
import { SupabaseEventStore, RabbitMQAdapter, createLogger, AppError, errorHandler } from "@parking-reservation/common";
import { EventConsumer } from "./infrastructure/projections/EventConsumer.js";

const logger = createLogger('user-car-service');

const app = express();
app.use(express.json());

const corsOptions = {
  origin: "http://localhost:4200",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

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
//  DEBUG ENDPOINT
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

/**
 * GET /reservations/availability
 * ดึงสถานะและความว่างของช่องเวลา (Time Slots)
 * Query: ?date=YYYY-MM-DD&parkingSiteId=ps-01&floorId=ps-01-f1
 */
app.get("/reservations/availability", async (req, res, next) => {
  const { date, parkingSiteId, floorId } = req.query; // 👈 รับ floorId เพิ่ม

  // 1. ตรวจสอบ Input
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return next(new AppError("Date parameter is required in YYYY-MM-DD format.", 400));
  }
  if (!parkingSiteId) {
    return next(new AppError("parkingSiteId parameter is required.", 400));
  }

  try {
    // 2. 📞 ถาม slot-service: "Site (และ Floor) นี้มีที่จอดทั้งหมดกี่ช่อง?"
    let totalCapacity = 0;
    try {
      const slotServiceUrl = process.env.SLOT_SERVICE_URL;
      if (!slotServiceUrl) throw new Error("SLOT_SERVICE_URL is not configured.");

      // สร้าง URL สำหรับถาม Capacity (ใส่ floorId ไปด้วยถ้ามี)
      let slotQueryUrl = `${slotServiceUrl}/slots?parkingSiteId=${parkingSiteId}`;
      if (floorId) {
        slotQueryUrl += `&floorId=${floorId}`;
      }

      const response = await axios.get(slotQueryUrl);
      
      totalCapacity = response.data ? response.data.length : 0;
      logger.info(`[Availability] Capacity for Site:${parkingSiteId}, Floor:${floorId || 'ALL'} = ${totalCapacity}`);

      if (totalCapacity === 0) {
         return next(new AppError(`No slots found for criteria.`, 404));
      }

    } catch (error) {
      logger.error(`[Error] Failed to connect to slot-service: ${error.message}`);
      return next(new AppError("Cannot determine parking capacity.", 500));
    }

    // 3. สร้าง Array 24 ช่องเวลา
    const timeSlots = [];
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    
    for (let i = 0; i < 24; i++) {
      const slotStartTime = new Date(dayStart);
      slotStartTime.setUTCHours(i);
      const slotEndTime = new Date(dayStart);
      slotEndTime.setUTCHours(i + 1);
      
      // สร้าง ID (รวม floorId ไปใน ID ด้วยถ้ามี เพื่อความ Unique หรือจะใช้ logic เดิมก็ได้)
      const dateStr = date.replace(/-/g, '');
      const hourStr = i.toString().padStart(2, "0");
      // ตัวอย่าง ID: S-ps01-20251117-0900 (ถ้าไม่ระบุชั้น) หรือ S-ps01-f1-20251117-0900
      const slotIdSuffix = floorId ? `-${floorId}` : '';
      const slotId = `S-${parkingSiteId}${slotIdSuffix}-${dateStr}-${hourStr}00`;

      const displayText = `${hourStr}:00 - ${(i + 1).toString().padStart(2, "0")}:00`;
      
      timeSlots.push({
        slotId,
        startTime: slotStartTime.toISOString(),
        endTime: slotEndTime.toISOString(),
        displayText,
        isAvailable: true,
        totalCapacity: totalCapacity,
        bookedCount: 0,
        remainingCount: totalCapacity
      });
    }

    // 4. ดึงการจองที่ Active ทั้งหมด (กรองตาม Site และ Floor)
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    
    let query = supabase
      .from("reservations")
      .select("start_time, end_time")
      .eq("parking_site_id", parkingSiteId)
      .lt("start_time", dayEnd.toISOString())
      .gt("end_time", dayStart.toISOString())
      .in("status", ["pending", "checked_in"]);

    // 👈 กรอง floor_id เพิ่มเติม ถ้ามีการระบุมา
    if (floorId) {
      query = query.eq("floor_id", floorId);
    }

    const { data: bookedSlots, error } = await query;
    
    if (error) throw error;

    // 5. 🧠 คำนวณความว่าง
    if (bookedSlots) {
      for (const slot of timeSlots) {
        const slotStart = new Date(slot.startTime).getTime();
        const slotEnd = new Date(slot.endTime).getTime();

        const currentBookingsCount = bookedSlots.filter(booking => {
          const bookingStart = new Date(booking.start_time).getTime();
          const bookingEnd = new Date(booking.end_time).getTime();
          return bookingStart < slotEnd && bookingEnd > slotStart;
        }).length;

        slot.bookedCount = currentBookingsCount;
        const remaining = totalCapacity - currentBookingsCount;
        slot.remainingCount = remaining > 0 ? remaining : 0;

        if (currentBookingsCount >= totalCapacity) {
          slot.isAvailable = false;
        }
      }
    }

    res.status(200).json(timeSlots);

  } catch (error) {
    next(error);
  }
});


/**
 * POST /reservations
 * สร้างการจองใหม่
 */
app.post("/reservations", async (req, res, next) => {
  // 1. รับ floorId เพิ่ม
  const { userId, slotId, startTime, endTime, parkingSiteId, floorId } = req.body;

  logger.info(
    `[API] Received POST /reservations for user: ${userId}, site: ${parkingSiteId}, floor: ${floorId}`
  );

  // 2. ตรวจสอบ Input (floorId เป็น required ตามบรีฟล่าสุด)
  if (!userId || !slotId || !startTime || !endTime || !parkingSiteId || !floorId) {
    return next(new AppError("userId, slotId, startTime, endTime, parkingSiteId, and floorId are all required.", 400));
  }

  try {
    // 3. สร้าง Command (ส่ง floorId ไปด้วย)
    const command = new CreateReservationCommand(
      userId,
      slotId,
      startTime,
      endTime,
      parkingSiteId,
      floorId // 👈
    );

    // 4. เรียก Handler
    const result = await createReservationHandler.handle(command);

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});


/**
 * POST /reservations/:id/status
 * อัปเดตสถานะการจอง
 */
app.post("/reservations/:id/status", async (req, res, next) => {
  const reservationId = req.params.id;
  const { status } = req.body;
  logger.info(
    `[API] Received POST /reservations/${reservationId}/status with status: ${status}`
  );

  try {
    if (!status) {
      return next(new AppError("Status is required in the request body.", 400));
    }
    const command = new UpdateParkingStatusCommand(reservationId, status);
    await updateParkingStatusHandler.handle(command);
    res.status(200).json({
      message: `Reservation ${reservationId} status updated to ${status}`,
    });
  } catch (error) {
    next(error);
  }
});


/**
 * GET /reservations/:id
 * ดึงข้อมูล Reservation จาก Read Model
 */
app.get("/reservations/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("reservations")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return next(new AppError("Reservation not found", 404));
    }
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});


/**
 * POST /check-ins
 * เช็กอินด้วยป้ายทะเบียน
 */
app.post("/check-ins", async (req, res, next) => {
  const { license_plate } = req.body;
  logger.info(`[API] Received POST /check-ins with license plate: ${license_plate}`);

  try {
    const command = new CheckInByLicensePlateCommand(license_plate);
    const result = await checkInByLicensePlateHandler.handle(command);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.includes("not found")) {
      return next(new AppError(error.message, 404));
    }
    next(error);
  }
});

// Global Error Handler
app.use(errorHandler);

// =================================================================
//  Server Startup
// =================================================================

const PORT = process.env.PORT || 3003;

const startServer = async () => {
  try {
    await messageBroker.connect();
    logger.info("✅ Message Broker connected successfully.");

    const consumer = new EventConsumer(supabase, messageBroker);
    await consumer.start();
    logger.info("🎧 Event Consumer is running and listening for events.");

    app.listen(PORT, () => {
      logger.info(`\n🚀 User-Car Service is running on http://localhost:${PORT}`);
      logger.info(`   (CORS enabled for: ${corsOptions.origin})`);
    }).on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        logger.error(`❌ Port ${PORT} is already in use.`);
      } else {
        logger.error(`❌ Failed to start server on port ${PORT}:`, error);
      }
      process.exit(1);
    });
  } catch (error) {
    logger.error("❌ Failed to start the service:", error);
    process.exit(1);
  }
};

startServer();