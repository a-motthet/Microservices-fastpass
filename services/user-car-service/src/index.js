// /services/user-car-service/src/index.js

import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import { VEHICLE_TYPE, VEHICLE_TYPE_REVERSE } from "../../../packages/common/src/constants/vehicleTypes.js";

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

  // GET /availability/timeline
app.post('/availability/timeline', async (req, res, next) => {
  try {
    const { siteId, buildingId, floorId, zoneIds, vehicleTypeCode, date } = req.body;
    
    // Default date to 'Asia/Bangkok' current date if not provided
    // This prevents 'new Date().toISOString()' returning yesterday during late night/early morning UTC
    let searchDate = date;
    if (!searchDate) {
        const now = new Date();
        // Shift to UTC+7 (simplest way without libraries like moment/luxon)
        const thaiTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); 
        searchDate = thaiTime.toISOString().split('T')[0];
    }

    if (!siteId) return next(new AppError("siteId is required", 400));
    if (!buildingId) return next(new AppError("buildingId is required", 400)); // USER REQUEST: Must specify building

    // Validation for vehicleTypeCode if strictness is needed (0=Moto, 1=Car, 2=EV)
    if (vehicleTypeCode === undefined) return next(new AppError("vehicleTypeCode is required (0, 1, or 2)", 400));

    // Resolve Building -> Floors
    let buildingFloorIds = [];
    if (buildingId) {
        let bIds = Array.isArray(buildingId) ? buildingId : [buildingId];
        const { data: floorsInBuildings, error: floorError } = await supabase
            .from('floors')
            .select('id')
            .in('building_id', bIds);
        
        if (floorError) throw floorError;
        if (floorsInBuildings) {
            buildingFloorIds = floorsInBuildings.map(f => f.id);
        }
    }

    // --- Step 1: หา Total Capacity ---
    // ใช้ Slot Service หรือ Query ตรงๆ? User Car Service มี access ไปที่ supabase เดียวกัน ถ้า table structure อนุญาต
    // ในที่นี้เรา access ตาราง slots ได้ (Supabase shared)
    let capacityQuery = supabase
      .from('slots')
      .select('id', { count: 'exact', head: true })
      .eq('parking_site_id', siteId)
      .neq('status', 'maintenance'); // นับทุกช่องที่ใช้งานได้ (ไม่เสีย/ปิดปรับปรุง) รวมทั้งที่ Occupied/Reserved อยู่ด้วย

    // Filter by Building (via floors)
    if (buildingFloorIds.length > 0) {
        capacityQuery = capacityQuery.in('floor_id', buildingFloorIds);
    }
    
    if (vehicleTypeCode !== undefined) capacityQuery = capacityQuery.eq('vehicle_type_code', vehicleTypeCode);
    
    // Support Multiple Floors
    if (floorId) {
       const isArray = Array.isArray(floorId);
       const isAll = isArray 
           ? floorId.some(f => f && f.toUpperCase() === 'ALL') 
           : (floorId.toUpperCase() === 'ALL');

       if (!isAll) {
           if (isArray) {
               capacityQuery = capacityQuery.in('floor_id', floorId);
           } else {
               capacityQuery = capacityQuery.eq('floor_id', floorId);
           }
       }
    }
    
    // Support Multiple Zones (Array)
    if (zoneIds && Array.isArray(zoneIds) && zoneIds.length > 0) {
        capacityQuery = capacityQuery.in('zone_id', zoneIds);
    }

    const { count: totalCapacity, error: capError } = await capacityQuery;
    if (capError) throw capError;

    // --- Step 2: ดึงข้อมูลการจองในวันนั้น ---
    const startOfDay = `${searchDate}T00:00:00`;
    const endOfDay = `${searchDate}T23:59:59`;

    let reservationQuery = supabase
      .from('reservations')
      .select('start_time, end_time, slot_id')
      .eq('parking_site_id', siteId)
      .neq('status', 'cancelled')
      .neq('status', 'checked_out')
      .lt('start_time', endOfDay)
      .gt('end_time', startOfDay);

    if (vehicleTypeCode !== undefined) reservationQuery = reservationQuery.eq('vehicle_type_code', vehicleTypeCode);
    
    // Filter by Building (via floors)
    if (buildingFloorIds.length > 0) {
        reservationQuery = reservationQuery.in('floor_id', buildingFloorIds);
    }

    // Support Multiple Floors (Reservations)
    if (floorId) {
        const isArray = Array.isArray(floorId);
        const isAll = isArray 
            ? floorId.some(f => f && f.toUpperCase() === 'ALL') 
            : (floorId.toUpperCase() === 'ALL');
 
        if (!isAll) {
            if (isArray) {
                reservationQuery = reservationQuery.in('floor_id', floorId);
            } else {
                reservationQuery = reservationQuery.eq('floor_id', floorId);
            }
        }
    }

    // Filter Reservations by Zone(s) via Slot lookup
    if (zoneIds && Array.isArray(zoneIds) && zoneIds.length > 0) {
        const { data: slotsInZones } = await supabase.from('slots').select('id').in('zone_id', zoneIds);
        if (slotsInZones && slotsInZones.length > 0) {
            const targetSlotIds = slotsInZones.map(s => s.id);
            reservationQuery = reservationQuery.in('slot_id', targetSlotIds);
        } else {
             reservationQuery = reservationQuery.eq('slot_id', 'nomatch'); 
        }
    }

    const { data: reservations, error: resError } = await reservationQuery;
    if (resError) throw resError;

    // --- Step 3: คำนวณรายชั่วโมง ---
    const slots = [];
    for (let h = 8; h < 20; h++) { // 08:00 - 20:00
      // Construct Date with Fixed Offset +07:00 for consistency with Thailand context implied
      const timeStr = `${h.toString().padStart(2,'0')}:00`;
      const slotStartIso = `${searchDate}T${timeStr}:00+07:00`;
      const slotEndIso = `${searchDate}T${(h+1).toString().padStart(2,'0')}:00:00+07:00`;
      
      const slotStart = new Date(slotStartIso); 
      const slotEnd = new Date(slotEndIso);

      // นับคนจองที่เวลาทับกับ Slot นี้
      const reservedCount = reservations.filter(r => {
        const rStart = new Date(r.start_time);
        const rEnd = new Date(r.end_time);
        // Overlap logic: Start < SlotEnd && End > SlotStart
        return rStart < slotEnd && rEnd > slotStart;
      }).length;

      const available = Math.max(0, totalCapacity - reservedCount);

      slots.push({
        timeLabel: timeStr,
        totalCapacity,
        reservedCount,
        availableCount: available,
        status: available === 0 ? 'full' : 'available'
      });
    }

    res.json({
      meta: {
        requestDate: searchDate,
        vehicleTypeCode,
        siteId,
        floorId,
        zoneIds
      },
      timeline: slots
    });
  } catch (error) {
    next(error);
  }
});

// POST /availability/summary
app.post('/availability/summary', async (req, res, next) => {
  try {
    const { siteId, buildingId, floorId, vehicleTypeCode, date } = req.body;
    const searchDate = date || new Date().toISOString().split('T')[0];
    
    if (!siteId) return next(new AppError("siteId is required", 400));
    if (!buildingId) return next(new AppError("buildingId is required", 400)); // USER REQUEST: Must specify building

    // Resolve Building -> Floors
    let buildingFloorIds = [];
    if (buildingId) {
        let bIds = Array.isArray(buildingId) ? buildingId : [buildingId];
        const { data: floorsInBuildings, error: floorError } = await supabase
            .from('floors')
            .select('id')
            .in('building_id', bIds);
        
        if (floorError) throw floorError;
        if (floorsInBuildings) {
            buildingFloorIds = floorsInBuildings.map(f => f.id);
        }
    }

    // --- Step 1: หา Capacity ของแต่ละ Zone ---
    // เพื่อความง่าย: ดึง slot ทั้งหมดที่ available มาก่อน
    let slotsQuery = supabase
      .from('slots')
      .select('zone_id, status, zones(name)') // Join to get Zone Name if possible
      .eq('parking_site_id', siteId)
      .eq('vehicle_type_code', vehicleTypeCode)
      .neq('status', 'maintenance'); // Count valid slots (available + occupied)

    // Filter by Building (via floors)
    if (buildingFloorIds.length > 0) {
        slotsQuery = slotsQuery.in('floor_id', buildingFloorIds);
    }

    if (floorId) {
        const isArray = Array.isArray(floorId);
        const isAll = isArray 
            ? floorId.some(f => f && f.toUpperCase() === 'ALL') 
            : (floorId.toUpperCase() === 'ALL');

        if (!isAll) {
            if (isArray) {
                slotsQuery = slotsQuery.in('floor_id', floorId);
            } else {
                slotsQuery = slotsQuery.eq('floor_id', floorId);
            }
        }
    }
    
    const { data: allSlots, error: slotError } = await slotsQuery;
    if (slotError) throw slotError;

    // Grouping: นับ Capacity รายโซน (Group by Name)
    const statsByName = {}; 
    const slotToZoneName = {}; // Map slot_id -> zoneName for reservation checking

    allSlots.forEach(s => {
      // Use zone name as key. If missing, fallback to 'Unknown'
      const zName = s.zones ? s.zones.name : 'Unknown Zone';
      
      // Store mapping for reservation step
      slotToZoneName[s.id] = zName;

      if (!statsByName[zName]) {
         statsByName[zName] = { 
            total: 0, 
            reserved: 0,
            zoneName: zName,
            zoneIds: new Set() // Keep track of original IDs just in case
         };
      }
      statsByName[zName].total++;
      if (s.zone_id) statsByName[zName].zoneIds.add(s.zone_id); // Collect IDs
    });

    // --- Step 2: นับยอดจอง (Reservations) ของวันนั้น ---
    const startOfDay = `${searchDate}T00:00:00`;
    const endOfDay = `${searchDate}T23:59:59`;

    let resQuery = supabase
      .from('reservations')
      .select('slot_id') 
      .eq('parking_site_id', siteId)
      .eq('vehicle_type_code', vehicleTypeCode)
      .neq('status', 'cancelled')
      .neq('status', 'checked_out')
      .lt('start_time', endOfDay)
      .gt('end_time', startOfDay);

    if (floorId) {
        if (Array.isArray(floorId)) {
            if (!floorId.some(f => f.toUpperCase() === 'ALL')) {
                resQuery = resQuery.in('floor_id', floorId);
            }
        } else {
            resQuery = resQuery.eq('floor_id', floorId);
        }
    }

    // Filter by Building (via floors)
    if (buildingFloorIds.length > 0) {
        resQuery = resQuery.in('floor_id', buildingFloorIds);
    }

    const { data: reservations, error: resError } = await resQuery;
    if (resError) throw resError;

    // Create a Set of booked Slot IDs
    const bookedSlotIds = new Set(reservations.map(r => r.slot_id));

    // Calculate reserved count by checking all slots
    // Iterate 'allSlots' again to see if they are booked
    allSlots.forEach(s => {
        if (bookedSlotIds.has(s.id)) {
            const zName = slotToZoneName[s.id];
            if (statsByName[zName]) {
                statsByName[zName].reserved++;
            }
        }
    });

    // --- Step 3: Format Response ---
    const zonesResult = Object.keys(statsByName).map(name => {
      const stat = statsByName[name];
      const available = Math.max(0, stat.total - stat.reserved);
      return {
        zoneName: name, // Grouped Name
        zoneIds: Array.from(stat.zoneIds), // Returns array of IDs involved
        totalCapacity: stat.total,
        reservedCount: stat.reserved,
        availableCount: available,
        status: available === 0 ? 'full' : 'available'
      };
    });

    // ยอดรวมทั้งหมด
    const totalAvailable = zonesResult.reduce((sum, z) => sum + z.availableCount, 0);

    res.json({
      siteId,
      meta: { requestDate: searchDate },
      summary: {
        totalAvailable,
        zones: zonesResult
      }
    });

  } catch (error) {
    next(error);
  }
});

// GET /reservations/availability/zones (Deprecated?)
  app.get('/reservations/availability/zones', async (req, res, next) => {
  const { date, parkingSiteId, floorId, type } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return next(new AppError("Date parameter is required in YYYY-MM-DD format.", 400));
  if (!parkingSiteId) return next(new AppError("parkingSiteId parameter is required.", 400));

  try {
    const { data: siteData } = await supabase.from('parking_sites').select('timezone, timezone_offset').eq('id', parkingSiteId).single();
    const siteTimeZone = siteData?.timezone || 'Asia/Bangkok';
    const siteOffset = siteData?.timezone_offset || 420;

    // 1. Fetch Slots (with Zone Info)
    let slots = [];
    try {
      const slotServiceUrl = process.env.SLOT_SERVICE_URL;
      let slotQueryUrl = `${slotServiceUrl}/slots?parkingSiteId=${parkingSiteId}`;
      if (floorId) slotQueryUrl += `&floorId=${floorId}`;
      if (type) slotQueryUrl += `&type=${type}`;
      
      const response = await axios.get(slotQueryUrl);
      slots = response.data || [];
      
      if (slots.length === 0) return next(new AppError(`No slots found.`, 404));
    } catch (error) {
      logger.error(`Slot Service Error:`, error.message);
      return next(new AppError("Cannot determine capacity.", 500));
    }

    // 2. Group Slots by Zone
    const zonesMap = {};
    slots.forEach(slot => {
        const zId = slot.zone_id || 'uncategorized';
        const zName = slot.zones?.name || 'Uncategorized';
        
        if (!zonesMap[zId]) {
            zonesMap[zId] = {
                zoneId: zId,
                zoneName: zName,
                totalCapacity: 0,
                slots: []
            };
        }
        zonesMap[zId].totalCapacity++;
        zonesMap[zId].slots.push(slot.id);
    });

    // 3. Fetch Reservations
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    let query = supabase
      .from("reservations")
      .select("start_time, end_time, slot_id")
      .eq("parking_site_id", parkingSiteId)
      .lt("start_time", dayEnd.toISOString())
      .gt("end_time", dayStart.toISOString())
      .in("status", ["pending", "checked_in"]);

    if (floorId) query = query.eq("floor_id", floorId);
    const { data: bookedSlots, error } = await query;
    if (error) throw error;

    // 4. Calculate Availability Per Zone Per Hour
    const resultZones = [];
    const timeZoneOffsetStr = formatOffset(siteOffset);

    for (const zId in zonesMap) {
        const zone = zonesMap[zId];
        const timeSlots = [];
        const zoneSlotIds = new Set(zone.slots);

        for (let i = 0; i < 24; i++) {
            const slotStart = new Date(dayStart); slotStart.setUTCHours(i);
            const slotEnd = new Date(dayStart); slotEnd.setUTCHours(i + 1);
            
            const startFmt = getDateTimeParts(slotStart.toISOString(), siteTimeZone);
            const endFmt = getDateTimeParts(slotEnd.toISOString(), siteTimeZone);
            const displayText = `${startFmt.timeLocal.slice(0,5)} - ${endFmt.timeLocal.slice(0,5)}`;

            const slotStartTs = Math.floor(slotStart.getTime() / 1000) * 1000;
            const slotEndTs = Math.floor(slotEnd.getTime() / 1000) * 1000;

            // Count bookings for this zone in this hour
            const bookedCount = bookedSlots ? bookedSlots.filter(booking => {
                // Must be in this zone
                if (!zoneSlotIds.has(booking.slot_id)) return false;

                const bStart = new Date(booking.start_time).getTime();
                const bEnd = new Date(booking.end_time).getTime();
                return bStart < slotEndTs && bEnd > slotStartTs;
            }).length : 0;

            const remaining = zone.totalCapacity - bookedCount;

            timeSlots.push({
                startTimeStamp: startFmt.timeStamp,
                startDateLocal: startFmt.dateLocal,
                startTimeLocal: startFmt.timeLocal,
                endTimeStamp: endFmt.timeStamp,
                endDateLocal: endFmt.dateLocal,
                endTimeLocal: endFmt.timeLocal,
                timeZoneOffset: timeZoneOffsetStr,
                displayText,
                isAvailable: remaining > 0,
                totalCapacity: zone.totalCapacity,
                bookedCount,
                remainingCount: remaining > 0 ? remaining : 0
            });
        }
        resultZones.push({
            zoneId: zone.zoneId,
            zoneName: zone.zoneName,
            availability: timeSlots
        });
    }

    res.status(200).json(resultZones);
  } catch (error) {
    next(error);
  }
});

// GET /reservations/availability
app.get("/reservations/availability", async (req, res, next) => {
  const { date, parkingSiteId, floorId, type } = req.query;

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
      if (type) slotQueryUrl += `&type=${type}`; // 👈 Forward type
      
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
    slotId, // 👈 Now required
    startTimeStamp, startDateLocal, startTimeLocal,
    endTimeStamp, endDateLocal, endTimeLocal,
    timeZoneOffset,
    vehicle_type,
    carId
  } = req.body;

  logger.info(`[API] POST /reservations for user: ${userId} at slot: ${slotId}`);

  if (!userId || !slotId) {
    return next(new AppError("Missing required fields (userId, slotId)", 400));
  }
  if (!startDateLocal || !startTimeLocal || !endDateLocal || !endTimeLocal || !timeZoneOffset) {
      return next(new AppError("Missing required date/time fields", 400));
  }

  // 1. Resolve Vehicle Info
  let vehicleType = vehicle_type || 'car';
  let vehicleTypeCode = 1;
  let finalCarId = carId || null;

  if (finalCarId) {
    // Lookup car
    const { data: carData } = await supabase
        .from('cars')
        .select('vehicle_type, vehicle_type_code')
        .eq('id', finalCarId)
        .single();
    
    if (carData) {
        vehicleTypeCode = carData.vehicle_type_code ?? 1;
        vehicleType = carData.vehicle_type || VEHICLE_TYPE_REVERSE[vehicleTypeCode] || 'car';
    }
  } else {
     // Fallback: Try to parse string
     if (typeof vehicleType === 'string') {
         vehicleTypeCode = VEHICLE_TYPE[vehicleType.toUpperCase()] !== undefined ? VEHICLE_TYPE[vehicleType.toUpperCase()] : 1;
     } else if (typeof vehicleType === 'number') {
         vehicleTypeCode = vehicleType;
         vehicleType = VEHICLE_TYPE_REVERSE[vehicleTypeCode] || 'car';
     }
  } 
  
  // 2. Lookup Slot Details (Parking Site & Floor)
  let parkingSiteId, floorId, slotName;
  try {
      const { data: slotData, error: slotError } = await supabase
          .from('slots')
          .select('parking_site_id, floor_id, name')
          .eq('id', slotId)
          .single();

      if (slotError || !slotData) {
          logger.error(`Slot lookup failed for ${slotId}:`, slotError);
          return next(new AppError(`Slot ${slotId} not found`, 404));
      }
      
      parkingSiteId = slotData.parking_site_id;
      floorId = slotData.floor_id;
      slotName = slotData.name;
      
  } catch (err) {
      return next(new AppError("System cannot retrieve slot details.", 500));
  }

  const startDate = parseCompositeToISO(startDateLocal, startTimeLocal, timeZoneOffset);
  const endDate = parseCompositeToISO(endDateLocal, endTimeLocal, timeZoneOffset);
  
  if (startDate >= endDate) return next(new AppError("End time must be after start time", 400));

  try {
    // 3. Check for overlapping reservations for this specific slot
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    const { data: conflictReservations, error: conflictError } = await supabase
        .from("reservations")
        .select("id")
        .eq("slot_id", slotId) // Check distinct slot
        .in("status", ["pending", "checked_in"])
        .lt("start_time", endISO)
        .gt("end_time", startISO);

    if (conflictError) throw conflictError;

    if (conflictReservations && conflictReservations.length > 0) {
        return next(new AppError("This slot is already booked for the selected time range.", 409));
    }

    // 4. Create Reservation
    const command = new CreateReservationCommand({
      userId, 
      slotId: slotId,
      startTimeStamp, startDateLocal, startTimeLocal,
      endTimeStamp, endDateLocal, endTimeLocal,
      timeZoneOffset,
      parkingSiteId, 
      floorId,
      vehicleType, 
      carId: finalCarId,
      vehicleTypeCode
    });

    const result = await createReservationHandler.handle(command);
    
    res.status(201).json({
        ...result,
        assignedSlotName: slotName
    });

  } catch (error) {
    logger.error(`[Error] POST /reservations:`, error);
    next(error);
  }
});

// POST /cars
app.post("/cars", async (req, res, next) => {
  try {
    const { userId, licensePlate, type, brand, model } = req.body;

    if (!userId || !licensePlate) {
      return next(new AppError("Missing required fields (userId, licensePlate)", 400));
    }

    // 1. Convert Input to Code
    let typeCode = VEHICLE_TYPE.CAR; // Default = 1
    if (typeof type === 'string') {
      typeCode = VEHICLE_TYPE[type.toUpperCase()] !== undefined ? VEHICLE_TYPE[type.toUpperCase()] : VEHICLE_TYPE.CAR;
    } else if (typeof type === 'number') {
      typeCode = type;
    }

    // 2. Insert DB
    const { data, error } = await supabase
      .from('cars')
      .insert({
        user_id: userId,
        license_plate: licensePlate,
        vehicle_type_code: typeCode,
        vehicle_type: VEHICLE_TYPE_REVERSE[typeCode] || 'car',
        brand,
        model
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
        return next(new AppError("License plate already exists.", 409));
    }
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