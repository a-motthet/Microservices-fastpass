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
import { SupabaseEventStore } from "./../../../packages/common/src/infrastructure/persistence/SupabaseEventStore.js";
import { RabbitMQAdapter } from "./../../../packages/common/src/infrastructure/messaging/RabbitMQAdapter.js";
import { EventConsumer } from "./infrastructure/projections/EventConsumer.js";

// =================================================================
//  Error Handling Classes & Utilities
// =================================================================
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  console.error('💥 Error Handler Caught:', err);

  res.status(err.statusCode).json({
    status: err.status,
    error: err.message
  });
};

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg, err) => console.error(`[ERROR] ${msg}`, err),
};

// --- Time Helpers ---
function parseCompositeToISO(dateLocal, timeLocal, offset) {
  const isoString = `${dateLocal}T${timeLocal}${offset}`;
  return new Date(isoString);
}

function formatOffset(offsetMinutes) {
  if (offsetMinutes === undefined || offsetMinutes === null) return '+00:00';
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offsetMinutes) / 60).toString().padStart(2, '0');
  const mins = (Math.abs(offsetMinutes) % 60).toString().padStart(2, '0');
  return `${sign}${hours}:${mins}`;
}

function getDateTimeParts(utcDateString, timeZone) {
  if (!utcDateString) return { timeStamp: null, dateLocal: null, timeLocal: null };
  const dateObj = new Date(utcDateString);
  return {
    timeStamp: Math.floor(dateObj.getTime() / 1000).toString(),
    dateLocal: dateObj.toLocaleDateString('en-CA', { timeZone }),
    timeLocal: dateObj.toLocaleTimeString('en-GB', { timeZone })
  };
}

// =================================================================
//  App Setup
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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const eventStore = new SupabaseEventStore(supabase);
const messageBroker = new RabbitMQAdapter();

const updateParkingStatusHandler = new UpdateParkingStatusCommandHandler(eventStore, messageBroker, supabase);
const checkInByLicensePlateHandler = new CheckInByLicensePlateCommandHandler(eventStore, messageBroker, supabase);
const createReservationHandler = new CreateReservationCommandHandler(eventStore, messageBroker);

// =================================================================
//  API Endpoints
// =================================================================

app.get("/debug-connection", (req, res) => {
  res.status(200).json({
    message: "User-Car Service OK",
    port: process.env.PORT,
  });
});

// GET /reservations/availability
app.get("/reservations/availability", async (req, res, next) => {
  const { date, parkingSiteId, floorId } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return next(new AppError("Date parameter is required in YYYY-MM-DD format.", 400));
  if (!parkingSiteId) return next(new AppError("parkingSiteId parameter is required.", 400));

  try {
    const { data: siteData } = await supabase.from('parking_sites').select('timezone, timezone_offset').eq('id', parkingSiteId).single();
    const siteTimeZone = siteData?.timezone || 'Asia/Bangkok';
    const siteOffset = siteData?.timezone_offset || 420;

    let totalCapacity = 0;
    try {
      const slotServiceUrl = process.env.SLOT_SERVICE_URL;
      let slotQueryUrl = `${slotServiceUrl}/slots?parkingSiteId=${parkingSiteId}`;
      if (floorId) slotQueryUrl += `&floorId=${floorId}`;
      
      const response = await axios.get(slotQueryUrl);
      totalCapacity = response.data ? response.data.length : 0;
      
      if (totalCapacity === 0) return next(new AppError(`No slots found.`, 404));
    } catch (error) {
      logger.error(`Slot Service Error:`, error.message);
      return next(new AppError("Cannot determine capacity.", 500));
    }

    const timeSlots = [];
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const timeZoneOffsetStr = formatOffset(siteOffset);
    
    for (let i = 0; i < 24; i++) {
      const slotStart = new Date(dayStart); slotStart.setUTCHours(i);
      const slotEnd = new Date(dayStart); slotEnd.setUTCHours(i + 1);
      
      const startFmt = getDateTimeParts(slotStart.toISOString(), siteTimeZone);
      const endFmt = getDateTimeParts(slotEnd.toISOString(), siteTimeZone);

      const dateStr = date.replace(/-/g, '');
      const hourStr = i.toString().padStart(2, "0");
      const locationPart = floorId ? floorId : parkingSiteId;
      const slotId = `S-${locationPart}-${dateStr}-${hourStr}00`;
      const displayText = `${startFmt.timeLocal.slice(0,5)} - ${endFmt.timeLocal.slice(0,5)}`;

      timeSlots.push({
        slotId,
        startTimeStamp: startFmt.timeStamp,
        startDateLocal: startFmt.dateLocal,
        startTimeLocal: startFmt.timeLocal,
        endTimeStamp: endFmt.timeStamp,
        endDateLocal: endFmt.dateLocal,
        endTimeLocal: endFmt.timeLocal,
        timeZoneOffset: timeZoneOffsetStr,
        displayText,
        isAvailable: true,
        totalCapacity,
        bookedCount: 0,
        remainingCount: totalCapacity
      });
    }

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
        const slotStartTs = parseInt(slot.startTimeStamp) * 1000;
        const slotEndTs = parseInt(slot.endTimeStamp) * 1000;
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
    next(error);
  }
});

/**
 * GET /reservations/:id
 * ดึงข้อมูล Reservation (Format Flat JSON + Timestamp + Status Code)
 */
app.get("/reservations/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // 1. ดึงข้อมูลพร้อม Join กับ parking_sites เพื่อเอา Timezone
    const { data, error } = await supabase
      .from("reservations")
      .select(`*, parking_sites ( timezone, timezone_offset )`)
      .eq("id", id)
      .single();

    if (error || !data) return next(new AppError("Reservation not found", 404));

    // 2. เตรียมข้อมูล Timezone
    const tz = data.parking_sites?.timezone || 'Asia/Bangkok';
    const offset = data.parking_sites?.timezone_offset || 420;

    // 3. แปลงข้อมูลเวลา (ใช้ Helper getDateTimeParts ที่มีอยู่แล้ว)
    const startParts = getDateTimeParts(data.start_time, tz);
    const endParts = getDateTimeParts(data.end_time, tz);
    // ใช้ reserved_at หรือ created_at ถ้าไม่มี
    const createdParts = getDateTimeParts(data.created_at || data.reserved_at, tz);

    // 4. Mapping Status Code (ถ้าใน DB ไม่ได้เก็บ status_code ไว้ ก็แปลงตรงนี้ได้เลย)
    const STATUS_CODE_MAP = {
      'pending': '1',
      'checked_in': '2',
      'checked_out': '3',
      'cancelled': '0'
    };
    // ใช้ค่าจาก DB หรือแปลงจาก text
    const statusCode = data.status_code || STATUS_CODE_MAP[data.status] || '99';

    // 5. สร้าง JSON Response ตามรูปแบบใหม่
    const response = {
      reservationId: data.id,
      spotLocationId: data.slot_id, // Map slot_id -> spotLocationId
      
      // Status Section
      status: statusCode,             // "1"
      statusDescription: data.status, // "pending"
      
      userId: data.user_id,
      parkingSiteId: data.parking_site_id, // เพิ่มข้อมูล Site
      floorId: data.floor_id,              // เพิ่มข้อมูล Floor
      
      // Start Time
      startTimeStamp: startParts.timeStamp,
      startDateLocal: startParts.dateLocal,
      startTimeLocal: startParts.timeLocal,

      // End Time
      endTimeStamp: endParts.timeStamp,
      endDateLocal: endParts.dateLocal,
      endTimeLocal: endParts.timeLocal,

      // Meta
      timeZoneOffset: formatOffset(offset),
      createdAt: createdParts.timeStamp
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});
// POST /reservations (with Auto-Assign)
app.post("/reservations", async (req, res, next) => {
  const {
    userId,
    // slotId, // unused, we use auto-assign
    startTimeStamp, startDateLocal, startTimeLocal,
    endTimeStamp, endDateLocal, endTimeLocal,
    timeZoneOffset,
    parkingSiteId, floorId
  } = req.body;

  logger.info(`[API] POST /reservations for user: ${userId} at ${floorId}`);

  if (!userId || !startDateLocal || !startTimeLocal || !endDateLocal || !endTimeLocal || !timeZoneOffset || !parkingSiteId || !floorId) {
    return next(new AppError("Missing required fields for auto-assignment", 400));
  }

  // 1. Get Vehicle Type from body
  let vehicleType = req.body.vehicle_type || 'car';
  let carId = null; 
  
  // Note: carId is null because we are not looking up by licensePlate anymore as per requirement.

  const startDate = parseCompositeToISO(startDateLocal, startTimeLocal, timeZoneOffset);
  const endDate = parseCompositeToISO(endDateLocal, endTimeLocal, timeZoneOffset);
  
  if (startDate >= endDate) return next(new AppError("End time must be after start time", 400));

  try {
    // --- Auto Assign Logic ---
    let physicalSlots = [];
    try {
        const slotServiceUrl = process.env.SLOT_SERVICE_URL;
        const response = await axios.get(`${slotServiceUrl}/slots?parkingSiteId=${parkingSiteId}&floorId=${floorId}&status=available`);
        physicalSlots = response.data;
        
        if (!physicalSlots || physicalSlots.length === 0) {
            return next(new AppError(`No physical slots available configuration found for floor ${floorId}`, 404));
        }
    } catch (err) {
        logger.error("Failed to fetch physical slots:", err.message);
        return next(new AppError("System cannot retrieve slot configuration.", 500));
    }

    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    const { data: bookedReservations, error } = await supabase
        .from("reservations")
        .select("slot_id")
        .eq("floor_id", floorId)
        .in("status", ["pending", "checked_in"])
        .lt("start_time", endISO)
        .gt("end_time", startISO);

    if (error) throw error;

    const bookedSlotIds = new Set(bookedReservations.map(r => r.slot_id));
    const assignedSlot = physicalSlots.find(slot => !bookedSlotIds.has(slot.id));

    if (!assignedSlot) {
        return next(new AppError("All slots are fully booked for this time range.", 409));
    }

    logger.info(`[Auto-Assign] Assigned physical slot: ${assignedSlot.id} (${assignedSlot.name})`);

    const command = new CreateReservationCommand({
      userId, slotId: assignedSlot.id,
      startTimeStamp, startDateLocal, startTimeLocal,
      endTimeStamp, endDateLocal, endTimeLocal,
      timeZoneOffset,
      parkingSiteId, floorId,
      vehicleType, // 👈 New Input
      carId        // 👈 New Input
    });

    const result = await createReservationHandler.handle(command);
    
    res.status(201).json({
        ...result,
        assignedSlotName: assignedSlot.name
    });

  } catch (error) {
    logger.error(`[Error] POST /reservations:`, error);
    next(error);
  }
});

// POST /reservations/:id/status
app.post("/reservations/:id/status", async (req, res, next) => {
  const { status } = req.body;
  try {
    const command = new UpdateParkingStatusCommand(req.params.id, status);
    await updateParkingStatusHandler.handle(command);
    res.status(200).json({ message: "Updated" });
  } catch (error) {
    next(error);
  }
});

// POST /check-ins
app.post("/check-ins", async (req, res, next) => {
  try {
    const command = new CheckInByLicensePlateCommand(req.body.license_plate);
    const result = await checkInByLicensePlateHandler.handle(command);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.includes("not found")) return next(new AppError(error.message, 404));
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