// /services/user-car-service/src/index.js

import express from "express";
import cors from "cors"; // 1. Import CORS
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
//  CORS Configuration
// =================================================================
// 2. ตั้งค่า Options
const corsOptions = {
  origin: "http://localhost:4200", // อนุญาตเฉพาะ Angular App ของคุณ
};
// 3. ใช้งาน CORS Middleware (ต้องอยู่ก่อน Routes ทั้งหมด)
app.use(cors(corsOptions));
// =================================================================

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
//  API สำหรับ User Flow (ที่เพิ่มใหม่)
//  ดึงสถานะช่องเวลา (Time Slots) ทั้งหมดในวันที่ระบุ
// =================================================================
app.get("/reservations/availability", async (req, res) => {
  const { date } = req.query; // e.g., "2025-11-17"

  // 1. ตรวจสอบ Input
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res
      .status(400)
      .json({ error: "Date parameter is required in YYYY-MM-DD format." });
  }

  try {
    const timeSlots = [];
    const dayStart = new Date(`${date}T00:00:00.000Z`); // เริ่มต้นวันที่ 00:00 UTC

    // 2. สร้าง Array 24 ช่อง (ตามรูปแบบ JSON ที่คุณต้องการ)
    for (let i = 0; i < 24; i++) {
      const slotStartTime = new Date(dayStart);
      slotStartTime.setUTCHours(i);

      const slotEndTime = new Date(dayStart);
      slotEndTime.setUTCHours(i + 1); // สิ้นสุดที่ชั่วโมงถัดไป

      const displayText = `${i.toString().padStart(2, "0")}:00 - ${(i + 1)
        .toString()
        .padStart(2, "0")}:00`;

      timeSlots.push({
        slotId: `S-${date}-${i.toString().padStart(2, "0")}00`, // สร้าง ID เฉพาะ (SlotID-Date-Hour)
        startTime: slotStartTime.toISOString(),
        endTime: slotEndTime.toISOString(),
        displayText: displayText,
        isAvailable: true, // ตั้งค่าเริ่มต้นว่า "ว่าง"
      });
    }

    // 3. ดึง "การจองที่ Active" ทั้งหมดที่คาบเกี่ยวกับวันนั้น
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    const { data: bookedSlots, error } = await supabase
      .from("reservations") // 👈 (ใช้ชื่อตารางใหม่ 'reservations' ที่เราเปลี่ยนแล้ว)
      .select("start_time, end_time")
      .lt("start_time", dayEnd.toISOString()) // การจองที่เริ่มก่อนวันสิ้นสุด
      .gt("end_time", dayStart.toISOString()) // และจบหลังวันเริ่มต้น
      .in("status", ["pending", "checked_in"]); // 👈 เอาเฉพาะการจองที่ยัง Active

    if (error) throw error;

    // 4. อัปเดต Flag 'isAvailable'
    // วนลูปเช็กว่าช่องเวลาไหนทับซ้อนกับการจองที่มีอยู่
    if (bookedSlots && bookedSlots.length > 0) {
      for (const slot of timeSlots) {
        const slotHour = parseInt(slot.displayText.split(":")[0]); // ชั่วโมงของช่องเวลา (0-23)

        // ตรวจสอบว่ามี "การจองใด" ที่ทับซ้อนกับชั่วโมงนี้หรือไม่
        const isBooked = bookedSlots.some((booked) => {
          const startHour = new Date(booked.start_time).getUTCHours();
          const endHour = new Date(booked.end_time).getUTCHours();
          // ตรวจสอบว่า slotHour อยู่ในช่วง [startHour, endHour)
          return slotHour >= startHour && slotHour < endHour;
        });

        if (isBooked) {
          slot.isAvailable = false; // 👈 ถ้าทับซ้อน ให้อัปเดตเป็น "ไม่ว่าง"
        }
      }
    }

    // 5. ส่งผลลัพธ์ในรูปแบบ JSON ที่คุณต้องการ
    res.status(200).json(timeSlots);
  } catch (error) {
    console.error(`[Error] in GET /reservations/availability:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =================================================================
//  API Endpoints (ตอนนี้ทั้งหมดนี้จะถูกป้องกันโดย CORS)
// =================================================================
// --- Reservation Endpoints ---
// app.post("/reservations", async (req, res) => {
//   const { userId, slotId, startTime, endTime } = req.body;

//   console.log(`[API] Received POST /reservations for user: ${userId}`);

//   try {
//     const command = new CreateReservationCommand(
//       userId,
//       slotId,
//       startTime,
//       endTime
//     );
//     const result = await createReservationHandler.handle(command);
//     res.status(201).json(result);
//   } catch (error) {
//     // console.error(`[Error] in POST /reservations:`, error);
//     res.status(400).json({ error: error.message });
//   }
// });

app.post("/reservations", async (req, res) => {
  // 1. ดึงข้อมูลที่จำเป็นจาก Request Body
  // (slotId คือ ID ของช่องเวลา เช่น "S-20251117-0900")
  const { userId, slotId, startTime, endTime } = req.body;

  console.log(
    `[API] Received POST /reservations for user: ${userId} for slot: ${slotId}`
  );

  // 2. ตรวจสอบ Input
  if (!userId || !slotId || !startTime || !endTime) {
    return res.status(400).json({
      error: "userId, slotId, startTime, and endTime are all required.",
    });
  }

  try {
    // 3. สร้าง Command
    // (Command ของเราถูกออกแบบให้รับค่าเหล่านี้พอดี)
    const command = new CreateReservationCommand(
      userId,
      slotId,
      startTime,
      endTime
    );

    // 4. เรียก Handler
    const result = await createReservationHandler.handle(command);

    // 5. ตอบกลับเมื่อสำเร็จ
    res.status(201).json(result);
  } catch (error) {
    // 6. จัดการ Error (เช่น Concurrency Error หรือ Validation Error จาก Aggregate)
    console.error(`[Error] in POST /reservations:`, error);
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

const PORT = process.env.PORT || 3001; // (ไฟล์ .env ของคุณคงกำหนดเป็น 3003)

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
      // (อัปเดต Log นี้เพื่อความชัดเจน)
      console.log(
        `\n🚀 User-Car Service is running on http://localhost:${PORT}`
      );
      console.log(`   (CORS enabled for: http://localhost:4200)`); // แจ้งให้ทราบ
    });
  } catch (error) {
    console.error("❌ Failed to start the service:", error);
    process.exit(1); // ออกจากโปรแกรมถ้าไม่สามารถเริ่มระบบได้
  }
};

startServer();
