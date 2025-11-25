// recently-service/src/index.js

// (ไม่จำเป็นต้อง import dotenv ถ้าใช้ --env-file=.env ตอนรัน)

import express from "express";
import { createClient } from "@supabase/supabase-js";

// Imports: Infrastructure & Projections
import { RabbitMQAdapter } from "@parking-reservation/common";
import { EventConsumer } from "./projections/EventConsumer.js";

const app = express();
app.use(express.json());


// =================================================================
//  TIME FORMATTING HELPER
// =================================================================

/**
 * Helper: แปลง UTC Date เป็น Format ที่ต้องการ
 * @param {string} utcDateString - เวลาจาก DB (ISO)
 * @param {string} timeZone - เช่น 'Asia/Bangkok'
 * @param {number} offsetMinutes - เช่น 420
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

// Timezone Configuration for Thailand
const TIME_ZONE = 'Asia/Bangkok';
const TIME_ZONE_OFFSET_MINUTES = 420; // UTC+07:00

// --- Dependency Injection & Setup ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
const messageBroker = new RabbitMQAdapter();

// =================================================================
//  API Endpoints
// =================================================================

// --- Health Check ---
app.get("/health", (req, res) =>
  res.status(200).send("Recently Service is OK")
);

// --- Recently Activity Endpoint ---
app.get("/recent-activity/:userId", async (req, res) => {
  const { userId } = req.params;
  console.log(`[API] Fetching recent activity for user: ${userId}`);

  try {
    const { data, error } = await supabase
      .from("recently_activity_read_model")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }) // เรียงจากกิจกรรมล่าสุดไปเก่าสุด
      .limit(15); // จำกัดแค่ 15 กิจกรรมล่าสุด

    if (error) {
      throw error;
    }

    // Format time fields in the response
    const formattedData = data.map(activity => ({
      ...activity,
      created_at: formatToCustomDate(activity.created_at, TIME_ZONE, TIME_ZONE_OFFSET_MINUTES),
      updated_at: formatToCustomDate(activity.updated_at, TIME_ZONE, TIME_ZONE_OFFSET_MINUTES),
      start_time: formatToCustomDate(activity.start_time, TIME_ZONE, TIME_ZONE_OFFSET_MINUTES),
      end_time: formatToCustomDate(activity.end_time, TIME_ZONE, TIME_ZONE_OFFSET_MINUTES)
    }));

    res.status(200).json(formattedData);
  } catch (error) {
    console.error(
      `[Error] Fetching recent activity for user ${userId}:`,
      error.message
    );
    res.status(500).json({ error: "Failed to fetch recent activity." });
  }
});

// =================================================================
//  Server Startup
// =================================================================

const PORT = process.env.PORT || 3005;

const startServer = async () => {
  try {
    // 1. เชื่อมต่อกับ RabbitMQ
    await messageBroker.connect();
    console.log("✅ Message Broker connected successfully.");

    // 2. เริ่มต้น Event Consumer ให้พร้อมรับ Event
    const consumer = new EventConsumer(supabase, messageBroker);
    await consumer.start();
    console.log("🎧 Event Consumer is running and listening for events.");

    // 3. เริ่มต้น Express Server ให้พร้อมรับ API Request
    app.listen(PORT, () => {
      console.log(
        `\n🚀 Recently Service is running on http://localhost:${PORT}`
      );
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
    console.error("❌ Failed to start the Recently service:", error);
    process.exit(1);
  }
};

startServer();
