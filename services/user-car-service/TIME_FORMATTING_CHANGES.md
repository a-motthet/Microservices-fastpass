# Time Formatting Changes for user-car-service/src/index.js

## Step 1: Add Helper Function and Constants

After line 17 (`const logger = createLogger('user-car-service');`), add:

```javascript
const logger = createLogger('user-car-service');

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
```

## Step 2: Update GET /reservations/availability Endpoint

Replace the entire endpoint (lines 73-189) with:

```javascript
app.get("/reservations/availability", async (req, res, next) => {
  const { date, parkingSiteId, floorId } = req.query;

  // 1. ตรวจสอบ Input
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return next(new AppError("Date parameter is required in YYYY-MM-DD format.", 400));
  }
  if (!parkingSiteId) {
    return next(new AppError("parkingSiteId parameter is required.", 400));
  }

  try {
    // 2. Get Parking Site Timezone Info
    let siteTimezone = TIME_ZONE;
    let siteOffset = TIME_ZONE_OFFSET_MINUTES;
    
    try {
      const { data: siteData } = await supabase
        .from("parking_sites")
        .select("timezone, timezone_offset")
        .eq("id", parkingSiteId)
        .single();
      
      if (siteData) {
        siteTimezone = siteData.timezone || TIME_ZONE;
        siteOffset = siteData.timezone_offset || TIME_ZONE_OFFSET_MINUTES;
      }
    } catch (error) {
      logger.warn(`[Availability] Could not fetch timezone for site ${parkingSiteId}, using default`);
    }

    // 3. 📞 ถาม slot-service: "Site (และ Floor) นี้มีที่จอดทั้งหมดกี่ช่อง?"
    let totalCapacity = 0;
    try {
      const slotServiceUrl = process.env.SLOT_SERVICE_URL;
      if (!slotServiceUrl) throw new Error("SLOT_SERVICE_URL is not configured.");

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

    // 4. สร้าง Array 24 ช่องเวลา
    const timeSlots = [];
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    
    for (let i = 0; i < 24; i++) {
      const slotStartTime = new Date(dayStart);
      slotStartTime.setUTCHours(i);
      const slotEndTime = new Date(dayStart);
      slotEndTime.setUTCHours(i + 1);
      
      // สร้าง ID
      const dateStr = date.replace(/-/g, '');
      const hourStr = i.toString().padStart(2, "0");
      const slotIdSuffix = floorId ? `-${floorId}` : '';
      const slotId = `S-${parkingSiteId}${slotIdSuffix}-${dateStr}-${hourStr}00`;

      // ใช้ Helper แปลงเวลา
      const startFmt = formatToCustomDate(slotStartTime.toISOString(), siteTimezone, siteOffset);
      const endFmt = formatToCustomDate(slotEndTime.toISOString(), siteTimezone, siteOffset);
      
      timeSlots.push({
        slotId,
        // เปลี่ยนจาก ISO String เป็น Timestamp Number
        startTimeStamp: startFmt.timeStamp,
        endTimeStamp: endFmt.timeStamp,
        
        // เพิ่ม Local String เพื่อความง่ายของ Frontend
        displayText: `${startFmt.timeLocal.slice(0,5)} - ${endFmt.timeLocal.slice(0,5)}`, // 09:00 - 10:00
        
        isAvailable: true,
        totalCapacity: totalCapacity,
        bookedCount: 0,
        remainingCount: totalCapacity
      });
    }

    // 5. ดึงการจองที่ Active ทั้งหมด (กรองตาม Site และ Floor)
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    
    let query = supabase
      .from("reservations")
      .select("start_time, end_time")
      .eq("parking_site_id", parkingSiteId)
      .lt("start_time", dayEnd.toISOString())
      .gt("end_time", dayStart.toISOString())
      .in("status", ["pending", "checked_in"]);

    if (floorId) {
      query = query.eq("floor_id", floorId);
    }

    const { data: bookedSlots, error } = await query;
    
    if (error) throw error;

    // 6. 🧠 คำนวณความว่าง
    if (bookedSlots) {
      for (const slot of timeSlots) {
        // แปลง timestamp กลับเป็น milliseconds สำหรับการเปรียบเทียบ
        const slotStart = slot.startTimeStamp * 1000;
        const slotEnd = slot.endTimeStamp * 1000;

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
```

## Step 3: Update GET /reservations/:id Endpoint

Replace the endpoint (lines 240-252) with:

```javascript
app.get("/reservations/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // 1. Query: Join with parking_sites to get timezone information
    const { data, error } = await supabase
      .from("reservations")
      .select(`*, parking_sites ( timezone, timezone_offset )`)
      .eq("id", id)
      .single();

    if (error || !data) {
      return next(new AppError("Reservation not found", 404));
    }
    
    // 2. Prepare Timezone data
    const tz = data.parking_sites?.timezone || TIME_ZONE;
    const offset = data.parking_sites?.timezone_offset || TIME_ZONE_OFFSET_MINUTES;

    // 3. Format time values using helper
    const start = formatToCustomDate(data.start_time, tz, offset);
    const end = formatToCustomDate(data.end_time, tz, offset);
    const created = formatToCustomDate(data.created_at, tz, offset);

    // 4. Create flat response JSON
    const response = {
      reservationId: data.id,
      spotLocationId: data.slot_id,
      status: data.status.toUpperCase(),
      userId: data.user_id,

      // Start Time Fields
      startTimeStamp: start.timeStamp,
      startDateLocal: start.dateLocal,
      startTimeLocal: start.timeLocal,

      // End Time Fields
      endTimeStamp: end.timeStamp,
      endDateLocal: end.dateLocal,
      endTimeLocal: end.timeLocal,

      // Metadata
      timeZoneOffset: start.timeZoneOffset,
      createdAt: created.timeStamp // Send as timestamp number
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});
```

## Summary of Changes

1. **Added `formatToCustomDate` helper function** - Converts UTC dates to formatted objects
2. **Added timezone constants** - `TIME_ZONE` and `TIME_ZONE_OFFSET_MINUTES`
3. **Updated `/reservations/availability`**:
   - Queries parking_sites for timezone info
   - Uses timestamps instead of ISO strings
   - Updates displayText to use formatted local time
   - Adjusts slot comparison logic for timestamps
4. **Updated `/reservations/:id`**:
   - Joins with parking_sites table
   - Returns flat response with formatted time fields
   - Uses timestamps for time values
