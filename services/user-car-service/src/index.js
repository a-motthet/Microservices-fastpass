// /services/user-car-service/src/index.js

import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";

// --- Imports: Commands & Handlers ---
import { UpdateParkingStatusCommand } from "./domain/commands/UpdateParkingStatusCommand.js";
import { UpdateParkingStatusCommandHandler } from "./application/handlers/command-handlers/UpdateParkingStatusCommandHandler.js";

import { CheckInByLicensePlateCommand } from "./domain/commands/CheckInByLicensePlateCommand.js";
import { CheckInByLicensePlateCommandHandler } from "./application/handlers/command-handlers/CheckInByLicensePlateCommandHandler.js";

import { CreateReservationCommand } from "./domain/commands/CreateReservationCommand.js";
import { CreateReservationCommandHandler } from "./application/handlers/command-handlers/CreateReservationCommandHandler.js";

// --- Imports: Infrastructure & Projections ---
// (คง path เดิมตามที่ขอ)
import { SupabaseEventStore } from "../../../packages/common/src/infrastructure/persistence/SupabaseEventStore.js";
import { RabbitMQAdapter } from "../../../packages/common/src/infrastructure/messaging/RabbitMQAdapter.js";
import { EventConsumer } from "./infrastructure/projections/EventConsumer.js";

// --- Logger Mock (เพื่อให้ใช้ syntax logger.info ได้เหมือน snippet ที่ให้มา) ---
const logger = {
  info: (msg) => console.log(msg),
  error: (msg, err) => console.error(msg, err),
};

// =================================================================
//  TIME FORMATTING HELPERS
// =================================================================

const TIME_ZONE = 'Asia/Bangkok';

/**
 * แปลงส่วนประกอบเวลา (Local + Offset) กลับเป็น Date Object (UTC)
 * เพื่อใช้ในการเปรียบเทียบ Logic (Start < End)
 */
function parseCompositeToISO(dateLocal, timeLocal, offset) {
  // สร้าง ISO String แบบมี Offset: "2025-11-24T09:00:00+07:00"
  const isoString = `${dateLocal}T${timeLocal}${offset}`;
  return new Date(isoString);
}

/**
 * แปลง UTC Date String จาก Database ให้เป็นส่วนประกอบ (Composite)
 * เพื่อส่งกลับไปให้ Frontend
 */
function formatToCustomDate(utcDateString, timeZone, offsetMinutes) {
  if (!utcDateString) return null;
  
  const dateObj = new Date(utcDateString);
  
  // 1. Unix Timestamp (Seconds) - เป็นตัวเลข
  const timeStamp = Math.floor(dateObj.getTime() / 1000);

  // 2. Local Date & Time Strings
  const dateLocal = dateObj.toLocaleDateString('en-CA', { timeZone }); // YYYY-MM-DD
  const timeLocal = dateObj.toLocaleTimeString('en-GB', { timeZone }); // HH:mm:ss

  // 3. Offset String
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offsetMinutes) / 60).toString().padStart(2, '0');
  const mins = (Math.abs(offsetMinutes) % 60).toString().padStart(2, '0');
  const timeZoneOffset = `${sign}${hours}:${mins}`;

  return { timeStamp, dateLocal, timeLocal, timeZoneOffset };
}

// =================================================================
//  App Initialization
// =================================================================

const app = express();
app.use(express.json());

const corsOptions = {
  origin: "http://localhost:4200",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

// =================================================================
//  Dependency Injection & Setup
// =================================================================

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
//  API Endpoints
// =================================================================

app.get("/debug-connection", (req, res) => {
  res.status(200).json({
    message: "User-Car Service OK",
    port: process.env.PORT,
  });
});

/**
 * GET /reservations/availability
 * ดึงสถานะและความว่างของช่องเวลา (Time Slots)
 */
app.get("/reservations/availability", async (req, res) => {
  const { date, parkingSiteId, floorId } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Date parameter is required in YYYY-MM-DD format." });
  }
  if (!parkingSiteId) {
    return res.status(400).json({ error: "parkingSiteId parameter is required." });
  }

  try {
    // 1. ดึงข้อมูล Timezone ของ Site
    const { data: siteData } = await supabase
      .from('parking_sites')
      .select('timezone, timezone_offset')
      .eq('id', parkingSiteId)
      .single();
    
    const siteTimeZone = siteData?.timezone || TIME_ZONE;
    const siteOffset = siteData?.timezone_offset || 420;

    // 2. ถาม Capacity จาก slot-service
    let totalCapacity = 0;
    try {
      const slotServiceUrl = process.env.SLOT_SERVICE_URL;
      let slotQueryUrl = `${slotServiceUrl}/slots?parkingSiteId=${parkingSiteId}`;
      if (floorId) slotQueryUrl += `&floorId=${floorId}`;
      
      const response = await axios.get(slotQueryUrl);
      totalCapacity = response.data ? response.data.length : 0;
      
      if (totalCapacity === 0) {
         return res.status(404).json({ error: `No slots found.` });
      }
    } catch (error) {
      logger.error(`[Error] Slot Service:`, error.message);
      return res.status(500).json({ error: "Cannot determine capacity." });
    }

    // 3. สร้าง Array 24 ช่องเวลา (คำนวณแบบ UTC แล้วแปลงกลับเป็น Composite Format)
    const timeSlots = [];
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    
    for (let i = 0; i < 24; i++) {
      const slotStart = new Date(dayStart); slotStart.setUTCHours(i);
      const slotEnd = new Date(dayStart); slotEnd.setUTCHours(i + 1);
      
      // แปลงเป็น Format ใหม่
      const startFmt = formatToCustomDate(slotStart.toISOString(), siteTimeZone, siteOffset);
      const endFmt = formatToCustomDate(slotEnd.toISOString(), siteTimeZone, siteOffset);

      // Slot ID Logic
      const dateStr = date.replace(/-/g, '');
      const hourStr = i.toString().padStart(2, "0");
      const locationPart = floorId ? floorId : parkingSiteId;
      const slotId = `S-${locationPart}-${dateStr}-${hourStr}00`;

      const displayText = `${startFmt.timeLocal.slice(0,5)} - ${endFmt.timeLocal.slice(0,5)}`;

      timeSlots.push({
        slotId,
        // Flat Structure & Timestamps
        startTimeStamp: startFmt.timeStamp,
        startDateLocal: startFmt.dateLocal,
        startTimeLocal: startFmt.timeLocal,
        
        endTimeStamp: endFmt.timeStamp,
        endDateLocal: endFmt.dateLocal,
        endTimeLocal: endFmt.timeLocal,
        
        timeZoneOffset: startFmt.timeZoneOffset,
        
        displayText,
        isAvailable: true,
        totalCapacity,
        bookedCount: 0,
        remainingCount: totalCapacity
      });
    }

    // 4. ดึงการจองและคำนวณ
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    let query = supabase
      .from("reservations")
      .select("start_time, end_time")
      .eq("parking_site_id", parkingSiteId)
      .lt("start_time", dayEnd.toISOString())
      .gt("end_time", dayStart.toISOString())
      .in("status", ["pending", "checked_in"]);

    if (floorId) query = query.eq("floor_id", floorId);

    const { data: bookedSlots, error } = await query;
    if (error) throw error;

    if (bookedSlots) {
      for (const slot of timeSlots) {
        // เปรียบเทียบด้วย Timestamp (เลข) แม่นยำกว่า
        const slotStartTs = slot.startTimeStamp * 1000;
        const slotEndTs = slot.endTimeStamp * 1000;

        const currentBookingsCount = bookedSlots.filter(booking => {
          const bStart = new Date(booking.start_time).getTime();
          const bEnd = new Date(booking.end_time).getTime();
          return bStart < slotEndTs && bEnd > slotStartTs;
        }).length;

        slot.bookedCount = currentBookingsCount;
        const remaining = totalCapacity - currentBookingsCount;
        slot.remainingCount = remaining > 0 ? remaining : 0;
        if (currentBookingsCount >= totalCapacity) slot.isAvailable = false;
      }
    }

    res.status(200).json(timeSlots);

  } catch (error) {
    logger.error(`[Error] GET availability:`, error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /reservations/:id
 * ดึงข้อมูล Reservation (Format Flat JSON + Timestamp)
 */
app.get("/reservations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("reservations")
      .select(`*, parking_sites ( timezone, timezone_offset )`)
      .eq("id", id)
      .single();

    if (error || !data) return res.status(404).json({ message: "Reservation not found" });

    const tz = data.parking_sites?.timezone || TIME_ZONE;
    const offset = data.parking_sites?.timezone_offset || 420;

    const startParts = formatToCustomDate(data.start_time, tz, offset);
    const endParts = formatToCustomDate(data.end_time, tz, offset);
    const createdParts = formatToCustomDate(data.created_at || data.reserved_at, tz, offset);

    const response = {
      reservationId: data.id,
      spotLocationId: data.slot_id,
      status: data.status.toUpperCase(),
      userId: data.user_id,
      
      startTimeStamp: startParts.timeStamp,
      startDateLocal: startParts.dateLocal,
      startTimeLocal: startParts.timeLocal,

      endTimeStamp: endParts.timeStamp,
      endDateLocal: endParts.dateLocal,
      endTimeLocal: endParts.timeLocal,

      timeZoneOffset: startParts.timeZoneOffset,
      createdAt: createdParts.timeStamp
    };

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /reservations
 * สร้างการจองใหม่ (รับค่าแบบ Composite)
 */
app.post("/reservations", async (req, res) => {
  const {
    userId, slotId,
    startTimeStamp, startDateLocal, startTimeLocal,
    endTimeStamp, endDateLocal, endTimeLocal,
    timeZoneOffset,
    parkingSiteId, floorId
  } = req.body;

  logger.info(`[API] POST /reservations for user: ${userId}`);

  // 1. Validate Basic Fields
  if (!userId || !slotId || !startDateLocal || !startTimeLocal ||
      !endDateLocal || !endTimeLocal || !timeZoneOffset ||
      !parkingSiteId || !floorId) {
    return res.status(400).json({ error: "Missing required composite time fields or IDs" });
  }

  // 2. Validate Logic (Start < End)
  const startDate = parseCompositeToISO(startDateLocal, startTimeLocal, timeZoneOffset);
  const endDate = parseCompositeToISO(endDateLocal, endTimeLocal, timeZoneOffset);
  
  if (startDate >= endDate) {
    return res.status(400).json({ error: "End time must be after start time" });
  }

  try {
    // 3. ส่ง object ทั้งก้อนนี้ไปให้ CreateReservationCommand
    // (ต้องแน่ใจว่า CreateReservationCommand.js ถูกแก้ให้รับ object แล้ว)
    const command = new CreateReservationCommand({
      userId, slotId,
      startTimeStamp, startDateLocal, startTimeLocal,
      endTimeStamp, endDateLocal, endTimeLocal,
      timeZoneOffset,
      parkingSiteId, floorId
    });

    const result = await createReservationHandler.handle(command);
    res.status(201).json(result);
  } catch (error) {
    logger.error(`[Error] POST /reservations:`, error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /reservations/:id/status
 */
app.post("/reservations/:id/status", async (req, res) => {
  const { status } = req.body;
  try {
    const command = new UpdateParkingStatusCommand(req.params.id, status);
    await updateParkingStatusHandler.handle(command);
    res.status(200).json({ message: "Updated" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /check-ins
 */
app.post("/check-ins", async (req, res) => {
  try {
    const command = new CheckInByLicensePlateCommand(req.body.license_plate);
    const result = await checkInByLicensePlateHandler.handle(command);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// =================================================================
//  Server Startup
// =================================================================

const PORT = process.env.PORT || 3003;

const startServer = async () => {
  try {
    await messageBroker.connect();
    console.log("✅ Message Broker connected successfully.");

    const consumer = new EventConsumer(supabase, messageBroker);
    await consumer.start();
    console.log("🎧 Event Consumer is running and listening for events.");

    app.listen(PORT, () => {
      console.log(`\n🚀 User-Car Service is running on http://localhost:${PORT}`);
      console.log(`   (CORS enabled for: ${corsOptions.origin})`);
    }).on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use.`);
      } else {
        console.error(`❌ Failed to start server on port ${PORT}:`, error);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error("❌ Failed to start the service:", error);
    process.exit(1);
  }
};

startServer();